import { createContext, useCallback, useContext } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { MonthFilter } from '../utils/monthRange';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ViewFilters {
  /** Single month in display format: "2026-01" */
  month?: string;
  /** Multi-month range in display format: ["2026-01", "2026-02"] */
  dateRange?: string[];
  /** Parent project code: "R1234" */
  project?: string;
  /** Engineer full name: "John Smith" */
  engineer?: string;
}

export interface ViewFilterContextValue {
  filters: ViewFilters;
  setFilters: (updates: Partial<ViewFilters>) => void;
  /** Resolved MonthFilter passed to aggregation functions */
  monthFilter: MonthFilter | undefined;
  /** Single selected month (display format), undefined when range or all-time */
  selectedMonth: string | undefined;
  selectedProject: string | undefined;
  selectedEngineer: string | undefined;
  isRange: boolean;
}

// ── Context ────────────────────────────────────────────────────────────────

export const ViewFilterContext = createContext<ViewFilterContextValue | null>(null);

/**
 * Convenience hook: reads ViewFilterContext.
 * Drop-in replacement for useMonthFilter(), plus selectedEngineer.
 */
export function useFilters(): ViewFilterContextValue {
  const ctx = useContext(ViewFilterContext);
  if (!ctx) throw new Error('useFilters must be used within a ViewFilterProvider');
  return ctx;
}

// ── Dexie-backed Provider (for DashboardPageV3 backward compat) ───────────

/**
 * Reads filter state from the Dexie config singleton (id=1).
 * Used by DashboardPageV3 so that the existing DashboardHeader
 * (which writes to Dexie) continues to drive all panels.
 *
 * Phase 2 view pages will use UrlViewFilterProvider instead.
 */
export function DexieViewFilterProvider({ children }: { children: React.ReactNode }) {
  const config = useLiveQuery(() => db.config.get(1));

  const dateRange = config?.selected_date_range;
  const selectedMonth = config?.selected_month || undefined;
  const selectedProject = config?.selected_project || undefined;

  let monthFilter: MonthFilter | undefined;
  let isRange = false;

  if (dateRange && dateRange.months.length > 0) {
    if (dateRange.months.length === 1) {
      monthFilter = dateRange.months[0];
    } else {
      monthFilter = dateRange.months;
      isRange = true;
    }
  } else if (selectedMonth) {
    monthFilter = selectedMonth;
  }

  const setFilters = useCallback((updates: Partial<ViewFilters>) => {
    const dbUpdates: Record<string, string> = {};
    if ('month' in updates) dbUpdates.selected_month = updates.month ?? '';
    if ('project' in updates) dbUpdates.selected_project = updates.project ?? '';
    if (Object.keys(dbUpdates).length > 0) {
      db.config.update(1, dbUpdates).catch(console.error);
    }
  }, []);

  const value: ViewFilterContextValue = {
    filters: {
      month: selectedMonth,
      dateRange: isRange ? (monthFilter as string[]) : undefined,
      project: selectedProject,
      engineer: undefined,
    },
    setFilters,
    monthFilter,
    selectedMonth,
    selectedProject,
    selectedEngineer: undefined,
    isRange,
  };

  return (
    <ViewFilterContext.Provider value={value}>
      {children}
    </ViewFilterContext.Provider>
  );
}
