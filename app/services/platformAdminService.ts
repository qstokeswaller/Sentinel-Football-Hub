import { supabase } from '../lib/supabase';

/**
 * Platform-admin data — ported from src/js/platform-admin-ui.js. Super_admins see
 * ALL clubs (RLS bypass for platform admins) + member/player counts.
 */
export interface ClubOverview {
  id: string; name: string; tier: string; status: string;
  memberCount: number; playerCount: number; createdAt: string;
  settings: any;
}

/** Patch a club's settings.tier / settings.status (preserving the rest). */
export async function updateClubSubscription(clubId: string, currentSettings: any, patch: { tier?: string; status?: string }): Promise<void> {
  const settings = { ...(currentSettings || {}) };
  if (patch.tier !== undefined) settings.tier = patch.tier;
  if (patch.status !== undefined) settings.status = patch.status;
  const { error } = await supabase.from('clubs').update({ settings }).eq('id', clubId);
  if (error) throw error;
}

export async function deleteClub(clubId: string): Promise<void> {
  const { error } = await supabase.from('clubs').delete().eq('id', clubId);
  if (error) throw error;
}

export async function fetchClubsOverview(): Promise<ClubOverview[]> {
  const [clubsRes, profilesRes, playersRes] = await Promise.all([
    supabase.from('clubs').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('profiles').select('id, club_id').limit(3000),
    supabase.from('players').select('id, club_id').limit(8000),
  ]);
  if (clubsRes.error) throw clubsRes.error;

  const members: Record<string, number> = {};
  (profilesRes.data || []).forEach((p: any) => { if (p.club_id) members[p.club_id] = (members[p.club_id] || 0) + 1; });
  const playersByClub: Record<string, number> = {};
  (playersRes.data || []).forEach((p: any) => { if (p.club_id) playersByClub[p.club_id] = (playersByClub[p.club_id] || 0) + 1; });

  return (clubsRes.data || [])
    // Hide platform admins' personal Dev Workspace clubs — they're private sandboxes, not real clubs.
    .filter((c: any) => c.settings?.is_dev_sandbox !== true)
    .map((c: any) => ({
    id: c.id, name: c.name,
    tier: (c.settings?.tier || c.settings?.plan || 'free').toLowerCase(),
    status: c.settings?.status || 'active',
    memberCount: members[c.id] || 0,
    playerCount: playersByClub[c.id] || 0,
    createdAt: c.created_at,
    settings: c.settings || {},
  }));
}

/** Club member invites (token-based). Platform admins can create/list/revoke for ANY
 *  club (RLS: platform_admins_* policies). Link → /login?invite=<token>; the new member
 *  signs up via it and is joined to the club with the given role. Email auto-send (Resend
 *  via Supabase SMTP) is coming — for now the link is copied + shared manually. */
export interface ClubInvite { id: string; email: string | null; role: string; token: string; expiresAt: string; createdAt: string | null }

export function inviteLink(token: string): string {
  return `${window.location.origin}/login?invite=${token}`;
}

export async function createClubInvite(clubId: string, createdBy: string, email: string, role: string): Promise<string> {
  const token = (globalThis.crypto?.randomUUID?.() || (Math.random().toString(36).slice(2) + Date.now().toString(36))).replace(/-/g, '');
  const expires_at = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from('club_invites').insert({ club_id: clubId, created_by: createdBy, email: email.trim() || null, role, token, expires_at });
  if (error) throw error;
  return token;
}

export async function fetchClubInvites(clubId: string): Promise<ClubInvite[]> {
  const { data, error } = await supabase.from('club_invites').select('*').eq('club_id', clubId).is('used_at', null).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data || [])
    .filter((i: any) => !i.expires_at || new Date(i.expires_at) > new Date())
    .map((i: any) => ({ id: i.id, email: i.email, role: i.role, token: i.token, expiresAt: i.expires_at, createdAt: i.created_at }));
}

export async function revokeClubInvite(id: string): Promise<void> {
  const { error } = await supabase.from('club_invites').delete().eq('id', id);
  if (error) throw error;
}
