import { useLiveQuery } from 'dexie-react-hooks';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { computeMonthlyCategoryTotals } from '../../aggregation/engine';
import { useFilters } from '../../context/ViewFilterContext';
import { CATEGORY_COLORS, AXIS_STYLE, GRID_STYLE, TOOLTIP_STYLE, LEGEND_STYLE, BAR_STYLE, CHART_MARGINS } from '../../charts/ChartTheme';
import { formatMonth } from '../../utils/format';

export function PlannedVsActualPanel() {
  const { selectedProject } = useFilters();

  const categoryTotals = useLiveQuery(
    () => computeMonthlyCategoryTotals(selectedProject),
    [selectedProject]
  );

  if (!categoryTotals || categoryTotals.length === 0) {
    return <div className="text-center py-12 text-[var(--text-muted)]">No timesheet data found. Import LiquidPlanner CSV files to populate this chart.</div>;
  }

  const chartData = categoryTotals.flatMap(month => [
    {
      month: `${formatMonth(month.month)} P`,
      NPD: month.planned_npd,
      Sustaining: month.planned_sustaining,
      Sprint: month.planned_sprint,
      type: 'planned',
    },
    {
      month: `${formatMonth(month.month)} A`,
      NPD: month.actual_npd,
      Sustaining: month.actual_sustaining,
      Sprint: month.actual_sprint,
      type: 'actual',
    },
  ]);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={CHART_MARGINS.vertical}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey="month" {...AXIS_STYLE} />
        <YAxis {...AXIS_STYLE} width={48} label={{ value: 'Hours', angle: -90, position: 'insideLeft', offset: 8, style: { fontSize: 12, fill: '#64748b', fontWeight: 500 } }} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Legend {...LEGEND_STYLE} />
        <Bar dataKey="NPD" stackId="a" fill={CATEGORY_COLORS.npd} radius={BAR_STYLE.radius} />
        <Bar dataKey="Sustaining" stackId="a" fill={CATEGORY_COLORS.sustaining} />
        <Bar dataKey="Sprint" stackId="a" fill={CATEGORY_COLORS.sprint} />
      </BarChart>
    </ResponsiveContainer>
  );
}
