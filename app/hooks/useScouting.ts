import { useQuery } from '@tanstack/react-query';
import { useAppState } from '../context/AppStateContext';
import { fetchScoutedPlayers, type ScoutedPlayer } from '../services/scoutService';

/** Scouted players (+ latest verdict) for the effective club. */
export function useScoutedPlayers() {
  const { effectiveClubId } = useAppState();
  return useQuery<ScoutedPlayer[]>({
    queryKey: ['scouted', effectiveClubId],
    queryFn: () => fetchScoutedPlayers(effectiveClubId),
    enabled: !!effectiveClubId,
    staleTime: 2 * 60_000,
  });
}
