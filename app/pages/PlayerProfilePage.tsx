import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Share2 } from 'lucide-react';
import { usePlayer, useSquads } from '../hooks/useSquads';
import { deletePlayer, playerAge } from '../services/squadService';
import { usePermissions } from '../hooks/usePermissions';
import { useAppState } from '../context/AppStateContext';
import { useToast } from '../context/ToastContext';
import { copyDossierLink } from '../services/shareService';
import { PageSkeleton } from '../components/ui/Skeleton';
import { TierGate } from '../components/tier/TierGate';
import { PlayerStatusSelect } from '../components/squad/PlayerStatusSelect';
import { PlayerDetailsForm } from '../components/squad/PlayerDetailsForm';
import { PlayerStats } from '../components/squad/PlayerStats';
import { PlayerMediaTab } from '../components/squad/PlayerMediaTab';
import { PlayerReportsTab } from '../components/squad/PlayerReportsTab';
import { PlayerAnalysisTab } from '../components/squad/PlayerAnalysisTab';
import { AssignSquadModal } from '../components/squad/AssignSquadModal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Select } from '../components/ui/Input';
import { PillTabs } from '../components/ui/PillTabs';

/**
 * Player profile — five tabs mirroring the old vanilla page: Details / Stats /
 * Media / Reports / Analysis. Responsive tabs (dropdown on mobile, bar on desktop).
 * Status changes live in the header; Delete + Assign Squad live in the Details tab.
 */
const initials = (n: string) => n.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
type Tab = 'details' | 'stats' | 'media' | 'reports' | 'analysis';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'details', label: 'Details', icon: 'fa-id-card' },
  { id: 'stats', label: 'Stats', icon: 'fa-chart-bar' },
  { id: 'media', label: 'Media', icon: 'fa-image' },
  { id: 'reports', label: 'Reports', icon: 'fa-clipboard-list' },
  { id: 'analysis', label: 'Analysis', icon: 'fa-video' },
];

export const PlayerProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { canEdit, isSuperAdmin, isPlatformAdmin, role } = usePermissions();
  const isAdmin = role === 'admin' || isSuperAdmin || isPlatformAdmin;
  const { effectiveClubId } = useAppState();
  const { data: player, isLoading } = usePlayer(id);
  const { data: squads } = useSquads();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('details');
  const [sharing, setSharing] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const del = useMutation({
    mutationFn: () => deletePlayer(player!.id, effectiveClubId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['players'] }); showToast('Player deleted (restorable for 7 days).', 'success'); navigate('/squad'); },
    onError: (e) => showError(e),
  });

  const handleShare = async () => {
    if (!player) return;
    setSharing(true);
    try { await copyDossierLink('player', player.id, player.shareToken); showToast('Dossier link copied to clipboard.', 'success'); }
    catch (e) { showError(e); } finally { setSharing(false); }
  };

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (!player) return <div className="py-20 text-center text-slate-400">Player not found. <Link to="/squad" className="text-brand">Back to Squad</Link></div>;

  const squadName = squads?.find(s => s.id === player.squadId)?.name;
  const subtitle = [player.position, squadName].filter(Boolean).join(' · ');

  return (
    <div>
      <Link to="/squad" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand mb-4 no-underline"><ArrowLeft size={15} /> Back</Link>

      {/* Header */}
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        {player.profileImageUrl
          ? <img src={player.profileImageUrl} alt={player.name} className="w-12 h-12 rounded-full object-cover" />
          : <div className="w-12 h-12 rounded-full bg-brand/15 text-brand flex items-center justify-center text-lg font-bold">{initials(player.name)}</div>}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white truncate">{player.name}</h1>
          <p className="text-sm font-semibold text-brand">{subtitle || '—'}{playerAge(player) != null ? ` · ${playerAge(player)}y` : ''}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleShare} disabled={sharing} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-sentinel-border px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-brand disabled:opacity-50"><Share2 size={15} /> {sharing ? 'Sharing…' : 'Share'}</button>
          <PlayerStatusSelect playerId={player.id} value={player.playerStatus} canEdit={canEdit} size="md" />
        </div>
      </div>

      {/* Tabs — dropdown on mobile, bar on desktop (never both). */}
      <div className="sm:hidden mb-5">
        <Select value={tab} onChange={e => setTab(e.target.value as Tab)}>{TABS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</Select>
      </div>
      <div className="hidden sm:block mb-6 overflow-x-auto">
        <PillTabs value={tab} onChange={id => setTab(id as Tab)} tabs={TABS.map(t => ({ id: t.id, label: t.label, icon: <i className={`fas ${t.icon}`} /> }))} />
      </div>

      {tab === 'details' && <PlayerDetailsForm player={player} squads={squads || []} canEdit={canEdit} isAdmin={isAdmin} onDelete={() => setConfirmDel(true)} onAssign={() => setAssignOpen(true)} />}
      {tab === 'stats' && <PlayerStats playerId={player.id} squadId={player.squadId} position={player.position} />}
      {tab === 'media' && <TierGate feature="media_tabs" label="Player Media"><PlayerMediaTab player={player} canEdit={canEdit} /></TierGate>}
      {tab === 'reports' && <TierGate feature="player_reports" label="Player Reports"><PlayerReportsTab playerId={player.id} squadName={squadName} canEdit={canEdit} /></TierGate>}
      {tab === 'analysis' && <TierGate feature="media_tabs" label="Player Analysis"><PlayerAnalysisTab player={player} canEdit={canEdit} /></TierGate>}

      <AssignSquadModal open={assignOpen} onClose={() => setAssignOpen(false)} playerId={player.id} playerName={player.name} currentSquadId={player.squadId} squads={squads || []} />
      {confirmDel && (
        <ConfirmModal open onClose={() => setConfirmDel(false)} onConfirm={() => del.mutate()} busy={del.isPending}
          title={`Delete ${player.name}?`} message="This removes the player and all their data (reports, stats, media). Restorable for 7 days from Settings → Recently Deleted." confirmLabel="Delete Player" />
      )}
    </div>
  );
};
