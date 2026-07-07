import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Tailwind utilities + Football Hub's existing CSS (the latter is @imported into a
// `legacy` layer inside tailwind.css so utilities win conflicts on shell components).
import './styles/tailwind.css';

import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AppStateProvider } from './context/AppStateContext';
import AppRouter from './Router';
import { PwaUpdater } from './components/pwa/PwaUpdater';

const queryClient = new QueryClient({
  defaultOptions: {
    // Bakes in the CLAUDE.md performance rules: cache, don't refetch aggressively.
    queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find #root element to mount to');

// Cutover: the React app is the whole site, served at root. Routes are clean
// (/, /dashboard, /login, /privacy, /dossier/session …). v7 stays frozen as rollback.
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter basename="/">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <AppStateProvider>
              <AppRouter />
              <PwaUpdater />
            </AppStateProvider>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
