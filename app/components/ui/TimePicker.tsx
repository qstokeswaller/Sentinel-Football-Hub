import * as React from 'react';
import { Clock, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * TimePicker — platform-standard time field. Inline SEGMENTED HH:MM editor with visible ▲▼
 * steppers on each segment (so it's obvious you can adjust it): tap the arrows, type digits
 * (auto-advancing hour→minute), or use ↑/↓. Hours step by 1, MINUTES step by 5. Styled to
 * match the app — no native <input type="time">. Value is a 24h "HH:MM" string; empty = "".
 */
const base = 'w-full rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg px-3 py-2 text-sm outline-none transition-colors';
const pad = (n: number) => String(n).padStart(2, '0');

/** Parse a loose typed/pasted string ("16:30", "930", "9:30 pm") → 24h "HH:MM" (or null). */
export function parseTime(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  const pm = /pm$/.test(s), am = /am$/.test(s);
  const core = s.replace(/[ap]m$/, '');
  let h: number, min: number;
  const m = core.match(/^(\d{1,2}):?(\d{2})$/);
  if (m) { h = +m[1]; min = +m[2]; }
  else { const h2 = core.match(/^(\d{1,2})$/); if (!h2) return null; h = +h2[1]; min = 0; }
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

export const TimePicker: React.FC<{
  value?: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; className?: string;
}> = ({ value = '', onChange, placeholder = 'Select time', disabled, className }) => {
  const m = (value || '').match(/(\d{1,2}):(\d{2})/);
  const hh = m ? +m[1] : null;
  const mm = m ? +m[2] : null;

  const [focus, setFocus] = React.useState<'h' | 'm' | null>(null);
  const typed = React.useRef(''); // digits entered in the active segment since it gained focus
  const hRef = React.useRef<HTMLSpanElement>(null);
  const mRef = React.useRef<HTMLSpanElement>(null);
  const focusSeg = (s: 'h' | 'm') => (s === 'h' ? hRef : mRef).current?.focus();

  // Emit a canonical "HH:MM" (missing half defaults to 00); both empty clears the field.
  const emit = (h: number | null, mi: number | null) => onChange(h == null && mi == null ? '' : `${pad(h ?? 0)}:${pad(mi ?? 0)}`);
  const setHour = (h: number) => emit(h, mm);
  const setMin = (mi: number) => emit(hh, mi);

  // Steppers (▲/▼ + ↑/↓): hours ±1 (wrap 0–23); minutes ±5, snapped to 5-minute marks (wrap 0–55).
  const stepHour = (dir: 1 | -1) => { typed.current = ''; const b = hh ?? (dir > 0 ? -1 : 0); setHour(((b + dir) % 24 + 24) % 24); setFocus('h'); };
  const stepMin = (dir: 1 | -1) => { typed.current = ''; const b = mm ?? 0; const next = dir > 0 ? Math.floor(b / 5) * 5 + 5 : Math.ceil(b / 5) * 5 - 5; setMin((next % 60 + 60) % 60); setFocus('m'); };

  const onSegFocus = (s: 'h' | 'm') => { typed.current = ''; setFocus(s); };
  const onSegBlur = () => setTimeout(() => {
    const a = document.activeElement;
    if (a !== hRef.current && a !== mRef.current) setFocus(null);
  }, 0);

  // Digit entry with the native-input feel: a leading 0-2 (hour) / 0-5 (minute) waits for a
  // second digit; anything higher is a complete single-digit value and auto-advances. Typing
  // still allows any exact minute (e.g. 16:23) — the 5-minute rule only governs the arrows.
  const hourDigit = (d: number) => {
    const buf = typed.current;
    if (buf.length && +(buf + d) <= 23) { setHour(+(buf + d)); typed.current = ''; focusSeg('m'); }
    else if (d >= 3) { setHour(d); typed.current = ''; focusSeg('m'); }
    else { typed.current = String(d); setHour(d); }
  };
  const minDigit = (d: number) => {
    const buf = typed.current;
    if (buf.length && +(buf + d) <= 59) { setMin(+(buf + d)); typed.current = ''; }
    else if (d >= 6) { setMin(d); typed.current = ''; }
    else { typed.current = String(d); setMin(d); }
  };

  const onKey = (s: 'h' | 'm') => (e: React.KeyboardEvent) => {
    if (disabled) return;
    const k = e.key;
    if (/^\d$/.test(k)) { e.preventDefault(); (s === 'h' ? hourDigit : minDigit)(+k); return; }
    if (k === 'ArrowUp') { e.preventDefault(); (s === 'h' ? stepHour : stepMin)(1); return; }
    if (k === 'ArrowDown') { e.preventDefault(); (s === 'h' ? stepHour : stepMin)(-1); return; }
    if (k === 'ArrowRight' || k === ':' || k === ' ') { e.preventDefault(); focusSeg('m'); return; }
    if (k === 'ArrowLeft') { e.preventDefault(); focusSeg('h'); return; }
    if (k === 'Backspace') { e.preventDefault(); typed.current = ''; if (s === 'm') { setMin(0); focusSeg('h'); } else emit(null, null); return; }
  };

  const onPaste = (e: React.ClipboardEvent) => { const p = parseTime(e.clipboardData.getData('text')); if (p) { e.preventDefault(); onChange(p); } };

  const showPlaceholder = hh == null && mm == null && focus == null;
  const segCls = (active: boolean, empty: boolean) => cn('px-1 py-0.5 rounded tabular-nums select-none outline-none cursor-text transition-colors',
    active ? 'bg-brand/15 text-brand font-semibold' : empty ? 'text-slate-400' : 'text-slate-900 dark:text-slate-100');

  // One HH or MM segment: the editable number + its little up/down stepper. A plain function
  // returning JSX (NOT a nested component) so it inlines without remounting / breaking focus.
  const renderSeg = (which: 'h' | 'm', val: number | null, ref: React.RefObject<HTMLSpanElement>) => {
    const step = which === 'h' ? stepHour : stepMin;
    const name = which === 'h' ? 'Hour' : 'Minute';
    return (
      <span className="inline-flex items-center gap-0.5">
        <span ref={ref} role="spinbutton" aria-label={name} aria-valuenow={val ?? undefined} tabIndex={disabled ? -1 : 0}
          onFocus={() => onSegFocus(which)} onBlur={onSegBlur} onKeyDown={onKey(which)} onPaste={onPaste}
          className={segCls(focus === which, val == null)}>{val != null ? pad(val) : '––'}</span>
        <span className="inline-flex flex-col leading-none text-slate-300 dark:text-slate-500">
          <button type="button" tabIndex={-1} disabled={disabled} aria-label={`${name} up`}
            onMouseDown={e => e.preventDefault()} onClick={() => step(1)} className="hover:text-brand -mb-0.5"><ChevronUp size={13} /></button>
          <button type="button" tabIndex={-1} disabled={disabled} aria-label={`${name} down`}
            onMouseDown={e => e.preventDefault()} onClick={() => step(-1)} className="hover:text-brand -mt-0.5"><ChevronDown size={13} /></button>
        </span>
      </span>
    );
  };

  return (
    <div
      onMouseDown={e => { if (!disabled && e.target === e.currentTarget) { e.preventDefault(); focusSeg('h'); } }}
      className={cn(base, 'flex items-center justify-between gap-2 cursor-text', className,
        focus && 'border-brand ring-2 ring-brand/20', disabled && 'opacity-50 cursor-not-allowed')}>
      {/* Placeholder only when empty + unfocused; segments stay mounted (sr-only) so refs stay
          focusable — clicking here lands on the hour segment and reveals the steppers. */}
      {showPlaceholder && (
        <span onMouseDown={e => { if (disabled) return; e.preventDefault(); focusSeg('h'); }} className="flex-1 text-slate-400 select-none">{placeholder}</span>
      )}
      <div className={cn('flex items-center gap-1', showPlaceholder && 'sr-only')}>
        {renderSeg('h', hh, hRef)}
        <span className="text-slate-400">:</span>
        {renderSeg('m', mm, mRef)}
      </div>
      <Clock size={15} onMouseDown={e => { e.preventDefault(); if (!disabled) focusSeg('h'); }}
        className={cn('shrink-0 text-slate-400 cursor-text', focus && 'text-brand')} />
    </div>
  );
};
