import { db } from '../db/database';
import type { PersonRole as PersonRoleType } from '../types';
import { getProjectParent } from './projectUtils';
import type { MonthFilter } from '../utils/monthRange';
import { resolveMonths, toDbMonths } from '../utils/monthRange';

export interface FocusScoreResult {
  person: string;
  role: PersonRoleType;
  workDays: number;
  avgProjectsPerDay: number;
  maxProjectsInOneDay: number;
  highFragDays: number;
  focusScore: number;
  monthlyProjectCount: number;
  topProject: string;
  topProjectPct: number;
}

/**
 * Measures how fragmented each person's attention is across projects.
 * Focus Score = 100 / avg projects per day. Higher = more focused.
 */
export async function computeFocusScore(month?: MonthFilter, projectFilter?: string, engineerFilter?: string): Promise<FocusScoreResult[]> {
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

  const results: FocusScoreResult[] = [];

  for (const [person, entries] of byPerson) {
    const member = memberMap.get(person);
    if (!member) continue;

    // Group by date to count distinct projects per day
    const byDate = new Map<string, Set<string>>();
    const projectHours = new Map<string, number>();

    for (const e of entries) {
      // Per-day project sets
      const dateProjects = byDate.get(e.date) ?? new Set();
      if (e.r_number) dateProjects.add(e.r_number);
      byDate.set(e.date, dateProjects);

      // Accumulate project hours
      if (e.r_number) {
        projectHours.set(e.r_number, (projectHours.get(e.r_number) ?? 0) + e.hours);
      }
    }

    const workDays = byDate.size;
    if (workDays === 0) continue;

    const dailyCounts = [...byDate.values()].map(s => s.size);
    const avgProjectsPerDay = dailyCounts.reduce((a, b) => a + b, 0) / workDays;
    const maxProjectsInOneDay = Math.max(...dailyCounts);
    const highFragDays = dailyCounts.filter(c => c > 3).length;
    const focusScore = Math.min(100, Math.round(100 / avgProjectsPerDay));
    const monthlyProjectCount = new Set(entries.map(e => e.r_number).filter(Boolean)).size;

    // Find top project
    let topProject = '';
    let topProjectHours = 0;
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    for (const [proj, hours] of projectHours) {
      if (hours > topProjectHours) {
        topProject = proj;
        topProjectHours = hours;
      }
    }
    const topProjectPct = totalHours > 0 ? topProjectHours / totalHours : 0;

    results.push({
      person,
      role: member.role,
      workDays,
      avgProjectsPerDay: Math.round(avgProjectsPerDay * 10) / 10,
      maxProjectsInOneDay,
      highFragDays,
      focusScore,
      monthlyProjectCount,
      topProject,
      topProjectPct,
    });
  }

  // Sort by focus score ascending (most fragmented first)
  results.sort((a, b) => a.focusScore - b.focusScore);
  return results;
}
