import { useLiveQuery } from 'dexie-react-hooks';
import { computeMeetingTax } from '../../aggregation/engine';
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
} from 'recharts';
import { AXIS_STYLE, GRID_STYLE, TOOLTIP_STYLE, LEGEND_STYLE, BAR_STYLE, CATEGORY_COLORS, CHART_MARGINS, CHART_ROW_HEIGHT, CHART_MIN_HEIGHT, CHART_MAX_HEIGHT, truncatedYAxisTick } from '../../charts/ChartTheme';

export function MeetingTaxPanel() {
  const { monthFilter, selectedProject } = useFilters();

  const meetingData = useLiveQuery(async () => {
    if (!monthFilter) return null;
    return await computeMeetingTax(monthFilter, selectedProject);
  }, [monthFilter, selectedProject]);

  if (!monthFilter) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">
        Select a month to view meeting tax
      </div>
    );
  }

  if (!meetingData) {
    return (
      <div className="animate-pulse h-64 bg-[var(--border-subtle)] rounded-lg"></div>
    );
  }

  if (meetingData.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">
        {selectedProject ? 'No meeting hours logged for this project\'s contributors.' : 'No meeting data for this month'}
      </div>
    );
  }

  const chartData = meetingData.map(d => ({
    name: d.person,
    Meeting: d.meetingHours,
    Admin: d.adminHours,
    OOO: d.oooHours,
    Productive: d.productiveHours,
    meetingPct: d.meetingPct,
  }));

  const customTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div style={TOOLTIP_STYLE.contentStyle}>
          <p className="font-semibold text-[13px]">{d.name}</p>
          <p className="text-[12px] mt-1">Meetings: {d.Meeting}h ({Math.round(d.meetingPct * 100)}%)</p>
          <p className="text-[12px]">Admin: {d.Admin}h</p>
          <p className="text-[12px]">OOO: {d.OOO}h</p>
          <p className="text-[12px]">Productive: {d.Productive}h</p>
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
          {...AXIS_STYLE}
          label={{ value: 'Hours', position: 'insideBottom', offset: -20, style: { fontSize: 12, fill: '#64748b', fontWeight: 500 } }}
        />
        <YAxis type="category" dataKey="name" width={120} tick={truncatedYAxisTick} />
        <Tooltip content={customTooltip} />
        <Legend {...LEGEND_STYLE} />
        <Bar dataKey="Productive" stackId="a" fill={CATEGORY_COLORS.npd} radius={[0, 0, 0, 0]} />
        <Bar dataKey="Meeting" stackId="a" fill="#f59e0b" />
        <Bar dataKey="Admin" stackId="a" fill={CATEGORY_COLORS.admin} />
        <Bar dataKey="OOO" stackId="a" fill={CATEGORY_COLORS.ooo} radius={BAR_STYLE.radiusHorizontal} />
      </BarChart>
    </ResponsiveContainer>
  );
}
