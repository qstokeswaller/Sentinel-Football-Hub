import { supabase } from '../lib/supabase';
import { normaliseDrawingData } from '../components/pitch/drillRenderer';
import type { PitchObject, PitchDrawing } from '../components/pitch/PitchCanvas';
import type { PitchType, PitchOrientation, GridType } from '../components/pitch/pitchGeometry';

/** Library data — saved sessions (with their drills) + the standalone drill library.
 *  Club-scoped. Now carries thumbnails + render data for previews. */
export interface LibSessionDrill { id: string; title: string; description: string | null; duration: string | number | null; image: string | null; pitchType: PitchType; orientation: PitchOrientation; objects: PitchObject[]; drawings: PitchDrawing[]; flip: boolean; grid?: GridType; gridColor?: string; animationId: string | null }
export interface LibSession {
  id: string; title: string; team: string | null; venue: string | null; purpose: string | null;
  duration: string | number | null; categoryTag: string | null; date: string | null; author: string | null;
  image: string | null; drills: LibSessionDrill[]; drillCount: number; shareToken: string | null; createdBy: string | null;
}
export interface LibDrill {
  id: string; title: string; categoryTag: string | null; duration: string | number | null;
  equipment: string | null; purpose: string | null; description: string | null; author: string | null;
  image: string | null; pitchType: PitchType; orientation: PitchOrientation; objects: PitchObject[]; drawings: PitchDrawing[]; flip: boolean; grid?: GridType; gridColor?: string;
  animationId: string | null; shareToken: string | null; createdBy: string | null;
}

const mapDrill = (d: any, thumbs: Record<string, string> = {}): LibSessionDrill => {
  const dd = normaliseDrawingData(d.drawing_data);
  // Animated drills have no static layer — fall back to the animation's first-frame thumbnail
  // so the preview reads neatly like a static drill.
  const image = d.image || (d.animation_id ? thumbs[d.animation_id] : null) || null;
  return { id: d.id, title: d.title, description: d.description || null, duration: d.duration, image, pitchType: (d.pitch_type || 'full') as PitchType, orientation: (d.orientation || 'landscape') as PitchOrientation, objects: dd.objects, drawings: dd.drawings, flip: dd.flip, grid: dd.grid, gridColor: dd.gridColor, animationId: d.animation_id || null };
};

/** Fetch first-frame thumbnails for a set of animation ids → { [id]: dataUrl }. */
async function fetchAnimThumbs(ids: (string | null)[]): Promise<Record<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))] as string[];
  if (!uniq.length) return {};
  const { data } = await supabase.from('animations').select('id, thumbnail').in('id', uniq);
  const out: Record<string, string> = {};
  (data || []).forEach((a: any) => { if (a.thumbnail) out[a.id] = a.thumbnail; });
  return out;
}

export async function fetchLibrarySessions(clubId: string | null): Promise<LibSession[]> {
  let q = supabase.from('sessions').select('*, drills(*)').eq('is_template', false).order('created_at', { ascending: false }).limit(500);
  if (clubId) q = q.eq('club_id', clubId);
  const { data, error } = await q;
  if (error) throw error;
  const thumbs = await fetchAnimThumbs((data || []).flatMap((s: any) => (s.drills || []).map((d: any) => d.animation_id)));
  return (data || []).map((s: any) => {
    const drills = (s.drills || []).sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0)).map((d: any) => mapDrill(d, thumbs));
    return {
      id: s.id, title: s.title, team: s.team, venue: s.venue, purpose: s.purpose, duration: s.duration,
      categoryTag: s.category_tag, date: s.date, author: s.author,
      image: s.image || drills.find((d: LibSessionDrill) => d.image)?.image || null,
      drills, drillCount: drills.length, shareToken: s.share_token || null, createdBy: s.created_by || null,
    };
  });
}

export async function fetchLibraryDrills(clubId: string | null): Promise<LibDrill[]> {
  let q = supabase.from('drills').select('*').order('created_at', { ascending: false }).limit(1000);
  if (clubId) q = q.eq('club_id', clubId);
  const { data, error } = await q;
  if (error) throw error;
  const thumbs = await fetchAnimThumbs((data || []).map((d: any) => d.animation_id));
  return (data || []).map((d: any) => {
    const dd = normaliseDrawingData(d.drawing_data);
    return {
      id: d.id, title: d.title, categoryTag: d.category_tag, duration: d.duration,
      equipment: d.equipment, purpose: d.purpose, description: d.description, author: d.author || null,
      image: d.image || (d.animation_id ? thumbs[d.animation_id] : null) || null,
      pitchType: (d.pitch_type || 'full') as PitchType, orientation: (d.orientation || 'landscape') as PitchOrientation,
      objects: dd.objects, drawings: dd.drawings, flip: dd.flip, grid: dd.grid, gridColor: dd.gridColor, animationId: d.animation_id || null, shareToken: d.share_token || null,
      createdBy: d.created_by || null,
    };
  });
}

export async function deleteLibrarySession(id: string): Promise<void> {
  const { error } = await supabase.from('sessions').delete().eq('id', id);
  if (error) throw error;
}
export async function deleteLibraryDrill(id: string): Promise<void> {
  const { error } = await supabase.from('drills').delete().eq('id', id);
  if (error) throw error;
}
