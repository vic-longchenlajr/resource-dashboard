import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import { usePanelDataCheck } from '../hooks/usePanelDataCheck';
import { ViewHeader } from '../dashboard/ViewHeader';
import { PanelWrapper } from '../dashboard/PanelWrapper';
import { PanelErrorBoundary } from '../dashboard/PanelErrorBoundary';
import { PlannedVsActualPanel } from '../dashboard/panels/PlannedVsActualPanel';
import { FirefightingTrendPanel } from '../dashboard/panels/FirefightingTrendPanel';
import { UtilizationHeatmapPanel } from '../dashboard/panels/UtilizationHeatmapPanel';
import { CapacityForecastPanel } from '../dashboard/panels/CapacityForecastPanel';
import { NPDProjectComparisonPanel } from '../dashboard/panels/NPDProjectComparisonPanel';
import { NPDMilestonesPanel } from '../dashboard/panels/NPDMilestonesPanel';
import { ProjectBurndownPanel } from '../dashboard/panels/ProjectBurndownPanel';

const FULL_WIDTH = 'lg:col-span-2';

export function PlanningPage() {
  const { projectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();

  // Sync URL param → Dexie config so all panels react to it
  useEffect(() => {
    if (projectId) {
      const decoded = decodeURIComponent(projectId);
      db.config.update(1, { selected_project: decoded }).catch(console.error);
    }
  }, [projectId]);

  const handleProjectChange = (id: string) => {
    db.config.update(1, { selected_project: id }).catch(console.error);
    if (id) {
      navigate(`/dashboard/planning/${encodeURIComponent(id)}`, { replace: true });
    } else {
      navigate('/dashboard/planning', { replace: true });
    }
  };

  const showUtilization = usePanelDataCheck('utilization-heatmap');
  const showCapacity = usePanelDataCheck('capacity-forecast');
  const showNpdComp = usePanelDataCheck('npd-project-comp');
  const showMilestones = usePanelDataCheck('milestone-timeline');
  const showProjectTimeline = usePanelDataCheck('project-timeline');

  return (
    <div>
      <ViewHeader title="Planning & Resources" onProjectChange={handleProjectChange} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PanelWrapper id="planned-vs-actual" title="Planned vs Actual (NPD/Sustaining/Sprint)" className={FULL_WIDTH}>
          <PanelErrorBoundary panelId="planned-vs-actual">
            <PlannedVsActualPanel />
          </PanelErrorBoundary>
        </PanelWrapper>

        <PanelWrapper id="firefighting-trend" title="Firefighting (Unplanned) Hours">
          <PanelErrorBoundary panelId="firefighting-trend">
            <FirefightingTrendPanel />
          </PanelErrorBoundary>
        </PanelWrapper>

        {showUtilization && (
          <PanelWrapper id="utilization-heatmap" title="Planned Utilization Heatmap" className={FULL_WIDTH}>
            <PanelErrorBoundary panelId="utilization-heatmap">
              <UtilizationHeatmapPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        )}

        {showCapacity && (
          <PanelWrapper id="capacity-forecast" title="Capacity Forecast" className={FULL_WIDTH}>
            <PanelErrorBoundary panelId="capacity-forecast">
              <CapacityForecastPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        )}

        {showNpdComp && (
          <PanelWrapper id="npd-project-comp" title="NPD Projects: Planned vs Actual" className={FULL_WIDTH}>
            <PanelErrorBoundary panelId="npd-project-comp">
              <NPDProjectComparisonPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        )}

        {showMilestones && (
          <PanelWrapper id="milestone-timeline" title="NPD Milestones" className={FULL_WIDTH}>
            <PanelErrorBoundary panelId="milestone-timeline">
              <NPDMilestonesPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        )}

        {showProjectTimeline && (
          <PanelWrapper id="project-timeline" title="Selected Project Timeline" className={FULL_WIDTH}>
            <PanelErrorBoundary panelId="project-timeline">
              <ProjectBurndownPanel />
            </PanelErrorBoundary>
          </PanelWrapper>
        )}
      </div>
    </div>
  );
}
