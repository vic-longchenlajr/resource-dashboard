import { useLiveQuery } from 'dexie-react-hooks';
import { generateNarrativeSummary } from '../../aggregation/engine';
import { useFilters } from '../../context/ViewFilterContext';

export function NarrativeSummaryPanel() {
  const { monthFilter, selectedMonth, selectedProject, isRange } = useFilters();

  const narrative = useLiveQuery(async () => {
    // Narrative is single-month only — use selectedMonth
    if (!selectedMonth || isRange) return null;
    return await generateNarrativeSummary(selectedMonth, selectedProject);
  }, [selectedMonth, selectedProject, isRange]);

  if (!monthFilter) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">
        Select a month to view the summary
      </div>
    );
  }

  if (isRange) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">
        Narrative summary is available for individual months. Select a specific month to view.
      </div>
    );
  }

  if (!narrative) {
    return (
      <div className="animate-pulse h-24 bg-[var(--border-subtle)] rounded-lg"></div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-[var(--text-primary)]">
        {narrative.paragraph}
      </p>

      {narrative.highlights.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {narrative.highlights.map((h, i) => (
            <span
              key={i}
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[var(--accent-light)] text-[var(--accent)]"
            >
              {h}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
