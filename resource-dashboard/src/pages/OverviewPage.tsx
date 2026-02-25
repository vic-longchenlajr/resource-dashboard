import { ViewHeader } from '../dashboard/ViewHeader';
import { PanelWrapper } from '../dashboard/PanelWrapper';
import { PanelErrorBoundary } from '../dashboard/PanelErrorBoundary';
import { KPISummaryPanel } from '../dashboard/panels/KPISummaryPanel';
import { NarrativeSummaryPanel } from '../dashboard/panels/NarrativeSummaryPanel';
import { AnomalyAlertsPanel } from '../dashboard/panels/AnomalyAlertsPanel';
import { KPITrendPanel } from '../dashboard/panels/KPITrendPanel';

export function OverviewPage() {
  return (
    <div>
      <ViewHeader title="Overview" />
      <div className="flex flex-col gap-4">
        <PanelWrapper id="kpi-summary" title="KPI Summary Cards">
          <PanelErrorBoundary panelId="kpi-summary">
            <KPISummaryPanel />
          </PanelErrorBoundary>
        </PanelWrapper>

        <PanelWrapper id="narrative-summary" title="Monthly Narrative Summary">
          <PanelErrorBoundary panelId="narrative-summary">
            <NarrativeSummaryPanel />
          </PanelErrorBoundary>
        </PanelWrapper>

        <PanelWrapper id="anomaly-alerts" title="Alerts & Anomalies">
          <PanelErrorBoundary panelId="anomaly-alerts">
            <AnomalyAlertsPanel />
          </PanelErrorBoundary>
        </PanelWrapper>

        <PanelWrapper id="kpi-trends" title="KPI Trends">
          <PanelErrorBoundary panelId="kpi-trends">
            <KPITrendPanel />
          </PanelErrorBoundary>
        </PanelWrapper>
      </div>
    </div>
  );
}
