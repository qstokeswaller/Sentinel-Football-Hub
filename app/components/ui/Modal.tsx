import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Modal — standard overlay + panel shell. Overlay = blurred dark scrim (L4);
 * panel = surface + shadow-2xl, max-width via `size`. Click-outside + Esc close.
 */
const SIZES = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl', '2xl': 'max-w-3xl' };

export const Modal: React.FC<{
  open: boolean; onClose: () => void; title?: React.ReactNode; size?: keyof typeof SIZES;
  footer?: React.ReactNode; children: React.ReactNode; className?: string;
}> = ({ open, onClose, title, size = 'md', footer, children, className }) => {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4 fh-fade-in" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={cn('bg-white dark:bg-sentinel-surface rounded-xl w-full border border-slate-200 dark:border-sentinel-border shadow-2xl max-h-[92vh] flex flex-col overflow-hidden fh-zoom-in', SIZES[size], className)}>
        {title && (
          <div className="px-5 py-4 border-b border-slate-100 dark:border-sentinel-border flex items-center justify-between gap-3 shrink-0">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={18} /></button>
          </div>
        )}
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-slate-100 dark:border-sentinel-border flex justify-end gap-2 shrink-0">{footer}</div>}
      </div>
    </div>
  );
};
