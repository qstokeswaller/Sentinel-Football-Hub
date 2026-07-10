import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

// Code-split: each route (and the whole authenticated app shell) loads on demand,
// so a public visitor never downloads the app, and vice-versa.
const App = lazy(() => import('./App'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const PlayerDossierPage = lazy(() => import('./pages/PlayerDossierPage').then(m => ({ default: m.PlayerDossierPage })));
const SquadDossierPage = lazy(() => import('./pages/SquadDossierPage').then(m => ({ default: m.SquadDossierPage })));
const ScoutDossierPage = lazy(() => import('./pages/ScoutDossierPage').then(m => ({ default: m.ScoutDossierPage })));
const ReportDossierPage = lazy(() => import('./pages/ReportDossierPage').then(m => ({ default: m.ReportDossierPage })));
const SessionSharePage = lazy(() => import('./pages/SessionSharePage').then(m => ({ default: m.SessionSharePage })));
const DrillSharePage = lazy(() => import('./pages/DrillSharePage').then(m => ({ default: m.DrillSharePage })));
const MatchPlanDossierPage = lazy(() => import('./pages/MatchPlanDossierPage').then(m => ({ default: m.MatchPlanDossierPage })));
const MatchDossierPage = lazy(() => import('./pages/MatchDossierPage').then(m => ({ default: m.MatchDossierPage })));
const FixturesDossierPage = lazy(() => import('./pages/FixturesDossierPage').then(m => ({ default: m.FixturesDossierPage })));
const PrivacyPolicyPage = lazy(() => import('./pages/legal/LegalPages').then(m => ({ default: m.PrivacyPolicyPage })));
const TermsOfServicePage = lazy(() => import('./pages/legal/LegalPages').then(m => ({ default: m.TermsOfServicePage })));
const CookiePolicyPage = lazy(() => import('./pages/legal/LegalPages').then(m => ({ default: m.CookiePolicyPage })));
const DataProcessingPage = lazy(() => import('./pages/legal/LegalPages').then(m => ({ default: m.DataProcessingPage })));
const HomePage = lazy(() => import('./pages/marketing/HomePage').then(m => ({ default: m.HomePage })));
const ClubsLandingPage = lazy(() => import('./pages/marketing/ClubsLandingPage').then(m => ({ default: m.ClubsLandingPage })));
const PlayersLandingPage = lazy(() => import('./pages/marketing/PlayersLandingPage').then(m => ({ default: m.PlayersLandingPage })));

const LoadingScreen: React.FC = () => (
  <div className="min-h-screen bg-sentinel-bg flex items-center justify-center">
    <div className="text-center">
      <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-slate-500 text-xs font-medium uppercase tracking-widest">Loading</p>
    </div>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const AppRouter: React.FC = () => {
  const { user, loading, needsPasswordUpdate } = useAuth();

  // Password-recovery deep link → force the update-password form.
  if (needsPasswordUpdate && user) {
    return <Suspense fallback={<LoadingScreen />}><LoginPage /></Suspense>;
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        {/* Public marketing landing */}
        <Route path="/" element={<HomePage />} />
        <Route path="/landing/clubs" element={<ClubsLandingPage />} />
        <Route path="/landing/players" element={<PlayersLandingPage />} />
        <Route
          path="/login"
          element={loading ? <LoadingScreen /> : user ? <Navigate to="/dashboard" replace /> : <LoginPage />}
        />
        {/* Public share routes — no auth, outside the protected shell. */}
        <Route path="/dossier/player" element={<PlayerDossierPage />} />
        <Route path="/dossier/squad" element={<SquadDossierPage />} />
        <Route path="/dossier/scout" element={<ScoutDossierPage />} />
        <Route path="/dossier/report" element={<ReportDossierPage />} />
        <Route path="/dossier/session" element={<SessionSharePage />} />
        <Route path="/dossier/drill" element={<DrillSharePage />} />
        <Route path="/dossier/match-plan" element={<MatchPlanDossierPage />} />
        <Route path="/dossier/match" element={<MatchDossierPage />} />
        <Route path="/dossier/fixtures" element={<FixturesDossierPage />} />
        {/* Legal — public, no auth */}
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/cookies" element={<CookiePolicyPage />} />
        <Route path="/data-processing" element={<DataProcessingPage />} />
        {/* App catch-all (protected) */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <App />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
};

export default AppRouter;
