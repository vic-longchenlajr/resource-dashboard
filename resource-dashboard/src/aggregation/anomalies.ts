import { db } from '../db/database';
import { ProjectType } from '../types';
import type { AnomalyThreshold } from '../types';
import {
  isRuleEnabled,
  getThreshold,
  getRuleSeverity,
  isCustomValue,
} from './anomalyRules';
import { getProjectParent } from './projectUtils';
import type { MonthFilter } from '../utils/monthRange';
import { resolveMonths, toDbMonths } from '../utils/monthRange';

export type AnomalySeverity = 'alert' | 'warning' | 'info';
export type AnomalyType =
  | 'overtime'
  | 'context-switching'
  | 'single-point-of-failure'
  | 'meeting-heavy'
  | 'project-over-burn'
  | 'project-under-burn'
  | 'firefighting-spike'
  | 'new-person';

export interface Anomaly {
  type: AnomalyType;
  severity: AnomalySeverity;
  title: string;
  detail: string;
  person?: string;
  projectId?: string;
  ruleId: string;
  thresholdComparison?: string;
  isCustomThreshold?: boolean;
  customThresholdLabel?: string;
}

/**
 * Generate a stable composite ID for an anomaly.
 * Format: "ruleId::subject" where subject is person or projectId.
 */
export function generateAnomalyId(anomaly: Anomaly): string {
  const subject = anomaly.person || anomaly.projectId || 'global';
  return `${anomaly.ruleId}::${subject}`;
}

/**
 * Detects anomalies across timesheet data for a given month.
 * Reads user-configured thresholds from Dexie; falls back to ANOMALY_RULES defaults.
 * Returns a severity-sorted list of alerts.
 */
export async function computeAnomalies(month?: MonthFilter, projectFilter?: string, engineerFilter?: string): Promise<Anomaly[]> {
  // Load configurable thresholds
  const storedThresholds = await db.anomalyThresholds.toArray();
  const thresholdMap: Map<string, AnomalyThreshold> = new Map(
    storedThresholds.map(t => [t.ruleId, t])
  );

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

  const teamMembers = await db.teamMembers.toArray();
  const memberSet = new Set(teamMembers.map(m => m.full_name));
  const projects = await db.projects.toArray();
  const projectMap = new Map(projects.map(p => [p.project_id, p]));

  const anomalies: Anomaly[] = [];

  // ── Group by person ──
  const byPerson = new Map<string, typeof timesheets>();
  for (const t of timesheets) {
    const list = byPerson.get(t.full_name) ?? [];
    list.push(t);
    byPerson.set(t.full_name, list);
  }

  for (const [person, entries] of byPerson) {
    if (!memberSet.has(person)) continue;

    // Compute per-day hours and project sets
    const dailyHours = new Map<string, number>();
    const byDate = new Map<string, Set<string>>();
    let meetingHours = 0;
    let firefightingHours = 0;
    let totalHours = 0;

    for (const e of entries) {
      totalHours += e.hours;
      dailyHours.set(e.date, (dailyHours.get(e.date) ?? 0) + e.hours);

      const dateProjects = byDate.get(e.date) ?? new Set();
      if (e.r_number) dateProjects.add(e.r_number);
      byDate.set(e.date, dateProjects);

      if (e.task?.toLowerCase().includes('meeting')) {
        meetingHours += e.hours;
      }

      const proj = projectMap.get(e.r_number);
      if (proj?.work_class === 'Unplanned/Firefighting') {
        firefightingHours += e.hours;
      }
    }

    // ── Rule: overtime ──
    if (isRuleEnabled(thresholdMap, 'overtime')) {
      const minDays = getThreshold(thresholdMap, 'overtime', 'minDaysOver8');
      const dailyThreshold = getThreshold(thresholdMap, 'overtime', 'dailyHoursThreshold');
      const overtimeDays = [...dailyHours.values()].filter(h => h > dailyThreshold).length;

      if (overtimeDays >= minDays) {
        const avgDaily = dailyHours.size > 0 ? totalHours / dailyHours.size : 0;
        const hasCustom = isCustomValue(thresholdMap, 'overtime', 'minDaysOver8')
          || isCustomValue(thresholdMap, 'overtime', 'dailyHoursThreshold');

        anomalies.push({
          type: 'overtime',
          severity: getRuleSeverity(thresholdMap, 'overtime'),
          title: `${person} logged overtime on ${overtimeDays} days`,
          detail: `Averaged ${avgDaily.toFixed(1)} hrs/day across ${dailyHours.size} work days.`,
          person,
          ruleId: 'overtime',
          thresholdComparison: `overtime days (${overtimeDays}) >= threshold (${minDays}) with >${dailyThreshold}h/day`,
          isCustomThreshold: hasCustom,
          customThresholdLabel: hasCustom ? `>${minDays} days over ${dailyThreshold}h` : undefined,
        });
      }
    }

    // ── Rule: context-switching ──
    if (isRuleEnabled(thresholdMap, 'context-switching')) {
      const focusScoreThreshold = getThreshold(thresholdMap, 'context-switching', 'focusScoreThreshold');
      const workDays = byDate.size;

      if (workDays > 0) {
        const dailyCounts = [...byDate.values()].map(s => s.size);
        const avgPerDay = dailyCounts.reduce((a, b) => a + b, 0) / workDays;
        const focusScore = Math.min(100, Math.round(100 / avgPerDay));
        const highFragDays = dailyCounts.filter(c => c > 3).length;

        if (focusScore < focusScoreThreshold) {
          const hasCustom = isCustomValue(thresholdMap, 'context-switching', 'focusScoreThreshold');
          const monthlyProjectCount = new Set(entries.map(e => e.r_number).filter(Boolean)).size;

          anomalies.push({
            type: 'context-switching',
            severity: getRuleSeverity(thresholdMap, 'context-switching'),
            title: `${person} is highly fragmented across ${monthlyProjectCount} projects`,
            detail: `Averaged ${avgPerDay.toFixed(1)} projects/day with ${highFragDays} high-fragmentation days.`,
            person,
            ruleId: 'context-switching',
            thresholdComparison: `focus score (${focusScore}) < threshold (${focusScoreThreshold})`,
            isCustomThreshold: hasCustom,
            customThresholdLabel: hasCustom ? `score < ${focusScoreThreshold}` : undefined,
          });
        }
      }
    }

    // ── Rule: meeting-heavy ──
    if (isRuleEnabled(thresholdMap, 'meeting-heavy') && totalHours > 0) {
      const meetingPctThreshold = getThreshold(thresholdMap, 'meeting-heavy', 'meetingPctThreshold') / 100;
      const meetingPct = meetingHours / totalHours;

      if (meetingPct > meetingPctThreshold) {
        const hasCustom = isCustomValue(thresholdMap, 'meeting-heavy', 'meetingPctThreshold');

        anomalies.push({
          type: 'meeting-heavy',
          severity: getRuleSeverity(thresholdMap, 'meeting-heavy'),
          title: `${person} spent ${Math.round(meetingPct * 100)}% in meetings`,
          detail: `${Math.round(meetingHours)}h of ${Math.round(totalHours)}h total.`,
          person,
          ruleId: 'meeting-heavy',
          thresholdComparison: `meeting time (${Math.round(meetingPct * 100)}%) > threshold (${Math.round(meetingPctThreshold * 100)}%)`,
          isCustomThreshold: hasCustom,
          customThresholdLabel: hasCustom ? `>${Math.round(meetingPctThreshold * 100)}%` : undefined,
        });
      }
    }

    // ── Rule: firefighting-spike ──
    if (isRuleEnabled(thresholdMap, 'firefighting-spike') && totalHours > 0) {
      const ffPctThreshold = getThreshold(thresholdMap, 'firefighting-spike', 'firefightingPctThreshold') / 100;
      const ffPct = firefightingHours / totalHours;

      if (ffPct > ffPctThreshold) {
        const hasCustom = isCustomValue(thresholdMap, 'firefighting-spike', 'firefightingPctThreshold');

        anomalies.push({
          type: 'firefighting-spike',
          severity: getRuleSeverity(thresholdMap, 'firefighting-spike'),
          title: `${person} has ${Math.round(ffPct * 100)}% firefighting`,
          detail: `${Math.round(firefightingHours)}h unplanned/firefighting out of ${Math.round(totalHours)}h.`,
          person,
          ruleId: 'firefighting-spike',
          thresholdComparison: `firefighting (${Math.round(ffPct * 100)}%) > threshold (${Math.round(ffPctThreshold * 100)}%)`,
          isCustomThreshold: hasCustom,
          customThresholdLabel: hasCustom ? `>${Math.round(ffPctThreshold * 100)}%` : undefined,
        });
      }
    }
  }

  // ── Group by project for bus factor & burn rate ──
  const byProject = new Map<string, Map<string, number>>();
  for (const t of timesheets) {
    if (!t.r_number) continue;
    const personMap = byProject.get(t.r_number) ?? new Map();
    personMap.set(t.full_name, (personMap.get(t.full_name) ?? 0) + t.hours);
    byProject.set(t.r_number, personMap);
  }

  // ── Rule: bus-factor (single point of failure) ──
  if (isRuleEnabled(thresholdMap, 'bus-factor')) {
    const maxBusFactor = getThreshold(thresholdMap, 'bus-factor', 'maxBusFactor');
    const minProjectHours = getThreshold(thresholdMap, 'bus-factor', 'minProjectHours');
    const npdOnly = getThreshold(thresholdMap, 'bus-factor', 'projectTypesFilter') === 1;

    for (const [projectId, personMap] of byProject) {
      const project = projectMap.get(projectId);
      if (!project) continue;

      if (npdOnly && project.type !== ProjectType.NPD) continue;

      const totalHours = [...personMap.values()].reduce((a, b) => a + b, 0);
      if (totalHours < minProjectHours) continue;

      // Compute bus factor: min people to cover >50%
      const contributors = [...personMap.entries()]
        .map(([p, h]) => ({ person: p, hours: h, pct: h / totalHours }))
        .sort((a, b) => b.hours - a.hours);

      let cumulative = 0;
      let busFactor = 0;
      for (const c of contributors) {
        cumulative += c.pct;
        busFactor++;
        if (cumulative > 0.5) break;
      }

      if (busFactor <= maxBusFactor) {
        const topContributor = contributors[0];
        const hasCustom = isCustomValue(thresholdMap, 'bus-factor', 'maxBusFactor')
          || isCustomValue(thresholdMap, 'bus-factor', 'minProjectHours');

        anomalies.push({
          type: 'single-point-of-failure',
          severity: getRuleSeverity(thresholdMap, 'bus-factor'),
          title: `${project.project_name || projectId} depends solely on ${topContributor.person}`,
          detail: `${Math.round(totalHours)}h logged by ${contributors.length} contributor${contributors.length > 1 ? 's' : ''} (top: ${Math.round(topContributor.pct * 100)}%).`,
          person: topContributor.person,
          projectId,
          ruleId: 'bus-factor',
          thresholdComparison: `bus factor (${busFactor}) <= threshold (${maxBusFactor}) with ${Math.round(totalHours)}h > ${minProjectHours}h min`,
          isCustomThreshold: hasCustom,
          customThresholdLabel: hasCustom ? `bus factor <= ${maxBusFactor}, min ${minProjectHours}h` : undefined,
        });
      }
    }
  }

  // ── Rules: project over/under burn ──
  if (month) {
    const plannedFilterMonths = resolveMonths(month);
    let plannedMonths = await db.plannedProjectMonths
      .where('month')
      .anyOf(plannedFilterMonths)
      .toArray();

    if (projectFilter) {
      plannedMonths = plannedMonths.filter(pm =>
        pm.project_id === projectFilter || getProjectParent(pm.project_id) === projectFilter
      );
    }

    for (const pm of plannedMonths) {
      if (pm.total_planned_hours <= 0) continue;
      const projectPersonMap = byProject.get(pm.project_id);
      const actualHours = projectPersonMap
        ? [...projectPersonMap.values()].reduce((a, b) => a + b, 0)
        : 0;
      const ratio = actualHours / pm.total_planned_hours;
      const project = projectMap.get(pm.project_id);

      // Over-burn
      if (isRuleEnabled(thresholdMap, 'project-over-burn')) {
        const overBurnPct = getThreshold(thresholdMap, 'project-over-burn', 'overBurnPct') / 100;
        if (ratio > 1 + overBurnPct) {
          const hasCustom = isCustomValue(thresholdMap, 'project-over-burn', 'overBurnPct');
          anomalies.push({
            type: 'project-over-burn',
            severity: getRuleSeverity(thresholdMap, 'project-over-burn'),
            title: `${project?.project_name || pm.project_id} over-burning at ${Math.round(ratio * 100)}%`,
            detail: `${Math.round(actualHours)}h actual vs ${Math.round(pm.total_planned_hours)}h planned.`,
            projectId: pm.project_id,
            ruleId: 'project-over-burn',
            thresholdComparison: `actual/planned ratio (${Math.round(ratio * 100)}%) > threshold (${Math.round((1 + overBurnPct) * 100)}%)`,
            isCustomThreshold: hasCustom,
            customThresholdLabel: hasCustom ? `>${Math.round(overBurnPct * 100)}% over plan` : undefined,
          });
        }
      }

      // Under-burn
      if (isRuleEnabled(thresholdMap, 'project-under-burn') && actualHours > 0) {
        const underBurnPct = getThreshold(thresholdMap, 'project-under-burn', 'underBurnPct') / 100;
        if (ratio < underBurnPct) {
          const hasCustom = isCustomValue(thresholdMap, 'project-under-burn', 'underBurnPct');
          anomalies.push({
            type: 'project-under-burn',
            severity: getRuleSeverity(thresholdMap, 'project-under-burn'),
            title: `${project?.project_name || pm.project_id} under-burning at ${Math.round(ratio * 100)}%`,
            detail: `${Math.round(actualHours)}h actual vs ${Math.round(pm.total_planned_hours)}h planned.`,
            projectId: pm.project_id,
            ruleId: 'project-under-burn',
            thresholdComparison: `actual/planned ratio (${Math.round(ratio * 100)}%) < threshold (${Math.round(underBurnPct * 100)}%)`,
            isCustomThreshold: hasCustom,
            customThresholdLabel: hasCustom ? `<${Math.round(underBurnPct * 100)}% of plan` : undefined,
          });
        }
      }
    }
  }

  // ── Rule: new-person ──
  if (isRuleEnabled(thresholdMap, 'new-person') && csvMonths) {
    const csvMonthSet = new Set(csvMonths);
    const allTimesheets = await db.timesheets.toArray();
    const priorPeople = new Set<string>();
    for (const t of allTimesheets) {
      if (!csvMonthSet.has(t.month)) {
        priorPeople.add(t.full_name);
      }
    }
    for (const person of byPerson.keys()) {
      if (!priorPeople.has(person) && memberSet.has(person)) {
        anomalies.push({
          type: 'new-person',
          severity: getRuleSeverity(thresholdMap, 'new-person'),
          title: `${person} is new this month`,
          detail: 'First time appearing in timesheet data.',
          person,
          ruleId: 'new-person',
        });
      }
    }
  }

  // Sort: alert → warning → info
  const severityOrder: Record<string, number> = { alert: 0, warning: 1, info: 2 };
  anomalies.sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2));

  return anomalies;
}
