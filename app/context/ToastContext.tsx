import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { friendlyError } from '../lib/friendlyError';

type ToastType = 'success' | 'error' | 'info';
interface Toast { id: number; message: string; type: ToastType; }

interface ToastValue {
  showToast: (message: string, type?: ToastType) => void;
  /** Show err.message run through friendlyError(). */
  showError: (err: unknown) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts(p => p.filter(t => t.id !== id)), []);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  const showError = useCallback((err: unknown) => showToast(friendlyError(err), 'error'), [showToast]);

  // Interop: vanilla modules call window.showGlobalToast / window.friendlyError.
  useEffect(() => {
    (window as any).showGlobalToast = showToast;
    (window as any).friendlyError = friendlyError;
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, showError, dismiss }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-3 min-w-[260px] max-w-sm rounded-xl px-4 py-3 text-sm font-medium text-white shadow-2xl border border-white/10 bg-slate-800"
          >
            {t.type === 'success' && <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />}
            {t.type === 'error' && <XCircle size={16} className="text-rose-400 shrink-0" />}
            {t.type === 'info' && <Info size={16} className="text-sky-400 shrink-0" />}
            <span className="flex-1 leading-tight">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-white shrink-0">
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};
