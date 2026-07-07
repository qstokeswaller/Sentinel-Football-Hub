import { supabase } from '../lib/supabase';

/**
 * Scouting data layer — ported from src/managers/scouting-manager.js. Scouted
 * players + their reports; the latest report's verdict/avg is attached to each
 * player. Reports/videos/promote come in follow-on increments.
 */
export interface ScoutedPlayer {
  id: string; name: string; position: string | null; age: number | null;
  agent_name: string | null; current_club: string | null; nationality: string | null;
  scouting_status: string | null; profile_image_url: string | null; created_at: string;
  _reportCount: number; _latestVerdict: string | null; _latestAvg: number | null;
  _latestScout: string | null; _latestDate: string | null;
  [key: string]: any;
}

export async function fetchScoutedPlayers(clubId: string | null): Promise<ScoutedPlayer[]> {
  let pq = supabase.from('scouted_players').select('*').order('created_at', { ascending: false }).limit(500);
  if (clubId) pq = pq.eq('club_id', clubId);
  let rq = supabase.from('scouting_reports').select('*').order('date', { ascending: false }).limit(1000);
  if (clubId) rq = rq.eq('club_id', clubId);

  const [{ data: players, error: pErr }, { data: reports, error: rErr }] = await Promise.all([pq, rq]);
  if (pErr) throw pErr;
  if (rErr) throw rErr;

  const byPlayer: Record<string, any[]> = {};
  for (const r of (reports || [])) { (byPlayer[r.scouted_player_id] ||= []).push(r); }

  return (players || []).map((p: any) => {
    const pr = byPlayer[p.id] || [];
    const latest = pr[0] || null;
    return {
      ...p,
      _reportCount: pr.length,
      _latestVerdict: latest?.verdict || null,
      _latestAvg: latest?.global_average ? parseFloat(latest.global_average) : null,
      _latestScout: latest?.scout_name || null,
      _latestDate: latest?.date || null,
    };
  });
}

export async function addScoutedPlayer(clubId: string, data: Record<string, any>): Promise<string> {
  const payload = { scouting_status: 'watching', ...data, club_id: clubId };
  const { data: row, error } = await supabase.from('scouted_players').insert(payload).select('id').single();
  if (error) throw error;
  return row.id;
}

export async function updateScoutedPlayer(id: string, data: Record<string, any>): Promise<void> {
  const { error } = await supabase.from('scouted_players').update(data).eq('id', id);
  if (error) throw error;
}

/** Promote a scouted player into a real squad player (copies name/position/dob), then marks them "signed". */
export async function promoteScoutedToSquad(clubId: string, sp: ScoutedPlayer, squadId: string | null): Promise<string> {
  const { data: row, error } = await supabase.from('players').insert({
    club_id: clubId, squad_id: squadId || null, name: sp.name, position: sp.position || null,
    ...(sp.dob ? { date_of_birth: sp.dob } : {}), ...(sp.nationality ? { nationality: sp.nationality } : {}),
  }).select('id').single();
  if (error) throw error;
  await supabase.from('scouted_players').update({ scouting_status: 'signed' }).eq('id', sp.id);
  return row.id;
}

export async function deleteScoutedPlayer(id: string): Promise<void> {
  // Reports + videos reference the player — remove them first.
  await supabase.from('scouting_reports').delete().eq('scouted_player_id', id);
  await supabase.from('scouting_videos').delete().eq('scouted_player_id', id);
  const { error } = await supabase.from('scouted_players').delete().eq('id', id);
  if (error) throw error;
}

// ── Scout videos (scouting_videos) ──
export interface ScoutVideo { id: string; title: string; url: string; }

export async function fetchScoutVideos(scoutedPlayerId: string): Promise<ScoutVideo[]> {
  const { data, error } = await supabase.from('scouting_videos').select('id, title, url')
    .eq('scouted_player_id', scoutedPlayerId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as ScoutVideo[];
}

export async function addScoutVideo(clubId: string, createdBy: string | null, scoutedPlayerId: string, title: string, url: string): Promise<void> {
  const { error } = await supabase.from('scouting_videos').insert({ club_id: clubId, created_by: createdBy, scouted_player_id: scoutedPlayerId, title: title || null, url });
  if (error) throw error;
}

export async function deleteScoutVideo(id: string): Promise<void> {
  const { error } = await supabase.from('scouting_videos').delete().eq('id', id);
  if (error) throw error;
}

// ── Scout reports (scouting_reports) ──
export interface ScoutReport {
  id: string; report_type: string; match_context: string | null; date: string | null;
  verdict: string | null; scout_name: string | null; global_average: number | null;
  ratings: Record<string, Record<string, number>>; feedback: { strengths?: string; weaknesses?: string; recommendation?: string };
  created_at: string;
}

export async function fetchScoutReports(scoutedPlayerId: string): Promise<ScoutReport[]> {
  const { data, error } = await supabase.from('scouting_reports').select('*')
    .eq('scouted_player_id', scoutedPlayerId).order('date', { ascending: false }).limit(100);
  if (error) throw error;
  return (data || []).map((r: any) => ({ ...r, ratings: r.ratings || {}, feedback: r.feedback || {} })) as ScoutReport[];
}

export async function addScoutReport(clubId: string, createdBy: string | null, scoutedPlayerId: string, data: {
  report_type: string; match_context: string | null; date: string | null; verdict: string | null;
  scout_name: string | null; global_average: number | null;
  ratings: Record<string, Record<string, number>>; feedback: Record<string, string>;
}): Promise<void> {
  const { error } = await supabase.from('scouting_reports').insert({ club_id: clubId, created_by: createdBy, scouted_player_id: scoutedPlayerId, ...data });
  if (error) throw error;
}

export async function deleteScoutReport(id: string): Promise<void> {
  const { error } = await supabase.from('scouting_reports').delete().eq('id', id);
  if (error) throw error;
}
