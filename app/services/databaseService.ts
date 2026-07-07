import { supabase } from '../lib/supabase';

/**
 * Data layer over Supabase. Ports the profile/impersonation logic from
 * src/auth.js + src/page-init.js. Page-specific queries get added here during
 * the page port (Phase 3+), each baking in the CLAUDE.md performance rules
 * (default .limit(), date filters, club_id scoping, Promise.all).
 */

export interface ClubBranding {
  logo_url?: string | null;
  club_display_name?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
}

export interface ClubSettings {
  tier?: string;
  plan?: string;
  archetype?: 'academy' | 'private_coaching' | string;
  status?: 'active' | 'paused' | string;
  branding?: ClubBranding;
  features?: Record<string, boolean>;
}

export interface Club {
  id: string;
  name: string;
  settings?: ClubSettings | null;
}

export interface Profile {
  id: string;
  role: string;
  club_id: string | null;
  full_name?: string | null;
  email?: string;
  clubs?: Club | null;
  accepted_terms_version?: number;
  /** true once the user has seen the general welcome tour (per-user, cross-device) */
  has_seen_walkthrough?: boolean;
  /** platform admin's personal hidden Dev Workspace club (see ensure_dev_sandbox RPC) */
  dev_club_id?: string | null;
  /** true when a super_admin is viewing a club via impersonation */
  _impersonating?: boolean;
  /** true when the effective club is the platform admin's own Dev Workspace */
  _devSandbox?: boolean;
  [key: string]: any;
}

// ── Impersonation (per-tab, sessionStorage) ──

export function getImpersonatingClubId(): string | null {
  try { return sessionStorage.getItem('impersonating_club_id'); } catch { return null; }
}

export function getImpersonatingClubName(): string | null {
  try { return sessionStorage.getItem('impersonating_club_name'); } catch { return null; }
}

/**
 * Fetch the current user's profile (+ joined club). When a super_admin is
 * impersonating a club, overlay that club's id/settings onto the profile so all
 * downstream tier/archetype/scoping reads "become" that club. Mirrors getProfile().
 */
export async function fetchProfile(userId: string, email?: string): Promise<Profile | null> {
  const impClubId = getImpersonatingClubId();
  const isImpersonating = !!impClubId;

  // profiles now has TWO FKs to clubs (club_id + dev_club_id), so the embed must name the
  // relationship explicitly — otherwise PostgREST can't disambiguate and the query 400s.
  const profileQ = supabase.from('profiles').select('*, clubs!profiles_club_id_fkey(*)').eq('id', userId).single();
  const clubQ = isImpersonating
    ? supabase.from('clubs').select('*').eq('id', impClubId!).single()
    : Promise.resolve({ data: null } as { data: Club | null });

  const [{ data, error }, { data: impClub }] = await Promise.all([profileQ, clubQ]);

  if (error) {
    console.error('Error fetching profile:', error);
    return null;
  }

  const profile: Profile = { ...(data as Profile), email };

  // Impersonation overlay — only for platform super_admins (club_id NULL). Sets
  // club_id so all scoping "becomes" that club (and the Platform Admin nav hides).
  if (isImpersonating && profile.role === 'super_admin' && !profile.club_id && impClub) {
    profile.club_id = impClub.id;
    profile.clubs = impClub;
    profile._impersonating = true;
  }
  // Dev Workspace overlay — a platform admin who is NOT impersonating gets their own
  // hidden sandbox club as the effective club, so every page works and data saves
  // under their account. We attach it via `clubs` but DELIBERATELY leave club_id NULL,
  // so platform-admin powers + the Platform Admin nav (which key off club_id IS NULL)
  // stay intact alongside the working pages.
  else if (!isImpersonating && profile.role === 'super_admin' && !profile.club_id) {
    let sandboxId = profile.dev_club_id ?? null;
    if (!sandboxId) {
      const { data: provisioned } = await supabase.rpc('ensure_dev_sandbox');
      sandboxId = (provisioned as string | null) ?? null;
    }
    if (sandboxId) {
      const { data: sandbox } = await supabase.from('clubs').select('*').eq('id', sandboxId).single();
      if (sandbox) {
        profile.clubs = sandbox as Club;
        profile.dev_club_id = sandboxId;
        profile._devSandbox = true;
      }
    }
  }

  return profile;
}

/**
 * Squads a coach/viewer is scoped to (null = admin, no restriction).
 * Ported from page-init.js coach-scoping query.
 */
export async function fetchCoachSquadIds(profile: Profile | null): Promise<string[] | null> {
  if (!profile) return null;
  if (profile.role !== 'coach' && profile.role !== 'viewer') return null;
  const { data } = await supabase.from('squad_coaches').select('squad_id').eq('coach_id', profile.id);
  return (data || []).map((sc: any) => sc.squad_id);
}
