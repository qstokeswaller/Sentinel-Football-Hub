import { supabase } from '../lib/supabase';

/** Seasons (competition config) — ported from squad-manager season handling. */
export interface Season {
  id: string; name: string; startDate: string | null; endDate: string | null; isCurrent: boolean;
  leagueName: string | null; division: string | null; ageGroup: string | null; gender: string | null;
  homeVenue: string | null; matchFormat: string | null; matchDuration: number | null;
  winPoints: number | null; drawPoints: number | null; lossPoints: number | null; status: string | null;
}

const map = (s: any): Season => ({
  id: s.id, name: s.name, startDate: s.start_date, endDate: s.end_date, isCurrent: !!s.is_current,
  leagueName: s.league_name, division: s.division, ageGroup: s.age_group, gender: s.gender,
  homeVenue: s.home_venue, matchFormat: s.match_format, matchDuration: s.match_duration,
  winPoints: s.win_points, drawPoints: s.draw_points, lossPoints: s.loss_points, status: s.status,
});

export interface SeasonInput {
  name: string; startDate: string | null; endDate: string | null;
  leagueName: string | null; division: string | null; ageGroup: string | null;
  matchDuration: number | null; winPoints: number; drawPoints: number; lossPoints: number;
}

const toRow = (f: SeasonInput) => ({
  name: f.name.trim(), start_date: f.startDate || null, end_date: f.endDate || null,
  league_name: f.leagueName || null, division: f.division || null, age_group: f.ageGroup || null,
  match_duration: f.matchDuration, win_points: f.winPoints, draw_points: f.drawPoints, loss_points: f.lossPoints,
});

/**
 * Whether a match/record belongs to a season. An explicit `seasonId` (a tagged match) always
 * wins; otherwise we fall back to the record's date sitting inside the season's start–end range,
 * which lets untagged/legacy matches (and date-only sources like training attendance) still be
 * placed in the right season. `season = null` means "all-time" (everything counts).
 */
export function isInSeason(seasonId: string | null | undefined, date: string | null | undefined, season: Season | null): boolean {
  if (!season) return true;
  if (seasonId) return seasonId === season.id;
  if (!date) return false;
  if (season.startDate && date < season.startDate) return false;
  if (season.endDate && date > season.endDate) return false;
  return !!(season.startDate || season.endDate); // an untagged record needs a range to be placed
}

export async function fetchSeasons(clubId: string | null): Promise<Season[]> {
  let q = supabase.from('seasons').select('*').order('is_current', { ascending: false }).order('start_date', { ascending: false, nullsFirst: false }).limit(200);
  if (clubId) q = q.eq('club_id', clubId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(map);
}

export async function createSeason(clubId: string, f: SeasonInput): Promise<void> {
  const { error } = await supabase.from('seasons').insert({ club_id: clubId, status: 'active', ...toRow(f) });
  if (error) throw error;
}

export async function updateSeason(id: string, f: SeasonInput): Promise<void> {
  const { error } = await supabase.from('seasons').update(toRow(f)).eq('id', id);
  if (error) throw error;
}

export async function deleteSeason(id: string): Promise<void> {
  const { error } = await supabase.from('seasons').delete().eq('id', id);
  if (error) throw error;
}

/** Set one season current for the club (clears the flag on all others first). */
export async function setCurrentSeason(clubId: string, id: string): Promise<void> {
  const { error: e1 } = await supabase.from('seasons').update({ is_current: false }).eq('club_id', clubId);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('seasons').update({ is_current: true }).eq('id', id);
  if (e2) throw e2;
}
