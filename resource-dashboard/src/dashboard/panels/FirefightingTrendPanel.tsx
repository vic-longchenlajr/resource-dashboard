import { useLiveQuery } from 'dexie-react-hooks';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { computeMonthlyCategoryTotals } from '../../aggregation/engine';
import { useFilters } from '../../context/ViewFilterContext';
import { CATEGORY_COLORS, AXIS_STYLE, GRID_STYLE, TOOLTIP_STYLE, BAR_STYLE, CHART_MARGINS } from '../../charts/ChartTheme';
import { formatMonth } from '../../utils/format';

export function FirefightingTrendPanel() {
  const { selectedProject } = useFilters();

  const categoryTotals = useLiveQuery(
    () => computeMonthlyCategoryTotals(selectedProject),
    [selectedProject]
  );

  if (!categoryTotals || categoryTotals.length === 0) {
    return <div className="text-center py-12 text-[var(--text-muted)]">No timesheet data found. Import LiquidPlanner CSV files to populate this chart.</div>;
  }

  const chartData = categoryTotals.map(month => ({
    month: formatMonth(month.month),
    firefighting: month.actual_firefighting,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={CHART_MARGINS.vertical}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey="month" {...AXIS_STYLE} />
        <YAxis {...AXIS_STYLE} width={48} label={{ value: 'Hours', angle: -90, position: 'insideLeft', offset: 8, style: { fontSize: 12, fill: '#64748b', fontWeight: 500 } }} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Bar dataKey="firefighting" fill={CATEGORY_COLORS.firefighting} name="Firefighting Hours" radius={BAR_STYLE.radius} />
      </BarChart>
    </ResponsiveContainer>
  );
}
