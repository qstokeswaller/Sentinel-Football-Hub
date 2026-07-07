import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, Check } from 'lucide-react';
import { fuzzyFilter } from '../../lib/fuzzy';

/**
 * Player multi-select with search — for one-to-one programmes (e.g. Orion) where a session is
 * for specific individuals, possibly drawn from several squads at the same time. Coach-scoped
 * player list is passed in. Selected players show as chips; the list groups by squad name.
 */
interface PItem { id: string; name: string; squadId: string | null; position?: string | null; jerseyNumber?: string | number | null; }

export const PlayerMultiSelect: React.FC<{
  players: PItem[]; squadNames: Record<string, string>; value: string[]; onChange: (ids: string[]) => void; placeholder?: string;
}> = ({ players, squadNames, value, onChange, placeholder = 'Search players…' }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selected = useMemo(() => value.map(id => players.find(p => p.id === id)).filter(Boolean) as PItem[], [value, players]);
  const filtered = useMemo(() => fuzzyFilter(query, players, p => [p.name, squadNames[p.squadId || ''] || '', p.position || '']).slice(0, 60), [query, players, squadNames]);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);

  return (
    <div ref={wrapRef} className="relative">
      {selected.length > 0 && (
        <div className="mb-2">
          {/* Count + clear so stacking many individuals (across squads) never overpopulates the panel. */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-slate-400">{selected.length} selected</span>
            <button type="button" onClick={() => onChange([])} className="text-[11px] text-slate-400 hover:text-brand">Clear all</button>
          </div>
          {/* Chips wrap and the block is height-capped + scrolls — bounded however many are picked. */}
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
            {selected.map(p => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-brand/10 text-brand text-xs font-medium pl-2.5 pr-1 py-1">
                {p.jerseyNumber ? `#${p.jerseyNumber} ` : ''}{p.name}
                <button type="button" onClick={() => toggle(p.id)} className="hover:bg-brand/20 rounded-full p-0.5"><X size={11} /></button>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={query} onChange={e => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={placeholder}
          className="w-full rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-brand" />
      </div>
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-60 overflow-auto overscroll-contain rounded-lg border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface shadow-xl py-1">
          {filtered.length ? filtered.map(p => {
            const on = value.includes(p.id);
            return (
              <button key={p.id} type="button" onClick={() => toggle(p.id)}
                className={'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors ' + (on ? 'bg-brand/10 text-brand' : 'hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200')}>
                <span className={'w-4 h-4 rounded border flex items-center justify-center shrink-0 ' + (on ? 'bg-brand border-brand text-[#0a1628]' : 'border-slate-300 dark:border-slate-500')}>{on && <Check size={11} />}</span>
                <span className="truncate flex-1">{p.jerseyNumber ? `#${p.jerseyNumber} ` : ''}{p.name}</span>
                <span className="text-[11px] text-slate-400 shrink-0">{squadNames[p.squadId || ''] || ''}</span>
              </button>
            );
          }) : <div className="px-3 py-3 text-xs text-slate-400 text-center">No players found.</div>}
        </div>
      )}
    </div>
  );
};
