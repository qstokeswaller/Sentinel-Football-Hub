import * as React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updatePlayerStatus } from '../../services/squadService';
import { useToast } from '../../context/ToastContext';
import { PLAYER_STATUSES, PLAYER_STATUS_KEYS, statusCfg } from '../../lib/playerStatus';
import { cn } from '../../lib/utils';

/**
 * Colored availability pill that opens a portal dropdown to change a player's status.
 * Writes player_status directly and invalidates ['players'] + ['player', id] so the
 * roster row and the profile header stay in sync wherever it's used. Read-only when
 * !canEdit (renders a static pill).
 */
export const PlayerStatusSelect: React.FC<{
  playerId: string; value?: string | null; canEdit?: boolean; size?: 'sm' | 'md'; className?: string;
}> = ({ playerId, value, canEdit = true, size = 'sm', className }) => {
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const cfg = statusCfg(value);

  const mut = useMutation({
    mutationFn: (status: string) => updatePlayerStatus(playerId, status),
    onSuccess: (_d, status) => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['player', playerId] });
      showToast(PLAYER_STATUSES[status]?.label || status, 'success');
    },
    onError: (e) => showError(e),
  });

  React.useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => { if (e.target instanceof Node && panelRef.current?.contains(e.target)) return; setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('scroll', onScroll, true); window.addEventListener('resize', () => setOpen(false)); document.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('scroll', onScroll, true); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  const pill = cn('inline-flex items-center gap-1 rounded-full border font-semibold capitalize', cfg.pill, pad);

  if (!canEdit) return <span className={cn(pill, className)}>{cfg.label}</span>;

  return (
    <>
      <button ref={triggerRef} type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); const r = triggerRef.current?.getBoundingClientRect(); if (r) setRect(r); setOpen(o => !o); }}
        className={cn(pill, 'cursor-pointer hover:brightness-95 transition', className)}>
        {cfg.label}<ChevronDown size={12} className="opacity-70" />
      </button>
      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[800]" onMouseDown={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div ref={panelRef} style={{ position: 'fixed', top: rect.bottom + 4, left: Math.max(8, rect.right - 160), width: 160, zIndex: 801 }}
            className="rounded-lg border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface shadow-xl py-1 fh-zoom-in">
            {PLAYER_STATUS_KEYS.map(k => {
              const c = PLAYER_STATUSES[k];
              const active = (value || 'active') === k;
              return (
                <button key={k} type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); if (!active) mut.mutate(k); }}
                  className={cn('w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors',
                    active ? 'bg-brand/10 text-brand font-semibold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5')}>
                  <span className="w-3.5 shrink-0 text-center">{c.symbol}</span>{c.label}
                </button>
              );
            })}
          </div>
        </>, document.body)}
    </>
  );
};
