import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useFilters } from '../../context/ViewFilterContext';
import { fromDbMonth } from '../../utils/monthRange';
import { formatMonth, formatHours } from '../../utils/format';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { AXIS_STYLE, GRID_STYLE, CHART_MARGINS } from '../../charts/ChartTheme';

export function UtilizationTrendPanel() {
  const { selectedEngineer } = useFilters();
  const config = useLiveQuery(() => db.config.get(1));

  const member = useLiveQuery(async () => {
    if (!selectedEngineer) return null;
    return db.teamMembers.where('full_name').equals(selectedEngineer).first();
  }, [selectedEngineer]);

  // Show all months for this engineer (trend view ignores date filter)
  const trend = useLiveQuery(async () => {
    if (!selectedEngineer) return null;
    const entries = await db.timesheets
      .where('full_name')
      .equals(selectedEngineer)
      .toArray();
    const monthMap = new Map<string, number>();
    entries.forEach(e => {
      const display = fromDbMonth(e.month);
      monthMap.set(display, (monthMap.get(display) ?? 0) + e.hours);
    });
    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, hours]) => ({ month, hours }));
  }, [selectedEngineer]);

  if (!trend) {
    return <div className="animate-pulse h-64 bg-[var(--border-subtle)] rounded-lg" />;
  }

  if (!trend.length) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">
        No timesheet data available
      </div>
    );
  }

  const capacity =
    member && member.capacity_override_hours > 0
      ? member.capacity_override_hours
      : (config?.std_monthly_capacity_hours ?? 140);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const hours: number = payload[0].value;
    const pct = Math.round((hours / capacity) * 100);
    return (
      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '8px 12px',
          fontSize: '12px',
        }}
      >
        <p style={{ fontWeight: 600, marginBottom: 4 }}>{formatMonth(label)}</p>
        <p>
          {formatHours(hours)}h — {pct}% of capacity
        </p>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={trend} margin={CHART_MARGINS.vertical}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey="month" tickFormatter={formatMonth} {...AXIS_STYLE} />
        <YAxis {...AXIS_STYLE} />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine
          y={capacity}
          stroke="#ef4444"
          strokeDasharray="4 3"
          label={{
            value: `Cap ${capacity}h`,
            position: 'insideTopRight',
            fontSize: 10,
            fill: '#ef4444',
          }}
        />
        <Bar dataKey="hours" radius={[3, 3, 0, 0]}>
          {trend.map((entry, i) => (
            <Cell
              key={i}
              fill={
                entry.hours > capacity
                  ? '#ef4444'
                  : entry.hours >= capacity * 0.8
                  ? '#16a34a'
                  : '#93c5fd'
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
