import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { computeAllKPIs } from '../../aggregation/kpiEngine';
import { KPI_REGISTRY, formatKPIValue, getKPIColor } from '../../aggregation/kpiRegistry';
import { KPICard } from '../../charts/KPICard';
import { DEFAULT_KPI_CARDS } from '../../aggregation/kpiRegistry';
import type { KPICardKey } from '../../types';
import { useFilters } from '../../context/ViewFilterContext';

export function KPISummaryPanel() {
  const { monthFilter, selectedProject } = useFilters();
  const config = useLiveQuery(() => db.config.get(1));
  const kpiCards: KPICardKey[] = config?.kpi_cards ?? DEFAULT_KPI_CARDS;

  const kpiResults = useLiveQuery(async () => {
    if (!monthFilter) return null;
    return await computeAllKPIs(monthFilter, selectedProject);
  }, [monthFilter, selectedProject]);

  if (!monthFilter) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        Select a month to view KPIs
      </div>
    );
  }

  if (!kpiResults) {
    return (
      <div className="animate-pulse grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpiCards.map((_, i) => (
          <div key={i} className="h-32 bg-[var(--border-subtle)] rounded-lg"></div>
        ))}
      </div>
    );
  }

  // Filter cards: when a single project is selected, hide non-applicable KPIs
  const visibleCards = selectedProject
    ? kpiCards.filter(k => KPI_REGISTRY[k]?.applicableToSingleProject)
    : kpiCards;

  // Determine grid columns based on card count
  const gridCols = visibleCards.length <= 3
    ? 'grid-cols-2 lg:grid-cols-3'
    : visibleCards.length <= 4
      ? 'grid-cols-2 lg:grid-cols-4'
      : 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-6';

  return (
    <div className={`grid ${gridCols} gap-3`}>
      {visibleCards.map(key => {
        const def = KPI_REGISTRY[key];
        if (!def) return null;

        const rawValue = def.getValue(kpiResults);
        const displayValue = formatKPIValue(rawValue, def.format);
        const color = getKPIColor(rawValue, def.thresholds);

        // Map registry format to KPICard format prop
        const cardFormat: 'percent' | 'hours' | 'number' =
          def.format === 'percent' ? 'percent'
          : def.format === 'hours' ? 'hours'
          : 'number';

        return (
          <KPICard
            key={key}
            label={def.label}
            value={displayValue}
            format={cardFormat}
            color={color}
            tooltip={def.description}
          />
        );
      })}
    </div>
  );
}
