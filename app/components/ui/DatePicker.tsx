import * as React from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * DatePicker — platform-standard date field. A fully custom calendar popup (NOT native
 * <input type="date">, whose OS calendar ignores our theme) styled to match Select/TimePicker:
 * brand-highlighted selection, month nav, today marker, Today/Clear shortcuts. Renders in a
 * portal so it never clips inside modals/overflow containers, and flips above the trigger when
 * there's no room below. Value is an ISO "YYYY-MM-DD" string (same as the native input it
 * replaces); `onChange` fires with `{ target: { value } }`, so existing `e => set(e.target.value)`
 * handlers work unchanged. THIS is the platform-standard date field — use it for ALL dates.
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const pad2 = (n: number) => String(n).padStart(2, '0');
const toISO = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;
const parseISO = (s?: string) => { const m = (s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; };
const fmt = (s: string | undefined, ph?: string) => {
  const p = parseISO(s);
  return p ? new Date(p.y, p.m - 1, p.d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : (ph || 'Select date');
};

export const DatePicker: React.FC<{
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  placeholder?: string; disabled?: boolean; className?: string; compact?: boolean;
}> = ({ value = '', onChange, placeholder, disabled, className, compact }) => {
  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const sel = parseISO(value);
  const today = new Date();
  const [view, setView] = React.useState(() => sel ? { y: sel.y, m: sel.m } : { y: today.getFullYear(), m: today.getMonth() + 1 });
  // Re-sync the visible month to the current value each time the picker opens.
  React.useEffect(() => {
    if (!open) return;
    const p = parseISO(value);
    setView(p ? { y: p.y, m: p.m } : { y: new Date().getFullYear(), m: new Date().getMonth() + 1 });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const openMenu = () => { if (disabled) return; const r = triggerRef.current?.getBoundingClientRect(); if (r) setRect(r); setOpen(o => !o); };
  React.useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => { if (e.target instanceof Node && panelRef.current?.contains(e.target)) return; setOpen(false); };
    const onClose = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('scroll', onScroll, true); window.addEventListener('resize', onClose); document.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onClose); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const pick = (y: number, m: number, d: number) => { onChange?.({ target: { value: toISO(y, m, d) } }); setOpen(false); };
  const shift = (delta: number) => setView(v => { let m = v.m + delta, y = v.y; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } return { y, m }; });

  // 6-week grid; leading/trailing days come from the adjacent months (rendered muted).
  const firstDow = new Date(view.y, view.m - 1, 1).getDay();
  const daysInMonth = new Date(view.y, view.m, 0).getDate();
  const cells: { y: number; m: number; d: number; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const dayNum = i - firstDow + 1;
    const dt = new Date(view.y, view.m - 1, dayNum);
    cells.push({ y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate(), inMonth: dayNum >= 1 && dayNum <= daysInMonth });
  }
  const same = (c: { y: number; m: number; d: number }, o: { y: number; m: number; d: number } | null) => !!o && c.y === o.y && c.m === o.m && c.d === o.d;
  const todayParts = { y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() };

  const trig = cn(
    'w-full flex items-center justify-between gap-1.5 text-left cursor-pointer rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg text-slate-900 dark:text-slate-100 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20',
    compact ? 'rounded-md px-2 py-1 text-xs' : 'px-3 py-2 text-sm',
    open && 'border-brand ring-2 ring-brand/20',
    disabled && 'opacity-50 cursor-not-allowed',
  );

  // Flip above / clamp horizontally so the ~330px calendar never spills off-screen.
  const W = 280;
  const openUp = rect ? (window.innerHeight - rect.bottom < 360 && rect.top > 360) : false;
  const left = rect ? Math.max(8, Math.min(rect.left, window.innerWidth - W - 8)) : 0;
  const style: React.CSSProperties = rect
    ? { position: 'fixed', left, width: W, zIndex: 801, ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }) }
    : {};

  return (
    <div className={cn('relative', className || 'w-full')}>
      <button ref={triggerRef} type="button" disabled={disabled} onClick={openMenu} className={trig}>
        <span className={cn('truncate', !sel && 'text-slate-400')}>{fmt(value, placeholder)}</span>
        <CalendarIcon size={compact ? 13 : 15} className={cn('shrink-0 text-slate-400', open && 'text-brand')} />
      </button>
      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[800]" onMouseDown={() => setOpen(false)} />
          <div ref={panelRef} style={style}
            className="rounded-lg border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface shadow-xl fh-zoom-in p-2.5">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{MONTHS[view.m - 1]} {view.y}</span>
              <div className="flex items-center gap-0.5">
                <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="p-1 rounded-md text-slate-400 hover:text-brand hover:bg-slate-100 dark:hover:bg-white/5"><ChevronLeft size={16} /></button>
                <button type="button" aria-label="Next month" onClick={() => shift(1)} className="p-1 rounded-md text-slate-400 hover:text-brand hover:bg-slate-100 dark:hover:bg-white/5"><ChevronRight size={16} /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 mb-1">
              {DOW.map(d => <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400 py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((c, i) => {
                const seld = same(c, sel), td = same(c, todayParts);
                return (
                  <button key={i} type="button" onClick={() => pick(c.y, c.m, c.d)}
                    className={cn('h-8 rounded-md text-sm tabular-nums flex items-center justify-center transition-colors',
                      seld ? 'bg-brand text-[#0D1B2A] font-semibold'
                        : !c.inMonth ? 'text-slate-300 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/5'
                        : td ? 'text-brand font-semibold ring-1 ring-brand/40 hover:bg-brand/10'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5')}>
                    {c.d}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-slate-100 dark:border-sentinel-border px-1">
              <button type="button" onClick={() => pick(todayParts.y, todayParts.m, todayParts.d)} className="text-xs font-medium text-brand hover:underline">Today</button>
              <button type="button" onClick={() => { onChange?.({ target: { value: '' } }); setOpen(false); }} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">Clear</button>
            </div>
          </div>
        </>, document.body)}
    </div>
  );
};
