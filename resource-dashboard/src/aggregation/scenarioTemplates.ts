import { db } from '../db/database';
import { computeActualHours } from './actualHours';
import type { ScenarioAllocation } from '../types';

/**
 * Month-by-month and engineer-by-engineer shape of a historical project.
 * Used as a template for scenario planning: apply to a new time window and
 * scale to a target total, then overlay on the capacity forecast.
 */
export interface ProjectTemplate {
  source_project_id: string;
  total_actual_hours: number;
  duration_months: number;
  /** Ordered 0-based index → fraction of total hours that fell in that month */
  monthly_distribution: Array<{ relative_month: number; fraction: number }>;
  /** Sorted descending by hours — engineer → fraction of total hours */
  engineer_distribution: Array<{ engineer: string; fraction: number }>;
}

/** Minimal month arithmetic without importing the UI picker. */
function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Build a ProjectTemplate from a project's historical actuals.
 * Returns null if the project has no recorded hours.
 */
export async function extractProjectTemplate(projectId: string): Promise<ProjectTemplate | null> {
  const actuals = await computeActualHours(undefined, projectId);
  if (actuals.length === 0) return null;

  const totalActualHours = actuals.reduce((sum, a) => sum + a.actual_hours, 0);
  if (totalActualHours === 0) return null;

  const monthTotals = new Map<string, number>();
  const engineerTotals = new Map<string, number>();

  for (const a of actuals) {
    monthTotals.set(a.month, (monthTotals.get(a.month) ?? 0) + a.actual_hours);
    engineerTotals.set(a.engineer, (engineerTotals.get(a.engineer) ?? 0) + a.actual_hours);
  }

  const sortedMonths = [...monthTotals.keys()].sort();
  const monthly_distribution = sortedMonths.map((month, i) => ({
    relative_month: i,
    fraction: monthTotals.get(month)! / totalActualHours,
  }));

  const engineer_distribution = [...engineerTotals.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([engineer, hours]) => ({
      engineer,
      fraction: hours / totalActualHours,
    }));

  return {
    source_project_id: projectId,
    total_actual_hours: totalActualHours,
    duration_months: sortedMonths.length,
    monthly_distribution,
    engineer_distribution,
  };
}

/**
 * Generate ScenarioAllocation rows from a template and write them to Dexie.
 *
 * Clears all existing allocations for the scenario first, then writes fresh rows.
 *
 * @param scenarioId - Target scenario
 * @param template   - Distribution shape from extractProjectTemplate
 * @param startMonth - YYYY-MM for relative_month=0
 * @param targetHours - Desired total hours; if omitted uses template total
 */
export async function applyTemplateToScenario(
  scenarioId: number,
  template: ProjectTemplate,
  startMonth: string,
  targetHours?: number,
): Promise<void> {
  const totalHours = targetHours ?? template.total_actual_hours;
  const projectId = `SCENARIO-${scenarioId}`;

  await db.scenarioAllocations.where('scenario_id').equals(scenarioId).delete();

  const rows: Omit<ScenarioAllocation, 'id'>[] = [];

  for (const { relative_month, fraction } of template.monthly_distribution) {
    const month = addMonths(startMonth, relative_month);
    const monthHours = totalHours * fraction;

    for (const { engineer, fraction: engFraction } of template.engineer_distribution) {
      const hours = monthHours * engFraction;
      if (hours < 0.5) continue; // skip negligible allocations

      rows.push({
        scenario_id: scenarioId,
        month,
        project_id: projectId,
        engineer,
        allocation_pct: Math.min(hours / 140, 1),
        planned_hours: Math.round(hours * 10) / 10,
      });
    }
  }

  await db.scenarioAllocations.bulkAdd(rows as ScenarioAllocation[]);
}

/**
 * Convert ScenarioAllocations to the PlannedAllocation shape expected by
 * computeCapacityForecast's overlayAllocations parameter.
 */
export function scenarioAllocationsToOverlay(
  allocations: ScenarioAllocation[],
): import('../types').PlannedAllocation[] {
  // Keep allocation_pct — it's required by PlannedAllocation. Drop only scenario_id.
  return allocations.map(({ scenario_id: _s, ...rest }) => rest);
}
