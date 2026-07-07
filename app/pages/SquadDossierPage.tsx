import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { fetchSquadDossier, fetchSquadPlayerDossier } from '../services/dossierService';
import { downloadSquadDossierPdf } from '../lib/dossierPdf';
import { PublicShareShell, ShareDownloadButton } from '../components/public/PublicShareShell';
import { PlayerDossierView, type DossierData } from '../components/public/PlayerDossierView';

/**
 * Public squad dossier — ?token=<uuid> (share link), no auth, light mode. Renders the roster
 * grid; clicking a player opens their in-squad dossier (get_squad_player_dossier) with a
 * "Back to squad" button — the core "browse the whole squad from one link" flow.
 */
const initials = (n: string) => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
const STATUS: Record<string, string> = { active: 'Active', injured: 'Injured', sick: 'Sick', suspended: 'Suspended', trialist: 'Trialist', unavailable: 'Unavailable' };
const STATUS_COLOR: Record<string, string> = { active: 'bg-emerald-100 text-emerald-700', injured: 'bg-rose-100 text-rose-700', suspended: 'bg-amber-100 text-amber-700', trialist: 'bg-sky-100 text-sky-700' };

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-slate-50 text-slate-500 flex flex-col items-center justify-center text-center px-6">{children}</div>
);

/** In-squad player detail — fetched by squad token + player id, rendered via the shared view. */
const SquadPlayerDetail: React.FC<{ token: string; playerId: string; squadLabel: string; onBack: () => void }> = ({ token, playerId, squadLabel, onBack }) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['squad-player-dossier', token, playerId],
    queryFn: () => fetchSquadPlayerDossier(token, playerId),
    retry: false,
  });
  if (isLoading) return <div className="py-16 text-center text-slate-400"><div className="w-7 h-7 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-3" />Loading player…</div>;
  if (error || !data?.player) return (
    <div className="py-16 text-center text-slate-400">
      Couldn’t load this player.
      <div className="mt-3"><button onClick={onBack} className="text-sm font-semibold text-brand">Back to squad</button></div>
    </div>
  );
  const p = data.player;
  const view: DossierData = {
    player: {
      name: p.full_name || p.name, position: p.position, jersey_number: p.jersey_number, photo: p.photo_url,
      player_status: p.player_status, date_of_birth: p.dob, nationality: p.nationality, foot: p.foot,
      height: p.height, weight: p.weight, bio: p.bio, previous_clubs: p.previous_clubs,
    },
    stats: data.stats || [],
    assessments: data.assessments || (data.assessment ? [data.assessment] : []),
    seasonMatches: data.season_matches || 0,
    media: data.media || { gallery: [], highlights: [] },
    squadLabel,
  };
  return <PlayerDossierView data={view} onBack={onBack} />;
};

export const SquadDossierPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['squad-dossier', token],
    queryFn: () => fetchSquadDossier(token),
    enabled: !!token,
    retry: false,
  });

  if (!token) return <Centered>Invalid dossier link.</Centered>;
  if (isLoading) return <Centered><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mb-3" />Loading squad…</Centered>;
  if (error || !data?.squad) return <Centered>This dossier link is invalid or has expired.</Centered>;

  const { squad, club, players } = data;
  // get_squad_dossier returns flat club_name/display_name/logo_url (not a nested `club`).
  const shareClub = (typeof club === 'string' ? { name: club } : club)
    || { name: data.club_name, display_name: data.display_name, logo_url: data.logo_url };
  const list = (players || []) as any[];
  const squadLabel = [squad.name, squad.age_group].filter(Boolean).join(' · ');

  return (
    <PublicShareShell club={shareClub} label="Squad Dossier" maxWidth="max-w-4xl" action={<ShareDownloadButton onClick={() => downloadSquadDossierPdf(data)} />}>
        {selected ? (
          <SquadPlayerDetail token={token} playerId={selected} squadLabel={squadLabel} onBack={() => setSelected(null)} />
        ) : (
          <>
            {/* Hero */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-5">
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <h1 className="text-2xl font-bold">{squad.name || 'Squad'}</h1>
                {squad.age_group && <span className="text-xs font-semibold rounded-full bg-brand/15 text-brand px-2.5 py-1">{squad.age_group}</span>}
              </div>
              <div className="text-sm text-slate-500 mt-1">{list.length} Player{list.length !== 1 ? 's' : ''} · tap a player to view their dossier</div>
            </div>

            {/* Roster */}
            {!list.length ? (
              <div className="py-16 text-center text-slate-400">No players in this squad.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {list.map((p, i) => {
                  const status = p.player_status || 'active';
                  // get_squad_dossier normalizes player keys: full_name / position_primary / photo_url
                  const name = p.full_name || p.name || 'Player';
                  const position = p.position_primary || p.position;
                  const photo = p.photo_url || p.profile_image_url;
                  return (
                    <button key={p.id || i} onClick={() => p.id && setSelected(p.id)}
                      className="text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-3 hover:border-brand hover:shadow-md transition group">
                      <div className="w-12 h-12 rounded-full bg-brand/15 text-brand flex items-center justify-center font-bold overflow-hidden shrink-0">
                        {photo ? <img src={photo} alt={name} className="w-full h-full object-cover" /> : initials(name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold truncate">{p.jersey_number ? <span className="text-brand">#{p.jersey_number} </span> : ''}{name}</div>
                        <div className="text-xs text-slate-500">{position || '—'}</div>
                      </div>
                      <span className={'text-[10px] font-semibold rounded-full px-2 py-0.5 shrink-0 ' + (STATUS_COLOR[status] || 'bg-slate-100 text-slate-600')}>{STATUS[status] || status}</span>
                      <ChevronRight size={16} className="text-slate-300 group-hover:text-brand shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
    </PublicShareShell>
  );
};
