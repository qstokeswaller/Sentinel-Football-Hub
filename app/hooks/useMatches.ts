import { useQuery } from '@tanstack/react-query';
import { useAppState } from '../context/AppStateContext';
import { useCoachScope } from './useCoachScope';
import { fetchMatches, fetchMatch, type Match } from '../services/matchService';
import { fetchMatchPlayerStats, type SavedPlayerStat } from '../services/matchStatsService';

/** Matches for the effective club, scoped to a coach's assigned squads (admins see all). */
export function useMatches() {
  const { effectiveClubId } = useAppState();
  const { coachSquadIds, scopeReady } = useCoachScope();
  return useQuery<Match[]>({
    queryKey: ['matches', effectiveClubId, coachSquadIds],
    queryFn: () => fetchMatches(effectiveClubId, coachSquadIds),
    enabled: !!effectiveClubId && scopeReady,
    staleTime: 2 * 60_000,
  });
}

/** A single match by id (full row). */
export function useMatch(id: string | undefined) {
  return useQuery<Match | null>({
    queryKey: ['match', id],
    queryFn: () => fetchMatch(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}

/** Per-player stats for a match. */
export function useMatchPlayerStats(matchId: string | undefined) {
  return useQuery<SavedPlayerStat[]>({
    queryKey: ['match-stats', matchId],
    queryFn: () => fetchMatchPlayerStats(matchId!),
    enabled: !!matchId,
    staleTime: 60_000,
  });
}
