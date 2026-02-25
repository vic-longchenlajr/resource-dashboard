import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { getAnomaliesWithStatus } from '../../aggregation/anomalyHistory';
import { computeAnomalies } from '../../aggregation/anomalies';
import { ANOMALY_RULES } from '../../aggregation/anomalyRules';
import type { AnomalyWithStatus, AnomalyStatus } from '../../types';
import type { AnomalySeverity } from '../../aggregation/anomalies';
import { useFilters } from '../../context/ViewFilterContext';

const SEVERITY_STYLES: Record<AnomalySeverity, { bg: string; border: string; icon: string; text: string }> = {
  alert: {
    bg: 'var(--status-danger-bg)',
    border: 'var(--status-danger-border)',
    icon: 'var(--status-danger)',
    text: 'var(--status-danger)',
  },
  warning: {
    bg: 'var(--status-warn-bg)',
    border: 'var(--status-warn-border)',
    icon: 'var(--status-warn)',
    text: 'var(--status-warn)',
  },
  info: {
    bg: 'var(--accent-light)',
    border: 'var(--accent)',
    icon: 'var(--accent)',
    text: 'var(--accent)',
  },
};

const STATUS_BADGE: Record<AnomalyStatus, { label: string; bg: string; text: string }> = {
  new: { label: 'NEW', bg: '#dbeafe', text: '#2563eb' },
  recurring: { label: 'RECURRING', bg: '#fef3c7', text: '#d97706' },
  resolved: { label: 'RESOLVED', bg: '#dcfce7', text: '#16a34a' },
};

const COLLAPSED_COUNT = 5;

export function AnomalyAlertsPanel() {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const { monthFilter, selectedMonth, selectedProject, isRange } = useFilters();

  const anomalies = useLiveQuery(async () => {
    // Anomalies stay single-month for historical comparison
    if (!selectedMonth || isRange) return null;

    // Try to get status-enriched anomalies from history
    const withStatus = await getAnomaliesWithStatus(selectedMonth, selectedProject);
    if (withStatus.length > 0) return withStatus;

    // Fallback: compute live (no history yet), all treated as new
    const live = await computeAnomalies(selectedMonth, selectedProject);
    return live.map(a => ({
      anomaly_id: `${a.ruleId}::${a.person || a.projectId || 'global'}`,
      type: a.type,
      severity: a.severity,
      title: a.title,
      detail: a.detail,
      person: a.person,
      projectId: a.projectId,
      ruleId: a.ruleId,
      status: 'new' as AnomalyStatus,
    })) as AnomalyWithStatus[];
  }, [selectedMonth, selectedProject, isRange]);

  if (!monthFilter) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">
        Select a month to view anomalies
      </div>
    );
  }

  if (isRange) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">
        Anomaly detection is available for individual months. Select a specific month to view.
      </div>
    );
  }

  if (!anomalies) {
    return (
      <div className="animate-pulse h-32 bg-[var(--border-subtle)] rounded-lg"></div>
    );
  }

  // Split into active and resolved
  const active = anomalies.filter(a => a.status !== 'resolved');
  const resolved = anomalies.filter(a => a.status === 'resolved');

  if (active.length === 0 && resolved.length === 0) {
    return (
      <div className="flex items-center gap-2 py-6 justify-center text-[var(--status-good)]">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-[13px] font-medium">No anomalies detected this month</span>
      </div>
    );
  }

  const visible = showAll ? active : active.slice(0, COLLAPSED_COUNT);
  const hiddenCount = active.length - COLLAPSED_COUNT;

  const severityBreakdown = (['alert', 'warning', 'info'] as const).map(severity => {
    const items = active.filter(a => a.severity === severity);
    const newCount = items.filter(a => a.status === 'new').length;
    const recurringCount = items.filter(a => a.status === 'recurring').length;
    return { severity, total: items.length, newCount, recurringCount };
  }).filter(s => s.total > 0);

  const severityBadgeStyles: Record<string, { bg: string; color: string }> = {
    alert: { bg: 'var(--status-danger-bg)', color: 'var(--status-danger)' },
    warning: { bg: 'var(--status-warn-bg)', color: 'var(--status-warn)' },
    info: { bg: 'var(--accent-light)', color: 'var(--accent)' },
  };

  return (
    <div className="space-y-3">
      {/* Summary badges */}
      <div className="flex items-center gap-3 text-[11px] font-medium flex-wrap">
        {severityBreakdown.map(({ severity, total, newCount, recurringCount }) => {
          const style = severityBadgeStyles[severity];
          const label = severity === 'info' ? 'info' : `${severity}${total > 1 ? 's' : ''}`;
          const parts: string[] = [];
          if (recurringCount > 0) parts.push(`${recurringCount} recurring`);
          if (newCount > 0) parts.push(`${newCount} new`);
          return (
            <span key={severity} className="px-2 py-0.5 rounded-full" style={{ backgroundColor: style.bg, color: style.color }}>
              {total} {label}{parts.length > 0 && ` (${parts.join(', ')})`}
            </span>
          );
        })}
        {resolved.length > 0 && (
          <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: STATUS_BADGE.resolved.bg, color: STATUS_BADGE.resolved.text }}>
            {resolved.length} resolved
          </span>
        )}
      </div>

      {/* Active alert cards */}
      <div className="space-y-2">
        {visible.map((anomaly, i) => (
          <AnomalyCard
            key={anomaly.anomaly_id}
            anomaly={anomaly}
            index={i}
            expandedIndex={expandedIndex}
            onToggleExpand={setExpandedIndex}
            onNavigate={navigate}
          />
        ))}
      </div>

      {/* Show all toggle */}
      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-[12px] font-medium text-[var(--accent)] hover:underline"
        >
          {showAll ? 'Show less' : `Show all (${hiddenCount} more)`}
        </button>
      )}

      {/* Resolved section (collapsible) */}
      {resolved.length > 0 && (
        <div className="border-t border-[var(--border-subtle)] pt-3 mt-3">
          <button
            onClick={() => setShowResolved(!showResolved)}
            className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <svg
              className={`w-3 h-3 transition-transform ${showResolved ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {resolved.length} resolved from previous month
          </button>
          {showResolved && (
            <div className="mt-2 space-y-2 opacity-60">
              {resolved.map(anomaly => (
                <div
                  key={anomaly.anomaly_id}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-table-header)] p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[var(--text-secondary)] line-through">
                        {anomaly.title}
                      </p>
                      <p className="text-[11px] mt-0.5 text-[var(--text-muted)]">
                        {anomaly.detail}
                      </p>
                    </div>
                    <span
                      className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                      style={{ backgroundColor: STATUS_BADGE.resolved.bg, color: STATUS_BADGE.resolved.text }}
                    >
                      resolved
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AnomalyCard({
  anomaly,
  index,
  expandedIndex,
  onToggleExpand,
  onNavigate,
}: {
  anomaly: AnomalyWithStatus;
  index: number;
  expandedIndex: number | null;
  onToggleExpand: (i: number | null) => void;
  onNavigate: (path: string) => void;
}) {
  const style = SEVERITY_STYLES[anomaly.severity as AnomalySeverity] ?? SEVERITY_STYLES.info;
  const ruleDef = ANOMALY_RULES.find(r => r.ruleId === anomaly.ruleId);
  const isExpanded = expandedIndex === index;
  const statusBadge = STATUS_BADGE[anomaly.status];

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ backgroundColor: style.bg, borderColor: style.border }}
    >
      <div className="flex items-start gap-3 p-3">
        <div className="flex-shrink-0 mt-0.5">
          {anomaly.severity === 'alert' ? (
            <svg className="w-4 h-4" style={{ color: style.icon }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          ) : anomaly.severity === 'warning' ? (
            <svg className="w-4 h-4" style={{ color: style.icon }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" style={{ color: style.icon }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
              {anomaly.title}
            </p>
            <span
              className="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
              style={{ backgroundColor: statusBadge.bg, color: statusBadge.text }}
            >
              {anomaly.status === 'recurring' && anomaly.recurring_months
                ? `${statusBadge.label} (${anomaly.recurring_months}mo)`
                : statusBadge.label}
            </span>
          </div>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {anomaly.detail}
          </p>
        </div>
        <span
          className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
          style={{ color: style.text, backgroundColor: style.bg }}
        >
          {anomaly.type.replace(/-/g, ' ')}
        </span>
      </div>

      {/* "Why this alert?" disclosure */}
      {ruleDef && (
        <div className="px-3 pb-2">
          <button
            onClick={() => onToggleExpand(isExpanded ? null : index)}
            className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <svg
              className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Why this alert?
          </button>

          {isExpanded && (
            <div className="mt-1.5 ml-4 space-y-1">
              <p className="text-[11px] text-[var(--text-muted)]">
                <span className="font-medium text-[var(--text-secondary)]">Rule:</span>{' '}
                {ruleDef.name}
              </p>
              <button
                onClick={() => onNavigate('/config?tab=alert-rules')}
                className="text-[11px] text-[var(--accent)] hover:underline font-medium"
              >
                Configure &rarr;
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
