import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useScenarios } from '../../hooks/useScenarios';
import {
  extractProjectTemplate,
  applyTemplateToScenario,
  scenarioAllocationsToOverlay,
} from '../../aggregation/scenarioTemplates';
import { rankEngineersForScenario } from '../../aggregation/scenarioRanking';
import type { EngineerFitResult } from '../../aggregation/scenarioRanking';
import { computeCapacityForecast } from '../../aggregation/capacityForecast';
import { Heatmap } from '../../charts/Heatmap';
import { formatPercent, formatHours, formatMonth } from '../../utils/format';
import { monthsBetween } from '../MonthRangePicker';
import type {
  PlanningScenario,
  ScenarioAllocation,
  CapacityForecastEntry,
  CapacityForecastSummary,
} from '../../types';

// ─────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────

function forecastColor(pct: number): string {
  if (pct === 0) return '#f8fafc';
  if (pct < 0.5) return '#e2e8f0';
  if (pct < 0.7) return '#93c5fd';
  if (pct <= 1.0) return '#86efac';
  if (pct <= 1.2) return '#fbbf24';
  return '#ef4444';
}

function StatusBadge({ status }: { status: PlanningScenario['status'] }) {
  const cls =
    status === 'draft'
      ? 'bg-yellow-100 text-yellow-700'
      : status === 'saved'
      ? 'bg-green-100 text-green-700'
      : 'bg-gray-100 text-gray-500';
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'danger-ghost';
function Btn({
  children,
  onClick,
  disabled = false,
  variant = 'primary',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: BtnVariant;
}) {
  const cls =
    variant === 'primary'
      ? 'bg-[var(--accent)] text-white hover:opacity-90'
      : variant === 'secondary'
      ? 'text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-row-hover)]'
      : variant === 'danger'
      ? 'bg-red-500 text-white hover:bg-red-600'
      : 'text-red-500 border border-red-200 hover:bg-red-50';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 text-[12px] font-medium rounded-lg transition-colors ${cls} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-[var(--border-default)] rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-[var(--bg-table-header)] border-b border-[var(--border-default)]">
        <h3 className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
          {title}
        </h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-medium text-[var(--text-muted)] mb-1">{children}</p>;
}

const inputCls =
  'w-full px-2.5 py-1.5 text-[12px] border border-[var(--border-default)] rounded bg-white text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]';

// ─────────────────────────────────────────────────────────────
// Scenario List
// ─────────────────────────────────────────────────────────────

interface ListProps {
  scenarios: PlanningScenario[];
  onCreate: () => void;
  onSelect: (id: number) => void;
  onDuplicate: (id: number) => void;
  onArchive: (id: number) => void;
}

function ScenarioList({ scenarios, onCreate, onSelect, onDuplicate, onArchive }: ListProps) {
  const active = scenarios.filter(s => s.status !== 'archived');
  const archived = scenarios.filter(s => s.status === 'archived');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[var(--text-muted)]">
          {active.length === 0
            ? 'No scenarios yet.'
            : `${active.length} active scenario${active.length !== 1 ? 's' : ''}`}
        </p>
        <Btn onClick={onCreate}>+ New Scenario</Btn>
      </div>

      {active.length === 0 && (
        <div className="text-center py-10 border border-dashed border-[var(--border-default)] rounded-lg">
          <p className="text-[13px] text-[var(--text-muted)]">
            Model a hypothetical project against real team capacity.
          </p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            Create a scenario, load a historical template, and see the impact instantly.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {active.map(s => (
          <div
            key={s.id}
            onClick={() => onSelect(s.id!)}
            className="flex items-center gap-3 p-3 bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-lg cursor-pointer hover:border-[var(--accent)] transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                  {s.name}
                </span>
                <StatusBadge status={s.status} />
              </div>
              {s.description && (
                <p className="text-[11px] text-[var(--text-muted)] truncate">{s.description}</p>
              )}
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {s.base_month_start && s.base_month_end
                  ? `${formatMonth(s.base_month_start)} → ${formatMonth(s.base_month_end)}`
                  : 'No date range'}
                {s.estimated_total_hours
                  ? ` · ~${formatHours(s.estimated_total_hours)}h target`
                  : ''}
                {s.source_template_project
                  ? ` · template: ${s.source_template_project}`
                  : ''}
              </p>
            </div>
            <div
              className="flex gap-1.5 flex-shrink-0"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => onDuplicate(s.id!)}
                className="px-2 py-1 text-[11px] text-[var(--text-muted)] border border-[var(--border-default)] rounded hover:bg-[var(--bg-row-hover)] transition-colors"
              >
                Copy
              </button>
              <button
                onClick={() => onArchive(s.id!)}
                className="px-2 py-1 text-[11px] text-[var(--text-muted)] border border-[var(--border-default)] rounded hover:bg-[var(--bg-row-hover)] transition-colors"
              >
                Archive
              </button>
            </div>
          </div>
        ))}
      </div>

      {archived.length > 0 && (
        <details className="mt-1">
          <summary className="text-[11px] text-[var(--text-muted)] cursor-pointer select-none hover:text-[var(--text-primary)]">
            {archived.length} archived
          </summary>
          <div className="mt-2 pl-3 border-l border-[var(--border-subtle)] space-y-1">
            {archived.map(s => (
              <div key={s.id} className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                <span>{s.name}</span>
                <button
                  onClick={() => onSelect(s.id!)}
                  className="underline hover:text-[var(--text-primary)]"
                >
                  View
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Scenario Editor
// ─────────────────────────────────────────────────────────────

interface EditorProps {
  scenario: PlanningScenario;
  onBack: () => void;
  onDelete: (id: number) => void;
}

function ScenarioEditor({ scenario, onBack, onDelete }: EditorProps) {
  const {
    updateScenario,
    saveScenario,
    archiveScenario,
    duplicateScenario,
  } = useScenarios();

  // Form state (basics section)
  const [name, setName] = useState(scenario.name);
  const [description, setDescription] = useState(scenario.description);
  const [startMonth, setStartMonth] = useState(scenario.base_month_start);
  const [endMonth, setEndMonth] = useState(scenario.base_month_end);
  const [sourceProject, setSourceProject] = useState(scenario.source_template_project ?? '');
  const [estimatedHours, setEstimatedHours] = useState(
    scenario.estimated_total_hours != null ? String(scenario.estimated_total_hours) : '',
  );

  // Async UI state
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateMsg, setTemplateMsg] = useState('');
  const [rankings, setRankings] = useState<EngineerFitResult[]>([]);
  const [rankingsLoading, setRankingsLoading] = useState(false);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactData, setImpactData] = useState<{
    entries: CapacityForecastEntry[];
    summaries: CapacityForecastSummary[];
    scenarioMonths: Set<string>;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [duplicateMsg, setDuplicateMsg] = useState('');

  // Reactive data
  const projects = useLiveQuery(async () => {
    const all = await db.projects.toArray();
    return all
      .filter(p => p.type !== 'Admin' && p.type !== 'OOO')
      .sort((a, b) => a.project_id.localeCompare(b.project_id));
  }, []);

  const allocations = useLiveQuery<ScenarioAllocation[]>(
    () =>
      scenario.id
        ? db.scenarioAllocations.where('scenario_id').equals(scenario.id).toArray()
        : Promise.resolve([] as ScenarioAllocation[]),
    [scenario.id],
  ) ?? [];

  // Derived
  const scenarioMonths =
    startMonth && endMonth ? monthsBetween(startMonth, endMonth) : [];

  const monthTotals = new Map<string, number>();
  const engineerTotals = new Map<string, number>();
  for (const a of allocations) {
    monthTotals.set(a.month, (monthTotals.get(a.month) ?? 0) + a.planned_hours);
    engineerTotals.set(a.engineer, (engineerTotals.get(a.engineer) ?? 0) + a.planned_hours);
  }
  const sortedAllocMonths = [...monthTotals.keys()].sort();
  const maxMonthHours = Math.max(1, ...monthTotals.values());
  const totalAllocHours = [...monthTotals.values()].reduce((s, v) => s + v, 0);
  const assignedEngineers = new Set(engineerTotals.keys());

  // ── Handlers ──────────────────────────────────────────────

  async function handleUpdateDetails() {
    await updateScenario(scenario.id!, {
      name,
      description,
      base_month_start: startMonth,
      base_month_end: endMonth,
      source_template_project: sourceProject || undefined,
      estimated_total_hours: estimatedHours ? parseFloat(estimatedHours) : undefined,
    });
  }

  async function handleLoadTemplate() {
    if (!sourceProject || !scenario.id || !startMonth) return;
    setTemplateLoading(true);
    setTemplateMsg('');
    try {
      const template = await extractProjectTemplate(sourceProject);
      if (!template) {
        setTemplateMsg('No historical data found for this project.');
        return;
      }
      const target = estimatedHours ? parseFloat(estimatedHours) : undefined;
      await applyTemplateToScenario(scenario.id, template, startMonth, target);
      setTemplateMsg(
        `Loaded ${template.engineer_distribution.length} engineers, ${template.duration_months} months from ${sourceProject}.`,
      );
      setImpactData(null);
    } finally {
      setTemplateLoading(false);
    }
  }

  async function handleRankEngineers() {
    if (scenarioMonths.length === 0) return;
    setRankingsLoading(true);
    try {
      const results = await rankEngineersForScenario(
        sourceProject || '',
        scenarioMonths,
        [...assignedEngineers],
      );
      setRankings(results);
    } finally {
      setRankingsLoading(false);
    }
  }

  async function handleAssignEngineer(engineer: string) {
    if (!scenario.id || scenarioMonths.length === 0) return;
    const hoursPerMonth =
      totalAllocHours > 0
        ? totalAllocHours / scenarioMonths.length / (assignedEngineers.size + 1)
        : estimatedHours
        ? parseFloat(estimatedHours) / scenarioMonths.length / (assignedEngineers.size + 1)
        : 20;
    const hrs = Math.round(hoursPerMonth * 10) / 10;
    const rows: ScenarioAllocation[] = scenarioMonths.map(month => ({
      scenario_id: scenario.id!,
      month,
      project_id: `SCENARIO-${scenario.id}`,
      engineer,
      allocation_pct: Math.min(hrs / 140, 1),
      planned_hours: hrs,
    }));
    await db.scenarioAllocations.bulkAdd(rows);
    setRankings(prev => prev.filter(r => r.engineer !== engineer));
    setImpactData(null);
  }

  async function handleRemoveEngineer(engineer: string) {
    if (!scenario.id) return;
    await db.scenarioAllocations
      .where('scenario_id')
      .equals(scenario.id)
      .and(a => a.engineer === engineer)
      .delete();
    setImpactData(null);
  }

  async function handleClearAllocations() {
    if (!scenario.id) return;
    await db.scenarioAllocations.where('scenario_id').equals(scenario.id).delete();
    setImpactData(null);
    setRankings([]);
  }

  async function handleComputeImpact() {
    if (!allocations.length || !scenarioMonths.length) return;
    setImpactLoading(true);
    try {
      const overlay = scenarioAllocationsToOverlay(allocations);
      const stored = await db.plannedAllocations.toArray();
      const allMonths = new Set([...stored.map(a => a.month), ...scenarioMonths]);
      const months = [...allMonths].sort();
      const result = await computeCapacityForecast(months, undefined, overlay);
      setImpactData({ ...result, scenarioMonths: new Set(scenarioMonths) });
    } finally {
      setImpactLoading(false);
    }
  }

  async function handleSave() {
    await handleUpdateDetails();
    await saveScenario(scenario.id!);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleDuplicate() {
    const newId = await duplicateScenario(scenario.id!);
    setDuplicateMsg(`Duplicated (id ${newId}). Go back to see it.`);
    setTimeout(() => setDuplicateMsg(''), 4000);
  }

  async function handleArchive() {
    await archiveScenario(scenario.id!);
    onBack();
  }

  async function handleDelete() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    onDelete(scenario.id!);
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onBack}
          className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          ← All Scenarios
        </button>
        <span className="text-[var(--border-default)]">/</span>
        <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
          {scenario.name}
        </span>
        <StatusBadge status={scenario.status} />
      </div>

      {/* ── Section 1: Project Basics ── */}
      <SectionCard title="Project Basics">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <FieldLabel>Scenario Name</FieldLabel>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>Description</FieldLabel>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
            />
          </div>
          <div>
            <FieldLabel>Start Month</FieldLabel>
            <input
              type="month"
              value={startMonth}
              onChange={e => setStartMonth(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <FieldLabel>End Month</FieldLabel>
            <input
              type="month"
              value={endMonth}
              onChange={e => setEndMonth(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <FieldLabel>Source Template Project</FieldLabel>
            <select
              value={sourceProject}
              onChange={e => setSourceProject(e.target.value)}
              className={inputCls}
            >
              <option value="">— None —</option>
              {(projects ?? []).map(p => (
                <option key={p.project_id} value={p.project_id}>
                  {p.project_id} — {p.project_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Target Hours</FieldLabel>
            <input
              type="number"
              value={estimatedHours}
              onChange={e => setEstimatedHours(e.target.value)}
              min={0}
              step={50}
              placeholder="e.g. 1200"
              className={inputCls}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <Btn onClick={handleUpdateDetails}>Update Details</Btn>
          {sourceProject && (
            <Btn
              variant="secondary"
              onClick={handleLoadTemplate}
              disabled={templateLoading || !startMonth}
            >
              {templateLoading ? 'Loading…' : `Load Template from ${sourceProject}`}
            </Btn>
          )}
        </div>
        {templateMsg && (
          <p className="mt-2 text-[11px] text-[var(--status-good,#16a34a)]">{templateMsg}</p>
        )}
      </SectionCard>

      {/* ── Section 2: Monthly Distribution ── */}
      <SectionCard
        title={`Monthly Distribution${totalAllocHours > 0 ? ` · ${formatHours(totalAllocHours)}h total` : ''}`}
      >
        {sortedAllocMonths.length === 0 ? (
          <p className="text-[12px] text-[var(--text-muted)]">
            No allocations yet. Load a template above, or assign engineers below.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              {sortedAllocMonths.map(month => {
                const hrs = monthTotals.get(month) ?? 0;
                return (
                  <div key={month} className="flex items-center gap-2 text-[11px]">
                    <span className="w-16 text-right text-[var(--text-muted)] flex-shrink-0">
                      {formatMonth(month)}
                    </span>
                    <div className="flex-1 bg-[var(--border-subtle)] rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-[var(--accent)]"
                        style={{ width: `${Math.round((hrs / maxMonthHours) * 100)}%` }}
                      />
                    </div>
                    <span className="w-14 text-right text-[var(--text-secondary)] flex-shrink-0">
                      {formatHours(hrs)}h
                    </span>
                  </div>
                );
              })}
            </div>
            {engineerTotals.size > 0 && (
              <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                <p className="text-[11px] font-medium text-[var(--text-secondary)] mb-1.5">
                  By Engineer
                </p>
                <div className="flex flex-wrap gap-2">
                  {[...engineerTotals.entries()]
                    .sort(([, a], [, b]) => b - a)
                    .map(([eng, hrs]) => (
                      <span
                        key={eng}
                        className="text-[11px] px-2 py-0.5 bg-[var(--accent-light)] text-[var(--accent)] rounded-full"
                      >
                        {eng.split(' ')[0]} — {formatHours(hrs)}h
                      </span>
                    ))}
                </div>
              </div>
            )}
            <div className="mt-3">
              <Btn variant="danger-ghost" onClick={handleClearAllocations}>
                Clear All Allocations
              </Btn>
            </div>
          </>
        )}
      </SectionCard>

      {/* ── Section 3: Engineer Assignments ── */}
      <SectionCard
        title={`Engineer Assignments${assignedEngineers.size > 0 ? ` · ${assignedEngineers.size} assigned` : ''}`}
      >
        {/* Currently assigned */}
        {assignedEngineers.size > 0 && (
          <div className="mb-4">
            <p className="text-[11px] font-medium text-[var(--text-secondary)] mb-1.5">Assigned</p>
            <div className="space-y-1">
              {[...engineerTotals.entries()]
                .sort(([, a], [, b]) => b - a)
                .map(([eng, hrs]) => (
                  <div
                    key={eng}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded bg-[var(--accent-light)] text-[12px]"
                  >
                    <span className="text-[var(--text-primary)] font-medium">{eng}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[var(--text-muted)]">{formatHours(hrs)}h</span>
                      <button
                        onClick={() => handleRemoveEngineer(eng)}
                        className="text-[10px] text-red-500 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Rank candidates */}
        <div className="flex items-center gap-3 flex-wrap">
          <Btn
            variant="secondary"
            onClick={handleRankEngineers}
            disabled={rankingsLoading || scenarioMonths.length === 0}
          >
            {rankingsLoading ? 'Ranking…' : 'Rank Available Engineers'}
          </Btn>
          {scenarioMonths.length === 0 && (
            <span className="text-[11px] text-[var(--text-muted)]">Set a date range first.</span>
          )}
        </div>

        {rankings.length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-[11px] font-medium text-[var(--text-secondary)] mb-1.5">
              Available Candidates
            </p>
            {rankings.map(r => (
              <div
                key={r.engineer}
                className="flex items-center gap-2 text-[12px] px-2.5 py-1.5 rounded border border-[var(--border-default)] hover:border-[var(--accent)] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-[var(--text-primary)] truncate">
                      {r.engineer}
                    </span>
                    {r.recommended && (
                      <span className="text-[9px] font-bold px-1 py-0.5 bg-green-100 text-green-700 rounded uppercase">
                        ★ Rec
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 text-[10px] text-[var(--text-muted)] mt-0.5">
                    <span>Fit {Math.round(r.fit_score)}</span>
                    {r.skill_score > 0 && <span>Skill {r.skill_score}</span>}
                    <span>Avail {Math.round(r.availability_pct * 100)}%</span>
                  </div>
                </div>
                <button
                  onClick={() => handleAssignEngineer(r.engineer)}
                  className="px-2.5 py-0.5 text-[11px] font-medium text-white bg-[var(--accent)] rounded hover:opacity-90 flex-shrink-0"
                >
                  Assign
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Section 4: Capacity Impact Preview ── */}
      <SectionCard title="Capacity Impact Preview">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <Btn
            variant="secondary"
            onClick={handleComputeImpact}
            disabled={impactLoading || allocations.length === 0}
          >
            {impactLoading ? 'Computing…' : 'Compute Impact'}
          </Btn>
          {allocations.length === 0 && (
            <span className="text-[11px] text-[var(--text-muted)]">
              Add allocations to preview impact.
            </span>
          )}
        </div>

        {impactData && (
          <div className="space-y-3">
            {/* Summary cards for scenario months only */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {impactData.summaries
                .filter(s => impactData.scenarioMonths.has(s.month))
                .map(s => {
                  const gap = s.total_capacity - s.total_allocated;
                  const over = gap < 0;
                  return (
                    <div
                      key={s.month}
                      className="rounded-lg border border-[var(--border-default)] p-2.5"
                    >
                      <div className="text-[10px] text-[var(--text-muted)] mb-0.5">
                        {formatMonth(s.month)}
                        <span className="ml-1 text-[var(--accent)]">+scenario</span>
                      </div>
                      <div className="text-[14px] font-semibold text-[var(--text-primary)]">
                        {formatPercent(s.avg_utilization)}
                      </div>
                      <div
                        className={`text-[10px] font-medium ${
                          over ? 'text-red-500' : 'text-green-600'
                        }`}
                      >
                        {over
                          ? `${Math.round(Math.abs(gap))}h over`
                          : `${Math.round(gap)}h free`}
                      </div>
                      {s.over_allocated_count > 0 && (
                        <div className="text-[10px] text-amber-500 mt-0.5">
                          {s.over_allocated_count} over-allocated
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* Heatmap */}
            {(() => {
              const months = impactData.summaries.map(s => s.month);
              const engineers = [...new Set(impactData.entries.map(e => e.engineer))].sort();
              const dataMap = new Map<string, number>();
              for (const e of impactData.entries) {
                dataMap.set(`${e.engineer}|${e.month}`, e.utilization_pct);
              }
              return (
                <Heatmap
                  rows={engineers.map(e => ({ key: e, label: e }))}
                  columns={months.map(m => ({ key: m, label: formatMonth(m) }))}
                  data={dataMap}
                  colorFn={forecastColor}
                  formatFn={formatPercent}
                  emptyValue={0}
                  highlightedColumns={impactData.scenarioMonths}
                />
              );
            })()}

            <p className="text-[11px] text-[var(--text-muted)]">
              Highlighted columns include scenario allocations. Gray &lt;50%, blue 50–70%, green 70–100%, yellow &gt;100%, red &gt;120%.
            </p>
          </div>
        )}
      </SectionCard>

      {/* ── Actions ── */}
      <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-default)] flex-wrap">
        <Btn onClick={handleSave}>
          {saved ? '✓ Saved' : scenario.status === 'saved' ? 'Re-save' : 'Save Scenario'}
        </Btn>
        <Btn variant="secondary" onClick={handleDuplicate}>
          Duplicate
        </Btn>
        <Btn variant="secondary" onClick={handleArchive}>
          Archive
        </Btn>
        {duplicateMsg && (
          <span className="text-[11px] text-[var(--text-muted)]">{duplicateMsg}</span>
        )}
        <div className="flex-1" />
        {deleteConfirm ? (
          <>
            <span className="text-[11px] text-red-500">Permanently delete?</span>
            <Btn variant="danger" onClick={handleDelete}>
              Yes, Delete
            </Btn>
            <Btn variant="secondary" onClick={() => setDeleteConfirm(false)}>
              Cancel
            </Btn>
          </>
        ) : (
          <Btn variant="danger-ghost" onClick={() => setDeleteConfirm(true)}>
            Delete
          </Btn>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Top-level export
// ─────────────────────────────────────────────────────────────

export function WhatIfPlannerPanel() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { scenarios, loading, createScenario, deleteScenario, duplicateScenario, archiveScenario } =
    useScenarios();

  // If the selected scenario disappears (deleted/archived externally), go back to list
  useEffect(() => {
    if (selectedId !== null && !scenarios.some(s => s.id === selectedId)) {
      setSelectedId(null);
    }
  }, [scenarios, selectedId]);

  if (loading) {
    return <div className="animate-pulse h-48 bg-[var(--border-subtle)] rounded-lg" />;
  }

  async function handleCreate() {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const id = await createScenario({
      name: 'New Scenario',
      description: '',
      base_month_start: ym,
      base_month_end: ym,
    });
    setSelectedId(id);
  }

  if (selectedId !== null) {
    const scenario = scenarios.find(s => s.id === selectedId);
    if (!scenario) return null;
    return (
      <ScenarioEditor
        key={selectedId}
        scenario={scenario}
        onBack={() => setSelectedId(null)}
        onDelete={async id => {
          await deleteScenario(id);
          setSelectedId(null);
        }}
      />
    );
  }

  return (
    <ScenarioList
      scenarios={scenarios}
      onCreate={handleCreate}
      onSelect={setSelectedId}
      onDuplicate={id => duplicateScenario(id).then(() => {})}
      onArchive={id => archiveScenario(id)}
    />
  );
}
