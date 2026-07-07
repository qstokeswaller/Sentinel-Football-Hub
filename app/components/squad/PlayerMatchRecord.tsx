import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPlayerMatchStats } from '../../services/matchService';
import { isInSeason, type Season } from '../../services/seasonsService';

/** A player's match-by-match record, sourced from match_player_stats (the match-report → profile
 *  pipeline). The summary cards live in PlayerStats; this is the game log, season-filterable. */
const fmtDate = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
const resultCls = (r: string | null) => r === 'W' ? 'text-emerald-500' : r === 'L' ? 'text-rose-500' : 'text-slate-400';

export const PlayerMatchRecord: React.FC<{ playerId: string; season?: Season | null }> = ({ playerId, season = null }) => {
  const { data, isLoading, error } = useQuery({ queryKey: ['playerMatchStats', playerId], queryFn: () => fetchPlayerMatchStats(playerId), staleTime: 60_000 });
  const stats = useMemo(() => (data || []).filter(s => isInSeason(null, s.date, season)), [data, season]);

  if (isLoading) return <div className="py-10 text-center text-slate-400"><i className="fas fa-circle-notch fa-spin" /> Loading match record…</div>;
  if (error) return <div className="py-10 text-center text-rose-400 text-sm">Couldn't load match record.</div>;
  if (!stats.length) return (
    <div className="rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface p-10 text-center text-slate-400">
      {season ? `No appearances recorded in ${season.name}.` : 'No match appearances recorded yet. Player stats added on a match report will appear here.'}
    </div>
  );

  const score = (s: typeof stats[number]) => s.homeScore == null || s.awayScore == null ? '' : (s.ourSide === 'away' ? `${s.awayScore}-${s.homeScore}` : `${s.homeScore}-${s.awayScore}`);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface overflow-x-auto">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-sentinel-border">
            <th className="px-4 py-2.5 font-medium">Date</th>
            <th className="px-3 font-medium">Opponent</th>
            <th className="px-3 font-medium">Comp</th>
            <th className="px-3 font-medium">Result</th>
            <th className="px-3 font-medium text-center">Min</th>
            <th className="px-3 font-medium text-center">G</th>
            <th className="px-3 font-medium text-center">A</th>
            <th className="px-3 font-medium text-center">Rating</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s, i) => (
            <tr key={i} className="border-b border-slate-100 dark:border-sentinel-border/50 last:border-0 text-slate-700 dark:text-slate-200">
              <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(s.date)}</td>
              <td className="px-3">{s.opponent || '—'}</td>
              <td className="px-3 text-slate-400">{s.competition || '—'}</td>
              <td className="px-3 whitespace-nowrap"><span className="tabular-nums">{score(s)}</span> {s.result && <span className={'font-semibold ' + resultCls(s.result)}>{s.result}</span>}</td>
              <td className="px-3 text-center tabular-nums">{s.minutes ?? '—'}{s.started ? '' : <span className="text-slate-400 text-xs"> (sub)</span>}</td>
              <td className="px-3 text-center tabular-nums">{s.goals || 0}</td>
              <td className="px-3 text-center tabular-nums">{s.assists || 0}</td>
              <td className="px-3 text-center tabular-nums">{s.rating ?? '—'}{s.motm && <span title="Man of the Match" className="text-amber-400"> ★</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
