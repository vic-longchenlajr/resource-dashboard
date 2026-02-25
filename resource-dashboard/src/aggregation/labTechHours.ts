import { db } from '../db/database';
import { PersonRole, ActivityType } from '../types';
import type { LabTechHoursSummary } from '../types';
import { getProjectParent } from './projectUtils';
import type { MonthFilter } from '../utils/monthRange';
import { resolveMonths, toDbMonths, fromDbMonth } from '../utils/monthRange';

/**
 * Compute how many hours each engineer spent on "Lab - Testing" activity.
 * This shows engineering time consumed by lab work vs pure engineering.
 *
 * @param monthFilter - Optional: limit to specific month(s) (YYYY-MM or array)
 * @param projectFilter - Optional: limit to a specific project (parent R# code).
 */
export async function computeLabTechHours(
  monthFilter?: MonthFilter,
  projectFilter?: string,
  engineerFilter?: string
): Promise<LabTechHoursSummary[]> {
  const teamMembers = await db.teamMembers.toArray();

  const engineers = new Set(
    teamMembers
      .filter(m => m.role === PersonRole.Engineer)
      .map(m => m.full_name)
  );

  // Apply month filter if provided (supports single or multi-month)
  const csvMonths = monthFilter ? toDbMonths(resolveMonths(monthFilter)) : null;

  const timesheets = csvMonths
    ? await db.timesheets.where('month').anyOf(csvMonths).toArray()
    : await db.timesheets.toArray();

  // Filter to engineers doing lab testing, optionally by project
  const labEntries = timesheets.filter(
    t => engineers.has(t.full_name) &&
      t.activity === ActivityType.LabTesting &&
      (!projectFilter || getProjectParent(t.r_number) === projectFilter || t.r_number === projectFilter) &&
      (!engineerFilter || t.full_name === engineerFilter)
  );

  // Group by (month, engineer)
  const groups = new Map<string, LabTechHoursSummary>();

  for (const entry of labEntries) {
    const month = fromDbMonth(entry.month);
    const key = `${month}|${entry.full_name}`;

    if (!groups.has(key)) {
      groups.set(key, {
        month,
        engineer: entry.full_name,
        lab_tech_hours: 0,
      });
    }
    groups.get(key)!.lab_tech_hours += entry.hours;
  }

  // Ensure all engineers have an entry (even if 0 hours) — only when no filters
  if (!monthFilter && !projectFilter) {
    const months = new Set(timesheets.map(t => fromDbMonth(t.month)));

    for (const engineer of engineers) {
      for (const month of months) {
        const key = `${month}|${engineer}`;
        if (!groups.has(key)) {
          groups.set(key, {
            month,
            engineer,
            lab_tech_hours: 0,
          });
        }
      }
    }
  }

  return [...groups.values()];
}
