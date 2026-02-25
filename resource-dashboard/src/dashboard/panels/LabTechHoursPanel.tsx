import { useLiveQuery } from 'dexie-react-hooks';
import { computeLabTechHours, computeActualHours } from '../../aggregation/engine';
import { useFilters } from '../../context/ViewFilterContext';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { CATEGORY_COLORS, AXIS_STYLE, GRID_STYLE, TOOLTIP_STYLE, CHART_MARGINS, CHART_ROW_HEIGHT, CHART_MIN_HEIGHT, CHART_MAX_HEIGHT, truncatedYAxisTick } from '../../charts/ChartTheme';
import { formatHours } from '../../utils/format';

export function LabTechHoursPanel() {
  const { monthFilter, selectedProject } = useFilters();

  const labTechHours = useLiveQuery(async () => {
    if (!monthFilter) return null;
    return await computeLabTechHours(monthFilter, selectedProject);
  }, [monthFilter, selectedProject]);

  const actualHours = useLiveQuery(async () => {
    if (!monthFilter) return null;
    return await computeActualHours(monthFilter, selectedProject);
  }, [monthFilter, selectedProject]);

  if (!monthFilter) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        Select a month to view lab tech hours
      </div>
    );
  }

  if (!labTechHours || !actualHours) {
    return (
      <div className="animate-pulse h-64 bg-[var(--border-subtle)] rounded-lg"></div>
    );
  }

  if (labTechHours.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        No lab hours data for this month
      </div>
    );
  }

  // Compute total hours per engineer from actualHours
  const totalHoursMap = new Map<string, number>();
  actualHours.forEach(a => {
    totalHoursMap.set(a.engineer, (totalHoursMap.get(a.engineer) || 0) + a.actual_hours);
  });

  // Sort by lab hours descending
  const chartData = labTechHours
    .map(d => {
      const totalHours = totalHoursMap.get(d.engineer) || 0;
      return {
        engineer: d.engineer,
        labHours: d.lab_tech_hours,
        totalHours,
        percentage: totalHours > 0 ? (d.lab_tech_hours / totalHours) * 100 : 0,
      };
    })
    .sort((a, b) => b.labHours - a.labHours);

  const customTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={TOOLTIP_STYLE.contentStyle}>
          <p className="font-semibold">{data.engineer}</p>
          <p className="text-sm">Lab Hours: {formatHours(data.labHours)}</p>
          <p className="text-sm">Total Hours: {formatHours(data.totalHours)}</p>
          <p className="text-sm">Percentage: {data.percentage.toFixed(1)}%</p>
        </div>
      );
    }
    return null;
  };

  const chartHeight = Math.max(CHART_MIN_HEIGHT, Math.min(CHART_MAX_HEIGHT, chartData.length * CHART_ROW_HEIGHT));

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={chartData} layout="vertical" margin={CHART_MARGINS.horizontal}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis type="number" {...AXIS_STYLE} label={{ value: 'Hours', position: 'insideBottom', offset: -20, style: { fontSize: 12, fill: '#64748b', fontWeight: 500 } }} />
        <YAxis type="category" dataKey="engineer" width={120} tick={truncatedYAxisTick} />
        <Tooltip content={customTooltip} />
        <Bar dataKey="labHours" name="Lab Hours">
          {chartData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={CATEGORY_COLORS.npd} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
