import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { computeActualHours } from '../../aggregation/engine';
import { getProjectParent } from '../../aggregation/projectUtils';
import { formatHours } from '../../utils/format';
import { useFilters } from '../../context/ViewFilterContext';
import { resolveMonths } from '../../utils/monthRange';

interface ComplianceRow {
  engineer: string;
  projectId: string;
  projectName: string;
  plannedHours: number;
  actualHours: number;
  delta: number;
  deltaPct: number;
}

export function AllocationCompliancePanel() {
  const { monthFilter, selectedProject } = useFilters();

  const complianceData = useLiveQuery(async () => {
    if (!monthFilter) return null;

    const months = resolveMonths(monthFilter);
    let allocations = await db.plannedAllocations
      .where('month')
      .anyOf(months)
      .toArray();

    if (selectedProject) {
      allocations = allocations.filter(a =>
        a.project_id === selectedProject || getProjectParent(a.project_id) === selectedProject
      );
    }

    if (allocations.length === 0) return [];

    const actuals = await computeActualHours(monthFilter, selectedProject);
    const projects = await db.projects.toArray();
    const projectMap = new Map(projects.map(p => [p.project_id, p]));

    // Build actual hours lookup: engineer+projectId → hours
    const actualMap = new Map<string, number>();
    for (const a of actuals) {
      const key = `${a.engineer}|${a.project_id}`;
      actualMap.set(key, (actualMap.get(key) ?? 0) + a.actual_hours);
    }

    const rows: ComplianceRow[] = [];

    for (const alloc of allocations) {
      const key = `${alloc.engineer}|${alloc.project_id}`;
      const actualHours = actualMap.get(key) ?? 0;
      const delta = actualHours - alloc.planned_hours;
      const deltaPct = alloc.planned_hours > 0 ? delta / alloc.planned_hours : 0;

      const project = projectMap.get(alloc.project_id);

      rows.push({
        engineer: alloc.engineer,
        projectId: alloc.project_id,
        projectName: project?.project_name ?? alloc.project_id,
        plannedHours: alloc.planned_hours,
        actualHours: Math.round(actualHours * 10) / 10,
        delta: Math.round(delta * 10) / 10,
        deltaPct,
      });
    }

    // Sort by absolute delta descending (biggest deviations first)
    rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return rows;
  }, [monthFilter, selectedProject]);

  if (!monthFilter) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">
        Select a month to view allocation compliance
      </div>
    );
  }

  if (!complianceData) {
    return (
      <div className="animate-pulse h-48 bg-[var(--border-subtle)] rounded-lg"></div>
    );
  }

  if (complianceData.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">
        {selectedProject
          ? 'No planned allocations for the selected project this month.'
          : 'No planned allocations configured for this month. Set up allocations in Settings to enable compliance tracking.'}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-[var(--border-subtle)]">
            <th className="text-left py-1.5 px-2 font-semibold text-[var(--text-muted)] text-[11px] uppercase tracking-wider">Engineer</th>
            <th className="text-left py-1.5 px-2 font-semibold text-[var(--text-muted)] text-[11px] uppercase tracking-wider">Project</th>
            <th className="text-right py-1.5 px-2 font-semibold text-[var(--text-muted)] text-[11px] uppercase tracking-wider">Planned</th>
            <th className="text-right py-1.5 px-2 font-semibold text-[var(--text-muted)] text-[11px] uppercase tracking-wider">Actual</th>
            <th className="text-right py-1.5 px-2 font-semibold text-[var(--text-muted)] text-[11px] uppercase tracking-wider">Delta</th>
            <th className="py-1.5 px-2 font-semibold text-[var(--text-muted)] text-[11px] uppercase tracking-wider w-32">Variance</th>
          </tr>
        </thead>
        <tbody>
          {complianceData.map((row, i) => {
            const isOver = row.delta > 0;
            const absDeltaPct = Math.abs(row.deltaPct);
            const barColor = absDeltaPct > 0.5
              ? (isOver ? '#dc2626' : '#2563eb')
              : absDeltaPct > 0.2
              ? (isOver ? '#f59e0b' : '#0d9488')
              : '#94a3b8';

            return (
              <tr key={i} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-table-header)]">
                <td className="py-1.5 px-2 font-medium text-[var(--text-primary)]">
                  {row.engineer}
                </td>
                <td className="py-1.5 px-2 text-[var(--text-secondary)]">
                  <span className="text-[var(--text-muted)] mr-1">{row.projectId}</span>
                  {row.projectName !== row.projectId ? row.projectName : ''}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-secondary)]">
                  {formatHours(row.plannedHours)}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-primary)] font-medium">
                  {formatHours(row.actualHours)}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums font-medium" style={{ color: barColor }}>
                  {row.delta > 0 ? '+' : ''}{formatHours(row.delta)}
                </td>
                <td className="py-1.5 px-2">
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-2 bg-[var(--border-subtle)] rounded-full overflow-hidden relative">
                      {/* Center line */}
                      <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--text-muted)] opacity-30" />
                      {/* Bar */}
                      <div
                        className="absolute inset-y-0 rounded-full"
                        style={{
                          backgroundColor: barColor,
                          width: `${Math.min(50, absDeltaPct * 50)}%`,
                          ...(isOver
                            ? { left: '50%' }
                            : { right: '50%' }),
                        }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums font-medium w-8 text-right" style={{ color: barColor }}>
                      {row.delta > 0 ? '+' : ''}{Math.round(row.deltaPct * 100)}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
