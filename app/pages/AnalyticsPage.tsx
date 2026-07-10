import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, Legend, ResponsiveContainer } from 'recharts';
import { Star, Users, User, Scale, X, Share2, Printer } from 'lucide-react';
import { Select, Input } from '../components/ui/Input';
import { DatePicker } from '../components/ui/DatePicker';
import { CollapsibleSection } from '../components/ui/CollapsibleSection';
import { PillTabs } from '../components/ui/PillTabs';
import { PageToolbar } from '../components/ui/PageToolbar';
import { AnalyticsSummarySkeleton } from '../components/ui/Skeleton';
import { useMatches } from '../hooks/useMatches';
import { useSquads, usePlayers } from '../hooks/useSquads';
import { useCoachScope } from '../hooks/useCoachScope';
import { useSeasons } from '../hooks/useSeasons';
import { useAppState } from '../context/AppStateContext';
import { useToast } from '../context/ToastContext';
import { TierGate } from '../components/tier/TierGate';
import { resultOutcome, type Match } from '../services/matchService';
import { isInSeason, type Season } from '../services/seasonsService';
import { fetchAttendanceRecords } from '../services/attendanceService';
import { downloadCsv } from '../lib/csv';
import {
  fetchPlayerMatchAggregates, fetchPlayerPillarMatrix, fetchPlayerCompare,
  posGroupOrder, posGroupLabel, positionGroup, type PlayerMatchAgg, type PlayerPillarAgg, type CompareAgg,
} from '../services/analyticsService';

/**
 * Analytics — two tabs (Team / Player) built from the same tables coaches fill in
 * (match_player_stats, matches, assessments, training_attendance). Club- and coach-scoped
 * (a coach with one squad only sees that squad; admins see the club). Filterable by season,
 * date range, team and position. A "Share view" copies a link that reproduces the exact filters
 * for a logged-in teammate; opened with ?shared=1 it also exposes CSV/print downloads.
 */
const OUTCOME_COLOR = { W: '#10b981', D: '#f59e0b', L: '#ef4444' } as const;
const OUTCOME_BADGE = { W: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', D: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', L: 'bg-rose-500/15 text-rose-500' } as const;
const POS_FILTERS: [string, string][] = [['all', 'All positions'], ['GK', 'Goalkeepers'], ['DEF', 'Defenders'], ['MID', 'Midfielders'], ['FWD', 'Forwards']];
const PRINT_CSS = `@media print { .no-print { display: none !important; } body * { visibility: hidden; } #analytics-print, #analytics-print * { visibility: visible; } #analytics-print { position: absolute; left: 0; top: 0; width: 100%; } }`;

function ourGoals(m: Match) { return m.ourSide === 'away' ? m.awayScore : m.homeScore; }
function oppGoals(m: Match) { return m.ourSide === 'away' ? m.homeScore : m.awayScore; }
function ourXg(m: Match) { return Number((m.ourSide === 'away' ? m.stats?.away : m.stats?.home)?.xG) || 0; }
function oppXg(m: Match) { return Number((m.ourSide === 'away' ? m.stats?.home : m.stats?.away)?.xG) || 0; }
const fmtDate = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
const initials = (n: string) => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
const ratingColor = (r: number | null) => r == null ? 'text-slate-400' : r >= 4 ? 'text-emerald-600 dark:text-emerald-400' : r >= 3 ? 'text-sky-600 dark:text-sky-400' : r >= 2 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-500';
const pctColor = (p: number) => p >= 80 ? 'text-emerald-600 dark:text-emerald-400' : p >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-500';
const pctBar = (p: number) => p >= 80 ? 'bg-emerald-500' : p >= 60 ? 'bg-amber-500' : 'bg-rose-500';

const card = 'rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface';
const th = 'px-3 py-2 font-semibold';
const td = 'px-3 py-2.5';

const CsvButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button onClick={onClick} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-sentinel-border px-2.5 py-1 text-xs font-semibold text-slate-500 hover:border-brand hover:text-brand transition-colors"><i className="fas fa-file-csv" /> CSV</button>
);

const AnalyticsInner: React.FC = () => {
  const [params] = useSearchParams();
  const { showToast } = useToast();
  const { data: matches, isLoading } = useMatches();
  const { data: squads } = useSquads();
  const { data: players } = usePlayers();
  const { coachSquadIds } = useCoachScope();
  const { effectiveClubId, archetype } = useAppState();
  const { data: seasons } = useSeasons();

  const visibleSquads = useMemo(() => (squads || []).filter(s => !coachSquadIds || coachSquadIds.includes(s.id)), [squads, coachSquadIds]);
  const noTeams = archetype === 'private_coaching' || visibleSquads.length === 0;
  const shared = params.get('shared') === '1';

  const [tab, setTab] = useState<'team' | 'player'>(params.get('tab') === 'player' || noTeams ? 'player' : 'team');
  const [seasonId, setSeasonId] = useState(params.get('season') || 'all');
  const [from, setFrom] = useState(params.get('from') || '');
  const [to, setTo] = useState(params.get('to') || '');
  const [teamFilter, setTeamFilter] = useState(params.get('team') || 'all');
  const [ageFilter, setAgeFilter] = useState(params.get('age') || 'all');
  const [squadFilter, setSquadFilter] = useState(params.get('squad') || 'all');
  const [posFilter, setPosFilter] = useState(params.get('pos') || 'all');
  const [posSpecific, setPosSpecific] = useState(params.get('posx') || 'all');
  // Per-table view tweaks — lifted here so the share link can remember them too.
  const [sortBy, setSortBy] = useState<SortKey>((params.get('sort') as SortKey) || 'motm');
  const [playerFocus, setPlayerFocus] = useState(params.get('player') || 'all');
  const [h2hA, setH2hA] = useState(params.get('h2ha') || '');
  const [h2hB, setH2hB] = useState(params.get('h2hb') || '');

  const season = useMemo(() => (seasons || []).find(s => s.id === seasonId) || null, [seasons, seasonId]);
  const squadName = (id: string | null) => squads?.find(s => s.id === id)?.name || 'Unassigned';

  // Default to the CURRENT season once seasons load (unless a season was passed in the share link).
  const seededSeason = useRef(false);
  useEffect(() => {
    if (seededSeason.current || !seasons) return;
    seededSeason.current = true;
    if (!params.get('season')) { const cur = seasons.find(s => s.isCurrent); if (cur) setSeasonId(cur.id); }
  }, [seasons]); // eslint-disable-line

  const ageGroups = useMemo(() => [...new Set(visibleSquads.map(s => s.ageGroup).filter(Boolean))] as string[], [visibleSquads]);
  // Specific positions present across the visible squads (CDM, CAM, ST…), grouped GK→FWD then A–Z.
  const specificPositions = useMemo(() => {
    const set = new Set<string>();
    (players || []).filter(p => !coachSquadIds || coachSquadIds.includes(p.squadId)).forEach(p => (p.position || '').split(/[,/]/).map((t: string) => t.trim()).filter(Boolean).forEach((t: string) => set.add(t)));
    return [...set].sort((a, b) => (posGroupOrder(a) - posGroupOrder(b)) || a.localeCompare(b));
  }, [players, coachSquadIds]);

  const shareView = () => {
    const q = new URLSearchParams({ tab, shared: '1' });
    if (seasonId !== 'all') q.set('season', seasonId);
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (ageFilter !== 'all') q.set('age', ageFilter);
    if (tab === 'team') { if (teamFilter !== 'all') q.set('team', teamFilter); }
    else {
      if (squadFilter !== 'all') q.set('squad', squadFilter);
      if (posFilter !== 'all') q.set('pos', posFilter);
      if (posSpecific !== 'all') q.set('posx', posSpecific);
      if (sortBy !== 'motm') q.set('sort', sortBy);
      if (playerFocus !== 'all') q.set('player', playerFocus);
      if (h2hA) q.set('h2ha', h2hA);
      if (h2hB) q.set('h2hb', h2hB);
    }
    const url = `${window.location.origin}/analytics?${q.toString()}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    showToast('Analytics link copied — opens this exact view (filters, sort & selections) for a teammate.', 'success');
  };

  // Active page filters as removable chips (industry-standard filter visibility).
  const chips: { label: string; clear: () => void }[] = [];
  if (season) chips.push({ label: `Season: ${season.name}`, clear: () => setSeasonId('all') });
  if (from || to) chips.push({ label: `Dates: ${from || '…'} → ${to || '…'}`, clear: () => { setFrom(''); setTo(''); } });
  if (ageFilter !== 'all') chips.push({ label: `Age: ${ageFilter}`, clear: () => setAgeFilter('all') });
  if (tab === 'team' && teamFilter !== 'all') chips.push({ label: `Team: ${squadName(teamFilter)}`, clear: () => setTeamFilter('all') });
  if (tab === 'player' && squadFilter !== 'all') chips.push({ label: `Squad: ${squadName(squadFilter)}`, clear: () => setSquadFilter('all') });
  if (tab === 'player' && posFilter !== 'all') chips.push({ label: `Position: ${(POS_FILTERS.find(p => p[0] === posFilter) || [, posFilter])[1]}`, clear: () => setPosFilter('all') });
  if (tab === 'player' && posSpecific !== 'all') chips.push({ label: `Role: ${posSpecific}`, clear: () => setPosSpecific('all') });
  const clearAll = () => { setSeasonId('all'); setFrom(''); setTo(''); setAgeFilter('all'); setTeamFilter('all'); setSquadFilter('all'); setPosFilter('all'); setPosSpecific('all'); };

  return (
    <div>
      <style>{PRINT_CSS}</style>
      <PageToolbar
        title="Analytics"
        description="Team & player performance — from match reports, assessments and the training register."
        dataTour="analytics-main"
        className="no-print"
        left={!noTeams ? <PillTabs value={tab} onChange={id => setTab(id as 'team' | 'player')} tabs={[
          { id: 'team', label: 'Team Analytics', icon: <Users size={15} /> },
          { id: 'player', label: 'Player Analytics', icon: <User size={15} /> },
        ]} /> : undefined}
      >
        {!noTeams && (tab === 'team' ? (<>
          {ageGroups.length > 0 && <label className="text-[11px] font-semibold text-slate-400"><span className="block mb-1">Age group</span><Select value={ageFilter} onChange={e => setAgeFilter(e.target.value)} className="w-36"><option value="all">All age groups</option>{ageGroups.map(a => <option key={a} value={a}>{a}</option>)}</Select></label>}
          {visibleSquads.length > 1 && <label className="text-[11px] font-semibold text-slate-400"><span className="block mb-1">Team</span><Select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="w-40"><option value="all">All teams</option>{visibleSquads.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></label>}
        </>) : (<>
          {visibleSquads.length > 1 && <label className="text-[11px] font-semibold text-slate-400"><span className="block mb-1">Squad</span><Select value={squadFilter} onChange={e => setSquadFilter(e.target.value)} className="w-40"><option value="all">{coachSquadIds ? 'All my squads' : 'All squads'}</option>{visibleSquads.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></label>}
          <label className="text-[11px] font-semibold text-slate-400"><span className="block mb-1">Position</span><Select value={posFilter} onChange={e => setPosFilter(e.target.value)} className="w-36">{POS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></label>
          {specificPositions.length > 0 && <label className="text-[11px] font-semibold text-slate-400"><span className="block mb-1">Role</span><Select value={posSpecific} onChange={e => setPosSpecific(e.target.value)} className="w-32"><option value="all">All roles</option>{specificPositions.map(p => <option key={p} value={p}>{p}</option>)}</Select></label>}
        </>))}
        {(seasons || []).length > 0 && (
          <label className="text-[11px] font-semibold text-slate-400"><span className="block mb-1">Season</span>
            <Select value={seasonId} onChange={e => setSeasonId(e.target.value)} className="w-44"><option value="all">All-time</option>{(seasons || []).map(s => <option key={s.id} value={s.id}>{s.name}{s.isCurrent ? ' (current)' : ''}</option>)}</Select>
          </label>
        )}
        <label className="text-[11px] font-semibold text-slate-400"><span className="block mb-1">From</span><DatePicker value={from} onChange={e => setFrom(e.target.value)} className="w-40" /></label>
        <label className="text-[11px] font-semibold text-slate-400"><span className="block mb-1">To</span><DatePicker value={to} onChange={e => setTo(e.target.value)} className="w-40" /></label>
        {(from || to) && <button onClick={() => { setFrom(''); setTo(''); }} className="text-xs text-slate-400 hover:text-brand mb-2">Clear</button>}
        <button onClick={shareView} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-[#0D1B2A] hover:bg-brand-dark transition-colors"><Share2 size={15} /> Share view</button>
        {shared && <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-sentinel-border px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:border-brand hover:text-brand transition-colors"><Printer size={15} /> Print / PDF</button>}
      </PageToolbar>

      {chips.length > 0 && (
        <div className="no-print flex flex-wrap items-center gap-2 mb-4">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Filters:</span>
          {chips.map((c, i) => <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 text-brand text-xs font-semibold px-2.5 py-1">{c.label}<button onClick={c.clear} className="hover:text-rose-500"><X size={12} /></button></span>)}
          <button onClick={clearAll} className="text-xs text-slate-400 hover:text-brand">Clear all</button>
        </div>
      )}

      <div id="analytics-print">
        {shared && <div className="hidden print:block mb-3 text-lg font-bold text-slate-900">Analytics{season ? ` · ${season.name}` : ''}{from || to ? ` · ${from || '…'}–${to || '…'}` : ''}</div>}
        {isLoading ? (
          <AnalyticsSummarySkeleton />
        ) : tab === 'team' ? (
          <TeamAnalytics matches={matches || []} visibleSquads={visibleSquads} coachSquadIds={coachSquadIds} clubId={effectiveClubId} players={players || []} squadName={squadName} archetype={archetype} season={season} from={from} to={to} teamFilter={teamFilter} ageFilter={ageFilter} shared={shared} />
        ) : (
          <PlayerAnalytics clubId={effectiveClubId} visibleSquads={visibleSquads} coachSquadIds={coachSquadIds} players={players || []} archetype={archetype} season={season} from={from} to={to} squadFilter={squadFilter} posFilter={posFilter} posSpecific={posSpecific} sortBy={sortBy} setSortBy={setSortBy} playerFocus={playerFocus} setPlayerFocus={setPlayerFocus} h2hA={h2hA} h2hB={h2hB} setH2hA={setH2hA} setH2hB={setH2hB} shared={shared} />
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════ TEAM ANALYTICS ═══════════════════════════════
const SumStat: React.FC<{ label: string; value: React.ReactNode; sub?: string; tone?: string }> = ({ label, value, sub, tone }) => (
  <div>
    <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
    <div className={'text-lg font-bold ' + (tone || 'text-slate-900 dark:text-white')}>{value}{sub && <span className="text-[10px] font-normal text-slate-400 ml-1">{sub}</span>}</div>
  </div>
);

const TeamAnalytics: React.FC<{ matches: Match[]; visibleSquads: any[]; coachSquadIds: string[] | null; clubId: string | null; players: any[]; squadName: (id: string | null) => string; archetype?: string; season: Season | null; from: string; to: string; teamFilter: string; ageFilter: string; shared: boolean }> = ({ matches, visibleSquads, coachSquadIds, clubId, players, squadName, archetype, season, from, to, teamFilter, ageFilter, shared }) => {
  const singleTeam = visibleSquads.length === 1; // a coach with just one squad
  const dateOk = (d: string | null) => (!from || (d || '') >= from) && (!to || (d || '') <= to);

  const scopedSquadIds = useMemo(() => visibleSquads
    .filter(s => (ageFilter === 'all' || s.ageGroup === ageFilter) && (teamFilter === 'all' || s.id === teamFilter))
    .map(s => s.id), [visibleSquads, ageFilter, teamFilter]);
  const allVisible = ageFilter === 'all' && teamFilter === 'all' && !coachSquadIds;
  const inScope = (m: Match) => allVisible ? true : scopedSquadIds.includes(m.squadId || '');
  const played = useMemo(() => matches.filter(m => m.isPast && m.homeScore != null && inScope(m) && isInSeason(m.seasonId, m.date, season) && dateOk(m.date)), [matches, scopedSquadIds, allVisible, season, from, to]);

  // A single team is "in focus" when the coach has one team, or a team filter is picked.
  // The combined view rolls up whatever teams THIS user can see: an admin → the whole club;
  // a coach/manager with several teams → just their teams; one team → that team.
  const isAdmin = !coachSquadIds;
  const focusTeamId = singleTeam ? visibleSquads[0].id : (teamFilter !== 'all' ? teamFilter : null);
  const scopeLabel = focusTeamId ? squadName(focusTeamId) : (isAdmin ? 'All teams · Club' : `My teams (${visibleSquads.length})`);

  const stats = useMemo(() => {
    let w = 0, d = 0, l = 0, gf = 0, ga = 0, xg = 0, xga = 0, xgTracked = 0;
    played.forEach(m => {
      const o = resultOutcome(m); if (o === 'W') w++; else if (o === 'D') d++; else if (o === 'L') l++;
      gf += ourGoals(m) || 0; ga += oppGoals(m) || 0;
      if (ourXg(m) || oppXg(m)) { xg += ourXg(m); xga += oppXg(m); xgTracked++; }
    });
    const total = played.length;
    const form = [...played].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-10).map(m => ({ id: m.id, o: resultOutcome(m), opp: m.opponent, gf: ourGoals(m), ga: oppGoals(m) }));
    return { total, w, d, l, gf, ga, gd: gf - ga, winRate: total ? Math.round(w / total * 100) : 0, xgDiff: +(xg - xga).toFixed(1), xgTracked, wdl: [{ name: 'Wins', value: w, key: 'W' }, { name: 'Draws', value: d, key: 'D' }, { name: 'Losses', value: l, key: 'L' }], form };
  }, [played]);

  const history = useMemo(() => [...played].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 100), [played]);
  const breakdown = useMemo(() => {
    const by: Record<string, any> = {};
    played.forEach(m => { const sid = m.squadId || 'none'; const t = by[sid] || (by[sid] = { squadId: m.squadId, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }); const o = resultOutcome(m); t.p++; if (o === 'W') t.w++; else if (o === 'D') t.d++; else if (o === 'L') t.l++; t.gf += ourGoals(m) || 0; t.ga += oppGoals(m) || 0; });
    return Object.values(by).map((t: any) => ({ ...t, gd: t.gf - t.ga, name: squadName(t.squadId), pts: t.w * 3 + t.d })).sort((a, b) => b.pts - a.pts || b.gd - a.gd);
  }, [played]);
  const multiTeam = !focusTeamId && breakdown.length > 1;

  const { data: attRecords } = useQuery({ queryKey: ['attRecords', clubId, coachSquadIds], queryFn: () => fetchAttendanceRecords(clubId, coachSquadIds), enabled: !!clubId, staleTime: 120_000 });
  const playerName = useMemo(() => Object.fromEntries(players.map(p => [p.id, p.name])), [players]);
  const attSessions = useMemo(() => (attRecords || [])
    .filter(r => (allVisible || scopedSquadIds.includes(r.squadId || '')) && isInSeason(null, r.date, season) && dateOk(r.date))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 80), [attRecords, scopedSquadIds, allVisible, season, from, to]);
  const attAvg = useMemo(() => { const w = attSessions.filter(r => r.total > 0); return w.length ? Math.round(w.reduce((n, r) => n + r.count / r.total * 100, 0) / w.length) : null; }, [attSessions]);

  const filterBar = (
    <div className="no-print flex flex-wrap items-center gap-2 mb-4">
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"><i className="fas fa-people-group text-brand" /> {scopeLabel}</span>
    </div>
  );

  if (played.length === 0) return (<>{filterBar}<div className={`${card} p-8 text-center text-slate-400`}>No completed matches to analyse for this selection.</div></>);

  return (
    <div className="space-y-4">
      {filterBar}
      {/* Combined summary — the club (or focused team) rolled into one line, no bulky cards */}
      <div className={`${card} px-5 py-3.5 flex flex-wrap items-center gap-x-7 gap-y-2`}>
        <SumStat label={focusTeamId ? 'Team' : (isAdmin ? 'Club' : 'My teams')} value={scopeLabel.replace(' · Club', '')} />
        <span className="h-8 w-px bg-slate-200 dark:bg-sentinel-border hidden sm:block" />
        <SumStat label="Played" value={stats.total} />
        <SumStat label="Record" value={`${stats.w}W · ${stats.d}D · ${stats.l}L`} />
        <SumStat label="Win Rate" value={`${stats.winRate}%`} />
        <SumStat label="Goals" value={`${stats.gf}–${stats.ga}`} sub="for–against" tone="text-slate-900 dark:text-white" />
        <SumStat label="Goal Diff" value={`${stats.gd >= 0 ? '+' : ''}${stats.gd}`} tone={stats.gd >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'} />
        {stats.xgTracked ? <SumStat label="xG Diff" value={`${stats.xgDiff >= 0 ? '+' : ''}${stats.xgDiff}`} /> : null}
      </div>

      {/* Multi-team → per-team comparison (accumulated club view). Single team → its own form + W/D/L. */}
      {multiTeam ? (
        <CollapsibleSection title="Goals by Team" subtitle="Goals for vs conceded across every squad — the club at a glance" right={<span className="text-xs text-slate-400">{breakdown.length} teams</span>}>
          <ResponsiveContainer width="100%" height={Math.max(220, breakdown.length * 46)}>
            <BarChart data={breakdown} layout="vertical" margin={{ left: 10, right: 10 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: '#94a3b81a' }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="gf" name="Goals For" fill="#10b981" radius={[0, 4, 4, 0]} />
              <Bar dataKey="ga" name="Goals Against" fill="#ef4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CollapsibleSection>
      ) : (
        <CollapsibleSection title="Recent Form & Results" subtitle={`${scopeLabel} — last results + win/draw/loss split`} right={<span className="text-xs font-semibold text-slate-400">Win rate {stats.winRate}%</span>}>
          <div className="flex items-center gap-2 flex-wrap mb-5">
            {stats.form.map(f => <Link key={f.id} to={`/matches/${f.id}`} title={`${f.opp} ${f.gf}-${f.ga}`} className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white no-underline" style={{ background: f.o ? OUTCOME_COLOR[f.o] : '#94a3b8' }}>{f.o || '–'}</Link>)}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.wdl}>
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={24} />
              <Tooltip cursor={{ fill: '#94a3b81a' }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>{stats.wdl.map(d => <Cell key={d.key} fill={OUTCOME_COLOR[d.key as 'W' | 'D' | 'L']} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Match Results" subtitle="Team, opponent, result and score" right={<span className="text-xs text-slate-400">{history.length} games</span>}>
        {shared && <div className="flex justify-end mb-3"><CsvButton onClick={() => downloadCsv('match-results', ['Date', 'Team', 'Competition', 'Opponent', 'Result', 'GF', 'GA'], history.map(m => [m.date, squadName(m.squadId), m.competition || '', m.opponent || '', resultOutcome(m) || '', ourGoals(m) ?? 0, oppGoals(m) ?? 0]))} /></div>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-sentinel-border"><th className={th}>Date</th><th className={th}>Team</th><th className={th}>Competition</th><th className={th}>Opponent</th><th className={th + ' text-center'}>Result</th><th className={th + ' text-center'}>Score</th></tr></thead>
            <tbody>
              {history.map(m => { const o = resultOutcome(m); return (
                <tr key={m.id} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5">
                  <td className={td + ' whitespace-nowrap text-slate-500 dark:text-slate-400'}>{fmtDate(m.date)}</td>
                  <td className={td + ' text-slate-700 dark:text-slate-200'}>{squadName(m.squadId)}</td>
                  <td className={td + ' text-slate-500 dark:text-slate-400'}>{m.competition || '—'}</td>
                  <td className={td + ' font-medium text-slate-900 dark:text-white'}><Link to={`/matches/${m.id}`} className="hover:text-brand no-underline text-slate-900 dark:text-white">{m.opponent || '—'}</Link></td>
                  <td className={td + ' text-center'}><span className={'inline-flex w-6 h-6 rounded-full items-center justify-center text-[11px] font-bold ' + (o ? OUTCOME_BADGE[o] : 'bg-slate-100 text-slate-400')}>{o || '–'}</span></td>
                  <td className={td + ' text-center font-semibold tabular-nums text-slate-900 dark:text-white'}>{ourGoals(m)}–{oppGoals(m)}</td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      {breakdown.length > 1 && (
        <CollapsibleSection title="Team Breakdown" subtitle="Each squad's record — a mini club standings" right={<span className="text-xs text-slate-400">{breakdown.length} teams</span>}>
          {shared && <div className="flex justify-end mb-3"><CsvButton onClick={() => downloadCsv('team-breakdown', ['Team', 'P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'], breakdown.map(t => [t.name, t.p, t.w, t.d, t.l, t.gf, t.ga, t.gd, t.pts]))} /></div>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-sentinel-border"><th className={th}>Team</th><th className={th + ' text-center'}>P</th><th className={th + ' text-center'}>W</th><th className={th + ' text-center'}>D</th><th className={th + ' text-center'}>L</th><th className={th + ' text-center'}>GF</th><th className={th + ' text-center'}>GA</th><th className={th + ' text-center'}>GD</th><th className={th + ' text-center'}>Pts</th></tr></thead>
              <tbody>
                {breakdown.map(t => (
                  <tr key={t.squadId || 'none'} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5">
                    <td className={td + ' font-medium text-slate-900 dark:text-white'}>{t.name}</td>
                    <td className={td + ' text-center text-slate-500 dark:text-slate-400'}>{t.p}</td>
                    <td className={td + ' text-center font-semibold text-emerald-600 dark:text-emerald-400'}>{t.w}</td>
                    <td className={td + ' text-center text-amber-600 dark:text-amber-400'}>{t.d}</td>
                    <td className={td + ' text-center text-rose-500'}>{t.l}</td>
                    <td className={td + ' text-center text-slate-700 dark:text-slate-200'}>{t.gf}</td>
                    <td className={td + ' text-center text-slate-700 dark:text-slate-200'}>{t.ga}</td>
                    <td className={td + ' text-center font-semibold tabular-nums ' + (t.gd > 0 ? 'text-emerald-600 dark:text-emerald-400' : t.gd < 0 ? 'text-rose-500' : 'text-slate-400')}>{t.gd >= 0 ? '+' : ''}{t.gd}</td>
                    <td className={td + ' text-center font-bold text-slate-900 dark:text-white'}>{t.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>
      )}

      {archetype !== 'private_coaching' && (
        <CollapsibleSection title="Team Training Attendance" subtitle="Session-by-session from the register — expand a row for who was there" right={attAvg != null ? <span className="text-xs font-semibold text-slate-400">Avg {attAvg}%</span> : undefined}>
          {shared && attSessions.length > 0 && <div className="flex justify-end mb-3"><CsvButton onClick={() => downloadCsv('team-attendance', ['Date', 'Team', 'Attended', 'Total', '%'], attSessions.map(r => [r.date, squadName(r.squadId), r.count, r.total, r.total ? Math.round(r.count / r.total * 100) : 0]))} /></div>}
          {attSessions.length === 0 ? <div className="text-center text-slate-400 text-sm py-4">No attendance recorded for this selection.</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-sentinel-border"><th className={th}>Date</th><th className={th}>Team</th><th className={th + ' text-center'}>Attended</th><th className={th + ' w-1/3'}>Attendance</th><th className={th}></th></tr></thead>
                <tbody>{attSessions.map((r, i) => <AttSessionRow key={i} r={r} squadName={squadName} playerName={playerName} />)}</tbody>
              </table>
            </div>
          )}
        </CollapsibleSection>
      )}
    </div>
  );
};

const AttSessionRow: React.FC<{ r: any; squadName: (id: string | null) => string; playerName: Record<string, string> }> = ({ r, squadName, playerName }) => {
  const [open, setOpen] = useState(false);
  const pct = r.total ? Math.round(r.count / r.total * 100) : 0;
  const absentNames = (r.absentPlayerIds || []).map((id: string) => playerName[id]).filter(Boolean);
  return (
    <>
      <tr className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <td className={td + ' whitespace-nowrap text-slate-500 dark:text-slate-400'}>{fmtDate(r.date)}</td>
        <td className={td + ' text-slate-700 dark:text-slate-200'}>{squadName(r.squadId)}</td>
        <td className={td + ' text-center font-semibold tabular-nums'}>{r.count}/{r.total}</td>
        <td className={td}><div className="flex items-center gap-2"><div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden"><div className={'h-full rounded-full ' + pctBar(pct)} style={{ width: `${pct}%` }} /></div><span className={'text-xs font-bold tabular-nums w-9 text-right ' + pctColor(pct)}>{pct}%</span></div></td>
        <td className={td + ' text-right'}><i className={'fas fa-chevron-down text-slate-400 transition-transform ' + (open ? 'rotate-180' : '')} /></td>
      </tr>
      {open && (
        <tr className="bg-slate-50 dark:bg-white/5"><td colSpan={5} className="px-3 py-2.5">
          {absentNames.length ? <div><span className="text-[11px] font-bold uppercase tracking-wider text-rose-500">Absent ({absentNames.length})</span><div className="mt-1.5 flex flex-wrap gap-1.5">{absentNames.map((n: string, i: number) => <span key={i} className="text-xs rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 px-2 py-0.5">{n}</span>)}</div></div>
            : <span className="text-sm text-emerald-600 dark:text-emerald-400"><i className="fas fa-check-circle mr-1.5" />Full attendance — no absentees recorded.</span>}
        </td></tr>
      )}
    </>
  );
};

// ═══════════════════════════════ PLAYER ANALYTICS ═══════════════════════════════
type SortKey = 'motm' | 'goals' | 'assists' | 'contributions' | 'apps' | 'rating' | 'minutes' | 'cleansheets';
const SORTS: [SortKey, string][] = [['motm', 'MOTM'], ['goals', 'Goals'], ['assists', 'Assists'], ['contributions', 'G+A'], ['apps', 'Apps'], ['rating', 'Rating'], ['minutes', 'Minutes'], ['cleansheets', 'Clean Sheets']];

const PlayerAnalytics: React.FC<{ clubId: string | null; visibleSquads: any[]; coachSquadIds: string[] | null; players: any[]; archetype?: string; season: Season | null; from: string; to: string; squadFilter: string; posFilter: string; posSpecific: string; sortBy: SortKey; setSortBy: (v: SortKey) => void; playerFocus: string; setPlayerFocus: (v: string) => void; h2hA: string; h2hB: string; setH2hA: (v: string) => void; setH2hB: (v: string) => void; shared: boolean }> = ({ clubId, visibleSquads, coachSquadIds, players, archetype, season, from, to, squadFilter, posFilter, posSpecific, sortBy, setSortBy, playerFocus, setPlayerFocus, h2hA, h2hB, setH2hA, setH2hB, shared }) => {
  const playerFilter = playerFocus, setPlayerFilter = setPlayerFocus;
  const singleSquad = visibleSquads.length === 1;
  const effSquad = singleSquad ? visibleSquads[0].id : squadFilter;
  const grouped = posFilter === 'all' && posSpecific === 'all'; // position-group headers (like Squad Management)
  const matchesRole = (pos: string) => posSpecific === 'all' || (pos || '').split(/[,/]/).map(t => t.trim().toUpperCase()).includes(posSpecific.toUpperCase());

  const filter = { squadIds: coachSquadIds, squadFilter: effSquad, from, to, season };
  const sid = season?.id || 'all';
  const { data: matchAgg, isLoading: maLoading } = useQuery({ queryKey: ['pma', clubId, effSquad, from, to, sid, coachSquadIds], queryFn: () => fetchPlayerMatchAggregates(clubId!, filter), enabled: !!clubId, staleTime: 120_000 });
  const { data: pillarAgg, isLoading: pmLoading } = useQuery({ queryKey: ['ppm', clubId, effSquad, playerFilter, from, to, sid, coachSquadIds], queryFn: () => fetchPlayerPillarMatrix(clubId!, { ...filter, playerFilter }), enabled: !!clubId, staleTime: 120_000 });

  const playerOpts = useMemo(() => players
    .filter(p => (effSquad === 'all' ? (!coachSquadIds || coachSquadIds.includes(p.squadId)) : p.squadId === effSquad))
    .sort((a, b) => a.name.localeCompare(b.name)), [players, effSquad, coachSquadIds]);

  const byPos = <T extends { group: string; position: string; name: string }>(rows: T[]) => rows
    .filter(r => (posFilter === 'all' || r.group === posFilter) && matchesRole(r.position))
    .sort((a, b) => (posGroupOrder(a.position) - posGroupOrder(b.position)) || a.name.localeCompare(b.name));

  const scopeLabel = singleSquad ? visibleSquads[0].name : (effSquad !== 'all' ? (visibleSquads.find(s => s.id === effSquad)?.name || 'Squad') : (coachSquadIds ? 'All my squads' : 'All squads'));
  const filterBar = (
    <div className="no-print flex flex-wrap items-center gap-2 mb-4">
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"><i className="fas fa-people-group text-brand" /> {scopeLabel}
        {posFilter !== 'all' && <span className="text-slate-400 font-normal">· {(POS_FILTERS.find(p => p[0] === posFilter) || [, posFilter])[1]}</span>}
        {posSpecific !== 'all' && <span className="text-slate-400 font-normal">· {posSpecific}</span>}
      </span>
    </div>
  );

  const matchRows = byPos(matchAgg || []);
  const pillarRows = byPos(pillarAgg || []);

  return (
    <div className="space-y-4">
      {filterBar}

      <CollapsibleSection title="Squad Match Stats" subtitle="From match reports — appearances, minutes, goals, cards, ratings & MOTM">
        <div className="flex items-center justify-between gap-2 mb-3">
          {shared ? <CsvButton onClick={() => downloadCsv('squad-match-stats', ['Player', 'Pos', 'Apps', 'Starts', 'Minutes', '%Season', '%Squad', 'Goals', 'Assists', 'G+A', 'Yellow', 'Red', 'Rating', 'MOTM', 'CleanSheets', 'Saves'], sortMatch(matchRows, sortBy, grouped).map(p => [p.name, p.position, p.apps, p.starts, p.totalMinutes, p.pctOfSeason, p.pctOfSquad, p.goals, p.assists, p.contributions, p.yellow, p.red, p.avgRating ?? '', p.motm, p.cleanSheets, p.saves]))} /> : <span />}
          <Select compact value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)} className="w-40">{SORTS.map(([v, l]) => <option key={v} value={v}>Sort: {l}</option>)}</Select>
        </div>
        <SquadMatchStats rows={matchRows} loading={maLoading} sortBy={sortBy} grouped={grouped} />
      </CollapsibleSection>

      <CollapsibleSection title="Player Performance Matrix" subtitle="Average assessment ratings per pillar (1–5) — from full performance assessments">
        {shared && <div className="flex justify-end mb-3"><CsvButton onClick={() => downloadCsv('performance-matrix', ['Player', 'Pos', 'Tactical', 'Technical', 'Physical', 'Psychological', 'Global', 'Assessments'], pillarRows.map(p => [p.name, p.position, p.tactical ?? '', p.technical ?? '', p.physical ?? '', p.psychological ?? '', p.globalAvg ?? '', p.count]))} /></div>}
        <PerformanceMatrix rows={pillarRows} loading={pmLoading} grouped={grouped} />
      </CollapsibleSection>

      <CollapsibleSection title="Head-to-Head" subtitle="Compare two players across all match stats (career)">
        <HeadToHead players={playerOpts} a={h2hA} b={h2hB} setA={setH2hA} setB={setH2hB} />
      </CollapsibleSection>

      {archetype !== 'private_coaching' && (
        <CollapsibleSection title="Attendance Tracker" subtitle="Training sessions attended per player">
          <AttendanceTracker clubId={clubId} coachSquadIds={coachSquadIds} players={players} squadFilter={effSquad} playerFilter={playerFilter} posFilter={posFilter} season={season} from={from} to={to} shared={shared} />
        </CollapsibleSection>
      )}

      {playerOpts.length > 0 && (
        <div className="no-print flex items-center gap-2 text-sm">
          <span className="text-slate-500">Focus player (matrix &amp; attendance):</span>
          <Select value={playerFilter} onChange={e => setPlayerFilter(e.target.value)} className="w-56"><option value="all">All players</option>{playerOpts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        </div>
      )}
    </div>
  );
};

const sortMatch = (rows: PlayerMatchAgg[], sortBy: SortKey, grouped: boolean) => {
  const cmp = (a: PlayerMatchAgg, b: PlayerMatchAgg) => {
    if (grouped) { const g = posGroupOrder(a.position) - posGroupOrder(b.position); if (g) return g; }
    switch (sortBy) {
      case 'goals': return b.goals - a.goals || b.motm - a.motm;
      case 'assists': return b.assists - a.assists || b.goals - a.goals;
      case 'contributions': return b.contributions - a.contributions || b.goals - a.goals;
      case 'apps': return b.apps - a.apps || b.contributions - a.contributions;
      case 'rating': return (b.avgRating || 0) - (a.avgRating || 0) || b.apps - a.apps;
      case 'minutes': return b.totalMinutes - a.totalMinutes || b.apps - a.apps;
      case 'cleansheets': return b.cleanSheets - a.cleanSheets || b.apps - a.apps;
      default: return b.motm - a.motm || b.goals - a.goals;
    }
  };
  return [...rows].sort(cmp);
};

const emptyRow = (msg: string, cols: number) => <tr><td colSpan={cols} className="px-3 py-10 text-center text-slate-400 text-sm">{msg}</td></tr>;
const GroupHeader: React.FC<{ label: string; cols: number }> = ({ label, cols }) => (
  <tr className="bg-slate-50 dark:bg-sentinel-bg"><td colSpan={cols} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500"><i className="fas fa-layer-group mr-1.5 opacity-50" />{label}</td></tr>
);
const PlayerCell: React.FC<{ id: string; name: string; position?: string; rank?: number }> = ({ id, name, position, rank }) => (
  <td className={td + ' whitespace-nowrap'}>
    <div className="flex items-center gap-2.5">
      {rank != null && <span className="text-xs font-bold text-slate-400 w-4 text-right">{rank}</span>}
      <span className="w-7 h-7 rounded-full bg-gradient-to-br from-brand to-[#007a62] text-white flex items-center justify-center text-[10px] font-bold shrink-0">{initials(name)}</span>
      <Link to={`/players/${id}`} className="font-medium text-slate-900 dark:text-white hover:text-brand no-underline">{name}</Link>
      {position && <span className="text-[11px] text-slate-400">{position}</span>}
    </div>
  </td>
);

const SquadMatchStats: React.FC<{ rows: PlayerMatchAgg[]; loading: boolean; sortBy: SortKey; grouped: boolean }> = ({ rows, loading, sortBy, grouped }) => {
  const sorted = useMemo(() => sortMatch(rows, sortBy, grouped), [rows, sortBy, grouped]);
  const COLS = 13;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[860px]">
        <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-sentinel-border">
          <th className={th}>Player</th><th className={th}>Pos</th><th className={th + ' text-center'}>Apps</th><th className={th + ' text-center'}>Starts</th><th className={th + ' text-center'} title="Minutes played / season minutes">Min</th><th className={th + ' text-center'} title="% of season minutes">%Sea</th><th className={th + ' text-center'} title="% of squad minutes">%Sqd</th><th className={th + ' text-center'}>G</th><th className={th + ' text-center'}>A</th><th className={th + ' text-center'}>G+A</th><th className={th + ' text-center'}>YC/RC</th><th className={th + ' text-center'}>Rtg</th><th className={th + ' text-center'}>MOTM</th>
        </tr></thead>
        <tbody>
          {loading ? emptyRow('Loading…', COLS) : sorted.length === 0 ? emptyRow('No players found.', COLS) : (() => {
            let lastG: string | null = null; let rank = 0; const out: React.ReactNode[] = [];
            sorted.forEach(p => {
              if (grouped && p.group !== lastG) { out.push(<GroupHeader key={'g' + p.group} label={posGroupLabel(p.group)} cols={COLS} />); lastG = p.group; }
              rank++; const isGK = p.group === 'GK';
              out.push(
                <tr key={p.id} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5">
                  <PlayerCell id={p.id} name={p.name} rank={rank} />
                  <td className={td + ' text-slate-400 text-xs'}>{p.position}</td>
                  <td className={td + ' text-center font-semibold'}>{p.apps}</td>
                  <td className={td + ' text-center text-slate-500 dark:text-slate-400'}>{p.starts}</td>
                  <td className={td + ' text-center text-slate-500 dark:text-slate-400 tabular-nums'}>{p.totalMinutes}/{p.seasonMinutes}</td>
                  <td className={td + ' text-center text-sky-600 dark:text-sky-400 tabular-nums'}>{p.pctOfSeason}%</td>
                  <td className={td + ' text-center text-indigo-500 tabular-nums'}>{p.pctOfSquad}%</td>
                  {isGK ? <td className={td + ' text-center font-semibold text-emerald-600 dark:text-emerald-400'} colSpan={3}><i className="fas fa-shield-halved mr-1" />{p.cleanSheets} CS · {p.saves} sv</td>
                    : <><td className={td + ' text-center font-semibold text-emerald-600 dark:text-emerald-400'}>{p.goals}</td><td className={td + ' text-center font-semibold text-violet-500'}>{p.assists}</td><td className={td + ' text-center font-bold text-orange-500'}>{p.contributions}</td></>}
                  <td className={td + ' text-center tabular-nums'}><span className={p.yellow ? 'text-amber-500' : 'text-slate-300'}>{p.yellow}</span> / <span className={p.red ? 'text-rose-500' : 'text-slate-300'}>{p.red}</span></td>
                  <td className={td + ' text-center font-semibold ' + ratingColor(p.avgRating)}>{p.avgRating ?? '—'}</td>
                  <td className={td + ' text-center'}>{p.motm > 0 ? <span className="inline-flex items-center gap-0.5 font-bold text-amber-400"><Star size={11} className="fill-amber-400" />{p.motm}</span> : <span className="text-slate-300">0</span>}</td>
                </tr>
              );
            });
            return out;
          })()}
        </tbody>
      </table>
    </div>
  );
};

const PILLARS: [keyof PlayerPillarAgg, string, string, string][] = [['tactical', 'Tactical', 'text-indigo-500', 'bg-indigo-500'], ['technical', 'Technical', 'text-sky-500', 'bg-sky-500'], ['physical', 'Physical', 'text-emerald-500', 'bg-emerald-500'], ['psychological', 'Psychological', 'text-amber-500', 'bg-amber-500']];
const PerformanceMatrix: React.FC<{ rows: PlayerPillarAgg[]; loading: boolean; grouped: boolean }> = ({ rows, loading, grouped }) => {
  const [detail, setDetail] = useState<PlayerPillarAgg | null>(null);
  const withData = rows.filter(r => r.count > 0).length;
  const COLS = 7;
  return (
    <>
      <div className="text-xs text-slate-400 mb-2">{rows.length} players · {withData} with assessments</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[620px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-sentinel-border"><th className={th}>Player</th><th className={th}>Pos</th>{PILLARS.map(([k, l, c]) => <th key={k as string} className={th + ' text-center ' + c}>{l}</th>)}<th className={th + ' text-center'}>Avg</th></tr></thead>
          <tbody>
            {loading ? emptyRow('Loading…', COLS) : rows.length === 0 ? emptyRow('No players found.', COLS) : (() => {
              let lastG: string | null = null; const out: React.ReactNode[] = [];
              rows.forEach(p => {
                if (grouped && p.group !== lastG) { out.push(<GroupHeader key={'g' + p.group} label={posGroupLabel(p.group)} cols={COLS} />); lastG = p.group; }
                out.push(
                  <tr key={p.id} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5">
                    <PlayerCell id={p.id} name={p.name} />
                    <td className={td + ' text-slate-400 text-xs'}>{p.position}</td>
                    {PILLARS.map(([k, , c]) => { const v = p[k] as number | null; return <td key={k as string} className={td + ' text-center font-semibold ' + (v != null ? c : 'text-slate-300')}>{v != null ? v.toFixed(1) : '—'}</td>; })}
                    <td className={td + ' text-center'}>{p.globalAvg != null ? <button onClick={() => setDetail(p)} className={'font-bold underline decoration-dotted underline-offset-2 hover:text-brand ' + ratingColor(p.globalAvg)}>{p.globalAvg.toFixed(1)}</button> : <span className="text-slate-300">—</span>}</td>
                  </tr>
                );
              });
              return out;
            })()}
          </tbody>
        </table>
      </div>
      {detail && (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-sentinel-surface rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4"><div><h3 className="font-bold text-slate-900 dark:text-white">{detail.name}</h3><span className="text-xs text-slate-400">{detail.count} assessment{detail.count === 1 ? '' : 's'} · Global {detail.globalAvg?.toFixed(1)}/5</span></div><button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            {PILLARS.map(([k, l, c, bg]) => { const v = detail[k] as number | null; const w = v != null ? Math.round(v / 5 * 100) : 0; return (
              <div key={k as string} className="flex items-center gap-3 mb-2.5">
                <span className={'w-28 text-xs font-semibold ' + c}>{l}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden"><div className={'h-full rounded-full ' + bg} style={{ width: `${w}%` }} /></div>
                <span className={'text-sm font-bold w-8 text-right ' + (v != null ? '' : 'text-slate-300')}>{v != null ? v.toFixed(1) : '—'}</span>
              </div>
            ); })}
          </div>
        </div>
      )}
    </>
  );
};

const H2H_STATS: [keyof CompareAgg, string, boolean?][] = [['apps', 'Appearances'], ['starts', 'Starts'], ['minutes', 'Minutes'], ['goals', 'Goals'], ['assists', 'Assists'], ['per90Goals', 'Goals / 90'], ['per90Assists', 'Assists / 90'], ['avgRating', 'Avg Rating'], ['motm', 'MOTM'], ['yellow', 'Yellow', true], ['red', 'Red', true]];
const HeadToHead: React.FC<{ players: any[]; a: string; b: string; setA: (v: string) => void; setB: (v: string) => void }> = ({ players, a, b, setA, setB }) => {
  const enabled = !!a && !!b && a !== b;
  const { data, isFetching } = useQuery({ queryKey: ['h2h', a, b], queryFn: () => fetchPlayerCompare(a, b), enabled });
  const nameA = players.find(p => p.id === a)?.name || 'Player A';
  const nameB = players.find(p => p.id === b)?.name || 'Player B';
  return (
    <div>
      <div className="flex items-end gap-3 flex-wrap mb-4">
        <div className="flex-1 min-w-[160px]"><label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Player A</label><Select value={a} onChange={e => setA(e.target.value)}><option value="">Select…</option>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
        <span className="pb-2 font-extrabold text-slate-400">VS</span>
        <div className="flex-1 min-w-[160px]"><label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Player B</label><Select value={b} onChange={e => setB(e.target.value)}><option value="">Select…</option>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
      </div>
      {!enabled ? (
        <div className="text-center text-slate-400 text-sm py-8"><Scale size={26} className="mx-auto mb-2 opacity-40" />{a && a === b ? 'Pick two different players.' : 'Select two players to compare.'}</div>
      ) : isFetching || !data ? <div className="text-center text-slate-400 text-sm py-8"><i className="fas fa-circle-notch fa-spin" /> Comparing…</div> : (
        <div>
          <div className="flex justify-between mb-3 px-1"><span className="font-bold text-sky-500 text-sm">{nameA}</span><span className="font-bold text-orange-500 text-sm">{nameB}</span></div>
          {H2H_STATS.map(([k, label, lowerBetter]) => {
            const va = data.a[k] as number, vb = data.b[k] as number; const max = Math.max(va, vb, 1);
            const aWin = lowerBetter ? va < vb : va > vb; const bWin = lowerBetter ? vb < va : vb > va;
            return (
              <div key={k as string} className="mb-2.5">
                <div className="flex justify-between items-center mb-1 text-sm"><span className={'font-bold tabular-nums w-14 ' + (aWin ? 'text-sky-500' : 'text-slate-400')}>{va}</span><span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span><span className={'font-bold tabular-nums w-14 text-right ' + (bWin ? 'text-orange-500' : 'text-slate-400')}>{vb}</span></div>
                <div className="flex gap-1 h-2"><div className="flex-1 flex justify-end"><div className="rounded-l-full" style={{ width: `${va / max * 100}%`, minWidth: 4, background: aWin ? '#0ea5e9' : '#cbd5e1' }} /></div><div className="flex-1"><div className="rounded-r-full" style={{ width: `${vb / max * 100}%`, minWidth: 4, background: bWin ? '#f97316' : '#cbd5e1' }} /></div></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const AttendanceTracker: React.FC<{ clubId: string | null; coachSquadIds: string[] | null; players: any[]; squadFilter: string; playerFilter: string; posFilter: string; season: Season | null; from: string; to: string; shared: boolean }> = ({ clubId, coachSquadIds, players, squadFilter, playerFilter, posFilter, season, from, to, shared }) => {
  const { data: attRecords, isLoading } = useQuery({ queryKey: ['attRecords', clubId, coachSquadIds], queryFn: () => fetchAttendanceRecords(clubId, coachSquadIds), enabled: !!clubId, staleTime: 120_000 });
  const rows = useMemo(() => {
    const recs = (attRecords || []).filter(r => isInSeason(null, r.date, season) && (!from || (r.date || '') >= from) && (!to || (r.date || '') <= to));
    return players
      .filter(p => (squadFilter === 'all' ? (!coachSquadIds || coachSquadIds.includes(p.squadId)) : p.squadId === squadFilter))
      .filter(p => playerFilter === 'all' || p.id === playerFilter)
      .filter(p => posFilter === 'all' || positionGroup(p.position) === posFilter)
      .map(p => { const sr = recs.filter(r => r.squadId === p.squadId); const total = sr.length; const attended = sr.filter(r => !r.absentPlayerIds.includes(p.id)).length; return { id: p.id, name: p.name, position: p.position || '—', total, attended, missed: total - attended, pct: total ? Math.round(attended / total * 100) : 0 }; })
      .filter(r => r.total > 0)
      .sort((a, b) => b.pct - a.pct);
  }, [attRecords, players, squadFilter, playerFilter, posFilter, coachSquadIds, season, from, to]);
  if (isLoading) return <div className="text-center text-slate-400 text-sm py-4"><i className="fas fa-circle-notch fa-spin" /> Loading…</div>;
  if (!rows.length) return <div className="text-center text-slate-400 text-sm py-4">No training attendance recorded for this selection.</div>;
  return (
    <div className="overflow-x-auto">
      {shared && <div className="flex justify-end mb-3"><CsvButton onClick={() => downloadCsv('player-attendance', ['Player', 'Position', 'Sessions', 'Attended', 'Missed', '%'], rows.map(p => [p.name, p.position, p.total, p.attended, p.missed, p.pct]))} /></div>}
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-sentinel-border"><th className={th}>Player</th><th className={th + ' text-center'}>Sessions</th><th className={th + ' text-center'}>Attended</th><th className={th + ' text-center'}>Missed</th><th className={th + ' w-1/3'}>Attendance</th></tr></thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.id} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5">
              <PlayerCell id={p.id} name={p.name} position={p.position} />
              <td className={td + ' text-center text-slate-500 dark:text-slate-400'}>{p.total}</td>
              <td className={td + ' text-center font-semibold text-emerald-600 dark:text-emerald-400'}>{p.attended}</td>
              <td className={td + ' text-center text-rose-500'}>{p.missed || '—'}</td>
              <td className={td}><div className="flex items-center gap-2"><div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden"><div className={'h-full rounded-full ' + pctBar(p.pct)} style={{ width: `${p.pct}%` }} /></div><span className={'text-xs font-bold tabular-nums w-9 text-right ' + pctColor(p.pct)}>{p.pct}%</span></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Analytics is a Pro feature — gate the whole page so direct navigation (not just the hidden
// nav item) respects the tier. Shows the branded upgrade card below Pro.
export const AnalyticsPage: React.FC = () => (
  <TierGate feature="analytics" label="Analytics" description="Team & player analytics, the performance matrix and head-to-head comparisons are available on the Pro and Elite plans.">
    <AnalyticsInner />
  </TierGate>
);
