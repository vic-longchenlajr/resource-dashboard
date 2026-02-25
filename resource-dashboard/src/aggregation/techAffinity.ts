import { db } from '../db/database';
import { PersonRole } from '../types';
import type { TechAffinityResult } from '../types';
import { getProjectParent } from './projectUtils';
import type { MonthFilter } from '../utils/monthRange';
import { resolveMonths, toDbMonths, fromDbMonth } from '../utils/monthRange';

/**
 * Compute which lab technicians each engineer most frequently works alongside.
 * Based on co-occurrence on the same R# code in the same month.
 *
 * @param monthFilter - Optional: limit to a specific month (YYYY-MM)
 * @param projectFilter - Optional: limit to a specific project (parent R# code).
 */
export async function computeTechAffinity(
  monthFilter?: MonthFilter,
  projectFilter?: string,
  engineerFilter?: string
): Promise<TechAffinityResult[]> {
  const teamMembers = await db.teamMembers.toArray();

  const engineers = new Set(
    teamMembers
      .filter(m => m.role === PersonRole.Engineer)
      .map(m => m.full_name)
  );

  const techs = new Set(
    teamMembers
      .filter(m => m.role === PersonRole.LabTechnician)
      .map(m => m.full_name)
  );

  // Apply month filter if provided (supports single or multi-month)
  const csvMonths = monthFilter ? toDbMonths(resolveMonths(monthFilter)) : null;

  const timesheets = csvMonths
    ? await db.timesheets.where('month').anyOf(csvMonths).toArray()
    : await db.timesheets.toArray();

  // Optionally filter by project
  const filteredTimesheets = projectFilter
    ? timesheets.filter(t => getProjectParent(t.r_number) === projectFilter || t.r_number === projectFilter)
    : timesheets;

  // Group entries by (month, r_number) to find co-workers
  const projectGroups = new Map<string, Set<string>>();
  const techHoursPerProject = new Map<string, Map<string, number>>();

  for (const entry of filteredTimesheets) {
    const month = fromDbMonth(entry.month);
    const key = `${month}|${entry.r_number}`;

    if (!projectGroups.has(key)) {
      projectGroups.set(key, new Set());
    }
    projectGroups.get(key)!.add(entry.full_name);

    // Track tech hours per project
    if (techs.has(entry.full_name)) {
      if (!techHoursPerProject.has(key)) {
        techHoursPerProject.set(key, new Map());
      }
      const techMap = techHoursPerProject.get(key)!;
      techMap.set(entry.full_name, (techMap.get(entry.full_name) ?? 0) + entry.hours);
    }
  }

  // Find engineer-tech pairings
  const affinities: TechAffinityResult[] = [];

  for (const [key, people] of projectGroups) {
    const [month, project_id] = key.split('|');

    const projectEngineers = [...people].filter(p => engineers.has(p));
    const projectTechs = [...people].filter(p => techs.has(p));

    // For each engineer-tech pair on this project
    for (const engineer of projectEngineers) {
      for (const tech of projectTechs) {
        // Find or create affinity record
        const existingIndex = affinities.findIndex(
          a => a.engineer === engineer && a.tech === tech && a.month === month
        );

        const techHours = techHoursPerProject.get(key)?.get(tech) ?? 0;

        if (existingIndex >= 0) {
          // Add to existing
          affinities[existingIndex].shared_projects.push(project_id);
          affinities[existingIndex].shared_hours += techHours;
        } else {
          // Create new
          affinities.push({
            engineer,
            tech,
            shared_projects: [project_id],
            shared_hours: techHours,
            month,
          });
        }
      }
    }
  }

  // Sort by shared_hours descending
  const sorted = affinities.sort((a, b) => b.shared_hours - a.shared_hours);
  return engineerFilter ? sorted.filter(a => a.engineer === engineerFilter) : sorted;
}
