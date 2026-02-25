import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { computeBusFactorRisk } from '../../aggregation/engine';
import { useFilters } from '../../context/ViewFilterContext';
import { ProjectType } from '../../types';
import type { BusFactorResult } from '../../aggregation/busFactor';

const RISK_STYLES: Record<BusFactorResult['riskLevel'], { bg: string; text: string; label: string }> = {
  critical: { bg: '#fef2f2', text: '#dc2626', label: 'Critical' },
  high: { bg: '#fff7ed', text: '#ea580c', label: 'High' },
  medium: { bg: '#fefce8', text: '#ca8a04', label: 'Medium' },
  low: { bg: '#f0fdf4', text: '#16a34a', label: 'Low' },
};

export function BusFactorPanel() {
  const [npdOnly, setNpdOnly] = useState(false);
  const { monthFilter, selectedProject } = useFilters();

  const busData = useLiveQuery(async () => {
    if (!monthFilter) return null;
    return await computeBusFactorRisk(monthFilter, selectedProject);
  }, [monthFilter, selectedProject]);

  if (!monthFilter) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">
        Select a month to view knowledge risk
      </div>
    );
  }

  if (!busData) {
    return (
      <div className="animate-pulse h-48 bg-[var(--border-subtle)] rounded-lg"></div>
    );
  }

  const filtered = npdOnly
    ? busData.filter(d => d.projectType === ProjectType.NPD)
    : busData;

  // Only show non-low risk by default, plus any low with notable hours
  const notable = filtered.filter(d => d.riskLevel !== 'low' || d.totalHours > 40);

  if (notable.length === 0) {
    return (
      <div className="space-y-3">
        <FilterToggle npdOnly={npdOnly} setNpdOnly={setNpdOnly} />
        <div className="flex items-center gap-2 py-6 justify-center text-[var(--status-good)]">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-[13px] font-medium">No knowledge concentration risks detected</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <FilterToggle npdOnly={npdOnly} setNpdOnly={setNpdOnly} />

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className="text-left py-1.5 px-2 font-semibold text-[var(--text-muted)] text-[11px] uppercase tracking-wider">Project</th>
              <th className="text-center py-1.5 px-2 font-semibold text-[var(--text-muted)] text-[11px] uppercase tracking-wider">Risk</th>
              <th className="text-center py-1.5 px-2 font-semibold text-[var(--text-muted)] text-[11px] uppercase tracking-wider">Bus Factor</th>
              <th className="text-left py-1.5 px-2 font-semibold text-[var(--text-muted)] text-[11px] uppercase tracking-wider">Top Contributor</th>
              <th className="text-right py-1.5 px-2 font-semibold text-[var(--text-muted)] text-[11px] uppercase tracking-wider">Hours</th>
              <th className="text-center py-1.5 px-2 font-semibold text-[var(--text-muted)] text-[11px] uppercase tracking-wider">People</th>
            </tr>
          </thead>
          <tbody>
            {notable.map((d) => {
              const riskStyle = RISK_STYLES[d.riskLevel];
              return (
                <tr key={d.projectId} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-table-header)]">
                  <td className="py-1.5 px-2 font-medium text-[var(--text-primary)]">
                    <span className="text-[var(--text-muted)] mr-1">{d.projectId}</span>
                    {d.projectName !== d.projectId ? d.projectName : ''}
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <span
                      className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{ backgroundColor: riskStyle.bg, color: riskStyle.text }}
                    >
                      {riskStyle.label}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-center font-mono font-bold text-[var(--text-primary)]">
                    {d.busFactor}
                  </td>
                  <td className="py-1.5 px-2 text-[var(--text-secondary)]">
                    {d.topContributor} ({Math.round(d.topContributorPct * 100)}%)
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-secondary)]">
                    {d.totalHours}
                  </td>
                  <td className="py-1.5 px-2 text-center text-[var(--text-secondary)]">
                    {d.contributorCount}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterToggle({ npdOnly, setNpdOnly }: { npdOnly: boolean; setNpdOnly: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setNpdOnly(!npdOnly)}
        className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ${
          npdOnly
            ? 'bg-[var(--accent)] text-white'
            : 'bg-[var(--bg-table-header)] text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]'
        }`}
      >
        NPD Only
      </button>
      <span className="text-[11px] text-[var(--text-muted)]">
        {npdOnly ? 'Showing NPD projects' : 'Showing all project types'}
      </span>
    </div>
  );
}
