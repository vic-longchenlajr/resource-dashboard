import { useLiveQuery } from 'dexie-react-hooks';
import { computeFocusScore } from '../../aggregation/engine';
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
import { AXIS_STYLE, GRID_STYLE, TOOLTIP_STYLE, BAR_STYLE, CHART_MARGINS, CHART_ROW_HEIGHT, CHART_MIN_HEIGHT, CHART_MAX_HEIGHT, truncatedYAxisTick } from '../../charts/ChartTheme';

function focusColor(score: number): string {
  if (score >= 80) return '#16a34a';   // Green — focused
  if (score >= 50) return '#f59e0b';   // Amber — moderate
  return '#ef4444';                    // Red — fragmented
}

export function FocusScorePanel() {
  const { monthFilter, selectedProject } = useFilters();

  const focusData = useLiveQuery(async () => {
    if (!monthFilter) return null;
    return await computeFocusScore(monthFilter, selectedProject);
  }, [monthFilter, selectedProject]);

  if (!monthFilter) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">
        Select a month to view focus scores
      </div>
    );
  }

  if (!focusData) {
    return (
      <div className="animate-pulse h-64 bg-[var(--border-subtle)] rounded-lg"></div>
    );
  }

  if (focusData.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">
        {selectedProject ? 'No contributors found for the selected project this month.' : 'No focus data for this month'}
      </div>
    );
  }

  const chartData = focusData.map(d => ({
    name: d.person,
    score: d.focusScore,
    avgProjects: d.avgProjectsPerDay,
    highFragDays: d.highFragDays,
    topProject: d.topProject,
    topProjectPct: d.topProjectPct,
  }));

  const customTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div style={TOOLTIP_STYLE.contentStyle}>
          <p className="font-semibold text-[13px]">{d.name}</p>
          <p className="text-[12px] mt-1">Focus Score: {d.score}</p>
          <p className="text-[12px]">Avg Projects/Day: {d.avgProjects}</p>
          <p className="text-[12px]">High-Frag Days: {d.highFragDays}</p>
          <p className="text-[12px]">Top Project: {d.topProject} ({Math.round(d.topProjectPct * 100)}%)</p>
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
        <XAxis
          type="number"
          domain={[0, 100]}
          {...AXIS_STYLE}
          label={{ value: 'Focus Score', position: 'insideBottom', offset: -20, style: { fontSize: 12, fill: '#64748b', fontWeight: 500 } }}
        />
        <YAxis type="category" dataKey="name" width={120} tick={truncatedYAxisTick} />
        <Tooltip content={customTooltip} />
        <Bar dataKey="score" name="Focus Score" radius={BAR_STYLE.radiusHorizontal}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={focusColor(entry.score)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
