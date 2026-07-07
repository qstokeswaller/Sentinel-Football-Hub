import { useQuery } from '@tanstack/react-query';
import { useAppState } from '../context/AppStateContext';
import { fetchReports, type Report } from '../services/reportService';

/** Session reflection reports for the effective club. */
export function useReports() {
  const { effectiveClubId } = useAppState();
  return useQuery<Report[]>({
    queryKey: ['reports', effectiveClubId],
    queryFn: () => fetchReports(effectiveClubId),
    enabled: !!effectiveClubId,
    staleTime: 2 * 60_000,
  });
}
