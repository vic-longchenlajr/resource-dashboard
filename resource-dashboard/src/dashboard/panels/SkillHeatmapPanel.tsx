import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { Heatmap } from '../../charts/Heatmap';
import { skillColor } from '../../charts/ChartTheme';
import { PersonRole, ProjectType } from '../../types';
import { getProjectParent } from '../../aggregation/projectUtils';
import { computeCompatibilityScores } from '../../aggregation/skillMatching';
import { useFilters } from '../../context/ViewFilterContext';
import { resolveMonths, toDbMonths } from '../../utils/monthRange';

export function SkillHeatmapPanel() {
  const { monthFilter, selectedProject: dashboardProject } = useFilters();

  const teamMembers = useLiveQuery(() => db.teamMembers.toArray());
  const skills = useLiveQuery(() => db.skills.toArray());
  const skillCategories = useLiveQuery(() => db.skillCategories.toArray());
  const projects = useLiveQuery(() => db.projects.toArray());
  const allRequirements = useLiveQuery(() => db.projectSkillRequirements.toArray());

  // Find contributors to the dashboard-selected project
  const projectContributors = useLiveQuery(async () => {
    if (!dashboardProject || !monthFilter) return null;
    const csvMonths = toDbMonths(resolveMonths(monthFilter));
    const timesheets = await db.timesheets.where('month').anyOf(csvMonths).toArray();
    const contributors = new Set(
      timesheets
        .filter(t => getProjectParent(t.r_number) === dashboardProject || t.r_number === dashboardProject)
        .map(t => t.full_name)
    );
    return contributors;
  }, [dashboardProject, monthFilter]);

  const [selectedProjectId, setSelectedProjectId] = useState('');

  if (!teamMembers || !skills || !skillCategories) {
    return (
      <div className="animate-pulse h-64 bg-[var(--border-default)] rounded-lg"></div>
    );
  }

  // Filter to engineers only, further scoped by dashboard project if selected
  let engineers = teamMembers.filter(m => m.role === PersonRole.Engineer);
  if (dashboardProject && projectContributors) {
    engineers = engineers.filter(e => projectContributors.has(e.full_name));
  }

  // Sort skill categories by sort_order (consistent with SkillsMatrixConfig)
  const sortedCategories = [...skillCategories].sort((a, b) =>
    a.sort_order - b.sort_order
  );

  if (engineers.length === 0 || sortedCategories.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        {dashboardProject
          ? 'No engineers contributed to the selected project this month.'
          : 'Skill ratings not configured. Visit Settings \u2192 Skills Matrix to rate your team.'}
      </div>
    );
  }

  // Build data map: "engineer|skill" -> rating
  const dataMap = new Map<string, number>();
  skills.forEach(s => {
    dataMap.set(`${s.engineer}|${s.skill}`, s.rating);
  });

  // Get requirements for selected project
  const selectedRequirements = selectedProjectId && allRequirements
    ? allRequirements.filter(r => r.project_id === selectedProjectId)
    : [];

  // Compute compatibility scores when a project is selected
  const scores = selectedRequirements.length > 0
    ? computeCompatibilityScores(selectedRequirements, skills, teamMembers)
    : null;

  // Order engineers: by score (descending) if project selected, else alphabetical
  const orderedEngineers = scores
    ? scores
        .map(s => engineers.find(e => e.full_name === s.engineer))
        .filter(Boolean)
        .map(e => e!)
    : [...engineers].sort((a, b) => a.full_name.localeCompare(b.full_name));

  // Build highlight sets for top 3
  const highlightedRows = scores
    ? new Set(scores.slice(0, 3).map(s => s.engineer))
    : undefined;

  // Build row annotations with score percentages
  const rowAnnotations = scores
    ? new Map(scores.map(s => [s.engineer, `${s.score}%`]))
    : undefined;

  // Build highlighted columns for required skills
  const highlightedColumns = selectedRequirements.length > 0
    ? new Set(selectedRequirements.map(r => r.skill))
    : undefined;

  // Projects that have skill requirements configured (for dropdown)
  const projectsWithSkills = projects && allRequirements
    ? projects.filter(p =>
        (p.type === ProjectType.NPD || p.type === ProjectType.Sustaining) &&
        allRequirements.some(r => r.project_id === p.project_id)
      )
    : [];

  const rows = orderedEngineers.map(e => ({ key: e.full_name, label: e.full_name }));
  const columns = sortedCategories.map(c => ({
    key: c.name,
    label: c.name
  }));

  const formatFn = (rating: number) => {
    if (rating === 0) return '—';
    return rating.toString();
  };

  return (
    <div>
      {/* Project selector for ranking */}
      <div className="flex items-center gap-3 mb-3">
        <label className="text-[12px] font-medium text-[var(--text-muted)] uppercase tracking-wide whitespace-nowrap">
          Rank by project
        </label>
        <select
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="text-[13px] px-2 py-1 border border-[var(--border-input)] rounded bg-[var(--bg-input)] text-[var(--text-primary)] max-w-xs"
        >
          <option value="">None (alphabetical)</option>
          {projectsWithSkills.map(p => (
            <option key={p.project_id} value={p.project_id}>
              {p.project_id} — {p.project_name || 'Untitled'}
            </option>
          ))}
        </select>
        {selectedProjectId && projectsWithSkills.length > 0 && (
          <span className="text-[11px] text-[var(--text-muted)]">
            {selectedRequirements.length} skill{selectedRequirements.length !== 1 ? 's' : ''} required
          </span>
        )}
      </div>

      <Heatmap
        rows={rows}
        columns={columns}
        data={dataMap}
        colorFn={skillColor}
        formatFn={formatFn}
        emptyValue={0}
        highlightedRows={highlightedRows}
        rowAnnotations={rowAnnotations}
        highlightedColumns={highlightedColumns}
      />
    </div>
  );
}
