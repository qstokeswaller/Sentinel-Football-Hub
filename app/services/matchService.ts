import { supabase } from '../lib/supabase';

/**
 * Matches data layer — ported from src/managers/match-manager.js
 * (_mapMatch / createMatch / updateMatchInfo). Club-scoped + coach squad-scoping.
 */
export interface Match {
  id: string; clubId: string | null; squadId: string | null; date: string; time: string | null; venue: string | null;
  opponent: string | null; competition: string | null; isPast: boolean; status: string;
  homeScore: number | null; awayScore: number | null; homeTeam: string | null; awayTeam: string | null;
  ourSide: 'home' | 'away'; result: string | null; matchType: string; watchedPlayerId: string | null;
  matchFormat: string; seasonId: string | null; notes: string | null; shareToken: string | null; createdAt: string;
  [key: string]: any;
}

export interface PlayerMatchStat {
  date: string | null; opponent: string | null; competition: string | null; result: string | null;
  homeScore: number | null; awayScore: number | null; ourSide: string | null;
  started: boolean; minutes: number | null; goals: number | null; assists: number | null; motm: boolean; rating: number | null;
}

/** A player's match appearances (match_player_stats → matches), most recent first. RLS keeps it club-scoped. */
export async function fetchPlayerMatchStats(playerId: string): Promise<PlayerMatchStat[]> {
  const { data, error } = await supabase
    .from('match_player_stats')
    .select('started, appeared, minutes_played, goals, assists, motm, rating, matches(date, opponent, competition, result, home_score, away_score, our_side)')
    .eq('player_id', playerId);
  if (error) throw error;
  return (data || [])
    .filter((r: any) => r.appeared && r.matches)
    .map((r: any) => ({
      date: r.matches.date, opponent: r.matches.opponent, competition: r.matches.competition,
      result: r.matches.result, homeScore: r.matches.home_score, awayScore: r.matches.away_score,
      ourSide: r.matches.our_side, started: r.started, minutes: r.minutes_played,
      goals: r.goals, assists: r.assists, motm: r.motm, rating: r.rating,
    }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function mapMatch(m: any): Match {
  return {
    id: m.id, clubId: m.club_id, squadId: m.squad_id, date: m.date, time: m.time, venue: m.venue, opponent: m.opponent,
    competition: m.competition, isPast: m.is_past, status: m.status || (m.is_past ? 'result' : 'fixture'),
    homeScore: m.home_score, awayScore: m.away_score, homeTeam: m.home_team, awayTeam: m.away_team,
    ourSide: m.our_side || 'home', result: m.result, matchType: m.match_type || 'team',
    watchedPlayerId: m.watched_player_id || null, matchFormat: m.match_format || '11-a-side',
    seasonId: m.season_id || null,
    notes: m.notes, shareToken: m.share_token || null, createdAt: m.created_at,
    stats: m.stats || { home: {}, away: {} },
    lineup: m.lineup || { starters: [], subs: [] },
    formation: m.formation || '',
    reportTitle: m.report_title || '',
    reportGeneral: m.report_general || '',
    reportAttacking: m.report_attacking || '',
    reportDefending: m.report_defending || '',
    reportIndividual: m.report_individual || '',
    reportImprovements: m.report_improvements || '',
    reportVisibility: m.report_visibility || 'private',
    videos: Array.isArray(m.videos) ? m.videos : [],
    links: Array.isArray(m.links) ? m.links : [],
    matchPhotos: Array.isArray(m.match_photos) ? m.match_photos : [],
  };
}

export async function fetchMatch(id: string): Promise<Match | null> {
  const { data, error } = await supabase.from('matches').select('*').eq('id', id).single();
  if (error) { console.error('Error fetching match:', error); return null; }
  return data ? mapMatch(data) : null;
}

export async function fetchMatches(clubId: string | null, coachSquadIds: string[] | null): Promise<Match[]> {
  let q = supabase.from('matches').select('*').order('date', { ascending: false }).limit(500);
  if (clubId) q = q.eq('club_id', clubId);
  if (Array.isArray(coachSquadIds)) {
    if (coachSquadIds.length === 0) return [];
    q = q.in('squad_id', coachSquadIds);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapMatch);
}

const FIELD_MAP: Record<string, string> = {
  squadId: 'squad_id', date: 'date', time: 'time', venue: 'venue', opponent: 'opponent', competition: 'competition',
  isPast: 'is_past', status: 'status', homeScore: 'home_score', awayScore: 'away_score', homeTeam: 'home_team',
  awayTeam: 'away_team', ourSide: 'our_side', result: 'result', notes: 'notes', matchType: 'match_type',
  watchedPlayerId: 'watched_player_id', matchFormat: 'match_format', seasonId: 'season_id', formation: 'formation',
  stats: 'stats', lineup: 'lineup', videos: 'videos', links: 'links', matchPhotos: 'match_photos',
  reportTitle: 'report_title', reportGeneral: 'report_general', reportAttacking: 'report_attacking',
  reportDefending: 'report_defending', reportIndividual: 'report_individual',
  reportImprovements: 'report_improvements', reportVisibility: 'report_visibility',
};
function toRow(data: Record<string, any>): Record<string, any> {
  const row: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) { const col = FIELD_MAP[k]; if (col) row[col] = v; }
  return row;
}

export async function createMatch(clubId: string, data: Record<string, any>): Promise<string> {
  const isResult = data.status === 'result';
  const row = {
    club_id: clubId,
    ...toRow(data),
    is_past: isResult,
    status: data.status || 'fixture',
    home_score: isResult ? (data.homeScore ?? null) : null,
    away_score: isResult ? (data.awayScore ?? null) : null,
    our_side: data.ourSide || 'home',
    match_format: data.matchFormat || '11-a-side',
    season_id: data.seasonId || null,
    match_type: data.matchType || 'team',
    stats: { home: {}, away: {} }, videos: [], links: [], lineup: { starters: [], subs: [] },
    match_events: [], match_photos: [], player_ratings: {}, report_visibility: 'private',
  };
  const { data: inserted, error } = await supabase.from('matches').insert(row).select('id').single();
  if (error) throw error;
  return inserted.id;
}

export async function updateMatch(id: string, data: Record<string, any>): Promise<void> {
  const { error } = await supabase.from('matches').update(toRow(data)).eq('id', id);
  if (error) throw error;
}

export async function deleteMatch(id: string): Promise<void> {
  const { error } = await supabase.from('matches').delete().eq('id', id);
  if (error) throw error;
}

/** Ensure a share token, then build + copy the public match dossier link. */
export async function copyMatchShareLink(id: string, existing: string | null): Promise<string> {
  let token = existing;
  if (!token) {
    token = crypto.randomUUID();
    const { error } = await supabase.from('matches').update({ share_token: token }).eq('id', id);
    if (error) throw error;
  }
  const url = `${window.location.origin}/dossier/match?token=${token}`;
  try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked — caller still gets the url */ }
  return url;
}

/** Public read-only match dossier (SECURITY DEFINER RPC) — no auth required. */
export async function fetchMatchDossier(token: string): Promise<{ match: any; club: any; squad: any; stats: any[] } | null> {
  const { data, error } = await supabase.rpc('get_match_dossier', { p_token: token });
  if (error) throw error;
  return data || null;
}

/** Build + copy a public fixtures/results link for a club, filtered by date range + team. */
export async function copyFixturesShareLink(clubId: string, opts: { from?: string; to?: string; squadId?: string }): Promise<string> {
  const q = new URLSearchParams({ club: clubId });
  if (opts.from) q.set('from', opts.from);
  if (opts.to) q.set('to', opts.to);
  if (opts.squadId) q.set('team', opts.squadId);
  const url = `${window.location.origin}/dossier/fixtures?${q.toString()}`;
  try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked — caller still gets the url */ }
  return url;
}

/** Public club fixtures/results in a date range (SECURITY DEFINER RPC) — no auth required. */
export async function fetchClubFixtures(p: { club: string; from?: string; to?: string; squadId?: string }): Promise<{ club: any; matches: any[] } | null> {
  const { data, error } = await supabase.rpc('get_club_fixtures', { p_club: p.club, p_from: p.from || null, p_to: p.to || null, p_squad: p.squadId || null });
  if (error) throw error;
  return data || null;
}

/** Win/Draw/Loss from our perspective, for a played match. */
export function resultOutcome(m: Match): 'W' | 'D' | 'L' | null {
  if (!m.isPast || m.homeScore == null || m.awayScore == null) return null;
  const ourScore = m.ourSide === 'away' ? m.awayScore : m.homeScore;
  const oppScore = m.ourSide === 'away' ? m.homeScore : m.awayScore;
  return ourScore > oppScore ? 'W' : ourScore < oppScore ? 'L' : 'D';
}
