import { db } from '../db/database';
import { ProjectType } from '../types';
import type { ProjectType as ProjectTypeType } from '../types';
import { getProjectParent } from './projectUtils';
import type { MonthFilter } from '../utils/monthRange';
import { resolveMonths, toDbMonths } from '../utils/monthRange';

export interface BusFactorResult {
  projectId: string;
  projectName: string;
  projectType: ProjectTypeType;
  totalHours: number;
  contributorCount: number;
  busFactor: number;
  topContributor: string;
  topContributorPct: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  contributors: { person: string; hours: number; pct: number }[];
}

/**
 * Identifies projects where knowledge is concentrated in too few people.
 * Bus Factor = minimum people needed to cover >50% of hours.
 */
export async function computeBusFactorRisk(month?: MonthFilter, projectFilter?: string, engineerFilter?: string): Promise<BusFactorResult[]> {
  const projects = await db.projects.toArray();
  const projectMap = new Map(projects.map(p => [p.project_id, p]));

  const csvMonths = month ? toDbMonths(resolveMonths(month)) : null;
  let timesheets = csvMonths
    ? await db.timesheets.where('month').anyOf(csvMonths).toArray()
    : await db.timesheets.toArray();

  if (projectFilter) {
    timesheets = timesheets.filter(t =>
      getProjectParent(t.r_number) === projectFilter || t.r_number === projectFilter
    );
  }

  if (engineerFilter) {
    timesheets = timesheets.filter(t => t.full_name === engineerFilter);
  }

  if (timesheets.length === 0) return [];

  // Group by r_number → person → hours
  const byProject = new Map<string, Map<string, number>>();
  for (const t of timesheets) {
    if (!t.r_number) continue;
    const personMap = byProject.get(t.r_number) ?? new Map();
    personMap.set(t.full_name, (personMap.get(t.full_name) ?? 0) + t.hours);
    byProject.set(t.r_number, personMap);
  }

  const results: BusFactorResult[] = [];

  for (const [projectId, personMap] of byProject) {
    const totalHours = [...personMap.values()].reduce((a, b) => a + b, 0);
    if (totalHours <= 5) continue; // Skip trivial entries

    const contributors = [...personMap.entries()]
      .map(([person, hours]) => ({ person, hours, pct: hours / totalHours }))
      .sort((a, b) => b.hours - a.hours);

    // Compute bus factor: min people to cover >50%
    let cumulative = 0;
    let busFactor = 0;
    for (const c of contributors) {
      cumulative += c.pct;
      busFactor++;
      if (cumulative > 0.5) break;
    }

    const project = projectMap.get(projectId);
    const projectType = project?.type ?? ProjectType.Admin;
    const topContributor = contributors[0]?.person ?? '';
    const topContributorPct = contributors[0]?.pct ?? 0;

    // Determine risk level
    let riskLevel: BusFactorResult['riskLevel'] = 'low';
    if (busFactor === 1 && totalHours > 20 && projectType === ProjectType.NPD) {
      riskLevel = 'critical';
    } else if (busFactor === 1 && totalHours > 10) {
      riskLevel = 'high';
    } else if (busFactor <= 2 && topContributorPct > 0.7) {
      riskLevel = 'medium';
    }

    results.push({
      projectId,
      projectName: project?.project_name ?? projectId,
      projectType,
      totalHours: Math.round(totalHours * 10) / 10,
      contributorCount: contributors.length,
      busFactor,
      topContributor,
      topContributorPct,
      riskLevel,
      contributors,
    });
  }

  // Sort: critical first, then high, medium, low; within same level by hours desc
  const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  results.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel] || b.totalHours - a.totalHours);

  return results;
}
