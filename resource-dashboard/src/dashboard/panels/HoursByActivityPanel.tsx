import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useFilters } from '../../context/ViewFilterContext';
import { resolveMonths, toDbMonths } from '../../utils/monthRange';
import { PieChart, Pie, Cell, Tooltip, Label, ResponsiveContainer } from 'recharts';
import { formatHours } from '../../utils/format';

const ACTIVITY_COLORS: Record<string, string> = {
  'Engineering': '#2563eb',
  'Lab - Testing': '#0d9488',
  'Project Management': '#7c3aed',
  'PTO': '#cbd5e1',
};

function activityColor(activity: string): string {
  return ACTIVITY_COLORS[activity] ?? '#94a3b8';
}

interface Props {
  activityFilter?: string;
  onActivityChange?: (activity: string) => void;
}

export function HoursByActivityPanel({ activityFilter, onActivityChange }: Props) {
  const { selectedEngineer, monthFilter } = useFilters();

  const data = useLiveQuery(async () => {
    if (!selectedEngineer || !monthFilter) return null;
    const months = toDbMonths(resolveMonths(monthFilter));
    const entries = await db.timesheets
      .where('month')
      .anyOf(months)
      .and(t => t.full_name === selectedEngineer)
      .toArray();
    const total = entries.reduce((sum, e) => sum + e.hours, 0);
    const actMap = new Map<string, number>();
    entries.forEach(e => {
      actMap.set(e.activity, (actMap.get(e.activity) ?? 0) + e.hours);
    });
    const slices = Array.from(actMap.entries())
      .map(([activity, hours]) => ({
        activity,
        hours,
        pct: total > 0 ? hours / total : 0,
      }))
      .sort((a, b) => b.hours - a.hours);
    return { slices, total };
  }, [selectedEngineer, monthFilter]);

  if (!data) {
    return <div className="animate-pulse h-64 bg-[var(--border-subtle)] rounded-lg" />;
  }

  if (!data.slices.length) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">
        No timesheet data for this period
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
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
        <p style={{ fontWeight: 600, marginBottom: 4 }}>{d.activity}</p>
        <p>
          {formatHours(d.hours)}h — {Math.round(d.pct * 100)}%
        </p>
      </div>
    );
  };

  // Center label rendered as SVG text inside the donut hole
  const CenterLabel = ({ viewBox }: any) => {
    const { cx, cy } = viewBox ?? {};
    if (!cx || !cy) return null;
    return (
      <>
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          fontSize="20"
          fontWeight="700"
          fill="var(--text-primary)"
        >
          {formatHours(data.total)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="11" fill="#94a3b8">
          hours
        </text>
      </>
    );
  };

  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data.slices}
            cx="50%"
            cy="50%"
            innerRadius={58}
            outerRadius={88}
            paddingAngle={2}
            dataKey="hours"
            nameKey="activity"
            onClick={(entry: any) =>
              onActivityChange?.(activityFilter === entry.activity ? '' : entry.activity)
            }
          >
            {data.slices.map((entry, i) => (
              <Cell
                key={i}
                fill={activityColor(entry.activity)}
                opacity={activityFilter && activityFilter !== entry.activity ? 0.3 : 1}
                style={{ cursor: onActivityChange ? 'pointer' : 'default' }}
              />
            ))}
            <Label content={<CenterLabel />} position="center" />
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Custom legend */}
      <div className="space-y-0.5 mt-2">
        {data.slices.map(s => (
          <div
            key={s.activity}
            className="flex items-center justify-between text-[12px] rounded px-2 py-1 transition-colors"
            style={{
              opacity: activityFilter && activityFilter !== s.activity ? 0.35 : 1,
              cursor: onActivityChange ? 'pointer' : 'default',
              backgroundColor:
                activityFilter === s.activity ? 'var(--accent-light)' : undefined,
            }}
            onClick={() =>
              onActivityChange?.(activityFilter === s.activity ? '' : s.activity)
            }
          >
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: activityColor(s.activity) }}
              />
              <span className="text-[var(--text-secondary)]">{s.activity}</span>
            </div>
            <div className="flex gap-3 text-right">
              <span className="text-[var(--text-muted)]">{Math.round(s.pct * 100)}%</span>
              <span className="text-[var(--text-primary)] font-medium w-14 text-right">
                {formatHours(s.hours)}h
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
