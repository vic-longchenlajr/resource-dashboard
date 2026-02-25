import { useLiveQuery } from 'dexie-react-hooks';
import { computeTechAffinity } from '../../aggregation/engine';
import { formatHours } from '../../utils/format';
import { useFilters } from '../../context/ViewFilterContext';

export function TechAffinityPanel() {
  const { monthFilter, selectedProject } = useFilters();

  const affinityData = useLiveQuery(async () => {
    if (!monthFilter) return null;
    const data = await computeTechAffinity(monthFilter, selectedProject);

    // Exclude admin/OOO codes (R0996, R0999)
    return data.filter(d => d.tech !== 'R0996' && d.tech !== 'R0999');
  }, [monthFilter, selectedProject]);

  if (!monthFilter) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        Select a month to view tech affinity
      </div>
    );
  }

  if (!affinityData) {
    return (
      <div className="animate-pulse h-64 bg-[var(--border-default)] rounded-lg"></div>
    );
  }

  if (affinityData.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        No tech collaboration data for this month
      </div>
    );
  }

  // Group by engineer
  const engineerMap = new Map<string, typeof affinityData>();
  affinityData.forEach(d => {
    if (!engineerMap.has(d.engineer)) {
      engineerMap.set(d.engineer, []);
    }
    engineerMap.get(d.engineer)!.push(d);
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from(engineerMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([engineer, techs]) => {
          // Sort by hours descending and take top 3
          const topTechs = techs
            .sort((a, b) => b.shared_hours - a.shared_hours)
            .slice(0, 3);

          return (
            <div key={engineer} className="bg-white border border-[var(--border-default)] rounded-lg p-4 shadow-sm">
              <h3 className="font-semibold text-[var(--text-primary)] mb-3">{engineer}</h3>
              <div className="space-y-2">
                {topTechs.map((tech, idx) => (
                  <div key={idx} className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[var(--text-secondary)]">{tech.tech}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {tech.shared_projects.length} {tech.shared_projects.length === 1 ? 'project' : 'projects'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-[var(--accent)]">{formatHours(tech.shared_hours)}</p>
                      <p className="text-xs text-[var(--text-muted)]">hours</p>
                    </div>
                  </div>
                ))}
                {topTechs.length === 0 && (
                  <p className="text-sm text-[var(--text-muted)] italic">No tech collaborations</p>
                )}
              </div>
            </div>
          );
        })}
    </div>
  );
}
