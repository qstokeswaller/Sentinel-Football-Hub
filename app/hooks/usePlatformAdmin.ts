import { useQuery } from '@tanstack/react-query';
import { usePermissions } from './usePermissions';
import { fetchClubsOverview, type ClubOverview } from '../services/platformAdminService';

/** All clubs (platform-admin only). */
export function usePlatformClubs() {
  const { isPlatformAdmin } = usePermissions();
  return useQuery<ClubOverview[]>({
    queryKey: ['platform-clubs'],
    queryFn: fetchClubsOverview,
    enabled: isPlatformAdmin,
    staleTime: 60_000,
  });
}
