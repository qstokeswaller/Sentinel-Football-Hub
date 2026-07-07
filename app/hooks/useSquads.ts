import { useQuery } from '@tanstack/react-query';
import { useAppState } from '../context/AppStateContext';
import { useCoachScope } from './useCoachScope';
import { fetchSquads, fetchPlayers, fetchPlayer, type Squad, type Player } from '../services/squadService';

/** Squads for the effective club, scoped to a coach's assigned squads (admins see all). */
export function useSquads() {
  const { effectiveClubId } = useAppState();
  const { coachSquadIds, scopeReady } = useCoachScope();
  return useQuery<Squad[]>({
    queryKey: ['squads', effectiveClubId, coachSquadIds],
    queryFn: () => fetchSquads(effectiveClubId, coachSquadIds),
    enabled: !!effectiveClubId && scopeReady,
    staleTime: 2 * 60_000,
  });
}

/** Players for the effective club, scoped to a coach's assigned squads. */
export function usePlayers() {
  const { effectiveClubId } = useAppState();
  const { coachSquadIds, scopeReady } = useCoachScope();
  return useQuery<Player[]>({
    queryKey: ['players', effectiveClubId, coachSquadIds],
    queryFn: () => fetchPlayers(effectiveClubId, coachSquadIds),
    enabled: !!effectiveClubId && scopeReady,
    staleTime: 2 * 60_000,
  });
}

/** A single player by id (full row). */
export function usePlayer(id: string | undefined) {
  return useQuery<Player | null>({
    queryKey: ['player', id],
    queryFn: () => fetchPlayer(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}
