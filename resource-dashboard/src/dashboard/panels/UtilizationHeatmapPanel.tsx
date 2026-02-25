import { useLiveQuery } from 'dexie-react-hooks';
import { computePlannedUtilization } from '../../aggregation/engine';
import { useFilters } from '../../context/ViewFilterContext';
import { Heatmap } from '../../charts/Heatmap';
import { utilizationColor } from '../../charts/ChartTheme';
import { formatPercent, formatMonth } from '../../utils/format';

export function UtilizationHeatmapPanel() {
  const { selectedProject } = useFilters();
  const utilization = useLiveQuery(
    () => computePlannedUtilization(selectedProject),
    [selectedProject]
  );

  if (utilization === undefined) {
    return <div className="animate-pulse h-64 bg-[var(--border-subtle)] rounded-lg" />;
  }

  if (utilization.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        No planned utilization data. Configure in Settings &rarr; Resource Allocations
      </div>
    );
  }

  const engineers = [...new Set(utilization.map(u => u.engineer))].sort();
  const months = [...new Set(utilization.map(u => u.month))].sort();

  const dataMap = new Map<string, number>();
  utilization.forEach(u => {
    dataMap.set(`${u.engineer}|${u.month}`, u.utilization_pct);
  });

  const rows = engineers.map(e => ({ key: e, label: e }));
  const columns = months.map(m => ({ key: m, label: formatMonth(m) }));

  return (
    <Heatmap
      rows={rows}
      columns={columns}
      data={dataMap}
      colorFn={utilizationColor}
      formatFn={formatPercent}
      emptyValue={0}
    />
  );
}
