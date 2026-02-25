import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { DashboardHeader } from '../dashboard/DashboardHeader';
import { PanelToggleDrawer } from '../dashboard/PanelToggleDrawer';
import { PanelWrapper } from '../dashboard/PanelWrapper';
import { ExportConfigModal } from '../export/ExportConfigModal';
import { db } from '../db/database';
import { KPISummaryPanel } from '../dashboard/panels/KPISummaryPanel';
import { SkillHeatmapPanel } from '../dashboard/panels/SkillHeatmapPanel';
import { LabTechHoursPanel } from '../dashboard/panels/LabTechHoursPanel';
import { EngineerBreakdownPanel } from '../dashboard/panels/EngineerBreakdownPanel';
import { NPDProjectComparisonPanel } from '../dashboard/panels/NPDProjectComparisonPanel';
import { ProjectBurndownPanel } from '../dashboard/panels/ProjectBurndownPanel';
import { TechAffinityPanel } from '../dashboard/panels/TechAffinityPanel';
import { NPDMilestonesPanel } from '../dashboard/panels/NPDMilestonesPanel';
import { NarrativeSummaryPanel } from '../dashboard/panels/NarrativeSummaryPanel';
import { AnomalyAlertsPanel } from '../dashboard/panels/AnomalyAlertsPanel';
import { FocusScorePanel } from '../dashboard/panels/FocusScorePanel';
import { BusFactorPanel } from '../dashboard/panels/BusFactorPanel';
import { MeetingTaxPanel } from '../dashboard/panels/MeetingTaxPanel';
import { AllocationCompliancePanel } from '../dashboard/panels/AllocationCompliancePanel';
import { KPITrendPanel } from '../dashboard/panels/KPITrendPanel';
import { CapacityForecastPanel } from '../dashboard/panels/CapacityForecastPanel';
import { PlannedVsActualPanel } from '../dashboard/panels/PlannedVsActualPanel';
import { FirefightingTrendPanel } from '../dashboard/panels/FirefightingTrendPanel';
import { UtilizationHeatmapPanel } from '../dashboard/panels/UtilizationHeatmapPanel';
import { usePanelConfig } from '../dashboard/hooks/usePanelConfig';
import { usePanelAvailability } from '../hooks/usePanelAvailability';
import { PanelErrorBoundary } from '../dashboard/PanelErrorBoundary';

// Panels that should span the full 2-column grid width
const PANEL_FULL_WIDTH = new Set([
  'kpi-summary',
  'narrative-summary',
  'anomaly-alerts',
  'kpi-trends',
  'planned-vs-actual',
  'utilization-heatmap',
  'npd-project-comp',
  'skill-heatmap',
  'milestone-timeline',
  'engineer-breakdown',
  'project-timeline',
  'tech-affinity',
  'allocation-compliance',
  'capacity-forecast',
]);

export function DashboardPageV3() {
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const { panels, isPanelEnabled } = usePanelConfig();
  const config = useLiveQuery(() => db.config.get(1));
  const entriesCount = useLiveQuery(() => db.timesheets.count());
  const selectedMonth = config?.selected_month || undefined;
  const selectedProject = config?.selected_project || undefined;
  const availability = usePanelAvailability(selectedMonth, selectedProject);

  const isLoading = config === undefined || entriesCount === undefined;
  const hasData = entriesCount !== undefined && entriesCount > 0;

  // ── Filter-change transition overlay ──
  const [isTransitioning, setIsTransitioning] = useState(false);
  const filterKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${selectedMonth ?? ''}|${selectedProject ?? ''}`;
    if (filterKeyRef.current !== null && filterKeyRef.current !== key) {
      setIsTransitioning(true);
    }
    filterKeyRef.current = key;
  }, [selectedMonth, selectedProject]);

  useEffect(() => {
    if (!isTransitioning) return;
    let cancelled = false;

    // Wait a minimum display time, then clear once the browser is idle
    // (all panel queries and aggregations have finished)
    const minTimer = setTimeout(() => {
      if (cancelled) return;
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => {
          if (!cancelled) setIsTransitioning(false);
        }, { timeout: 2000 });
      } else {
        // Safari fallback
        setTimeout(() => { if (!cancelled) setIsTransitioning(false); }, 300);
      }
    }, 200);

    return () => { cancelled = true; clearTimeout(minTimer); };
  }, [isTransitioning]);

  const sortedPanels = [...panels].sort((a, b) => a.order - b.order);

  // Map panel IDs to their rendered output
  function renderPanel(id: string): React.ReactNode {
    if (!isPanelEnabled(id)) return null;
    const avail = availability.find(a => a.panelId === id);
    if (avail && !avail.available) return null;
    const wide = PANEL_FULL_WIDTH.has(id) ? 'lg:col-span-2' : undefined;

    switch (id) {
      case 'kpi-summary':
        return (
          <PanelWrapper id="kpi-summary" title="KPI Summary Cards" className={wide}>
            <PanelErrorBoundary panelId="kpi-summary">
              <KPISummaryPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        );
      case 'narrative-summary':
        return (
          <PanelWrapper id="narrative-summary" title="Monthly Narrative Summary" className={wide}>
            <PanelErrorBoundary panelId="narrative-summary">
              <NarrativeSummaryPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        );
      case 'anomaly-alerts':
        return (
          <PanelWrapper id="anomaly-alerts" title="Alerts & Anomalies" className={wide}>
            <PanelErrorBoundary panelId="anomaly-alerts">
              <AnomalyAlertsPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        );
      case 'kpi-trends':
        return (
          <PanelWrapper id="kpi-trends" title="KPI Trends" className={wide}>
            <PanelErrorBoundary panelId="kpi-trends">
              <KPITrendPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        );
      case 'planned-vs-actual':
        return (
          <PanelWrapper id="planned-vs-actual" title="Planned vs Actual (NPD/Sustaining/Sprint)" className={wide}>
            <PanelErrorBoundary panelId="planned-vs-actual">
              <PlannedVsActualPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        );
      case 'firefighting-trend':
        return (
          <PanelWrapper id="firefighting-trend" title="Firefighting (Unplanned) Hours" className={wide}>
            <PanelErrorBoundary panelId="firefighting-trend">
              <FirefightingTrendPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        );
      case 'utilization-heatmap':
        return (
          <PanelWrapper id="utilization-heatmap" title="Planned Utilization Heatmap" className={wide}>
            <PanelErrorBoundary panelId="utilization-heatmap">
              <UtilizationHeatmapPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        );
      case 'capacity-forecast':
        return (
          <PanelWrapper id="capacity-forecast" title="Capacity Forecast" className={wide}>
            <PanelErrorBoundary panelId="capacity-forecast">
              <CapacityForecastPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        );
      case 'npd-project-comp':
        return (
          <PanelWrapper id="npd-project-comp" title="NPD Projects: Planned vs Actual" className={wide}>
            <PanelErrorBoundary panelId="npd-project-comp">
              <NPDProjectComparisonPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        );
      case 'milestone-timeline':
        return (
          <PanelWrapper id="milestone-timeline" title="NPD Milestones" className={wide}>
            <PanelErrorBoundary panelId="milestone-timeline">
              <NPDMilestonesPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        );
      case 'project-timeline':
        return (
          <PanelWrapper id="project-timeline" title="Selected Project Timeline" className={wide}>
            <PanelErrorBoundary panelId="project-timeline">
              <ProjectBurndownPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        );
      case 'skill-heatmap':
        return (
          <PanelWrapper id="skill-heatmap" title="Skill Heat Map" className={wide}>
            <PanelErrorBoundary panelId="skill-heatmap">
              <SkillHeatmapPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        );
      case 'lab-tech-hours':
        return (
          <PanelWrapper id="lab-tech-hours" title="Lab Tech Hours by Engineer" className={wide}>
            <PanelErrorBoundary panelId="lab-tech-hours">
              <LabTechHoursPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        );
      case 'engineer-breakdown':
        return (
          <PanelWrapper id="engineer-breakdown" title="Engineer Hour Breakdown" className={wide}>
            <PanelErrorBoundary panelId="engineer-breakdown">
              <EngineerBreakdownPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        );
      case 'tech-affinity':
        return (
          <PanelWrapper id="tech-affinity" title="Tech Collaboration Affinity" className={wide}>
            <PanelErrorBoundary panelId="tech-affinity">
              <TechAffinityPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        );
      case 'focus-score':
        return (
          <PanelWrapper id="focus-score" title="Focus Score" className={wide}>
            <PanelErrorBoundary panelId="focus-score">
              <FocusScorePanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        );
      case 'bus-factor':
        return (
          <PanelWrapper id="bus-factor" title="Knowledge Risk (Bus Factor)" className={wide}>
            <PanelErrorBoundary panelId="bus-factor">
              <BusFactorPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        );
      case 'meeting-tax':
        return (
          <PanelWrapper id="meeting-tax" title="Meeting & Admin Tax" className={wide}>
            <PanelErrorBoundary panelId="meeting-tax">
              <MeetingTaxPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        );
      case 'allocation-compliance':
        return (
          <PanelWrapper id="allocation-compliance" title="Allocation Compliance" className={wide}>
            <PanelErrorBoundary panelId="allocation-compliance">
              <AllocationCompliancePanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        );
      default:
        return null;
    }
  }

  return (
    <div>
      <DashboardHeader
        onTogglePanels={() => setDrawerOpen(true)}
        onExport={() => setExportModalOpen(true)}
      />
      <PanelToggleDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} availability={availability} />
      <ExportConfigModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        selectedMonth={config?.selected_month || ''}
        availability={availability}
      />

      {isLoading ? (
        /* Skeleton loading state */
        <DashboardSkeleton />
      ) : !hasData ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg className="w-12 h-12 text-[var(--text-muted)] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">
            No data to display
          </h2>
          <p className="text-[13px] text-[var(--text-muted)] max-w-sm">
            Import a LiquidPlanner CSV export to populate the dashboard, or select a month from the dropdown above.
          </p>
          <button
            onClick={() => navigate('/import')}
            className="mt-4 text-[13px] font-medium px-4 py-2 rounded-md text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors"
          >
            Go to Import
          </button>
        </div>
      ) : (
        <div className="relative">
          {isTransitioning && <TransitionOverlay />}
          <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 transition-opacity duration-150 ${isTransitioning ? 'opacity-40 pointer-events-none' : ''}`}>
            {sortedPanels.map(panel => {
              const node = renderPanel(panel.id);
              if (!node) return null;
              return <React.Fragment key={panel.id}>{node}</React.Fragment>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TransitionOverlay() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div className="flex items-center gap-2.5 px-4 py-2 bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-full shadow-sm pointer-events-auto">
        <svg className="animate-spin h-4 w-4 text-[var(--accent)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-[13px] text-[var(--text-muted)]">Refreshing panels...</span>
      </div>
    </div>
  );
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-lg overflow-hidden ${className}`}>
      <div className="px-3 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-table-header)]">
        <div className="h-3 w-32 rounded bg-[var(--border-default)]" />
      </div>
      <div className="p-3 space-y-3">
        <div className="h-4 w-3/4 rounded bg-[var(--border-subtle)]" />
        <div className="h-4 w-1/2 rounded bg-[var(--border-subtle)]" />
        <div className="h-24 rounded bg-[var(--border-subtle)]" />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* KPI row - full width */}
      <div className="lg:col-span-2 animate-pulse bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-lg overflow-hidden">
        <div className="px-3 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-table-header)]">
          <div className="h-3 w-28 rounded bg-[var(--border-default)]" />
        </div>
        <div className="p-3 flex gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex-1 h-16 rounded bg-[var(--border-subtle)]" />
          ))}
        </div>
      </div>
      {/* Narrative - full width */}
      <SkeletonBlock className="lg:col-span-2" />
      {/* Mixed panels */}
      <SkeletonBlock className="lg:col-span-2" />
      <SkeletonBlock />
      <SkeletonBlock />
      <SkeletonBlock className="lg:col-span-2" />
    </div>
  );
}
