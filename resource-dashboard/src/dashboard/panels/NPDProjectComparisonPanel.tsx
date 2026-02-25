import { useLiveQuery } from 'dexie-react-hooks';
import { computeNPDProjectComparison } from '../../aggregation/engine';
import { getProjectParent } from '../../aggregation/projectUtils';
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
  Cell,
} from 'recharts';
import { CATEGORY_COLORS, AXIS_STYLE, GRID_STYLE, TOOLTIP_STYLE, LEGEND_STYLE, CHART_MARGINS, CHART_ROW_HEIGHT, CHART_MIN_HEIGHT, CHART_MAX_HEIGHT, truncatedYAxisTick } from '../../charts/ChartTheme';
import { formatHours } from '../../utils/format';

export function NPDProjectComparisonPanel() {
  const { monthFilter, selectedProject } = useFilters();

  const npdProjects = useLiveQuery(async () => {
    if (!monthFilter) return null;
    const data = await computeNPDProjectComparison(monthFilter);
    if (selectedProject) {
      return data.filter(d =>
        d.project_id === selectedProject || getProjectParent(d.project_id) === selectedProject
      );
    }
    return data;
  }, [monthFilter, selectedProject]);

  if (!monthFilter) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        Select a month to view NPD project comparison
      </div>
    );
  }

  if (!npdProjects) {
    return (
      <div className="animate-pulse h-64 bg-[var(--border-subtle)] rounded-lg"></div>
    );
  }

  if (npdProjects.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        {selectedProject ? 'Not applicable for the selected project (not NPD or no planned hours).' : 'No NPD projects for this month'}
      </div>
    );
  }

  // Reshape for grouped bar chart
  const chartData = npdProjects.flatMap(p => [
    {
      project: `${p.project_id} P`,
      projectId: p.project_id,
      projectName: p.project_name,
      hours: p.planned_hours,
      type: 'Planned',
      delta: p.delta,
      delta_pct: p.delta_pct,
    },
    {
      project: `${p.project_id} A`,
      projectId: p.project_id,
      projectName: p.project_name,
      hours: p.actual_hours,
      type: 'Actual',
      delta: p.delta,
      delta_pct: p.delta_pct,
    },
  ]);

  const customTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={TOOLTIP_STYLE.contentStyle}>
          <p className="font-semibold">{data.projectName}</p>
          <p className="text-sm">{data.projectId}</p>
          <p className="text-sm">{data.type}: {formatHours(data.hours)}</p>
          {data.type === 'Actual' && (
            <p className="text-sm">
              Delta: {data.delta >= 0 ? '+' : ''}{formatHours(data.delta)} (
              {data.delta_pct >= 0 ? '+' : ''}{(data.delta_pct * 100).toFixed(1)}%)
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // Color cells based on delta - red if over plan, green if under
  const getCellColor = (entry: any) => {
    if (entry.type === 'Planned') return CATEGORY_COLORS.npd;
    // Actual bar - color by delta
    if (entry.delta_pct > 0.1) return '#EF4444'; // Red if >10% over
    if (entry.delta_pct < -0.1) return '#10B981'; // Green if >10% under
    return CATEGORY_COLORS.npd; // Blue if within 10%
  };

  const chartHeight = Math.max(CHART_MIN_HEIGHT, Math.min(CHART_MAX_HEIGHT, npdProjects.length * 2 * CHART_ROW_HEIGHT));

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={chartData} layout="vertical" margin={CHART_MARGINS.horizontal}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis type="number" {...AXIS_STYLE} label={{ value: 'Hours', position: 'insideBottom', offset: -20, style: { fontSize: 12, fill: '#64748b', fontWeight: 500 } }} />
        <YAxis type="category" dataKey="project" width={120} tick={truncatedYAxisTick} />
        <Tooltip content={customTooltip} />
        <Legend {...LEGEND_STYLE} />
        <Bar dataKey="hours" name="Hours">
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={getCellColor(entry)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
