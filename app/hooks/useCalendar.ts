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
    // Wait for the profile to load before firing. Toggling the dev view re-keys the profile
    // query, so for a moment `profile` is undefined (userId null); without this gate the
    // calendar fires once with the half-loaded scope, then AGAIN once the profile lands —
    // two sequential fetches that double the skeleton time. Gate on userId → one clean fetch.
    enabled: !!effectiveClubId && scopeReady && !!userId,
    staleTime: 2 * 60_000,
    // A club switch can momentarily 401/RLS-fail; the default 3× exponential backoff would
    // hold the skeleton ~7s. One quick retry surfaces data (or the empty state) fast.
    retry: 1,
  });
}
