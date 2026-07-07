import { useQuery } from '@tanstack/react-query';
import { useAppState } from '../context/AppStateContext';
import { useCoachScope } from './useCoachScope';
import { fetchCalendarItems, type CalendarItems } from '../services/calendarService';

/**
 * Calendar items for the effective club, scoped to a coach's assigned squads.
 * Fetches the 3-back/6-forward window once and caches it; the month grid filters client-side.
 */
export function useCalendar() {
  const { effectiveClubId, profile, role } = useAppState();
  const { coachSquadIds, scopeReady } = useCoachScope();
  const isAdmin = role === 'admin' || role === 'super_admin';
  const userId = profile?.id ?? null;
  return useQuery<CalendarItems>({
    queryKey: ['calendar', effectiveClubId, userId, isAdmin, coachSquadIds],
    queryFn: () => fetchCalendarItems(effectiveClubId, { userId, isAdmin, coachSquadIds }),
    enabled: !!effectiveClubId && scopeReady,
    staleTime: 2 * 60_000,
  });
}
