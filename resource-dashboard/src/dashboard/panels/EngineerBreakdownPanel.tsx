import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { computeActualHours } from '../../aggregation/engine';
import { useFilters } from '../../context/ViewFilterContext';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { CATEGORY_COLORS, AXIS_STYLE, GRID_STYLE, TOOLTIP_STYLE, LEGEND_STYLE, CHART_MARGINS, CHART_ROW_HEIGHT, CHART_MIN_HEIGHT, CHART_MAX_HEIGHT, truncatedYAxisTick } from '../../charts/ChartTheme';

export function EngineerBreakdownPanel() {
  const { monthFilter, selectedProject } = useFilters();
  const config = useLiveQuery(() => db.config.get(1));
  const capacity = config?.std_monthly_capacity_hours ?? 140;

  const actualHours = useLiveQuery(async () => {
    if (!monthFilter) return null;
    return await computeActualHours(monthFilter, selectedProject);
  }, [monthFilter, selectedProject]);

  if (!monthFilter) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        Select a month to view engineer breakdown
      </div>
    );
  }

  if (!actualHours) {
    return (
      <div className="animate-pulse h-64 bg-[var(--border-subtle)] rounded-lg"></div>
    );
  }

  if (actualHours.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        No timesheet data for this month
      </div>
    );
  }

  // Aggregate by engineer and project type
  const engineerMap = new Map<string, {
    NPD: number;
    Sustaining: number;
    Sprint: number;
    'Admin/Other': number;
  }>();

  actualHours.forEach(entry => {
    if (!engineerMap.has(entry.engineer)) {
      engineerMap.set(entry.engineer, { NPD: 0, Sustaining: 0, Sprint: 0, 'Admin/Other': 0 });
    }
    const engineerData = engineerMap.get(entry.engineer)!;

    switch (entry.project_type) {
      case 'NPD':
        engineerData.NPD += entry.actual_hours;
        break;
      case 'Sustaining':
        engineerData.Sustaining += entry.actual_hours;
        break;
      case 'Sprint':
        engineerData.Sprint += entry.actual_hours;
        break;
      default:
        engineerData['Admin/Other'] += entry.actual_hours;
    }
  });

  // Convert to chart data and sort by total hours descending
  const chartData = Array.from(engineerMap.entries())
    .map(([engineer, data]) => ({
      engineer,
      ...data,
      total: data.NPD + data.Sustaining + data.Sprint + data['Admin/Other'],
    }))
    .sort((a, b) => b.total - a.total);

  const chartHeight = Math.max(CHART_MIN_HEIGHT, Math.min(CHART_MAX_HEIGHT, chartData.length * CHART_ROW_HEIGHT));

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={chartData} layout="vertical" margin={CHART_MARGINS.horizontal}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis type="number" {...AXIS_STYLE} label={{ value: 'Hours', position: 'insideBottom', offset: -20, style: { fontSize: 12, fill: '#64748b', fontWeight: 500 } }} />
        <YAxis type="category" dataKey="engineer" width={120} tick={truncatedYAxisTick} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Legend {...LEGEND_STYLE} />
        <ReferenceLine x={capacity} stroke="#9CA3AF" strokeDasharray="3 3" label="Capacity" />
        <Bar dataKey="NPD" stackId="a" fill={CATEGORY_COLORS.npd} />
        <Bar dataKey="Sustaining" stackId="a" fill={CATEGORY_COLORS.sustaining} />
        <Bar dataKey="Sprint" stackId="a" fill={CATEGORY_COLORS.sprint} />
        <Bar dataKey="Admin/Other" stackId="a" fill={CATEGORY_COLORS.admin} />
      </BarChart>
    </ResponsiveContainer>
  );
}
