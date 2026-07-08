import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, PenTool, Trash2, Clock, MapPin, Pencil, Share2, FileDown, Play, Film, User, Eye, ExternalLink } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Input';
import { SmartSearch } from '../components/ui/SmartSearch';
import { PillTabs } from '../components/ui/PillTabs';
import { PageToolbar } from '../components/ui/PageToolbar';
import { GridSkeleton } from '../components/ui/Skeleton';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useToast } from '../context/ToastContext';
import { useAppState } from '../context/AppStateContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { fuzzyFilter } from '../lib/fuzzy';
import { useLibrarySessions, useLibraryDrills } from '../hooks/useLibrary';
import { DrillView } from '../components/pitch/DrillView';
import { AnimationPlayer } from '../components/pitch/AnimationPlayer';
import { DrillSections } from '../components/DrillSections';
import { flattenDrillDescription } from '../lib/drillText';
import { fetchAnimation } from '../services/animationService';
import { copySessionShareLink, ensureSessionShareToken, sessionShareUrl } from '../services/sessionShareService';
import { copyDrillShareLink, ensureDrillShareToken, drillShareUrl } from '../services/drillShareService';
import { downloadSessionPdf } from '../lib/sessionExport';
import { deleteLibrarySession, deleteLibraryDrill, type LibSession, type LibDrill } from '../services/libraryService';

/**
 * Library — saved sessions + drill library. Drills split by Static / Animated. Everything
 * is shareable via a link (session or per-drill); static-only content also offers a PDF.
 * Animated drills/sessions show a play badge and play inline (correct pitch proportions).
 */
type Item = (LibSession | LibDrill) & { _kind: 'session' | 'drill' };
const card = 'rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface';
const actBtn = 'flex-1 inline-flex items-center justify-center gap-1 px-1.5 py-2 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-brand/10 hover:text-brand active:bg-brand/20 active:text-brand transition-colors';

/** Fetches an animation by id and plays it at the correct pitch proportions. */
const AnimatedDrillPlayer: React.FC<{ animationId: string }> = ({ animationId }) => {
  const { data, isLoading } = useQuery({ queryKey: ['animation', animationId], queryFn: () => fetchAnimation(animationId) });
  if (isLoading || !data) return <div className="aspect-[3/2] grid place-items-center text-slate-400 text-sm"><div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>;
  return <AnimationPlayer frames={data.frames} pitchType={data.pitchType} orientation={data.orientation} frameDuration={data.frameDuration} flip={data.flip} grid={data.grid} gridColor={data.gridColor} autoPlay={false} />;
};

export const LibraryPage: React.FC = () => {
  const { canEdit, canManage } = usePermissions();
  const { club } = useAppState();
  const { user } = useAuth();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const { data: sessions, isLoading: sLoading } = useLibrarySessions();
  const { data: drills, isLoading: dLoading } = useLibraryDrills();
  const clubName = club?.settings?.branding?.club_display_name || club?.name || 'Sentinel Football Hub';

  const [tab, setTab] = useState<'sessions' | 'drills'>('sessions');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [coach, setCoach] = useState('all');
  const [drillType, setDrillType] = useState<'all' | 'static' | 'animated'>('all');
  const [view, setView] = useState<Item | null>(null);
  const [confirmDel, setConfirmDel] = useState<Item | null>(null);

  const isAnimated = (i: Item) => i._kind === 'drill' ? !!(i as LibDrill).animationId : (i as LibSession).drills.some(d => d.animationId);
  // Delete = admins (full access) OR the person who created the item. Everyone else views only.
  const canDelete = (i: Item) => canManage || (!!user?.id && (i as any).createdBy === user.id);

  const items: Item[] = useMemo(() => {
    let list: Item[] = tab === 'sessions'
      ? (sessions || []).map(s => ({ ...s, _kind: 'session' as const }))
      : (drills || []).map(d => ({ ...d, _kind: 'drill' as const }));
    if (tab === 'drills' && drillType !== 'all') list = list.filter(i => drillType === 'animated' ? !!(i as LibDrill).animationId : !(i as LibDrill).animationId);
    if (category !== 'all') list = list.filter(i => (i.categoryTag || 'General') === category);
    if (coach !== 'all') list = list.filter(i => ((i as any).author || '').trim() === coach);
    // Typo-tolerant fuzzy ranking across the fields a coach would search by (title weighted highest).
    list = fuzzyFilter(search, list, i => [i.title, (i as any).team, (i as any).author, (i as any).purpose, (i as any).description, i.categoryTag]);
    return list;
  }, [tab, sessions, drills, category, coach, search, drillType, canManage, user?.id]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    [...(sessions || []), ...(drills || [])].forEach(i => set.add(i.categoryTag || 'General'));
    return [...set].sort();
  }, [sessions, drills]);

  const coaches = useMemo(() => {
    const set = new Set<string>();
    [...(sessions || []), ...(drills || [])].forEach(i => { const a = (i.author || '').trim(); if (a) set.add(a); });
    return [...set].sort();
  }, [sessions, drills]);

  // Suggestion corpus for the smart search — titles + coaches + categories of the active tab.
  const searchCorpus = useMemo(() => {
    const src = tab === 'sessions' ? (sessions || []) : (drills || []);
    const out: { value: string; kind: 'title' | 'coach' | 'category' }[] = [];
    src.forEach(i => { if (i.title) out.push({ value: i.title, kind: 'title' }); });
    coaches.forEach(c => out.push({ value: c, kind: 'coach' }));
    categories.forEach(c => out.push({ value: c, kind: 'category' }));
    return out;
  }, [tab, sessions, drills, coaches, categories]);

  const delMutation = useMutation({
    mutationFn: (i: Item) => i._kind === 'session' ? deleteLibrarySession(i.id) : deleteLibraryDrill(i.id),
    onSuccess: (_d, i) => { queryClient.invalidateQueries({ queryKey: [i._kind === 'session' ? 'lib-sessions' : 'lib-drills'] }); showToast('Deleted.', 'success'); setConfirmDel(null); setView(null); },
    onError: (e) => showError(e),
  });

  const share = async (i: Item) => {
    try {
      await (i._kind === 'session' ? copySessionShareLink(i.id, (i as LibSession).shareToken) : copyDrillShareLink(i.id, (i as LibDrill).shareToken));
      showToast('Share link copied to clipboard.', 'success');
    } catch (e) { showError(e); }
  };
  const openFull = async (i: Item) => {
    try {
      const url = i._kind === 'session'
        ? sessionShareUrl(await ensureSessionShareToken(i.id, (i as LibSession).shareToken))
        : drillShareUrl(await ensureDrillShareToken(i.id, (i as LibDrill).shareToken));
      window.open(url, '_blank', 'noopener');
    } catch (e) { showError(e); }
  };

  const exportPdf = (i: Item) => {
    try {
      if (i._kind === 'session') {
        const s = i as LibSession;
        downloadSessionPdf({ title: s.title, team: s.team, venue: s.venue, author: s.author, duration: s.duration, purpose: s.purpose, date: s.date } as any,
          s.drills.map(d => ({ title: d.title, description: d.description || '', pitchType: d.pitchType, orientation: d.orientation, objects: d.objects, drawings: d.drawings, flip: d.flip })), clubName);
      } else {
        const d = i as LibDrill;
        downloadSessionPdf({ title: d.title, author: d.author }, [{ title: d.title, description: d.description || '', pitchType: d.pitchType, orientation: d.orientation, objects: d.objects, drawings: d.drawings, flip: d.flip }], clubName);
      }
    } catch (e) { showError(e); }
  };

  const isLoading = tab === 'sessions' ? sLoading : dLoading;
  const FilterChip: React.FC<{ v: typeof drillType; label: string }> = ({ v, label }) => (
    <button onClick={() => setDrillType(v)} className={'px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ' + (drillType === v ? 'bg-brand text-[#0a1628]' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10')}>{label}</button>
  );

  return (
    <div>
      <PageToolbar
        title="Library"
        description="Saved sessions and drills — share any of them with a link."
        dataTour="library-main"
        left={<PillTabs value={tab} onChange={t => setTab(t as 'sessions' | 'drills')} tabs={[
          { id: 'sessions', label: 'Sessions', count: sessions?.length ?? 0 },
          { id: 'drills', label: 'Drills', count: drills?.length ?? 0 },
        ]} />}
      >
        <div className="flex w-56"><SmartSearch value={search} onChange={setSearch} corpus={searchCorpus} placeholder={`Search ${tab}…`} /></div>
        <Select value={category} onChange={e => setCategory(e.target.value)} className="w-full sm:w-40 shrink-0">
          <option value="all">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select value={coach} onChange={e => setCoach(e.target.value)} className="w-full sm:w-40 shrink-0">
          <option value="all">All coaches</option>
          {coaches.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        {tab === 'drills' && (
          <div className="flex items-center gap-1.5">
            <FilterChip v="all" label="All" />
            <FilterChip v="static" label="Static" />
            <FilterChip v="animated" label="Animated" />
          </div>
        )}
        {(category !== 'all' || coach !== 'all' || drillType !== 'all' || search.trim()) && (
          <button onClick={() => { setCategory('all'); setCoach('all'); setDrillType('all'); setSearch(''); }}
            className="text-xs font-medium text-slate-500 hover:text-brand underline underline-offset-2 shrink-0">Clear filters</button>
        )}
      </PageToolbar>

      {isLoading ? (
        <GridSkeleton count={12} cols="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6" />
      ) : !items.length ? (
        <div className="py-16 text-center text-slate-400">{(tab === 'sessions' ? sessions?.length : drills?.length) ? 'No items match your filter.' : `No ${tab} yet.`}</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
          {items.map(i => {
            const animated = isAnimated(i);
            const author = (i as any).author as string | null;
            return (
              <div key={i.id} className={`${card} overflow-hidden flex flex-col`}>
                <button onClick={() => setView(i)} className="block w-full aspect-[3/2] bg-[#1e5c30] relative group" title="View">
                  {(i as any).image
                    ? <img src={(i as any).image} alt={i.title || ''} className="w-full h-full object-contain" />
                    : <span className="absolute inset-0 flex items-center justify-center text-white/40">{i._kind === 'session' ? <ClipboardList size={30} /> : <PenTool size={30} />}</span>}
                  {animated && <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-black/55 text-white rounded-full px-2 py-0.5"><Film size={10} /> Animated</span>}
                  {animated && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-10 h-10 rounded-full bg-black/45 text-white flex items-center justify-center group-hover:bg-brand group-hover:text-[#0a1628] transition-colors"><Play size={18} className="ml-0.5" /></span>
                    </span>
                  )}
                </button>
                <div className="p-3 flex-1 flex flex-col">
                  <div className="flex items-start gap-1.5">
                    <div className="flex-1 min-w-0">
                      <button onClick={() => setView(i)} className="font-bold text-sm text-slate-900 dark:text-white truncate block text-left hover:text-brand">{i.title || 'Untitled'}</button>
                      <span className="text-[10px] font-semibold rounded bg-brand/10 text-brand px-1.5 py-0.5 inline-block mt-1">{i.categoryTag || 'General'}</span>
                    </div>
                    {canEdit && i._kind === 'session' && (canManage || canDelete(i)) && <Link to={`/planner/${i.id}`} title="Edit in planner" className="p-1 rounded text-slate-400 hover:text-brand hover:bg-brand/10 shrink-0"><Pencil size={13} /></Link>}
                  </div>
                  {author && <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate"><User size={11} className="shrink-0" /> {author}</div>}
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    {i.duration && <span><Clock size={11} className="inline mr-1" />{i.duration}{typeof i.duration === 'number' ? ' min' : ''}</span>}
                    {i._kind === 'session' && (i as LibSession).team && <span className="truncate">{(i as LibSession).team}</span>}
                    {i._kind === 'session' && <span className="shrink-0">{(i as LibSession).drillCount} drill{(i as LibSession).drillCount === 1 ? '' : 's'}</span>}
                  </div>
                </div>
                {/* Actions — View · Share · PDF (static-only) */}
                <div className="flex border-t border-slate-200 dark:border-sentinel-border">
                  <button onClick={() => setView(i)} className={actBtn}><Eye size={14} /> View</button>
                  <button onClick={() => share(i)} className={actBtn + ' border-l border-slate-200 dark:border-sentinel-border'}><Share2 size={14} /> Share</button>
                  {!animated && <button onClick={() => exportPdf(i)} className={actBtn + ' border-l border-slate-200 dark:border-sentinel-border'}><FileDown size={14} /> PDF</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail / play */}
      {view && (
        <Modal open={!!view} onClose={() => setView(null)} title={view.title || 'Untitled'} size="2xl">
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 dark:text-slate-400">
              {view.categoryTag && <span className="text-brand font-semibold">{view.categoryTag}</span>}
              {(view as any).author && <span className="flex items-center gap-1"><User size={12} /> {(view as any).author}</span>}
              {view.duration && <span><Clock size={13} className="inline mr-1" />{view.duration}{typeof view.duration === 'number' ? ' min' : ''}</span>}
              {view._kind === 'session' && (view as LibSession).venue && <span><MapPin size={13} className="inline mr-1" />{(view as LibSession).venue}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => share(view)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-[#0a1628] hover:bg-brand-dark"><Share2 size={14} /> Copy share link</button>
              <button onClick={() => openFull(view)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-sentinel-border px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-brand"><ExternalLink size={14} /> View full version</button>
              {!isAnimated(view) && <button onClick={() => exportPdf(view)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-sentinel-border px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-brand"><FileDown size={14} /> PDF</button>}
              {canDelete(view) && <button onClick={() => setConfirmDel(view)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"><Trash2 size={14} /> Delete</button>}
            </div>

            {view.purpose && <div><div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Purpose</div><p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{flattenDrillDescription(view.purpose)}</p></div>}

            {/* Single drill — pitch centred on top, full descriptor set (N/A where empty) below. */}
            {view._kind === 'drill' && (
              <>
                <div className="max-w-[620px] mx-auto">
                  {(view as LibDrill).animationId
                    ? <AnimatedDrillPlayer animationId={(view as LibDrill).animationId!} />
                    : <DrillView pitchType={(view as LibDrill).pitchType} orientation={(view as LibDrill).orientation} objects={(view as LibDrill).objects} drawings={(view as LibDrill).drawings} flip={(view as LibDrill).flip} grid={(view as LibDrill).grid} gridColor={(view as LibDrill).gridColor} />}
                </div>
                <DrillSections description={(view as LibDrill).description} all />
              </>
            )}

            {/* Session — plays each drill like the share link */}
            {view._kind === 'session' && (view as LibSession).drills.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Drills ({(view as LibSession).drills.length})</div>
                <div className="space-y-3">
                  {(view as LibSession).drills.map((d, idx) => (
                    <div key={d.id || idx} className="rounded-lg border border-slate-200 dark:border-sentinel-border overflow-hidden">
                      <div className="px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center justify-between bg-slate-50 dark:bg-sentinel-bg">
                        <span>{idx + 1}. {d.title || 'Drill'}{d.duration ? ` · ${d.duration} min` : ''}</span>
                        {d.animationId && <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-brand"><Film size={10} /> Animated</span>}
                      </div>
                      <div className="max-w-[520px] mx-auto p-2">
                        {d.animationId
                          ? <AnimatedDrillPlayer animationId={d.animationId} />
                          : <DrillView pitchType={d.pitchType} orientation={d.orientation} objects={d.objects} drawings={d.drawings} flip={d.flip} grid={d.grid} gridColor={d.gridColor} />}
                      </div>
                      <DrillSections description={d.description} className="px-3 pb-3" compact all />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmModal open onClose={() => setConfirmDel(null)} onConfirm={() => delMutation.mutate(confirmDel)}
          title={`Delete ${confirmDel.title || 'this item'}?`} message="This item will be removed." busy={delMutation.isPending} />
      )}
    </div>
  );
};
