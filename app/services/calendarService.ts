import { supabase } from '../lib/supabase';

/**
 * Calendar data — sessions + calendar_events + matches aggregated for the dashboard.
 * Ported from src/js/calendar-ui.js. Bakes in the CLAUDE.md performance rules:
 * club_id scope, a date window (3 months back / 6 forward), .limit(), Promise.all,
 * and coach squad-scoping on matches.
 */

export interface CalSession { id: string; title: string; date: string; startTime: string | null; team: string | null; venue: string | null; purpose: string | null; playerIds: string[]; _type: 'session'; }
export interface CalEvent { id: string; title: string; eventType: string; date: string; startTime: string | null; color: string | null; location: string | null; _type: 'event'; }
export interface CalMatch { id: string; squadId: string | null; date: string; time: string | null; opponent: string | null; matchType: string; isPast: boolean; homeScore: number | null; awayScore: number | null; watchedPlayerName: string; squadName: string; _type: 'match'; }

export interface CalendarItems { sessions: CalSession[]; events: CalEvent[]; matches: CalMatch[]; teamColors: Record<string, string>; }

/** Who's looking — drives calendar scoping. */
export interface CalScope { userId: string | null; isAdmin: boolean; coachSquadIds: string[] | null; }

// Distinct, readable bubble colours assigned per squad so admins can tell teams apart at a glance.
const TEAM_PALETTE = ['#00C49A', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6', '#ef4444', '#22c55e', '#6366f1', '#0ea5e9', '#f97316', '#84cc16', '#a855f7', '#e11d48', '#0891b2', '#ca8a04'];

function windowDates() {
  const from = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
  const to = new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0];
  return { from, to };
}

export async function fetchCalendarItems(clubId: string | null, scope: CalScope): Promise<CalendarItems> {
  const { from, to } = windowDates();
  const { userId, isAdmin, coachSquadIds } = scope;

  const sessionsQ = (() => {
    let q = supabase.from('sessions')
      .select('id, title, date, start_time, venue, team, purpose, player_ids')
      .eq('is_template', false)
      .gte('date', from).lte('date', to).order('date', { ascending: true }).limit(500);
    if (clubId) q = q.eq('club_id', clubId);
    // Sessions: coaches see only the ones THEY created; admins see every squad's sessions.
    if (!isAdmin && userId) q = q.eq('created_by', userId);
    return q;
  })();

  const eventsQ = (() => {
    let q = supabase.from('calendar_events')
      .select('*')
      .gte('date', from).lte('date', to).order('date', { ascending: true }).limit(500);
    if (clubId) q = q.eq('club_id', clubId);
    return q;
  })();

  const matchesQ = (() => {
    let q = supabase.from('matches')
      .select('id, squad_id, date, time, opponent, match_type, is_past, home_score, away_score, watched_player_id')
      .gte('date', from).lte('date', to).order('date', { ascending: true }).limit(500);
    if (clubId) q = q.eq('club_id', clubId);
    // Coach scoping: null = admin (all), [] = no squads (none), [ids] = restrict
    if (Array.isArray(coachSquadIds)) {
      if (coachSquadIds.length === 0) return null;
      q = q.in('squad_id', coachSquadIds);
    }
    return q;
  })();

  const squadsQ = (() => {
    let q = supabase.from('squads').select('id, name');
    if (clubId) q = q.eq('club_id', clubId);
    return q;
  })();

  const [sRes, eRes, mRes, sqRes] = await Promise.all([
    sessionsQ, eventsQ, matchesQ ?? Promise.resolve({ data: [] }), squadsQ,
  ]);

  const squadNames: Record<string, string> = {};
  (sqRes.data || []).forEach((s: any) => { squadNames[s.id] = s.name; });
  // Stable per-team bubble colour, keyed by squad name (sessions store the team NAME, not an id).
  const teamColors: Record<string, string> = {};
  [...(sqRes.data || [])].sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)))
    .forEach((s: any, i: number) => { teamColors[String(s.name).trim().toLowerCase()] = TEAM_PALETTE[i % TEAM_PALETTE.length]; });

  // Resolve watched-player names for player_watch matches
  const watchedIds = (mRes.data || []).filter((m: any) => m.match_type === 'player_watch' && m.watched_player_id).map((m: any) => m.watched_player_id);
  const playerNames: Record<string, string> = {};
  if (watchedIds.length) {
    const { data: players } = await supabase.from('players').select('id, name').in('id', watchedIds);
    (players || []).forEach((p: any) => { playerNames[p.id] = p.name; });
  }

  return {
    sessions: (sRes.data || []).map((s: any) => ({
      id: s.id, title: s.title, date: s.date, startTime: s.start_time, team: s.team, venue: s.venue, purpose: s.purpose, playerIds: s.player_ids || [], _type: 'session',
    })),
    // Events are PER-USER — you only see your own (admins included). Legacy events with no
    // creator stay visible to admins so nothing silently disappears.
    events: (eRes.data || [])
      .filter((e: any) => e.created_by === userId || (isAdmin && !e.created_by))
      .map((e: any) => ({
        id: e.id, title: e.title, eventType: e.event_type, date: e.date, startTime: e.start_time, color: e.color, location: e.location, _type: 'event',
      })),
    matches: (mRes.data || []).map((m: any) => ({
      id: m.id, squadId: m.squad_id, date: m.date, time: m.time, opponent: m.opponent,
      matchType: m.match_type || 'team', isPast: m.is_past, homeScore: m.home_score, awayScore: m.away_score,
      watchedPlayerName: playerNames[m.watched_player_id] || '', squadName: squadNames[m.squad_id] || 'Unknown', _type: 'match',
    })),
    teamColors,
  };
}
