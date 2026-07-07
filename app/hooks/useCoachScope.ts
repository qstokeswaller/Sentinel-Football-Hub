import { useQuery } from '@tanstack/react-query';
import { useAppState } from '../context/AppStateContext';
import { fetchCoachSquadIds } from '../services/databaseService';

/**
 * Coach/viewer squad scoping. Admins/super-admins/dev → `null` (see everything).
 * Coaches & viewers → the array of squad_ids they're assigned to via `squad_coaches`.
 * `scopeReady` guards queries so a coach never briefly sees unscoped data while loading.
 */
export function useCoachScope() {
  const { profile } = useAppState();
  const isScoped = profile?.role === 'coach' || profile?.role === 'viewer';
  const q = useQuery({
    queryKey: ['coachSquadIds', profile?.id],
    queryFn: () => fetchCoachSquadIds(profile as any),
    enabled: !!profile && isScoped,
    staleTime: 5 * 60_000,
  });
  return {
    coachSquadIds: isScoped ? (q.data ?? null) : null,
    scopeReady: !isScoped || q.isSuccess,
  };
}
