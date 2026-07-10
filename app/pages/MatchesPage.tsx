import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trophy, MapPin, Calendar, ClipboardList, ChevronRight, MoreVertical, Flag, Share2 } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Select, Input } from '../components/ui/Input';
import { DatePicker } from '../components/ui/DatePicker';
import { PillTabs } from '../components/ui/PillTabs';
import { PageToolbar } from '../components/ui/PageToolbar';
import { MatchRowsSkeleton } from '../components/ui/Skeleton';
import { useToast } from '../context/ToastContext';
import { useAppState } from '../context/AppStateContext';
import { usePermissions } from '../hooks/usePermissions';
import { useMatches } from '../hooks/useMatches';
import { useMatchPlans } from '../hooks/useMatchPlans';
import { useSquads } from '../hooks/useSquads';
import { deleteMatch, resultOutcome, copyFixturesShareLink, type Match } from '../services/matchService';
import { MatchFormModal } from '../components/matches/MatchFormModal';

/**
 * Matches — Group E, increment 1. Fixtures (upcoming) + Results (played) tabs with
 * CRUD. Match-plan (formation/XI), match-details (stats), match-analysis (video)
 * are follow-on pages.
 */
// Result lives in the SCORE chip's colour only (green win / grey draw / red loss) — no extra tags.
const SCORE_STYLE: Record<string, string> = {
  W: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  D: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
  L: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
};

const MenuItem: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
  <button onClick={onClick} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
    <span className="text-slate-400">{icon}</span>{label}
  </button>
);

export const MatchesPage: React.FC = () => {
  const { canEdit } = usePermissions();
  const { effectiveClubId } = useAppState();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: matches, isLoading } = useMatches();
  const { data: squads } = useSquads();
  const { data: plans } = useMatchPlans();

  const [tab, setTab] = useState<'fixtures' | 'results' | 'planning'>('fixtures');
  const [modalOpen, setModalOpen] = useState(false);
  const [editMatch, setEditMatch] = useState<Match | null>(null);
  const [confirmDel, setConfirmDel] = useState<Match | null>(null);

  const squadNameOf = (sid: string | null) => (sid && squads?.find(s => s.id === sid)?.name) || '';
  const [menuId, setMenuId] = useState<string | null>(null);
  // Filters (fixtures/results) — team + date range, also used to scope the share link.
  const [teamFilter, setTeamFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const shareFixtures = async () => {
    if (!effectiveClubId) return;
    try { await copyFixturesShareLink(effectiveClubId, { from: fromDate || undefined, to: toDate || undefined, squadId: teamFilter !== 'all' ? teamFilter : undefined }); showToast('Fixtures link copied — share it anywhere.', 'success'); }
    catch (e) { showError(e); }
  };
  // Plans linked to a match (coach-scoped via useMatchPlans) → matchId → planId.
  const planByMatch = useMemo(() => { const out: Record<string, string> = {}; (plans || []).forEach(p => { if (p.matchId) out[p.matchId] = p.id; }); return out; }, [plans]);

  const squadName = useMemo(() => Object.fromEntries((squads || []).map(s => [s.id, s.name])), [squads]);

  // Fixtures: soonest first (the next match at the top). Results: most recent first.
  // Both split same-day matches by kickoff time so a busy match-day reads in order.
  const key = (m: Match) => `${m.date || ''} ${m.time || '99:99'}`;
  const fixtures = useMemo(() => (matches || []).filter(m => !m.isPast).sort((a, b) => key(a).localeCompare(key(b))), [matches]);
  const results = useMemo(() => (matches || []).filter(m => m.isPast).sort((a, b) => key(b).localeCompare(key(a))), [matches]);
  const planKey = (p: any) => p.data?.match?.date || (p.updatedAt ? String(p.updatedAt).slice(0, 10) : '');
  const sortedPlans = useMemo(() => [...(plans || [])].sort((a, b) => planKey(b).localeCompare(planKey(a))), [plans]);
  const list = tab === 'fixtures' ? fixtures : results;
  const filteredList = useMemo(() => list.filter(m => {
    if (teamFilter !== 'all' && m.squadId !== teamFilter) return false;
    if (fromDate && (m.date || '') < fromDate) return false;
    if (toDate && (m.date || '') > toDate) return false;
    return true;
  }), [list, teamFilter, fromDate, toDate]);
  const hasFilter = teamFilter !== 'all' || !!fromDate || !!toDate;

  const delMutation = useMutation({
    mutationFn: (m: Match) => deleteMatch(m.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['matches'] }); showToast('Match deleted.', 'success'); setConfirmDel(null); },
    onError: (e) => showError(e),
  });
  const openAdd = () => { setEditMatch(null); setModalOpen(true); };

  const card = 'rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface';

  return (
    <div>
      <PageToolbar
        title="Matches"
        description="Fixtures and results."
        dataTour="matches-main"
        left={<PillTabs value={tab} onChange={t => setTab(t as typeof tab)} tabs={[
          { id: 'fixtures', label: 'Fixtures', count: fixtures.length },
          { id: 'results', label: 'Results', count: results.length },
          { id: 'planning', label: 'Match Planning', count: plans?.length ?? 0 },
        ]} />}
      >
        {tab === 'planning' ? (
          canEdit && <Button variant="primary" onClick={() => navigate('/match-plan')}><Plus size={16} /> New Plan</Button>
        ) : (
          <>
            <Select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="w-40"><option value="all">All Teams</option>{(squads || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400"><span>From</span><DatePicker value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-36" /></label>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400"><span>To</span><DatePicker value={toDate} onChange={e => setToDate(e.target.value)} className="w-36" /></label>
            {hasFilter && <button onClick={() => { setTeamFilter('all'); setFromDate(''); setToDate(''); }} className="text-xs text-slate-400 hover:text-brand">Clear</button>}
            <Button variant="secondary" onClick={shareFixtures}><Share2 size={15} /> Share {tab === 'results' ? 'Results' : 'Fixtures'}</Button>
            {canEdit && <Button variant="primary" onClick={openAdd}><Plus size={16} /> Add Match</Button>}
          </>
        )}
      </PageToolbar>

      {tab === 'planning' ? (
        !plans?.length ? (
          <div className="py-16 text-center text-slate-400"><ClipboardList size={28} className="mx-auto mb-3 opacity-60" />No match plans yet.{canEdit && <div className="mt-3"><Button variant="primary" onClick={() => navigate('/match-plan')}><Plus size={16} /> New Plan</Button></div>}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sortedPlans.map(p => (
              <div key={p.id} className={`${card} p-4 flex items-start gap-3 transition-all duration-150 hover:border-brand hover:shadow-md hover:-translate-y-0.5`}>
                <button onClick={() => navigate(`/match-plan/${p.id}`)} className="flex items-start gap-3 flex-1 min-w-0 text-left">
                  <div className="w-10 h-10 rounded-lg bg-brand/15 text-brand flex items-center justify-center shrink-0"><ClipboardList size={18} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white truncate">{p.title}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap gap-x-2">
                      {squadNameOf(p.squadId) && <span>{squadNameOf(p.squadId)}</span>}
                      {p.data?.match?.opponent && <span>vs {p.data.match.opponent}</span>}
                      <span>· {new Date(p.updatedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-300 dark:text-slate-600 shrink-0 mt-1" />
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          {isLoading ? (
            <MatchRowsSkeleton rows={6} />
          ) : !filteredList.length ? (
            <div className="py-16 text-center text-slate-400">
              <Trophy size={28} className="mx-auto mb-3 opacity-60" />
              {hasFilter ? `No ${tab} match your filter.` : `No ${tab} yet.`}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredList.map(m => {
            const outcome = resultOutcome(m);
            const ourHome = m.ourSide !== 'away';
            const ourTeam = (m.squadId && squadName[m.squadId]) || 'Our Team';
            const opp = m.opponent || 'TBD';
            const homeName = ourHome ? ourTeam : opp;
            const awayName = ourHome ? opp : ourTeam;
            const isResult = m.isPast && m.homeScore != null;
            const monthDay = m.date ? new Date(m.date + 'T12:00:00') : null;
            const planId = planByMatch[m.id];
            return (
              <div key={m.id} className={`${card} group cursor-pointer transition-all duration-150 hover:border-brand hover:shadow-md`}>
                <div className="p-4 flex items-center gap-3" onClick={() => navigate(`/matches/${m.id}`)}>
                  <div className="grid grid-cols-[3.5rem_1fr] sm:grid-cols-[4rem_1fr_10.5rem] items-center gap-3 sm:gap-5 flex-1 min-w-0">
                    {/* Left — date + league */}
                    <div className="text-center shrink-0">
                      <div className="text-[11px] font-semibold uppercase text-slate-400">{monthDay ? monthDay.toLocaleDateString('en-ZA', { month: 'short' }) : ''}</div>
                      <div className="text-2xl font-extrabold text-slate-900 dark:text-white leading-none">{monthDay ? monthDay.getDate() : '—'}</div>
                      {m.competition && <div className="text-[10px] text-slate-400 mt-1 truncate max-w-[4rem] mx-auto">{m.competition}</div>}
                    </div>
                    {/* Centre — classic fixture: home left, away right; our team bold; result via score-chip colour. */}
                    <div className="min-w-0">
                      <div className="flex items-center justify-center gap-2 sm:gap-3">
                        <span className={'flex-1 text-right text-sm leading-tight truncate ' + (ourHome ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-600 dark:text-slate-300')}>{homeName}</span>
                        {isResult ? (
                          <span className={'shrink-0 w-14 text-center rounded-md px-2 py-1 text-base font-extrabold tabular-nums ' + (outcome ? SCORE_STYLE[outcome] : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-200')}>{m.homeScore} - {m.awayScore}</span>
                        ) : (
                          <span className="shrink-0 w-14 text-center rounded-md bg-slate-100 dark:bg-white/5 text-slate-400 px-2 py-1 text-[11px] font-bold tracking-wider">VS</span>
                        )}
                        <span className={'flex-1 text-left text-sm leading-tight truncate ' + (!ourHome ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-600 dark:text-slate-300')}>{awayName}</span>
                      </div>
                      {m.matchType === 'player_watch' && <div className="flex justify-center mt-1.5"><span className="text-[10px] font-bold uppercase rounded bg-violet-500/15 text-violet-500 px-1.5 py-0.5">Player Watch</span></div>}
                    </div>
                    {/* Right — time + venue */}
                    <div className="hidden sm:flex flex-col items-end gap-0.5 text-xs text-slate-500 dark:text-slate-400 shrink-0">
                      {m.time && <span className="inline-flex items-center gap-1"><Calendar size={12} />{m.time}</span>}
                      {m.venue && <span className="inline-flex items-center gap-1 max-w-[10rem] truncate"><MapPin size={12} />{m.venue}</span>}
                    </div>
                  </div>
                  {/* Inline shortcut — recording the result is the most common fixture action (icon-only on mobile) */}
                  {canEdit && !isResult && (
                    <button onClick={e => { e.stopPropagation(); setEditMatch({ ...m, status: 'result', isPast: true } as Match); setModalOpen(true); }} title="Enter result"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-sentinel-border px-2.5 py-1 text-xs font-semibold text-slate-500 hover:border-brand hover:text-brand hover:bg-brand/5 transition-colors shrink-0">
                      <Flag size={13} /> <span className="hidden md:inline">Enter result</span>
                    </button>
                  )}
                  {/* Actions — a compact ⋯ menu (opens the hub actions without leaving the list) */}
                  {canEdit && (
                    <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setMenuId(menuId === m.id ? null : m.id)} title="Actions" className="p-1.5 rounded text-slate-400 hover:text-brand hover:bg-brand/10"><MoreVertical size={18} /></button>
                      {menuId === m.id && (
                        <>
                          <div className="fixed inset-0 z-20" onClick={() => setMenuId(null)} />
                          <div className="absolute right-0 top-full mt-1 z-30 w-52 rounded-lg border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface shadow-xl py-1 fh-zoom-in">
                            <MenuItem icon={<ChevronRight size={15} />} label="Open match" onClick={() => { setMenuId(null); navigate(`/matches/${m.id}`); }} />
                            <MenuItem icon={<Pencil size={15} />} label="Edit details" onClick={() => { setMenuId(null); setEditMatch(m); setModalOpen(true); }} />
                            {isResult && <MenuItem icon={<Flag size={15} />} label="Edit result" onClick={() => { setMenuId(null); setEditMatch(m); setModalOpen(true); }} />}
                            <MenuItem icon={<ClipboardList size={15} />} label={planId ? 'View match plan' : 'Create match plan'} onClick={() => { setMenuId(null); navigate(planId ? `/match-plan/${planId}` : `/match-plan?fixture=${m.id}`); }} />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <ChevronRight size={18} className="text-slate-300 dark:text-slate-600 shrink-0 group-hover:text-brand transition-colors" />
                </div>
              </div>
            );
          })}
            </div>
          )}
        </>
      )}

      {/* Delete lives inside the edit form (destructive) — routes back here to the confirm modal so it can't be hit by accident. */}
      <MatchFormModal open={modalOpen} onClose={() => setModalOpen(false)} match={editMatch} onDelete={(m) => { setModalOpen(false); setConfirmDel(m); }} />

      {confirmDel && (
        <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title={`Delete match vs ${confirmDel.opponent}?`} size="sm"
          footer={<>
            <Button variant="ghost" onClick={() => setConfirmDel(null)}>Cancel</Button>
            <Button variant="destructive" disabled={delMutation.isPending} onClick={() => delMutation.mutate(confirmDel)}>{delMutation.isPending ? 'Deleting…' : 'Delete'}</Button>
          </>}>
          <p className="text-sm text-slate-500 dark:text-slate-400">This permanently removes the match and its stats.</p>
        </Modal>
      )}
    </div>
  );
};
