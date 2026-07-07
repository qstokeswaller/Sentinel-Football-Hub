import { supabase } from '../lib/supabase';

/**
 * Player assessments — ported from squad-manager.getAssessments. ratings is a
 * nested jsonb { category: { attribute: number(1–5) } }. The radar plots
 * per-category averages (version-agnostic across the V2/legacy report shapes).
 */
export interface Assessment {
  id: string; playerId: string; matchId: string | null; date: string;
  type: string; ratings: Record<string, Record<string, number>>; notes: string;
  author: string; createdAt: string;
}

export interface NewAssessment { date: string; type: string; ratings: Record<string, Record<string, number>>; notes: string; author: string; matchId?: string | null; }

export async function createAssessment(clubId: string, playerId: string, a: NewAssessment): Promise<void> {
  const { error } = await supabase.from('assessments').insert({
    club_id: clubId, player_id: playerId, date: a.date || null, type: a.type || null,
    ratings: a.ratings, notes: a.notes || null, author: a.author || null,
    ...(a.matchId ? { match_id: a.matchId } : {}),
  });
  if (error) throw error;
}

export async function deleteAssessment(id: string): Promise<void> {
  const { error } = await supabase.from('assessments').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchAssessments(playerId: string): Promise<Assessment[]> {
  const { data, error } = await supabase.from('assessments').select('*')
    .eq('player_id', playerId).order('created_at', { ascending: false }).limit(100);
  if (error) { console.error('Error fetching assessments:', error); return []; }
  return (data || []).map((a: any) => ({
    id: a.id, playerId: a.player_id, matchId: a.match_id, date: a.date, type: a.type,
    ratings: a.ratings || {}, notes: a.notes || '', author: a.author || '', createdAt: a.created_at,
  }));
}

export function globalAverage(ratings: Record<string, any>): number | null {
  const vals: number[] = [];
  Object.values(ratings || {}).forEach((cat: any) => {
    if (cat && typeof cat === 'object') Object.values(cat).forEach((v: any) => { if (typeof v === 'number' && v > 0) vals.push(v); });
  });
  return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
}

/** Per-category averages for the radar axes. */
export function categoryAverages(ratings: Record<string, any>): { category: string; value: number }[] {
  return Object.entries(ratings || {}).map(([cat, attrs]: [string, any]) => {
    const vals = (attrs && typeof attrs === 'object') ? (Object.values(attrs).filter(v => typeof v === 'number' && (v as number) > 0) as number[]) : [];
    const avg = vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : 0;
    return { category: cat.charAt(0).toUpperCase() + cat.slice(1), value: avg };
  }).filter(c => c.value > 0);
}
