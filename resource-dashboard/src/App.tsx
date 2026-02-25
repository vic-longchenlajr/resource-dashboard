import { useEffect, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { initializeDatabase, db } from './db/database';
import { refreshKPIHistory } from './aggregation/kpiHistory';
import { DexieViewFilterProvider } from './context/ViewFilterContext';

const ImportPage = lazy(() => import('./pages/ImportPage').then(m => ({ default: m.ImportPage })));
const ConfigPage = lazy(() => import('./pages/ConfigPage').then(m => ({ default: m.ConfigPage })));
const UpdatesPage = lazy(() => import('./pages/UpdatesPage').then(m => ({ default: m.UpdatesPage })));
const OverviewPage = lazy(() => import('./pages/OverviewPage').then(m => ({ default: m.OverviewPage })));
const PlanningPage = lazy(() => import('./pages/PlanningPage').then(m => ({ default: m.PlanningPage })));
const TeamPage = lazy(() => import('./pages/TeamPage').then(m => ({ default: m.TeamPage })));
const EngineerPage = lazy(() => import('./pages/EngineerPage').then(m => ({ default: m.EngineerPage })));

function App() {
  useEffect(() => {
    // Initialize database on app load
    initializeDatabase()
      .then(async () => {
        // One-time KPI history population: if kpiHistory is empty but timesheets exist
        const [kpiCount, tsCount] = await Promise.all([
          db.kpiHistory.count(),
          db.timesheets.count(),
        ]);
        if (kpiCount === 0 && tsCount > 0) {
          await refreshKPIHistory();
        }
      })
      .catch(console.error);
  }, []);

  return (
    <HashRouter>
      <Layout>
        <Suspense fallback={<div className="flex items-center justify-center py-20 text-[var(--text-muted)]">Loading…</div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard/overview" replace />} />
            <Route path="/dashboard" element={<Navigate to="/dashboard/overview" replace />} />
            <Route path="/dashboard/overview" element={<DexieViewFilterProvider><OverviewPage /></DexieViewFilterProvider>} />
            <Route path="/dashboard/planning/:projectId?" element={<DexieViewFilterProvider><PlanningPage /></DexieViewFilterProvider>} />
            <Route path="/dashboard/team" element={<DexieViewFilterProvider><TeamPage /></DexieViewFilterProvider>} />
            <Route path="/dashboard/engineer/:fullName?" element={<DexieViewFilterProvider><EngineerPage /></DexieViewFilterProvider>} />
            <Route path="/updates" element={<UpdatesPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/config" element={<ConfigPage />} />
          </Routes>
        </Suspense>
      </Layout>
    </HashRouter>
  );
}

export default App;
