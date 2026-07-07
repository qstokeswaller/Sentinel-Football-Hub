import { useQuery } from '@tanstack/react-query';
import { useAppState } from '../context/AppStateContext';
import { useCoachScope } from './useCoachScope';
import { fetchMatchPlans, fetchMatchPlan, type MatchPlan } from '../services/matchPlanService';

/** Saved match plans for the effective club, coach-scoped to assigned squads. */
export function useMatchPlans() {
  const { effectiveClubId } = useAppState();
  const { coachSquadIds, scopeReady } = useCoachScope();
  return useQuery<MatchPlan[]>({
    queryKey: ['matchPlans', effectiveClubId, coachSquadIds],
    queryFn: () => fetchMatchPlans(effectiveClubId, coachSquadIds),
    enabled: !!effectiveClubId && scopeReady,
    staleTime: 60_000,
  });
}

export function useMatchPlan(id: string | undefined) {
  return useQuery<MatchPlan | null>({
    queryKey: ['matchPlan', id],
    queryFn: () => fetchMatchPlan(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}
