// ============================================================
// ENUMS (as const objects to satisfy erasableSyntaxOnly)
// ============================================================

export const ActivityType = {
  Engineering: "Engineering",
  LabTesting: "Lab - Testing",
  PTO: "PTO",
  ProjectManagement: "Project Management",
} as const;

export type ActivityType = typeof ActivityType[keyof typeof ActivityType];

export const ProjectType = {
  NPD: "NPD",               // New Product Development (R-prefix R#s for active dev projects)
  Sustaining: "Sustaining",  // Sustaining engineering (S-prefix and support R#s)
  Admin: "Admin",            // Administrative work (R0996)
  OutOfOffice: "OOO",        // PTO, holidays (R0999)
  Sprint: "Sprint",          // Short sprint tasks (T-prefix, rare)
} as const;

export type ProjectType = typeof ProjectType[keyof typeof ProjectType];

export const WorkClass = {
  Planned: "Planned",
  UnplannedFirefighting: "Unplanned/Firefighting",
} as const;

export type WorkClass = typeof WorkClass[keyof typeof WorkClass];

export const PersonRole = {
  Engineer: "Engineer",
  LabTechnician: "Lab Technician",
} as const;

export type PersonRole = typeof PersonRole[keyof typeof PersonRole];

// ============================================================
// RAW IMPORT
// ============================================================

/**
 * Represents one raw row from the LP CSV, stored verbatim.
 * The timesheet_entry_id is the primary key and dedup key.
 */
export interface TimesheetEntry {
  timesheet_entry_id: number;   // PRIMARY KEY — unique per row globally
  date: string;                 // YYYY-MM-DD
  status: string;
  person: string;               // username
  full_name: string;
  client: string;
  project: string;              // LP project name
  activity: ActivityType;
  hours: number;
  billable: string;
  timesheet_entry_note: string;
  task: string;
  task_reference: string;
  folder: string;               // Full breadcrumb path
  package: string;
  person_id: number;
  client_id: string;
  project_id: number;
  activity_id: number;
  task_id: number;
  folder_id: number;
  package_id: string;
  person_reference: string;
  client_reference: string;
  project_reference: string;
  is_done: boolean;
  done_date: string;
  team: string;                 // e.g., "ENG_Fire Suppression"
  month: string;                // e.g., "2026/01"
  week: number;
  tags: string;
  inherited_tags: string;       // Comma-separated
  max_effort: string;
  r_number: string;             // From "R #" column — the primary project code
  work_order_group: string;
  project_stage_type: string;
  drawing_number_rev: string;
  work_order_status: string;
  part_code: string;
  test_day: string;
  source_facility: string;
  jn_order: string;
  job_type: string;
  sourcing_category: string;
  po_number: string;
  supplier: string;
  due_date: string;
  cpr_number: string;
  region: string;
  major_market: string;
  department_code: string;
  approved_date: string;
  approval: string;
  cost: string;
  project_phase: string;
  order: string;
  dependency_satisfied_date: string;
  market: string;
  task_approved_date: string;
  rework: string;
  original_deadline: string;
  test_type: string;
  andon: string;
  number_of_tests: string;
}

// ============================================================
// DERIVED / CONFIG ENTITIES
// ============================================================

/**
 * A team member — either an engineer or a lab technician.
 * Auto-discovered from imported data, role assigned in config.
 */
export interface TeamMember {
  person_id: number;            // From LP
  person: string;               // Username
  full_name: string;
  role: PersonRole;             // Manually set in config; default heuristic below
  capacity_override_hours: number; // 0 = use default (140 hrs/month from params)
}

/**
 * A project or work stream, keyed by R# / S# / T# code.
 * Auto-discovered from imported data, type/class manually refined in config.
 */
export interface Project {
  project_id: string;           // The R# / S# / T# code (e.g., "R1517.1", "S0062")
  project_name: string;         // Human-readable name
  type: ProjectType;            // NPD, Sustaining, Admin, OOO
  work_class: WorkClass;        // Planned or Unplanned/Firefighting
  // Optional metadata (Weekly Updates / project tracker)
  product_category?: string;      // e.g., "Couplings", "Valves"
  mendix_score?: number;          // 1-10 priority
  assigned_engineer?: string;
  assigned_lab_tech?: string;
  estimated_eng_hours?: number;
  estimated_lab_hours?: number;
}

/**
 * Milestone dates for NPD projects (gate reviews).
 * Manually entered in configuration.
 */
export interface ProjectMilestone {
  project_id: string;           // R# code
  dr1: string | null;           // Design Review 1 date (YYYY-MM-DD)
  dr2: string | null;           // Design Review 2 date
  dr3: string | null;           // Design Review 3 date
  launch: string | null;        // Product launch date
}

/**
 * Planned hours allocation per month per project per engineer.
 * Manually entered in configuration.
 */
export interface PlannedAllocation {
  id?: number;                  // Auto-increment
  month: string;                // YYYY-MM
  project_id: string;           // R# code
  engineer: string;             // Person's full_name
  allocation_pct: number;       // 0-1 allocation percentage
  planned_hours: number;        // Planned hours for this allocation
}

/**
 * Planned total hours per project per month.
 * Manually entered in configuration.
 */
export interface PlannedProjectMonth {
  id?: number;
  month: string;                // YYYY-MM
  project_id: string;
  total_planned_hours: number;
}

/**
 * Global configuration parameters.
 */
export interface PDFExportSections {
  includeKPISummary: boolean;
  includeNarrative: boolean;
  includeAlerts: boolean;
  chartPanels: string[];        // panel IDs to include
}

export type DateRangePreset = 'single' | 'quarter' | 'year' | 'ytd' | 'all' | 'range';

export interface DateRange {
  type: DateRangePreset;
  months: string[];         // Resolved list of YYYY-MM month strings
  label: string;            // Display label: "Q1 2026", "2025", "Jan '26"
}

export interface DashboardConfig {
  id: number;                   // Always 1 (singleton)
  team_name: string;            // e.g., "ENG_Fire Suppression"
  std_monthly_capacity_hours: number; // Default: 140
  over_utilization_threshold_pct: number; // Default: 1.0 (100%)
  selected_month: string;       // YYYY-MM for dashboard filter (primary month)
  selected_project: string;     // R# for project drill-down
  selected_date_range?: DateRange; // Overrides selected_month when set
  kpi_cards: KPICardKey[];      // Ordered list of KPI cards to display
  pdf_export_sections: PDFExportSections;
}

/**
 * Import log — tracks each CSV import event.
 */
export interface ImportLog {
  id?: number;
  filename: string;
  imported_at: string;          // ISO datetime
  team: string;
  date_range_start: string;     // YYYY-MM-DD
  date_range_end: string;
  total_rows: number;
  new_rows: number;             // After dedup
  duplicate_rows: number;
  people_count: number;
  total_hours: number;
}

/**
 * Result of a CSV import operation.
 */
export interface ImportResult {
  success: boolean;
  filename: string;
  team: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  totalRowsParsed: number;
  newRowsInserted: number;
  duplicateRowsSkipped: number;
  newPeopleDiscovered: string[];    // full_names
  newProjectsDiscovered: string[];  // R# codes
  totalHoursImported: number;
  errors: string[];                 // Any parse errors or warnings
}

// ============================================================
// PHASE 2: SKILLS & AGGREGATIONS
// ============================================================

/**
 * Skill rating for an engineer (0-5 scale).
 */
export interface SkillRating {
  id?: number;                // Auto-increment
  engineer: string;           // full_name of engineer
  skill: string;              // Skill category name
  rating: number;             // 0-5
}

/**
 * Skill category definition.
 */
export interface SkillCategory {
  name: string;               // Primary key
  sort_order: number;         // Display order
}

/**
 * A required skill for a project, with importance weight.
 * Links projects to skill categories with a 1-5 importance scale.
 */
export interface ProjectSkillRequirement {
  id?: number;                // Auto-increment
  project_id: string;         // FK to projects table (R#/S#/T# code)
  skill: string;              // Skill category name
  weight: number;             // 1-5 importance (1=nice-to-have, 5=critical)
}

/**
 * Aggregated actual hours summary (replaces Excel Actual_Hours sheet).
 */
export interface ActualHoursSummary {
  month: string;              // YYYY-MM
  project_id: string;         // R# code
  engineer: string;           // full_name
  work_class: WorkClass;      // From Projects table lookup
  project_type: ProjectType;  // From Projects table lookup
  actual_hours: number;       // Sum of hours
}

/**
 * Lab tech hours per engineer per month.
 */
export interface LabTechHoursSummary {
  month: string;              // YYYY-MM
  engineer: string;           // full_name (engineers only)
  lab_tech_hours: number;     // Hours where activity === "Lab - Testing"
}

/**
 * Monthly category totals for planned vs actual comparison.
 */
export interface MonthlyCategoryTotals {
  month: string;
  planned_npd: number;
  planned_sustaining: number;
  planned_sprint: number;
  actual_npd: number;
  actual_sustaining: number;
  actual_sprint: number;
  actual_firefighting: number;  // Subset of sustaining where work_class = Unplanned
  lab_tech_total: number;       // Total lab-testing hours across all engineers
}

/**
 * Planned utilization heatmap cell.
 */
export interface UtilizationCell {
  engineer: string;
  month: string;
  total_planned_hours: number;   // Sum of all PlannedAllocation hours
  capacity: number;              // Engineer's capacity (override or global default)
  utilization_pct: number;       // planned / capacity
}

/**
 * NPD project planned vs actual comparison.
 */
export interface NPDProjectComparison {
  project_id: string;         // R# code (may be parent group)
  project_name: string;       // Display name
  planned_hours: number;      // From PlannedProjectMonth
  actual_hours: number;       // From ActualHoursSummary
  delta: number;              // actual - planned
  delta_pct: number;          // (actual - planned) / planned
}

/**
 * Engineer-Tech collaboration affinity.
 */
export interface TechAffinityResult {
  engineer: string;           // Engineer full_name
  tech: string;               // Lab technician full_name
  shared_projects: string[];  // R# codes they both logged time to
  shared_hours: number;       // Sum of the TECH's hours on those shared projects
  month: string;              // YYYY-MM
}

/**
 * Project timeline (planned vs actual over time).
 */
export interface ProjectTimeline {
  month: string;
  planned_hours: number;      // From PlannedProjectMonth
  actual_hours: number;       // From ActualHoursSummary
}

/**
 * User-configurable anomaly detection threshold.
 * Persisted in Dexie; overrides defaults from ANOMALY_RULES registry.
 */
export interface AnomalyThreshold {
  ruleId: string;                          // Primary key — matches anomaly rule IDs
  enabled: boolean;                        // Toggle this rule on/off
  thresholds: Record<string, number>;      // Named threshold values for this rule
  severity: 'info' | 'warning' | 'alert';  // User can adjust severity
}

// ============================================================
// KPI ENGINE
// ============================================================

export type KPICardKey =
  | 'teamUtilization'
  | 'npdFocus'
  | 'firefightingLoad'
  | 'activeEngineers'
  | 'totalHoursLogged'
  | 'projectsTouched'
  | 'busFactorRisk'
  | 'focusScore'
  | 'meetingTaxHours'
  | 'labUtilization'
  | 'taskCompletionRate'
  | 'adminOverhead'
  | 'sustainingLoad'
  | 'unplannedSustainingPct'
  | 'avgHoursPerEngineer'
  | 'loadSpread'
  | 'deepWorkRatio';

export interface KPIResults {
  // Current 6
  teamUtilization: number;
  npdFocus: number;
  firefightingLoad: number;
  activeEngineers: number;
  totalHoursLogged: number;
  projectsTouched: number;

  // Extended pool
  busFactorRisk: number;
  focusScore: number;
  meetingTaxHours: number;
  labUtilization: number;
  taskCompletionRate: number;
  adminOverhead: number;
  sustainingLoad: number;
  unplannedSustainingPct: number;
  avgHoursPerEngineer: number;
  loadSpread: number;
  deepWorkRatio: number;

  // Raw hour values (consumed by narrative for sentence construction)
  npdHours: number;
  sustainingHours: number;
  sprintHours: number;
  firefightingHours: number;
}

// ============================================================
// KPI HISTORY
// ============================================================

/**
 * A point-in-time snapshot of all KPI values for a given month/project filter.
 * Stored in Dexie for trend analysis and sparkline rendering.
 */
export interface KPISnapshot {
  id?: number;                   // auto-increment
  month: string;                 // "2026-01"
  project_filter: string;        // "" for all-projects, or "R1518" etc.
  computed_at: string;           // ISO datetime
  results: KPIResults;           // The full KPI results object
}

// ============================================================
// ANOMALY HISTORY
// ============================================================

export type AnomalyStatus = 'new' | 'recurring' | 'resolved';

/**
 * Persisted anomaly with a stable composite ID for cross-month diffing.
 */
export interface StoredAnomaly {
  anomaly_id: string;         // "ruleId::subject" composite key
  type: string;
  severity: string;
  title: string;
  detail: string;
  person?: string;
  projectId?: string;
  ruleId: string;
}

/**
 * Snapshot of anomalies for a given month/project filter.
 * Stored in Dexie for cross-month comparison.
 */
export interface AnomalySnapshot {
  id?: number;                // auto-increment
  month: string;              // "2026-01"
  project_filter: string;     // "" for all-projects
  computed_at: string;        // ISO datetime
  anomalies: StoredAnomaly[];
}

/**
 * Anomaly enriched with cross-month status info.
 */
export interface AnomalyWithStatus extends StoredAnomaly {
  status: AnomalyStatus;
  recurring_months?: number;  // How many consecutive prior months this appeared
}

// ============================================================
// SCENARIO PLANNING
// ============================================================

/**
 * A named what-if planning scenario (envelope/header).
 */
export interface PlanningScenario {
  id?: number;
  name: string;                        // "New K5.6 Sprinkler"
  description: string;                 // optional notes
  created_at: string;                  // ISO datetime
  updated_at: string;                  // ISO datetime
  status: 'draft' | 'saved' | 'archived';
  base_month_start: string;            // YYYY-MM — scenario time window
  base_month_end: string;              // YYYY-MM
  source_template_project?: string;    // R# of project used as hours template (if any)
  estimated_total_hours?: number;      // user's total estimate
}

/**
 * A hypothetical allocation row belonging to a scenario.
 * Mirrors PlannedAllocation to enable direct overlay into computeCapacityForecast.
 */
export interface ScenarioAllocation {
  id?: number;
  scenario_id: number;                 // FK → PlanningScenario.id
  month: string;                       // YYYY-MM
  project_id: string;                  // scenario project label or "SCENARIO-{id}"
  engineer: string;                    // full_name
  allocation_pct: number;              // 0-1
  planned_hours: number;
}

/**
 * Frozen snapshot of a scenario's computed capacity forecast.
 * Stored for fast scenario comparison without re-querying.
 */
export interface ScenarioSnapshot {
  id?: number;
  scenario_id: number;                 // FK → PlanningScenario.id
  computed_at: string;                 // ISO datetime
  entries: CapacityForecastEntry[];    // frozen forecast result
  summaries: CapacityForecastSummary[];
}

// ============================================================
// CAPACITY FORECAST
// ============================================================

/**
 * A single cell in the capacity forecast heatmap.
 */
export interface CapacityForecastEntry {
  engineer: string;
  month: string;              // YYYY-MM
  allocated_hours: number;    // Sum of planned allocations
  capacity_hours: number;     // Engineer's capacity
  utilization_pct: number;    // allocated / capacity
}

/**
 * Summary stats for a forecast month column.
 */
export interface CapacityForecastSummary {
  month: string;
  total_allocated: number;
  total_capacity: number;
  headcount: number;
  avg_utilization: number;
  over_allocated_count: number;   // Engineers > 100%
  under_allocated_count: number;  // Engineers < 50%
}

// ============================================================
// NARRATIVE CONFIGURATION
// ============================================================

/**
 * Observation keys that can appear in narrative summaries.
 */
export type NarrativeObservationKey =
  | 'firefightingLoad'
  | 'busFactorRisks'
  | 'focusFragmentation'
  | 'meetingTax'
  | 'overtimeIndicators'
  | 'projectOverBurn'
  | 'projectUnderBurn'
  | 'labTechContribution';

/**
 * User-configurable narrative summary settings.
 * Persisted in Dexie as a singleton (id=1).
 */
export interface NarrativeConfig {
  id: number;                                            // Always 1 (singleton)
  observations: Record<NarrativeObservationKey, boolean>;
  observationPriority: NarrativeObservationKey[];        // Ordered, highest priority first
  nameIndividuals: boolean;
  includeSpecificNumbers: boolean;
  includeTrendComparisons: boolean;
  maxObservations: number;                               // 1-3
  customOpening: string;
  customClosing: string;
}

// ============================================================
// WEEKLY UPDATES
// ============================================================

export type UpdateStatus = 'on-track' | 'at-risk' | 'blocked' | 'complete';

export interface ActionItem {
  id: string;               // crypto.randomUUID() for stable identity
  text: string;
  owner: string;            // engineer name (or empty string)
  due_date: string;         // YYYY-MM-DD (or empty string)
  done: boolean;
  carried_from?: string;    // week_ending of original creation
}

export interface TaskSummary {
  task_name: string;
  task_id: number;
  hours: number;
  is_done: boolean;
  activity: string;         // ActivityType value
  contributors: string[];   // full_name list who worked this task
}

export interface WeeklyAutoSummary {
  total_hours: number;
  engineer_hours: number;
  lab_hours: number;
  contributors: string[];       // all people who worked the project this week
  tasks: TaskSummary[];         // per-task breakdown with completion status
  tasks_completed: string[];    // task names where is_done = true
  activities: string[];         // distinct activity types
}

export interface WeeklyUpdate {
  id?: number;
  project_id: string;
  week_ending: string;       // YYYY-MM-DD (always Friday)
  status: UpdateStatus;
  completed_summary: string; // snapshot at save time
  action_items: ActionItem[];
  next_milestones: string;
  notes: string;
  updated_at: string;
  updated_by: string;
}
