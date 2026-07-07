import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchPlayerDossier } from '../services/dossierService';
import { downloadPlayerDossierPdf } from '../lib/dossierPdf';
import { PublicShareShell, ShareDownloadButton } from '../components/public/PublicShareShell';
import { PlayerDossierView, type DossierData } from '../components/public/PlayerDossierView';

/**
 * Public player dossier — reached via ?token=<uuid> (share link), no auth. Always light
 * mode (public share page). Renders the shared, real-profile-style dossier view.
 */
export const PlayerDossierPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const { data, isLoading, error } = useQuery({
    queryKey: ['player-dossier', token],
    queryFn: () => fetchPlayerDossier(token),
    enabled: !!token,
    retry: false,
  });

  if (!token) return <Centered>Invalid dossier link.</Centered>;
  if (isLoading) return <Centered><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mb-3" />Loading dossier…</Centered>;
  if (error || !data?.player) return <Centered>This dossier link is invalid or has expired.</Centered>;

  const { player, squad, club } = data;
  const squadLabel = [squad?.name, squad?.age_group].filter(Boolean).join(' · ');
  const view: DossierData = {
    player: {
      name: player.name, position: player.position, jersey_number: player.jersey_number,
      photo: player.profile_image_url, player_status: player.player_status,
      date_of_birth: player.date_of_birth, nationality: player.nationality, foot: player.foot,
      height: player.height, weight: player.weight, bio: player.bio, previous_clubs: player.previous_clubs,
    },
    stats: data.match_stats || [],
    assessments: data.assessments || (data.latest_assessment ? [data.latest_assessment] : []),
    seasonMatches: data.season_matches || 0,
    media: data.media || { gallery: [], highlights: [] },
    squadLabel,
  };

  return (
    <PublicShareShell club={club} label="Player Dossier" action={<ShareDownloadButton onClick={() => downloadPlayerDossierPdf(data)} />}>
      <PlayerDossierView data={view} />
    </PublicShareShell>
  );
};

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-slate-50 text-slate-500 flex flex-col items-center justify-center text-center px-6">{children}</div>
);
