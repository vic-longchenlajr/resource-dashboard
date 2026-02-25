import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { ProjectType } from '../../types';
import { getProjectParent } from '../../aggregation/projectUtils';
import { milestoneColor } from '../../charts/ChartTheme';
import { useFilters } from '../../context/ViewFilterContext';

export function NPDMilestonesPanel() {
  const { selectedProject } = useFilters();

  const projects = useLiveQuery(() =>
    db.projects.where('type').equals(ProjectType.NPD).toArray()
  );

  const milestones = useLiveQuery(async () => {
    if (!projects || projects.length === 0) return null;
    let projectIds = projects.map(p => p.project_id);
    if (selectedProject) {
      projectIds = projectIds.filter(id =>
        id === selectedProject || getProjectParent(id) === selectedProject
      );
    }
    if (projectIds.length === 0) return [];
    const allMilestones = await db.milestones.toArray();
    return allMilestones.filter(m => projectIds.includes(m.project_id));
  }, [projects, selectedProject]);

  if (!projects || milestones === undefined || milestones === null) {
    return (
      <div className="animate-pulse h-64 bg-[var(--border-default)] rounded-lg"></div>
    );
  }

  if (selectedProject && milestones.length === 0) {
    // Check if the selected project is NPD at all
    const selectedDef = projects.find(p => p.project_id === selectedProject);
    if (!selectedDef) {
      return (
        <div className="text-center py-12 text-[var(--text-muted)]">
          Not applicable — selected project is not an NPD project.
        </div>
      );
    }
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        No milestones defined for this project.
      </div>
    );
  }

  if (projects.length === 0 || milestones.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        No NPD milestones configured. Visit Settings &rarr; Milestones to add gate reviews.
      </div>
    );
  }

  const today = new Date();
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getStatusText = (targetDate: string | null) => {
    if (!targetDate) return 'Not Scheduled';

    const target = new Date(targetDate);
    const diffDays = Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Past Due';
    if (diffDays <= 30) return 'Approaching';
    return 'Future';
  };

  // Flatten milestones into individual rows
  const milestoneRows: Array<{
    projectId: string;
    projectName: string;
    milestoneName: string;
    targetDate: string | null;
  }> = [];

  milestones.forEach(m => {
    const project = projects.find(p => p.project_id === m.project_id);
    if (!project) return;

    if (m.dr1) milestoneRows.push({ projectId: m.project_id, projectName: project.project_name, milestoneName: 'DR1', targetDate: m.dr1 });
    if (m.dr2) milestoneRows.push({ projectId: m.project_id, projectName: project.project_name, milestoneName: 'DR2', targetDate: m.dr2 });
    if (m.dr3) milestoneRows.push({ projectId: m.project_id, projectName: project.project_name, milestoneName: 'DR3', targetDate: m.dr3 });
    if (m.launch) milestoneRows.push({ projectId: m.project_id, projectName: project.project_name, milestoneName: 'Launch', targetDate: m.launch });
  });

  // Sort by project, then by milestone order
  milestoneRows.sort((a, b) => {
    if (a.projectId !== b.projectId) return a.projectId.localeCompare(b.projectId);
    const order = ['DR1', 'DR2', 'DR3', 'Launch'];
    return order.indexOf(a.milestoneName) - order.indexOf(b.milestoneName);
  });

  if (milestoneRows.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        No milestones assigned to NPD projects
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-[var(--border-default)]">
        <thead className="bg-[var(--bg-table-header)]">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
              Project
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
              Milestone
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
              Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-[var(--border-default)]">
          {milestoneRows.map((row, idx) => {
            const status = getStatusText(row.targetDate);
            const bgColor = milestoneColor(row.targetDate, today);
            const isFirstForProject = idx === 0 || milestoneRows[idx - 1].projectId !== row.projectId;

            return (
              <tr key={`${row.projectId}-${row.milestoneName}`} className="hover:bg-[var(--bg-table-hover)]">
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-[var(--text-primary)]">
                  {isFirstForProject ? (
                    <div>
                      <div className="font-semibold">{row.projectId}</div>
                      <div className="text-xs text-[var(--text-muted)]">{row.projectName}</div>
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-[var(--text-secondary)]">
                  {row.milestoneName}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-[var(--text-secondary)]">
                  {formatDate(row.targetDate)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm">
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: bgColor, color: '#fff' }}
                  >
                    {status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
