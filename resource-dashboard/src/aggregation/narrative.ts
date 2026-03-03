import { db } from '../db/database';
import { ProjectType, PersonRole } from '../types';
import type {
  NarrativeConfig,
  NarrativeObservationKey,
  KPIResults,
  TimesheetEntry,
  Project,
  TeamMember,
  DashboardConfig,
} from '../types';
import { computeFocusScore } from './focusScore';
import { computeBusFactorRisk } from './busFactor';
import { computeMeetingTax } from './meetingTax';
import { computeNPDProjectComparison } from './plannedVsActual';
import { getEngineerCapacity } from '../utils/capacity';
import { DEFAULT_NARRATIVE_CONFIG, NARRATIVE_OBSERVATIONS } from './narrativeObservations';
import type { NarrativeMode } from './narrativeObservations';
import { getProjectParent } from './projectUtils';
import { computeAllKPIs } from './kpiEngine';
import { toDbMonth } from '../utils/monthRange';

export interface NarrativeSummary {
  paragraph: string;
  highlights: string[];
}

/**
 * An observation that was triggered and is ready for rendering into prose.
 */
interface TriggeredObservation {
  key: NarrativeObservationKey;
  sentence: string;
  highlight: string;
}

// ── Shared data structure ──

interface NarrativeData {
  kpi: KPIResults;
  timesheets: TimesheetEntry[];
  projects: Map<string, Project>;
  teamMembers: TeamMember[];
  engineerSet: Set<string>;
  labTechSet: Set<string>;
  config: DashboardConfig;
  narrativeConfig: NarrativeConfig;
  capacity: number;
}

// ══════════════════════════════════════════════════════════════
// Entry point — decides which builder to call
// ══════════════════════════════════════════════════════════════

/**
 * Generates a configurable narrative summary for a given month.
 * When projectFilter is provided, produces a project-focused narrative.
 * Otherwise, produces a team performance narrative.
 */
export async function generateNarrativeSummary(
  month: string,
  projectFilter?: string,
  engineerFilter?: string
): Promise<NarrativeSummary> {
  if (engineerFilter) {
    return generateEngineerNarrative(month, engineerFilter);
  }
  if (projectFilter) {
    return generateProjectNarrative(month, projectFilter);
  }
  return generateTeamNarrative(month);
}

// ── Shared data loader ──

async function loadNarrativeData(
  month: string,
  projectFilter?: string,
  engineerFilter?: string
): Promise<NarrativeData> {
  const narrativeConfig: NarrativeConfig =
    (await db.narrativeConfig.get(1)) ?? DEFAULT_NARRATIVE_CONFIG;

  const dashConfig = await db.config.get(1);
  const capacity = dashConfig?.std_monthly_capacity_hours ?? 140;

  const csvMonth = toDbMonth(month);
  let timesheets = await db.timesheets.where('month').equals(csvMonth).toArray();

  if (projectFilter) {
    timesheets = timesheets.filter(t =>
      t.r_number === projectFilter || getProjectParent(t.r_number) === projectFilter
    );
  }

  const teamMembers = await db.teamMembers.toArray();
  const engineerSet = new Set(
    teamMembers.filter(m => m.role === PersonRole.Engineer).map(m => m.full_name)
  );
  const labTechSet = new Set(
    teamMembers.filter(m => m.role === PersonRole.LabTechnician).map(m => m.full_name)
  );
  const projects = await db.projects.toArray();
  const projectMap = new Map(projects.map(p => [p.project_id, p]));

  const kpi: KPIResults = await computeAllKPIs(month, projectFilter, engineerFilter);

  return {
    kpi,
    timesheets,
    projects: projectMap,
    teamMembers,
    engineerSet,
    labTechSet,
    config: dashConfig!,
    narrativeConfig,
    capacity,
  };
}

// ══════════════════════════════════════════════════════════════
// Engineer Narrative (Single Engineer mode)
// ══════════════════════════════════════════════════════════════

async function generateEngineerNarrative(
  month: string,
  engineer: string
): Promise<NarrativeSummary> {
  const data = await loadNarrativeData(month, undefined, engineer);

  if (data.timesheets.length === 0) {
    return {
      paragraph: `No timesheet data found for ${engineer} in ${formatMonthLabel(month)}.`,
      highlights: [],
    };
  }

  const totalHours = data.timesheets.reduce((sum, t) => sum + t.hours, 0);
  const projectSet = new Set(data.timesheets.map(t => t.r_number).filter(Boolean));
  const monthLabel = formatMonthLabel(month);

  return {
    paragraph: `In ${monthLabel}, ${engineer} logged ${Math.round(totalHours)} hours across ${projectSet.size} project${projectSet.size !== 1 ? 's' : ''}.`,
    highlights: [
      `${Math.round(totalHours)} hours logged`,
      `${projectSet.size} project${projectSet.size !== 1 ? 's' : ''}`,
    ],
  };
}

// ══════════════════════════════════════════════════════════════
// Team Narrative ("All Projects" mode)
// ══════════════════════════════════════════════════════════════

async function generateTeamNarrative(month: string): Promise<NarrativeSummary> {
  const data = await loadNarrativeData(month);

  if (data.timesheets.length === 0) {
    return { paragraph: 'No timesheet data available for this month.', highlights: [] };
  }

  const { kpi, timesheets, projects: projectMap, narrativeConfig, engineerSet, labTechSet, capacity } = data;
  const { nameIndividuals, includeSpecificNumbers, includeTrendComparisons } = narrativeConfig;
  const monthLabel = formatMonthLabel(month);

  // ── Per-person metrics ──
  const personHours = new Map<string, number>();
  const projectSet = new Set<string>();
  let labTechTotalHours = 0;
  const labTechProjectSet = new Set<string>();

  for (const t of timesheets) {
    if (engineerSet.has(t.full_name)) {
      personHours.set(t.full_name, (personHours.get(t.full_name) ?? 0) + t.hours);
      const project = projectMap.get(t.r_number);
      if (t.r_number && project?.type !== ProjectType.Admin && project?.type !== ProjectType.OutOfOffice) {
        projectSet.add(t.r_number);
      }
    } else if (labTechSet.has(t.full_name)) {
      labTechTotalHours += t.hours;
      if (t.r_number) labTechProjectSet.add(t.r_number);
    }
  }

  // Per-engineer capacity
  const teamMemberMap = new Map(data.teamMembers.map(m => [m.full_name, m]));
  const overloaded: string[] = [];
  const underloaded: string[] = [];
  for (const [person, hours] of personHours) {
    const memberObj = teamMemberMap.get(person);
    const memberCap = memberObj ? getEngineerCapacity(memberObj, capacity) : capacity;
    if (hours > memberCap * 1.15) overloaded.push(person);
    else if (hours < memberCap * 0.6) underloaded.push(person);
  }

  // ── Previous month data for trend comparisons ──
  let prevFirefightingPct: number | null = null;
  let prevMeetingPctAvg: number | null = null;

  if (includeTrendComparisons) {
    const prevMonth = computePreviousMonth(month);
    const prevCsvMonth = toDbMonth(prevMonth);
    const prevTimesheets = await db.timesheets.where('month').equals(prevCsvMonth).toArray();

    if (prevTimesheets.length > 0) {
      let prevTotal = 0;
      let prevFF = 0;
      let prevMeetings = 0;

      for (const t of prevTimesheets) {
        if (!engineerSet.has(t.full_name)) continue;
        const proj = projectMap.get(t.r_number);
        if (proj?.type !== ProjectType.Admin && proj?.type !== ProjectType.OutOfOffice) {
          prevTotal += t.hours;
          if (proj?.work_class === 'Unplanned/Firefighting') prevFF += t.hours;
        }
        if (t.task?.toLowerCase().includes('meeting')) prevMeetings += t.hours;
      }

      if (prevTotal > 0) {
        prevFirefightingPct = prevFF / prevTotal;
        prevMeetingPctAvg = prevMeetings / prevTotal;
      }
    }
  }

  // ── Collect triggered observations (team mode only) ──
  const triggered: TriggeredObservation[] = [];

  // --- firefightingLoad ---
  if (narrativeConfig.observations.firefightingLoad && kpi.firefightingLoad > 0.10) {
    const ffPct = Math.round(kpi.firefightingLoad * 100);
    const trend = addTrendLanguage(
      ffPct,
      prevFirefightingPct !== null ? Math.round(prevFirefightingPct * 100) : null,
      includeTrendComparisons, '%'
    );
    let sentence: string;
    if (includeSpecificNumbers) {
      sentence = `unplanned firefighting reached ${ffPct}%${trend}`;
    } else {
      sentence = 'unplanned firefighting exceeded the target level';
    }
    triggered.push({ key: 'firefightingLoad', sentence, highlight: `Firefighting: ${ffPct}%` });
  }

  // --- busFactorRisks ---
  if (narrativeConfig.observations.busFactorRisks) {
    const busResults = await computeBusFactorRisk(month);
    const critical = busResults.filter(r => r.riskLevel === 'critical' || r.riskLevel === 'high');
    if (critical.length > 0) {
      let sentence: string;
      if (includeSpecificNumbers && nameIndividuals) {
        const projNames = critical.slice(0, 2).map(r => r.projectId);
        const suffix = critical.length > 2 ? ` and ${critical.length - 2} more` : '';
        sentence = `${critical.length} project${critical.length !== 1 ? 's' : ''} — ${projNames.join(', ')}${suffix} — ${critical.length !== 1 ? 'have' : 'has'} single-point-of-failure risk with only one engineer contributing`;
      } else if (includeSpecificNumbers) {
        sentence = `${critical.length} project${critical.length !== 1 ? 's have' : ' has'} single-point-of-failure risk with insufficient contributor diversity`;
      } else {
        sentence = 'several projects have single-point-of-failure risk with insufficient contributor diversity';
      }
      triggered.push({
        key: 'busFactorRisks',
        sentence,
        highlight: `Bus factor risk: ${critical.length} project${critical.length !== 1 ? 's' : ''}`,
      });
    }
  }

  // --- focusFragmentation ---
  if (narrativeConfig.observations.focusFragmentation) {
    const focusResults = await computeFocusScore(month);
    const fragmented = focusResults.filter(f => f.focusScore < 35);
    if (fragmented.length > 0) {
      const top = fragmented[0];
      let sentence: string;
      if (nameIndividuals && includeSpecificNumbers) {
        sentence = `${top.person} shows significant context fragmentation, averaging ${top.avgProjectsPerDay.toFixed(1)} projects per day across ${top.monthlyProjectCount} different work streams`;
      } else if (nameIndividuals) {
        sentence = `${top.person} shows significant context fragmentation across a large number of work streams`;
      } else if (includeSpecificNumbers) {
        sentence = `one engineer shows significant context fragmentation, averaging ${top.avgProjectsPerDay.toFixed(1)} projects per day across ${top.monthlyProjectCount} work streams`;
      } else {
        sentence = 'one engineer shows significant context fragmentation across a large number of work streams';
      }
      triggered.push({
        key: 'focusFragmentation',
        sentence,
        highlight: `Fragmented: ${fragmented.length} engineer${fragmented.length !== 1 ? 's' : ''}`,
      });
    }
  }

  // --- overtimeIndicators ---
  if (narrativeConfig.observations.overtimeIndicators) {
    const overtimePeople: { name: string; days: number }[] = [];
    const byPerson = new Map<string, typeof timesheets>();
    for (const t of timesheets) {
      if (!engineerSet.has(t.full_name)) continue;
      const list = byPerson.get(t.full_name) ?? [];
      list.push(t);
      byPerson.set(t.full_name, list);
    }
    for (const [person, entries] of byPerson) {
      const dailyHours = new Map<string, number>();
      for (const e of entries) {
        dailyHours.set(e.date, (dailyHours.get(e.date) ?? 0) + e.hours);
      }
      const overtimeDays = [...dailyHours.values()].filter(h => h > 8).length;
      if (overtimeDays >= 3) {
        overtimePeople.push({ name: person, days: overtimeDays });
      }
    }
    if (overtimePeople.length > 0) {
      const top = overtimePeople[0];
      let sentence: string;
      if (nameIndividuals && includeSpecificNumbers) {
        sentence = `${top.name} logged overtime on ${top.days} days this month, which may indicate unsustainable workload`;
      } else if (nameIndividuals) {
        sentence = `${top.name} logged overtime on multiple days, which may indicate unsustainable workload`;
      } else if (includeSpecificNumbers) {
        sentence = `a team member logged overtime on ${top.days} days this month, which may indicate unsustainable workload`;
      } else {
        sentence = 'a team member logged overtime on multiple days, which may indicate unsustainable workload';
      }
      triggered.push({
        key: 'overtimeIndicators',
        sentence,
        highlight: `Overtime: ${overtimePeople.length} engineer${overtimePeople.length !== 1 ? 's' : ''}`,
      });
    }
  }

  // --- meetingTax ---
  if (narrativeConfig.observations.meetingTax) {
    const meetingResults = await computeMeetingTax(month);
    const heavy = meetingResults.filter(m => m.meetingPct > 0.15);
    if (heavy.length > 0) {
      const top = heavy[0];
      const trend = addTrendLanguage(
        Math.round(top.meetingPct * 100),
        prevMeetingPctAvg !== null ? Math.round(prevMeetingPctAvg * 100) : null,
        includeTrendComparisons, '%'
      );
      let sentence: string;
      if (nameIndividuals && includeSpecificNumbers) {
        sentence = `${top.person} spent ${Math.round(top.meetingPct * 100)}% of capacity in meetings, leaving limited time for engineering work${trend}`;
      } else if (nameIndividuals) {
        sentence = `${top.person} spent a disproportionate amount of time in meetings`;
      } else if (includeSpecificNumbers) {
        sentence = `one engineer spent ${Math.round(top.meetingPct * 100)}% of capacity in meetings${trend}`;
      } else {
        sentence = 'one engineer spent a disproportionate amount of time in meetings';
      }
      triggered.push({
        key: 'meetingTax',
        sentence,
        highlight: `Meeting-heavy: ${heavy.length} engineer${heavy.length !== 1 ? 's' : ''}`,
      });
    }
  }

  // --- projectOverBurn / projectUnderBurn ---
  if (narrativeConfig.observations.projectOverBurn || narrativeConfig.observations.projectUnderBurn) {
    const npdComps = await computeNPDProjectComparison(month);

    if (narrativeConfig.observations.projectOverBurn) {
      const overBurning = npdComps.filter(p => p.planned_hours > 0 && p.delta_pct > 0.30);
      if (overBurning.length > 0) {
        const top = overBurning[0];
        let sentence: string;
        if (nameIndividuals && includeSpecificNumbers) {
          sentence = `${top.project_name} is over-burning at ${Math.round((1 + top.delta_pct) * 100)}% of planned hours`;
        } else if (includeSpecificNumbers) {
          sentence = `${overBurning.length} project${overBurning.length !== 1 ? 's are' : ' is'} significantly over planned hours`;
        } else {
          sentence = `${overBurning.length > 1 ? 'some projects are' : 'a project is'} significantly over planned hours`;
        }
        triggered.push({
          key: 'projectOverBurn',
          sentence,
          highlight: `Over-burning: ${overBurning.length} project${overBurning.length !== 1 ? 's' : ''}`,
        });
      }
    }

    if (narrativeConfig.observations.projectUnderBurn) {
      const underBurning = npdComps.filter(p => p.planned_hours > 0 && p.delta_pct < -0.50);
      if (underBurning.length > 0) {
        const top = underBurning[0];
        let sentence: string;
        if (nameIndividuals && includeSpecificNumbers) {
          sentence = `${top.project_name} is significantly under planned pace at ${Math.round((1 + top.delta_pct) * 100)}% of planned hours`;
        } else if (includeSpecificNumbers) {
          sentence = `${underBurning.length} project${underBurning.length !== 1 ? 's are' : ' is'} significantly under planned pace`;
        } else {
          sentence = `${underBurning.length > 1 ? 'some projects are' : 'a project is'} significantly under planned pace`;
        }
        triggered.push({
          key: 'projectUnderBurn',
          sentence,
          highlight: `Under-burning: ${underBurning.length} project${underBurning.length !== 1 ? 's' : ''}`,
        });
      }
    }
  }

  // --- labTechContribution ---
  if (narrativeConfig.observations.labTechContribution && labTechTotalHours > 0) {
    let sentence: string;
    if (includeSpecificNumbers) {
      sentence = `lab technicians contributed ${Math.round(labTechTotalHours)} hours of support across ${labTechProjectSet.size} project${labTechProjectSet.size !== 1 ? 's' : ''}`;
    } else {
      sentence = 'lab technicians contributed additional support hours across several projects';
    }
    triggered.push({
      key: 'labTechContribution',
      sentence,
      highlight: `Lab tech support: ${Math.round(labTechTotalHours)} hrs`,
    });
  }

  // ── Select top N observations by priority ──
  const priorityOrder = narrativeConfig.observationPriority;
  triggered.sort((a, b) => {
    const aIdx = priorityOrder.indexOf(a.key);
    const bIdx = priorityOrder.indexOf(b.key);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });
  const selected = triggered.slice(0, narrativeConfig.maxObservations);

  // ── Build narrative ──
  const sentences: string[] = [];
  const highlights: string[] = [];

  // Custom opening
  if (narrativeConfig.customOpening.trim()) {
    sentences.push(narrativeConfig.customOpening.trim());
  }

  // Sentence 1: Volume overview
  sentences.push(
    `In ${monthLabel}, the team of ${kpi.activeEngineers} engineers logged ${Math.round(kpi.totalHoursLogged).toLocaleString()} hours across ${projectSet.size} projects, achieving ${Math.round(kpi.teamUtilization * 100)}% utilization.`
  );

  // Sentence 2: Work mix
  const npdPct = kpi.npdFocus;
  const focusQualifier = qualifyFocus(npdPct);
  let focusSentence = `Work was ${focusQualifier} focused on NPD (${Math.round(npdPct * 100)}% of hours), with ${Math.round(kpi.sustainingHours)} hours on sustaining activities`;

  // Firefighting clause — append to focus sentence if firefighting is active
  if (kpi.firefightingLoad > 0.10 && narrativeConfig.observations.firefightingLoad) {
    focusSentence += `, of which ${Math.round(kpi.firefightingLoad * 100)}% was unplanned firefighting`;
  }
  focusSentence += '.';
  sentences.push(focusSentence);

  // Observation sentences
  if (selected.length > 0) {
    const obsTexts = selected.map((s, i) => {
      if (i === 0) return s.sentence.charAt(0).toUpperCase() + s.sentence.slice(1);
      return s.sentence;
    });
    sentences.push(obsTexts.join('. ') + '.');
    highlights.push(...selected.map(s => s.highlight));
  }

  // Capacity sentence
  if (underloaded.length > 0) {
    if (nameIndividuals) {
      const names = underloaded.slice(0, 3).join(', ');
      const suffix = underloaded.length > 3 ? ' and others' : '';
      sentences.push(
        `${underloaded.length} team member${underloaded.length > 1 ? 's have' : ' has'} available capacity below 60% utilization (${names}${suffix}).`
      );
    } else {
      sentences.push(
        `${underloaded.length} team member${underloaded.length > 1 ? 's have' : ' has'} available capacity (below 60% utilization).`
      );
    }
    highlights.push(`Available capacity: ${underloaded.join(', ')}`);
  } else if (kpi.teamUtilization > 1.0) {
    if (nameIndividuals && overloaded.length > 0) {
      sentences.push(`The team is running above full capacity with no slack available, with ${overloaded.slice(0, 2).join(' and ')} logging the most hours over capacity.`);
    } else {
      sentences.push('The team is running above full capacity with no slack available.');
    }
    highlights.push('No slack capacity');
  }

  // Custom closing
  if (narrativeConfig.customClosing.trim()) {
    sentences.push(narrativeConfig.customClosing.trim());
  }

  return { paragraph: sentences.join(' '), highlights };
}

// ══════════════════════════════════════════════════════════════
// Project Narrative (Single Project mode)
// ══════════════════════════════════════════════════════════════

async function generateProjectNarrative(
  month: string,
  projectId: string
): Promise<NarrativeSummary> {
  const data = await loadNarrativeData(month, projectId);
  const { kpi, timesheets, projects: projectMap, narrativeConfig, engineerSet } = data;
  const monthLabel = formatMonthLabel(month);

  const projectDef = projectMap.get(projectId);
  const projectName = projectDef?.project_name ?? projectId;
  const projectType = projectDef?.type ?? ProjectType.Admin;
  const projectWorkClass = projectDef?.work_class ?? 'Planned';

  // ── No activity case ──
  if (timesheets.length === 0) {
    const typeLabel = formatProjectTypeLabel(projectType);
    return {
      paragraph: `${projectName} (${projectId}) had no recorded activity in ${monthLabel}.`,
      highlights: [`${typeLabel} project`, 'No activity'],
    };
  }

  // ── Gather project-specific data ──
  const totalActual = kpi.totalHoursLogged;

  // Contributors (engineers only)
  const contributorHours = new Map<string, number>();
  // Activity breakdown
  const activityHours = new Map<string, number>();

  for (const t of timesheets) {
    if (engineerSet.has(t.full_name)) {
      contributorHours.set(t.full_name, (contributorHours.get(t.full_name) ?? 0) + t.hours);
    }
    if (t.activity) {
      activityHours.set(t.activity, (activityHours.get(t.activity) ?? 0) + t.hours);
    }
  }

  // Include lab techs as contributors too
  const allContributorHours = new Map<string, number>();
  for (const t of timesheets) {
    allContributorHours.set(t.full_name, (allContributorHours.get(t.full_name) ?? 0) + t.hours);
  }

  const contributorNames = [...allContributorHours.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  const contributorCount = contributorNames.length;

  const sentences: string[] = [];
  const highlights: string[] = [];

  const typeLabel = formatProjectTypeLabel(projectType);

  // ── Opening sentence ──
  const activities = [...activityHours.entries()].sort((a, b) => b[1] - a[1]);

  if (activities.length === 1) {
    // Single activity type — fold into opening
    const activityName = activities[0][0].toLowerCase();
    sentences.push(
      `${projectName} (${projectId}) logged ${Math.round(totalActual)} hours of ${activityName} in ${monthLabel}${contributorCount === 1 ? `, with ${contributorNames[0]} as the sole contributor` : ` across ${contributorCount} contributors: ${formatNameList(contributorNames)}`}.`
    );
  } else {
    // Multiple activity types — separate sentences
    sentences.push(
      `${projectName} (${projectId}) logged ${Math.round(totalActual)} hours in ${monthLabel} across ${contributorCount} contributor${contributorCount !== 1 ? 's' : ''}: ${formatNameList(contributorNames)}.`
    );

    // Activity breakdown sentence
    sentences.push(`Work was split between ${formatActivityBreakdown(activities)}.`);
  }

  // ── Comparison to plan ──
  const npdComps = await computeNPDProjectComparison(month);
  const comp = npdComps.find(c =>
    c.project_id === projectId || c.project_id === getProjectParent(projectId)
  );

  if (comp && comp.planned_hours > 0) {
    const pctOfPlan = Math.round((comp.actual_hours / comp.planned_hours) * 100);
    const deviationClause = qualifyPlanDeviation(pctOfPlan);
    sentences.push(
      `This represents ${pctOfPlan}% of the ${Math.round(comp.planned_hours)}h planned for the month${deviationClause}.`
    );
    highlights.push(`On plan: ${pctOfPlan}%`);
  }

  // ── Project-specific observations ──
  const triggered: TriggeredObservation[] = [];

  // Check which observations apply in project mode
  const projectModeObs = NARRATIVE_OBSERVATIONS.filter(o => o.modes.includes('project' as NarrativeMode));
  const projectModeKeys = new Set(projectModeObs.map(o => o.key));

  // --- busFactorRisks (project-level: is THIS project single-contributor?) ---
  if (narrativeConfig.observations.busFactorRisks && projectModeKeys.has('busFactorRisks')) {
    const busResults = await computeBusFactorRisk(month, projectId);
    const thisProject = busResults.find(r =>
      r.projectId === projectId || getProjectParent(r.projectId) === projectId
    );
    if (thisProject && (thisProject.riskLevel === 'critical' || thisProject.riskLevel === 'high')) {
      const topName = thisProject.topContributor;
      const topPct = Math.round(thisProject.topContributorPct * 100);
      triggered.push({
        key: 'busFactorRisks',
        sentence: `This project depends on a single contributor (${topName}), creating key-person risk — ${topName} accounted for ${topPct}% of all hours`,
        highlight: `Single contributor: ${topName}`,
      });
    }
  }

  // --- focusFragmentation (project-level: primary contributor's fragmentation) ---
  if (narrativeConfig.observations.focusFragmentation && projectModeKeys.has('focusFragmentation') && contributorNames.length > 0) {
    // Get the primary contributor's full focus score (unfiltered by project)
    const focusResults = await computeFocusScore(month);
    const primaryContributor = contributorNames[0];
    const primaryFocus = focusResults.find(f => f.person === primaryContributor);
    if (primaryFocus && primaryFocus.monthlyProjectCount > 3) {
      const otherProjects = primaryFocus.monthlyProjectCount - 1; // exclude this project
      if (otherProjects > 2) {
        triggered.push({
          key: 'focusFragmentation',
          sentence: `${primaryContributor}, the primary contributor, is also active on ${otherProjects} other projects this month, which may affect throughput`,
          highlight: `${primaryContributor}: ${primaryFocus.monthlyProjectCount} projects`,
        });
      }
    }
  }

  // --- projectOverBurn (project-level) ---
  if (narrativeConfig.observations.projectOverBurn && projectModeKeys.has('projectOverBurn') && comp && comp.planned_hours > 0 && comp.delta_pct > 0.30) {
    const overPct = Math.round(comp.delta_pct * 100);
    triggered.push({
      key: 'projectOverBurn',
      sentence: `Hours are running ${overPct}% above plan — ${Math.round(comp.actual_hours)}h logged against ${Math.round(comp.planned_hours)}h planned`,
      highlight: `Over plan: ${Math.round((1 + comp.delta_pct) * 100)}%`,
    });
  }

  // --- projectUnderBurn (project-level) ---
  if (narrativeConfig.observations.projectUnderBurn && projectModeKeys.has('projectUnderBurn') && comp && comp.planned_hours > 0 && comp.delta_pct < -0.50) {
    const actualPct = Math.round((comp.actual_hours / comp.planned_hours) * 100);
    triggered.push({
      key: 'projectUnderBurn',
      sentence: `Only ${actualPct}% of planned hours have been logged — ${Math.round(comp.actual_hours)}h of ${Math.round(comp.planned_hours)}h`,
      highlight: `Under plan: ${actualPct}%`,
    });
  }

  // Firefighting label (not the team-level percentage — just flag if this project IS firefighting)
  if (projectWorkClass === 'Unplanned/Firefighting') {
    sentences.push('This project is classified as unplanned firefighting work.');
    highlights.push('Unplanned/Firefighting');
  }

  // ── Sort and select observations by priority ──
  const priorityOrder = narrativeConfig.observationPriority;
  triggered.sort((a, b) => {
    const aIdx = priorityOrder.indexOf(a.key);
    const bIdx = priorityOrder.indexOf(b.key);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });
  const selected = triggered.slice(0, narrativeConfig.maxObservations);

  if (selected.length > 0) {
    const obsTexts = selected.map((s, i) => {
      if (i === 0) return s.sentence.charAt(0).toUpperCase() + s.sentence.slice(1);
      return s.sentence;
    });
    sentences.push(obsTexts.join('. ') + '.');
    highlights.push(...selected.map(s => s.highlight));
  }

  // ── Standard highlights ──
  highlights.push(`${typeLabel} project`);
  if (contributorCount > 1) {
    highlights.push(`${contributorCount} contributors`);
  }

  return { paragraph: sentences.join(' '), highlights };
}

// ══════════════════════════════════════════════════════════════
// Sentence Assembly Helpers
// ══════════════════════════════════════════════════════════════

/**
 * "engineering (32h) and lab testing (11h)"
 * "engineering (185h), lab testing (98h), and project management (3h)"
 */
function formatActivityBreakdown(activities: [string, number][]): string {
  const parts = activities.map(([name, hours]) => `${name.toLowerCase()} (${Math.round(hours)}h)`);
  return formatListWithAnd(parts);
}

/**
 * "Brian Sloan and Mike Davis"
 * "Brian Sloan, Mike Davis, and Karl Maas"
 * Caps at 3 names then "and N others"
 */
function formatNameList(names: string[]): string {
  if (names.length <= 3) {
    return formatListWithAnd(names);
  }
  const shown = names.slice(0, 3);
  const remaining = names.length - 3;
  return `${shown.join(', ')}, and ${remaining} other${remaining !== 1 ? 's' : ''}`;
}

/**
 * Oxford-comma list: "A, B, and C"
 */
function formatListWithAnd(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * "strongly" (>60%), "moderately" (40-60%), "lightly" (<40%)
 */
function qualifyFocus(percentage: number): string {
  if (percentage > 0.6) return 'strongly';
  if (percentage > 0.4) return 'moderately';
  return 'lightly';
}

/**
 * Plan deviation qualifier for project narrative.
 * Returns a clause like ", tracking close to plan" or ", significantly exceeding the planned budget"
 */
function qualifyPlanDeviation(actualPct: number): string {
  if (actualPct >= 90 && actualPct <= 110) return ', tracking close to plan';
  if (actualPct > 130) return ', significantly exceeding the planned budget';
  if (actualPct > 110) return ', slightly over plan';
  if (actualPct < 50) return ', well below planned pace';
  if (actualPct < 90) return ', slightly under plan';
  return '';
}

function formatProjectTypeLabel(type: string): string {
  if (type === ProjectType.NPD) return 'NPD';
  if (type === ProjectType.Sustaining) return 'Sustaining';
  if (type === ProjectType.Sprint) return 'Sprint';
  return String(type);
}

// ── Existing helpers ──

function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split('-');
  const names = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[parseInt(monthNum) - 1]} ${year}`;
}

function computePreviousMonth(month: string): string {
  const [yearStr, monthStr] = month.split('-');
  let y = parseInt(yearStr);
  let m = parseInt(monthStr) - 1;
  if (m === 0) {
    m = 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

function addTrendLanguage(
  current: number,
  previous: number | null,
  enabled: boolean,
  unit: string
): string {
  if (!enabled || previous === null) return '';
  const delta = current - previous;
  if (Math.abs(delta) < 1) return '';
  if (delta > 0) return `, up from ${previous}${unit} last month`;
  return `, down from ${previous}${unit} last month`;
}
