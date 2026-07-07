import React from 'react';
import { Download, Share } from 'lucide-react';
import { Button } from '../ui/Button';
import { usePwaInstall } from '../../hooks/usePwaInstall';

/**
 * InstallCard — an in-app entry point to install the PWA. Shows an Install button on
 * Android/desktop (native prompt), an "Add to Home Screen" hint on iOS, and renders
 * nothing once installed or where install isn't possible. Drop into Settings.
 */
export const InstallCard: React.FC = () => {
  const { canInstall, isInstalled, isIOS, promptInstall } = usePwaInstall();
  if (isInstalled) return null;
  if (!canInstall && !isIOS) return null;

  return (
    <div className="rounded-xl border border-brand/30 bg-brand/5 p-5 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><Download size={16} className="text-brand" /> Install Football Hub</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
          {isIOS
            ? <>Tap the <Share size={12} className="inline align-[-1px]" /> Share icon, then <strong className="text-slate-700 dark:text-slate-200">Add to Home Screen</strong> — it opens in its own window and works like a full app.</>
            : 'Install it as a full app on this device — its own window, works offline, and updates automatically. No app store needed.'}
        </p>
      </div>
      {canInstall && <Button variant="primary" onClick={() => promptInstall()} className="shrink-0"><Download size={15} /> Install</Button>}
    </div>
  );
};
