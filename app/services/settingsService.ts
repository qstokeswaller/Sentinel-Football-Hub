import { supabase } from '../lib/supabase';

/** Settings operations — ported from src/pages/settings.html inline logic. */

export async function updateProfileName(id: string, fullName: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', id);
  if (error) throw error;
}

export async function changePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

// ── Club settings (branding) ──
export interface ClubInfo { id: string; name: string; logoUrl: string | null; displayName: string; settings: any; }

export async function fetchClub(clubId: string): Promise<ClubInfo> {
  const { data, error } = await supabase.from('clubs').select('*').eq('id', clubId).single();
  if (error) throw error;
  return { id: data.id, name: data.name, logoUrl: data.logo_url, displayName: data.settings?.display_name || '', settings: data.settings || {} };
}

export async function updateClub(clubId: string, current: any, patch: { name?: string; logoUrl?: string | null; displayName?: string }): Promise<void> {
  const row: Record<string, any> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.logoUrl !== undefined) row.logo_url = patch.logoUrl || null;
  if (patch.displayName !== undefined) row.settings = { ...(current || {}), display_name: patch.displayName || undefined };
  const { error } = await supabase.from('clubs').update(row).eq('id', clubId);
  if (error) throw error;
}

/** Home venues (clubs.settings.home_venues) — selectable when a fixture is set to Home. */
export async function setHomeVenues(clubId: string, current: any, venues: string[]): Promise<void> {
  const { error } = await supabase.from('clubs').update({ settings: { ...(current || {}), home_venues: venues } }).eq('id', clubId);
  if (error) throw error;
}

// ── Staff / members ──
export interface ClubMember { id: string; fullName: string; role: string; avatarUrl: string | null; }

export async function fetchClubMembers(clubId: string): Promise<ClubMember[]> {
  const { data, error } = await supabase.from('profiles').select('id, full_name, role, avatar_url').eq('club_id', clubId).order('created_at');
  if (error) throw error;
  return (data || []).map((p: any) => ({ id: p.id, fullName: p.full_name || 'Unnamed', role: p.role || 'viewer', avatarUrl: p.avatar_url }));
}

export async function updateMemberRole(userId: string, role: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) throw error;
}

/** Squad assignments for a coach (squad_coaches) — powers coach squad-scoping. */
export async function fetchCoachSquadAssignments(coachId: string): Promise<string[]> {
  const { data, error } = await supabase.from('squad_coaches').select('squad_id').eq('coach_id', coachId);
  if (error) throw error;
  return (data || []).map((r: any) => r.squad_id);
}

/** Replace a coach's squad assignments (delete-all then insert the selected). */
export async function setCoachSquadAssignments(coachId: string, squadIds: string[]): Promise<void> {
  const { error: delErr } = await supabase.from('squad_coaches').delete().eq('coach_id', coachId);
  if (delErr) throw delErr;
  if (squadIds.length) {
    const { error } = await supabase.from('squad_coaches').insert(squadIds.map(squad_id => ({ coach_id: coachId, squad_id })));
    if (error) throw error;
  }
}

export interface DeletedItem { id: string; itemType: string; name: string; deletedAt: string; expiresAt: string; daysLeft: number; itemData: any; }

export async function fetchDeletedItems(clubId: string | null): Promise<DeletedItem[]> {
  if (!clubId) return [];
  const { data, error } = await supabase.from('deleted_items').select('*')
    .eq('club_id', clubId).gte('expires_at', new Date().toISOString())
    .order('deleted_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data || []).map((it: any) => ({
    id: it.id, itemType: it.item_type, name: it.item_data?.name || it.item_data?.title || 'Unknown',
    deletedAt: it.deleted_at, expiresAt: it.expires_at,
    daysLeft: Math.max(0, Math.ceil((new Date(it.expires_at).getTime() - Date.now()) / 86400000)),
    itemData: it.item_data,
  }));
}

const RESTORE_TABLE: Record<string, string> = { player: 'players', session: 'sessions', drill: 'drills', match: 'matches', squad: 'squads' };

export async function restoreDeletedItem(deletedId: string, itemType: string): Promise<void> {
  const table = RESTORE_TABLE[itemType];
  if (!table) throw new Error('Unknown item type');
  const { data: item } = await supabase.from('deleted_items').select('*').eq('id', deletedId).single();
  if (!item) throw new Error('Item not found');

  const row = { ...item.item_data };
  // Nullify orphaned FK references so the re-insert doesn't violate constraints.
  if (row.squad_id) { const { data } = await supabase.from('squads').select('id').eq('id', row.squad_id).maybeSingle(); if (!data) row.squad_id = null; }
  if (row.session_id) { const { data } = await supabase.from('sessions').select('id').eq('id', row.session_id).maybeSingle(); if (!data) row.session_id = null; }
  if (row.created_by) { const { data } = await supabase.from('profiles').select('id').eq('id', row.created_by).maybeSingle(); if (!data) row.created_by = null; }

  const { error } = await supabase.from(table).insert(row);
  if (error) throw error;
  await supabase.from('deleted_items').delete().eq('id', deletedId);
}
