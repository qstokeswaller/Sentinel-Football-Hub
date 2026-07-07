import { supabase } from '../lib/supabase';

/**
 * Per-player match stats (match_player_stats). This is the data SOURCE for the
 * player-dossier season stats + analytics leaderboards. Saving replaces the
 * match's rows with the players marked as appeared.
 */
export interface PlayerStatRow {
  playerId: string; appeared: boolean; started: boolean; minutes: string;
  goals: string; assists: string; rating: string; motm: boolean;
  yellow?: string; red?: string; cleanSheet?: boolean; saves?: string; notes?: string;
}
export interface SavedPlayerStat {
  playerId: string; appeared: boolean; started: boolean; minutesPlayed: number;
  goals: number; assists: number; rating: number; motm: boolean;
  yellow: number; red: number; cleanSheet: boolean; saves: number; notes: string;
}

export async function fetchMatchPlayerStats(matchId: string): Promise<SavedPlayerStat[]> {
  const { data, error } = await supabase.from('match_player_stats').select('*').eq('match_id', matchId);
  if (error) throw error;
  return (data || []).map((r: any) => ({
    playerId: r.player_id, appeared: r.appeared !== false, started: !!r.started,
    minutesPlayed: r.minutes_played || 0, goals: r.goals || 0, assists: r.assists || 0,
    rating: r.rating || 0, motm: !!r.motm, yellow: r.yellow_cards || 0, red: r.red_cards || 0, cleanSheet: !!r.clean_sheet,
    saves: r.saves || 0, notes: r.notes || '',
  }));
}

export interface LeaderboardRow {
  playerId: string; name: string; apps: number; goals: number; assists: number;
  motm: number; minutes: number; avgRating: number;
}

/** Aggregate every match_player_stats row in the club into a per-player leaderboard. */
export async function fetchPlayerLeaderboard(clubId: string): Promise<LeaderboardRow[]> {
  const [{ data: stats }, { data: players }] = await Promise.all([
    supabase.from('match_player_stats').select('*').eq('club_id', clubId).limit(10000),
    supabase.from('players').select('id, name').eq('club_id', clubId),
  ]);
  const names: Record<string, string> = Object.fromEntries((players || []).map((p: any) => [p.id, p.name]));
  const agg: Record<string, any> = {};
  (stats || []).forEach((s: any) => {
    const a = agg[s.player_id] || (agg[s.player_id] = { playerId: s.player_id, apps: 0, goals: 0, assists: 0, motm: 0, minutes: 0, ratingSum: 0, ratingCount: 0 });
    if (s.appeared !== false) a.apps++;
    a.goals += s.goals || 0; a.assists += s.assists || 0; if (s.motm) a.motm++; a.minutes += s.minutes_played || 0;
    if (s.rating > 0) { a.ratingSum += s.rating; a.ratingCount++; }
  });
  return Object.values(agg).map((a: any) => ({
    playerId: a.playerId, name: names[a.playerId] || 'Unknown', apps: a.apps, goals: a.goals,
    assists: a.assists, motm: a.motm, minutes: a.minutes,
    avgRating: a.ratingCount ? +(a.ratingSum / a.ratingCount).toFixed(1) : 0,
  })).sort((x, y) => (y.goals + y.assists) - (x.goals + x.assists));
}

export async function saveMatchPlayerStats(clubId: string, matchId: string, rows: PlayerStatRow[]): Promise<number> {
  await supabase.from('match_player_stats').delete().eq('match_id', matchId);
  const num = (v: string) => v === '' || v == null ? 0 : parseInt(v, 10) || 0;
  const toInsert = rows.filter(r => r.appeared).map(r => ({
    club_id: clubId, match_id: matchId, player_id: r.playerId, appeared: true, started: r.started,
    minutes_played: num(r.minutes), goals: num(r.goals), assists: num(r.assists),
    rating: num(r.rating) || null, motm: r.motm,
    yellow_cards: num(r.yellow || ''), red_cards: num(r.red || ''), clean_sheet: !!r.cleanSheet,
    saves: num(r.saves || ''), notes: (r.notes || '').trim() || null,
  }));
  if (toInsert.length) {
    const { error } = await supabase.from('match_player_stats').insert(toInsert);
    if (error) throw error;
  }
  return toInsert.length;
}
