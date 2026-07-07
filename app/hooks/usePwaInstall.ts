import { useEffect, useState, useCallback } from 'react';

/**
 * usePwaInstall — cross-platform "install this app" state.
 * - Android / desktop Chromium fire `beforeinstallprompt`; we capture it and expose
 *   `promptInstall()` to trigger the native install dialog on demand.
 * - iOS Safari NEVER fires that event — install is manual (Share → Add to Home Screen),
 *   so we expose `isIOS` and the UI shows a hint instead of a button.
 * - `isInstalled` is true when already running in standalone (installed) mode.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const checkStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true);

export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(checkStandalone());

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent); };
    const onInstalled = () => { setIsInstalled(true); setDeferred(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

  const promptInstall = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome === 'accepted';
  }, [deferred]);

  return { canInstall: !!deferred && !isInstalled, isInstalled, isIOS, promptInstall };
}
