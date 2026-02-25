import { db } from '../db/database';
import type { PersonRole as PersonRoleType } from '../types';
import { getProjectParent } from './projectUtils';
import type { MonthFilter } from '../utils/monthRange';
import { resolveMonths, toDbMonths } from '../utils/monthRange';

export interface MeetingTaxResult {
  person: string;
  role: PersonRoleType;
  totalHours: number;
  meetingHours: number;
  meetingPct: number;
  adminHours: number;
  oooHours: number;
  productiveHours: number;
}

/**
 * Breaks out meeting hours as a separate category from general admin.
 * Meeting tasks are identified by "meeting" in the task name (case-insensitive).
 */
export async function computeMeetingTax(month?: MonthFilter, projectFilter?: string, engineerFilter?: string): Promise<MeetingTaxResult[]> {
  const teamMembers = await db.teamMembers.toArray();
  const memberMap = new Map(teamMembers.map(m => [m.full_name, m]));

  const csvMonths = month ? toDbMonths(resolveMonths(month)) : null;
  let timesheets = csvMonths
    ? await db.timesheets.where('month').anyOf(csvMonths).toArray()
    : await db.timesheets.toArray();

  if (projectFilter) {
    const projectPeople = new Set(
      timesheets
        .filter(t => getProjectParent(t.r_number) === projectFilter || t.r_number === projectFilter)
        .map(t => t.full_name)
    );
    timesheets = timesheets.filter(t => projectPeople.has(t.full_name));
  }

  if (engineerFilter) {
    timesheets = timesheets.filter(t => t.full_name === engineerFilter);
  }

  if (timesheets.length === 0) return [];

  // Group by person
  const byPerson = new Map<string, typeof timesheets>();
  for (const t of timesheets) {
    const list = byPerson.get(t.full_name) ?? [];
    list.push(t);
    byPerson.set(t.full_name, list);
  }

  const results: MeetingTaxResult[] = [];

  for (const [person, entries] of byPerson) {
    const member = memberMap.get(person);
    if (!member) continue;

    let totalHours = 0;
    let meetingHours = 0;
    let adminHours = 0;
    let oooHours = 0;

    for (const e of entries) {
      totalHours += e.hours;
      const isMeeting = e.task?.toLowerCase().includes('meeting') ?? false;

      if (isMeeting) {
        meetingHours += e.hours;
      } else if (e.r_number === 'R0999') {
        oooHours += e.hours;
      } else if (e.r_number === 'R0996') {
        adminHours += e.hours;
      }
    }

    const productiveHours = totalHours - meetingHours - adminHours - oooHours;

    results.push({
      person,
      role: member.role,
      totalHours: Math.round(totalHours * 10) / 10,
      meetingHours: Math.round(meetingHours * 10) / 10,
      meetingPct: totalHours > 0 ? meetingHours / totalHours : 0,
      adminHours: Math.round(adminHours * 10) / 10,
      oooHours: Math.round(oooHours * 10) / 10,
      productiveHours: Math.round(productiveHours * 10) / 10,
    });
  }

  // Sort by meeting percentage descending
  results.sort((a, b) => b.meetingPct - a.meetingPct);
  return results;
}
