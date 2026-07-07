import { supabase } from '../lib/supabase';

/**
 * Squad-level assessments (squad_assessments table) — ported from squad-manager
 * saveSquadAssessment/getSquadAssessments. Group ratings (1–10) + qualitative feedback.
 */
export interface SquadAssessment {
  id: string; squadId: string; date: string; context: string;
  ratings: { tactical?: number; physical?: number; mentality?: number; overall?: number };
  feedback: { strengths?: string; improvements?: string; notes?: string };
  author: string; createdAt: string;
}

export interface NewSquadAssessment {
  squadId: string; date: string; context: string;
  ratings: SquadAssessment['ratings']; feedback: SquadAssessment['feedback']; author?: string;
}

/** All squad assessments for a club (Team Reports list), with squad-id scope for coaches. */
export async function fetchClubSquadAssessments(clubId: string | null, squadIds?: string[] | null): Promise<SquadAssessment[]> {
  if (!clubId) return [];
  let q = supabase.from('squad_assessments').select('*').eq('club_id', clubId).order('created_at', { ascending: false }).limit(300);
  if (Array.isArray(squadIds)) { if (!squadIds.length) return []; q = q.in('squad_id', squadIds); }
  const { data, error } = await q;
  if (error) { console.error('Error fetching club squad assessments:', error); return []; }
  return (data || []).map((s: any) => ({
    id: s.id, squadId: s.squad_id, date: s.date, context: s.context || '',
    ratings: s.ratings || {}, feedback: s.feedback || {}, author: s.author || '', createdAt: s.created_at,
  }));
}

export async function fetchSquadAssessments(squadId: string): Promise<SquadAssessment[]> {
  const { data, error } = await supabase.from('squad_assessments').select('*')
    .eq('squad_id', squadId).order('created_at', { ascending: false }).limit(100);
  if (error) { console.error('Error fetching squad assessments:', error); return []; }
  return (data || []).map((s: any) => ({
    id: s.id, squadId: s.squad_id, date: s.date, context: s.context || '',
    ratings: s.ratings || {}, feedback: s.feedback || {}, author: s.author || '', createdAt: s.created_at,
  }));
}

export async function createSquadAssessment(clubId: string, a: NewSquadAssessment): Promise<void> {
  const { error } = await supabase.from('squad_assessments').insert({
    club_id: clubId, squad_id: a.squadId, date: a.date || null, context: a.context || '',
    ratings: a.ratings || {}, feedback: a.feedback || {}, author: a.author || '',
  });
  if (error) throw error;
}

export async function deleteSquadAssessment(id: string): Promise<void> {
  const { error } = await supabase.from('squad_assessments').delete().eq('id', id);
  if (error) throw error;
}
