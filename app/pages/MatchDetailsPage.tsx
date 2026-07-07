import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Save, X, Star, ClipboardList, ClipboardCheck, Share2, FileText, ChevronUp, ChevronDown, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useMatch, useMatchPlayerStats } from '../hooks/useMatches';
import { useMatchPlans } from '../hooks/useMatchPlans';
import { useSquads, usePlayers } from '../hooks/useSquads';
import { usePermissions } from '../hooks/usePermissions';
import { useAppState } from '../context/AppStateContext';
import { useToast } from '../context/ToastContext';
import { resultOutcome, updateMatch, copyMatchShareLink } from '../services/matchService';
import { saveMatchPlayerStats, type SavedPlayerStat } from '../services/matchStatsService';
import { positionOrder } from '../services/attendanceService';
import { MATCH_STATS } from '../components/matches/MatchStatsModal';
import { MatchVideos } from '../components/matches/MatchVideos';
import { MatchMedia } from '../components/matches/MatchMedia';
import { MatchPlayerAssessmentModal } from '../components/matches/MatchPlayerAssessmentModal';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { DatePicker } from '../components/ui/DatePicker';
import { TimePicker } from '../components/ui/TimePicker';
import { PillTabs } from '../components/ui/PillTabs';

/** Match details — tabbed (Details / Lineup / Stats / Report / Analysis / Media) with a SINGLE
 *  top Edit → Save/Cancel governing every form tab (no per-section edit buttons). Lineup is
 *  colour-coded + auto-sorted (active to the top); Stats is a sleek, position-aware grid
 *  (GK clean-sheet+saves, defenders goals/assists/CS, mid/fwd goals/assists) with a quick
 *  rating + a full per-player assessment that lands on the player's profile. */
const OUT: Record<string, string> = { W: 'bg-emerald-500/15 text-emerald-500', D: 'bg-slate-500/15 text-slate-400', L: 'bg-rose-500/15 text-rose-500' };
const POS_GROUPS = [{ key: 0, label: 'Goalkeepers', icon: 'fa-hand-paper', sub: 'Saves, Assists & Clean Sheet' }, { key: 1, label: 'Defenders', icon: 'fa-shield-halved', sub: 'Goals, Assists & Clean Sheet' }, { key: 2, label: 'Midfielders', icon: 'fa-arrows-left-right', sub: 'Goals & Assists' }, { key: 3, label: 'Forwards', icon: 'fa-bullseye', sub: 'Goals & Assists' }, { key: 99, label: 'Other', icon: 'fa-user', sub: 'Goals & Assists' }];
// Quick "Add Event" types (with small icons, like the old version) + which positions they apply to.
const EVENT_TYPES: { id: string; label: string; apply: (grp: number) => boolean; note: string }[] = [
  { id: 'goal', label: '⚽ Goal', apply: g => g !== 0, note: 'Goals are recorded for outfield players.' },
  { id: 'assist', label: '🅰️ Assist', apply: () => true, note: '' },
  { id: 'save', label: '🧤 Save (GK)', apply: g => g === 0, note: 'Saves only apply to goalkeepers.' },
  { id: 'cleanSheet', label: '🛡️ Team Clean Sheet', apply: g => g <= 1, note: 'Clean sheets apply to goalkeepers & defenders.' },
  { id: 'yellow', label: '🟨 Yellow Card', apply: () => true, note: '' },
  { id: 'red', label: '🟥 Red Card', apply: () => true, note: '' },
];
const STATUS_OPTS = [['started', 'Started'], ['sub', 'Substitute'], ['unavailable', 'Unavailable'], ['notsquad', 'Not in Squad']] as const;
const STATUS_ROW: Record<string, string> = { started: 'bg-emerald-50 dark:bg-emerald-500/10', sub: 'bg-amber-50 dark:bg-amber-500/10', unavailable: 'bg-rose-50/60 dark:bg-rose-500/5', notsquad: '' };
const STATUS_BADGE: Record<string, string> = { started: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', sub: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', unavailable: 'bg-rose-500/15 text-rose-500', notsquad: 'bg-slate-500/10 text-slate-400' };
const STATUS_LABEL: Record<string, string> = { started: 'Started', sub: 'Sub', unavailable: 'Unavailable', notsquad: 'Not in Squad' };
const STATUS_DOT: Record<string, string> = { started: 'bg-emerald-500', sub: 'bg-amber-500', unavailable: 'bg-rose-500', notsquad: 'bg-slate-300' };
const FORMATS = ['11-a-side', '9-a-side', '8-a-side', '7-a-side', '6-a-side', '5-a-side'];
type PStat = { status: 'started' | 'sub' | 'unavailable' | 'notsquad'; minutes: string; goals: string; assists: string; cs: boolean; saves: string; rating: string; caution: 'none' | 'yellow' | 'red'; motm: boolean; notes: string };
const blankStat = (): PStat => ({ status: 'notsquad', minutes: '', goals: '', assists: '', cs: false, saves: '', rating: '', caution: 'none', motm: false, notes: '' });

// Coloured, titled report sections (inspired by the old version's tactical-analysis layout).
const SECT: Record<string, { title: string; dot: string; border: string; soft: string }> = {
  brand: { title: 'text-brand', dot: 'bg-brand', border: 'border-brand/30', soft: 'bg-brand/5' },
  emerald: { title: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', border: 'border-emerald-500/30', soft: 'bg-emerald-500/5' },
  rose: { title: 'text-rose-600 dark:text-rose-400', dot: 'bg-rose-500', border: 'border-rose-500/30', soft: 'bg-rose-500/5' },
  amber: { title: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500', border: 'border-amber-500/30', soft: 'bg-amber-500/5' },
  sky: { title: 'text-sky-600 dark:text-sky-400', dot: 'bg-sky-500', border: 'border-sky-500/30', soft: 'bg-sky-500/5' },
};
const REPORT_FIELDS: { key: string; label: string; icon: string; color: keyof typeof SECT; full?: boolean }[] = [
  { key: 'reportGeneral', label: 'General Comments', icon: 'fa-comment-dots', color: 'brand', full: true },
  { key: 'reportAttacking', label: 'Attacking / In Possession', icon: 'fa-bolt', color: 'emerald' },
  { key: 'reportDefending', label: 'Defending / Out of Possession', icon: 'fa-shield-halved', color: 'rose' },
  { key: 'reportIndividual', label: 'Individual & Transitions', icon: 'fa-arrows-rotate', color: 'amber' },
  { key: 'reportImprovements', label: 'Areas to Improve', icon: 'fa-arrow-trend-up', color: 'sky' },
];

type Tab = 'details' | 'lineup' | 'stats' | 'report' | 'analysis' | 'media';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'details', label: 'Details', icon: 'fa-circle-info' }, { id: 'lineup', label: 'Lineup', icon: 'fa-users' },
  { id: 'stats', label: 'Stats', icon: 'fa-chart-bar' }, { id: 'report', label: 'Report', icon: 'fa-file-lines' },
  { id: 'analysis', label: 'Analysis', icon: 'fa-video' }, { id: 'media', label: 'Media', icon: 'fa-image' },
];

// Compact, sleek field styles for the dense grids.
const cellNum = 'w-12 text-center rounded-md border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-bg px-1 py-1 text-sm tabular-nums outline-none focus:border-brand';
const fieldCls = 'w-full rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand';

export const MatchDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { canEdit } = usePermissions();
  const { effectiveClubId } = useAppState();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const { data: match, isLoading } = useMatch(id);
  const { data: squads } = useSquads();
  const { data: allPlayers } = usePlayers();
  const { data: playerStats } = useMatchPlayerStats(id);
  const { data: plans } = useMatchPlans();

  const [tab, setTab] = useState<Tab>('details');
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [assessPlayer, setAssessPlayer] = useState<{ id: string; name: string } | null>(null);
  const [evtPlayer, setEvtPlayer] = useState('');
  const [evtType, setEvtType] = useState('goal');
  const [selIds, setSelIds] = useState<Set<string>>(new Set());

  const squadPlayers = useMemo(() => (allPlayers || []).filter(p => !match?.squadId || p.squadId === match?.squadId), [allPlayers, match?.squadId]);
  const linkedPlan = useMemo(() => (plans || []).find(p => p.matchId === id) || null, [plans, id]);

  // ── Editable local state (one Save persists all of it) ──
  const [df, setDf] = useState({ date: '', time: '', venue: '', competition: '', matchFormat: '11-a-side', ourSide: 'home', status: 'fixture', homeScore: '', awayScore: '', notes: '' });
  const [ts, setTs] = useState<{ home: Record<string, string>; away: Record<string, string> }>({ home: {}, away: {} });
  const [rf, setRf] = useState({ reportTitle: '', reportGeneral: '', reportAttacking: '', reportDefending: '', reportIndividual: '', reportImprovements: '' });
  const [formation, setFormation] = useState('');
  const [stat, setStat] = useState<Record<string, PStat>>({});

  const reseed = useCallback(() => {
    if (!match) return;
    setDf({ date: match.date || '', time: match.time || '', venue: match.venue || '', competition: match.competition || '', matchFormat: match.matchFormat || '11-a-side', ourSide: match.ourSide || 'home', status: match.status || (match.isPast ? 'result' : 'fixture'), homeScore: match.homeScore?.toString() ?? '', awayScore: match.awayScore?.toString() ?? '', notes: match.notes || '' });
    const toStr = (o: any) => Object.fromEntries(MATCH_STATS.map(s => [s.key, (o?.[s.key] ?? '').toString()]));
    setTs({ home: toStr(match.stats?.home), away: toStr(match.stats?.away) });
    setRf({ reportTitle: match.reportTitle || '', reportGeneral: match.reportGeneral || '', reportAttacking: match.reportAttacking || '', reportDefending: match.reportDefending || '', reportIndividual: match.reportIndividual || '', reportImprovements: match.reportImprovements || '' });
    setFormation(match.formation || linkedPlan?.data?.squad?.formation || '');
    const map: Record<string, PStat> = {};
    squadPlayers.forEach(p => { map[p.id] = blankStat(); });
    if (playerStats && playerStats.length) {
      playerStats.forEach((s: SavedPlayerStat) => { map[s.playerId] = { status: s.appeared ? (s.started ? 'started' : 'sub') : 'notsquad', minutes: s.minutesPlayed ? String(s.minutesPlayed) : '', goals: s.goals ? String(s.goals) : '', assists: s.assists ? String(s.assists) : '', cs: s.cleanSheet, saves: s.saves ? String(s.saves) : '', rating: s.rating ? String(s.rating) : '', caution: s.red ? 'red' : s.yellow ? 'yellow' : 'none', motm: s.motm, notes: s.notes || '' }; });
    } else if (linkedPlan?.data?.squad) {
      (linkedPlan.data.squad.startingXI || []).forEach((slot: any) => { if (slot.playerId && map[slot.playerId]) { map[slot.playerId].status = 'started'; map[slot.playerId].minutes = '90'; } });
      (linkedPlan.data.squad.subs || []).forEach((pid: string) => { if (map[pid]) map[pid].status = 'sub'; });
    }
    setStat(map);
  }, [match, playerStats, linkedPlan, squadPlayers]);

  const seeded = useRef(false);
  useEffect(() => { if (!seeded.current && match && squadPlayers.length && playerStats !== undefined) { seeded.current = true; reseed(); } }, [match, squadPlayers, playerStats, reseed]);

  const setP = (pid: string, patch: Partial<PStat>) => setStat(prev => ({ ...prev, [pid]: { ...(prev[pid] || blankStat()), ...patch } }));
  const setMotm = (pid: string) => setStat(prev => { const next: Record<string, PStat> = {}; Object.entries(prev).forEach(([k, v]) => next[k] = { ...v, motm: k === pid }); return next; });
  const bump = (v: string, by = 1) => String(Math.max(0, (parseInt(v, 10) || 0) + by));

  // Quick "Add Event" — applies the picked event to the picked player (or the back line for a
  // team clean sheet), validating that the event makes sense for that player's position.
  const addEvent = () => {
    const evt = EVENT_TYPES.find(e => e.id === evtType); if (!evt) return;
    if (evt.id === 'cleanSheet') {
      const backline = activePlayers.filter(p => positionOrder(p.position) <= 1);
      if (!backline.length) { showToast('No goalkeepers or defenders in the lineup.', 'error'); return; }
      setStat(prev => { const next = { ...prev }; backline.forEach(p => next[p.id] = { ...(next[p.id] || blankStat()), cs: true }); return next; });
      showToast('Team clean sheet recorded.', 'success'); return;
    }
    const p = squadPlayers.find(x => x.id === evtPlayer);
    if (!p) { showToast('Pick a player first.', 'error'); return; }
    const grp = positionOrder(p.position);
    if (!evt.apply(grp)) { showToast(evt.note || 'That event doesn’t apply to this player.', 'error'); return; }
    const s = stat[p.id] || blankStat();
    if (evt.id === 'goal') setP(p.id, { goals: bump(s.goals) });
    else if (evt.id === 'assist') setP(p.id, { assists: bump(s.assists) });
    else if (evt.id === 'save') setP(p.id, { saves: bump(s.saves) });
    else if (evt.id === 'yellow') setP(p.id, { caution: 'yellow' });
    else if (evt.id === 'red') setP(p.id, { caution: 'red' });
    showToast(`${evt.label.replace(/^\S+\s/, '')} added for ${p.name}.`, 'success');
  };

  const save = useMutation({
    mutationFn: async () => {
      const isResult = df.status === 'result';
      await updateMatch(id!, {
        date: df.date || null, time: df.time || null, venue: df.venue, competition: df.competition, matchFormat: df.matchFormat,
        ourSide: df.ourSide, status: df.status, isPast: isResult,
        homeScore: isResult && df.homeScore !== '' ? Number(df.homeScore) : null, awayScore: isResult && df.awayScore !== '' ? Number(df.awayScore) : null,
        notes: df.notes, formation,
        stats: { home: Object.fromEntries(MATCH_STATS.map(s => [s.key, Number(ts.home[s.key]) || 0])), away: Object.fromEntries(MATCH_STATS.map(s => [s.key, Number(ts.away[s.key]) || 0])) },
        reportTitle: rf.reportTitle, reportGeneral: rf.reportGeneral, reportAttacking: rf.reportAttacking, reportDefending: rf.reportDefending, reportIndividual: rf.reportIndividual, reportImprovements: rf.reportImprovements, reportVisibility: 'squad',
      });
      await saveMatchPlayerStats(effectiveClubId!, id!, squadPlayers.map(p => { const s = stat[p.id] || blankStat(); const appeared = s.status === 'started' || s.status === 'sub'; return { playerId: p.id, appeared, started: s.status === 'started', minutes: s.minutes, goals: s.goals, assists: s.assists, rating: s.rating, motm: s.motm, yellow: s.caution === 'yellow' ? '1' : '', red: s.caution === 'red' ? '1' : '', cleanSheet: s.cs, saves: s.saves, notes: s.notes }; }));
    },
    onSuccess: () => {
      ['match', 'match-stats', 'playerMatchStats', 'matches'].forEach(k => queryClient.invalidateQueries({ queryKey: k === 'match' || k === 'match-stats' ? [k, id] : [k] }));
      showToast('Match saved.', 'success'); setEditing(false);
    },
    onError: (e) => showError(e),
  });

  const handleShare = async () => { if (!id) return; setSharing(true); try { await copyMatchShareLink(id, match?.shareToken || null); showToast('Share link copied — anyone with it can view this match report.', 'success'); } catch (e) { showError(e); } finally { setSharing(false); } };
  const cancelEdit = () => { reseed(); setEditing(false); };

  // Starters are capped at the match size (parsed from the format, e.g. "11-a-side" → 11; "7-a-side" → 7).
  const maxStarters = (() => { const n = parseInt(df.matchFormat || '', 10); return n >= 3 && n <= 11 ? n : 11; })();
  const startersOf = (s: Record<string, PStat>, exclude?: string) => Object.entries(s).filter(([k, v]) => k !== exclude && v.status === 'started').length;
  const minutesFor = (status: PStat['status'], existing: string) => status === 'started' ? (existing || '90') : status === 'sub' ? existing : '';

  // Set one player's status, enforcing the starter cap.
  const setStatus = (pid: string, status: PStat['status']) => {
    if (status === 'started' && startersOf(stat, pid) >= maxStarters) { showToast(`Only ${maxStarters} players can start — set one to Sub first.`, 'error'); return; }
    setP(pid, { status, minutes: minutesFor(status, stat[pid]?.minutes || '') });
  };
  // Bulk-apply a status to every checked player (respecting the starter cap for "Started").
  const bulkSet = (status: PStat['status']) => {
    const ids = [...selIds]; if (!ids.length) return;
    setStat(prev => {
      const next = { ...prev }; let slots = maxStarters - startersOf(prev, undefined);
      // free up slots taken by selected players already starting (they'll be reassigned)
      ids.forEach(id => { if (prev[id]?.status === 'started') slots++; });
      let skipped = 0;
      ids.forEach(id => {
        if (status === 'started') { if (slots > 0) { next[id] = { ...(next[id] || blankStat()), status: 'started', minutes: next[id]?.minutes || '90' }; slots--; } else skipped++; }
        else next[id] = { ...(next[id] || blankStat()), status, minutes: minutesFor(status, next[id]?.minutes || '') };
      });
      if (skipped) showToast(`Set ${ids.length - skipped} to start; ${skipped} skipped (max ${maxStarters}).`, 'error');
      else showToast(`${ids.length} player${ids.length > 1 ? 's' : ''} updated.`, 'success');
      return next;
    });
    setSelIds(new Set());
  };
  const toggleSel = (pid: string) => setSelIds(prev => { const n = new Set(prev); n.has(pid) ? n.delete(pid) : n.add(pid); return n; });
  const toggleSelAll = () => setSelIds(prev => prev.size === squadPlayers.length ? new Set() : new Set(squadPlayers.map(p => p.id)));

  const pullFromPlan = () => { if (!linkedPlan?.data?.squad) return; const next = { ...stat }; squadPlayers.forEach(p => next[p.id] = { ...(next[p.id] || blankStat()), status: 'notsquad', minutes: '' }); (linkedPlan.data.squad.startingXI || []).forEach((slot: any) => { if (slot.playerId && next[slot.playerId]) next[slot.playerId] = { ...next[slot.playerId], status: 'started', minutes: '90' }; }); (linkedPlan.data.squad.subs || []).forEach((pid: string) => { if (next[pid]) next[pid] = { ...next[pid], status: 'sub' }; }); if (linkedPlan.data.squad.formation) setFormation(linkedPlan.data.squad.formation); setStat(next); showToast('Pulled lineup from the match plan.', 'success'); };

  // Players ordered: active (started → sub) first by position, then inactive (unavailable → notsquad) by position.
  // (useMemo must run before any early return to satisfy the rules of hooks.)
  const orderRank = (s: PStat) => ({ started: 0, sub: 1, unavailable: 2, notsquad: 3 }[s.status]);
  const sortedPlayers = useMemo(() => [...squadPlayers].sort((a, b) => {
    const sa = stat[a.id] || blankStat(), sb = stat[b.id] || blankStat();
    const activeA = orderRank(sa) < 2 ? 0 : 1, activeB = orderRank(sb) < 2 ? 0 : 1;
    if (activeA !== activeB) return activeA - activeB;
    return (positionOrder(a.position) - positionOrder(b.position)) || (orderRank(sa) - orderRank(sb)) || a.name.localeCompare(b.name);
  }), [squadPlayers, stat]);
  const activePlayers = sortedPlayers.filter(p => { const s = stat[p.id]; return s && (s.status === 'started' || s.status === 'sub'); });

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (!match) return <div className="py-20 text-center text-slate-400">Match not found. <Link to="/matches" className="text-brand">Back to Matches</Link></div>;

  const squadName = squads?.find(s => s.id === match.squadId)?.name || 'Our Team';
  const ourHome = (editing ? df.ourSide : match.ourSide) !== 'away';
  const homeName = ourHome ? squadName : (match.opponent || 'Opponent');
  const awayName = ourHome ? (match.opponent || 'Opponent') : squadName;
  const outcome = resultOutcome(match);
  const isResult = match.isPast && match.homeScore != null;
  const card = 'rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface';

  const groupRows = (players: typeof squadPlayers) => POS_GROUPS.map(g => ({ ...g, players: players.filter(p => { const o = positionOrder(p.position); return g.key === 99 ? o > 3 : o === g.key; }) })).filter(g => g.players.length);

  return (
    <div>
      {/* Sticky header — Back · scoreboard title · single Edit/Save/Cancel (always reachable on scroll) */}
      <div className="sticky top-0 z-20 -mx-4 lg:-mx-6 -mt-5 px-4 lg:px-6 pt-4 pb-3 mb-5 bg-slate-50/95 dark:bg-sentinel-bg/95 backdrop-blur-sm border-b border-slate-200/70 dark:border-sentinel-border/70">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <Link to="/matches" title="Back to Matches" className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:text-brand hover:bg-slate-200/60 dark:hover:bg-white/5 no-underline shrink-0"><ArrowLeft size={17} /></Link>

          {/* Compact scoreboard title */}
          <div className="flex-1 min-w-[180px] rounded-xl bg-[#0D1B2A] text-white px-4 py-2.5 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0 flex items-center justify-center gap-2.5 sm:gap-4">
              <span className={'flex-1 text-right text-sm sm:text-base font-bold truncate ' + (ourHome ? 'text-brand' : '')}>{homeName}</span>
              {isResult ? <span className="shrink-0 text-xl sm:text-2xl font-extrabold tabular-nums bg-white/10 rounded-lg px-3 py-0.5">{match.homeScore} - {match.awayScore}</span> : <span className="shrink-0 text-[11px] font-bold tracking-wider text-white/50 bg-white/10 rounded px-2.5 py-1.5">VS</span>}
              <span className={'flex-1 text-left text-sm sm:text-base font-bold truncate ' + (!ourHome ? 'text-brand' : '')}>{awayName}</span>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-white/60 shrink-0">
              {[match.date, match.venue].filter(Boolean).join(' · ')}
              {outcome && <span className={'font-bold uppercase rounded px-1.5 py-0.5 ' + OUT[outcome]}>{outcome === 'W' ? 'Win' : outcome === 'L' ? 'Loss' : 'Draw'}</span>}
            </div>
          </div>

          {/* Actions — Share is always available (the PDF download lives inside the share link). */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Button variant="secondary" size="sm" disabled={sharing} onClick={handleShare} title="Copy a public share link"><Share2 size={15} /> <span className="hidden sm:inline">{sharing ? 'Sharing…' : 'Share'}</span></Button>
            {canEdit && (editing
              ? <><Button variant="ghost" size="sm" onClick={cancelEdit}><X size={15} /> <span className="hidden sm:inline">Cancel</span></Button><Button variant="primary" size="sm" disabled={save.isPending} onClick={() => save.mutate()}><Save size={15} /> {save.isPending ? 'Saving…' : 'Save'}</Button></>
              : <Button variant="primary" size="sm" onClick={() => setEditing(true)}><Pencil size={15} /> Edit</Button>)}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto mb-5">
        <PillTabs value={tab} onChange={id => setTab(id as typeof tab)} tabs={TABS.map(t => ({ id: t.id, label: t.label, icon: <i className={`fas ${t.icon}`} /> }))} />
      </div>

      {/* DETAILS */}
      {tab === 'details' && (
        <div className="space-y-5">
          <div className={`${card} p-5`}>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><i className="fas fa-circle-info text-brand" /> Match Info</h3>
            {editing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <L label="Date"><DatePicker value={df.date} onChange={e => setDf({ ...df, date: e.target.value })} /></L>
                <L label="Kickoff"><TimePicker value={df.time} onChange={v => setDf({ ...df, time: v })} /></L>
                <L label="Venue"><input className={fieldCls} value={df.venue} onChange={e => setDf({ ...df, venue: e.target.value })} /></L>
                <L label="Competition"><input className={fieldCls} value={df.competition} onChange={e => setDf({ ...df, competition: e.target.value })} /></L>
                <L label="Format"><Select value={df.matchFormat} onChange={e => setDf({ ...df, matchFormat: e.target.value })}>{FORMATS.map(f => <option key={f} value={f}>{f}</option>)}</Select></L>
                <L label="Our Side"><Select value={df.ourSide} onChange={e => setDf({ ...df, ourSide: e.target.value })}><option value="home">Home</option><option value="away">Away</option></Select></L>
                <L label="Status"><Select value={df.status} onChange={e => setDf({ ...df, status: e.target.value })}><option value="fixture">Fixture (upcoming)</option><option value="result">Result (played)</option></Select></L>
                {df.status === 'result' && <><L label={`${homeName} (FT)`}><input type="number" className={fieldCls} value={df.homeScore} onChange={e => setDf({ ...df, homeScore: e.target.value })} /></L><L label={`${awayName} (FT)`}><input type="number" className={fieldCls} value={df.awayScore} onChange={e => setDf({ ...df, awayScore: e.target.value })} /></L></>}
                <div className="sm:col-span-2 lg:col-span-3"><L label="Notes"><textarea className={fieldCls + ' h-20 resize-none'} value={df.notes} onChange={e => setDf({ ...df, notes: e.target.value })} /></L></div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
                  {[['Date', match.date], ['Kickoff', match.time], ['Venue', match.venue], ['Competition', match.competition], ['Format', match.matchFormat], ['Side', ourHome ? 'Home' : 'Away'], ['Team', squadName]].map(([l, v]) => (
                    <div key={l as string}><div className="text-[11px] uppercase tracking-wider text-slate-400">{l}</div><div className="font-medium text-slate-900 dark:text-white">{v || '—'}</div></div>
                  ))}
                </div>
                {match.notes && <div className="mt-4"><div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Notes</div><p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{match.notes}</p></div>}
              </>
            )}
          </div>

          <div className={`${card} p-5`}>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2"><i className="fas fa-chart-bar text-brand" /> Team Statistics</h3>
            <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2"><span>{homeName}</span><span>{awayName}</span></div>
            {MATCH_STATS.map(s => {
              const h = Number(editing ? ts.home[s.key] : (match.stats?.home?.[s.key])) || 0;
              const a = Number(editing ? ts.away[s.key] : (match.stats?.away?.[s.key])) || 0;
              const tot = h + a; const hp = tot ? (h / tot) * 100 : 50;
              return (
                <div key={s.key} className="py-1.5">
                  <div className="flex justify-between items-center text-sm mb-1">
                    {editing ? <input type="number" className={cellNum} value={ts.home[s.key] || ''} onChange={e => setTs({ ...ts, home: { ...ts.home, [s.key]: e.target.value } })} /> : <span className="font-semibold tabular-nums w-10">{h}</span>}
                    <span className="text-slate-500 text-xs">{s.label}</span>
                    {editing ? <input type="number" className={cellNum} value={ts.away[s.key] || ''} onChange={e => setTs({ ...ts, away: { ...ts.away, [s.key]: e.target.value } })} /> : <span className="font-semibold tabular-nums w-10 text-right">{a}</span>}
                  </div>
                  <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-100 dark:bg-white/5"><div className="bg-brand" style={{ width: `${hp}%` }} /><div className="bg-slate-400 dark:bg-slate-600" style={{ width: `${100 - hp}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* LINEUP */}
      {tab === 'lineup' && (
        <div className={`${card} p-5`}>
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              {linkedPlan && <span className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5"><ClipboardList size={14} className="text-brand" /> Linked to a match plan</span>}
              <span className="inline-flex items-center gap-3 text-[11px] text-slate-400"><Legend c="bg-emerald-500" t="Started" /><Legend c="bg-amber-500" t="Sub" /><Legend c="bg-slate-300" t="Not in squad" /></span>
              <span className={'text-[11px] font-bold rounded-full px-2 py-0.5 ' + (startersOf(stat) === maxStarters ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-slate-500/10 text-slate-500')}>{startersOf(stat)}/{maxStarters} starting</span>
            </div>
            {editing && <div className="flex items-center gap-2 flex-wrap">
              <Select className="w-36" value={formation} onChange={e => setFormation(e.target.value)}><option value="">No Formation</option>{['4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '3-4-3', '4-1-4-1', '5-3-2', '4-5-1'].map(f => <option key={f} value={f}>{f}</option>)}</Select>
              {linkedPlan && <Button variant="ghost" size="sm" onClick={pullFromPlan}>Pull from plan</Button>}
            </div>}
          </div>

          {/* Bulk-select bar — tick players, then set them all at once */}
          {editing && selIds.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-3 p-2.5 rounded-lg bg-brand/10 border border-brand/30">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{selIds.size} selected</span>
              <span className="text-xs text-slate-500">Set as:</span>
              <Button variant="secondary" size="sm" onClick={() => bulkSet('started')}><span className="w-2 h-2 rounded-full bg-emerald-500 mr-1" />Started</Button>
              <Button variant="secondary" size="sm" onClick={() => bulkSet('sub')}><span className="w-2 h-2 rounded-full bg-amber-500 mr-1" />Sub</Button>
              <Button variant="secondary" size="sm" onClick={() => bulkSet('unavailable')}><span className="w-2 h-2 rounded-full bg-rose-500 mr-1" />Unavailable</Button>
              <Button variant="secondary" size="sm" onClick={() => bulkSet('notsquad')}>Not in squad</Button>
              <button onClick={() => setSelIds(new Set())} className="text-xs text-slate-500 hover:text-brand ml-auto">Clear selection</button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-sentinel-border">
                {editing && <th className="w-8 pl-1"><input type="checkbox" checked={selIds.size === squadPlayers.length && squadPlayers.length > 0} onChange={toggleSelAll} className="w-4 h-4 accent-brand align-middle" title="Select all" /></th>}
                <th className="py-2 pr-2 font-semibold">Player</th><th className="px-2 font-semibold">Pos</th><th className="px-2 font-semibold w-40">Status</th><th className="px-2 font-semibold text-right w-24">Mins</th>
              </tr></thead>
              <tbody>
                {groupRows(sortedPlayers).map(g => (
                  <React.Fragment key={g.key}>
                    <tr className="bg-slate-50 dark:bg-sentinel-bg"><td colSpan={editing ? 5 : 4} className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500"><i className={`fas ${g.icon} mr-1.5 text-slate-400`} />{g.label}</td></tr>
                    {g.players.map(p => { const s = stat[p.id] || blankStat(); const active = s.status === 'started' || s.status === 'sub'; const sel = selIds.has(p.id); return (
                      <tr key={p.id} className={'border-b border-slate-100 dark:border-white/5 ' + STATUS_ROW[s.status] + (sel ? ' ring-1 ring-inset ring-brand/50' : '')}>
                        {editing && <td className="pl-1"><input type="checkbox" checked={sel} onChange={() => toggleSel(p.id)} className="w-4 h-4 accent-brand align-middle" /></td>}
                        <td className="py-2 pr-2 font-medium text-slate-900 dark:text-white whitespace-nowrap">{p.jerseyNumber ? <span className="text-brand">#{p.jerseyNumber} </span> : ''}{p.name}</td>
                        <td className="px-2 text-slate-400">{p.position || '—'}</td>
                        <td className="px-2">{editing ? <StatusPill value={s.status} onChange={v => setStatus(p.id, v)} /> : <span className={'text-[11px] font-semibold rounded-full px-2 py-0.5 ' + STATUS_BADGE[s.status]}>{STATUS_LABEL[s.status]}</span>}</td>
                        <td className="px-2 text-right">{active ? (editing ? <div className="flex justify-end"><NumField value={s.minutes} onChange={v => setP(p.id, { minutes: v })} step={5} max={120} w="w-10" /></div> : <span className="tabular-nums">{s.minutes || '—'}</span>) : <span className="text-slate-300">—</span>}</td>
                      </tr>
                    ); })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {editing && <p className="text-[11px] text-slate-400 mt-3">Tip: tick multiple players, then use the bar above to set them all to Started, Sub or Unavailable at once — max {maxStarters} can start.</p>}
        </div>
      )}

      {/* STATS */}
      {tab === 'stats' && (
        <div className={`${card} p-5`}>
          <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><i className="fas fa-chart-bar text-brand" /> Player Performance</h3>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Quick Add Event — picks a player + event, validates it fits the position, then tallies it */}
              {editing && activePlayers.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Select compact className="w-40" value={evtPlayer} onChange={e => setEvtPlayer(e.target.value)}><option value="">Select player…</option>{activePlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
                  <Select compact className="w-40" value={evtType} onChange={e => setEvtType(e.target.value)}>{EVENT_TYPES.map(ev => <option key={ev.id} value={ev.id}>{ev.label}</option>)}</Select>
                  <Button variant="primary" size="sm" onClick={addEvent}><Plus size={14} /> Add Event</Button>
                </div>
              )}
              {/* MOTM */}
              <div className="flex items-center gap-2"><Star size={14} className="text-amber-400" /><span className="text-xs text-slate-400">MOTM:</span>
                {editing ? <Select compact className="w-44" value={Object.keys(stat).find(k => stat[k]?.motm) || ''} onChange={e => setMotm(e.target.value)}><option value="">— none —</option>{activePlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
                  : <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{(() => { const id2 = Object.keys(stat).find(k => stat[k]?.motm); return id2 ? (squadPlayers.find(p => p.id === id2)?.name || '—') : '—'; })()}</span>}
              </div>
            </div>
          </div>
          {!activePlayers.length ? <div className="py-10 text-center text-slate-400 text-sm">Set the lineup first — players who played appear here for goals, assists & ratings.</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-sentinel-border">
                  <th className="py-2 pr-2 font-semibold">Player</th>
                  <th className="px-2 font-semibold">Pos</th>
                  <th className="px-2 text-center font-semibold">Goals</th>
                  <th className="px-2 text-center font-semibold">Assists</th>
                  <th className="px-2 text-center font-semibold">CS</th>
                  <th className="px-2 text-center font-semibold">Cautions</th>
                  <th className="px-2 text-center font-semibold">Rating</th>
                  <th className="px-1 text-center font-semibold">Assess</th>
                  <th className="px-2 font-semibold">Notes</th>
                </tr></thead>
                <tbody>
                  {groupRows(activePlayers).map(g => {
                    const isGK = g.key === 0, backline = g.key === 0 || g.key === 1;
                    return (
                      <React.Fragment key={g.key}>
                        <tr className="bg-slate-50 dark:bg-sentinel-bg"><td colSpan={9} className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500"><i className={`fas ${g.icon} mr-1.5 text-slate-400`} />{g.label} <span className="font-normal normal-case text-slate-400">— {g.sub}</span></td></tr>
                        {g.players.map(p => { const s = stat[p.id] || blankStat(); return (
                          <tr key={p.id} className="border-b border-slate-100 dark:border-white/5 align-top">
                            <td className="py-2 pr-2 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                              {p.jerseyNumber ? <span className="text-brand">#{p.jerseyNumber} </span> : ''}{p.name}
                              {s.status === 'sub' && <span className="text-[10px] text-slate-400 ml-1">(sub)</span>}
                              {isGK && (editing
                                ? <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500"><span className="inline-flex items-center gap-1"><i className="fas fa-hand-paper text-slate-400" /> Saves</span><NumField value={s.saves} onChange={v => setP(p.id, { saves: v })} w="w-9" /></div>
                                : (Number(s.saves) > 0 && <div className="mt-0.5 text-[11px] text-slate-500"><i className="fas fa-hand-paper mr-1 text-slate-400" />{s.saves} saves</div>))}
                            </td>
                            <td className="px-2 text-slate-400 text-xs whitespace-nowrap">{p.position || '—'}</td>
                            {/* Goals — a line for goalkeepers (they don't score here) */}
                            <td className="px-2 text-center">{isGK ? <span className="text-slate-300">—</span> : (editing ? <NumField value={s.goals} onChange={v => setP(p.id, { goals: v })} /> : <span className="tabular-nums text-slate-700 dark:text-slate-200">{s.goals || '0'}</span>)}</td>
                            {/* Assists */}
                            <td className="px-2 text-center">{editing ? <NumField value={s.assists} onChange={v => setP(p.id, { assists: v })} /> : <span className="tabular-nums text-slate-700 dark:text-slate-200">{s.assists || '0'}</span>}</td>
                            {/* Clean sheet — goalkeepers & defenders, under the CS header */}
                            <td className="px-2 text-center">{backline ? (editing ? <input type="checkbox" checked={s.cs} onChange={e => setP(p.id, { cs: e.target.checked })} className="w-4 h-4 accent-brand align-middle" /> : (s.cs ? <i className="fas fa-check text-emerald-500" /> : <span className="text-slate-300">—</span>)) : <span className="text-slate-300">—</span>}</td>
                            {/* Cautions */}
                            <td className="px-2 text-center">{editing ? <Select compact className="w-24 mx-auto" value={s.caution} onChange={e => setP(p.id, { caution: e.target.value as PStat['caution'] })}><option value="none">None</option><option value="yellow">🟨 Yellow</option><option value="red">🟥 Red</option></Select> : <span className="text-xs">{s.caution === 'yellow' ? '🟨' : s.caution === 'red' ? '🟥' : '—'}</span>}</td>
                            {/* Rating (quick) — feeds analytics + the player profile */}
                            <td className="px-2 text-center">{editing ? <Select compact className="w-[4.75rem] mx-auto" value={s.rating} onChange={e => setP(p.id, { rating: e.target.value })}><option value="">--</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}/5</option>)}</Select> : <span className="tabular-nums font-semibold">{s.rating ? `${s.rating}/5` : '—'}</span>}</td>
                            {/* Full performance assessment — next to the quick rating, lands on the player's profile */}
                            <td className="px-1 text-center">{canEdit && <button onClick={() => setAssessPlayer({ id: p.id, name: p.name })} title="Full performance assessment" className="p-1.5 rounded text-slate-400 hover:text-brand hover:bg-brand/10"><ClipboardCheck size={15} /></button>}</td>
                            {/* Notes */}
                            <td className="px-2 min-w-[8rem]">{editing ? <input className="w-40 rounded-md border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-bg px-2 py-1 text-xs outline-none focus:border-brand" value={s.notes} onChange={e => setP(p.id, { notes: e.target.value })} placeholder="Notes…" /> : (s.notes ? <span className="text-xs text-slate-500 dark:text-slate-400">{s.notes}</span> : <span className="text-slate-300">—</span>)}</td>
                          </tr>
                        ); })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[11px] text-slate-400 mt-3">Quick rating (1–5) feeds analytics &amp; the player's profile. The <ClipboardCheck size={11} className="inline -mt-0.5" /> clipboard opens the full performance assessment. Use <b>Add Event</b> to quickly tally goals, assists, saves &amp; cards.</p>
            </div>
          )}
        </div>
      )}

      {/* REPORT — coloured, titled sections (tactical-analysis style) */}
      {tab === 'report' && (
        <div className={`${card} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><i className="fas fa-clipboard-list text-brand" /> Match Report <span className="text-[11px] font-normal text-slate-400">(tactical review)</span></h3>
            {!editing && <span className="text-[11px] text-slate-400"><i className="fas fa-users mr-1" />Visible to this team</span>}
          </div>
          {editing ? (
            <div className="space-y-4">
              <L label="Report Title"><input className={fieldCls} value={rf.reportTitle} onChange={e => setRf({ ...rf, reportTitle: e.target.value })} placeholder={`vs ${match.opponent || 'opponent'} — review`} /></L>
              {(() => {
                const general = REPORT_FIELDS.find(f => f.full)!; const rest = REPORT_FIELDS.filter(f => !f.full);
                const Box = (f: typeof REPORT_FIELDS[number]) => { const c = SECT[f.color]; return (
                  <div key={f.key} className={`rounded-xl border ${c.border} overflow-hidden`}>
                    <div className={`flex items-center gap-2 px-3 py-2 ${c.soft} border-b ${c.border}`}><span className={`w-1.5 h-4 rounded-full ${c.dot}`} /><span className={`text-[11px] font-bold uppercase tracking-wider ${c.title}`}><i className={`fas ${f.icon} mr-1.5`} />{f.label}</span></div>
                    <textarea className="w-full bg-transparent px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none resize-none h-24" value={(rf as any)[f.key]} onChange={e => setRf({ ...rf, [f.key]: e.target.value })} placeholder={`${f.label}…`} />
                  </div>
                ); };
                return <>{Box(general)}<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{rest.map(Box)}</div></>;
              })()}
            </div>
          ) : (
            (() => { const filled = REPORT_FIELDS.filter(f => ((match as any)[f.key] as string)?.trim()); return filled.length === 0 ? <div className="py-10 text-center text-slate-400 text-sm"><FileText size={26} className="mx-auto mb-3 opacity-50" />No report written yet.{canEdit && <div className="text-xs mt-1">Press Edit to write one.</div>}</div> : (
              <div className="space-y-4">
                {match.reportTitle && <h4 className="text-base font-bold text-slate-900 dark:text-white">{match.reportTitle}</h4>}
                {(() => {
                  const general = filled.find(f => f.full); const rest = filled.filter(f => !f.full);
                  const Box = (f: typeof REPORT_FIELDS[number]) => { const c = SECT[f.color]; return (
                    <div key={f.key} className={`rounded-xl border ${c.border} overflow-hidden`}>
                      <div className={`flex items-center gap-2 px-3 py-2 ${c.soft} border-b ${c.border}`}><span className={`w-1.5 h-4 rounded-full ${c.dot}`} /><span className={`text-[11px] font-bold uppercase tracking-wider ${c.title}`}><i className={`fas ${f.icon} mr-1.5`} />{f.label}</span></div>
                      <p className="px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{(match as any)[f.key] as string}</p>
                    </div>
                  ); };
                  return <>{general && Box(general)}{rest.length > 0 && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{rest.map(Box)}</div>}</>;
                })()}
              </div>
            ); })()
          )}
        </div>
      )}

      {tab === 'analysis' && <MatchVideos match={match} canEdit={canEdit && editing} />}
      {tab === 'media' && <MatchMedia match={match} canEdit={canEdit && editing} />}

      {assessPlayer && <MatchPlayerAssessmentModal open onClose={() => setAssessPlayer(null)} playerId={assessPlayer.id} playerName={assessPlayer.name} matchId={match.id} matchDate={match.date} opponent={match.opponent} />}
    </div>
  );
};

const L: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div><div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</div>{children}</div>
);
const Legend: React.FC<{ c: string; t: string }> = ({ c, t }) => (
  <span className="inline-flex items-center gap-1"><span className={'w-2.5 h-2.5 rounded-full ' + c} />{t}</span>
);

/** Inline status pill that opens a portal dropdown — blends into the lineup row (like Squad Management). */
const StatusPill: React.FC<{ value: PStat['status']; onChange: (v: PStat['status']) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => { if (e.target instanceof Node && panelRef.current?.contains(e.target)) return; setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onResize = () => setOpen(false);
    window.addEventListener('scroll', onScroll, true); window.addEventListener('resize', onResize); document.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onResize); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <>
      <button ref={ref} type="button" onClick={() => { const r = ref.current?.getBoundingClientRect(); if (r) setRect(r); setOpen(o => !o); }}
        className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold cursor-pointer hover:brightness-95 transition', STATUS_BADGE[value])}>
        {STATUS_LABEL[value]}<ChevronDown size={12} className="opacity-70" />
      </button>
      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[800]" onMouseDown={() => setOpen(false)} />
          <div ref={panelRef} style={{ position: 'fixed', top: rect.bottom + 4, left: Math.max(8, rect.left), width: 172, zIndex: 801 }}
            className="rounded-lg border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface shadow-xl py-1 fh-zoom-in">
            {STATUS_OPTS.map(([v, l]) => (
              <button key={v} type="button" onClick={() => { setOpen(false); onChange(v as PStat['status']); }}
                className={cn('w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors', v === value ? 'bg-brand/10 text-brand font-semibold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5')}>
                <span className={cn('w-2 h-2 rounded-full', STATUS_DOT[v])} />{l}
              </button>
            ))}
          </div>
        </>, document.body)}
    </>
  );
};

/** Compact number field with tap-friendly up/down steppers (for minutes, goals, assists, saves). */
const NumField: React.FC<{ value: string; onChange: (v: string) => void; step?: number; max?: number; w?: string }> = ({ value, onChange, step = 1, max = 99, w = 'w-10' }) => {
  const n = parseInt(value || '0', 10) || 0;
  const set = (v: number) => onChange(String(Math.max(0, Math.min(max, v))));
  return (
    <div className="inline-flex items-stretch rounded-md border border-slate-200 dark:border-sentinel-border overflow-hidden bg-white dark:bg-sentinel-bg align-middle">
      <input inputMode="numeric" value={value} onChange={e => onChange(e.target.value.replace(/[^0-9]/g, ''))}
        className={cn(w, 'text-center text-sm tabular-nums bg-transparent outline-none px-1 py-1 text-slate-900 dark:text-slate-100')} />
      <div className="flex flex-col border-l border-slate-200 dark:border-sentinel-border">
        <button type="button" tabIndex={-1} onClick={() => set(n + step)} className="flex items-center justify-center px-1 h-3.5 text-slate-400 hover:text-brand hover:bg-brand/10"><ChevronUp size={11} /></button>
        <button type="button" tabIndex={-1} onClick={() => set(n - step)} className="flex items-center justify-center px-1 h-3.5 text-slate-400 hover:text-brand hover:bg-brand/10 border-t border-slate-200 dark:border-sentinel-border"><ChevronDown size={11} /></button>
      </div>
    </div>
  );
};
