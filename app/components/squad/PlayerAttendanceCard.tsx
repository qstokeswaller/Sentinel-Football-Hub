import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserCheck } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { useCoachScope } from '../../hooks/useCoachScope';
import { fetchAttendanceRecords } from '../../services/attendanceService';

/**
 * Per-player training attendance summary — aggregated from the session registry
 * (training_attendance). Shows this player's attendance rate across their squad's sessions.
 */
export const PlayerAttendanceCard: React.FC<{ playerId: string; squadId: string | null }> = ({ playerId, squadId }) => {
  const { effectiveClubId } = useAppState();
  const { coachSquadIds } = useCoachScope();
  const { data: records } = useQuery({
    queryKey: ['attendanceRecords', effectiveClubId, coachSquadIds],
    queryFn: () => fetchAttendanceRecords(effectiveClubId, coachSquadIds),
    enabled: !!effectiveClubId, staleTime: 2 * 60_000,
  });
  const stats = useMemo(() => {
    const recs = (records || []).filter(r => r.squadId === squadId);
    const total = recs.length;
    const attended = recs.filter(r => !r.absentPlayerIds.includes(playerId)).length;
    return { total, attended, absent: total - attended, pct: total ? Math.round((attended / total) * 100) : 0 };
  }, [records, squadId, playerId]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface p-5">
      <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><UserCheck size={16} className="text-brand" /> Training Attendance</h3>
      {stats.total === 0 ? (
        <p className="text-sm text-slate-400">No training sessions recorded yet for this player.</p>
      ) : (
        <>
          <div className="flex items-end justify-between mb-2 gap-3">
            <div><div className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">{stats.pct}%</div><div className="text-xs text-slate-400">attendance rate</div></div>
            <div className="text-right text-xs text-slate-500 dark:text-slate-400">
              <span className="text-emerald-500 font-semibold">{stats.attended}</span> present · <span className="text-rose-500 font-semibold">{stats.absent}</span> absent · {stats.total} session{stats.total === 1 ? '' : 's'}
            </div>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden"><div className="h-full bg-brand rounded-full" style={{ width: stats.pct + '%' }} /></div>
        </>
      )}
    </div>
  );
};
