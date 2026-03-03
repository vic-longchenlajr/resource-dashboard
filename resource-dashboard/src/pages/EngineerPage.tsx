import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { ViewHeader } from '../dashboard/ViewHeader';
import { ViewFilterContext, useFilters } from '../context/ViewFilterContext';
import type { ViewFilterContextValue } from '../context/ViewFilterContext';
import { PanelWrapper } from '../dashboard/PanelWrapper';
import { PanelErrorBoundary } from '../dashboard/PanelErrorBoundary';
import { usePanelDataCheck } from '../hooks/usePanelDataCheck';
import { EmployeeHeaderCard } from '../dashboard/panels/EmployeeHeaderCard';
import { HoursByActivityPanel } from '../dashboard/panels/HoursByActivityPanel';
import { UtilizationTrendPanel } from '../dashboard/panels/UtilizationTrendPanel';
import { ProjectPortfolioPanel } from '../dashboard/panels/ProjectPortfolioPanel';
import { FocusScorePanel } from '../dashboard/panels/FocusScorePanel';
import { MeetingTaxPanel } from '../dashboard/panels/MeetingTaxPanel';
import { AnomalyAlertsPanel } from '../dashboard/panels/AnomalyAlertsPanel';
import { SkillHeatmapPanel } from '../dashboard/panels/SkillHeatmapPanel';
import { TechAffinityPanel } from '../dashboard/panels/TechAffinityPanel';
import { PersonRole } from '../types';

/**
 * Inner provider that shadows the outer DexieViewFilterProvider with the
 * selected engineer so all child panels see it via useFilters().
 */
function EngineerViewProvider({
  children,
  engineer,
}: {
  children: React.ReactNode;
  engineer: string | undefined;
}) {
  const base = useFilters(); // reads outer DexieViewFilterProvider
  const value: ViewFilterContextValue = {
    ...base,
    selectedEngineer: engineer,
    filters: { ...base.filters, engineer },
  };
  return (
    <ViewFilterContext.Provider value={value}>{children}</ViewFilterContext.Provider>
  );
}

/** Team roster shown when no engineer is selected. */
function TeamRoster({ onSelect }: { onSelect: (name: string) => void }) {
  const members = useLiveQuery(() => db.teamMembers.toArray());

  if (!members) {
    return <div className="animate-pulse h-32 bg-[var(--border-subtle)] rounded-lg" />;
  }

  const engineers = members.filter(m => m.role === PersonRole.Engineer);
  const labTechs = members.filter(m => m.role === PersonRole.LabTechnician);

  if (!members.length) {
    return (
      <div className="text-center py-16 text-[var(--text-muted)]">
        <p className="text-[13px]">No team members configured. Import timesheet data to get started.</p>
      </div>
    );
  }

  const RoleSection = ({
    title,
    people,
  }: {
    title: string;
    people: typeof members;
  }) => (
    <div>
      <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
        {title} ({people.length})
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {people.map(m => (
          <button
            key={m.person_id}
            onClick={() => onSelect(m.full_name)}
            className="flex items-center gap-2 p-2 rounded-lg border border-[var(--border-default)] hover:border-[var(--accent)] hover:bg-[var(--accent-light)] transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--accent-light)] flex items-center justify-center text-[var(--accent)] font-bold text-[12px] flex-shrink-0">
              {m.full_name
                .split(' ')
                .map((n: string) => n[0])
                .slice(0, 2)
                .join('')}
            </div>
            <span className="text-[12px] font-medium text-[var(--text-primary)] truncate">
              {m.full_name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {engineers.length > 0 && (
        <RoleSection title="Engineers" people={engineers} />
      )}
      {labTechs.length > 0 && (
        <RoleSection title="Lab Technicians" people={labTechs} />
      )}
    </div>
  );
}

function EngineerPageContent({
  engineer,
  onEngineerChange,
}: {
  engineer: string | undefined;
  onEngineerChange: (name: string) => void;
}) {
  const navigate = useNavigate();
  const showSkillHeatmap = usePanelDataCheck('skill-heatmap');
  const showTechAffinity = usePanelDataCheck('tech-affinity');

  const handleProjectClick = (projectId: string) => {
    navigate(`/dashboard/planning/${encodeURIComponent(projectId)}`);
  };

  return (
    <div>
      <ViewHeader
        title="Engineer Profile"
        showEngineerFilter
        engineerValue={engineer ?? ''}
        onEngineerChange={onEngineerChange}
      />

      {engineer ? (
        <div className="space-y-4">
          {/* Row 1: Header card (full width) */}
          <EmployeeHeaderCard />

          {/* Row 2: 2-col grid — donut + utilization trend */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PanelWrapper id="hours-by-activity" title="Hours by Activity">
              <PanelErrorBoundary panelId="hours-by-activity">
                <HoursByActivityPanel />
              </PanelErrorBoundary>
            </PanelWrapper>

            <PanelWrapper id="utilization-trend" title="Utilization Trend (Last 12 Months)">
              <PanelErrorBoundary panelId="utilization-trend">
                <UtilizationTrendPanel />
              </PanelErrorBoundary>
            </PanelWrapper>
          </div>

          {/* Row 3: Project portfolio (full width) */}
          <div className="grid grid-cols-1 gap-4">
            <PanelWrapper id="project-portfolio" title="Project Portfolio">
              <PanelErrorBoundary panelId="project-portfolio">
                <ProjectPortfolioPanel
                  onProjectClick={handleProjectClick}
                />
              </PanelErrorBoundary>
            </PanelWrapper>
          </div>

          {/* Row 4: Focus score + Meeting tax */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PanelWrapper id="focus-score" title="Focus Score">
              <PanelErrorBoundary panelId="focus-score">
                <FocusScorePanel />
              </PanelErrorBoundary>
            </PanelWrapper>

            <PanelWrapper id="meeting-tax" title="Meeting & Admin Overhead">
              <PanelErrorBoundary panelId="meeting-tax">
                <MeetingTaxPanel />
              </PanelErrorBoundary>
            </PanelWrapper>
          </div>

          {/* Row 5: Anomaly alerts (full width) */}
          <div className="grid grid-cols-1 gap-4">
            <PanelWrapper id="anomaly-alerts-engineer" title="Alerts & Anomalies">
              <PanelErrorBoundary panelId="anomaly-alerts-engineer">
                <AnomalyAlertsPanel />
              </PanelErrorBoundary>
            </PanelWrapper>
          </div>

          {/* Conditional: Skill heatmap + Tech affinity */}
          {showSkillHeatmap && (
            <div className="grid grid-cols-1 gap-4">
              <PanelWrapper id="skill-heatmap-engineer" title="Skills">
                <PanelErrorBoundary panelId="skill-heatmap-engineer">
                  <SkillHeatmapPanel />
                </PanelErrorBoundary>
              </PanelWrapper>
            </div>
          )}

          {showTechAffinity && (
            <div className="grid grid-cols-1 gap-4">
              <PanelWrapper id="tech-affinity-engineer" title="Lab Tech Collaboration">
                <PanelErrorBoundary panelId="tech-affinity-engineer">
                  <TechAffinityPanel />
                </PanelErrorBoundary>
              </PanelWrapper>
            </div>
          )}
        </div>
      ) : (
        /* No engineer selected — show team roster */
        <div className="mt-6">
          <p className="text-[13px] text-[var(--text-muted)] mb-4">
            Select an engineer from the dropdown above or click a name below to view their profile.
          </p>
          <TeamRoster onSelect={onEngineerChange} />
        </div>
      )}
    </div>
  );
}

export function EngineerPage() {
  const { fullName } = useParams<{ fullName?: string }>();
  const navigate = useNavigate();

  const engineer = fullName ? decodeURIComponent(fullName) : undefined;

  const handleEngineerChange = (name: string) => {
    if (name) {
      navigate(`/dashboard/engineer/${encodeURIComponent(name)}`, { replace: true });
    } else {
      navigate('/dashboard/engineer', { replace: true });
    }
  };

  return (
    <EngineerViewProvider engineer={engineer}>
      <EngineerPageContent
        engineer={engineer}
        onEngineerChange={handleEngineerChange}
      />
    </EngineerViewProvider>
  );
}
