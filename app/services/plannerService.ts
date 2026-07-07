import { supabase } from '../lib/supabase';
import type { PitchObject, PitchDrawing, PitchConnector } from '../components/pitch/PitchCanvas';
import type { PitchType, PitchOrientation, GridType } from '../components/pitch/pitchGeometry';
import { normaliseDrawingData } from '../components/pitch/drillRenderer';
import { parseEquipment, type EquipmentItem } from '../lib/equipment';

/**
 * Session planner persistence (full v7 parity). A session has rich metadata +
 * editable phases + an ordered list of drills grouped by phase. Each drill carries
 * a pitch (type/orientation) and its objects/drawings (drawing_data), an optional
 * thumbnail (image) and an optional link to a saved animation (animation_id) when the
 * drill is animated. The DB already had every column — the old port just ignored them.
 */
export interface PlannerDrill {
  id?: string;
  title: string;
  description: string;
  pitchType: PitchType;
  orientation: PitchOrientation;
  objects: PitchObject[];
  drawings: PitchDrawing[];
  connectors?: PitchConnector[];
  fillShapes?: boolean;
  phase: number;
  categoryTag?: string;
  videoUrl?: string;
  animationId?: string | null;
  image?: string | null;
  flip?: boolean;
  grid?: GridType;
  gridColor?: string;
  /** UI-only: which editor the drill block shows (Static pitch builder vs Animated builder).
   *  Never persisted — saveSession/saveDrillToLibrary build explicit rows and ignore it. */
  mode?: 'static' | 'animated';
}
export interface PlannerSession {
  id?: string;
  title: string;
  date: string;
  startTime: string;
  duration: string;
  team: string;
  playersCount: string;
  abilityLevel: string;
  equipment: string;
  purpose: string;
  author: string;
  venue: string;
  categoryTag?: string;
  playerIds: string[];
  phases: string[];
  isTemplate?: boolean;
}

export const DEFAULT_PHASES = ['Warm Up', 'Main Session', 'Cool Down'];
export const emptyDrill = (phase = 0): PlannerDrill => ({
  title: '', description: '', pitchType: 'full', orientation: 'landscape', objects: [], drawings: [], phase, categoryTag: 'General',
});
export const emptySession = (): PlannerSession => ({
  title: '', date: '', startTime: '', duration: '', team: '', playersCount: '', abilityLevel: '',
  equipment: '', purpose: '', author: '', venue: '', playerIds: [], phases: [...DEFAULT_PHASES],
});

/** Map a stored drawing_data blob → { objects, drawings }, tolerating the old {shapes} format. */
// Delegate to the shared normaliser so the builder-load path tolerates every legacy shape
// (stringified blobs, v7 {tokens,paths} px, {shapes}) exactly like thumbnails/share do.
function readDrawing(d: any): { objects: PitchObject[]; drawings: PitchDrawing[]; connectors: PitchConnector[]; fillShapes: boolean; flip: boolean; grid: GridType; gridColor?: string } {
  return normaliseDrawingData(d.drawing_data);
}

export async function fetchSessionForEdit(id: string): Promise<{ session: PlannerSession; drills: PlannerDrill[] }> {
  const { data, error } = await supabase.from('sessions').select('*, drills(*)').eq('id', id).single();
  if (error) throw error;
  const phases: string[] = Array.isArray(data.session_phases) && data.session_phases.length ? data.session_phases : [...DEFAULT_PHASES];
  const drills: PlannerDrill[] = (data.drills || [])
    .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
    .map((d: any) => {
      const { objects, drawings, connectors, fillShapes, flip, grid, gridColor } = readDrawing(d);
      return {
        id: d.id, title: d.title || '', description: d.description || '', // raw JSON sections blob — DrillDescription parses it
        pitchType: (d.pitch_type || 'full') as PitchType, orientation: (d.orientation || 'landscape') as PitchOrientation,
        objects, drawings, connectors, fillShapes, flip, grid, gridColor, phase: d.phase ?? 0, categoryTag: d.category_tag || undefined,
        videoUrl: d.video_url || undefined, animationId: d.animation_id || null, image: d.image || null,
      };
    });
  return {
    session: {
      id: data.id, title: data.title || '', date: data.date || '', startTime: data.start_time || '',
      duration: data.duration != null ? String(data.duration) : '', team: data.team || '',
      playersCount: data.players_count != null ? String(data.players_count) : '', abilityLevel: data.ability_level || '',
      equipment: data.equipment || '', purpose: data.purpose || '', author: data.author || '', venue: data.venue || '',
      categoryTag: data.category_tag || undefined, playerIds: Array.isArray(data.player_ids) ? data.player_ids : [],
      phases, isTemplate: !!data.is_template,
    },
    drills,
  };
}

export async function saveSession(clubId: string, createdBy: string | null, session: PlannerSession, drills: PlannerDrill[], opts?: { asTemplate?: boolean; creatorName?: string | null }): Promise<string> {
  const firstImg = drills.find(d => d.image)?.image || null;
  const creator = opts?.creatorName?.trim() || null; // auto-shown on cards + share pages
  const row: any = {
    club_id: clubId, title: session.title.trim(), date: session.date || null, start_time: session.startTime || null,
    duration: session.duration || null, team: session.team || null, players_count: session.playersCount || null,
    ability_level: session.abilityLevel || null, equipment: session.equipment || null, purpose: session.purpose || null,
    author: session.author?.trim() || creator, venue: session.venue || null,
    player_ids: session.playerIds || [], session_phases: session.phases, image: firstImg,
    is_template: opts?.asTemplate ?? session.isTemplate ?? false,
  };
  const asTemplate = !!opts?.asTemplate;
  let sessionId = session.id;
  if (sessionId && !asTemplate) {
    const { error } = await supabase.from('sessions').update(row).eq('id', sessionId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('sessions').insert({ ...row, created_by: createdBy }).select('id').single();
    if (error) throw error;
    sessionId = data.id;
  }

  const baseRow = (d: PlannerDrill, i: number) => ({
    club_id: clubId, session_id: sessionId, created_by: createdBy, author: creator,
    title: d.title.trim() || `Drill ${i + 1}`, description: d.description || null,
    pitch_type: d.pitchType, orientation: d.orientation,
    drawing_data: { objects: d.objects, drawings: d.drawings, connectors: d.connectors || [], fillShapes: d.fillShapes || false, flip: d.flip || false, grid: d.grid || 'none', gridColor: d.gridColor || null },
    image: d.image || null, phase: d.phase, category_tag: d.categoryTag || null,
    video_url: d.videoUrl || null, animation_id: d.animationId || null, order_index: i,
  });

  if (asTemplate) {
    // A template is a fresh, detached COPY of the drills — never reuse the drill ids, or we'd
    // move the originals out of their session into the template.
    if (drills.length) {
      const { error } = await supabase.from('drills').insert(drills.map((d, i) => baseRow(d, i)));
      if (error) throw error;
    }
  } else {
    // Reconcile by id (works for new AND existing sessions): a drill that already has a row —
    // e.g. one saved earlier via "Save to library" — is UPDATED in place and attached to this
    // session, never duplicated. New drills are inserted; drills dropped from the session are deleted.
    const keepIds = drills.filter(d => d.id).map(d => d.id) as string[];
    let delQ = supabase.from('drills').delete().eq('session_id', sessionId);
    if (keepIds.length) delQ = delQ.not('id', 'in', `(${keepIds.join(',')})`);
    const { error: delErr } = await delQ;
    if (delErr) throw delErr;
    const updates = drills.map((d, i) => ({ ...baseRow(d, i), id: d.id! })).filter((_, i) => !!drills[i].id);
    const inserts = drills.map((d, i) => baseRow(d, i)).filter((_, i) => !drills[i].id);
    if (updates.length) { const { error } = await supabase.from('drills').upsert(updates); if (error) throw error; }
    if (inserts.length) { const { error } = await supabase.from('drills').insert(inserts); if (error) throw error; }
  }
  return sessionId!;
}

/**
 * Persist a SINGLE drill to the club's drill library — the standalone flow for when a coach
 * builds one drill (not a whole session). Re-saving the same planner drill UPDATES its row
 * (never creates a second), and because saveSession reconciles by id, attaching this drill to a
 * session later reuses the same row too — so it can never double-list in the Library.
 * Returns the drill's row id (store it back on the planner drill).
 */
export async function saveDrillToLibrary(clubId: string, createdBy: string | null, drill: PlannerDrill, opts?: { creatorName?: string | null }): Promise<string> {
  const creator = opts?.creatorName?.trim() || null;
  const row: any = {
    club_id: clubId, created_by: createdBy, author: creator,
    title: drill.title.trim() || 'Untitled drill', description: drill.description || null,
    pitch_type: drill.pitchType, orientation: drill.orientation,
    drawing_data: { objects: drill.objects, drawings: drill.drawings, connectors: drill.connectors || [], fillShapes: drill.fillShapes || false, flip: drill.flip || false, grid: drill.grid || 'none', gridColor: drill.gridColor || null },
    image: drill.image || null, category_tag: drill.categoryTag || null,
    video_url: drill.videoUrl || null, animation_id: drill.animationId || null,
  };
  if (drill.id) {
    const { error } = await supabase.from('drills').update(row).eq('id', drill.id);
    if (error) throw error;
    return drill.id;
  }
  const { data, error } = await supabase.from('drills').insert(row).select('id').single();
  if (error) throw error;
  return data.id as string;
}

/** Load a single drill from the library → a planner drill (id stripped so it loads as a COPY). */
export async function fetchDrillById(id: string): Promise<PlannerDrill> {
  const { data, error } = await supabase.from('drills').select('*').eq('id', id).single();
  if (error) throw error;
  const { objects, drawings, connectors, fillShapes, flip, grid, gridColor } = readDrawing(data);
  return {
    title: data.title || '', description: data.description || '',
    pitchType: (data.pitch_type || 'full') as PitchType, orientation: (data.orientation || 'landscape') as PitchOrientation,
    objects, drawings, connectors, fillShapes, flip, grid, gridColor, phase: 0, categoryTag: data.category_tag || undefined,
    videoUrl: data.video_url || undefined, animationId: data.animation_id || null, image: data.image || null,
  };
}

/** Sessions + templates a coach can load into the planner (lightweight — no drawing blobs). */
export interface LoadableSession { id: string; title: string; categoryTag: string | null; image: string | null; drillCount: number; isTemplate: boolean; team: string | null }
export async function fetchLoadableSessions(clubId: string): Promise<LoadableSession[]> {
  // NOTE: `sessions` has no category_tag column (that lives on `drills`) — selecting it 400s.
  const { data, error } = await supabase
    .from('sessions').select('id, title, image, is_template, team, drills(id)')
    .eq('club_id', clubId).order('created_at', { ascending: false }).limit(300);
  if (error) throw error;
  return (data || []).map((s: any) => ({
    id: s.id, title: s.title || 'Untitled', categoryTag: null, image: s.image || null,
    drillCount: Array.isArray(s.drills) ? s.drills.length : 0, isTemplate: !!s.is_template, team: s.team || null,
  }));
}

/**
 * Equipment a coach has used before, powering the planner's autocomplete + "reuse last".
 * Aggregates distinct items across the club's recent sessions (most-frequent first, carrying
 * the most-recently-used quantity as the default), and returns the full kit from the most
 * recent session that had any — the one-tap "reuse last session" shortcut.
 */
export interface EquipmentSuggestion { item: string; qty?: number; count: number }
export interface EquipmentHistory { suggestions: EquipmentSuggestion[]; lastUsed: EquipmentItem[] | null }

export async function fetchEquipmentHistory(clubId: string): Promise<EquipmentHistory> {
  const { data, error } = await supabase
    .from('sessions').select('equipment, created_at')
    .eq('club_id', clubId).not('equipment', 'is', null).neq('equipment', '')
    .order('created_at', { ascending: false }).limit(200);
  if (error) throw error;

  const agg = new Map<string, EquipmentSuggestion>(); // key = lowercased item name
  let lastUsed: EquipmentItem[] | null = null;
  for (const row of data || []) {
    const items = parseEquipment(row.equipment);
    if (!items.length) continue;
    if (!lastUsed) lastUsed = items; // rows are newest-first → first non-empty = most recent kit
    for (const it of items) {
      const key = it.item.toLowerCase();
      const existing = agg.get(key);
      if (existing) existing.count += 1;
      else agg.set(key, { item: it.item, qty: it.qty, count: 1 }); // first seen = most recent → its qty is the default
    }
  }
  const suggestions = [...agg.values()].sort((a, b) => b.count - a.count || a.item.localeCompare(b.item));
  return { suggestions, lastUsed };
}

/** Squads (for the Team/Group selector) + players (for the registry checklist). */
export interface PlannerSquad { id: string; name: string; ageGroup: string | null }
export interface PlannerPlayer { id: string; name: string; squadId: string | null; position: string | null; jerseyNumber: string | null; status: string }

export async function fetchSquadsAndPlayers(clubId: string): Promise<{ squads: PlannerSquad[]; players: PlannerPlayer[] }> {
  const [sq, pl] = await Promise.all([
    supabase.from('squads').select('id, name, age_group').eq('club_id', clubId).order('name').limit(200),
    supabase.from('players').select('id, name, squad_id, position, jersey_number, player_status').eq('club_id', clubId).order('name').limit(2000),
  ]);
  if (sq.error) throw sq.error;
  if (pl.error) throw pl.error;
  return {
    squads: (sq.data || []).map((s: any) => ({ id: s.id, name: s.name, ageGroup: s.age_group })),
    players: (pl.data || []).map((p: any) => ({ id: p.id, name: p.name, squadId: p.squad_id, position: p.position, jerseyNumber: p.jersey_number, status: p.player_status || 'active' })),
  };
}
