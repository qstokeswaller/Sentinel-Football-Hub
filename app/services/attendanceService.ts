import { supabase } from '../lib/supabase';

/**
 * Training attendance — ported from training-register-ui.js. One row per
 * session+squad; everyone is present except those in absent_player_ids (jsonb).
 */
export interface AttendanceRecord { absentPlayerIds: string[]; notes: string; }

export async function fetchAttendance(sessionId: string, squadId: string): Promise<AttendanceRecord | null> {
  const { data } = await supabase.from('training_attendance').select('*')
    .eq('session_id', sessionId).eq('squad_id', squadId).maybeSingle();
  if (!data) return null;
  const absent = Array.isArray(data.absent_player_ids)
    ? data.absent_player_ids
    : (typeof data.absent_player_ids === 'string' ? JSON.parse(data.absent_player_ids) : []);
  return { absentPlayerIds: absent, notes: data.notes || '' };
}

/** Raw attendance records for analytics (the registry "history" as data). Scope-aware. */
export interface AttRecord { squadId: string | null; date: string | null; absentPlayerIds: string[]; count: number; total: number; }

export async function fetchAttendanceRecords(clubId: string | null, coachSquadIds?: string[] | null): Promise<AttRecord[]> {
  let q = supabase.from('training_attendance').select('squad_id, date, absent_player_ids, attendance_count, attendance_total').order('date', { ascending: false }).limit(3000);
  if (clubId) q = q.eq('club_id', clubId);
  if (Array.isArray(coachSquadIds)) { if (!coachSquadIds.length) return []; q = q.in('squad_id', coachSquadIds); }
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((r: any) => ({
    squadId: r.squad_id,
    date: r.date,
    absentPlayerIds: Array.isArray(r.absent_player_ids) ? r.absent_player_ids : (typeof r.absent_player_ids === 'string' ? (JSON.parse(r.absent_player_ids) || []) : []),
    count: r.attendance_count ?? 0,
    total: r.attendance_total ?? 0,
  }));
}

/** Session ids that already have a saved attendance record (for the calendar badge). */
export async function fetchCompletedSessionIds(): Promise<Set<string>> {
  const { data } = await supabase.from('training_attendance').select('session_id').limit(2000);
  return new Set((data || []).map((r: any) => r.session_id));
}

export async function saveAttendance(params: {
  clubId: string; sessionId: string; squadId: string; date: string | null;
  absentPlayerIds: string[]; present: number; total: number; notes: string;
}): Promise<void> {
  const row = {
    club_id: params.clubId,
    session_id: params.sessionId,
    squad_id: params.squadId,
    date: params.date || new Date().toISOString().split('T')[0],
    absent_player_ids: params.absentPlayerIds,
    attendance_count: params.present,
    attendance_total: params.total,
    notes: params.notes,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('training_attendance').upsert(row, { onConflict: 'session_id,squad_id' });
  if (error) throw error;

  // Best-effort: sync attendance to a session report if one exists (ported behavior).
  try {
    const { data: rep } = await supabase.from('reports').select('id').eq('session_id', params.sessionId).maybeSingle();
    if (rep) {
      await supabase.from('reports').update({
        attendance_count: params.present, attendance_total: params.total, absent_player_ids: params.absentPlayerIds,
      }).eq('id', rep.id);
    }
  } catch (e) { console.warn('Report attendance sync skipped:', e); }
}

const POS_ORDER: Record<string, number> = {
  GK: 0, CB: 1, LB: 1, RB: 1, LWB: 1, RWB: 1, CDM: 2, CM: 2, CAM: 2, LM: 2, RM: 2, ST: 3, LW: 3, RW: 3, CF: 3, Winger: 3,
};
export function positionOrder(pos?: string): number {
  if (!pos) return 99;
  const primary = pos.split(',')[0].trim();
  return POS_ORDER[primary] ?? 99;
}
