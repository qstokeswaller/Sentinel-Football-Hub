import type { PitchObject, PitchDrawing } from './PitchCanvas';

/**
 * Animation interpolation — shared by the editor (AnimationStudio) and the read-only
 * player. Pure functions on AUTHORED frames; they never mutate input, which is what
 * keeps pause/scrub from corrupting keyframes.
 */
export interface PlayFrame { objects: PitchObject[]; drawings?: PitchDrawing[] }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Object positions at fractional position `pos` ∈ [0, frames.length-1], id-matched. */
export function interpolate(frames: PlayFrame[], pos: number): PitchObject[] {
  if (!frames.length) return [];
  if (frames.length === 1) return frames[0].objects;
  const seg = Math.max(0, Math.min(Math.floor(pos), frames.length - 2));
  const t = Math.max(0, Math.min(1, pos - seg));
  const a = frames[seg], b = frames[seg + 1];
  const out: PitchObject[] = a.objects.map(oa => {
    const ob = b.objects.find(o => o.id === oa.id);
    if (!ob) return oa;
    // Curved run: quadratic bézier through the authored control point (oa.curve). Straight = lerp.
    if (oa.curve) {
      const mt = 1 - t;
      return { ...oa, x: mt * mt * oa.x + 2 * mt * t * oa.curve.x + t * t * ob.x, y: mt * mt * oa.y + 2 * mt * t * oa.curve.y + t * t * ob.y };
    }
    return { ...oa, x: lerp(oa.x, ob.x, t), y: lerp(oa.y, ob.y, t) };
  });
  b.objects.forEach(ob => { if (!a.objects.find(o => o.id === ob.id) && t > 0.5) out.push(ob); });
  return out;
}

/** A dashed polyline per object tracing its path across all frames — follows the authored
 *  bézier curve for any segment whose start object carries a `curve` control point. */
export function pathDrawings(frames: PlayFrame[]): PitchDrawing[] {
  const ids = new Set<string>(); frames.forEach(f => f.objects.forEach(o => ids.add(o.id)));
  const out: PitchDrawing[] = [];
  ids.forEach(id => {
    const pts: number[] = []; let color = '#22d3ee'; let started = false;
    for (let i = 0; i < frames.length - 1; i++) {
      const a = frames[i].objects.find(x => x.id === id);
      const b = frames[i + 1].objects.find(x => x.id === id);
      if (!a || !b) { started = false; continue; }
      color = a.color;
      if (!started) { pts.push(a.x, a.y); started = true; }
      if (a.curve) {
        const N = 16;
        for (let k = 1; k <= N; k++) { const tt = k / N, mt = 1 - tt; pts.push(mt * mt * a.x + 2 * mt * tt * a.curve.x + tt * tt * b.x, mt * mt * a.y + 2 * mt * tt * a.curve.y + tt * tt * b.y); }
      } else { pts.push(b.x, b.y); }
    }
    if (pts.length >= 4) out.push({ id: 'path-' + id, tool: 'dashed-line', points: pts, color, width: 1.5 });
  });
  return out;
}
