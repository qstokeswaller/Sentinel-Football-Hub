import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchScoutDossier } from '../services/dossierService';
import { PublicShareShell, ShareDownloadButton } from '../components/public/PublicShareShell';
import { ScoutProfileView, type ScoutProfile } from '../components/scouting/ScoutProfileView';

/**
 * Public scout dossier — reached via ?token=<uuid> (share link), no auth. Branded, always
 * light mode. Renders the exact same profile view used in-app (header, overall rating + radar,
 * per-scout reports and video). "Print / PDF" uses the shell's print stylesheet.
 */
export const ScoutDossierPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const { data, isLoading, error } = useQuery({
    queryKey: ['scout-dossier', token],
    queryFn: () => fetchScoutDossier(token),
    enabled: !!token,
    retry: false,
  });

  if (!token) return <Centered>Invalid share link.</Centered>;
  if (isLoading) return <Centered><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mb-3" />Loading scout report…</Centered>;
  if (error || !data?.player) return <Centered>This scout report link is invalid or has expired.</Centered>;

  const view: ScoutProfile = { player: data.player, reports: data.reports || [], videos: data.videos || [] };

  return (
    <PublicShareShell club={data.club} label="Scout Report" action={<ShareDownloadButton onClick={() => window.print()} label="Print / PDF" />}>
      <ScoutProfileView data={view} />
    </PublicShareShell>
  );
};

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-slate-50 text-slate-500 flex flex-col items-center justify-center text-center px-6">{children}</div>
);
