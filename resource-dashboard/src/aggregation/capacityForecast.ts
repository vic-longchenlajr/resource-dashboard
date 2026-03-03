import { db } from '../db/database';
import { PersonRole } from '../types';
import type { CapacityForecastEntry, CapacityForecastSummary, PlannedAllocation } from '../types';
import { getEngineerCapacity } from '../utils/capacity';

/**
 * Compute forward-looking capacity forecast from planned allocations.
 * Returns per-engineer/per-month entries and monthly summaries.
 *
 * @param overlayAllocations - Optional hypothetical allocations to merge in
 *   (scenario planning). These are additive — they do not replace stored data.
 */
export async function computeCapacityForecast(
  months: string[],
  projectFilter?: string,
  overlayAllocations?: PlannedAllocation[]
): Promise<{ entries: CapacityForecastEntry[]; summaries: CapacityForecastSummary[] }> {
  if (months.length === 0) return { entries: [], summaries: [] };

  const [stored, teamMembers, config] = await Promise.all([
    db.plannedAllocations.toArray(),
    db.teamMembers.toArray(),
    db.config.get(1),
  ]);

  const allocations = overlayAllocations
    ? [...stored, ...overlayAllocations]
    : stored;

  const stdCapacity = config?.std_monthly_capacity_hours ?? 140;
  const monthSet = new Set(months);

  // Build capacity lookup per engineer
  const capacityMap = new Map<string, number>();
  const engineerSet = new Set<string>();
  for (const m of teamMembers) {
    if (m.role === PersonRole.Engineer) {
      capacityMap.set(m.full_name, getEngineerCapacity(m, stdCapacity));
      engineerSet.add(m.full_name);
    }
  }

  // Filter allocations to requested months (and optional project filter)
  let filtered = allocations.filter(a => monthSet.has(a.month));
  if (projectFilter) {
    filtered = filtered.filter(a => a.project_id === projectFilter || a.project_id.startsWith(projectFilter + '.'));
  }

  // Aggregate allocated hours per engineer per month
  const allocMap = new Map<string, number>(); // "engineer|month" -> hours
  for (const a of filtered) {
    const key = `${a.engineer}|${a.month}`;
    allocMap.set(key, (allocMap.get(key) ?? 0) + a.planned_hours);
  }

  // Also collect engineers who appear in allocations but aren't in teamMembers
  for (const a of filtered) {
    if (!engineerSet.has(a.engineer)) {
      engineerSet.add(a.engineer);
      capacityMap.set(a.engineer, stdCapacity);
    }
  }

  const entries: CapacityForecastEntry[] = [];
  const summaryMap = new Map<string, CapacityForecastSummary>();

  // Initialize summaries
  for (const month of months) {
    summaryMap.set(month, {
      month,
      total_allocated: 0,
      total_capacity: 0,
      headcount: 0,
      avg_utilization: 0,
      over_allocated_count: 0,
      under_allocated_count: 0,
    });
  }

  const engineers = [...engineerSet].sort();

  for (const engineer of engineers) {
    const capacity = capacityMap.get(engineer) ?? stdCapacity;

    for (const month of months) {
      const key = `${engineer}|${month}`;
      const allocated = allocMap.get(key) ?? 0;
      const utilPct = capacity > 0 ? allocated / capacity : 0;

      entries.push({
        engineer,
        month,
        allocated_hours: allocated,
        capacity_hours: capacity,
        utilization_pct: utilPct,
      });

      const summary = summaryMap.get(month)!;
      summary.total_allocated += allocated;
      summary.total_capacity += capacity;
      summary.headcount++;
      if (utilPct > 1.0) summary.over_allocated_count++;
      if (utilPct < 0.5 && allocated > 0) summary.under_allocated_count++;
    }
  }

  // Compute average utilization
  const summaries: CapacityForecastSummary[] = [];
  for (const month of months) {
    const s = summaryMap.get(month)!;
    s.avg_utilization = s.total_capacity > 0 ? s.total_allocated / s.total_capacity : 0;
    summaries.push(s);
  }

  return { entries, summaries };
}
