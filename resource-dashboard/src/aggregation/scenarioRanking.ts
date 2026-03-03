import { db } from '../db/database';
import { PersonRole } from '../types';
import { computeCompatibilityScores } from './skillMatching';
import { getEngineerCapacity } from '../utils/capacity';

export interface EngineerFitResult {
  engineer: string;
  /** 0-100 skill match against project requirements (0 if no requirements defined) */
  skill_score: number;
  /** Average fraction of capacity free across the scenario months (0–1) */
  availability_pct: number;
  /** Weighted composite: 60% skill + 40% availability when requirements exist,
   *  100% availability otherwise */
  fit_score: number;
  /** True for engineers in the top quartile of fit_score */
  recommended: boolean;
}

/**
 * Rank all engineers for a scenario based on skill match + current availability.
 *
 * @param projectId        - Source project ID; used to load skill requirements
 * @param months           - Scenario months to evaluate availability over
 * @param excludeEngineers - Names already assigned; excluded from results
 */
export async function rankEngineersForScenario(
  projectId: string,
  months: string[],
  excludeEngineers: string[] = [],
): Promise<EngineerFitResult[]> {
  if (months.length === 0) return [];

  const [requirements, skills, teamMembers, config, allocations] = await Promise.all([
    db.projectSkillRequirements.where('project_id').equals(projectId).toArray(),
    db.skills.toArray(),
    db.teamMembers.toArray(),
    db.config.get(1),
    db.plannedAllocations.where('month').anyOf(months).toArray(),
  ]);

  const stdCapacity = config?.std_monthly_capacity_hours ?? 140;
  const excluded = new Set(excludeEngineers);

  const engineers = teamMembers.filter(
    m => m.role === PersonRole.Engineer && !excluded.has(m.full_name),
  );
  if (engineers.length === 0) return [];

  // Skill scores (synchronous, returns [] if no requirements)
  const skillScoreMap = new Map<string, number>();
  const hasRequirements = requirements.length > 0;

  if (hasRequirements) {
    const scores = computeCompatibilityScores(requirements, skills, teamMembers);
    for (const { engineer, score } of scores) {
      skillScoreMap.set(engineer, score);
    }
  }

  // Build allocated hours lookup: "engineer|month" → hours
  const allocMap = new Map<string, number>();
  for (const a of allocations) {
    const key = `${a.engineer}|${a.month}`;
    allocMap.set(key, (allocMap.get(key) ?? 0) + a.planned_hours);
  }

  // Score each engineer
  const results: EngineerFitResult[] = engineers.map(member => {
    const capacity = getEngineerCapacity(member, stdCapacity);
    const skill_score = hasRequirements ? (skillScoreMap.get(member.full_name) ?? 0) : 0;

    // Average free-capacity fraction across scenario months
    let totalFree = 0;
    for (const month of months) {
      const allocated = allocMap.get(`${member.full_name}|${month}`) ?? 0;
      const free = Math.max(0, (capacity - allocated) / capacity);
      totalFree += free;
    }
    const availability_pct = totalFree / months.length;

    const fit_score = hasRequirements
      ? 0.6 * skill_score + 0.4 * (availability_pct * 100)
      : availability_pct * 100;

    return {
      engineer: member.full_name,
      skill_score,
      availability_pct,
      fit_score: Math.round(fit_score * 10) / 10,
      recommended: false, // set after sorting
    };
  });

  // Sort descending by fit_score
  results.sort((a, b) => b.fit_score - a.fit_score || a.engineer.localeCompare(b.engineer));

  // Mark top quartile as recommended
  const topN = Math.max(1, Math.ceil(results.length / 4));
  for (let i = 0; i < topN; i++) {
    results[i].recommended = true;
  }

  return results;
}
