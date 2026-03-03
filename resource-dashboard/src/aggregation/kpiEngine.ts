import { db } from '../db/database';
import { ProjectType, PersonRole, ActivityType } from '../types';
import type { KPIResults, ActualHoursSummary, MonthlyCategoryTotals, TeamMember } from '../types';
import { computeActualHours } from './actualHours';
import { computeMonthlyCategoryTotals } from './plannedVsActual';
import { getProjectParent } from './projectUtils';
import type { MonthFilter } from '../utils/monthRange';
import { resolveMonths, toDbMonths, fromDbMonth } from '../utils/monthRange';
import { getEngineerCapacity } from '../utils/capacity';

/**
 * Single source of truth for all KPI values.
 * Both KPISummaryPanel and narrative.ts consume from this.
 */
export async function computeAllKPIs(
  month: MonthFilter,
  projectFilter?: string,
  engineerFilter?: string
): Promise<KPIResults> {
  const months = resolveMonths(month);

  // ── Core data: one call each ──
  const actualHours = await computeActualHours(month, projectFilter, engineerFilter);
  const allCategoryTotals = await computeMonthlyCategoryTotals(projectFilter);
  // For multi-month, aggregate across all matching months
  const matchingTotals = allCategoryTotals.filter(t => months.includes(t.month));

  const teamMembers = await db.teamMembers.toArray();
  const config = await db.config.get(1);
  const defaultCapacity = config?.std_monthly_capacity_hours ?? 140;

  // ── Current 6 KPIs (matching existing KPISummaryPanel logic) ──
  const npdHours = matchingTotals.reduce((sum, t) => sum + t.actual_npd, 0);
  const sustainingHours = matchingTotals.reduce((sum, t) => sum + t.actual_sustaining, 0);
  const sprintHours = matchingTotals.reduce((sum, t) => sum + t.actual_sprint, 0);
  const firefightingHours = matchingTotals.reduce((sum, t) => sum + t.actual_firefighting, 0);
  const totalHoursLogged = npdHours + sustainingHours + sprintHours;

  const activeEngineerNames = new Set(actualHours.map(a => a.engineer));
  const activeEngineers = activeEngineerNames.size;

  const projectsTouched = new Set(
    actualHours
      .filter(a => a.project_type !== ProjectType.Admin && a.project_type !== ProjectType.OutOfOffice)
      .map(a => a.project_id)
  ).size;

  // Per-engineer capacity (respects overrides), scaled by month count
  const monthCount = months.length;
  const totalCapacity = teamMembers
    .filter(m => m.role === PersonRole.Engineer && activeEngineerNames.has(m.full_name))
    .reduce((sum, m) => sum + getEngineerCapacity(m, defaultCapacity), 0)
    * monthCount;

  const teamUtilization = totalCapacity > 0 ? totalHoursLogged / totalCapacity : 0;
  const npdFocus = totalHoursLogged > 0 ? npdHours / totalHoursLogged : 0;
  const firefightingLoad = totalHoursLogged > 0 ? firefightingHours / totalHoursLogged : 0;

  // ── Extended KPIs ──

  // Bus Factor Risk: % of significant projects (>10h) with only 1 contributor
  const projectGroups = new Map<string, Set<string>>();
  const projectHourTotals = new Map<string, number>();
  for (const a of actualHours) {
    if (a.project_type === ProjectType.Admin || a.project_type === ProjectType.OutOfOffice) continue;
    const contributors = projectGroups.get(a.project_id) ?? new Set();
    contributors.add(a.engineer);
    projectGroups.set(a.project_id, contributors);
    projectHourTotals.set(a.project_id, (projectHourTotals.get(a.project_id) ?? 0) + a.actual_hours);
  }
  let significantProjects = 0;
  let singleContributorProjects = 0;
  for (const [projId, contributors] of projectGroups) {
    const hours = projectHourTotals.get(projId) ?? 0;
    if (hours > 10) {
      significantProjects++;
      if (contributors.size === 1) singleContributorProjects++;
    }
  }
  const busFactorRisk = significantProjects > 0 ? singleContributorProjects / significantProjects : 0;

  // Focus Score: avg distinct project count per engineer
  const engineerProjectCounts = new Map<string, Set<string>>();
  for (const a of actualHours) {
    if (a.project_type === ProjectType.Admin || a.project_type === ProjectType.OutOfOffice) continue;
    const projects = engineerProjectCounts.get(a.engineer) ?? new Set();
    projects.add(a.project_id);
    engineerProjectCounts.set(a.engineer, projects);
  }
  let totalProjectCounts = 0;
  for (const projects of engineerProjectCounts.values()) {
    totalProjectCounts += projects.size;
  }
  const focusScore = engineerProjectCounts.size > 0 ? totalProjectCounts / engineerProjectCounts.size : 0;

  // ── Raw timesheet queries for extended KPIs ──
  const csvMonths = toDbMonths(months);
  let timesheets = await db.timesheets.where('month').anyOf(csvMonths).toArray();
  if (projectFilter) {
    timesheets = timesheets.filter(t =>
      t.r_number === projectFilter || getProjectParent(t.r_number) === projectFilter
    );
  }
  if (engineerFilter) {
    timesheets = timesheets.filter(t => t.full_name === engineerFilter);
  }
  const engineerSet = new Set(
    teamMembers.filter(m => m.role === PersonRole.Engineer).map(m => m.full_name)
  );
  const engineerTimesheets = timesheets.filter(t => engineerSet.has(t.full_name));

  // Meeting Tax Hours: hours where task name contains "meeting"
  let meetingTaxHours = 0;
  for (const t of engineerTimesheets) {
    if (t.task?.toLowerCase().includes('meeting')) {
      meetingTaxHours += t.hours;
    }
  }

  // Lab Utilization: lab testing hours / (engineering + lab testing hours)
  let labHours = 0;
  let engHours = 0;
  for (const t of engineerTimesheets) {
    if (t.activity === ActivityType.LabTesting) labHours += t.hours;
    else if (t.activity === ActivityType.Engineering) engHours += t.hours;
  }
  const labUtilization = (labHours + engHours) > 0 ? labHours / (labHours + engHours) : 0;

  // Task Completion Rate: completed tasks / worked tasks (excluding admin/OOO)
  const workedTasks = new Set<number>();
  const completedTasks = new Set<number>();
  for (const t of engineerTimesheets) {
    if (t.r_number === 'R0996' || t.r_number === 'R0997' || t.r_number === 'R0999') continue;
    if (t.task_id) {
      workedTasks.add(t.task_id);
      if (t.is_done) completedTasks.add(t.task_id);
    }
  }
  const taskCompletionRate = workedTasks.size > 0 ? completedTasks.size / workedTasks.size : 0;

  // Admin Overhead: admin hours / (productive + admin)
  let adminHours = 0;
  for (const t of engineerTimesheets) {
    if (t.r_number === 'R0996' || t.r_number === 'R0997') {
      adminHours += t.hours;
    }
  }
  const adminOverhead = (totalHoursLogged + adminHours) > 0 ? adminHours / (totalHoursLogged + adminHours) : 0;

  // Sustaining Load: sustaining / total productive
  const sustainingLoad = totalHoursLogged > 0 ? sustainingHours / totalHoursLogged : 0;

  // Unplanned Sustaining %: firefighting / sustaining
  const unplannedSustainingPct = sustainingHours > 0 ? firefightingHours / sustainingHours : 0;

  // Avg Hours per Engineer
  const avgHoursPerEngineer = activeEngineers > 0 ? totalHoursLogged / activeEngineers : 0;

  // Load Spread: max engineer hours - min engineer hours
  const engineerHourTotals = new Map<string, number>();
  for (const a of actualHours) {
    if (a.project_type === ProjectType.Admin || a.project_type === ProjectType.OutOfOffice) continue;
    engineerHourTotals.set(a.engineer, (engineerHourTotals.get(a.engineer) ?? 0) + a.actual_hours);
  }
  const hourValues = [...engineerHourTotals.values()];
  const loadSpread = hourValues.length > 1
    ? Math.max(...hourValues) - Math.min(...hourValues)
    : 0;

  // Deep Work Ratio: productive hours / (productive + admin)
  const deepWorkRatio = (totalHoursLogged + adminHours) > 0
    ? totalHoursLogged / (totalHoursLogged + adminHours)
    : 0;

  return {
    teamUtilization,
    npdFocus,
    firefightingLoad,
    activeEngineers,
    totalHoursLogged,
    projectsTouched,
    busFactorRisk,
    focusScore,
    meetingTaxHours,
    labUtilization,
    taskCompletionRate,
    adminOverhead,
    sustainingLoad,
    unplannedSustainingPct,
    avgHoursPerEngineer,
    loadSpread,
    deepWorkRatio,
    npdHours,
    sustainingHours,
    sprintHours,
    firefightingHours,
  };
}

/**
 * Batch-compute KPIs for multiple months in a single pass.
 * Much more efficient than calling computeAllKPIs in a loop:
 * ~6 total Dexie queries regardless of month count.
 */
export async function computeAllKPIsBatch(
  months: string[],
  projectFilter?: string,
  _engineerFilter?: string
): Promise<Map<string, KPIResults>> {
  if (months.length === 0) return new Map();

  // ── Load all shared data once ──
  const allCategoryTotals = await computeMonthlyCategoryTotals(projectFilter);
  const allActualHours = await computeActualHours(undefined, projectFilter);
  const teamMembers = await db.teamMembers.toArray();
  const config = await db.config.get(1);
  const defaultCapacity = config?.std_monthly_capacity_hours ?? 140;

  // Load all timesheets once and partition by month
  let allTimesheets = await db.timesheets.toArray();
  if (projectFilter) {
    allTimesheets = allTimesheets.filter(t =>
      t.r_number === projectFilter || getProjectParent(t.r_number) === projectFilter
    );
  }

  const engineerSet = new Set(
    teamMembers.filter(m => m.role === PersonRole.Engineer).map(m => m.full_name)
  );

  // Pre-partition data by month
  const categoryTotalsByMonth = new Map<string, MonthlyCategoryTotals>();
  for (const ct of allCategoryTotals) {
    categoryTotalsByMonth.set(ct.month, ct);
  }

  const actualHoursByMonth = new Map<string, ActualHoursSummary[]>();
  for (const ah of allActualHours) {
    const arr = actualHoursByMonth.get(ah.month) ?? [];
    arr.push(ah);
    actualHoursByMonth.set(ah.month, arr);
  }

  const timesheetsByMonth = new Map<string, typeof allTimesheets>();
  for (const t of allTimesheets) {
    const month = fromDbMonth(t.month);
    const arr = timesheetsByMonth.get(month) ?? [];
    arr.push(t);
    timesheetsByMonth.set(month, arr);
  }

  // ── Compute KPIs per month ──
  const results = new Map<string, KPIResults>();

  for (const month of months) {
    const categoryTotals = categoryTotalsByMonth.get(month);
    const actualHours = actualHoursByMonth.get(month) ?? [];
    const timesheets = timesheetsByMonth.get(month) ?? [];

    results.set(month, computeKPIsFromData(
      categoryTotals,
      actualHours,
      timesheets,
      teamMembers,
      engineerSet,
      defaultCapacity
    ));
  }

  return results;
}

/**
 * Pure computation: derive all KPIs from pre-loaded data.
 * Shared by both single-month and batch paths.
 */
function computeKPIsFromData(
  categoryTotals: MonthlyCategoryTotals | undefined,
  actualHours: ActualHoursSummary[],
  timesheets: { full_name: string; hours: number; task?: string; activity: string; r_number: string; task_id: number; is_done: boolean }[],
  teamMembers: TeamMember[],
  engineerSet: Set<string>,
  defaultCapacity: number,
): KPIResults {
  // ── Core 6 KPIs ──
  const npdHours = categoryTotals?.actual_npd ?? 0;
  const sustainingHours = categoryTotals?.actual_sustaining ?? 0;
  const sprintHours = categoryTotals?.actual_sprint ?? 0;
  const firefightingHours = categoryTotals?.actual_firefighting ?? 0;
  const totalHoursLogged = npdHours + sustainingHours + sprintHours;

  const activeEngineerNames = new Set(actualHours.map(a => a.engineer));
  const activeEngineers = activeEngineerNames.size;

  const projectsTouched = new Set(
    actualHours
      .filter(a => a.project_type !== ProjectType.Admin && a.project_type !== ProjectType.OutOfOffice)
      .map(a => a.project_id)
  ).size;

  const totalCapacity = teamMembers
    .filter(m => m.role === PersonRole.Engineer && activeEngineerNames.has(m.full_name))
    .reduce((sum, m) => sum + getEngineerCapacity(m, defaultCapacity), 0);

  const teamUtilization = totalCapacity > 0 ? totalHoursLogged / totalCapacity : 0;
  const npdFocus = totalHoursLogged > 0 ? npdHours / totalHoursLogged : 0;
  const firefightingLoad = totalHoursLogged > 0 ? firefightingHours / totalHoursLogged : 0;

  // ── Bus Factor Risk ──
  const projectGroups = new Map<string, Set<string>>();
  const projectHourTotals = new Map<string, number>();
  for (const a of actualHours) {
    if (a.project_type === ProjectType.Admin || a.project_type === ProjectType.OutOfOffice) continue;
    const contributors = projectGroups.get(a.project_id) ?? new Set();
    contributors.add(a.engineer);
    projectGroups.set(a.project_id, contributors);
    projectHourTotals.set(a.project_id, (projectHourTotals.get(a.project_id) ?? 0) + a.actual_hours);
  }
  let significantProjects = 0;
  let singleContributorProjects = 0;
  for (const [projId, contributors] of projectGroups) {
    const hours = projectHourTotals.get(projId) ?? 0;
    if (hours > 10) {
      significantProjects++;
      if (contributors.size === 1) singleContributorProjects++;
    }
  }
  const busFactorRisk = significantProjects > 0 ? singleContributorProjects / significantProjects : 0;

  // ── Focus Score ──
  const engineerProjectCounts = new Map<string, Set<string>>();
  for (const a of actualHours) {
    if (a.project_type === ProjectType.Admin || a.project_type === ProjectType.OutOfOffice) continue;
    const projects = engineerProjectCounts.get(a.engineer) ?? new Set();
    projects.add(a.project_id);
    engineerProjectCounts.set(a.engineer, projects);
  }
  let totalProjectCounts = 0;
  for (const projects of engineerProjectCounts.values()) {
    totalProjectCounts += projects.size;
  }
  const focusScore = engineerProjectCounts.size > 0 ? totalProjectCounts / engineerProjectCounts.size : 0;

  // ── Extended KPIs from raw timesheets ──
  const engineerTimesheets = timesheets.filter(t => engineerSet.has(t.full_name));

  let meetingTaxHours = 0;
  for (const t of engineerTimesheets) {
    if (t.task?.toLowerCase().includes('meeting')) {
      meetingTaxHours += t.hours;
    }
  }

  let labHours = 0;
  let engHours = 0;
  for (const t of engineerTimesheets) {
    if (t.activity === ActivityType.LabTesting) labHours += t.hours;
    else if (t.activity === ActivityType.Engineering) engHours += t.hours;
  }
  const labUtilization = (labHours + engHours) > 0 ? labHours / (labHours + engHours) : 0;

  const workedTasks = new Set<number>();
  const completedTasks = new Set<number>();
  for (const t of engineerTimesheets) {
    if (t.r_number === 'R0996' || t.r_number === 'R0997' || t.r_number === 'R0999') continue;
    if (t.task_id) {
      workedTasks.add(t.task_id);
      if (t.is_done) completedTasks.add(t.task_id);
    }
  }
  const taskCompletionRate = workedTasks.size > 0 ? completedTasks.size / workedTasks.size : 0;

  let adminHours = 0;
  for (const t of engineerTimesheets) {
    if (t.r_number === 'R0996' || t.r_number === 'R0997') {
      adminHours += t.hours;
    }
  }
  const adminOverhead = (totalHoursLogged + adminHours) > 0 ? adminHours / (totalHoursLogged + adminHours) : 0;

  const sustainingLoad = totalHoursLogged > 0 ? sustainingHours / totalHoursLogged : 0;
  const unplannedSustainingPct = sustainingHours > 0 ? firefightingHours / sustainingHours : 0;
  const avgHoursPerEngineer = activeEngineers > 0 ? totalHoursLogged / activeEngineers : 0;

  const engineerHourTotals = new Map<string, number>();
  for (const a of actualHours) {
    if (a.project_type === ProjectType.Admin || a.project_type === ProjectType.OutOfOffice) continue;
    engineerHourTotals.set(a.engineer, (engineerHourTotals.get(a.engineer) ?? 0) + a.actual_hours);
  }
  const hourValues = [...engineerHourTotals.values()];
  const loadSpread = hourValues.length > 1
    ? Math.max(...hourValues) - Math.min(...hourValues)
    : 0;

  const deepWorkRatio = (totalHoursLogged + adminHours) > 0
    ? totalHoursLogged / (totalHoursLogged + adminHours)
    : 0;

  return {
    teamUtilization,
    npdFocus,
    firefightingLoad,
    activeEngineers,
    totalHoursLogged,
    projectsTouched,
    busFactorRisk,
    focusScore,
    meetingTaxHours,
    labUtilization,
    taskCompletionRate,
    adminOverhead,
    sustainingLoad,
    unplannedSustainingPct,
    avgHoursPerEngineer,
    loadSpread,
    deepWorkRatio,
    npdHours,
    sustainingHours,
    sprintHours,
    firefightingHours,
  };
}
