import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { PlanningScenario, ScenarioAllocation } from '../types';
import { monthsBetween } from '../dashboard/MonthRangePicker';

/**
 * CRUD hook for What-If planning scenarios.
 * Provides reactive lists and imperative mutation helpers.
 */
export function useScenarios() {
  const scenarios = useLiveQuery(
    () => db.planningScenarios.orderBy('created_at').reverse().toArray(),
    [],
  ) ?? [];

  const activeScenarios = scenarios.filter(s => s.status !== 'archived');

  /** Create a new blank draft scenario and return its id */
  async function createScenario(
    partial: Pick<PlanningScenario, 'name' | 'description' | 'base_month_start' | 'base_month_end'>,
  ): Promise<number> {
    const now = new Date().toISOString();
    const id = await db.planningScenarios.add({
      ...partial,
      status: 'draft',
      created_at: now,
      updated_at: now,
    } as PlanningScenario);
    return id as number;
  }

  /** Patch a subset of fields on an existing scenario */
  async function updateScenario(id: number, updates: Partial<PlanningScenario>): Promise<void> {
    await db.planningScenarios.update(id, {
      ...updates,
      updated_at: new Date().toISOString(),
    });
  }

  /** Promote draft → saved */
  async function saveScenario(id: number): Promise<void> {
    await updateScenario(id, { status: 'saved' });
  }

  /** Soft-delete: move to archived */
  async function archiveScenario(id: number): Promise<void> {
    await updateScenario(id, { status: 'archived' });
  }

  /** Hard-delete scenario and all its allocations */
  async function deleteScenario(id: number): Promise<void> {
    await db.transaction('rw', db.planningScenarios, db.scenarioAllocations, async () => {
      await db.scenarioAllocations.where('scenario_id').equals(id).delete();
      await db.planningScenarios.delete(id);
    });
  }

  /** Duplicate a scenario (deep-copy allocations) and return new id */
  async function duplicateScenario(id: number): Promise<number> {
    const [original, allocations] = await Promise.all([
      db.planningScenarios.get(id),
      db.scenarioAllocations.where('scenario_id').equals(id).toArray(),
    ]);
    if (!original) throw new Error(`Scenario ${id} not found`);

    const now = new Date().toISOString();
    const newId = await db.planningScenarios.add({
      ...original,
      id: undefined,
      name: `${original.name} (copy)`,
      status: 'draft',
      created_at: now,
      updated_at: now,
    } as PlanningScenario) as number;

    if (allocations.length > 0) {
      const newAllocations = allocations.map(a => ({
        ...a,
        id: undefined,
        scenario_id: newId,
      })) as ScenarioAllocation[];
      await db.scenarioAllocations.bulkAdd(newAllocations);
    }

    return newId;
  }

  /**
   * Replace all ScenarioAllocations for a scenario.
   * Runs in a transaction to avoid partial writes.
   */
  async function saveAllocations(
    scenarioId: number,
    allocations: Omit<ScenarioAllocation, 'id'>[],
  ): Promise<void> {
    await db.transaction('rw', db.scenarioAllocations, db.planningScenarios, async () => {
      await db.scenarioAllocations.where('scenario_id').equals(scenarioId).delete();
      await db.scenarioAllocations.bulkAdd(allocations as ScenarioAllocation[]);
      await db.planningScenarios.update(scenarioId, { updated_at: new Date().toISOString() });
    });
  }

  /** Load all allocations for a scenario */
  async function getScenarioAllocations(scenarioId: number): Promise<ScenarioAllocation[]> {
    return db.scenarioAllocations.where('scenario_id').equals(scenarioId).toArray();
  }

  /**
   * Derive the list of YYYY-MM months covered by a scenario's date range.
   */
  function getScenarioMonths(scenario: PlanningScenario): string[] {
    if (!scenario.base_month_start || !scenario.base_month_end) return [];
    return monthsBetween(scenario.base_month_start, scenario.base_month_end);
  }

  return {
    scenarios,
    activeScenarios,
    loading: scenarios === undefined,
    createScenario,
    updateScenario,
    saveScenario,
    archiveScenario,
    deleteScenario,
    duplicateScenario,
    saveAllocations,
    getScenarioAllocations,
    getScenarioMonths,
  };
}
