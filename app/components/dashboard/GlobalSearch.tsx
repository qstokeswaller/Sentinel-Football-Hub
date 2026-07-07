import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, User, Shield, Trophy, ClipboardList, Binoculars } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { globalSearch, type SearchResult } from '../../services/searchService';

const ICON: Record<SearchResult['kind'], React.ElementType> = { player: User, squad: Shield, match: Trophy, session: ClipboardList, scouted: Binoculars };

/** Dashboard global search — searches players / squads / matches / sessions / scouted players. */
export const GlobalSearch: React.FC = () => {
  const { effectiveClubId } = useAppState();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(q), 220); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const { data: results, isFetching } = useQuery({
    queryKey: ['globalSearch', effectiveClubId, debounced],
    queryFn: () => globalSearch(effectiveClubId, debounced),
    enabled: debounced.trim().length >= 2,
    staleTime: 30_000,
  });

  const go = (r: SearchResult) => { setOpen(false); setQ(''); navigate(r.to); };

  return (
    <div ref={wrapRef} data-tour="global-search" className="relative w-full max-w-md">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search players, squads, matches…"
        className="w-full rounded-lg border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
      {open && debounced.trim().length >= 2 && (
        <div className="absolute z-[200] mt-1.5 w-full rounded-lg border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface shadow-2xl overflow-hidden fh-fade-in max-h-80 overflow-y-auto">
          {isFetching && !results ? (
            <div className="px-4 py-3 text-sm text-slate-400"><i className="fas fa-circle-notch fa-spin" /> Searching…</div>
          ) : !results?.length ? (
            <div className="px-4 py-3 text-sm text-slate-400">No matches for "{debounced}".</div>
          ) : results.map(r => {
            const Icon = ICON[r.kind];
            return (
              <button key={`${r.kind}-${r.id}`} onClick={() => go(r)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-white/5">
                <span className="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0"><Icon size={15} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-slate-900 dark:text-white truncate">{r.label}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400 truncate capitalize">{r.kind} · {r.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
