import React, { lazy, Suspense, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sidebar } from './components/layout/Sidebar';
import { ImpersonationBanner } from './components/layout/ImpersonationBanner';
import { useAppState } from './context/AppStateContext';
import { AcceptTermsPage } from './pages/AcceptTermsPage';
import { TERMS_VERSION } from './lib/terms';
import { RouteSkeleton } from './components/ui/Skeleton';

// Per-route code-splitting: each page (and its heavy deps — Konva, jsPDF, etc.)
// loads only when navigated to, instead of in one upfront bundle.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const SquadPage = lazy(() => import('./pages/SquadPage').then(m => ({ default: m.SquadPage })));
const PlayerProfilePage = lazy(() => import('./pages/PlayerProfilePage').then(m => ({ default: m.PlayerProfilePage })));
const MatchesPage = lazy(() => import('./pages/MatchesPage').then(m => ({ default: m.MatchesPage })));
const MatchDetailsPage = lazy(() => import('./pages/MatchDetailsPage').then(m => ({ default: m.MatchDetailsPage })));
const MatchPlanBuilderPage = lazy(() => import('./pages/MatchPlanBuilderPage').then(m => ({ default: m.MatchPlanBuilderPage })));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const ScoutingPage = lazy(() => import('./pages/ScoutingPage').then(m => ({ default: m.ScoutingPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const PlatformAdminPage = lazy(() => import('./pages/PlatformAdminPage').then(m => ({ default: m.PlatformAdminPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const LibraryPage = lazy(() => import('./pages/LibraryPage').then(m => ({ default: m.LibraryPage })));
const FinancialsPage = lazy(() => import('./pages/FinancialsPage').then(m => ({ default: m.FinancialsPage })));
const SessionPlannerPage = lazy(() => import('./pages/SessionPlannerPage').then(m => ({ default: m.SessionPlannerPage })));
const AnimationBuilderPage = lazy(() => import('./pages/AnimationBuilderPage').then(m => ({ default: m.AnimationBuilderPage })));

const Splash: React.FC = () => (
  <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-sentinel-bg">
    <div className="text-center">
      <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-slate-500 text-xs font-medium uppercase tracking-widest">Loading your club…</p>
    </div>
  </div>
);

const PausedScreen: React.FC = () => (
  <div className="h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-sentinel-bg px-8 text-center">
    <div className="text-5xl mb-4">⏸️</div>
    <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Subscription Paused</h1>
    <p className="text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
      Your club's subscription has been paused. Please contact your administrator or{' '}
      <a href="/?topic=support#contact" className="text-brand">support</a> to restore access.
    </p>
  </div>
);

/**
 * Authenticated shell. The <Sidebar/> + <ImpersonationBanner/> sit OUTSIDE
 * <Routes> so they persist across navigation (no flicker). Profile loads via
 * AppStateContext; we gate render on it (replaces page-init's reveal gate).
 * Routes grow page-by-page during the strangler port.
 */
const App: React.FC = () => {
  const { isLoading, subscriptionPaused, effectiveClubId, role, club, profile } = useAppState();
  const [mobileNav, setMobileNav] = useState(false);

  if (isLoading) return <Splash />;
  if (subscriptionPaused) return <PausedScreen />;
  // Block the app until the user has accepted the current Terms/Privacy version.
  if (profile && (profile.accepted_terms_version ?? 0) < TERMS_VERSION) return <AcceptTermsPage />;

  // Platform admins normally land in their personal Dev Workspace (effectiveClubId = their
  // hidden sandbox club), so every page works and their test data is scoped to that club —
  // never orphaned, and never surfaced inside a real club they "View as". Only if the
  // workspace fails to resolve (no effective club at all) do we confine them to the platform
  // directory until they pick a club to view.
  const needsClubSelection = (role === 'super_admin' || role === 'platform_admin') && !effectiveClubId;

  return (
    <div className="flex flex-col h-screen overflow-hidden app-shell">
      <ImpersonationBanner />
      {/* Mobile top bar — hamburger opens the off-canvas sidebar (desktop unaffected) */}
      <div className="lg:hidden flex items-center gap-3 px-4 h-14 shrink-0 border-b border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-sidebar">
        <button onClick={() => setMobileNav(true)} aria-label="Open menu" className="p-2 -ml-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"><Menu size={22} /></button>
        <span className="font-bold text-slate-900 dark:text-white truncate">{club?.name || 'Football Hub'}</span>
      </div>
      <div className="flex flex-1 overflow-hidden bg-slate-50 dark:bg-sentinel-bg text-slate-900 dark:text-slate-100">
        <Sidebar mobileOpen={mobileNav} onClose={() => setMobileNav(false)} />
        <main className="flex-1 overflow-y-auto min-w-0">
          <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-5">
            <Suspense fallback={<RouteSkeleton />}>
            <Routes>
              <Route path="/platform-admin" element={<PlatformAdminPage />} />
              {needsClubSelection ? (
                /* Club-less platform admin → everything routes to the directory until a club is picked. */
                <Route path="*" element={<Navigate to="/platform-admin" replace />} />
              ) : (
                <>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/squad" element={<SquadPage />} />
                  <Route path="/players/:id" element={<PlayerProfilePage />} />
                  <Route path="/matches" element={<MatchesPage />} />
                  <Route path="/matches/:id" element={<MatchDetailsPage />} />
                  <Route path="/match-plan" element={<MatchPlanBuilderPage />} />
                  <Route path="/match-plan/:id" element={<MatchPlanBuilderPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/scouting" element={<ScoutingPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/library" element={<LibraryPage />} />
                  <Route path="/financials" element={<FinancialsPage />} />
                  <Route path="/planner" element={<SessionPlannerPage />} />
                  <Route path="/planner/:id" element={<SessionPlannerPage />} />
                  <Route path="/animation" element={<AnimationBuilderPage />} />
                  <Route path="/animation/:id" element={<AnimationBuilderPage />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </>
              )}
            </Routes>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
