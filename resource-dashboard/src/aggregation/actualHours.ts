import { db } from '../db/database';
import { PersonRole, WorkClass, ProjectType } from '../types';
import type { ActualHoursSummary } from '../types';
import { getProjectParent } from './projectUtils';
import type { MonthFilter } from '../utils/monthRange';
import { resolveMonths, toDbMonths, fromDbMonth } from '../utils/monthRange';

/**
 * Aggregate raw timesheet entries into the Actual_Hours summary.
 *
 * IMPORTANT: This aggregation only includes people classified as Engineers.
 * Lab Technicians are excluded from this view (they have their own aggregation).
 *
 * The work_class and project_type come from the Projects config table,
 * NOT from the raw CSV data. This means if the director reclassifies a project
 * (e.g., changes S0001 from Unplanned to Planned), the aggregation reflects
 * the updated classification immediately.
 *
 * @param monthFilter - Optional: limit to specific month(s) (YYYY-MM or array)
 * @param projectFilter - Optional: limit to a specific project (parent R# code).
 *   When set, includes sub-projects (e.g. "R1337" matches R1337, R1337.1, R1337.1A).
 */
export async function computeActualHours(
  monthFilter?: MonthFilter,
  projectFilter?: string,
  engineerFilter?: string
): Promise<ActualHoursSummary[]> {
  const teamMembers = await db.teamMembers.toArray();
  const projects = await db.projects.toArray();

  const engineers = new Set(
    teamMembers
      .filter(m => m.role === PersonRole.Engineer)
      .map(m => m.full_name)
  );

  const projectMap = new Map(projects.map(p => [p.project_id, p]));

  // Apply month filter if provided (supports single or multi-month)
  const csvMonths = monthFilter ? toDbMonths(resolveMonths(monthFilter)) : null;

  const timesheets = csvMonths
    ? await db.timesheets.where('month').anyOf(csvMonths).toArray()
    : await db.timesheets.toArray();

  // Filter to engineers only, and optionally by project (including sub-projects)
  const engineerEntries = timesheets.filter(t =>
    engineers.has(t.full_name) &&
    (!projectFilter || getProjectParent(t.r_number) === projectFilter || t.r_number === projectFilter) &&
    (!engineerFilter || t.full_name === engineerFilter)
  );

  // Group by (month, project_id/r_number, engineer)
  const groups = new Map<string, ActualHoursSummary>();

  for (const entry of engineerEntries) {
    const month = fromDbMonth(entry.month);
    const project = projectMap.get(entry.r_number);
    const key = `${month}|${entry.r_number}|${entry.full_name}`;

    if (!groups.has(key)) {
      groups.set(key, {
        month,
        project_id: entry.r_number,
        engineer: entry.full_name,
        work_class: project?.work_class ?? WorkClass.Planned,
        project_type: project?.type ?? ProjectType.Sustaining,
        actual_hours: 0,
      });
    }
    groups.get(key)!.actual_hours += entry.hours;
  }

  return [...groups.values()];
}
