import { supabase } from '../lib/supabase';
import type { PitchObject, PitchDrawing } from '../components/pitch/PitchCanvas';
import type { PitchType, PitchOrientation, GridType } from '../components/pitch/pitchGeometry';

/**
 * Tactical animations (animations table). An animation is an ordered list of authored
 * keyframes; each frame holds object positions + static drawings on a pitch. Playback
 * interpolates between frames. New {objects,drawings} format; fetch tolerates the legacy
 * {shapes} frames so old animations still play.
 */
export interface AnimationFrame { objects: PitchObject[]; drawings: PitchDrawing[] }
export interface AnimationData {
  id?: string; title: string; frameDuration: number;
  pitchType: PitchType; orientation: PitchOrientation; flip?: boolean; grid?: GridType; gridColor?: string; frames: AnimationFrame[]; thumbnail?: string | null;
}

function normaliseFrame(f: any): AnimationFrame {
  if (Array.isArray(f?.objects) || Array.isArray(f?.drawings)) return { objects: f.objects || [], drawings: f.drawings || [] };
  // legacy {shapes:[{type,x,y,label}]}
  const objects: PitchObject[] = (f?.shapes || []).map((s: any) => ({
    id: s.id || Math.random().toString(36).slice(2), type: s.type === 'ball' ? 'ball' : s.type === 'cone' ? 'cone' : 'player',
    x: s.x, y: s.y, color: s.type === 'cone' ? '#f97316' : '#e53935', size: 'medium', label: s.label,
  }));
  return { objects, drawings: [] };
}

export async function fetchAnimation(id: string): Promise<AnimationData> {
  const { data, error } = await supabase.from('animations').select('*').eq('id', id).single();
  if (error) throw error;
  const frames = (Array.isArray(data.frames) && data.frames.length ? data.frames : [{ objects: [], drawings: [] }]).map(normaliseFrame);
  return {
    id: data.id, title: data.title || '', frameDuration: data.frame_duration || 1500,
    pitchType: (data.pitch_type || 'full') as PitchType, orientation: (data.orientation || 'landscape') as PitchOrientation,
    flip: !!data.flip, grid: (data.grid || 'none') as GridType, gridColor: data.grid_color || undefined, frames, thumbnail: data.thumbnail || null,
  };
}

export async function saveAnimation(clubId: string, createdBy: string | null, anim: AnimationData): Promise<string> {
  const row: any = {
    club_id: clubId, created_by: createdBy, title: anim.title.trim() || 'Untitled Animation',
    frame_duration: anim.frameDuration, frames: anim.frames, pitch_type: anim.pitchType,
    orientation: anim.orientation, flip: !!anim.flip, grid: anim.grid || 'none', grid_color: anim.gridColor || null, thumbnail: anim.thumbnail || null,
  };
  if (anim.id) {
    const { error } = await supabase.from('animations').update(row).eq('id', anim.id);
    if (error) throw error;
    return anim.id;
  }
  const { data, error } = await supabase.from('animations').insert(row).select('id').single();
  if (error) throw error;
  return data.id;
}
