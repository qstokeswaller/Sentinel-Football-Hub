import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import {
  fetchProfile, getImpersonatingClubId, getImpersonatingClubName,
  type Profile, type Club,
} from '../services/databaseService';
import { getTier, type Tier } from '../lib/tiers';

/**
 * The reactive single source of truth for profile/club/tier/archetype/theme/
 * impersonation. Replaces the vanilla window._profile + scattered globals +
 * page-init's auth→profile→reveal gate (and its ordering races).
 */
interface AppStateValue {
  profile: Profile | null;
  club: Club | null;
  role: string | null;
  tier: Tier;
  archetype: string | null;
  /** impersonated club_id, else the profile's own club_id, else a dev's Workspace club */
  effectiveClubId: string | null;
  isImpersonating: boolean;
  impersonatingClubName: string | null;
  /** true when the active club is a platform admin's personal Dev Workspace */
  isDevSandbox: boolean;
  /** club subscription paused (and user is not privileged) → block app access */
  subscriptionPaused: boolean;
  isLoading: boolean;
  refetchProfile: () => void;
  startImpersonation: (clubId: string, clubName?: string) => void;
  stopImpersonation: () => void;
  // Theme
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Impersonation state mirrors sessionStorage; kept in React state so changing it
  // re-keys the profile query and refetches reactively.
  const [impersonatingClubId, setImpClubId] = useState<string | null>(() => getImpersonatingClubId());
  const [impersonatingClubName, setImpClubName] = useState<string | null>(() => getImpersonatingClubName());

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', user?.id, impersonatingClubId],
    queryFn: () => fetchProfile(user!.id, user?.email ?? undefined),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const startImpersonation = useCallback((clubId: string, clubName = '') => {
    try {
      sessionStorage.setItem('impersonating_club_id', clubId);
      sessionStorage.setItem('impersonating_club_name', clubName);
    } catch {}
    setImpClubId(clubId);
    setImpClubName(clubName);
  }, []);

  const stopImpersonation = useCallback(() => {
    try {
      sessionStorage.removeItem('impersonating_club_id');
      sessionStorage.removeItem('impersonating_club_name');
      sessionStorage.removeItem('sidebar-branding');
    } catch {}
    setImpClubId(null);
    setImpClubName(null);
  }, []);

  const refetchProfile = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['profile'] });
  }, [queryClient]);

  // ── Theme (FH uses [data-theme="dark"] on <html>, key 'sentinel-theme') ──
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return localStorage.getItem('sentinel-theme') === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    try { localStorage.setItem('sentinel-theme', theme); } catch {}
  }, [theme]);
  const toggleTheme = useCallback(() => setTheme(t => (t === 'dark' ? 'light' : 'dark')), []);

  const value = useMemo<AppStateValue>(() => {
    const club = profile?.clubs ?? null;
    const role = profile?.role ?? null;
    const isPrivileged = role === 'super_admin' || role === 'platform_admin';
    return {
      profile: profile ?? null,
      club,
      role,
      tier: getTier(profile),
      archetype: club?.settings?.archetype ?? null,
      effectiveClubId: impersonatingClubId || profile?.club_id || profile?.clubs?.id || null,
      isImpersonating: !!impersonatingClubId,
      impersonatingClubName,
      isDevSandbox: !!profile?._devSandbox,
      subscriptionPaused: club?.settings?.status === 'paused' && !isPrivileged,
      isLoading: !!user && profileLoading,
      refetchProfile,
      startImpersonation,
      stopImpersonation,
      theme,
      toggleTheme,
    };
  }, [profile, impersonatingClubId, impersonatingClubName, user, profileLoading, refetchProfile, startImpersonation, stopImpersonation, theme, toggleTheme]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export const useAppState = () => {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
};
