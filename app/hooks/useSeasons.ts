import { useQuery } from '@tanstack/react-query';
import { fetchSeasons } from '../services/seasonsService';
import { useAppState } from '../context/AppStateContext';

/** Club seasons (empty until a club creates them in Settings → Seasons). Shared by analytics + profiles. */
export function useSeasons() {
  const { effectiveClubId } = useAppState();
  return useQuery({ queryKey: ['seasons', effectiveClubId], queryFn: () => fetchSeasons(effectiveClubId), enabled: !!effectiveClubId, staleTime: 300_000 });
}
