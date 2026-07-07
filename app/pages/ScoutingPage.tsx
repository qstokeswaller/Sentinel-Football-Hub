import React, { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Binoculars, FileText, Film, UserPlus } from 'lucide-react';
import { Select } from '../components/ui/Input';
import { SmartSearch } from '../components/ui/SmartSearch';
import { GridSkeleton } from '../components/ui/Skeleton';
import { fuzzyFilter } from '../lib/fuzzy';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useToast } from '../context/ToastContext';
import { useAppState } from '../context/AppStateContext';
import { usePermissions } from '../hooks/usePermissions';
import { useScoutedPlayers } from '../hooks/useScouting';
import { useSquads } from '../hooks/useSquads';
import { deleteScoutedPlayer, promoteScoutedToSquad, type ScoutedPlayer } from '../services/scoutService';
import { SCOUTING_VERDICTS } from '../lib/scoutingConstants';
import { ScoutFormModal } from '../components/scouting/ScoutFormModal';
import { ScoutVideosModal } from '../components/scouting/ScoutVideosModal';
import { ScoutReportsModal } from '../components/scouting/ScoutReportsModal';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';

/**
 * Scouting — Group F, increment 2. Scouted-player pipeline (cards + verdict badge,
 * filters, CRUD). Scout reports (quick-report attributes), video (R2), and
 * promote-to-squad are follow-on increments.
 */
const initials = (n: string) => (n || '?').split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);

export const ScoutingPage: React.FC = () => {
  const { canAccessScouting } = usePermissions();
  const { showToast, showError } = useToast();
  const { effectiveClubId } = useAppState();
  const queryClient = useQueryClient();
  const { data: players, isLoading } = useScoutedPlayers();
  const { data: squads } = useSquads();

  const [search, setSearch] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editPlayer, setEditPlayer] = useState<ScoutedPlayer | null>(null);
  const [confirmDel, setConfirmDel] = useState<ScoutedPlayer | null>(null);
  const [videoPlayer, setVideoPlayer] = useState<ScoutedPlayer | null>(null);
  const [reportsPlayer, setReportsPlayer] = useState<ScoutedPlayer | null>(null);
  const [promotePlayer, setPromotePlayer] = useState<ScoutedPlayer | null>(null);
  const [promoteSquad, setPromoteSquad] = useState('');

  const promoteMutation = useMutation({
    mutationFn: () => promoteScoutedToSquad(effectiveClubId!, promotePlayer!, promoteSquad || null),
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ['scouted'] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
      showToast(`${promotePlayer?.name} promoted to the squad.`, 'success');
      setPromotePlayer(null); setPromoteSquad('');
      window.location.assign(`/players/${newId}`);
    },
    onError: (e) => showError(e),
  });

  const visible = useMemo(() => {
    let list = players || [];
    if (verdictFilter === 'unevaluated') list = list.filter(p => !p._latestVerdict);
    else if (verdictFilter !== 'all') list = list.filter(p => p._latestVerdict === verdictFilter);
    // Typo-tolerant fuzzy search across name/position/club/nationality/agent.
    return fuzzyFilter(search, list, p => [p.name, p.position, p.current_club, p.nationality, p.agent_name]);
  }, [players, verdictFilter, search]);

  // Autocomplete corpus — scouted player names + distinct positions.
  const searchCorpus = useMemo(() => {
    const out: { value: string; kind: 'name' | 'position' }[] = [];
    const seenPos = new Set<string>();
    (players || []).forEach(p => {
      if (p.name) out.push({ value: p.name, kind: 'name' });
      if (p.position) { const k = p.position.toLowerCase(); if (!seenPos.has(k)) { seenPos.add(k); out.push({ value: p.position, kind: 'position' }); } }
    });
    return out;
  }, [players]);

  const delMutation = useMutation({
    mutationFn: (p: ScoutedPlayer) => deleteScoutedPlayer(p.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['scouted'] }); showToast('Scouted player removed.', 'success'); setConfirmDel(null); },
    onError: (e) => showError(e),
  });

  const card = 'rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface';

  return (
    <div>
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 data-tour="scouting-main" className="text-2xl font-bold text-slate-900 dark:text-white">Scouting</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Your scouting pipeline.</p>
        </div>
        {canAccessScouting && (
          <Button variant="primary" onClick={() => { setEditPlayer(null); setModalOpen(true); }}><Plus size={16} /> Add Player</Button>
        )}
      </header>

      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={verdictFilter} onChange={e => setVerdictFilter(e.target.value)} className="sm:w-52 shrink-0">
          <option value="all">All verdicts</option>
          <option value="unevaluated">Unevaluated</option>
          {Object.entries(SCOUTING_VERDICTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <SmartSearch value={search} onChange={setSearch} corpus={searchCorpus} placeholder="Search scouted players… (name, position)" />
      </div>

      {isLoading ? (
        <GridSkeleton count={6} cols="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" />
      ) : !visible.length ? (
        <div className="py-16 text-center text-slate-400">
          <Binoculars size={28} className="mx-auto mb-3 opacity-60" />
          {players?.length ? 'No players match your filter.' : 'No scouted players yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map(p => {
            const verdict = p._latestVerdict ? SCOUTING_VERDICTS[p._latestVerdict] : null;
            return (
              <div key={p.id} className={`${card} p-5`}>
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-full bg-brand/15 text-brand flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden">
                    {p.profile_image_url ? <img src={p.profile_image_url} alt={p.name} className="w-full h-full object-cover" /> : initials(p.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white truncate">{p.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{p.position || '—'}{p.age ? ` · ${p.age}y` : ''}</div>
                  </div>
                  {canAccessScouting && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setReportsPlayer(p)} title="Scout reports" className="p-1.5 rounded text-slate-400 hover:text-brand hover:bg-brand/10"><FileText size={14} /></button>
                      <button onClick={() => setVideoPlayer(p)} title="Videos" className="p-1.5 rounded text-slate-400 hover:text-brand hover:bg-brand/10"><Film size={14} /></button>
                      <button onClick={() => { setPromotePlayer(p); setPromoteSquad(''); }} title="Promote to squad" className="p-1.5 rounded text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10"><UserPlus size={14} /></button>
                      <button onClick={() => { setEditPlayer(p); setModalOpen(true); }} title="Edit" className="p-1.5 rounded text-slate-400 hover:text-brand hover:bg-brand/10"><Pencil size={14} /></button>
                      <button onClick={() => setConfirmDel(p)} title="Delete" className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  {verdict
                    ? <span className="text-xs font-semibold rounded-full px-2.5 py-1" style={{ background: verdict.bg, color: verdict.color }}>{verdict.label}</span>
                    : <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-slate-100 dark:bg-white/5 text-slate-400">Unevaluated</span>}
                  <button onClick={() => setReportsPlayer(p)} className="text-xs text-slate-400 hover:text-brand flex items-center gap-1"><FileText size={12} />{p._reportCount} report{p._reportCount === 1 ? '' : 's'}</button>
                </div>
                {(p.current_club || p.agent_name) && (
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 truncate">
                    {p.current_club && <span>{p.current_club}</span>}{p.current_club && p.agent_name && ' · '}{p.agent_name && <span>Agent: {p.agent_name}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ScoutFormModal open={modalOpen} onClose={() => setModalOpen(false)} player={editPlayer} />
      {videoPlayer && <ScoutVideosModal open={!!videoPlayer} onClose={() => setVideoPlayer(null)} playerId={videoPlayer.id} playerName={videoPlayer.name} />}
      {reportsPlayer && <ScoutReportsModal open={!!reportsPlayer} onClose={() => setReportsPlayer(null)} playerId={reportsPlayer.id} playerName={reportsPlayer.name} canEdit={canAccessScouting} />}

      {confirmDel && (
        <ConfirmModal open onClose={() => setConfirmDel(null)} onConfirm={() => delMutation.mutate(confirmDel)}
          title={`Remove ${confirmDel.name}?`} message="This deletes the scouted player and their reports." confirmLabel="Remove" busyLabel="Removing…" busy={delMutation.isPending} />
      )}

      {promotePlayer && (
        <Modal open onClose={() => setPromotePlayer(null)} title={`Promote ${promotePlayer.name} to a squad`} size="sm"
          footer={<>
            <Button variant="ghost" onClick={() => setPromotePlayer(null)}>Cancel</Button>
            <Button variant="primary" disabled={promoteMutation.isPending} onClick={() => promoteMutation.mutate()}><UserPlus size={15} /> {promoteMutation.isPending ? 'Promoting…' : 'Promote'}</Button>
          </>}>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Creates a squad player from this scouted profile (name, position, nationality) and marks them as <b>signed</b>. You can flesh out the rest on their new profile.</p>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Assign to squad</label>
          <Select value={promoteSquad} onChange={e => setPromoteSquad(e.target.value)}><option value="">— Unassigned —</option>{(squads || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        </Modal>
      )}
    </div>
  );
};
