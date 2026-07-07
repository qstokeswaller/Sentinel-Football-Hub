import * as React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

const base = 'w-full rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(base, className)} {...props} />
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(base, 'resize-none', className)} {...props} />
);
Textarea.displayName = 'Textarea';

/**
 * Select — a fully custom dropdown (NOT a native <select>, so the OPEN list uses our
 * own styling, not the OS/browser default). Keeps the familiar `<Select><option/></Select>`
 * API (parses option/optgroup children) so every existing call site works unchanged;
 * `onChange` still fires with `{ target: { value } }`. The panel renders in a portal so
 * it never clips inside modals or overflow containers. THIS is the platform-standard
 * dropdown — use it for ALL dropdowns (never a raw <select>).
 */
type Row = { kind: 'group'; label: string } | { kind: 'option'; value: string; label: string; disabled?: boolean };

const optionText = (el: React.ReactElement<any>): string => {
  const c = el.props.children;
  if (typeof c === 'string' || typeof c === 'number') return String(c);
  return React.Children.toArray(c).map(x => (typeof x === 'string' || typeof x === 'number' ? String(x) : '')).join('');
};
function parseRows(children: React.ReactNode): { rows: Row[]; labels: Record<string, string> } {
  const rows: Row[] = []; const labels: Record<string, string> = {};
  const add = (el: React.ReactElement<any>) => { const value = String(el.props.value ?? ''); const label = optionText(el); rows.push({ kind: 'option', value, label, disabled: el.props.disabled }); labels[value] = label; };
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === 'optgroup') { rows.push({ kind: 'group', label: String((child.props as any).label ?? '') }); React.Children.forEach((child.props as any).children, (o: React.ReactNode) => { if (React.isValidElement(o) && o.type === 'option') add(o as React.ReactElement<any>); }); }
    else if (child.type === 'option') add(child as React.ReactElement<any>);
  });
  return { rows, labels };
}

export const Select = React.forwardRef<HTMLDivElement, React.SelectHTMLAttributes<HTMLSelectElement> & { compact?: boolean }>(
  ({ className, children, value, onChange, disabled, compact, ...rest }, ref) => {
    const [open, setOpen] = React.useState(false);
    const [rect, setRect] = React.useState<DOMRect | null>(null);
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const listRef = React.useRef<HTMLDivElement>(null);
    const { rows, labels } = React.useMemo(() => parseRows(children), [children]);
    const current = value != null ? String(value) : '';
    const selectedLabel = labels[current] ?? '';
    void rest; void ref;

    const openMenu = () => { if (disabled) return; const r = triggerRef.current?.getBoundingClientRect(); if (r) setRect(r); setOpen(o => !o); };
    React.useEffect(() => {
      if (!open) return;
      // Close on OUTER scroll/resize so the fixed panel never detaches from the trigger — but
      // IGNORE scrolling inside the dropdown's own list (that previously closed it instantly).
      const onScroll = (e: Event) => { if (e.target instanceof Node && listRef.current?.contains(e.target)) return; setOpen(false); };
      const onClose = () => setOpen(false);
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
      window.addEventListener('scroll', onScroll, true); window.addEventListener('resize', onClose); document.addEventListener('keydown', onKey);
      return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onClose); document.removeEventListener('keydown', onKey); };
    }, [open]);
    const pick = (v: string) => { setOpen(false); onChange?.({ target: { value: v } } as unknown as React.ChangeEvent<HTMLSelectElement>); };

    // `compact` = a denser trigger for in-table cells (smaller padding/text) — same custom panel.
    const trig = cn(
      'w-full flex items-center justify-between gap-1.5 text-left cursor-pointer rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg text-slate-900 dark:text-slate-100 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20',
      compact ? 'rounded-md px-2 py-1 text-xs' : 'px-3 py-2 text-sm',
      open && 'border-brand ring-2 ring-brand/20',
      disabled && 'opacity-50 cursor-not-allowed',
    );
    return (
      <div className={cn('relative w-full', className)}>
        <button ref={triggerRef} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={openMenu} className={trig}>
          <span title={selectedLabel || undefined} className={cn('truncate', !selectedLabel && 'text-slate-400')}>{selectedLabel || 'Select…'}</span>
          <ChevronDown size={compact ? 12 : 15} className={cn('shrink-0 text-slate-400 transition-transform', open && 'rotate-180 text-brand')} />
        </button>
        {open && rect && createPortal(
          <>
            <div className="fixed inset-0 z-[800]" onMouseDown={() => setOpen(false)} />
            <div ref={listRef} role="listbox" style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, minWidth: compact ? 120 : rect.width, width: 'max-content', maxWidth: 'min(340px, 92vw)', zIndex: 801 }}
              className="max-h-96 overflow-auto overscroll-contain rounded-lg border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface shadow-xl py-1 fh-zoom-in">
              {rows.map((row, i) => row.kind === 'group'
                ? <div key={i} className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none">{row.label}</div>
                : <button key={i} type="button" role="option" title={row.label} aria-selected={row.value === current} disabled={row.disabled} onClick={() => pick(row.value)}
                    className={cn('w-full flex items-center justify-between gap-2 text-left transition-colors',
                      compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm',
                      row.value === current ? 'bg-brand/10 text-brand font-semibold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5',
                      row.disabled && 'opacity-40 cursor-not-allowed')}>
                    <span className="truncate">{row.label}</span>
                    {row.value === current && <Check size={14} className="shrink-0" />}
                  </button>
              )}
            </div>
          </>, document.body)}
      </div>
    );
  }
);
Select.displayName = 'Select';

/** Field label — tertiary text tier. */
export const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({ className, ...props }) => (
  <label className={cn('text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1', className)} {...props} />
);
