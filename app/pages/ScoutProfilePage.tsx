import React, { useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Share2, Pencil, Plus, Film } from 'lucide-react';
import { useScoutedPlayers } from '../hooks/useScouting';
import { usePermissions } from '../hooks/usePermissions';
import { useToast } from '../context/ToastContext';
import { fetchScoutReports, fetchScoutVideos, deleteScoutReport, deleteScoutedPlayer, type ScoutedPlayer } from '../services/scoutService';
import { copyScoutShareLink } from '../services/shareService';
import { PageSkeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { ScoutProfileView, type ScoutProfile } from '../components/scouting/ScoutProfileView';
import { ScoutFormModal } from '../components/scouting/ScoutFormModal';
import { ScoutReportFormModal } from '../components/scouting/ScoutReportFormModal';
import { ScoutVideosModal } from '../components/scouting/ScoutVideosModal';

/**
 * Scouted-player PROFILE page (/scouting/:id) — a real route (not a modal). Shows the shared
 * ScoutProfileView (identity + overall radar + per-scout reports + video) with actions to add a
 * quick/in-depth report, manage video, share a branded link, and edit/delete the player.
 */
export const ScoutProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canAccessScouting } = usePermissions();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();

  const { data: players, isLoading: playersLoading } = useScoutedPlayers();
  const player = useMemo(() => (players || []).find(p => p.id === id) || null, [players, id]);

  const { data: reports } = useQuery({ queryKey: ['scoutReports', id], queryFn: () => fetchScoutReports(id!), enabled: !!id });
  const { data: videos } = useQuery({ queryKey: ['scout-videos', id], queryFn: () => fetchScoutVideos(id!), enabled: !!id });

  const [editOpen, setEditOpen] = useState(false);
  const [addType, setAddType] = useState<null | 'quick' | 'full'>(null);
  const [videosOpen, setVideosOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const delReport = useMutation({
    mutationFn: (rid: string) => deleteScoutReport(rid),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['scoutReports', id] }); queryClient.invalidateQueries({ queryKey: ['scouted'] }); showToast('Report deleted.', 'success'); },
    onError: (e) => showError(e),
  });

  const delPlayer = useMutation({
    mutationFn: () => deleteScoutedPlayer(player!.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['scouted'] }); showToast('Scouted player removed.', 'success'); navigate('/scouting'); },
    onError: (e) => showError(e),
  });

  const share = async () => {
    if (!player) return;
    try { await copyScoutShareLink(player.id, player.share_token); queryClient.invalidateQueries({ queryKey: ['scouted'] }); showToast('Branded scout report link copied — reports, ratings & video.', 'success'); }
    catch (e) { showError(e); }
  };

  const profileData: ScoutProfile | null = useMemo(() => player ? {
    player: { name: player.name, position: player.position, current_club: player.current_club || player.current_team, age: player.age, foot: player.foot, agent_name: player.agent_name, scouting_status: player.scouting_status, notes: player.notes, photo: player.photo_url },
    reports: (reports || []).map(r => ({ id: r.id, report_type: r.report_type, verdict: r.verdict, match_context: r.match_context, date: r.date, global_average: r.global_average, ratings: r.ratings, feedback: r.feedback, author: r.scout_name || 'Scout', created_by: r.created_by, created_at: r.created_at })),
    videos: (videos || []).map(v => ({ id: v.id, title: v.title, url: v.url, created_by: v.created_by })),
  } : null, [player, reports, videos]);

  if (playersLoading) return <PageSkeleton variant="detail" />;
  if (!player || !profileData) return <div className="py-20 text-center text-slate-400">Scouted player not found. <Link to="/scouting" className="text-brand">Back to Scouting</Link></div>;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <Link to="/scouting" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand no-underline"><ArrowLeft size={15} /> Back to Scouting</Link>
        <div className="flex items-center gap-2 flex-wrap">
          {canAccessScouting && <Button variant="secondary" onClick={() => setAddType('quick')}><Plus size={15} /> Quick Report</Button>}
          {canAccessScouting && <Button variant="primary" onClick={() => setAddType('full')}><Plus size={15} /> In-depth Report</Button>}
          {canAccessScouting && <button onClick={() => setVideosOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-sentinel-border px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-brand"><Film size={15} /> Videos</button>}
          {canAccessScouting && <button onClick={() => setEditOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-sentinel-border px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-brand"><Pencil size={15} /> Edit</button>}
          <button onClick={share} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-sentinel-border px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-brand"><Share2 size={15} /> Share</button>
        </div>
      </div>

      <ScoutProfileView data={profileData} onDeleteReport={canAccessScouting ? (rid) => delReport.mutate(rid) : undefined} />

      <ScoutFormModal open={editOpen} onClose={() => setEditOpen(false)} player={player} onDelete={() => { setEditOpen(false); setConfirmDel(true); }} />
      {addType && <ScoutReportFormModal open onClose={() => setAddType(null)} player={player} type={addType} />}
      {videosOpen && <ScoutVideosModal open onClose={() => setVideosOpen(false)} playerId={player.id} playerName={player.name} />}
      {confirmDel && (
        <ConfirmModal open onClose={() => setConfirmDel(false)} onConfirm={() => delPlayer.mutate()}
          title={`Remove ${player.name}?`} message="This deletes the scouted player and their reports." confirmLabel="Remove" busyLabel="Removing…" busy={delPlayer.isPending} />
      )}
    </div>
  );
};
