import { supabase } from '../lib/supabase';

/**
 * Session reflection reports — ported from src/js/reports-ui.js. Each report
 * reflects on a session: attendance, rating, intensity, notes, drill notes.
 */
export interface Report {
  id: string; sessionId: string | null; date: string | null;
  attendanceCount: number; attendanceTotal: number; absentPlayerIds: string[];
  rating: number; intensity: string | null; notes: string | null;
  drillNotes: Record<string, any>; createdAt: string; sessionTitle: string | null;
  team: string | null; createdBy: string | null; authorName: string | null;
  shareToken: string | null;
  [key: string]: any;
}

function parseArr(v: any): any[] { return Array.isArray(v) ? v : (typeof v === 'string' ? (() => { try { return JSON.parse(v || '[]'); } catch { return []; } })() : []); }
function parseObj(v: any): any { return v && typeof v === 'object' ? v : (typeof v === 'string' ? (() => { try { return JSON.parse(v || '{}'); } catch { return {}; } })() : {}); }

export async function fetchReports(clubId: string | null): Promise<Report[]> {
  let rq = supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(500);
  if (clubId) rq = rq.eq('club_id', clubId);
  let sq = supabase.from('sessions').select('id, title, date, team').limit(1000);
  if (clubId) sq = sq.eq('club_id', clubId);

  const [{ data: reports, error }, { data: sessions }] = await Promise.all([rq, sq]);
  if (error) throw error;
  const sessMap: Record<string, any> = Object.fromEntries((sessions || []).map((s: any) => [s.id, s]));

  // Resolve author names from created_by → profiles (the person who recorded the report).
  const authorIds = [...new Set((reports || []).map((r: any) => r.created_by).filter(Boolean))] as string[];
  const names: Record<string, string> = {};
  if (authorIds.length) {
    const { data } = await supabase.from('profiles').select('id, full_name').in('id', authorIds);
    (data || []).forEach((p: any) => { names[p.id] = p.full_name || 'Coach'; });
  }

  return (reports || []).map((r: any) => {
    const sess = r.session_id ? sessMap[r.session_id] : null;
    return {
      id: r.id, sessionId: r.session_id, date: r.date || sess?.date || null,
      attendanceCount: r.attendance_count || 0, attendanceTotal: r.attendance_total || 0,
      absentPlayerIds: parseArr(r.absent_player_ids), rating: r.rating || 0, intensity: r.intensity || null,
      notes: r.notes || null, drillNotes: parseObj(r.drill_notes), createdAt: r.created_at,
      sessionTitle: sess?.title || null, team: sess?.team || null,
      createdBy: r.created_by || null, authorName: r.created_by ? (names[r.created_by] || null) : null,
      shareToken: r.share_token || null,
    };
  });
}

export interface NewReport {
  sessionId: string | null; date: string; attendanceCount: string; attendanceTotal: string;
  rating: number; intensity: string; notes: string; createdBy?: string | null;
}

export async function createReport(clubId: string, r: NewReport): Promise<void> {
  const num = (v: string) => v === '' || v == null ? 0 : parseInt(v, 10) || 0;
  const { error } = await supabase.from('reports').insert({
    club_id: clubId, session_id: r.sessionId || null, date: r.date || null,
    attendance_count: num(r.attendanceCount), attendance_total: num(r.attendanceTotal),
    absent_player_ids: [], rating: r.rating || 0, intensity: r.intensity || null, notes: r.notes || null,
    ...(r.createdBy ? { created_by: r.createdBy } : {}),
  });
  if (error) throw error;
}

export async function deleteReport(id: string): Promise<void> {
  const { error } = await supabase.from('reports').delete().eq('id', id);
  if (error) throw error;
}
