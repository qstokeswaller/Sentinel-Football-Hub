import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChartBar } from 'lucide-react';
import { PlayerMatchRecord } from './PlayerMatchRecord';
import { PlayerAttendanceCard } from './PlayerAttendanceCard';
import { Select } from '../ui/Input';
import { useSeasons } from '../../hooks/useSeasons';
import { useAppState } from '../../context/AppStateContext';
import { fetchPlayerSeasonSummary } from '../../services/analyticsService';
import { positionGroup } from '../../services/analyticsService';

/** Stats tab — season-filterable career summary (from match reports) + match history + attendance. */
const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone }) => (
  <div className="rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface p-4 text-center">
    <div className={'text-2xl font-bold tabular-nums ' + (tone || 'text-slate-900 dark:text-white')}>{value}</div>
    <div className="text-[11px] uppercase tracking-wider text-slate-400 mt-0.5">{label}</div>
  </div>
);

export const PlayerStats: React.FC<{ playerId: string; squadId: string | null; position?: string | null }> = ({ playerId, squadId, position }) => {
  const { data: seasons } = useSeasons();
  const { effectiveClubId } = useAppState();
  const [seasonId, setSeasonId] = useState('all');
  const season = useMemo(() => (seasons || []).find(s => s.id === seasonId) || null, [seasons, seasonId]);
  const { data: s } = useQuery({ queryKey: ['playerSeasonSummary', effectiveClubId, playerId, squadId, seasonId], queryFn: () => fetchPlayerSeasonSummary(effectiveClubId!, playerId, squadId, season), enabled: !!effectiveClubId, staleTime: 60_000 });
  const isGK = positionGroup(position) === 'GK';

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"><ChartBar size={18} className="text-brand" /> {season ? season.name : 'Career'} Statistics</h3>
          {(seasons || []).length > 0 && (
            <Select value={seasonId} onChange={e => setSeasonId(e.target.value)} className="w-52">
              <option value="all">All-time</option>
              {(seasons || []).map(se => <option key={se.id} value={se.id}>{se.name}{se.isCurrent ? ' (current)' : ''}</option>)}
            </Select>
          )}
        </div>

        {s && (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
            <Stat label="Apps" value={s.apps} />
            <Stat label="Starts" value={s.starts} />
            <Stat label="Minutes" value={s.minutes} />
            {s.seasonMinutes > 0 && <Stat label="% Season" value={`${s.pctOfSeason}%`} tone="text-sky-600 dark:text-sky-400" />}
            {s.squadMinutes > 0 && <Stat label="% Squad" value={`${s.pctOfSquad}%`} tone="text-indigo-500 dark:text-indigo-400" />}
            {isGK ? <>
              <Stat label="Clean Sheets" value={s.cleanSheets} tone="text-emerald-600 dark:text-emerald-400" />
              <Stat label="Saves" value={s.saves} />
            </> : <>
              <Stat label="Goals" value={s.goals} tone="text-emerald-600 dark:text-emerald-400" />
              <Stat label="Assists" value={s.assists} tone="text-violet-500" />
              <Stat label="G+A" value={s.contributions} tone="text-orange-500" />
            </>}
            <Stat label="Avg Rating" value={s.avgRating ?? '—'} />
            <Stat label="MOTM" value={s.motm} tone={s.motm ? 'text-amber-400' : undefined} />
            <Stat label="YC / RC" value={<><span className={s.yellow ? 'text-amber-500' : ''}>{s.yellow}</span> / <span className={s.red ? 'text-rose-500' : ''}>{s.red}</span></>} />
          </div>
        )}

        <PlayerMatchRecord playerId={playerId} season={season} />
      </div>
      <PlayerAttendanceCard playerId={playerId} squadId={squadId} />
    </div>
  );
};
