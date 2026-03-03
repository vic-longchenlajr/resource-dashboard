import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useConfig } from '../hooks/useConfig';
import { fromDbMonth } from '../utils/monthRange';
import type { DateRange } from '../types';
import { MonthRangePicker, monthsBetween, computeLabel } from './MonthRangePicker';


interface ViewHeaderProps {
  title: string;
  /** When true, shows an engineer selector instead of a project selector */
  showEngineerFilter?: boolean;
  onExport?: () => void;

  // ── Controlled project filter (for PlanningPage URL-param flow) ──
  /** When provided, called instead of writing directly to Dexie on project change */
  onProjectChange?: (id: string) => void;

  // ── Controlled engineer filter (required when showEngineerFilter=true) ──
  /** Controlled value for the engineer dropdown */
  engineerValue?: string;
  /** Called when user selects a different engineer */
  onEngineerChange?: (name: string) => void;

  // ── Date picker mode ──
  pickerMode?: 'historical' | 'forward';
}

export function ViewHeader({
  title,
  showEngineerFilter = false,
  onExport,
  onProjectChange,
  engineerValue,
  onEngineerChange,
  pickerMode = 'historical',
}: ViewHeaderProps) {
  const { config, updateConfig } = useConfig();

  const projects = useLiveQuery(() => db.projects.toArray()) ?? [];
  const engineers = useLiveQuery(async () => {
    const members = await db.teamMembers.toArray();
    return members.map(m => m.full_name).sort();
  }) ?? [];

  const months = useLiveQuery(async () => {
    const [sheets, allocations] = await Promise.all([
      db.timesheets.toArray(),
      db.plannedAllocations.toArray(),
    ]);
    const monthSet = new Set<string>();
    for (const s of sheets) monthSet.add(fromDbMonth(s.month));
    for (const a of allocations) monthSet.add(a.month);
    return [...monthSet].sort().reverse();
  }) ?? [];

  // Derive picker from/to from persisted config
  const dateRange = config?.selected_date_range;
  const rawMonth = config?.selected_month || null;
  const pickerFrom: string | null = dateRange?.months[0] ?? rawMonth ?? null;
  const pickerTo: string | null =
    dateRange && dateRange.months.length > 0
      ? dateRange.months[dateRange.months.length - 1]
      : rawMonth ?? null;

  const handlePickerChange = (newFrom: string | null, newTo: string | null) => {
    if (!newFrom && !newTo) {
      updateConfig({ selected_month: '', selected_date_range: undefined });
    } else if (!newFrom || !newTo || newFrom === newTo) {
      const m = newFrom ?? newTo ?? '';
      updateConfig({ selected_month: m, selected_date_range: undefined });
    } else {
      const rangeMonths = monthsBetween(newFrom, newTo);
      const label = computeLabel(newFrom, newTo);
      const range: DateRange = { type: 'range', months: rangeMonths, label };
      updateConfig({ selected_month: newTo, selected_date_range: range });
    }
  };

  const handleProjectSelect = (id: string) => {
    if (onProjectChange) {
      onProjectChange(id); // caller handles Dexie + navigation
    } else {
      updateConfig({ selected_project: id });
    }
  };

  const selectClass = 'text-[13px] font-medium bg-white border border-[var(--border-input)] rounded-md px-3 py-1.5 text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-focus-ring)] focus:border-[var(--border-focus)]';

  return (
    <div className="flex items-center justify-between mb-4">
      {/* Left: title + filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-lg font-bold text-[var(--text-primary)]">{title}</h1>
        <div className="h-5 w-px bg-[var(--border-default)]" />

        {/* Date range picker */}
        <MonthRangePicker
          from={pickerFrom}
          to={pickerTo}
          onChange={handlePickerChange}
          availableMonths={months}
          mode={pickerMode}
        />

        {/* Project or engineer selector */}
        {showEngineerFilter ? (
          <select
            value={engineerValue ?? ''}
            onChange={(e) => onEngineerChange?.(e.target.value)}
            className={selectClass}
          >
            <option value="">Select Engineer…</option>
            {engineers.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        ) : (
          <select
            value={config?.selected_project ?? ''}
            onChange={(e) => handleProjectSelect(e.target.value)}
            className={selectClass}
          >
            <option value="">All Projects</option>
            <optgroup label="NPD">
              {projects.filter(p => p.type === 'NPD').map(p => (
                <option key={p.project_id} value={p.project_id}>
                  {p.project_id} - {p.project_name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Sustaining">
              {projects.filter(p => p.type === 'Sustaining').map(p => (
                <option key={p.project_id} value={p.project_id}>
                  {p.project_id} - {p.project_name}
                </option>
              ))}
            </optgroup>
          </select>
        )}


      </div>

      {/* Right: actions */}
      {onExport && (
        <div className="flex items-center gap-2">
          <button
            onClick={onExport}
            className="text-[13px] font-medium px-3 py-1.5 rounded-md text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors"
          >
            Export
          </button>
        </div>
      )}
    </div>
  );
}
