import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useConfig } from '../hooks/useConfig';
import { formatMonth } from '../utils/format';
import { fromDbMonth } from '../utils/monthRange';
import type { DateRange } from '../types';

// Standard LiquidPlanner activity types
const ACTIVITY_TYPES = ['Engineering', 'Lab - Testing', 'PTO', 'Project Management'];

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

  // ── Activity filter (Engineer Profile view only) ──
  showActivityFilter?: boolean;
  activityValue?: string;
  onActivityChange?: (activity: string) => void;
}

function encodeRangeKey(range: DateRange): string {
  return `${range.type}:${range.months.join(',')}`;
}

function buildDateRangeOptions(availableMonths: string[]) {
  if (availableMonths.length === 0) {
    return { years: [] as string[], byYear: new Map<string, { yearRange: DateRange; quarters: DateRange[]; months: DateRange[] }>() };
  }

  const sorted = [...availableMonths].sort();
  const years = [...new Set(sorted.map(m => m.slice(0, 4)))].sort().reverse();

  const byYear = new Map<string, { yearRange: DateRange; quarters: DateRange[]; months: DateRange[] }>();

  for (const year of years) {
    const yearMonths = sorted.filter(m => m.startsWith(year));

    const monthOptions: DateRange[] = yearMonths.map(m => ({
      type: 'single' as const,
      months: [m],
      label: formatMonth(m),
    }));

    const quarterOptions: DateRange[] = [];
    for (let q = 1; q <= 4; q++) {
      const qMonths = yearMonths.filter(m => {
        const mon = parseInt(m.slice(5));
        return mon >= (q - 1) * 3 + 1 && mon <= q * 3;
      });
      if (qMonths.length > 1) {
        quarterOptions.push({
          type: 'quarter' as const,
          months: qMonths,
          label: `Q${q} ${year}`,
        });
      }
    }

    const yearRange: DateRange = {
      type: 'year' as const,
      months: yearMonths,
      label: `${year} (all months)`,
    };

    byYear.set(year, { yearRange, quarters: quarterOptions, months: monthOptions });
  }

  return { years, byYear };
}

export function ViewHeader({
  title,
  showEngineerFilter = false,
  onExport,
  onProjectChange,
  engineerValue,
  onEngineerChange,
  showActivityFilter = false,
  activityValue,
  onActivityChange,
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

  const { years, byYear } = buildDateRangeOptions(months);

  const currentRange = config?.selected_date_range;
  const currentKey = currentRange
    ? encodeRangeKey(currentRange)
    : config?.selected_month
      ? `single:${config.selected_month}`
      : '';

  const handleRangeChange = (value: string) => {
    if (!value) {
      updateConfig({ selected_month: '', selected_date_range: undefined });
      return;
    }
    const colonIdx = value.indexOf(':');
    const type = value.slice(0, colonIdx) as DateRange['type'];
    const monthsCsv = value.slice(colonIdx + 1);
    const rangeMonths = monthsCsv.split(',');

    if (type === 'single') {
      updateConfig({ selected_month: rangeMonths[0], selected_date_range: undefined });
    } else {
      const labelMap: Record<string, string> = {};
      for (const [, data] of byYear) {
        if (data.yearRange) labelMap[encodeRangeKey(data.yearRange)] = data.yearRange.label;
        for (const q of data.quarters) labelMap[encodeRangeKey(q)] = q.label;
      }
      const range: DateRange = {
        type,
        months: rangeMonths,
        label: labelMap[value] || `${rangeMonths.length} months`,
      };
      updateConfig({ selected_month: rangeMonths[rangeMonths.length - 1], selected_date_range: range });
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
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold text-[var(--text-primary)]">{title}</h1>
        <div className="h-5 w-px bg-[var(--border-default)]" />

        {/* Date range selector */}
        <select value={currentKey} onChange={(e) => handleRangeChange(e.target.value)} className={selectClass}>
          <option value="">All Time</option>
          {years.map(year => {
            const data = byYear.get(year);
            if (!data) return null;
            return (
              <optgroup key={year} label={year}>
                {data.yearRange.months.length > 1 && (
                  <option value={encodeRangeKey(data.yearRange)}>{data.yearRange.label}</option>
                )}
                {data.quarters.map(q => (
                  <option key={q.label} value={encodeRangeKey(q)}>{q.label}</option>
                ))}
                {data.months.map(m => (
                  <option key={m.months[0]} value={encodeRangeKey(m)}>{m.label}</option>
                ))}
              </optgroup>
            );
          })}
        </select>

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

        {/* Activity filter — engineer profile view only */}
        {showActivityFilter && (
          <select
            value={activityValue ?? ''}
            onChange={(e) => onActivityChange?.(e.target.value)}
            className={selectClass}
          >
            <option value="">All Activities</option>
            {ACTIVITY_TYPES.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
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
