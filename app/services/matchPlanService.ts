import { supabase } from '../lib/supabase';

/**
 * Match plans (match_plans table) — the multi-step tactical dossier. The whole
 * plan lives in the `data` jsonb blob; columns track title/match/squad for listing.
 * Ported from match-plan-ui.js (savePlan/loadPlan).
 */
export interface MatchPlan {
  id: string; clubId: string | null; matchId: string | null; squadId: string | null;
  title: string; data: MatchPlanData; createdBy: string | null; shareToken: string | null; createdAt: string; updatedAt: string;
}

export interface PlanLink { url: string; label?: string; type?: 'video' | 'article' }
export interface PlanBoard { formation?: string; slots?: any[]; mode?: 'static' | 'animated'; steps?: any[]; notes?: string; data?: any; animationId?: string | null }
export interface MatchPlanData {
  match: { matchId: string | null; opponent: string; venue: string; date: string; time: string; side: 'home' | 'away' };
  oppIntel: { context: string; collective: string; individual: string; formation: string; links: PlanLink[]; weaknesses: string; strengths: string };
  squad: { formation: string; startingXI: any[]; subs: string[] };
  plans: { planA: PlanBoard; planB: PlanBoard; planC: PlanBoard };
  offense: Record<string, PlanBoard>;
  defense: Record<string, PlanBoard>;
  setPieces: { takers: Record<string, string>; cornersFor: PlanBoard; cornersAgainst: PlanBoard };
  exportSections: Record<string, boolean>;
  [k: string]: any;
}

export function emptyPlanData(): MatchPlanData {
  return {
    match: { matchId: null, opponent: '', venue: '', date: '', time: '', side: 'home' },
    oppIntel: { context: '', collective: '', individual: '', formation: '', links: [], weaknesses: '', strengths: '' },
    squad: { formation: '4-3-3', startingXI: [], subs: [] },
    plans: { planA: { formation: '4-3-3', slots: [], notes: '' }, planB: { formation: '4-3-3', slots: [], notes: '' }, planC: { formation: '4-3-3', slots: [], notes: '' } },
    offense: { buildup: { notes: '' }, transition: { notes: '' }, attack: { notes: '' } },
    defense: { defBlock: { notes: '' }, midPress: { notes: '' }, highPress: { notes: '' } },
    setPieces: { takers: {}, cornersFor: { notes: '' }, cornersAgainst: { notes: '' } },
    exportSections: { squad: true, match: true, oppIntel: true, planA: true, planB: true, planC: true, offense: true, defense: true, setPieces: true },
  };
}

const map = (r: any): MatchPlan => ({
  id: r.id, clubId: r.club_id, matchId: r.match_id, squadId: r.squad_id, title: r.title || 'Untitled Plan',
  data: { ...emptyPlanData(), ...(r.data || {}) }, createdBy: r.created_by || null, shareToken: r.share_token || null, createdAt: r.created_at, updatedAt: r.updated_at,
});

export async function fetchMatchPlans(clubId: string | null, squadIds?: string[] | null): Promise<MatchPlan[]> {
  if (!clubId) return [];
  let q = supabase.from('match_plans').select('*').eq('club_id', clubId).order('updated_at', { ascending: false }).limit(200);
  if (Array.isArray(squadIds)) { if (!squadIds.length) return []; q = q.in('squad_id', squadIds); }
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(map);
}

export async function fetchMatchPlan(id: string): Promise<MatchPlan | null> {
  const { data, error } = await supabase.from('match_plans').select('*').eq('id', id).single();
  if (error) { console.error('Error fetching match plan:', error); return null; }
  return data ? map(data) : null;
}

export async function createMatchPlan(clubId: string, p: { title: string; squadId: string | null; matchId: string | null; data: MatchPlanData; createdBy?: string | null }): Promise<string> {
  const { data, error } = await supabase.from('match_plans').insert({
    club_id: clubId, title: p.title || 'Untitled Plan', squad_id: p.squadId || null, match_id: p.matchId || null,
    data: p.data, ...(p.createdBy ? { created_by: p.createdBy } : {}),
  }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function updateMatchPlan(id: string, p: { title?: string; squadId?: string | null; matchId?: string | null; data?: MatchPlanData }): Promise<void> {
  const row: Record<string, any> = { updated_at: new Date().toISOString() };
  if (p.title !== undefined) row.title = p.title;
  if (p.squadId !== undefined) row.squad_id = p.squadId || null;
  if (p.matchId !== undefined) row.match_id = p.matchId || null;
  if (p.data !== undefined) row.data = p.data;
  const { error } = await supabase.from('match_plans').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteMatchPlan(id: string): Promise<void> {
  const { error } = await supabase.from('match_plans').delete().eq('id', id);
  if (error) throw error;
}

/** Ensure a share token, then build + copy the public dossier link. */
export async function copyMatchPlanShareLink(id: string, existing: string | null): Promise<string> {
  let token = existing;
  if (!token) {
    token = crypto.randomUUID();
    const { error } = await supabase.from('match_plans').update({ share_token: token }).eq('id', id);
    if (error) throw error;
  }
  const url = `${window.location.origin}/dossier/match-plan?token=${token}`;
  try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked — caller still gets the url */ }
  return url;
}

/** Public read-only dossier (SECURITY DEFINER RPC) — no auth required. */
export async function fetchMatchPlanDossier(token: string): Promise<{ plan: any; club: any; squad: any; players: Record<string, any>; animations: Record<string, any> } | null> {
  const { data, error } = await supabase.rpc('get_match_plan_dossier', { p_token: token });
  if (error) throw error;
  return data || null;
}
