import { supabase } from '../lib/supabase';

/** Global dashboard search — on-demand ilike across the club's core entities. */
export interface SearchResult { id: string; label: string; sub: string; kind: 'player' | 'squad' | 'match' | 'session' | 'scouted'; to: string; }

export async function globalSearch(clubId: string | null, query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!clubId || q.length < 2) return [];
  const like = `%${q}%`;
  const base = (t: string) => supabase.from(t).select('*').eq('club_id', clubId).limit(6);

  const [players, squads, matches, sessions, scouted] = await Promise.all([
    base('players').ilike('name', like),
    base('squads').ilike('name', like),
    base('matches').ilike('opponent', like),
    base('sessions').ilike('title', like),
    base('scouted_players').ilike('name', like),
  ]);

  const out: SearchResult[] = [];
  for (const p of (players.data || [])) out.push({ id: p.id, label: p.name, sub: [p.position, p.jersey_number ? `#${p.jersey_number}` : ''].filter(Boolean).join(' · ') || 'Player', kind: 'player', to: `/players/${p.id}` });
  for (const s of (squads.data || [])) out.push({ id: s.id, label: s.name, sub: s.age_group || 'Squad', kind: 'squad', to: '/squad' });
  for (const m of (matches.data || [])) out.push({ id: m.id, label: `vs ${m.opponent || '—'}`, sub: [m.competition, m.date].filter(Boolean).join(' · ') || 'Match', kind: 'match', to: '/matches' });
  for (const s of (sessions.data || [])) out.push({ id: s.id, label: s.title || 'Untitled session', sub: [s.team, s.date].filter(Boolean).join(' · ') || 'Session', kind: 'session', to: `/planner/${s.id}` });
  for (const p of (scouted.data || [])) out.push({ id: p.id, label: p.name, sub: [p.position, p.current_club].filter(Boolean).join(' · ') || 'Scouted', kind: 'scouted', to: '/scouting' });
  return out;
}
