import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, PenTool, Film, Copy, Search } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { PillTabs } from '../ui/PillTabs';
import { Select } from '../ui/Input';
import { fuzzyFilter } from '../../lib/fuzzy';
import { fetchLoadableSessions, type LoadableSession } from '../../services/plannerService';
import { fetchLibraryDrills, type LibDrill } from '../../services/libraryService';

/**
 * Load-from-library picker for the planner. Two tabs: Sessions & Templates (loaded as a NEW
 * draft — the planner strips ids so the original is never overwritten), and Drills (appended
 * to the active phase as a copy). Templates carry a badge so they read as reusable shells.
 */
interface Props {
  clubId: string;
  onClose: () => void;
  onPickSession: (id: string) => void;
  onPickDrill: (id: string) => void;
}

const INPUT = 'w-full rounded-lg border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-bg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand';

export const LoadFromLibraryModal: React.FC<Props> = ({ clubId, onClose, onPickSession, onPickDrill }) => {
  const [tab, setTab] = useState<'sessions' | 'drills'>('sessions');
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
  const [author, setAuthor] = useState('all');
  const [sort, setSort] = useState<'recent' | 'az'>('recent');
  const { data: sessions, isLoading: sL } = useQuery({ queryKey: ['loadable-sessions', clubId], queryFn: () => fetchLoadableSessions(clubId), enabled: !!clubId });
  const { data: drills, isLoading: dL } = useQuery({ queryKey: ['lib-drills', clubId], queryFn: () => fetchLibraryDrills(clubId), enabled: !!clubId });

  const switchTab = (t: 'sessions' | 'drills') => { setTab(t); setCat('all'); setAuthor('all'); };
  const activeRaw: any[] = (tab === 'sessions' ? sessions : drills) || [];
  const cats = useMemo(() => Array.from(new Set(activeRaw.map(x => x.categoryTag).filter(Boolean))).sort() as string[], [activeRaw]);
  const authors = useMemo(() => Array.from(new Set(activeRaw.map(x => x.author).filter(Boolean))).sort() as string[], [activeRaw]);
  const applyFilters = <T extends { title?: string | null; categoryTag?: string | null; author?: string | null }>(list: T[]): T[] => {
    let r = list;
    if (cat !== 'all') r = r.filter(x => (x.categoryTag || 'General') === cat);
    if (author !== 'all') r = r.filter(x => x.author === author);
    if (sort === 'az') r = [...r].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    return r;
  };

  const sListBase = useMemo(() => fuzzyFilter(search, sessions || [], (s: LoadableSession) => [s.title, s.team, s.categoryTag]), [search, sessions]);
  const sList = applyFilters(sListBase);
  const dList = applyFilters(useMemo(() => fuzzyFilter(search, drills || [], (d: LibDrill) => [d.title, d.categoryTag, d.author]), [search, drills]));
  const isLoading = tab === 'sessions' ? sL : dL;
  const empty = tab === 'sessions' ? !sList.length : !dList.length;

  const Thumb: React.FC<{ image: string | null; animated?: boolean; fallback: React.ReactNode }> = ({ image, animated, fallback }) => (
    <div className="aspect-[3/2] bg-[#1e5c30] relative shrink-0">
      {image ? <img src={image} alt="" className="w-full h-full object-contain" /> : <span className="absolute inset-0 flex items-center justify-center text-white/40">{fallback}</span>}
      {animated && <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-black/55 text-white rounded-full px-1.5 py-0.5"><Film size={9} /> Animated</span>}
    </div>
  );

  return (
    <Modal open onClose={onClose} title="Load from library" size="2xl">
      <div className="mb-3">
        <PillTabs value={tab} onChange={t => switchTab(t as 'sessions' | 'drills')} tabs={[
          { id: 'sessions', label: 'Sessions & Templates', count: sessions?.length ?? 0 },
          { id: 'drills', label: 'Drills', count: drills?.length ?? 0 },
        ]} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${tab}…`} className={INPUT} autoFocus />
        </div>
        {/* Category filter — only when the active list actually has categories (drills do; sessions don't). */}
        {cats.length > 0 && (
          <Select value={cat} onChange={e => setCat(e.target.value)} className="w-44 shrink-0">
            <option value="all">All categories</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        )}
        {authors.length > 0 && (
          <Select value={author} onChange={e => setAuthor(e.target.value)} className="w-48 shrink-0">
            <option value="all">All coaches</option>
            {authors.map(a => <option key={a} value={a}>{a}</option>)}
          </Select>
        )}
        <Select value={sort} onChange={e => setSort(e.target.value as 'recent' | 'az')} className="w-40 shrink-0">
          <option value="recent">Most recent</option>
          <option value="az">A–Z</option>
        </Select>
      </div>

      <div className="max-h-[55vh] overflow-y-auto -mx-1 px-1">
        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-sm"><i className="fas fa-circle-notch fa-spin" /> Loading…</div>
        ) : empty ? (
          <div className="py-12 text-center text-slate-400 text-sm">{tab === 'sessions' ? 'No sessions or templates yet.' : 'No drills in the library yet.'}</div>
        ) : tab === 'sessions' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {sList.map(s => (
              <button key={s.id} onClick={() => onPickSession(s.id)} className="text-left rounded-xl border border-slate-200 dark:border-sentinel-border overflow-hidden hover:border-brand hover:shadow-sm transition-all group">
                <Thumb image={s.image} fallback={<ClipboardList size={26} />} />
                <div className="p-2.5">
                  <div className="flex items-center gap-1.5">
                    {s.isTemplate && <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-brand bg-brand/10 rounded px-1.5 py-0.5 shrink-0"><Copy size={9} /> Template</span>}
                    <span className="text-[10px] text-slate-400 truncate">{s.categoryTag || 'General'}</span>
                  </div>
                  <div className="font-semibold text-sm text-slate-900 dark:text-white truncate mt-0.5 group-hover:text-brand">{s.title}</div>
                  <div className="text-[11px] text-slate-400">{s.drillCount} drill{s.drillCount === 1 ? '' : 's'}{s.team ? ` · ${s.team}` : ''}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {dList.map(d => (
              <button key={d.id} onClick={() => onPickDrill(d.id)} className="text-left rounded-xl border border-slate-200 dark:border-sentinel-border overflow-hidden hover:border-brand hover:shadow-sm transition-all group">
                <Thumb image={d.image} animated={!!d.animationId} fallback={<PenTool size={26} />} />
                <div className="p-2.5">
                  <span className="text-[10px] text-slate-400 truncate block">{d.categoryTag || 'General'}</span>
                  <div className="font-semibold text-sm text-slate-900 dark:text-white truncate mt-0.5 group-hover:text-brand">{d.title || 'Untitled drill'}</div>
                  {d.author && <div className="text-[11px] text-slate-400 truncate">{d.author}</div>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
