import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Save, Share2, Copy, X, Pencil, Check, FolderOpen, ChevronDown, ChevronUp, ClipboardList } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { DatePicker } from '../components/ui/DatePicker';
import { TimePicker } from '../components/ui/TimePicker';
import { DurationPicker } from '../components/ui/DurationPicker';
import { copySessionShareLink } from '../services/sessionShareService';
import { useAppState } from '../context/AppStateContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import { DrillBlock } from '../components/pitch/DrillBlock';
import { PageSkeleton } from '../components/ui/Skeleton';
import { LoadFromLibraryModal } from '../components/pitch/LoadFromLibraryModal';
import { PlayerMultiSelect } from '../components/dashboard/PlayerMultiSelect';
import { EquipmentField } from '../components/planner/EquipmentField';
import { renderDrillThumbnail } from '../components/pitch/drillRenderer';
import { statusCfg } from '../lib/playerStatus';
import { cn } from '../lib/utils';
import {
  fetchSessionForEdit, fetchDrillById, saveSession, saveDrillToLibrary, fetchSquadsAndPlayers,
  fetchEquipmentHistory, emptyDrill, emptySession, DEFAULT_PHASES, type PlannerDrill, type PlannerSession,
} from '../services/plannerService';

// Matches the shared Input/Select/TimePicker base so every field on the page looks uniform.
const INPUT = 'w-full rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20';
const LABEL = 'text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1';
const card = 'rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface';
// Ability tiers, ordered youngest/least-advanced → most-advanced.
const ABILITY_LEVELS = ['Juniors', 'Intermediate', 'Seniors', 'Elite'];

export const SessionPlannerPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveClubId, profile, archetype } = useAppState();
  const isPrivate = archetype === 'private_coaching';
  const { user } = useAuth();
  const { canEdit } = usePermissions();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();

  const [session, setSession] = useState<PlannerSession>(emptySession());
  const [drills, setDrills] = useState<PlannerDrill[]>([emptyDrill(0)]);
  const [activePhase, setActivePhase] = useState(0);
  const [editingPhase, setEditingPhase] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false); // collapsible Session Details panel
  const [loadOpen, setLoadOpen] = useState(false);
  const [savedLib, setSavedLib] = useState<Set<string>>(new Set()); // drill ids saved to library this session
  const seeded = useRef(false);

  const { data, isLoading } = useQuery({ queryKey: ['planner-session', id], queryFn: () => fetchSessionForEdit(id!), enabled: !!id });
  useEffect(() => { if (data && !seeded.current) { seeded.current = true; setSession(data.session); setDrills(data.drills.length ? data.drills : [emptyDrill(0)]); } }, [data]);

  // New session → pre-fill the Author/Coach with the signed-in user's name (once),
  // so everything they build is attributed to them by default. They can still edit it.
  const authorSeeded = useRef(false);
  useEffect(() => {
    if (id || authorSeeded.current) return;
    const name = profile?.full_name || user?.email || '';
    if (name) { authorSeeded.current = true; setSession(s => s.author ? s : { ...s, author: name }); }
  }, [id, profile?.full_name, user?.email]);

  const { data: roster } = useQuery({ queryKey: ['planner-roster', effectiveClubId], queryFn: () => fetchSquadsAndPlayers(effectiveClubId!), enabled: !!effectiveClubId });
  const { data: equipmentHistory } = useQuery({ queryKey: ['equipment-history', effectiveClubId], queryFn: () => fetchEquipmentHistory(effectiveClubId!), enabled: !!effectiveClubId });
  const squads = roster?.squads ?? [];
  const allPlayers = roster?.players ?? [];
  const squadNames = useMemo(() => Object.fromEntries(squads.map(s => [s.id, s.name])), [squads]);
  // Orion: selecting individual players also derives the team label (their squads) so attendance resolves.
  const setOrionPlayers = (ids: string[]) => {
    const names = new Set<string>();
    ids.forEach(id => { const p = allPlayers.find(x => x.id === id); if (p?.squadId && squadNames[p.squadId]) names.add(squadNames[p.squadId]); });
    setSession(s => ({ ...s, playerIds: ids, team: [...names].join(', ') }));
  };

  // ── Phases ──
  const phases = session.phases.length ? session.phases : DEFAULT_PHASES;
  const setPhases = (next: string[]) => setSession(s => ({ ...s, phases: next }));
  const addPhase = () => { setPhases([...phases, `Phase ${phases.length + 1}`]); setActivePhase(phases.length); };
  const renamePhase = (i: number, name: string) => setPhases(phases.map((p, idx) => idx === i ? (name.trim() || p) : p));
  const removePhase = (i: number) => {
    if (phases.length <= 1) return;
    setPhases(phases.filter((_, idx) => idx !== i));
    setDrills(ds => ds.filter(d => d.phase !== i).map(d => d.phase > i ? { ...d, phase: d.phase - 1 } : d));
    setActivePhase(p => Math.max(0, Math.min(p, phases.length - 2)));
  };

  // ── Drills (flat list keyed by phase) ──
  const phaseDrills = useMemo(() => drills.map((d, gi) => ({ d, gi })).filter(x => x.d.phase === activePhase), [drills, activePhase]);
  const addDrill = () => setDrills(ds => [...ds, emptyDrill(activePhase)]);
  const updateDrill = (gi: number, d: PlannerDrill) => setDrills(ds => ds.map((x, i) => i === gi ? d : x));
  const removeDrill = (gi: number) => { setDrills(ds => ds.filter((_, i) => i !== gi)); showToast('Drill removed from the session.', 'info'); };
  // Reorder a drill up/down within its phase (swaps it with its neighbour in the same phase).
  const moveDrillInPhase = (localIdx: number, dir: -1 | 1) => {
    const list = drills.map((d, gi) => ({ d, gi })).filter(x => x.d.phase === activePhase);
    const target = localIdx + dir;
    if (target < 0 || target >= list.length) return;
    const giA = list[localIdx].gi, giB = list[target].gi;
    setDrills(ds => { const next = [...ds]; [next[giA], next[giB]] = [next[giB], next[giA]]; return next; });
  };

  // ── Player checklist ──
  const teamPlayers = useMemo(() => {
    const sq = squads.find(s => s.name === session.team || s.id === session.team);
    return sq ? allPlayers.filter(p => p.squadId === sq.id) : [];
  }, [squads, allPlayers, session.team]);
  const togglePlayer = (pid: string) => setSession(s => ({ ...s, playerIds: s.playerIds.includes(pid) ? s.playerIds.filter(x => x !== pid) : [...s.playerIds, pid] }));

  // ── Save ──
  const buildThumbs = (list: PlannerDrill[]) => list.map(d => ({ ...d, image: (d.objects.length || d.drawings.length) ? renderDrillThumbnail(d, 320) : d.image }));
  const save = useMutation({
    mutationFn: (opts?: { asTemplate?: boolean }) => saveSession(effectiveClubId!, user?.id ?? null, session, buildThumbs(drills), { ...opts, creatorName: profile?.full_name || user?.email || null }),
    onSuccess: (newId, opts) => {
      queryClient.invalidateQueries({ queryKey: ['lib-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['lib-drills'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      showToast(opts?.asTemplate ? 'Saved as template.' : 'Session saved.', 'success');
      if (!opts?.asTemplate) navigate('/library');
    },
    onError: (e) => showError(e),
  });
  const onSave = (asTemplate = false) => { if (!session.title.trim()) return showToast('Session title is required.', 'error'); save.mutate({ asTemplate }); };

  // ── Save a single drill to the library (works standalone — a coach may build just one drill).
  // Stores the returned row id back on the drill so re-saving updates it, and saving the whole
  // session later reuses the same row (reconciled by id) → never a duplicate in the Library.
  const saveDrillToLib = async (gi: number) => {
    const d = drills[gi];
    if (!effectiveClubId) return;
    if (!d.objects.length && !d.drawings.length && !d.animationId && !d.videoUrl && !d.title.trim()) return showToast('Add something to the drill first.', 'error');
    try {
      const image = (d.objects.length || d.drawings.length) ? renderDrillThumbnail(d, 320) : d.image;
      const wasSaved = !!d.id;
      const newId = await saveDrillToLibrary(effectiveClubId, user?.id ?? null, { ...d, image }, { creatorName: profile?.full_name || user?.email || null });
      setDrills(ds => ds.map((x, i) => i === gi ? { ...x, id: newId, image } : x));
      setSavedLib(s => new Set(s).add(newId));
      queryClient.invalidateQueries({ queryKey: ['lib-drills'] });
      showToast(wasSaved ? 'Drill updated in your library.' : 'Drill saved to your library.', 'success');
    } catch (e) { showError(e); }
  };

  // ── Load from library. Sessions/templates load as a NEW draft (ids stripped → never overwrite
  // the original; a fresh Save creates a new session). A single drill is appended to the active phase.
  const loadSession = async (sid: string) => {
    try {
      const { session: s, drills: ds } = await fetchSessionForEdit(sid);
      seeded.current = true; // don't let the route-load effect clobber what we just loaded
      setSession({ ...s, id: undefined, isTemplate: false });
      setDrills((ds.length ? ds : [emptyDrill(0)]).map(d => ({ ...d, id: undefined })));
      setActivePhase(0); setLoadOpen(false);
      showToast(s.isTemplate ? 'Template loaded — add your session details, then Save.' : 'Session loaded as a new draft — Save to keep a copy.', 'success');
    } catch (e) { showError(e); }
  };
  const loadDrill = async (did: string) => {
    try {
      const d = await fetchDrillById(did); // id already stripped → loads as a copy
      setDrills(ds => [...ds, { ...d, phase: activePhase }]);
      setLoadOpen(false);
      showToast(`Drill added to ${phases[activePhase]}.`, 'success');
    } catch (e) { showError(e); }
  };
  const onShare = async () => {
    if (!id) return showToast('Save the session first, then share it.', 'info');
    try { await copySessionShareLink(id, null); showToast('Share link copied — opens a public page (PDF + animated drills play there).', 'success'); }
    catch (e) { showError(e); }
  };

  if (!canEdit) return <div className="py-20 text-center text-slate-400">You don't have permission to plan sessions.</div>;
  if (id && isLoading) return <PageSkeleton variant="builder" />;

  // Compact summary shown on the collapsed Session Details bar.
  const dur = session.duration ? (/[a-z]/i.test(String(session.duration)) ? String(session.duration) : `${session.duration} min`) : '';
  const detailsSummary = [session.team, dur, session.venue, session.playerIds.length ? `${session.playerIds.length} players` : '']
    .filter(Boolean).join('  ·  ') || 'Date, venue, players, equipment, purpose…';

  return (
    <div className="pb-12">
      <Link to="/library" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand mb-4 no-underline"><ArrowLeft size={15} /> Back to Library</Link>

      <header className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h1 data-tour="planner-main" className="text-2xl font-bold text-slate-900 dark:text-white">{id ? 'Edit Session' : 'Plan a Session'}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" onClick={() => setLoadOpen(true)}><FolderOpen size={15} /> Load</Button>
          <Button variant="secondary" onClick={() => onSave(true)} disabled={save.isPending}><Copy size={15} /> Save as Template</Button>
          <Button variant="secondary" onClick={onShare}><Share2 size={15} /> Share</Button>
          <Button variant="primary" onClick={() => onSave(false)} disabled={save.isPending}><Save size={16} /> {save.isPending ? 'Saving…' : 'Save Session'}</Button>
        </div>
      </header>

      {/* ── Session card — leads with the title, then the collapsible details ── */}
      <div className={card + ' shadow-sm mb-5'}>
        {/* Session title — the primary field, always visible at the top of the card */}
        <div className="p-3">
          <input
            className="w-full rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg px-3 py-2 text-base font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
            value={session.title} onChange={e => setSession(s => ({ ...s, title: e.target.value }))} placeholder="Session Title — e.g. Tactical Build-up Play" />
        </div>
        <button onClick={() => setDetailsOpen(o => !o)} className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left border-t border-slate-100 dark:border-sentinel-border">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 shrink-0"><ClipboardList size={16} className="text-brand" /> Session Details</span>
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-slate-400 truncate hidden sm:inline">{detailsSummary}</span>
            {detailsOpen ? <ChevronUp size={16} className="text-slate-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
          </span>
        </button>
        {detailsOpen && (
          <div className="px-5 pb-5 pt-4 space-y-4 border-t border-slate-100 dark:border-sentinel-border">
            {/* Row 1 — timing & basics (compact inline time/duration let these share one row) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <div><label className={LABEL}>Date</label><DatePicker value={session.date} onChange={e => setSession(s => ({ ...s, date: e.target.value }))} /></div>
              <div><label className={LABEL}>Start Time</label><TimePicker value={session.startTime} onChange={v => setSession(s => ({ ...s, startTime: v }))} /></div>
              <div><label className={LABEL}>Duration</label><DurationPicker value={session.duration} onChange={v => setSession(s => ({ ...s, duration: v }))} /></div>
              <div><label className={LABEL}>No. of Players</label><input type="number" className={INPUT} value={session.playersCount} onChange={e => setSession(s => ({ ...s, playersCount: e.target.value }))} placeholder="22" /></div>
              <div><label className={LABEL}>Venue</label><input className={INPUT} value={session.venue} onChange={e => setSession(s => ({ ...s, venue: e.target.value }))} placeholder="Tuks Stadium" /></div>
            </div>

            {/* Orion: individual players across squads (no team dropdown) */}
            {isPrivate && (
              <div>
                <label className={LABEL}>Players for this session</label>
                <PlayerMultiSelect players={allPlayers} squadNames={squadNames} value={session.playerIds} onChange={setOrionPlayers} placeholder="Search players across squads…" />
              </div>
            )}

            {/* Row 2 — team, coach, ability */}
            <div className={cn('grid grid-cols-1 gap-4', isPrivate ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
              {!isPrivate && (
                <div><label className={LABEL}>Team / Group</label>
                  <Select value={session.team} onChange={e => {
                    // Clubs: picking a team marks the WHOLE squad present by default — the coach then
                    // unchecks anyone absent/injured. (Orion does individual practice via the search above.)
                    const team = e.target.value;
                    const sq = squads.find(x => x.name === team || x.id === team);
                    setSession(s => ({ ...s, team, playerIds: sq ? allPlayers.filter(p => p.squadId === sq.id).map(p => p.id) : [] }));
                  }}>
                    <option value="">Select team…</option>
                    {squads.map(sq => <option key={sq.id} value={sq.name}>{sq.name}{sq.ageGroup ? ` · ${sq.ageGroup}` : ''}</option>)}
                  </Select>
                </div>
              )}
              <div><label className={LABEL}>Author / Coach</label><input className={INPUT} value={session.author} onChange={e => setSession(s => ({ ...s, author: e.target.value }))} placeholder="e.g. Coach Ndlovu" /></div>
              <div><label className={LABEL}>Ability / Level</label>
                <Select value={session.abilityLevel} onChange={e => setSession(s => ({ ...s, abilityLevel: e.target.value }))}>
                  <option value="">Select level…</option>
                  {ABILITY_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                  {/* Preserve a legacy free-text value so old sessions still show + keep it. */}
                  {session.abilityLevel && !ABILITY_LEVELS.includes(session.abilityLevel) && <option value={session.abilityLevel}>{session.abilityLevel}</option>}
                </Select>
              </div>
            </div>

            {/* Row 3 — objectives + equipment (equipment is a compact tag-input now) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div><label className={LABEL}>Purpose / Objectives</label><input className={INPUT} value={session.purpose} onChange={e => setSession(s => ({ ...s, purpose: e.target.value }))} placeholder="Improve transition from defence to attack" /></div>
              <div><label className={LABEL}>Equipment Needed</label><EquipmentField value={session.equipment} onChange={v => setSession(s => ({ ...s, equipment: v }))} history={equipmentHistory} /></div>
            </div>

            {/* Attendance — the squad register (clubs only, once a team is picked) */}
            {!isPrivate && session.team && (
              <div className="pt-4 border-t border-slate-100 dark:border-sentinel-border">
                <div className="flex items-center justify-between mb-2">
                  <label className={LABEL + ' mb-0'}>Attendance — Select Players</label>
                  <span className="text-xs text-slate-400">{session.playerIds.length} of {teamPlayers.length} selected</span>
                </div>
                {teamPlayers.length === 0 ? <p className="text-sm text-slate-400">No players in this team yet.</p> : (
                  <div className="flex items-center gap-2 mb-2">
                    <button onClick={() => setSession(s => ({ ...s, playerIds: teamPlayers.map(p => p.id) }))} className="text-xs text-brand hover:underline">Select all</button>
                    <span className="text-slate-300">·</span>
                    <button onClick={() => setSession(s => ({ ...s, playerIds: [] }))} className="text-xs text-slate-400 hover:underline">Clear</button>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-72 overflow-y-auto">
                  {teamPlayers.map(p => {
                    const on = session.playerIds.includes(p.id);
                    const cfg = statusCfg(p.status);
                    const flagged = p.status && p.status !== 'active'; // injured/sick/suspended/unavailable/trialist
                    return (
                      <button key={p.id} onClick={() => togglePlayer(p.id)}
                        title={!cfg.available ? `${p.name} — ${cfg.label}` : undefined}
                        className={'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-left transition-colors ' + (on ? 'border-brand bg-brand/10 text-slate-900 dark:text-white' : 'border-slate-200 dark:border-sentinel-border text-slate-600 dark:text-slate-300 hover:border-brand/50')}>
                        <span className={'w-4 h-4 rounded border flex items-center justify-center shrink-0 ' + (on ? 'bg-brand border-brand text-[#0D1B2A]' : 'border-slate-300 dark:border-slate-500')}>{on && <Check size={12} />}</span>
                        <span className={cn('truncate', !cfg.available && 'text-slate-400 dark:text-slate-500')}>{p.jerseyNumber ? `#${p.jerseyNumber} ` : ''}{p.name}</span>
                        {flagged
                          ? <span className={cn('ml-auto shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border leading-none', cfg.pill)}>{cfg.label}</span>
                          : p.position && <span className="ml-auto text-[10px] text-slate-400 shrink-0">{p.position}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Phases + drills grouped in one container so the phase tabs read as its header ── */}
      <div className={card + ' shadow-sm p-4 mb-5'}>
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {phases.map((ph, i) => (
          <div key={i} className={'group inline-flex items-center gap-1 rounded-lg px-1 ' + (activePhase === i ? 'bg-brand/15' : 'bg-slate-100 dark:bg-white/5')}>
            {editingPhase === i ? (
              <input autoFocus defaultValue={ph} onBlur={e => { renamePhase(i, e.target.value); setEditingPhase(null); }}
                onKeyDown={e => { if (e.key === 'Enter') { renamePhase(i, (e.target as HTMLInputElement).value); setEditingPhase(null); } }}
                className="bg-transparent text-sm font-medium px-2 py-1.5 w-28 outline-none text-slate-900 dark:text-white" />
            ) : (
              <button onClick={() => setActivePhase(i)} className={'text-sm font-medium px-2.5 py-1.5 ' + (activePhase === i ? 'text-brand' : 'text-slate-600 dark:text-slate-300')}>
                {ph} <span className="text-[10px] opacity-60">({drills.filter(d => d.phase === i).length})</span>
              </button>
            )}
            {activePhase === i && editingPhase !== i && (
              <span className="flex items-center">
                <button onClick={() => setEditingPhase(i)} title="Rename" className="p-1 text-slate-400 hover:text-brand"><Pencil size={12} /></button>
                {phases.length > 1 && <button onClick={() => removePhase(i)} title="Remove phase" className="p-1 text-slate-400 hover:text-rose-500"><X size={12} /></button>}
              </span>
            )}
          </div>
        ))}
        <button onClick={addPhase} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 dark:border-sentinel-border px-2.5 py-1.5 text-sm text-slate-500 hover:border-brand hover:text-brand"><Plus size={14} /> Phase</button>
      </div>

      <div className="space-y-5">
        {phaseDrills.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 dark:border-sentinel-border py-10 text-center text-slate-400 text-sm">No drills in this phase yet.</div>}
        {phaseDrills.map(({ d, gi }, localIdx) => (
          <DrillBlock key={gi} drill={d} index={localIdx} onChange={nd => updateDrill(gi, nd)} onRemove={() => removeDrill(gi)} canRemove={drills.length > 1}
            onSaveToLibrary={() => saveDrillToLib(gi)} savedToLibrary={!!d.id && savedLib.has(d.id)}
            onMoveUp={() => moveDrillInPhase(localIdx, -1)} onMoveDown={() => moveDrillInPhase(localIdx, 1)}
            canMoveUp={localIdx > 0} canMoveDown={localIdx < phaseDrills.length - 1} />
        ))}
      </div>

      <button onClick={addDrill} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-sentinel-border px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-brand"><Plus size={15} /> Add Drill to {phases[activePhase]}</button>
      </div>

      {loadOpen && effectiveClubId && (
        <LoadFromLibraryModal clubId={effectiveClubId} onClose={() => setLoadOpen(false)} onPickSession={loadSession} onPickDrill={loadDrill} />
      )}
    </div>
  );
};
