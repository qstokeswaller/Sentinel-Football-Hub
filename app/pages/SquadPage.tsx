import React, { useState, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Users, Shield, Plus, Pencil, Trash2, Upload, Share2, ArrowLeft, LayoutGrid, List, ChevronRight } from 'lucide-react';
import { Select } from '../components/ui/Input';
import { positionOrder } from '../services/attendanceService';
import { SmartSearch } from '../components/ui/SmartSearch';
import { PillTabs } from '../components/ui/PillTabs';
import { PageToolbar } from '../components/ui/PageToolbar';
import { GridSkeleton, TableSkeleton } from '../components/ui/Skeleton';
import { fuzzyFilter } from '../lib/fuzzy';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useAppState } from '../context/AppStateContext';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import { useSquads, usePlayers } from '../hooks/useSquads';
import { filterPlayers, deletePlayer, deleteSquad, addPlayersBulk, playerAge, fetchSquadCardData, type Player, type Squad } from '../services/squadService';
import { PlayerFormModal } from '../components/squad/PlayerFormModal';
import { SquadFormModal } from '../components/squad/SquadFormModal';
import { PlayerStatusSelect } from '../components/squad/PlayerStatusSelect';
import { SquadDetailSidebar } from '../components/squad/SquadDetailSidebar';
import { SquadAssessmentModal } from '../components/squad/SquadAssessmentModal';
import { SquadMediaModal } from '../components/squad/SquadMediaModal';
import { parseCsvPlayers } from '../lib/csvImport';
import { copyDossierLink } from '../services/shareService';
import { Button } from '../components/ui/Button';

/**
 * Squad domain. Squads tab (rich cards → View Roster only) + All Players tab.
 * Squad CRUD lives in the roster (detail) view: Edit / Delete / Assess Squad /
 * Share Squad in the right-hand sidebar; inline player-status change per row.
 * Add Squad is admin-only; coaches/squad members can add players.
 */

const initials = (name: string) => name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

export const SquadPage: React.FC = () => {
  const { archetype, effectiveClubId } = useAppState();
  const { canEdit, isSuperAdmin, isPlatformAdmin, role } = usePermissions();
  const isAdmin = role === 'admin' || isSuperAdmin || isPlatformAdmin;
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: squads, isLoading: squadsLoading } = useSquads();
  const { data: players, isLoading: playersLoading } = usePlayers();

  const [tab, setTab] = useState<'squads' | 'players'>('squads');
  const [squadFilter, setSquadFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [confirmDel, setConfirmDel] = useState<Player | null>(null);
  // Drill-in: click a squad card → that squad's roster. + squads-list filters + player view mode.
  const [viewSquad, setViewSquad] = useState<Squad | null>(null);
  const [playerView, setPlayerView] = useState<'list' | 'card'>('list');
  const [squadSearch, setSquadSearch] = useState('');
  const [ageFilter, setAgeFilter] = useState('all');
  const [leagueFilter, setLeagueFilter] = useState('all');
  // Roster sidebar modals
  const [assessOpen, setAssessOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);

  // Keep viewSquad fresh after edits (squads refetch returns a new object reference).
  const liveViewSquad = useMemo(() => viewSquad ? (squads?.find(s => s.id === viewSquad.id) || viewSquad) : null, [squads, viewSquad]);

  const delMutation = useMutation({
    mutationFn: (p: Player) => deletePlayer(p.id, effectiveClubId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['players'] }); showToast('Player deleted (restorable for 7 days).', 'success'); setConfirmDel(null); },
    onError: (e) => showError(e),
  });
  const openAdd = () => { setEditPlayer(null); setModalOpen(true); };
  const openEdit = (p: Player) => { setEditPlayer(p); setModalOpen(true); };

  const [squadModalOpen, setSquadModalOpen] = useState(false);
  const [editSquad, setEditSquad] = useState<Squad | null>(null);
  const [confirmDelSquad, setConfirmDelSquad] = useState<Squad | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const delSquadMutation = useMutation({
    mutationFn: (s: Squad) => deleteSquad(s.id, effectiveClubId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['squads'] }); showToast('Squad deleted (restorable for 7 days).', 'success'); setConfirmDelSquad(null); setViewSquad(null); },
    onError: (e) => showError(e),
  });
  const importMutation = useMutation({
    mutationFn: (rows: Record<string, any>[]) => addPlayersBulk(effectiveClubId!, rows),
    onSuccess: (n) => { queryClient.invalidateQueries({ queryKey: ['players'] }); showToast(`Imported ${n} player${n === 1 ? '' : 's'}.`, 'success'); },
    onError: (e) => showError(e),
  });
  const openAddSquad = () => { setEditSquad(null); setSquadModalOpen(true); };
  const openEditSquad = (s: Squad) => { setEditSquad(s); setSquadModalOpen(true); };
  const shareSquad = async (s: Squad) => {
    try { await copyDossierLink('squad', s.id, s.shareToken); showToast('Squad dossier link copied.', 'success'); }
    catch (e) { showError(e); }
  };
  const onCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = '';
    const text = await file.text();
    const { players: rows, error } = parseCsvPlayers(text, squadFilter === 'all' ? null : squadFilter);
    if (error) return showToast(error, 'error');
    if (!rows.length) return showToast('No players found in CSV.', 'error');
    importMutation.mutate(rows);
  };

  const title = archetype === 'private_coaching' ? 'Player Management' : 'Squad Management';
  const squadNameById = useMemo(() => Object.fromEntries((squads || []).map(s => [s.id, s.name])), [squads]);
  const playerCountBySquad = useMemo(() => {
    const m: Record<string, number> = {};
    (players || []).forEach(p => { if (p.squadId) m[p.squadId] = (m[p.squadId] || 0) + 1; });
    return m;
  }, [players]);

  // Squads-list filters (search · age group · league).
  const ageGroups = useMemo(() => [...new Set((squads || []).map(s => s.ageGroup).filter(Boolean))].sort() as string[], [squads]);
  const leagues = useMemo(() => [...new Set((squads || []).flatMap(s => Array.isArray(s.leagues) ? s.leagues : []).filter(Boolean))].sort() as string[], [squads]);
  const filteredSquads = useMemo(() => (squads || []).filter(s => {
    if (ageFilter !== 'all' && s.ageGroup !== ageFilter) return false;
    if (leagueFilter !== 'all' && !(Array.isArray(s.leagues) && s.leagues.includes(leagueFilter))) return false;
    if (squadSearch.trim() && !s.name.toLowerCase().includes(squadSearch.trim().toLowerCase())) return false;
    return true;
  }), [squads, ageFilter, leagueFilter, squadSearch]);

  // Per-squad card extras: last/next session, next match, last result, position breakdown, coach.
  const { data: cardData } = useQuery({ queryKey: ['squadCardData', effectiveClubId], queryFn: () => fetchSquadCardData(effectiveClubId), enabled: !!effectiveClubId, staleTime: 2 * 60_000 });
  const todayStr = new Date().toISOString().slice(0, 10);
  const fmtDate = (d?: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  const squadSummary = (s: Squad) => {
    const name = s.name.trim().toLowerCase();
    const sess = (cardData?.sessions || []).filter(x => (x.team || '').toLowerCase().split(',').map(t => t.trim()).includes(name));
    const past = sess.filter(x => x.date <= todayStr).sort((a, b) => b.date.localeCompare(a.date))[0];
    const next = sess.filter(x => x.date > todayStr).sort((a, b) => a.date.localeCompare(b.date))[0];
    const ms = (cardData?.matches || []).filter(x => x.squadId === s.id);
    const nextMatch = ms.filter(x => (x.date || '') >= todayStr && !x.isPast).sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
    const lastResult = ms.filter(x => x.isPast && (x.homeScore != null || x.awayScore != null)).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    const grp = { gk: 0, def: 0, mid: 0, fwd: 0 };
    (players || []).filter(p => p.squadId === s.id).forEach(p => { const o = positionOrder(p.position); if (o === 0) grp.gk++; else if (o === 1) grp.def++; else if (o === 2) grp.mid++; else if (o === 3) grp.fwd++; });
    return { past, next, nextMatch, lastResult, grp, count: playerCountBySquad[s.id] || 0, coach: cardData?.coachesBySquad?.[s.id]?.[0] || null };
  };

  // Drill-in roster, grouped by position line.
  const POS_GROUPS = [{ key: 0, label: 'Goalkeepers' }, { key: 1, label: 'Defenders' }, { key: 2, label: 'Midfielders' }, { key: 3, label: 'Forwards' }, { key: 99, label: 'Other' }];
  const squadRoster = useMemo(() => !viewSquad ? [] : (players || []).filter(p => p.squadId === viewSquad.id)
    .sort((a, b) => (positionOrder(a.position) - positionOrder(b.position)) || a.name.localeCompare(b.name)), [players, viewSquad]);
  const rosterGroups = useMemo(() => POS_GROUPS
    .map(g => ({ ...g, players: squadRoster.filter(p => { const o = positionOrder(p.position); return g.key === 99 ? o > 3 : o === g.key; }) }))
    .filter(g => g.players.length), [squadRoster]);

  // Squad filter first, then typo-tolerant fuzzy search across name/position/#/nationality.
  const visiblePlayers = useMemo(
    () => fuzzyFilter(search, filterPlayers(players || [], { squadId: squadFilter }),
      p => [p.name, p.position, String(p.jerseyNumber ?? ''), p.nationality, p.currentClub]),
    [players, squadFilter, search],
  );

  // Autocomplete corpus — player names + distinct positions.
  const searchCorpus = useMemo(() => {
    const out: { value: string; kind: 'name' | 'position' }[] = [];
    const seenPos = new Set<string>();
    (players || []).forEach(p => {
      if (p.name) out.push({ value: p.name, kind: 'name' });
      (p.position || '').split(',').map(s => s.trim()).filter(Boolean).forEach(pos => {
        const k = pos.toLowerCase(); if (!seenPos.has(k)) { seenPos.add(k); out.push({ value: pos, kind: 'position' }); }
      });
    });
    return out;
  }, [players]);

  const card = 'rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface';

  const th = 'px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-slate-400';
  const RosterRow: React.FC<{ p: Player }> = ({ p }) => (
    <tr onClick={() => navigate(`/players/${p.id}`)} className="border-t border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          {p.profileImageUrl ? <img src={p.profileImageUrl} alt={p.name} className="w-9 h-9 rounded-full object-cover shrink-0" /> : <div className="w-9 h-9 rounded-full bg-brand/15 text-brand flex items-center justify-center text-xs font-bold shrink-0">{initials(p.name)}</div>}
          <span className="font-medium text-slate-900 dark:text-white truncate">{p.jerseyNumber ? `#${p.jerseyNumber} ` : ''}{p.name}</span>
        </div>
      </td>
      <td className="px-4 text-slate-500 dark:text-slate-400">{p.position || '—'}</td>
      <td className="px-4 text-slate-500 dark:text-slate-400">{playerAge(p) ?? '—'}</td>
      <td className="px-4 text-slate-500 dark:text-slate-400">{p.foot || '—'}</td>
      <td className="px-4 py-2.5 text-right" onClick={e => e.stopPropagation()}><PlayerStatusSelect playerId={p.id} value={p.playerStatus} canEdit={canEdit} /></td>
    </tr>
  );

  return (
    <div>
      {viewSquad && liveViewSquad ? (
        <>
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <button onClick={() => setViewSquad(null)} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand"><ArrowLeft size={15} /> Back to Squads</button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => shareSquad(liveViewSquad)}><Share2 size={15} /> Share Squad</Button>
              {canEdit && <Button variant="primary" onClick={openAdd}><Plus size={16} /> Add Player</Button>}
            </div>
          </div>
          <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-brand/15 text-brand flex items-center justify-center"><Shield size={22} /></div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{liveViewSquad.name}</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">{liveViewSquad.ageGroup || 'General'} · {squadRoster.length} player{squadRoster.length === 1 ? '' : 's'}{Array.isArray(liveViewSquad.leagues) && liveViewSquad.leagues.length ? ` · ${liveViewSquad.leagues.join(', ')}` : ''}</p>
              </div>
            </div>
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-sentinel-border overflow-hidden">
              <button onClick={() => setPlayerView('list')} title="List view" className={'p-2 ' + (playerView === 'list' ? 'bg-brand text-[#0a1628]' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5')}><List size={16} /></button>
              <button onClick={() => setPlayerView('card')} title="Card view" className={'p-2 border-l border-slate-200 dark:border-sentinel-border ' + (playerView === 'card' ? 'bg-brand text-[#0a1628]' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5')}><LayoutGrid size={16} /></button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5 items-start">
            <div>
              {!squadRoster.length ? (
                <Empty icon={<Users size={28} />} text="No players in this squad yet." />
              ) : playerView === 'list' ? (
                <div className={`${card} overflow-x-auto`}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-slate-200 dark:border-sentinel-border">
                        <th className={th}>Name</th><th className={th}>Position</th><th className={th}>Age</th><th className={th}>Foot</th><th className={th + ' text-right'}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rosterGroups.map(g => (
                        <React.Fragment key={g.key}>
                          <tr className="bg-slate-50 dark:bg-sentinel-bg"><td colSpan={5} className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">{g.label} <span className="text-slate-400 ml-1">{g.players.length}</span></td></tr>
                          {g.players.map(p => <RosterRow key={p.id} p={p} />)}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {squadRoster.map(p => (
                    <div key={p.id} className={`${card} p-4 flex flex-col items-center text-center hover:border-brand hover:shadow-sm transition-all`}>
                      <Link to={`/players/${p.id}`} className="flex flex-col items-center no-underline">
                        {p.profileImageUrl ? <img src={p.profileImageUrl} alt={p.name} className="w-16 h-16 rounded-full object-cover mb-2" /> : <div className="w-16 h-16 rounded-full bg-brand/15 text-brand flex items-center justify-center text-lg font-bold mb-2">{initials(p.name)}</div>}
                        <div className="font-semibold text-slate-900 dark:text-white truncate w-full">{p.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{p.position || '—'}{p.jerseyNumber ? ` · #${p.jerseyNumber}` : ''}</div>
                      </Link>
                      <div className="mt-2"><PlayerStatusSelect playerId={p.id} value={p.playerStatus} canEdit={canEdit} /></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <SquadDetailSidebar squad={liveViewSquad} roster={squadRoster} isAdmin={isAdmin} canEdit={canEdit}
              onAssess={() => setAssessOpen(true)} onEdit={() => openEditSquad(liveViewSquad)} onDelete={() => setConfirmDelSquad(liveViewSquad)} onMedia={() => setMediaOpen(true)} />
          </div>
        </>
      ) : (
      <>
      <PageToolbar
        title={title}
        description="Manage your squads and players."
        dataTour="squad-main"
        left={<PillTabs value={tab} onChange={t => setTab(t as 'squads' | 'players')} tabs={[
          { id: 'squads', label: 'Squads', count: squads?.length ?? 0 },
          { id: 'players', label: 'All Players', count: players?.length ?? 0 },
        ]} />}
      >
        {tab === 'squads' ? (<>
          <div className="relative w-52">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
            <input value={squadSearch} onChange={e => setSquadSearch(e.target.value)} placeholder="Search squads…"
              className="w-full rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-brand" />
          </div>
          <Select value={ageFilter} onChange={e => setAgeFilter(e.target.value)} className="w-36 shrink-0">
            <option value="all">All age groups</option>
            {ageGroups.map(a => <option key={a} value={a}>{a}</option>)}
          </Select>
          <Select value={leagueFilter} onChange={e => setLeagueFilter(e.target.value)} className="w-36 shrink-0">
            <option value="all">All leagues</option>
            {leagues.map(l => <option key={l} value={l}>{l}</option>)}
          </Select>
          {isAdmin && <Button variant="primary" onClick={openAddSquad}><Plus size={16} /> Add Squad</Button>}
        </>) : (<>
          <Select value={squadFilter} onChange={e => setSquadFilter(e.target.value)} className="w-44 shrink-0">
            <option value="all">All squads</option>
            {(squads || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <div className="flex w-56"><SmartSearch value={search} onChange={setSearch} corpus={searchCorpus} placeholder="Search players… (name, position)" /></div>
          {canEdit && (<>
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={importMutation.isPending}>
              <Upload size={15} /> {importMutation.isPending ? 'Importing…' : 'Import CSV'}
            </Button>
            <Button variant="primary" onClick={openAdd}><Plus size={16} /> Add Player</Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onCsvFile} />
          </>)}
        </>)}
      </PageToolbar>

      {/* Squads tab */}
      {tab === 'squads' && (
        <>
          {squadsLoading ? (
            <GridSkeleton count={4} cols="grid-cols-1 xl:grid-cols-2" />
          ) : !filteredSquads.length ? (
            <Empty icon={<Shield size={28} />} text={squads?.length ? 'No squads match your filter.' : 'No squads yet.'} />
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {filteredSquads.map(s => {
                const sm = squadSummary(s);
                return (
                  <div key={s.id} role="button" tabIndex={0} onClick={() => setViewSquad(s)}
                    className={`${card} p-5 cursor-pointer hover:border-brand hover:shadow-sm transition-all`}>
                    <div className="flex flex-col md:flex-row md:items-stretch gap-4">
                      {/* Left — identity */}
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-11 h-11 rounded-lg bg-brand/15 text-brand flex items-center justify-center shrink-0"><Users size={20} /></div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">{s.name}</h3>
                            <span className="text-[10px] font-semibold rounded-full bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 px-2 py-0.5">{s.ageGroup || 'General'}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                            <span className="inline-flex items-center gap-1"><i className="fas fa-user-tie" />{sm.coach || 'No coach assigned'}</span>
                            {Array.isArray(s.leagues) && s.leagues.length > 0 && <span className="inline-flex items-center gap-1"><i className="fas fa-trophy" />{s.leagues.join(', ')}</span>}
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{sm.count} Player{sm.count === 1 ? '' : 's'}</div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs font-medium text-brand">
                            <span>{sm.grp.gk} GK</span><span>{sm.grp.def} DEF</span><span>{sm.grp.mid} MID</span><span>{sm.grp.fwd} FWD</span>
                          </div>
                        </div>
                      </div>
                      {/* Right — schedule */}
                      <div className="md:w-56 shrink-0 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-1.5 md:border-l border-slate-100 dark:border-white/5 md:pl-4">
                        <Stat icon="fa-clipboard-list" label="Last Session" value={sm.past ? fmtDate(sm.past.date) : '--'} />
                        <Stat icon="fa-calendar-day" label="Next Session" value={sm.next ? fmtDate(sm.next.date) : '--'} />
                        <Stat icon="fa-futbol" label="Next Match" value={sm.nextMatch ? `${fmtDate(sm.nextMatch.date)}${sm.nextMatch.opponent ? ` vs ${sm.nextMatch.opponent}` : ''}` : 'None scheduled'} />
                        <Stat icon="fa-flag-checkered" label="Last Result" value={sm.lastResult ? `${sm.lastResult.homeScore ?? 0}–${sm.lastResult.awayScore ?? 0}` : '--'} />
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-end">
                      <span className="text-xs font-semibold text-brand inline-flex items-center">View roster <ChevronRight size={14} className="ml-0.5" /></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* All Players tab */}
      {tab === 'players' && (
        <>
          {playersLoading ? (
            <TableSkeleton rows={8} cols={6} />
          ) : !visiblePlayers.length ? (
            <Empty icon={<Users size={28} />} text={players?.length ? 'No players match your filter.' : 'No players yet.'} />
          ) : (
            <div className={`${card} overflow-hidden`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-sentinel-border">
                    <th className="px-4 py-3 font-semibold">Player</th>
                    <th className="px-4 py-3 font-semibold">#</th>
                    <th className="px-4 py-3 font-semibold">Position</th>
                    <th className="px-4 py-3 font-semibold">Age</th>
                    <th className="px-4 py-3 font-semibold">Squad</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    {canEdit && <th className="px-4 py-3 font-semibold text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {visiblePlayers.map(p => (
                    <tr key={p.id} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {p.profileImageUrl
                            ? <img src={p.profileImageUrl} alt={p.name} className="w-8 h-8 rounded-full object-cover" />
                            : <div className="w-8 h-8 rounded-full bg-brand/15 text-brand flex items-center justify-center text-xs font-bold">{initials(p.name)}</div>}
                          <Link to={`/players/${p.id}`} className="font-medium text-slate-900 dark:text-white no-underline hover:text-brand">{p.name}</Link>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{p.jerseyNumber || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{p.position || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{playerAge(p) ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{p.squadId ? (squadNameById[p.squadId] || '—') : '—'}</td>
                      <td className="px-4 py-3"><PlayerStatusSelect playerId={p.id} value={p.playerStatus} canEdit={canEdit} /></td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(p)} title="Edit" className="p-1.5 rounded text-slate-400 hover:text-brand hover:bg-brand/10"><Pencil size={15} /></button>
                            {isAdmin && <button onClick={() => setConfirmDel(p)} title="Delete" className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 size={15} /></button>}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      </>
      )}

      <PlayerFormModal open={modalOpen} onClose={() => setModalOpen(false)} player={editPlayer} squads={squads || []} defaultSquadId={viewSquad?.id ?? null} />

      {confirmDel && (
        <ConfirmModal open onClose={() => setConfirmDel(null)} onConfirm={() => delMutation.mutate(confirmDel)}
          title={`Delete ${confirmDel.name}?`} message="This can be restored within 7 days from Settings → Recently Deleted." busy={delMutation.isPending} />
      )}

      <SquadFormModal open={squadModalOpen} onClose={() => setSquadModalOpen(false)} squad={editSquad} />

      {confirmDelSquad && (
        <ConfirmModal open onClose={() => setConfirmDelSquad(null)} onConfirm={() => delSquadMutation.mutate(confirmDelSquad)}
          title={`Delete ${confirmDelSquad.name}?`} message="This can be restored within 7 days from Settings → Recently Deleted." busy={delSquadMutation.isPending} />
      )}

      {liveViewSquad && <SquadAssessmentModal open={assessOpen} onClose={() => setAssessOpen(false)} squadId={liveViewSquad.id} squadName={liveViewSquad.name} />}
      {liveViewSquad && <SquadMediaModal open={mediaOpen} onClose={() => setMediaOpen(false)} squadId={liveViewSquad.id} squadName={liveViewSquad.name} media={liveViewSquad.media} canEdit={canEdit} />}
    </div>
  );
};

const Empty: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="py-16 text-center text-slate-400">
    <div className="flex justify-center mb-3 opacity-60">{icon}</div>
    {text}
  </div>
);
const Stat: React.FC<{ icon: string; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="text-xs truncate"><i className={`fas ${icon} text-slate-400 mr-1.5`} /><span className="text-slate-400">{label}: </span><span className="font-semibold text-slate-700 dark:text-slate-200">{value}</span></div>
);
