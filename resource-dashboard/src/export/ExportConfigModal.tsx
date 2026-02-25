import { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { exportExecutivePDF } from './executivePDFExport';
import type { PDFExportSections } from '../types';

interface PanelAvailability {
  panelId: string;
  available: boolean;
}

interface ExportConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMonth: string;
  availability?: PanelAvailability[];
}

// Chart panels that can be included in the PDF export
const PANEL_LABELS: Record<string, string> = {
  'engineer-breakdown':    'Engineer Hour Breakdown',
  'npd-project-comp':      'NPD Projects: Planned vs Actual',
  'planned-vs-actual':     'Planned vs Actual (NPD/Sustaining)',
  'firefighting-trend':    'Firefighting (Unplanned) Hours',
  'project-timeline':      'Selected Project Timeline',
  'focus-score':           'Focus Score',
  'lab-tech-hours':        'Lab Tech Hours by Engineer',
  'meeting-tax':           'Meeting & Admin Tax',
  'allocation-compliance': 'Allocation Compliance',
  'bus-factor':            'Knowledge Risk (Bus Factor)',
  'utilization-heatmap':   'Planned Utilization Heatmap',
  'milestone-timeline':    'NPD Milestones',
  'skill-heatmap':         'Skill Heat Map',
  'tech-affinity':         'Engineer ↔ Tech Collaboration',
};

const CHART_PANEL_IDS = [
  'engineer-breakdown',
  'npd-project-comp',
  'planned-vs-actual',
  'firefighting-trend',
  'project-timeline',
  'focus-score',
  'lab-tech-hours',
  'meeting-tax',
  'allocation-compliance',
  'bus-factor',
  'utilization-heatmap',
  'milestone-timeline',
  'skill-heatmap',
  'tech-affinity',
];

export function ExportConfigModal({ isOpen, onClose, selectedMonth, availability = [] }: ExportConfigModalProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [exportError, setExportError] = useState('');

  const config = useLiveQuery(() => db.config.get(1));

  // PDF section config — loaded from persisted config
  const [pdfSections, setPdfSections] = useState<PDFExportSections>({
    includeKPISummary: true,
    includeNarrative: true,
    includeAlerts: false,
    chartPanels: ['engineer-breakdown', 'npd-project-comp'],
  });

  const initializedRef = useRef(false);

  // Load persisted PDF section config
  useEffect(() => {
    if (!initializedRef.current && config?.pdf_export_sections) {
      setPdfSections(config.pdf_export_sections);
      initializedRef.current = true;
    }
  }, [config]);

  // Chart panels available for PDF export (filtered by data availability when provided)
  const availableSet = new Set(
    availability.filter(a => a.available).map(a => a.panelId)
  );
  const availableChartPanels = CHART_PANEL_IDS.filter(id =>
    availability.length === 0 || availableSet.has(id)
  );

  if (!isOpen) return null;

  // ── Handlers ──

  const handleToggleChart = (panelId: string) => {
    setPdfSections(prev => {
      const next = prev.chartPanels.includes(panelId)
        ? prev.chartPanels.filter(id => id !== panelId)
        : [...prev.chartPanels, panelId];
      return { ...prev, chartPanels: next };
    });
  };

  const handleToggleSection = (key: 'includeKPISummary' | 'includeNarrative' | 'includeAlerts') => {
    setPdfSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportError('');
    setProgressPct(0);
    setProgressText('Starting export...');

    try {
      // Persist the section selections
      await db.config.update(1, { pdf_export_sections: pdfSections });

      await exportExecutivePDF(
        selectedMonth,
        config?.selected_project || undefined,
        pdfSections,
        (step, current, total) => {
          setProgressText(step);
          setProgressPct(Math.round((current / total) * 100));
        }
      );

      setProgressText('PDF downloaded successfully!');
      setTimeout(() => {
        setIsExporting(false);
        onClose();
      }, 1500);
    } catch (err) {
      console.error('PDF export failed:', err);
      setExportError(err instanceof Error ? err.message : 'Export failed');
      setIsExporting(false);
    }
  };

  const hasContent = pdfSections.includeKPISummary ||
    pdfSections.includeNarrative ||
    pdfSections.includeAlerts ||
    pdfSections.chartPanels.length > 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto export-modal">
      <div className="flex items-center justify-center min-h-screen px-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={onClose} />

        {/* Modal */}
        <div className="relative bg-[var(--bg-panel)] border border-[var(--border-default)] rounded-xl shadow-xl max-w-lg w-full p-6 z-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Export Executive PDF</h2>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Generate a professional monthly report</p>
            </div>
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Exporting state */}
          {isExporting ? (
            <div className="space-y-4 py-4">
              <div className="text-sm text-[var(--text-secondary)]">{progressText}</div>
              <div className="w-full bg-[var(--border-subtle)] rounded-full h-2">
                <div
                  className="bg-[var(--accent)] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="text-xs text-[var(--text-muted)] text-center">{progressPct}% complete</div>
              {progressText.includes('successfully') && (
                <div className="bg-[var(--status-good-bg)] border border-[var(--status-good-border)] rounded p-3 text-sm text-[var(--status-good)]">
                  PDF has been downloaded to your default downloads folder.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Month Display */}
              <div>
                <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1">Month</label>
                <div className="text-[13px] text-[var(--text-secondary)] bg-[var(--bg-table-header)] px-3 py-2 rounded-md border border-[var(--border-subtle)]">
                  {selectedMonth || 'No month selected'}
                </div>
              </div>

              {/* Section Selection */}
              <div className="space-y-3">
                <label className="block text-[13px] font-medium text-[var(--text-secondary)]">Include Sections</label>

                {/* Data sections */}
                <div className="border border-[var(--border-default)] rounded-md p-3 space-y-2">
                  <SectionToggle
                    checked={pdfSections.includeKPISummary}
                    onChange={() => handleToggleSection('includeKPISummary')}
                    label="KPI Summary Cards"
                    recommended
                  />
                  <SectionToggle
                    checked={pdfSections.includeNarrative}
                    onChange={() => handleToggleSection('includeNarrative')}
                    label="Monthly Narrative"
                  />
                  <SectionToggle
                    checked={pdfSections.includeAlerts}
                    onChange={() => handleToggleSection('includeAlerts')}
                    label="Key Alerts & Anomalies"
                  />
                </div>

                {/* Chart panels */}
                <div>
                  <label className="block text-[12px] font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wide">Charts</label>
                  <div className="border border-[var(--border-default)] rounded-md p-3 space-y-1.5 max-h-48 overflow-y-auto">
                    {availableChartPanels.length === 0 ? (
                      <p className="text-[12px] text-[var(--text-muted)] italic">No chart panels enabled on the dashboard</p>
                    ) : (
                      availableChartPanels.map(panelId => (
                        <SectionToggle
                          key={panelId}
                          checked={pdfSections.chartPanels.includes(panelId)}
                          onChange={() => handleToggleChart(panelId)}
                          label={PANEL_LABELS[panelId] ?? panelId}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Error display */}
              {exportError && (
                <div className="bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] rounded p-3 text-sm text-[var(--status-danger)]">
                  {exportError}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="text-[13px] font-medium px-4 py-2 rounded-md border border-[var(--border-input)] text-[var(--text-secondary)] bg-white hover:bg-[var(--bg-table-header)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExport}
                  disabled={!hasContent}
                  className="text-[13px] font-medium px-4 py-2 rounded-md text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Generate PDF
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──

function SectionToggle({
  checked,
  onChange,
  label,
  recommended,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  recommended?: boolean;
}) {
  return (
    <label className="flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onChange} className="mr-2 accent-[var(--accent)]" />
      <span className="text-[13px] text-[var(--text-secondary)]">{label}</span>
      {recommended && (
        <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--accent)] bg-[var(--accent-light)] px-1.5 py-0.5 rounded">
          Recommended
        </span>
      )}
    </label>
  );
}
