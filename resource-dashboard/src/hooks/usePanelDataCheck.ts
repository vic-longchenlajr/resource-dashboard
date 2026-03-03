import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useFilters } from '../context/ViewFilterContext';

/**
 * Lightweight check: does the required data exist for a panel to render meaningfully?
 * Returns true if the panel should be shown, false if it should be hidden.
 *
 * This is NOT the old toggle system — users cannot control this.
 * Panels auto-hide when their required data is missing and auto-show when it's populated.
 */
export function usePanelDataCheck(panelId: string): boolean {
  const { selectedProject, monthFilter } = useFilters();

  // Run all checks reactively — Dexie queries re-run when data changes
  const result = useLiveQuery(async () => {
    switch (panelId) {

      case 'skill-heatmap': {
        // rating is not indexed — filter in JS
        const skills = await db.skills.toArray();
        return skills.some(s => s.rating > 0);
      }

      case 'milestone-timeline': {
        // At least one milestone row with a non-null date
        const milestones = await db.milestones.toArray();
        return milestones.some(m => m.dr1 || m.dr2 || m.dr3 || m.launch);
      }

      case 'capacity-forecast': {
        const count = await db.plannedAllocations.count();
        return count > 0;
      }

      case 'utilization-heatmap': {
        const [allocCount, memberCount] = await Promise.all([
          db.plannedAllocations.count(),
          db.teamMembers.count(),
        ]);
        return allocCount > 0 && memberCount > 0;
      }

      case 'allocation-compliance': {
        // Need planned allocations for the selected month
        if (!monthFilter) return false;
        const months = Array.isArray(monthFilter) ? monthFilter : [monthFilter];
        const count = await db.plannedAllocations
          .where('month')
          .anyOf(months)
          .count();
        return count > 0;
      }

      case 'npd-project-comp': {
        const [allocCount, tsCount] = await Promise.all([
          db.plannedAllocations.count(),
          db.timesheets.count(),
        ]);
        return allocCount > 0 && tsCount > 0;
      }

      case 'project-timeline': {
        // Need a specific project to be selected
        return !!selectedProject;
      }

      case 'kpi-trends': {
        const count = await db.kpiHistory.count();
        return count >= 2;
      }

      case 'tech-affinity': {
        const members = await db.teamMembers.toArray();
        const hasLabTech = members.some(m => m.role === 'Lab Technician');
        const hasEngineer = members.some(m => m.role === 'Engineer');
        return hasLabTech && hasEngineer;
      }

      default:
        // All other panels handle empty data gracefully with their own "no data" messages
        return true;
    }
  }, [panelId, selectedProject, monthFilter]);

  // While loading (undefined), optimistically show the panel
  return result !== false;
}
