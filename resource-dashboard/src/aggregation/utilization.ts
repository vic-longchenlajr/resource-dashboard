import { db } from '../db/database';
import { PersonRole } from '../types';
import type { UtilizationCell } from '../types';
import { getProjectParent } from './projectUtils';
import { getEngineerCapacity } from '../utils/capacity';

/**
 * Compute planned utilization heatmap for engineers.
 * For each engineer × month, calculate: total_planned_hours / capacity.
 *
 * @param projectFilter - Optional: when set, show only engineers who have
 *   allocations for this project. Their full utilization is shown (all projects)
 *   so you can see their overall load, scoped to relevant people.
 */
export async function computePlannedUtilization(projectFilter?: string): Promise<UtilizationCell[]> {
  const members = await db.teamMembers.where('role').equals(PersonRole.Engineer).toArray();
  const config = await db.config.get(1);
  const allocations = await db.plannedAllocations.toArray();
  const defaultCapacity = config?.std_monthly_capacity_hours ?? 140;

  // When a project is selected, only show engineers allocated to that project
  let relevantMembers = members;
  if (projectFilter) {
    const engineersOnProject = new Set(
      allocations
        .filter(a =>
          a.project_id === projectFilter ||
          getProjectParent(a.project_id) === projectFilter
        )
        .map(a => a.engineer)
    );
    relevantMembers = members.filter(m => engineersOnProject.has(m.full_name));
  }

  // Get all unique months from allocations
  const months = [...new Set(allocations.map(a => a.month))];

  const result: UtilizationCell[] = [];

  for (const member of relevantMembers) {
    const capacity = getEngineerCapacity(member, defaultCapacity);

    for (const month of months) {
      // Show full utilization (all projects) for the filtered engineers
      const monthAllocations = allocations.filter(
        a => a.month === month && a.engineer === member.full_name
      );
      const totalPlanned = monthAllocations.reduce((sum, a) => sum + a.planned_hours, 0);

      result.push({
        engineer: member.full_name,
        month,
        total_planned_hours: totalPlanned,
        capacity,
        utilization_pct: capacity > 0 ? totalPlanned / capacity : 0,
      });
    }
  }

  return result;
}
