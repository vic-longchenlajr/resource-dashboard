import { ViewHeader } from '../dashboard/ViewHeader';
import { PanelWrapper } from '../dashboard/PanelWrapper';
import { PanelErrorBoundary } from '../dashboard/PanelErrorBoundary';
import { SkillHeatmapPanel } from '../dashboard/panels/SkillHeatmapPanel';
import { LabTechHoursPanel } from '../dashboard/panels/LabTechHoursPanel';
import { EngineerBreakdownPanel } from '../dashboard/panels/EngineerBreakdownPanel';
import { TechAffinityPanel } from '../dashboard/panels/TechAffinityPanel';
import { FocusScorePanel } from '../dashboard/panels/FocusScorePanel';
import { BusFactorPanel } from '../dashboard/panels/BusFactorPanel';
import { MeetingTaxPanel } from '../dashboard/panels/MeetingTaxPanel';
import { AllocationCompliancePanel } from '../dashboard/panels/AllocationCompliancePanel';

const FULL_WIDTH = 'lg:col-span-2';

export function TeamPage() {
  return (
    <div>
      <ViewHeader title="Team Health" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PanelWrapper id="skill-heatmap" title="Skill Heat Map" className={FULL_WIDTH}>
          <PanelErrorBoundary panelId="skill-heatmap">
            <SkillHeatmapPanel />
          </PanelErrorBoundary>
        </PanelWrapper>

        <PanelWrapper id="lab-tech-hours" title="Lab Tech Hours by Engineer">
          <PanelErrorBoundary panelId="lab-tech-hours">
            <LabTechHoursPanel />
          </PanelErrorBoundary>
        </PanelWrapper>

        <PanelWrapper id="focus-score" title="Focus Score">
          <PanelErrorBoundary panelId="focus-score">
            <FocusScorePanel />
          </PanelErrorBoundary>
        </PanelWrapper>

        <PanelWrapper id="engineer-breakdown" title="Engineer Hour Breakdown" className={FULL_WIDTH}>
          <PanelErrorBoundary panelId="engineer-breakdown">
            <EngineerBreakdownPanel />
          </PanelErrorBoundary>
        </PanelWrapper>

        <PanelWrapper id="tech-affinity" title="Tech Collaboration Affinity" className={FULL_WIDTH}>
          <PanelErrorBoundary panelId="tech-affinity">
            <TechAffinityPanel />
          </PanelErrorBoundary>
        </PanelWrapper>

        <PanelWrapper id="bus-factor" title="Knowledge Risk (Bus Factor)">
          <PanelErrorBoundary panelId="bus-factor">
            <BusFactorPanel />
          </PanelErrorBoundary>
        </PanelWrapper>

        <PanelWrapper id="meeting-tax" title="Meeting & Admin Tax">
          <PanelErrorBoundary panelId="meeting-tax">
            <MeetingTaxPanel />
          </PanelErrorBoundary>
        </PanelWrapper>

        <PanelWrapper id="allocation-compliance" title="Allocation Compliance" className={FULL_WIDTH}>
          <PanelErrorBoundary panelId="allocation-compliance">
            <AllocationCompliancePanel />
          </PanelErrorBoundary>
        </PanelWrapper>
      </div>
    </div>
  );
}
