import React, { useMemo, useRef, useState } from 'react';
import { Plus, Minus, X, RotateCcw } from 'lucide-react';
import { fuzzyFilter } from '../../lib/fuzzy';
import { parseEquipment, serializeEquipment, DEFAULT_EQUIPMENT, type EquipmentItem } from '../../lib/equipment';
import type { EquipmentHistory } from '../../services/plannerService';

/**
 * Equipment picker for the Session Planner — a TAG INPUT: committed items live as pills
 * INSIDE the field, and you type the next item right after them. Each pill carries an
 * editable quantity; a history-backed autocomplete suggests kit you've used before (with the
 * quantity you usually bring), and one tap reuses your last session's whole kit.
 *
 * State stays a single string (`value`) so it round-trips straight to the DB column — see
 * lib/equipment. We derive pills from it and re-serialise on every edit.
 */
interface Props {
  value: string;
  onChange: (value: string) => void;
  history?: EquipmentHistory;
}

const PILL = 'inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-sentinel-border bg-white dark:bg-white/10 pl-2.5 pr-1 py-0.5 text-sm text-slate-700 dark:text-slate-200 max-w-full';
const NUM = 'bg-transparent text-center text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

export const EquipmentField: React.FC<Props> = ({ value, onChange, history }) => {
  const items = useMemo(() => parseEquipment(value), [value]);
  const [draft, setDraft] = useState('');
  const [qty, setQty] = useState(1);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0); // highlighted suggestion index
  const inputRef = useRef<HTMLInputElement>(null);

  const setItems = (next: EquipmentItem[]) => onChange(serializeEquipment(next));
  const existingKeys = useMemo(() => new Set(items.map(i => i.item.toLowerCase())), [items]);

  // Suggestion corpus: the coach's history (usage count + typical qty) then the default
  // catalogue, deduped and minus anything already added.
  const corpus = useMemo(() => {
    const seen = new Set<string>();
    const out: { item: string; qty?: number; count: number }[] = [];
    for (const s of history?.suggestions ?? []) { const k = s.item.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(s); } }
    for (const name of DEFAULT_EQUIPMENT) { const k = name.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push({ item: name, count: 0 }); } }
    return out.filter(s => !existingKeys.has(s.item.toLowerCase()));
  }, [history, existingKeys]);

  const suggestions = useMemo(
    () => (draft.trim() ? fuzzyFilter(draft, corpus, s => [s.item]) : corpus).slice(0, 8),
    [draft, corpus],
  );

  const addItem = (name: string, q?: number) => {
    // Commas separate items in the stored string — strip any the coach types into a name,
    // or it would split into phantom items on the next load. Collapse the leftover whitespace.
    const clean = name.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    if (!existingKeys.has(clean.toLowerCase())) {
      const n = q ?? qty;
      setItems([...items, { item: clean, qty: n > 0 ? n : undefined }]);
    }
    setDraft(''); setQty(1); setOpen(false); setHi(0);
    inputRef.current?.focus();
  };
  const pickSuggestion = (s: { item: string; qty?: number }) => addItem(s.item, s.qty ?? 1);
  const updateQty = (idx: number, q: number) => setItems(items.map((it, i) => i === idx ? { ...it, qty: q > 0 ? q : undefined } : it));
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi(h => Math.min(h + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (open && suggestions[hi]) pickSuggestion(suggestions[hi]); else addItem(draft); }
    // Backspace on an empty draft removes the last pill (standard tag-input behaviour).
    else if (e.key === 'Backspace' && !draft && items.length) { e.preventDefault(); removeItem(items.length - 1); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  const lastUsed = history?.lastUsed ?? [];
  const reuseLabel = lastUsed.map(i => i.qty ? `${i.item} ×${i.qty}` : i.item).slice(0, 4).join(', ');

  return (
    <div>
      <div className="flex items-start gap-2">
        {/* Tag-input box: pills + the inline text field, all inside one bordered box. */}
        <div className="relative flex-1 min-w-0">
          <div onMouseDown={e => { if (e.target === e.currentTarget) inputRef.current?.focus(); }}
            className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg px-2 py-1.5 min-h-[38px] max-h-24 overflow-y-auto cursor-text transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
            {items.map((it, i) => (
              <span key={i} className={PILL}>
                <span className="font-medium truncate max-w-[8rem]">{it.item}</span>
                <span className="text-slate-400">×</span>
                <input type="number" min={1} value={it.qty ?? ''} placeholder="–"
                  onChange={e => updateQty(i, parseInt(e.target.value, 10) || 0)}
                  aria-label={`${it.item} quantity`} className={NUM + ' w-7 text-slate-800 dark:text-slate-100'} />
                <button type="button" onClick={() => removeItem(i)} title={`Remove ${it.item}`}
                  className="p-0.5 rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"><X size={12} /></button>
              </span>
            ))}
            <input ref={inputRef} value={draft}
              placeholder={items.length ? 'Add…' : 'e.g. Cones, Bibs, Balls…'}
              onChange={e => { setDraft(e.target.value); setOpen(true); setHi(0); }}
              onFocus={() => setOpen(true)}
              onBlur={() => { setTimeout(() => setOpen(false), 120); }}
              onKeyDown={onKeyDown}
              className="flex-1 min-w-[80px] bg-transparent outline-none text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 py-0.5" />
          </div>
          {open && suggestions.length > 0 && (
            <ul onMouseDown={e => e.preventDefault()} /* keep input focus while clicking a row */
              className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface shadow-lg py-1">
              {suggestions.map((s, i) => (
                <li key={s.item}>
                  <button type="button" onClick={() => pickSuggestion(s)} onMouseEnter={() => setHi(i)}
                    className={'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left ' + (i === hi ? 'bg-brand/10 text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300')}>
                    <Plus size={13} className="text-slate-400 shrink-0" />
                    <span className="flex-1 truncate">{s.item}</span>
                    {s.qty ? <span className="text-xs text-slate-400 tabular-nums">usually ×{s.qty}</span>
                      : s.count > 0 ? <span className="text-xs text-slate-400">used {s.count}×</span>
                      : <span className="text-[10px] uppercase tracking-wide text-slate-300 dark:text-slate-500">suggested</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* Quantity for the next item + Add. */}
        <div className="flex items-center rounded-lg border border-slate-200 dark:border-sentinel-border overflow-hidden shrink-0 h-[38px]">
          <button type="button" tabIndex={-1} onClick={() => setQty(q => Math.max(1, q - 1))}
            className="px-2 self-stretch text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"><Minus size={13} /></button>
          <input type="number" min={1} value={qty} aria-label="Quantity to add"
            onChange={e => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))} className={NUM + ' w-9'} />
          <button type="button" tabIndex={-1} onClick={() => setQty(q => q + 1)}
            className="px-2 self-stretch text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"><Plus size={13} /></button>
        </div>
        <button type="button" onClick={() => addItem(draft)} disabled={!draft.trim()}
          className="shrink-0 h-[38px] inline-flex items-center gap-1 rounded-lg bg-brand px-3 text-sm font-semibold text-[#0D1B2A] disabled:opacity-40 disabled:cursor-not-allowed">
          <Plus size={15} /> Add
        </button>
      </div>

      {/* One-tap reuse of last session's kit — only when the field is empty and history exists */}
      {items.length === 0 && lastUsed.length > 0 && (
        <button type="button" onClick={() => setItems(lastUsed)}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
          <RotateCcw size={13} /> Reuse last session ({reuseLabel}{lastUsed.length > 4 ? '…' : ''})
        </button>
      )}
    </div>
  );
};
