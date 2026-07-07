import { useQuery } from '@tanstack/react-query';
import { useAppState } from '../context/AppStateContext';
import { fetchLibrarySessions, fetchLibraryDrills, type LibSession, type LibDrill } from '../services/libraryService';

export function useLibrarySessions() {
  const { effectiveClubId } = useAppState();
  return useQuery<LibSession[]>({
    queryKey: ['lib-sessions', effectiveClubId],
    queryFn: () => fetchLibrarySessions(effectiveClubId),
    enabled: !!effectiveClubId,
    staleTime: 2 * 60_000,
  });
}

export function useLibraryDrills() {
  const { effectiveClubId } = useAppState();
  return useQuery<LibDrill[]>({
    queryKey: ['lib-drills', effectiveClubId],
    queryFn: () => fetchLibraryDrills(effectiveClubId),
    enabled: !!effectiveClubId,
    staleTime: 2 * 60_000,
  });
}
