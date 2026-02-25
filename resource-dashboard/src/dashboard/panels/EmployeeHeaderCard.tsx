import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useFilters } from '../../context/ViewFilterContext';
import { resolveMonths, toDbMonths } from '../../utils/monthRange';
import { formatHours } from '../../utils/format';

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center">
      <p className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-[20px] font-bold leading-none" style={{ color: color ?? 'var(--text-primary)' }}>
        {value}
      </p>
    </div>
  );
}

export function EmployeeHeaderCard() {
  const { selectedEngineer, monthFilter } = useFilters();

  const member = useLiveQuery(async () => {
    if (!selectedEngineer) return null;
    return db.teamMembers.where('full_name').equals(selectedEngineer).first();
  }, [selectedEngineer]);

  const config = useLiveQuery(() => db.config.get(1));

  const stats = useLiveQuery(async () => {
    if (!selectedEngineer || !monthFilter) return null;
    const months = toDbMonths(resolveMonths(monthFilter));
    const entries = await db.timesheets
      .where('month')
      .anyOf(months)
      .and(t => t.full_name === selectedEngineer)
      .toArray();
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    const activeProjects = new Set(
      entries
        .filter(e => e.r_number && e.r_number !== 'R0996' && e.r_number !== 'R0999')
        .map(e => e.r_number)
    ).size;
    return { totalHours, activeProjects };
  }, [selectedEngineer, monthFilter]);

  if (!selectedEngineer) return null;

  const capacity =
    member && member.capacity_override_hours > 0
      ? member.capacity_override_hours
      : (config?.std_monthly_capacity_hours ?? 140);

  const utilization = stats ? stats.totalHours / capacity : null;

  const utilColor =
    utilization == null
      ? 'var(--text-muted)'
      : utilization >= 1.0
      ? '#ef4444'
      : utilization >= 0.8
      ? '#16a34a'
      : '#f59e0b';

  const initials = selectedEngineer
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('');

  return (
    <div className="flex flex-wrap items-center gap-6 p-5 bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-xl">
      {/* Avatar + name + role */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-12 h-12 rounded-full bg-[var(--accent-light)] flex items-center justify-center text-[var(--accent)] font-bold text-[15px] flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-[16px] font-semibold text-[var(--text-primary)] truncate">{selectedEngineer}</p>
          {member && (
            <span
              className="text-[11px] font-medium px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: member.role === 'Engineer' ? '#dbeafe' : '#dcfce7',
                color: member.role === 'Engineer' ? '#2563eb' : '#16a34a',
              }}
            >
              {member.role}
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-8 flex-wrap justify-end">
        <Stat
          label="Utilization"
          value={utilization != null ? `${Math.round(utilization * 100)}%` : '—'}
          color={utilColor}
        />
        <Stat label="Total Hours" value={stats ? formatHours(stats.totalHours) : '—'} />
        <Stat label="Active Projects" value={stats ? String(stats.activeProjects) : '—'} />
        <Stat label="Capacity" value={`${capacity}h`} />
      </div>
    </div>
  );
}
