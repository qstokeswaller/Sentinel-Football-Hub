import { supabase } from '../lib/supabase';
import { isInSeason, type Season } from './seasonsService';

/**
 * Analytics data pipelines (Player Analytics tab). These read the SAME sources the
 * rest of the app writes to — `match_player_stats` (the match-details Stats tab),
 * `matches` (results), and `assessments` (the full performance assessments) — so the
 * numbers here always reflect what coaches enter on match reports + player profiles.
 *
 * Everything is club-scoped, and callers pass `squadIds` (a coach's assigned squads,
 * or `null` for an admin who sees the whole club) so RBAC holds at the query layer.
 */

const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3, '': 4 };
const POS_LABEL: Record<string, string> = { GK: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', FWD: 'Forwards', '': 'Other' };
export function positionGroup(pos: string | null | undefined): 'GK' | 'DEF' | 'MID' | 'FWD' | '' {
  if (!pos) return '';
  const p = pos.toUpperCase().trim().split(/[,/]/)[0].trim();
  if (p.includes('GK') || p.includes('GOAL')) return 'GK';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB', 'SW'].some(x => p.includes(x)) || p.includes('DEF') || p.includes('BACK')) return 'DEF';
  if (['CM', 'CDM', 'CAM', 'LM', 'RM', 'DM', 'AM'].some(x => p.includes(x)) || p.includes('MID')) return 'MID';
  if (['ST', 'CF', 'LW', 'RW', 'SS'].some(x => p.includes(x)) || p.includes('FWD') || p.includes('WING') || p.includes('STRIKER') || p.includes('FORWARD')) return 'FWD';
  return '';
}
export const posGroupOrder = (pos: string | null | undefined) => POS_ORDER[positionGroup(pos)] ?? 4;
export const posGroupLabel = (g: string) => POS_LABEL[g] || 'Other';

export interface AnalyticsFilter { squadIds: string[] | null; squadFilter: string; playerFilter?: string; from?: string; to?: string; season?: Season | null; }
const inRange = (d: string | null | undefined, f: AnalyticsFilter) => (!f.from || (d || '') >= f.from) && (!f.to || (d || '') <= f.to);

// Fetch the club's players honouring the squad filter + coach scope.
async function fetchScopedPlayers(clubId: string, f: AnalyticsFilter) {
  let q = supabase.from('players').select('id, name, position, squad_id').eq('club_id', clubId).limit(3000);
  if (f.squadFilter && f.squadFilter !== 'all') q = q.eq('squad_id', f.squadFilter);
  else if (f.squadIds) q = q.in('squad_id', f.squadIds.length ? f.squadIds : ['__none__']);
  if (f.playerFilter && f.playerFilter !== 'all') q = q.eq('id', f.playerFilter);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// ── Squad Match Stats leaderboard ──────────────────────────────────────────────
export interface PlayerMatchAgg {
  id: string; name: string; position: string; group: string;
  apps: number; starts: number; totalMinutes: number; seasonMinutes: number; pctOfSeason: number;
  squadMinutes: number; pctOfSquad: number; goals: number; assists: number; contributions: number;
  yellow: number; red: number; avgRating: number | null; motm: number; cleanSheets: number; saves: number;
}

export async function fetchPlayerMatchAggregates(clubId: string, f: AnalyticsFilter): Promise<PlayerMatchAgg[]> {
  const players = await fetchScopedPlayers(clubId, f);
  if (!players.length) return [];
  const playerIds = players.map(p => p.id);

  const [{ data: statsRaw }, { data: seasonMatches }] = await Promise.all([
    supabase.from('match_player_stats').select('*').in('player_id', playerIds).limit(20000),
    supabase.from('matches').select('id, date, season_id, is_past').eq('club_id', clubId).eq('is_past', true).limit(2000),
  ]);

  const matchMeta: Record<string, { date: string | null; seasonId: string | null }> = {};
  (seasonMatches || []).forEach((m: any) => { matchMeta[m.id] = { date: m.date, seasonId: m.season_id }; });

  const season = f.season || null;
  // A match is "in window" when it clears BOTH the date range and the selected season.
  const inWindow = (matchId: string) => { const m = matchMeta[matchId]; if (!m) return false; return inRange(m.date, f) && isInSeason(m.seasonId, m.date, season); };

  const seasonCount = (seasonMatches || []).filter((m: any) => inRange(m.date, f) && isInSeason(m.season_id, m.date, season)).length;
  const seasonMinutes = seasonCount * 90;

  // All records in-window (incl. non-appeared → "in squad" minutes); appeared records → performance.
  const allInWindow = (statsRaw || []).filter((s: any) => inWindow(s.match_id));
  const appeared = allInWindow.filter((s: any) => s.appeared === true);

  const byPlayer: Record<string, any[]> = {};
  appeared.forEach((s: any) => { (byPlayer[s.player_id] ||= []).push(s); });
  const squadRecords: Record<string, number> = {};
  allInWindow.forEach((s: any) => { squadRecords[s.player_id] = (squadRecords[s.player_id] || 0) + 1; });

  return players.map((p: any) => {
    const st = byPlayer[p.id] || [];
    const apps = st.length;
    const starts = st.filter((s: any) => s.started === true).length;
    const totalMinutes = st.reduce((n: number, s: any) => n + (s.minutes_played || 0), 0);
    const goals = st.reduce((n: number, s: any) => n + (s.goals || 0), 0);
    const assists = st.reduce((n: number, s: any) => n + (s.assists || 0), 0);
    const yellow = st.reduce((n: number, s: any) => n + (s.yellow_cards || 0), 0);
    const red = st.reduce((n: number, s: any) => n + (s.red_cards || 0), 0);
    const saves = st.reduce((n: number, s: any) => n + (s.saves || 0), 0);
    const cleanSheets = st.filter((s: any) => s.clean_sheet).length;
    const rated = st.filter((s: any) => s.rating != null && s.rating > 0);
    const avgRating = rated.length ? +(rated.reduce((n: number, s: any) => n + s.rating, 0) / rated.length).toFixed(1) : null;
    const motm = st.filter((s: any) => s.motm === true).length;
    const squadMinutes = (squadRecords[p.id] || 0) * 90;
    return {
      id: p.id, name: p.name, position: p.position || '—', group: positionGroup(p.position),
      apps, starts, totalMinutes, seasonMinutes, pctOfSeason: seasonMinutes ? +(totalMinutes / seasonMinutes * 100).toFixed(1) : 0,
      squadMinutes, pctOfSquad: squadMinutes ? +(totalMinutes / squadMinutes * 100).toFixed(1) : 0,
      goals, assists, contributions: goals + assists, yellow, red, avgRating, motm, cleanSheets, saves,
    };
  });
}

// ── Player Performance Matrix (assessment pillars) ─────────────────────────────
export interface PlayerPillarAgg {
  id: string; name: string; position: string; group: string;
  tactical: number | null; technical: number | null; physical: number | null; psychological: number | null;
  globalAvg: number | null; count: number;
}
const avgCat = (cat: any): number | null => {
  if (!cat || typeof cat !== 'object') return typeof cat === 'number' ? cat : null;
  const vals = Object.values(cat).filter((v: any) => v != null && v > 0) as number[];
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};

export async function fetchPlayerPillarMatrix(clubId: string, f: AnalyticsFilter): Promise<PlayerPillarAgg[]> {
  const players = await fetchScopedPlayers(clubId, f);
  if (!players.length) return [];
  const playerIds = players.map(p => p.id);
  let aq = supabase.from('assessments').select('player_id, ratings, date').in('player_id', playerIds).limit(8000);
  if (f.from) aq = aq.gte('date', f.from);
  if (f.to) aq = aq.lte('date', f.to);
  const { data: assessments } = await aq;

  const season = f.season || null;
  const byPlayer: Record<string, any[]> = {};
  (assessments || []).filter((a: any) => isInSeason(null, a.date, season)).forEach((a: any) => { (byPlayer[a.player_id] ||= []).push(a); });

  return players.map((p: any) => {
    const pa = byPlayer[p.id] || [];
    const acc: Record<string, { s: number; c: number }> = { tactical: { s: 0, c: 0 }, technical: { s: 0, c: 0 }, physical: { s: 0, c: 0 }, psychological: { s: 0, c: 0 } };
    const overall: number[] = [];
    pa.forEach((a: any) => {
      let r: any = a.ratings; if (typeof r === 'string') { try { r = JSON.parse(r); } catch { r = {}; } }
      const perPillar: number[] = [];
      (['tactical', 'technical', 'physical', 'psychological'] as const).forEach(k => {
        const v = avgCat(r?.[k]); if (v != null) { acc[k].s += v; acc[k].c++; perPillar.push(v); }
      });
      if (perPillar.length) overall.push(perPillar.reduce((a2, b) => a2 + b, 0) / perPillar.length);
    });
    const g = (k: string) => acc[k].c ? +(acc[k].s / acc[k].c).toFixed(1) : null;
    return {
      id: p.id, name: p.name, position: p.position || '—', group: positionGroup(p.position),
      tactical: g('tactical'), technical: g('technical'), physical: g('physical'), psychological: g('psychological'),
      globalAvg: overall.length ? +(overall.reduce((a, b) => a + b, 0) / overall.length).toFixed(1) : null,
      count: pa.length,
    };
  });
}

// ── Single-player season summary (for the player profile Stats tab) ─────────────
export interface PlayerSeasonSummary {
  apps: number; starts: number; minutes: number; seasonMinutes: number; pctOfSeason: number;
  squadMinutes: number; pctOfSquad: number; goals: number; assists: number; contributions: number;
  yellow: number; red: number; avgRating: number | null; motm: number; cleanSheets: number; saves: number;
}
export async function fetchPlayerSeasonSummary(clubId: string, playerId: string, squadId: string | null, season: Season | null): Promise<PlayerSeasonSummary> {
  const [{ data: stats }, { data: clubMatches }] = await Promise.all([
    supabase.from('match_player_stats').select('*').eq('player_id', playerId).limit(5000),
    supabase.from('matches').select('id, date, season_id, squad_id').eq('club_id', clubId).eq('is_past', true).limit(3000),
  ]);
  const meta: Record<string, any> = {}; (clubMatches || []).forEach((m: any) => { meta[m.id] = m; });
  // A record counts when its match sits in the season (tagged or by date); untagged-unknown matches only count all-time.
  const rows = (stats || []).filter((s: any) => { const m = meta[s.match_id]; return m ? isInSeason(m.season_id, m.date, season) : season == null; });
  const app = rows.filter((s: any) => s.appeared === true);
  const sum = (arr: any[], k: string) => arr.reduce((n, s) => n + (s[k] || 0), 0);
  const minutes = sum(app, 'minutes_played');
  const goals = sum(app, 'goals'), assists = sum(app, 'assists');
  const rated = app.filter((s: any) => s.rating > 0);
  const seasonMatches = (clubMatches || []).filter((m: any) => (squadId ? m.squad_id === squadId : true) && isInSeason(m.season_id, m.date, season)).length;
  const seasonMinutes = seasonMatches * 90;
  const squadMinutes = rows.length * 90;
  return {
    apps: app.length, starts: app.filter((s: any) => s.started).length, minutes, seasonMinutes,
    pctOfSeason: seasonMinutes ? +(minutes / seasonMinutes * 100).toFixed(1) : 0,
    squadMinutes, pctOfSquad: squadMinutes ? +(minutes / squadMinutes * 100).toFixed(1) : 0,
    goals, assists, contributions: goals + assists,
    yellow: sum(app, 'yellow_cards'), red: sum(app, 'red_cards'),
    avgRating: rated.length ? +(rated.reduce((n: number, s: any) => n + s.rating, 0) / rated.length).toFixed(1) : null,
    motm: app.filter((s: any) => s.motm).length, cleanSheets: app.filter((s: any) => s.clean_sheet).length, saves: sum(app, 'saves'),
  };
}

// ── Head-to-Head comparison ────────────────────────────────────────────────────
export interface CompareAgg { apps: number; starts: number; minutes: number; goals: number; assists: number; motm: number; yellow: number; red: number; avgRating: number; per90Goals: number; per90Assists: number; }
const aggregateCompare = (rows: any[]): CompareAgg => {
  const s = rows || [];
  const minutes = s.reduce((n, r) => n + (r.minutes_played || 0), 0);
  const goals = s.reduce((n, r) => n + (r.goals || 0), 0);
  const assists = s.reduce((n, r) => n + (r.assists || 0), 0);
  const rated = s.filter(r => r.rating);
  return {
    apps: s.length, starts: s.filter(r => r.started).length, minutes, goals, assists,
    motm: s.filter(r => r.motm).length, yellow: s.reduce((n, r) => n + (r.yellow_cards || 0), 0), red: s.reduce((n, r) => n + (r.red_cards || 0), 0),
    avgRating: rated.length ? +(rated.reduce((n, r) => n + r.rating, 0) / rated.length).toFixed(1) : 0,
    per90Goals: minutes ? +(goals / minutes * 90).toFixed(2) : 0, per90Assists: minutes ? +(assists / minutes * 90).toFixed(2) : 0,
  };
};
export async function fetchPlayerCompare(idA: string, idB: string): Promise<{ a: CompareAgg; b: CompareAgg }> {
  const [{ data: sA }, { data: sB }] = await Promise.all([
    supabase.from('match_player_stats').select('*').eq('player_id', idA).eq('appeared', true).limit(2000),
    supabase.from('match_player_stats').select('*').eq('player_id', idB).eq('appeared', true).limit(2000),
  ]);
  return { a: aggregateCompare(sA || []), b: aggregateCompare(sB || []) };
}
