import Dexie, { type Table } from 'dexie';
import type {
  TimesheetEntry,
  TeamMember,
  Project,
  ProjectMilestone,
  PlannedAllocation,
  PlannedProjectMonth,
  DashboardConfig,
  ImportLog,
  SkillRating,
  SkillCategory,
  ProjectSkillRequirement,
  AnomalyThreshold,
  NarrativeConfig,
  KPISnapshot,
  AnomalySnapshot,
  WeeklyUpdate,
  PlanningScenario,
  ScenarioAllocation,
  ScenarioSnapshot,
} from '../types';
import { DEFAULT_KPI_CARDS } from '../aggregation/kpiRegistry';

// Default skill categories
export const DEFAULT_SKILLS = [
  'FEA',
  'CFD',
  'Deflector development',
  'VicFlex hose',
  'VicFlex bracket',
  'Vortex design',
  'Vortex operation',
  'Data acquisition',
  'Fire test protocols',
  'Failure / root cause analysis',
  'Statistical analysis',
  'Test fixture design',
  'Codes and standards',
  'Tolerance stackup',
];

class DashboardDB extends Dexie {
  timesheets!: Table<TimesheetEntry, number>;
  teamMembers!: Table<TeamMember, number>;
  projects!: Table<Project, string>;
  milestones!: Table<ProjectMilestone, string>;
  plannedAllocations!: Table<PlannedAllocation, number>;
  plannedProjectMonths!: Table<PlannedProjectMonth, number>;
  config!: Table<DashboardConfig, number>;
  importLogs!: Table<ImportLog, number>;
  skills!: Table<SkillRating, number>;
  skillCategories!: Table<SkillCategory, string>;
  projectSkillRequirements!: Table<ProjectSkillRequirement, number>;
  anomalyThresholds!: Table<AnomalyThreshold, string>;
  narrativeConfig!: Table<NarrativeConfig, number>;
  kpiHistory!: Table<KPISnapshot, number>;
  anomalyHistory!: Table<AnomalySnapshot, number>;
  weeklyUpdates!: Table<WeeklyUpdate, number>;
  planningScenarios!: Table<PlanningScenario, number>;
  scenarioAllocations!: Table<ScenarioAllocation, number>;
  scenarioSnapshots!: Table<ScenarioSnapshot, number>;

  constructor() {
    super('ResourceDashboard');

    // Version 1: Phase 1 tables
    this.version(1).stores({
      timesheets: 'timesheet_entry_id, date, person, full_name, activity, r_number, team, month, week, person_id, project_id, task_id',
      teamMembers: 'person_id, person, full_name, role',
      projects: 'project_id, type, work_class',
      milestones: 'project_id',
      plannedAllocations: '++id, [month+project_id+engineer], month, project_id, engineer',
      plannedProjectMonths: '++id, [month+project_id], month, project_id',
      config: 'id',
      importLogs: '++id, imported_at, filename',
    });

    // Version 2: Add Phase 2 tables (skills)
    this.version(2).stores({
      timesheets: 'timesheet_entry_id, date, person, full_name, activity, r_number, team, month, week, person_id, project_id, task_id',
      teamMembers: 'person_id, person, full_name, role',
      projects: 'project_id, type, work_class',
      milestones: 'project_id',
      plannedAllocations: '++id, [month+project_id+engineer], month, project_id, engineer',
      plannedProjectMonths: '++id, [month+project_id], month, project_id',
      config: 'id',
      importLogs: '++id, imported_at, filename',
      skills: '++id, [engineer+skill], engineer, skill',
      skillCategories: 'name, sort_order',
    });

    // Version 3: Add project skill requirements table
    this.version(3).stores({
      timesheets: 'timesheet_entry_id, date, person, full_name, activity, r_number, team, month, week, person_id, project_id, task_id',
      teamMembers: 'person_id, person, full_name, role',
      projects: 'project_id, type, work_class',
      milestones: 'project_id',
      plannedAllocations: '++id, [month+project_id+engineer], month, project_id, engineer',
      plannedProjectMonths: '++id, [month+project_id], month, project_id',
      config: 'id',
      importLogs: '++id, imported_at, filename',
      skills: '++id, [engineer+skill], engineer, skill',
      skillCategories: 'name, sort_order',
      projectSkillRequirements: '++id, [project_id+skill], project_id, skill',
    });

    // Version 4: Add anomaly thresholds table
    this.version(4).stores({
      timesheets: 'timesheet_entry_id, date, person, full_name, activity, r_number, team, month, week, person_id, project_id, task_id',
      teamMembers: 'person_id, person, full_name, role',
      projects: 'project_id, type, work_class',
      milestones: 'project_id',
      plannedAllocations: '++id, [month+project_id+engineer], month, project_id, engineer',
      plannedProjectMonths: '++id, [month+project_id], month, project_id',
      config: 'id',
      importLogs: '++id, imported_at, filename',
      skills: '++id, [engineer+skill], engineer, skill',
      skillCategories: 'name, sort_order',
      projectSkillRequirements: '++id, [project_id+skill], project_id, skill',
      anomalyThresholds: 'ruleId',
    });

    // Version 5: Add narrative config table
    this.version(5).stores({
      timesheets: 'timesheet_entry_id, date, person, full_name, activity, r_number, team, month, week, person_id, project_id, task_id',
      teamMembers: 'person_id, person, full_name, role',
      projects: 'project_id, type, work_class',
      milestones: 'project_id',
      plannedAllocations: '++id, [month+project_id+engineer], month, project_id, engineer',
      plannedProjectMonths: '++id, [month+project_id], month, project_id',
      config: 'id',
      importLogs: '++id, imported_at, filename',
      skills: '++id, [engineer+skill], engineer, skill',
      skillCategories: 'name, sort_order',
      projectSkillRequirements: '++id, [project_id+skill], project_id, skill',
      anomalyThresholds: 'ruleId',
      narrativeConfig: 'id',
    });

    // Version 6: Add kpi_cards to DashboardConfig
    this.version(6).stores({
      timesheets: 'timesheet_entry_id, date, person, full_name, activity, r_number, team, month, week, person_id, project_id, task_id',
      teamMembers: 'person_id, person, full_name, role',
      projects: 'project_id, type, work_class',
      milestones: 'project_id',
      plannedAllocations: '++id, [month+project_id+engineer], month, project_id, engineer',
      plannedProjectMonths: '++id, [month+project_id], month, project_id',
      config: 'id',
      importLogs: '++id, imported_at, filename',
      skills: '++id, [engineer+skill], engineer, skill',
      skillCategories: 'name, sort_order',
      projectSkillRequirements: '++id, [project_id+skill], project_id, skill',
      anomalyThresholds: 'ruleId',
      narrativeConfig: 'id',
    }).upgrade(tx => {
      return tx.table('config').toCollection().modify(config => {
        if (!config.kpi_cards) {
          config.kpi_cards = [...DEFAULT_KPI_CARDS];
        }
      });
    });

    // Version 7: Add pdf_export_sections to DashboardConfig
    this.version(7).stores({
      timesheets: 'timesheet_entry_id, date, person, full_name, activity, r_number, team, month, week, person_id, project_id, task_id',
      teamMembers: 'person_id, person, full_name, role',
      projects: 'project_id, type, work_class',
      milestones: 'project_id',
      plannedAllocations: '++id, [month+project_id+engineer], month, project_id, engineer',
      plannedProjectMonths: '++id, [month+project_id], month, project_id',
      config: 'id',
      importLogs: '++id, imported_at, filename',
      skills: '++id, [engineer+skill], engineer, skill',
      skillCategories: 'name, sort_order',
      projectSkillRequirements: '++id, [project_id+skill], project_id, skill',
      anomalyThresholds: 'ruleId',
      narrativeConfig: 'id',
    }).upgrade(tx => {
      return tx.table('config').toCollection().modify(config => {
        if (!config.pdf_export_sections) {
          config.pdf_export_sections = {
            includeKPISummary: true,
            includeNarrative: true,
            includeAlerts: false,
            chartPanels: ['engineer-breakdown', 'npd-project-comp'],
          };
        }
      });
    });

    // Version 8: Add KPI history + anomaly history tables
    this.version(8).stores({
      timesheets: 'timesheet_entry_id, date, person, full_name, activity, r_number, team, month, week, person_id, project_id, task_id',
      teamMembers: 'person_id, person, full_name, role',
      projects: 'project_id, type, work_class',
      milestones: 'project_id',
      plannedAllocations: '++id, [month+project_id+engineer], month, project_id, engineer',
      plannedProjectMonths: '++id, [month+project_id], month, project_id',
      config: 'id',
      importLogs: '++id, imported_at, filename',
      skills: '++id, [engineer+skill], engineer, skill',
      skillCategories: 'name, sort_order',
      projectSkillRequirements: '++id, [project_id+skill], project_id, skill',
      anomalyThresholds: 'ruleId',
      narrativeConfig: 'id',
      kpiHistory: '++id, [month+project_filter], month, project_filter, computed_at',
      anomalyHistory: '++id, [month+project_filter], month, project_filter',
    });

    // Version 9: Add weekly updates table
    this.version(9).stores({
      timesheets: 'timesheet_entry_id, date, person, full_name, activity, r_number, team, month, week, person_id, project_id, task_id',
      teamMembers: 'person_id, person, full_name, role',
      projects: 'project_id, type, work_class',
      milestones: 'project_id',
      plannedAllocations: '++id, [month+project_id+engineer], month, project_id, engineer',
      plannedProjectMonths: '++id, [month+project_id], month, project_id',
      config: 'id',
      importLogs: '++id, imported_at, filename',
      skills: '++id, [engineer+skill], engineer, skill',
      skillCategories: 'name, sort_order',
      projectSkillRequirements: '++id, [project_id+skill], project_id, skill',
      anomalyThresholds: 'ruleId',
      narrativeConfig: 'id',
      kpiHistory: '++id, [month+project_filter], month, project_filter, computed_at',
      anomalyHistory: '++id, [month+project_filter], month, project_filter',
      weeklyUpdates: '++id, &[project_id+week_ending], project_id, week_ending',
    });

    // Version 10: Add what-if scenario planning tables
    this.version(10).stores({
      timesheets: 'timesheet_entry_id, date, person, full_name, activity, r_number, team, month, week, person_id, project_id, task_id',
      teamMembers: 'person_id, person, full_name, role',
      projects: 'project_id, type, work_class',
      milestones: 'project_id',
      plannedAllocations: '++id, [month+project_id+engineer], month, project_id, engineer',
      plannedProjectMonths: '++id, [month+project_id], month, project_id',
      config: 'id',
      importLogs: '++id, imported_at, filename',
      skills: '++id, [engineer+skill], engineer, skill',
      skillCategories: 'name, sort_order',
      projectSkillRequirements: '++id, [project_id+skill], project_id, skill',
      anomalyThresholds: 'ruleId',
      narrativeConfig: 'id',
      kpiHistory: '++id, [month+project_filter], month, project_filter, computed_at',
      anomalyHistory: '++id, [month+project_filter], month, project_filter',
      weeklyUpdates: '++id, &[project_id+week_ending], project_id, week_ending',
      planningScenarios: '++id, status, created_at',
      scenarioAllocations: '++id, [scenario_id+month+project_id+engineer], scenario_id, month, engineer',
      scenarioSnapshots: '++id, scenario_id, computed_at',
    });
  }
}

export const db = new DashboardDB();

/**
 * Initialize database with default config and seed data if empty.
 */
export async function initializeDatabase(): Promise<void> {
  const configCount = await db.config.count();

  if (configCount === 0) {
    const defaultConfig: DashboardConfig = {
      id: 1,
      team_name: '',
      std_monthly_capacity_hours: 140,
      over_utilization_threshold_pct: 1.0,
      selected_month: '',
      selected_project: '',
      kpi_cards: [...DEFAULT_KPI_CARDS],
      pdf_export_sections: {
        includeKPISummary: true,
        includeNarrative: true,
        includeAlerts: false,
        chartPanels: ['engineer-breakdown', 'npd-project-comp'],
      },
    };

    await db.config.add(defaultConfig);
  }

  // Seed default skill categories if empty
  const skillCatCount = await db.skillCategories.count();

  if (skillCatCount === 0) {
    const categories = DEFAULT_SKILLS.map((name, index) => ({
      name,
      sort_order: index,
    }));

    await db.skillCategories.bulkAdd(categories);
  }

  // Seed default anomaly thresholds if empty
  const anomalyCount = await db.anomalyThresholds.count();

  if (anomalyCount === 0) {
    const { seedAnomalyDefaults } = await import('../aggregation/anomalyRules');
    await db.anomalyThresholds.bulkAdd(seedAnomalyDefaults());
  }

  // Seed default narrative config if empty
  const narrativeCount = await db.narrativeConfig.count();

  if (narrativeCount === 0) {
    const { DEFAULT_NARRATIVE_CONFIG } = await import('../aggregation/narrativeObservations');
    await db.narrativeConfig.add({ ...DEFAULT_NARRATIVE_CONFIG });
  }
}
