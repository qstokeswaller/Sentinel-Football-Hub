import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

/**
 * PwaUpdater — the "New version available" toast (Slack/Linear pattern). The service
 * worker (registerType: 'prompt') downloads the new build in the background but does
 * NOT activate it — so the app never reloads mid-session. When a new version is waiting,
 * this shows a sleek card; "Update now" fires SKIP_WAITING + reloads with the fresh code.
 * Mounted once at the app root so it appears on any page (app, login, marketing).
 */
export const PwaUpdater: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // Re-check for a new deploy hourly while the app stays open.
      if (registration) setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[1000] w-[calc(100vw-2rem)] max-w-sm rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface shadow-2xl p-4 fh-zoom-in">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-brand/15 text-brand flex items-center justify-center shrink-0"><RefreshCw size={18} /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">A new version is available</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Update now to get the latest improvements.</p>
          <div className="flex gap-2 mt-3">
            <button onClick={() => updateServiceWorker(true)} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-[#0D1B2A] hover:bg-brand-dark transition-colors">Update now</button>
            <button onClick={() => setNeedRefresh(false)} className="rounded-lg border border-slate-200 dark:border-sentinel-border px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:border-brand transition-colors">Later</button>
          </div>
        </div>
        <button onClick={() => setNeedRefresh(false)} aria-label="Dismiss" className="text-slate-400 hover:text-slate-600 dark:hover:text-white shrink-0"><X size={16} /></button>
      </div>
    </div>
  );
};
