import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useFilters } from '../../context/ViewFilterContext';
import { computeCapacityForecast } from '../../aggregation/capacityForecast';
import { Heatmap } from '../../charts/Heatmap';
import { formatPercent, formatMonth } from '../../utils/format';
import { fromDbMonth } from '../../utils/monthRange';

/** Capacity-specific color scale: gray < 50%, blue 50-70%, green 70-100%, yellow 100-120%, red > 120% */
function forecastColor(pct: number): string {
  if (pct === 0) return '#f8fafc';
  if (pct < 0.5) return '#e2e8f0';    // Gray — under-allocated
  if (pct < 0.7) return '#93c5fd';    // Blue — light load
  if (pct <= 1.0) return '#86efac';   // Green — healthy
  if (pct <= 1.2) return '#fbbf24';   // Yellow — over-allocated
  return '#ef4444';                    // Red — critically over
}

export function CapacityForecastPanel() {
  const { selectedProject } = useFilters();

  // Determine future months: all months from plannedAllocations that have no timesheet data
  const forecastData = useLiveQuery(async () => {
    const [allocations, timesheets] = await Promise.all([
      db.plannedAllocations.toArray(),
      db.timesheets.toArray(),
    ]);

    // Months that have actual data
    const actualMonths = new Set(timesheets.map(t => fromDbMonth(t.month)));

    // All months from allocations
    const allAllocMonths = new Set(allocations.map(a => a.month));

    // Future months = allocation months not yet in actuals, plus any allocation months for completeness
    // Show all allocation months sorted
    const months = [...allAllocMonths].sort();

    if (months.length === 0) return null;

    // Tag each month as past/future for the UI
    const monthTags = months.map(m => ({
      month: m,
      hasActual: actualMonths.has(m),
    }));

    const result = await computeCapacityForecast(months, selectedProject);
    return { ...result, monthTags };
  }, [selectedProject]);

  if (!forecastData) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        No planned allocations found. Configure in Settings &rarr; Resource Allocations.
      </div>
    );
  }

  const { entries, summaries, monthTags } = forecastData;

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        No allocation data for the current filter.
      </div>
    );
  }

  // Build heatmap data
  const engineers = [...new Set(entries.map(e => e.engineer))].sort();
  const months = monthTags.map(t => t.month);

  const dataMap = new Map<string, number>();
  for (const e of entries) {
    dataMap.set(`${e.engineer}|${e.month}`, e.utilization_pct);
  }

  const rows = engineers.map(e => ({ key: e, label: e }));
  const columns = months.map(m => {
    const tag = monthTags.find(t => t.month === m);
    const label = formatMonth(m);
    return {
      key: m,
      label: tag?.hasActual ? label : `${label} *`,
    };
  });

  // Highlight future-only month columns
  const futureMonths = new Set(monthTags.filter(t => !t.hasActual).map(t => t.month));

  return (
    <div className="space-y-4">
      {/* Capacity gap summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaries.map(s => {
          const gap = s.total_capacity - s.total_allocated;
          const isOver = gap < 0;
          return (
            <div
              key={s.month}
              className="rounded-lg border border-[var(--border-default)] p-3"
            >
              <div className="text-[11px] font-medium text-[var(--text-muted)] mb-1">
                {formatMonth(s.month)}
                {futureMonths.has(s.month) && (
                  <span className="ml-1 text-[var(--accent)]">forecast</span>
                )}
              </div>
              <div className="text-[15px] font-semibold text-[var(--text-primary)]">
                {formatPercent(s.avg_utilization)}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {Math.round(s.total_allocated)}h / {Math.round(s.total_capacity)}h
              </div>
              <div className={`text-[11px] font-medium mt-1 ${isOver ? 'text-[var(--status-danger)]' : 'text-[var(--status-good)]'}`}>
                {isOver ? `${Math.round(Math.abs(gap))}h over` : `${Math.round(gap)}h available`}
              </div>
              {s.over_allocated_count > 0 && (
                <div className="text-[10px] text-[var(--status-warn)] mt-0.5">
                  {s.over_allocated_count} over-allocated
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Heatmap */}
      <Heatmap
        rows={rows}
        columns={columns}
        data={dataMap}
        colorFn={forecastColor}
        formatFn={formatPercent}
        emptyValue={0}
        highlightedColumns={futureMonths}
      />

      {futureMonths.size > 0 && (
        <p className="text-[11px] text-[var(--text-muted)]">
          * Months marked with an asterisk are forecast-only (no actual timesheet data yet).
        </p>
      )}
    </div>
  );
}
