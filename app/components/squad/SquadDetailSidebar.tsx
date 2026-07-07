import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, Pencil, Trash2, ChartBar, Trophy, Images, ExternalLink } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { useMatches } from '../../hooks/useMatches';
import { resultOutcome, type Match } from '../../services/matchService';
import { fetchPlayerLeaderboard } from '../../services/matchStatsService';
import type { Squad, Player } from '../../services/squadService';
import { Button } from '../ui/Button';

/** Right-hand sidebar on the squad roster view — Details / Season Snapshot / Top Performers / Squad Media. */
const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={'rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface overflow-hidden ' + (className || '')}>{children}</div>
);
const CardHead: React.FC<{ icon: React.ReactNode; title: string; action?: React.ReactNode }> = ({ icon, title, action }) => (
  <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 dark:border-white/5">
    <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">{icon}{title}</span>
    {action}
  </div>
);

const FORM_DOT: Record<string, string> = { W: 'bg-emerald-500', D: 'bg-amber-500', L: 'bg-rose-500' };

export const SquadDetailSidebar: React.FC<{
  squad: Squad; roster: Player[]; isAdmin: boolean; canEdit: boolean;
  onAssess: () => void; onEdit: () => void; onDelete: () => void; onMedia: () => void;
}> = ({ squad, roster, isAdmin, canEdit, onAssess, onEdit, onDelete, onMedia }) => {
  const { effectiveClubId } = useAppState();
  const { data: allMatches } = useMatches();
  const { data: leaderboard } = useQuery({ queryKey: ['playerLeaderboard', effectiveClubId], queryFn: () => fetchPlayerLeaderboard(effectiveClubId!), enabled: !!effectiveClubId, staleTime: 2 * 60_000 });

  const pastMatches = useMemo(() => (allMatches || [])
    .filter((m: Match) => m.squadId === squad.id && m.isPast)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')), [allMatches, squad.id]);
  const forms = pastMatches.map(resultOutcome).filter(Boolean) as string[];
  const wins = forms.filter(f => f === 'W').length, draws = forms.filter(f => f === 'D').length, losses = forms.filter(f => f === 'L').length;
  const total = forms.length;
  const winRate = total ? Math.round((wins / total) * 100) : 0;

  const rosterIds = useMemo(() => new Set(roster.map(p => p.id)), [roster]);
  const performers = (leaderboard || []).filter(r => rosterIds.has(r.playerId) && (r.goals || r.assists)).slice(0, 3);
  const medals = ['🥇', '🥈', '🥉'];

  const media = Array.isArray(squad.media) ? squad.media : [];
  const photos = media.filter((m: any) => m.type === 'photo');
  const videos = media.filter((m: any) => m.type === 'video');
  const mediaSummary = [photos.length ? `${photos.length} photo${photos.length !== 1 ? 's' : ''}` : '', videos.length ? `${videos.length} video${videos.length !== 1 ? 's' : ''}` : ''].filter(Boolean).join(', ') || 'No media yet';

  const staff = Array.isArray(squad.coaches) ? squad.coaches : [];
  const leagues = Array.isArray(squad.leagues) ? squad.leagues : [];

  return (
    <div className="space-y-4">
      {/* Details */}
      <Card>
        <CardHead icon={<i className="fas fa-shield-alt text-brand" />} title={squad.name}
          action={squad.ageGroup ? <span className="text-[10px] font-semibold rounded-full bg-slate-100 dark:bg-white/5 text-slate-500 px-2 py-0.5">{squad.ageGroup}</span> : undefined} />
        <div className="px-4 py-3 space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 pt-0.5">Staff</span>
            <div className="text-right">
              {staff.length ? <div className="flex flex-wrap justify-end gap-1">{staff.map((c: string, i: number) => <span key={i} className="text-[11px] rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 px-2 py-0.5"><i className="fas fa-user-tie mr-1" />{c}</span>)}</div>
                : <span className="text-sm text-slate-400 italic">No staff assigned</span>}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">League(s)</span>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{leagues.length ? leagues.join(', ') : '--'}</span>
          </div>
          {squad.leagueTableUrl && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">League Table</span>
              <a href={squad.leagueTableUrl} target="_blank" rel="noreferrer" className="text-xs text-brand inline-flex items-center gap-1 no-underline">View table <ExternalLink size={11} /></a>
            </div>
          )}
          {squad.notes && <div className="mt-1 p-2.5 rounded-lg bg-slate-50 dark:bg-white/5 border-l-2 border-brand text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{squad.notes}</div>}
        </div>
        {canEdit && (
          <div className="px-4 py-3 border-t border-slate-100 dark:border-white/5 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onAssess}><ClipboardCheck size={14} /> Assess Squad</Button>
            <Button variant="ghost" size="sm" onClick={onEdit}><Pencil size={14} /> Edit</Button>
            {isAdmin && <Button variant="ghost" size="sm" onClick={onDelete} className="text-rose-500 hover:bg-rose-500/10"><Trash2 size={14} /> Delete</Button>}
          </div>
        )}
      </Card>

      {/* Season Snapshot */}
      <Card>
        <CardHead icon={<ChartBar size={15} className="text-indigo-500" />} title="Season Snapshot"
          action={<Link to="/analytics" className="text-xs font-semibold text-brand no-underline">Team Analytics →</Link>} />
        <div className="px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Last 5 Form</div>
          <div className="flex gap-1.5 mb-3">
            {Array.from({ length: 5 }).map((_, i) => {
              const f = forms[i];
              return <span key={i} className={'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold text-white ' + (f ? FORM_DOT[f] : 'bg-slate-200 dark:bg-white/10')}>{f || ''}</span>;
            })}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-slate-50 dark:bg-white/5 py-2 text-center"><div className="text-xl font-extrabold text-emerald-500">{wins}</div><div className="text-[10px] font-semibold text-slate-400">Wins</div></div>
            <div className="rounded-lg bg-slate-50 dark:bg-white/5 py-2 text-center"><div className="text-xl font-extrabold text-amber-500">{draws}</div><div className="text-[10px] font-semibold text-slate-400">Draws</div></div>
            <div className="rounded-lg bg-slate-50 dark:bg-white/5 py-2 text-center"><div className="text-xl font-extrabold text-rose-500">{losses}</div><div className="text-[10px] font-semibold text-slate-400">Losses</div></div>
          </div>
          {total > 0 ? (
            <div className="mt-2.5 flex items-center justify-between text-xs"><span className="text-slate-400">Win Rate</span><span className="font-semibold text-slate-700 dark:text-slate-200">{winRate}% · {total} played</span></div>
          ) : <div className="mt-2 text-center text-xs text-slate-400">No match data yet.</div>}
        </div>
      </Card>

      {/* Top Performers */}
      <Card>
        <CardHead icon={<Trophy size={15} className="text-amber-500" />} title="Top Performers"
          action={<Link to="/analytics" className="text-xs font-semibold text-brand no-underline">Player Analytics →</Link>} />
        <div className="px-4 py-3">
          {performers.length ? performers.map((p, i) => (
            <div key={p.playerId} className="flex items-center gap-2 py-1.5 border-b border-slate-50 dark:border-white/5 last:border-0">
              <span className="w-5 text-center">{medals[i]}</span>
              <Link to={`/players/${p.playerId}`} className="flex-1 min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100 truncate no-underline hover:text-brand">{p.name}</Link>
              <span className="text-[11px] font-bold rounded px-1.5 py-0.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">{p.goals}G</span>
              <span className="text-[11px] font-bold rounded px-1.5 py-0.5 bg-violet-500/15 text-violet-500">{p.assists}A</span>
            </div>
          )) : <div className="text-center text-xs text-slate-400 py-3">No match data yet.</div>}
        </div>
      </Card>

      {/* Squad Media */}
      <button type="button" onClick={onMedia} className="block w-full text-left">
        <Card className="hover:border-brand hover:shadow-sm transition-all">
          <CardHead icon={<Images size={15} className="text-brand" />} title="Squad Media" action={<span className="text-[11px] text-slate-400 italic">Click to open</span>} />
          <div className="px-4 py-3">
            {photos.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mb-2">
                {photos.slice(0, 4).map((p: any, i: number) => (
                  <div key={i} className="relative w-12 h-12 rounded-lg overflow-hidden border border-slate-200 dark:border-sentinel-border shrink-0">
                    <img src={p.url} alt="" className="w-full h-full object-cover" />
                    {i === 3 && photos.length > 4 && <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-[11px] font-bold text-white">+{photos.length - 3}</div>}
                  </div>
                ))}
              </div>
            )}
            <div className="text-xs text-slate-500 dark:text-slate-400">{mediaSummary}</div>
          </div>
        </Card>
      </button>
    </div>
  );
};
