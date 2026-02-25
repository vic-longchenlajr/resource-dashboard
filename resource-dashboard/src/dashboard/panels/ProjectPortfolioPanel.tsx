import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useFilters } from '../../context/ViewFilterContext';
import { resolveMonths, toDbMonths } from '../../utils/monthRange';
import { ProjectType } from '../../types';
import { formatHours } from '../../utils/format';

const TYPE_BADGE: Record<string, { bg: string; color: string }> = {
  NPD: { bg: '#dbeafe', color: '#2563eb' },
  Sustaining: { bg: '#d1fae5', color: '#059669' },
  Sprint: { bg: '#ede9fe', color: '#7c3aed' },
  Admin: { bg: '#f1f5f9', color: '#64748b' },
  OOO: { bg: '#f1f5f9', color: '#94a3b8' },
};

interface Props {
  activityFilter?: string;
  onProjectClick?: (projectId: string) => void;
}

export function ProjectPortfolioPanel({ activityFilter, onProjectClick }: Props) {
  const { selectedEngineer, monthFilter } = useFilters();

  const data = useLiveQuery(async () => {
    if (!selectedEngineer || !monthFilter) return null;
    const displayMonths = resolveMonths(monthFilter);
    const dbMonths = toDbMonths(displayMonths);

    const [entries, projects, allAllocations] = await Promise.all([
      db.timesheets
        .where('month')
        .anyOf(dbMonths)
        .and(t => t.full_name === selectedEngineer)
        .toArray(),
      db.projects.toArray(),
      db.plannedAllocations.where('engineer').equals(selectedEngineer).toArray(),
    ]);

    // Filter entries by activity if active
    const filtered = activityFilter
      ? entries.filter(e => e.activity === activityFilter)
      : entries;

    // Group actual hours by project
    const hoursMap = new Map<string, number>();
    filtered.forEach(e => {
      if (e.r_number) {
        hoursMap.set(e.r_number, (hoursMap.get(e.r_number) ?? 0) + e.hours);
      }
    });

    const total = Array.from(hoursMap.values()).reduce((sum, h) => sum + h, 0);
    const projectLookup = new Map(projects.map(p => [p.project_id, p]));

    // Sum planned allocations for the selected months (month is YYYY-MM in plannedAllocations)
    const plannedMap = new Map<string, number>();
    allAllocations
      .filter(a => displayMonths.includes(a.month))
      .forEach(a => {
        plannedMap.set(a.project_id, (plannedMap.get(a.project_id) ?? 0) + a.planned_hours);
      });

    return Array.from(hoursMap.entries())
      .map(([projectId, hours]) => {
        const proj = projectLookup.get(projectId);
        return {
          projectId,
          projectName: proj?.project_name || projectId,
          type: (proj?.type ?? 'Admin') as string,
          hours,
          pct: total > 0 ? hours / total : 0,
          plannedHours: plannedMap.get(projectId) ?? 0,
        };
      })
      .sort((a, b) => b.hours - a.hours);
  }, [selectedEngineer, monthFilter, activityFilter]);

  if (!data) {
    return <div className="animate-pulse h-32 bg-[var(--border-subtle)] rounded-lg" />;
  }

  if (!data.length) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">
        {activityFilter
          ? `No ${activityFilter} hours logged this period`
          : 'No project data for this period'}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left border-b border-[var(--border-default)]">
            <th className="pb-2 pr-4 font-semibold text-[var(--text-muted)] text-[11px] uppercase tracking-wide">
              Project
            </th>
            <th className="pb-2 pr-4 font-semibold text-[var(--text-muted)] text-[11px] uppercase tracking-wide">
              R#
            </th>
            <th className="pb-2 pr-4 font-semibold text-[var(--text-muted)] text-[11px] uppercase tracking-wide">
              Type
            </th>
            <th className="pb-2 pr-4 font-semibold text-[var(--text-muted)] text-[11px] uppercase tracking-wide text-right">
              Hours
            </th>
            <th className="pb-2 pr-4 font-semibold text-[var(--text-muted)] text-[11px] uppercase tracking-wide text-right">
              % Total
            </th>
            <th className="pb-2 font-semibold text-[var(--text-muted)] text-[11px] uppercase tracking-wide text-right">
              Planned
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {data.map(row => {
            const badge = TYPE_BADGE[row.type] ?? TYPE_BADGE.Admin;
            const isClickable =
              !!onProjectClick &&
              (row.type === ProjectType.NPD || row.type === ProjectType.Sustaining);
            return (
              <tr key={row.projectId} className="hover:bg-[var(--bg-table-hover)]">
                <td className="py-2 pr-4">
                  <button
                    onClick={() => isClickable && onProjectClick!(row.projectId)}
                    className={`text-left font-medium ${
                      isClickable
                        ? 'text-[var(--accent)] hover:underline cursor-pointer'
                        : 'text-[var(--text-primary)] cursor-default'
                    }`}
                  >
                    {row.projectName}
                  </button>
                </td>
                <td className="py-2 pr-4 text-[var(--text-muted)] font-mono text-[11px]">
                  {row.projectId}
                </td>
                <td className="py-2 pr-4">
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                    style={{ backgroundColor: badge.bg, color: badge.color }}
                  >
                    {row.type}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right text-[var(--text-primary)] font-medium">
                  {formatHours(row.hours)}h
                </td>
                <td className="py-2 pr-4 text-right text-[var(--text-muted)]">
                  {Math.round(row.pct * 100)}%
                </td>
                <td className="py-2 text-right text-[var(--text-muted)]">
                  {row.plannedHours > 0 ? `${formatHours(row.plannedHours)}h` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
