import { supabase } from '../lib/supabase';

/**
 * Squad + player data layer — ported from src/managers/squad-manager.js
 * (_mapPlayer / addSquad mapping / queries). Club-scoped reads; CRUD added in the
 * next increment. Replaces the singleton manager with react-query (useSquads/usePlayers).
 */

export interface Squad {
  id: string;
  name: string;
  ageGroup: string;
  leagues: any[];
  coaches: any[];
  currentSeasonId: string | null;
  leagueTableUrl: string | null;
  notes: string;
  media: any[];
  shareToken: string | null;
  createdAt: string;
}

export interface Player {
  id: string;
  name: string;
  squadId: string | null;
  age: number | null;
  dateOfBirth: string;
  jerseyNumber: string | number;
  position: string;
  height: string;
  weight: string;
  foot: string;
  previousClubs: string;
  currentClub: string;
  school: string;
  newToClub: boolean;
  nationality: string;
  joinDate: string;
  yearJoined: string | number;
  phone: string;
  email: string;
  profileImageUrl: string;
  playerStatus: string;
  bio: string;
  createdAt: string;
  [key: string]: any;
}

export function mapSquad(s: any): Squad {
  return {
    id: s.id, name: s.name, ageGroup: s.age_group, leagues: s.leagues || [], coaches: s.coaches || [],
    currentSeasonId: s.current_season_id || null, leagueTableUrl: s.league_table_url || null,
    notes: s.notes || '', media: s.media || [], shareToken: s.share_token || null, createdAt: s.created_at,
  };
}

/** Player media columns can be jsonb arrays or stringified JSON — normalise to arrays. */
function parseArr(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v || '[]'); } catch { return []; } }
  return [];
}

export function mapPlayer(p: any): Player {
  return {
    id: p.id, name: p.name, squadId: p.squad_id, age: p.age, dateOfBirth: p.date_of_birth || '',
    jerseyNumber: p.jersey_number || '', position: p.position, height: p.height || '', weight: p.weight || '',
    foot: p.foot || 'Right', previousClubs: p.previous_clubs || '', currentClub: p.current_club || '',
    school: p.school || '', newToClub: p.new_to_club || false, nationality: p.nationality || '',
    joinDate: p.join_date || '', yearJoined: p.year_joined || '', phone: p.phone || '', email: p.email || '',
    emergencyContactName: p.emergency_contact_name || '', emergencyContactPhone: p.emergency_contact_phone || '',
    parentName: p.parent_name || '', parentPhone: p.parent_phone || '', parentEmail: p.parent_email || '',
    medicalInfo: p.medical_info || '',
    highlights: parseArr(p.highlights), analysisVideos: parseArr(p.analysis_videos),
    galleryPhotos: parseArr(p.gallery_photos), documents: parseArr(p.documents),
    profileImageUrl: p.profile_image_url || '', playerStatus: p.player_status || 'active', bio: p.bio || '',
    createdAt: p.created_at,
  };
}

export async function fetchPlayer(id: string): Promise<Player | null> {
  const { data, error } = await supabase.from('players').select('*').eq('id', id).single();
  if (error) { console.error('Error fetching player:', error); return null; }
  return data ? mapPlayer(data) : null;
}

export async function fetchSquads(clubId: string | null, coachSquadIds?: string[] | null): Promise<Squad[]> {
  let q = supabase.from('squads').select('*').order('created_at', { ascending: true }).limit(200);
  if (clubId) q = q.eq('club_id', clubId);
  if (Array.isArray(coachSquadIds)) { if (!coachSquadIds.length) return []; q = q.in('id', coachSquadIds); }
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapSquad);
}

export async function fetchPlayers(clubId: string | null, coachSquadIds?: string[] | null): Promise<Player[]> {
  let q = supabase.from('players').select('*').order('name', { ascending: true }).limit(1000);
  if (clubId) q = q.eq('club_id', clubId);
  if (Array.isArray(coachSquadIds)) { if (!coachSquadIds.length) return []; q = q.in('squad_id', coachSquadIds); }
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapPlayer);
}

/**
 * Computed age for display. The `age` column historically stores a YEAR OF BIRTH (e.g. 2013),
 * not the age, so we derive the real age from dateOfBirth when present, else convert a
 * year-of-birth value, else fall back to the raw number.
 */
export function playerAge(p: { age?: number | null; dateOfBirth?: string | null }): number | null {
  if (p.dateOfBirth) {
    const d = new Date(p.dateOfBirth);
    if (!isNaN(d.getTime())) {
      const now = new Date();
      let a = now.getFullYear() - d.getFullYear();
      const mo = now.getMonth() - d.getMonth();
      if (mo < 0 || (mo === 0 && now.getDate() < d.getDate())) a--;
      if (a >= 0 && a < 120) return a;
    }
  }
  if (p.age != null) return p.age > 1900 ? new Date().getFullYear() - p.age : p.age;
  return null;
}

/** Per-squad card extras — sessions (for last/next), matches (next/result), and assigned coaches. */
export interface SquadCardData {
  sessions: { date: string; team: string | null }[];
  matches: { squadId: string | null; date: string | null; opponent: string | null; isPast: boolean; homeScore: number | null; awayScore: number | null }[];
  coachesBySquad: Record<string, string[]>;
}
export async function fetchSquadCardData(clubId: string | null): Promise<SquadCardData> {
  if (!clubId) return { sessions: [], matches: [], coachesBySquad: {} };
  const [s, m, sc] = await Promise.all([
    supabase.from('sessions').select('date, team').eq('club_id', clubId).eq('is_template', false).not('date', 'is', null).limit(3000),
    supabase.from('matches').select('squad_id, date, opponent, is_past, home_score, away_score').eq('club_id', clubId).not('date', 'is', null).limit(3000),
    supabase.from('squad_coaches').select('squad_id, coach_id'),
  ]);
  const coachIds = [...new Set((sc.data || []).map((r: any) => r.coach_id).filter(Boolean))] as string[];
  const names: Record<string, string> = {};
  if (coachIds.length) {
    const { data } = await supabase.from('profiles').select('id, full_name').in('id', coachIds);
    (data || []).forEach((p: any) => { names[p.id] = p.full_name || 'Coach'; });
  }
  const coachesBySquad: Record<string, string[]> = {};
  (sc.data || []).forEach((r: any) => { if (!r.squad_id) return; (coachesBySquad[r.squad_id] = coachesBySquad[r.squad_id] || []).push(names[r.coach_id] || 'Coach'); });
  return {
    sessions: (s.data || []).map((r: any) => ({ date: r.date, team: r.team })),
    matches: (m.data || []).map((r: any) => ({ squadId: r.squad_id, date: r.date, opponent: r.opponent, isPast: r.is_past, homeScore: r.home_score, awayScore: r.away_score })),
    coachesBySquad,
  };
}

/** Client-side filtering mirroring squad-manager.getPlayers(). */
export function filterPlayers(players: Player[], filters: { squadId?: string; position?: string; search?: string }): Player[] {
  let out = players;
  if (filters.squadId && filters.squadId !== 'all') out = out.filter(p => p.squadId === filters.squadId);
  if (filters.position && filters.position !== 'all') out = out.filter(p => p.position && p.position.split(',').map(s => s.trim()).includes(filters.position!));
  if (filters.search) {
    const t = filters.search.toLowerCase();
    out = out.filter(p => p.name.toLowerCase().includes(t));
  }
  return out;
}

// ── Mutations (ported from squad-manager addPlayer/updatePlayer/deletePlayer) ──

const PLAYER_CAMEL_TO_SNAKE: Record<string, string> = {
  name: 'name', squadId: 'squad_id', age: 'age', position: 'position', height: 'height', weight: 'weight',
  foot: 'foot', previousClubs: 'previous_clubs', currentClub: 'current_club', school: 'school',
  newToClub: 'new_to_club', bio: 'bio', profileImageUrl: 'profile_image_url', dateOfBirth: 'date_of_birth',
  jerseyNumber: 'jersey_number', nationality: 'nationality', joinDate: 'join_date', yearJoined: 'year_joined',
  phone: 'phone', email: 'email',
  emergencyContactName: 'emergency_contact_name', emergencyContactPhone: 'emergency_contact_phone',
  parentName: 'parent_name', parentPhone: 'parent_phone', parentEmail: 'parent_email', medicalInfo: 'medical_info',
  playerStatus: 'player_status',
};

function toPlayerRow(data: Record<string, any>): Record<string, any> {
  const row: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    const col = PLAYER_CAMEL_TO_SNAKE[k];
    if (!col) continue;
    row[col] = ((col === 'date_of_birth' || col === 'join_date') && !v) ? null : v;
  }
  return row;
}

export async function addPlayer(clubId: string, data: Record<string, any>): Promise<string> {
  const row = { club_id: clubId, ...toPlayerRow(data) };
  const { data: inserted, error } = await supabase.from('players').insert(row).select('id').single();
  if (error) throw error;
  return inserted.id;
}

export async function updatePlayer(id: string, data: Record<string, any>): Promise<void> {
  const { error } = await supabase.from('players').update(toPlayerRow(data)).eq('id', id);
  if (error) throw error;
}

/** Fast single-column status update (roster inline + profile header). */
export async function updatePlayerStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase.from('players').update({ player_status: status }).eq('id', id);
  if (error) throw error;
}

/** Move a player to a different squad (reassign). Pass null/'' to unassign. */
export async function reassignPlayer(id: string, squadId: string | null): Promise<void> {
  const { error } = await supabase.from('players').update({ squad_id: squadId || null }).eq('id', id);
  if (error) throw error;
}

/** Snapshot to deleted_items for 7-day restore (best-effort), then hard-delete. */
export async function deletePlayer(id: string, clubId: string | null): Promise<void> {
  try {
    const { data: full } = await supabase.from('players').select('*').eq('id', id).single();
    if (full && clubId) {
      await supabase.from('deleted_items').insert({ club_id: clubId, item_type: 'player', item_id: id, item_data: full });
    }
  } catch (e) { console.warn('Recovery snapshot failed:', e); }
  const { error } = await supabase.from('players').delete().eq('id', id);
  if (error) throw error;
}

// ── Squad mutations (ported from squad-manager addSquad/updateSquad/deleteSquad) ──

export async function addSquad(clubId: string, data: Record<string, any>): Promise<string> {
  const row = {
    club_id: clubId,
    name: data.name,
    age_group: data.ageGroup || 'General',
    leagues: data.leagues || [],
    coaches: data.coaches || [],
    league_table_url: data.leagueTableUrl || null,
    notes: data.notes || null,
  };
  const { data: inserted, error } = await supabase.from('squads').insert(row).select('id').single();
  if (error) throw error;
  return inserted.id;
}

export async function updateSquad(id: string, data: Record<string, any>): Promise<void> {
  const row: Record<string, any> = {};
  if (data.name !== undefined) row.name = data.name;
  if (data.ageGroup !== undefined) row.age_group = data.ageGroup;
  if (data.leagues !== undefined) row.leagues = data.leagues;
  if (data.coaches !== undefined) row.coaches = data.coaches;
  if (data.leagueTableUrl !== undefined) row.league_table_url = data.leagueTableUrl || null;
  if (data.notes !== undefined) row.notes = data.notes || null;
  if (data.media !== undefined) row.media = data.media;
  const { error } = await supabase.from('squads').update(row).eq('id', id);
  if (error) throw error;
}

/** Snapshot to deleted_items for 7-day restore (best-effort), then hard-delete. */
export async function deleteSquad(id: string, clubId: string | null): Promise<void> {
  try {
    const { data: full } = await supabase.from('squads').select('*').eq('id', id).single();
    if (full && clubId) {
      await supabase.from('deleted_items').insert({ club_id: clubId, item_type: 'squad', item_id: id, item_data: full });
    }
  } catch (e) { console.warn('Recovery snapshot failed:', e); }
  const { error } = await supabase.from('squads').delete().eq('id', id);
  if (error) throw error;
}

/** Bulk insert players from parsed CSV rows (camelCase). Used by CSV import. */
export async function addPlayersBulk(clubId: string, rows: Record<string, any>[]): Promise<number> {
  const payload = rows.map(r => ({ club_id: clubId, ...toPlayerRow(r) }));
  const { data, error } = await supabase.from('players').insert(payload).select('id');
  if (error) throw error;
  return data?.length || 0;
}
