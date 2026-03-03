import type { TeamMember } from '../types';

/**
 * Get the effective monthly capacity for a team member.
 * Uses capacity_override_hours when set; falls back to the global standard.
 */
export function getEngineerCapacity(member: TeamMember, stdCapacity: number): number {
  return member.capacity_override_hours > 0
    ? member.capacity_override_hours
    : stdCapacity;
}
