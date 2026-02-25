import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { computeProjectTimeline } from '../../aggregation/engine';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { CATEGORY_COLORS, AXIS_STYLE, GRID_STYLE, TOOLTIP_STYLE, LEGEND_STYLE, CHART_MARGINS } from '../../charts/ChartTheme';
import { formatMonth } from '../../utils/format';
import { useFilters } from '../../context/ViewFilterContext';

export function ProjectBurndownPanel() {
  const { selectedProject } = useFilters();

  const timeline = useLiveQuery(async () => {
    if (!selectedProject) return null;
    return await computeProjectTimeline(selectedProject);
  }, [selectedProject]);

  const milestones = useLiveQuery(async () => {
    if (!selectedProject) return null;
    const projectMilestones = await db.milestones
      .where('project_id')
      .equals(selectedProject)
      .toArray();
    return projectMilestones;
  }, [selectedProject]);

  if (!selectedProject) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        Select a project from the header to view timeline
      </div>
    );
  }

  if (!timeline || !milestones) {
    return (
      <div className="animate-pulse h-64 bg-[var(--border-default)] rounded-lg"></div>
    );
  }

  if (timeline.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        No timeline data for this project
      </div>
    );
  }

  const chartData = timeline.map(t => ({
    month: formatMonth(t.month),
    monthRaw: t.month,
    'Planned Hours': t.planned_hours,
    'Actual Hours': t.actual_hours,
  }));

  // Find milestone months for reference lines
  const milestoneMonths: Array<{ month: string; name: string }> = [];
  milestones.forEach(m => {
    if (m.dr1) {
      const date = new Date(m.dr1);
      milestoneMonths.push({
        month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        name: 'DR1',
      });
    }
    if (m.dr2) {
      const date = new Date(m.dr2);
      milestoneMonths.push({
        month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        name: 'DR2',
      });
    }
    if (m.dr3) {
      const date = new Date(m.dr3);
      milestoneMonths.push({
        month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        name: 'DR3',
      });
    }
    if (m.launch) {
      const date = new Date(m.launch);
      milestoneMonths.push({
        month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        name: 'Launch',
      });
    }
  });

  return (
    <ResponsiveContainer width="100%" height={350}>
      <ComposedChart data={chartData} margin={CHART_MARGINS.vertical}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey="month" {...AXIS_STYLE} />
        <YAxis {...AXIS_STYLE} label={{ value: 'Hours', angle: -90, position: 'insideLeft', offset: 8, style: { fontSize: 12, fill: '#64748b', fontWeight: 500 } }} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Legend {...LEGEND_STYLE} />

        {/* Milestone reference lines */}
        {milestoneMonths.map((m, idx) => {
          const dataIndex = chartData.findIndex(d => d.monthRaw === m.month);
          if (dataIndex >= 0) {
            return (
              <ReferenceLine
                key={`milestone-${idx}`}
                x={chartData[dataIndex].month}
                stroke="#9CA3AF"
                strokeDasharray="3 3"
                label={{ value: m.name, position: 'top', fontSize: 11 }}
              />
            );
          }
          return null;
        })}

        <Bar dataKey="Actual Hours" fill={CATEGORY_COLORS.npd} />
        <Line
          type="monotone"
          dataKey="Planned Hours"
          stroke={CATEGORY_COLORS.sustaining}
          strokeWidth={2}
          dot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
