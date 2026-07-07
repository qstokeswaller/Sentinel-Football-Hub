import * as React from 'react';
import { Timer, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * DurationPicker — inline session-length field matching the TimePicker: an editable number
 * with a visible ▲▼ stepper. Arrows step by 30 minutes (clamped 30–240); you can also type an
 * exact value. Value is a "N mins" string (empty = ""), so it round-trips with the existing
 * text `duration` column and every consumer that already renders it.
 */
const base = 'w-full rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg px-3 py-2 text-sm outline-none transition-colors';
const STEP = 30, MIN = 30, MAX = 240;
const parseMins = (v?: string): number | null => { const m = (v || '').match(/\d+/); return m ? +m[0] : null; };
const clamp = (n: number) => Math.max(MIN, Math.min(MAX, n));

export const DurationPicker: React.FC<{
  value?: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; className?: string;
}> = ({ value = '', onChange, placeholder = 'Select duration…', disabled, className }) => {
  const cur = parseMins(value);
  const [focus, setFocus] = React.useState(false);
  const typed = React.useRef('');
  const ref = React.useRef<HTMLSpanElement>(null);
  const focusIt = () => ref.current?.focus();

  const emit = (n: number | null) => onChange(n == null ? '' : `${n} mins`);

  // ▲/▼ + ↑/↓ step by 30, snapped to 30-minute marks and clamped to 30–240.
  const step = (dir: 1 | -1) => {
    typed.current = '';
    const b = cur ?? (dir > 0 ? MIN - STEP : MIN);
    const snapped = dir > 0 ? Math.floor(b / STEP) * STEP + STEP : Math.ceil(b / STEP) * STEP - STEP;
    emit(clamp(snapped)); setFocus(true);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const k = e.key;
    if (/^\d$/.test(k)) {
      e.preventDefault();
      const buf = (typed.current + k).slice(-3);
      let n = +buf;
      if (n > MAX) { n = +k; typed.current = k; } else typed.current = buf;
      emit(n || null);
      return;
    }
    if (k === 'ArrowUp') { e.preventDefault(); step(1); return; }
    if (k === 'ArrowDown') { e.preventDefault(); step(-1); return; }
    if (k === 'Backspace') { e.preventDefault(); typed.current = ''; emit(null); return; }
  };

  // On blur, snap a typed value below the minimum up to 30 (e.g. "10" → "30 mins").
  const onBlur = () => { if (cur != null && cur < MIN) emit(MIN); setFocus(false); };

  const showPlaceholder = cur == null && !focus;

  return (
    <div
      onMouseDown={e => { if (!disabled && e.target === e.currentTarget) { e.preventDefault(); focusIt(); } }}
      className={cn(base, 'flex items-center justify-between gap-2 cursor-text', className,
        focus && 'border-brand ring-2 ring-brand/20', disabled && 'opacity-50 cursor-not-allowed')}>
      {showPlaceholder && (
        <span onMouseDown={e => { if (disabled) return; e.preventDefault(); focusIt(); }} className="flex-1 text-slate-400 select-none">{placeholder}</span>
      )}
      <div className={cn('flex items-center gap-1.5', showPlaceholder && 'sr-only')}>
        <span className="inline-flex items-center gap-0.5">
          <span ref={ref} role="spinbutton" aria-label="Duration in minutes" aria-valuenow={cur ?? undefined} tabIndex={disabled ? -1 : 0}
            onFocus={() => { typed.current = ''; setFocus(true); }} onBlur={onBlur} onKeyDown={onKey}
            className={cn('px-1 py-0.5 rounded tabular-nums select-none outline-none cursor-text transition-colors',
              focus ? 'bg-brand/15 text-brand font-semibold' : cur == null ? 'text-slate-400' : 'text-slate-900 dark:text-slate-100')}>
            {cur != null ? cur : '––'}
          </span>
          <span className="inline-flex flex-col leading-none text-slate-300 dark:text-slate-500">
            <button type="button" tabIndex={-1} disabled={disabled} aria-label="Duration up"
              onMouseDown={e => e.preventDefault()} onClick={() => step(1)} className="hover:text-brand -mb-0.5"><ChevronUp size={13} /></button>
            <button type="button" tabIndex={-1} disabled={disabled} aria-label="Duration down"
              onMouseDown={e => e.preventDefault()} onClick={() => step(-1)} className="hover:text-brand -mt-0.5"><ChevronDown size={13} /></button>
          </span>
        </span>
        <span className="text-slate-500 dark:text-slate-400 select-none">mins</span>
      </div>
      <Timer size={15} onMouseDown={e => { e.preventDefault(); if (!disabled) focusIt(); }}
        className={cn('shrink-0 text-slate-400 cursor-text', focus && 'text-brand')} />
    </div>
  );
};
