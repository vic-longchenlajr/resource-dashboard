import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useFilters } from '../../context/ViewFilterContext';
import { useKPIHistory } from '../../hooks/useKPIHistory';
import { KPI_REGISTRY, formatKPIValue } from '../../aggregation/kpiRegistry';
import type { KPIFormat } from '../../aggregation/kpiRegistry';
import { Sparkline } from '../../charts/Sparkline';
import { DEFAULT_KPI_CARDS } from '../../aggregation/kpiRegistry';
import type { KPICardKey, KPISnapshot } from '../../types';
import { formatMonth } from '../../utils/format';

// ── Delta Calculation ──

interface Delta {
  value: number;
  percent: number;
  direction: 'up' | 'down' | 'flat';
  isGood: boolean;
}

function computeDelta(
  history: KPISnapshot[],
  currentMonth: string,
  kpiKey: KPICardKey,
): Delta | null {
  const def = KPI_REGISTRY[kpiKey];
  if (!def || history.length < 2) return null;

  const currentSnap = history.find(s => s.month === currentMonth);
  if (!currentSnap) return null;

  // Find the previous month's snapshot (the one before current in sorted order)
  const currentIdx = history.findIndex(s => s.month === currentMonth);
  if (currentIdx <= 0) return null;

  const prevSnap = history[currentIdx - 1];
  const current = def.getValue(currentSnap.results);
  const prev = def.getValue(prevSnap.results);

  const diff = current - prev;
  const percent = prev !== 0 ? (diff / Math.abs(prev)) * 100 : 0;

  const direction: 'up' | 'down' | 'flat' =
    Math.abs(diff) < 0.001 ? 'flat' : diff > 0 ? 'up' : 'down';

  // invertColor means lower is better → "down" is good
  const isGood = def.thresholds.invertColor
    ? direction === 'down'
    : direction === 'up';

  return { value: diff, percent, direction, isGood };
}

// ── Formatting Helpers ──

function formatDelta(delta: Delta, format: KPIFormat): string {
  const absPercent = Math.abs(Math.round(delta.percent));
  if (delta.direction === 'flat') return '—';
  const arrow = delta.direction === 'up' ? '↑' : '↓';
  switch (format) {
    case 'percent':
      return `${arrow} ${Math.abs(Math.round(delta.value * 100))}pp`;
    case 'hours':
      return `${arrow} ${Math.abs(delta.value).toFixed(0)}h`;
    case 'count':
      return `${arrow} ${Math.abs(Math.round(delta.value))}`;
    case 'decimal':
      return `${arrow} ${Math.abs(delta.value).toFixed(1)}`;
    default:
      return `${arrow} ${absPercent}%`;
  }
}

function getSparklineColor(kpiKey: KPICardKey): string {
  const def = KPI_REGISTRY[kpiKey];
  switch (def?.category) {
    case 'utilization': return '#2563eb';   // blue
    case 'workMix': return '#0d9488';       // teal
    case 'teamHealth': return '#7c3aed';    // purple
    case 'throughput': return '#d97706';     // amber
    default: return '#2563eb';
  }
}

function formatCurrentValue(value: number, format: KPIFormat): string {
  const formatted = formatKPIValue(value, format);
  switch (format) {
    case 'percent': return `${formatted}%`;
    case 'hours': return `${formatted}h`;
    default: return formatted;
  }
}

// ── Main Panel ──

export function KPITrendPanel() {
  const { selectedMonth, selectedProject } = useFilters();
  const config = useLiveQuery(() => db.config.get(1));
  const kpiCards: KPICardKey[] = config?.kpi_cards ?? DEFAULT_KPI_CARDS;

  const history = useKPIHistory(selectedProject);

  if (!selectedMonth) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        Select a month to view KPI trends
      </div>
    );
  }

  if (history === undefined) {
    return (
      <div className="animate-pulse grid grid-cols-2 lg:grid-cols-3 gap-3">
        {kpiCards.slice(0, 6).map((_, i) => (
          <div key={i} className="h-24 bg-[var(--border-subtle)] rounded-lg" />
        ))}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        <p className="text-[13px]">No KPI history available yet.</p>
        <p className="text-[11px] mt-1">KPI snapshots are created automatically after each import.</p>
      </div>
    );
  }

  // Filter cards: when a single project is selected, hide non-applicable KPIs
  const visibleCards = selectedProject
    ? kpiCards.filter(k => KPI_REGISTRY[k]?.applicableToSingleProject)
    : kpiCards;

  // Current month's snapshot
  const currentSnap = history.find(s => s.month === selectedMonth);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {visibleCards.map(key => {
        const def = KPI_REGISTRY[key];
        if (!def) return null;

        const currentValue = currentSnap ? def.getValue(currentSnap.results) : null;
        const delta = computeDelta(history, selectedMonth, key);
        const color = getSparklineColor(key);

        // Build sparkline data from history
        const sparkData = history.map(snap => ({
          month: formatMonth(snap.month),
          value: def.getValue(snap.results),
        }));

        return (
          <div
            key={key}
            className="bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-lg p-3 flex flex-col gap-1.5"
          >
            {/* Header row: label + delta */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wide truncate">
                {def.shortLabel}
              </span>
              {delta && delta.direction !== 'flat' && (
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: delta.isGood ? '#16a34a' : '#dc2626' }}
                >
                  {formatDelta(delta, def.format)}
                </span>
              )}
            </div>

            {/* Current value */}
            <div className="text-[20px] font-bold text-[var(--text-primary)] leading-none">
              {currentValue != null
                ? formatCurrentValue(currentValue, def.format)
                : '—'}
            </div>

            {/* Sparkline */}
            <Sparkline
              data={sparkData}
              color={color}
              height={40}
              format={def.format}
            />
          </div>
        );
      })}
    </div>
  );
}
