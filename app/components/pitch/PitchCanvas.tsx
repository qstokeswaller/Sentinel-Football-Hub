import React, { useEffect, useRef, useCallback, useState } from 'react';
import Konva from 'konva';
import { renderPitchCanvas, pitchAspect, type PitchType, type PitchOrientation, type GridType } from './pitchGeometry';
import { connectorSegments, closedLoops } from './connectorGraph';

/** Nearest vertically-scrollable ancestor (so an empty-pitch touch-drag scrolls the page). */
function findScrollParent(el: HTMLElement | null): HTMLElement {
  let n = el?.parentElement || null;
  while (n) {
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) return n;
    n = n.parentElement;
  }
  return (document.scrollingElement as HTMLElement) || document.documentElement;
}

/**
 * PitchCanvas — the interactive drill surface (raw Konva), rebuilt to match v7 and
 * fix its long-standing UX problems:
 *  • PRECISE grabbing — each object's hit region is ONLY its visible shape (labels are
 *    listening:false), so the cursor never grabs an object it isn't directly over.
 *  • Snap / lock — dragging aligns to other objects' X/Y within a threshold and shows
 *    guide lines (the "lock cones into a line" feature), ported from v7 calcSnapGuides.
 *  • Easy drag + touch — Konva pointer events cover mouse AND touch; the stage is
 *    responsive (ResizeObserver) so it works on phones.
 * Objects/drawings persist normalised (0–1) so they're resolution-independent.
 */

export type ObjType =
  | 'player' | 'gk' | 'cone' | 'ball' | 'goalpost' | 'flag' | 'number'
  | 'ladder' | 'hurdle' | 'mannequin' | 'pole' | 'minigoal' | 'ring' | 'rebounder' | 'text';
export type DrawTool = 'pencil' | 'line' | 'arrow' | 'biarrow' | 'dashed' | 'dashed-line' | 'curved' | 'rect' | 'circle' | 'tri' | 'rondo2' | 'rondo4' | 'transfer';
export type ObjSize = 'small' | 'medium' | 'large';
export type ActiveTool = ObjType | DrawTool | 'select' | 'eraser' | 'connect' | 'marquee' | null;

export interface PitchObject { id: string; type: ObjType; x: number; y: number; color: string; size: ObjSize; label?: string; rot?: number; scale?: number; curve?: { x: number; y: number }; /** player/gk render style: dot (default), jersey, or shaper (body+limbs) */ variant?: 'dot' | 'jersey' | 'shaper'; /** player photo URL — shown in the token centre (initials fallback) */ avatar?: string }
export interface PitchDrawing { id: string; tool: DrawTool; points: number[]; color: string; width: number; fill?: boolean; rot?: number }
/** A connector is an edge ATTACHED to two objects by id — it follows them when they move,
 *  and a closed ring of them can be filled (see connectorGraph). */
export interface PitchConnector { id: string; from: string; to: string; color: string; width: number }
export interface DrillData { pitchType: PitchType; orientation: PitchOrientation; objects: PitchObject[]; drawings: PitchDrawing[]; flip?: boolean; grid?: GridType; gridColor?: string; connectors?: PitchConnector[]; fillShapes?: boolean }

interface Props {
  data: DrillData;
  editable?: boolean;
  activeTool?: ActiveTool;
  activeColor?: string;
  size?: ObjSize;
  /** when true, new shapes (rect/circle/tri) are filled with the active colour */
  fill?: boolean;
  onChange?: (d: DrillData) => void;
  /** selection id + setter (lets the toolbar drive delete/clear) */
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** faded, non-interactive ghosts (onion-skin of the previous animation frame) */
  ghostObjects?: PitchObject[];
  /** explicit height cap (px) — used by fullscreen so a portrait pitch fits a short landscape viewport */
  maxHeight?: number;
  /** Animation path editing: draggable bend handles for objects that move to `targets`
   *  (the next frame). Dragging a handle bends that object's run (quadratic bézier). */
  motion?: { targets: PitchObject[]; onCurve: (id: string, ctrl: { x: number; y: number } | null) => void };
  /** Phone inline preview: let the PAGE scroll vertically over the pitch (touch-action: pan-y)
   *  instead of trapping every touch — editing happens in fullscreen. */
  touchScroll?: boolean;
  /** render newly-placed players as a dot (default), jersey, or shaper (body+limbs) */
  playerStyle?: 'dot' | 'jersey' | 'shaper';
}

const SIZE_SCALE: Record<ObjSize, number> = { small: 0.78, medium: 1, large: 1.3 };
const SNAP = 10; // px alignment threshold for the magnetic auto-align (v7 SNAP_THRESHOLD)
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Math.random().toString(36).slice(2));
const SHAPE_TOOLS = ['rect', 'circle', 'tri', 'rondo2', 'rondo4', 'transfer'];
const TWO_POINT = ['line', 'arrow', 'biarrow', 'dashed', 'dashed-line', 'rect', 'circle', 'tri', 'rondo2', 'rondo4', 'transfer'];
// Straight one-segment tools that snap to horizontal/vertical (shapes are excluded).
const STRAIGHT_LINE = ['line', 'arrow', 'biarrow', 'dashed', 'dashed-line'];
const isDraw = (t: ActiveTool): t is DrawTool => ['pencil', 'line', 'arrow', 'biarrow', 'dashed', 'dashed-line', 'curved', 'rect', 'circle', 'tri', 'rondo2', 'rondo4', 'transfer'].includes(t as string);
const isObj = (t: ActiveTool): t is ObjType => !!t && !isDraw(t) && t !== 'select' && t !== 'eraser' && t !== 'connect' && t !== 'marquee';
const isLight = (hex: string) => { const c = hex.replace('#', ''); return (parseInt(c.substr(0, 2), 16) * 299 + parseInt(c.substr(2, 2), 16) * 587 + parseInt(c.substr(4, 2), 16) * 114) / 1000 > 150; };

// Equipment silhouettes — MUST stay identical to drillRenderer.ts (CONE_D/MANNEQUIN_D/REBOUNDER_D)
// so the interactive editor and the static thumbnail/share/PDF renders look the same.
const CONE_D = 'M-8 8 Q-1 -12 0 -12 Q1 -12 8 8 Q0 10 -8 8 Z';
const MANNEQUIN_D = 'M-4.6 -3 C-5.8 2 -4 4.5 -3.4 10.5 L3.4 10.5 C4 4.5 5.8 2 4.6 -3 C3.4 -6.6 -3.4 -6.6 -4.6 -3 Z';
const REBOUNDER_D = 'M-11 8 L11 8 L7.5 -7 L-7.5 -7 Z';
// Football shirt silhouette (collar → sleeves → body) — MUST match drillRenderer.ts JERSEY_D.
const JERSEY_D = 'M-4 -8 C-2.5 -6.8 2.5 -6.8 4 -8 L7.5 -8.5 L11.5 -3.5 L7.5 0.5 L6 -1 L6 9 L-6 9 L-6 -1 L-7.5 0.5 L-11.5 -3.5 L-7.5 -8.5 Z';
// 'shaper' body-with-limbs silhouette (torso+arms+legs; head is a separate circle) — MUST match drillRenderer.ts SHAPER_PTS.
const SHAPER_PTS = [-2.4, -5.5, -5, -4.8, -9, -0.5, -10, 2.2, -3.6, -1, -4.6, 6, -5, 8.2, -4.4, 12.6, -1.4, 12.6, 0, 7.6, 1.4, 12.6, 4.4, 12.6, 5, 8.2, 4.6, 6, 3.6, -1, 10, 2.2, 9, -0.5, 5, -4.8, 2.4, -5.5];

/** Build a Konva node for an object. Hit region = the visible shape only (labels off). */
function buildObjectNode(o: PitchObject, W: number, H: number, editable: boolean, getAvatar?: (url: string) => HTMLImageElement | null): Konva.Group {
  const g = new Konva.Group({ x: o.x * W, y: o.y * H, rotation: o.rot || 0, scaleX: o.scale || 1, scaleY: o.scale || 1, draggable: editable, id: o.id, name: 'obj' });
  const s = SIZE_SCALE[o.size] * 1;
  const stroke = isLight(o.color) ? '#0D1B2A' : '#ffffff';
  const txt = (text: string, fill: string, r: number) => new Konva.Text({ text, fontSize: r * 1.05, fontStyle: 'bold', fill, width: r * 2.6, height: r * 2.6, offsetX: r * 1.3, offsetY: r * 1.3, align: 'center', verticalAlign: 'middle', listening: false });

  switch (o.type) {
    case 'player': case 'gk': {
      const lbl = o.type === 'gk' ? 'GK' : (o.label || '');
      const fg = isLight(o.color) ? '#0D1B2A' : '#fff';
      const img = o.avatar && getAvatar ? getAvatar(o.avatar) : null;
      // A round, clipped player photo centred on the token, with a ring. Initials show until it loads.
      const photoBadge = (cx: number, cy: number, R: number, ringColor: string, ringW: number) => {
        const cover = Math.max((2 * R) / img!.width, (2 * R) / img!.height);
        const gr = new Konva.Group({ x: cx, y: cy, listening: false, clipFunc: (c: any) => { c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.closePath(); } });
        gr.add(new Konva.Image({ image: img!, width: img!.width * cover, height: img!.height * cover, offsetX: img!.width * cover / 2, offsetY: img!.height * cover / 2 }));
        g.add(gr);
        g.add(new Konva.Circle({ x: cx, y: cy, radius: R, stroke: ringColor, strokeWidth: ringW, listening: false }));
      };
      if (o.variant === 'jersey') {
        const js = s * 1.15;
        g.add(new Konva.Path({ data: JERSEY_D, scaleX: js, scaleY: js, fill: o.color, stroke, strokeWidth: 1.4, strokeScaleEnabled: false, lineJoin: 'round' }));
        if (img) photoBadge(0, 1.5 * s, 6.5 * s, stroke, 1.4);
        else if (lbl) { const t = txt(lbl, fg, 10 * s); t.y(2.6 * s); g.add(t); }
      } else if (o.variant === 'shaper') {
        g.add(new Konva.Line({ points: SHAPER_PTS.map(v => v * s), closed: true, fill: o.color, stroke, strokeWidth: 1.4, lineJoin: 'round' }));
        if (img) photoBadge(0, -6.5 * s, 5.6 * s, stroke, 1.4);
        else { g.add(new Konva.Circle({ y: -8.6 * s, radius: 4 * s, fill: o.color, stroke, strokeWidth: 1.4 })); if (lbl) { const t = txt(lbl, fg, 8.5 * s); t.y(2.6 * s); g.add(t); } }
      } else {
        const r = 13 * s;
        if (img) photoBadge(0, 0, r, o.color, 2.5);
        else { g.add(new Konva.Circle({ radius: r, fill: o.color, stroke, strokeWidth: 2 })); if (lbl) g.add(txt(lbl, fg, r)); }
      }
      break;
    }
    case 'ball': {
      // Shaded white sphere + central black pentagon + 5 seams to outer patches.
      const r = 9 * s, navy = '#0D1B2A';
      g.add(new Konva.Circle({
        radius: r, stroke: navy, strokeWidth: 1.1,
        fillRadialGradientStartPoint: { x: -r * 0.34, y: -r * 0.38 }, fillRadialGradientStartRadius: r * 0.1,
        fillRadialGradientEndPoint: { x: 0, y: 0 }, fillRadialGradientEndRadius: r,
        fillRadialGradientColorStops: [0, '#ffffff', 0.7, '#eef1f4', 1, '#c4ccd4'],
      }));
      const pent = (cx: number, cy: number, rad: number, rot: number) => { const pts: number[] = []; for (let i = 0; i < 5; i++) { const a = rot + i * 2 * Math.PI / 5; pts.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); } return pts; };
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * 2 * Math.PI / 5, ox = Math.cos(a) * r * 0.66, oy = Math.sin(a) * r * 0.66;
        g.add(new Konva.Line({ points: [Math.cos(a) * r * 0.34, Math.sin(a) * r * 0.34, ox, oy], stroke: navy, strokeWidth: 0.9, listening: false }));
        g.add(new Konva.Line({ points: pent(ox, oy, r * 0.2, a - Math.PI / 2), closed: true, fill: navy, listening: false }));
      }
      g.add(new Konva.Line({ points: pent(0, 0, r * 0.34, -Math.PI / 2), closed: true, fill: navy, listening: false }));
      break;
    }
    case 'cone': {
      // Traffic cone: dark base ellipse, rounded orange body, white reflective band.
      const col = o.color || '#f97316', dk = '#9a3412';
      g.add(new Konva.Ellipse({ y: 8.5 * s, radiusX: 10 * s, radiusY: 3 * s, fill: dk, listening: false }));
      g.add(new Konva.Path({ data: CONE_D, scaleX: s, scaleY: s, fill: col, stroke: dk, strokeWidth: 1.2, strokeScaleEnabled: false, lineJoin: 'round' }));
      g.add(new Konva.Line({ points: [-3.4 * s, -3 * s, 3.4 * s, -3 * s, 4.6 * s, 0.8 * s, -4.6 * s, 0.8 * s], closed: true, fill: 'rgba(255,255,255,0.9)', listening: false }));
      break;
    }
    case 'flag':
      g.add(new Konva.Line({ points: [0, 12 * s, 0, -12 * s], stroke: '#475569', strokeWidth: 2 }));
      g.add(new Konva.Line({ points: [0, -12 * s, 11 * s, -8 * s, 0, -4 * s], closed: true, fill: o.color }));
      break;
    case 'pole':
      g.add(new Konva.Line({ points: [0, 13 * s, 0, -13 * s], stroke: o.color, strokeWidth: 4, lineCap: 'round' }));
      break;
    case 'number':
      g.add(new Konva.Circle({ radius: 11 * s, fill: 'rgba(13,27,42,0.0)', stroke: o.color, strokeWidth: 2 }));
      g.add(txt(o.label || '1', o.color, 11 * s));
      break;
    case 'goalpost': case 'minigoal': {
      const col = o.color || '#e2e8f0';
      const mini = o.type === 'minigoal';
      const hw = (mini ? 13 : 15) * s, ty = (mini ? -5 : -8) * s, by = (mini ? 6 : 9) * s, depth = (mini ? 3 : 5) * s;
      // Net mesh inside the goal mouth (fine, faded).
      const nx = mini ? 3 : 4, ny = mini ? 2 : 3;
      for (let i = 1; i < nx; i++) { const x = -hw + (2 * hw) * i / nx; g.add(new Konva.Line({ points: [x, ty, x, by], stroke: col, strokeWidth: 0.8, opacity: 0.45, listening: false })); }
      for (let i = 1; i < ny; i++) { const y = ty + (by - ty) * i / ny; g.add(new Konva.Line({ points: [-hw, y, hw, y], stroke: col, strokeWidth: 0.8, opacity: 0.45, listening: false })); }
      // Depth cue — slanted top so it reads as a 3-D goal.
      g.add(new Konva.Line({ points: [-hw, ty, -hw + depth, ty - depth, hw - depth, ty - depth, hw, ty], stroke: col, strokeWidth: 1.3, opacity: 0.7, listening: false }));
      // Front frame — bold posts + crossbar, with a lighter goal line.
      g.add(new Konva.Line({ points: [-hw, by, -hw, ty, hw, ty, hw, by], stroke: col, strokeWidth: mini ? 2.4 : 2.8, lineJoin: 'round' }));
      g.add(new Konva.Line({ points: [-hw, by, hw, by], stroke: col, strokeWidth: 1.2, opacity: 0.8, listening: false }));
      break;
    }
    case 'mannequin': {
      // Free-kick mannequin: ground shadow, torso silhouette, head.
      g.add(new Konva.Ellipse({ y: 10.8 * s, radiusX: 6 * s, radiusY: 1.9 * s, fill: 'rgba(13,27,42,0.28)', listening: false }));
      g.add(new Konva.Path({ data: MANNEQUIN_D, scaleX: s, scaleY: s, fill: o.color, stroke, strokeWidth: 1, strokeScaleEnabled: false, lineJoin: 'round' }));
      g.add(new Konva.Circle({ y: -8.4 * s, radius: 3.4 * s, fill: o.color, stroke, strokeWidth: 1 }));
      break;
    }
    case 'ladder':
      g.add(new Konva.Rect({ x: -7 * s, y: -13 * s, width: 14 * s, height: 26 * s, stroke: o.color || '#fbbf24', strokeWidth: 2 }));
      [-6.5, 0, 6.5].forEach(dy => g.add(new Konva.Line({ points: [-7 * s, dy * s, 7 * s, dy * s], stroke: o.color || '#fbbf24', strokeWidth: 1.5, listening: false })));
      break;
    case 'hurdle':
      g.add(new Konva.Line({ points: [-10 * s, 6 * s, -10 * s, -6 * s, 10 * s, -6 * s, 10 * s, 6 * s], stroke: o.color, strokeWidth: 2.5, lineJoin: 'round' }));
      break;
    case 'ring':
      g.add(new Konva.Circle({ radius: 11 * s, stroke: o.color, strokeWidth: 3 }));
      break;
    case 'rebounder': {
      // Angled rebound net: taut mesh inside an angled trapezoid frame, on two legs.
      const mesh = new Konva.Group({ listening: false, clipFunc: (c: any) => { c.moveTo(-11 * s, 8 * s); c.lineTo(11 * s, 8 * s); c.lineTo(7.5 * s, -7 * s); c.lineTo(-7.5 * s, -7 * s); c.closePath(); } });
      for (let i = -4; i <= 4; i++) mesh.add(new Konva.Line({ points: [i * 2.4 * s, -8 * s, i * 3 * s, 9 * s], stroke: o.color, strokeWidth: 0.7, opacity: 0.4 }));
      for (let j = -6; j <= 8; j += 3) mesh.add(new Konva.Line({ points: [-12 * s, j * s, 12 * s, j * s], stroke: o.color, strokeWidth: 0.7, opacity: 0.4 }));
      g.add(mesh);
      g.add(new Konva.Path({ data: REBOUNDER_D, scaleX: s, scaleY: s, stroke: o.color, strokeWidth: 2, strokeScaleEnabled: false, lineJoin: 'round' }));
      g.add(new Konva.Line({ points: [-8.5 * s, 8 * s, -10.5 * s, 11.5 * s], stroke: o.color, strokeWidth: 1.6, lineCap: 'round', listening: false }));
      g.add(new Konva.Line({ points: [8.5 * s, 8 * s, 10.5 * s, 11.5 * s], stroke: o.color, strokeWidth: 1.6, lineCap: 'round', listening: false }));
      break;
    }
    case 'text': {
      const t = new Konva.Text({ text: o.label || 'Text', fontSize: 16 * s, fontStyle: 'bold', fill: o.color, align: 'center' });
      t.offsetX(t.width() / 2); t.offsetY(t.height() / 2);
      g.add(t);
      break;
    }
  }
  // Transparent bounding hit area so EVERY object — including thin line shapes (goals, hurdles,
  // rings) whose centres are empty — selects, drags and rotates reliably when clicked.
  const hb = 16 * s;
  g.add(new Konva.Rect({ x: -hb, y: -hb, width: hb * 2, height: hb * 2, fill: 'rgba(255,255,255,0.01)', name: 'hit' }));
  return g;
}

const hexToRgba = (hex: string, a: number) => {
  const c = hex.replace('#', ''); const n = c.length === 3 ? c.split('').map(x => x + x).join('') : c;
  return `rgba(${parseInt(n.slice(0, 2), 16)},${parseInt(n.slice(2, 4), 16)},${parseInt(n.slice(4, 6), 16)},${a})`;
};

function buildDrawingNode(d: PitchDrawing, W: number, H: number): Konva.Shape | Konva.Group {
  const pts: number[] = [];
  for (let i = 0; i < d.points.length; i += 2) { pts.push(d.points[i] * W, d.points[i + 1] * H); }
  const dash = d.tool === 'dashed' || d.tool === 'dashed-line' ? [8, 6] : undefined;
  const common = { stroke: d.color, strokeWidth: d.width, lineCap: 'round' as const, lineJoin: 'round' as const, dash, hitStrokeWidth: 14 };
  if (d.tool === 'pencil' || d.tool === 'curved') return new Konva.Line({ ...common, points: pts, tension: d.tool === 'curved' ? 0.5 : 0.25, name: 'draw', id: d.id });
  // Shapes (rect / circle / tri) — defined by the drag's two corner points.
  if (d.tool === 'rect' || d.tool === 'circle' || d.tool === 'tri') {
    const [x1, y1, x2, y2] = pts;
    const fill = d.fill ? hexToRgba(d.color, 0.22) : undefined;
    const base = { stroke: d.color, strokeWidth: d.width, fill, lineJoin: 'round' as const, name: 'draw', id: d.id, hitStrokeWidth: 14 };
    if (d.tool === 'rect') return new Konva.Rect({ ...base, x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) });
    if (d.tool === 'circle') return new Konva.Ellipse({ ...base, x: (x1 + x2) / 2, y: (y1 + y2) / 2, radiusX: Math.abs(x2 - x1) / 2, radiusY: Math.abs(y2 - y1) / 2 });
    return new Konva.Line({ ...base, points: [(x1 + x2) / 2, y1, x1, y2, x2, y2], closed: true });
  }
  // Rondo grids — outer box + internal dividers (transfer = two boxes with a channel). One custom
  // Konva.Shape so selection (stroke recolour) + click hit-testing work like the other shapes.
  if (d.tool === 'rondo2' || d.tool === 'rondo4' || d.tool === 'transfer') {
    const [x1, y1, x2, y2] = pts;
    const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
    const base = { stroke: d.color, strokeWidth: d.width, fill: d.fill ? hexToRgba(d.color, 0.22) : undefined, lineJoin: 'round' as const, name: 'draw', id: d.id, hitStrokeWidth: 14 };
    const tool = d.tool;
    const paint = (ctx: any, shape: any, hit: boolean) => {
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.fillStrokeShape(shape);
      if (hit) return;
      ctx.beginPath();
      if (tool === 'transfer') {
        // Two big end boxes + a SMALLER connected middle channel (one outer frame, two dividers).
        const bw = w * 0.4;
        ctx.moveTo(x + bw, y); ctx.lineTo(x + bw, y + h);
        ctx.moveTo(x + w - bw, y); ctx.lineTo(x + w - bw, y + h);
      } else {
        ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h);
        if (tool === 'rondo4') { ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); }
      }
      ctx.strokeShape(shape);
    };
    return new Konva.Shape({ ...base, sceneFunc: (ctx, shape) => paint(ctx, shape, false), hitFunc: (ctx, shape) => paint(ctx, shape, true) });
  }
  // line / arrow / biarrow / dashed
  const isArrow = d.tool === 'arrow' || d.tool === 'dashed';
  const isBi = d.tool === 'biarrow';
  if (isArrow || isBi) return new Konva.Arrow({ ...common, points: pts, pointerLength: 10, pointerWidth: 9, pointerAtBeginning: isBi, name: 'draw', id: d.id, fill: d.color });
  return new Konva.Line({ ...common, points: pts, name: 'draw', id: d.id });
}

/** Mirror objects + drawings so they follow a pitch flip (goal-end swap). Landscape flips the
 *  long axis (x → 1−x); portrait flips y. Connectors reference object ids, so they follow for free. */
export function flipObjects(objects: PitchObject[], drawings: PitchDrawing[], orientation: PitchOrientation): { objects: PitchObject[]; drawings: PitchDrawing[] } {
  const vert = orientation === 'portrait';
  const fo = objects.map(o => vert
    ? { ...o, y: 1 - o.y, curve: o.curve ? { x: o.curve.x, y: 1 - o.curve.y } : o.curve }
    : { ...o, x: 1 - o.x, curve: o.curve ? { x: 1 - o.curve.x, y: o.curve.y } : o.curve });
  const fd = drawings.map(d => ({ ...d, points: d.points.map((v, i) => { const isX = i % 2 === 0; return (vert ? !isX : isX) ? 1 - v : v; }) }));
  return { objects: fo, drawings: fd };
}

export const PitchCanvas: React.FC<Props> = ({ data, editable = false, activeTool = null, activeColor = '#e53935', size = 'medium', fill = false, onChange, selectedId = null, onSelect, ghostObjects, maxHeight, motion, touchScroll = false, playerStyle = 'dot' }) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const bgRef = useRef<Konva.Layer | null>(null);
  const objRef = useRef<Konva.Layer | null>(null);
  const guideRef = useRef<Konva.Layer | null>(null);
  const motionRef = useRef<Konva.Layer | null>(null);
  const connRef = useRef<Konva.Layer | null>(null);
  const dimsRef = useRef({ W: 600, H: 400 });
  const drawingRef = useRef<{ pts: number[] } | null>(null);
  const erasingRef = useRef(false);
  // Connect tool: the object a connection is being drawn FROM (kept active so one object can
  // fan out to many). null = nothing pending.
  const pendingConnect = useRef<{ id: string; x: number; y: number } | null>(null);
  // Marquee (box) multi-select: the drawn box + the resulting group of selected object ids, and
  // the per-object start positions captured when a group drag begins.
  const marqueeRef = useRef<{ x0: number; y0: number } | null>(null);
  const groupDragRef = useRef<{ anchor: string; ax: number; ay: number; start: Record<string, { x: number; y: number }> } | null>(null);
  // Touch: dragging an EMPTY part of the pitch scrolls the page (so a big pitch never traps the
  // scroll on phones). { startY, scroll element, its start scrollTop, whether it actually moved }.
  const scrollDragRef = useRef<{ y: number; el: HTMLElement; top: number; moved: boolean } | null>(null);
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const trRef = useRef<Konva.Transformer | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  // Inline text editor over the stage: { x,y in stage px, current value, id (edit) or null (new) }.
  const [textEdit, setTextEdit] = useState<{ x: number; y: number; value: string; id: string | null } | null>(null);
  // latest props for stable event handlers
  const st = useRef({ data, editable, activeTool, activeColor, size, fill, onChange, selectedId, onSelect, ghostObjects, motion, multiSel, touchScroll, playerStyle });
  st.current = { data, editable, activeTool, activeColor, size, fill, onChange, selectedId, onSelect, ghostObjects, motion, multiSel, touchScroll, playerStyle };

  const aspect = pitchAspect(data.pitchType, data.orientation); // W/H — per pitch type (v7 proportions)

  // Let the pitch fill its column width (big, like the old version). Only the genuinely
  // tall pitches (portrait / half / third) get capped — to roughly the viewport height —
  // so they don't explode the page. Landscape stays large and full-width.
  const computeSize = useCallback(() => {
    const containerW = outerRef.current?.clientWidth || 600;
    // Let the pitch fill the available space generously (this is what made the builder feel
    // right before). Tall pitches (½ / ⅓ landscape, portrait) fill the height; a mild upper
    // cap keeps it sane on very tall monitors. Slight scroll on a small laptop is acceptable —
    // a too-small canvas is worse. In fullscreen, `maxHeight` is passed so a portrait pitch
    // fits the (often short) viewport instead of overflowing it.
    // Fill the column WIDTH as much as possible (proportions always preserved: W = H·aspect).
    // The cap only kicks in for genuinely tall pitches / short viewports so the page doesn't
    // explode. Raised from the old 800 so landscape pitches use the horizontal dead space on
    // wide screens. In fullscreen, `maxHeight` is passed to fit the viewport instead.
    const maxH = maxHeight ?? Math.max(400, Math.min(window.innerHeight - 120, 1200));
    let W = containerW, H = W / aspect;
    if (H > maxH) { H = maxH; W = H * aspect; }
    return { W: Math.round(W), H: Math.round(H) };
  }, [aspect, maxHeight]);

  const renderBg = useCallback(() => {
    const { W, H } = dimsRef.current; const layer = bgRef.current; if (!layer) return;
    layer.destroyChildren();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = renderPitchCanvas(W, H, st.current.data.pitchType, st.current.data.orientation, dpr, st.current.data.flip, st.current.data.grid || 'none', st.current.data.gridColor);
    layer.add(new Konva.Image({ image: cv, width: W, height: H, listening: false }));
    layer.draw();
  }, []);

  const commit = (patch: Partial<DrillData>) => { const cur = st.current.data; st.current.onChange?.({ ...cur, ...patch }); };

  // Snap a dragged object to align with other objects (returns adjusted px + guides).
  const snapDrag = (selfId: string, px: number, py: number) => {
    const { W, H } = dimsRef.current; const others = st.current.data.objects.filter(o => o.id !== selfId);
    let sx = px, sy = py; const guides: { type: 'v' | 'h'; pos: number }[] = [];
    let bdx = SNAP, bdy = SNAP, ax: number | null = null, ay: number | null = null;
    others.forEach(o => { const ox = o.x * W, oy = o.y * H; const dx = Math.abs(ox - px), dy = Math.abs(oy - py); if (dx < bdx) { bdx = dx; ax = ox; } if (dy < bdy) { bdy = dy; ay = oy; } });
    if (ax !== null) { sx = ax; guides.push({ type: 'v', pos: ax }); }
    if (ay !== null) { sy = ay; guides.push({ type: 'h', pos: ay }); }
    return { sx, sy, guides };
  };
  const drawGuides = (guides: { type: 'v' | 'h'; pos: number }[]) => {
    const layer = guideRef.current; if (!layer) return; const { W, H } = dimsRef.current;
    layer.destroyChildren();
    guides.forEach(g => layer.add(new Konva.Line({ points: g.type === 'v' ? [g.pos, 0, g.pos, H] : [0, g.pos, W, g.pos], stroke: '#ef4444', strokeWidth: 1.5, dash: [6, 5], listening: false })));
    layer.draw();
  };

  /** Draggable bend handles for the animation path editor. For each object that moves to a
   *  `motion.targets` counterpart, draw its dashed bézier run + a handle at the curve midpoint;
   *  dragging bends the run, double-click / near-straight straightens it. */
  const renderMotion = useCallback(() => {
    const layer = motionRef.current; const stage = stageRef.current; if (!layer || !stage) return;
    layer.destroyChildren();
    const { W, H } = dimsRef.current; const { editable: ed, activeTool: tool, motion: mo } = st.current;
    if (!ed || !mo || isDraw(tool)) { layer.draw(); return; }
    const sample = (P0: any, C: any, P1: any) => { const pts: number[] = []; const N = 18; for (let k = 0; k <= N; k++) { const tt = k / N, mt = 1 - tt; pts.push(mt * mt * P0.x + 2 * mt * tt * C.x + tt * tt * P1.x, mt * mt * P0.y + 2 * mt * tt * C.y + tt * tt * P1.y); } return pts; };
    st.current.data.objects.forEach(o => {
      const tg = mo.targets.find(x => x.id === o.id);
      if (!tg || (Math.abs(tg.x - o.x) < 0.001 && Math.abs(tg.y - o.y) < 0.001)) return; // not moving
      const P0 = { x: o.x * W, y: o.y * H }, P1 = { x: tg.x * W, y: tg.y * H };
      const C = o.curve ? { x: o.curve.x * W, y: o.curve.y * H } : { x: (P0.x + P1.x) / 2, y: (P0.y + P1.y) / 2 };
      const path = new Konva.Line({ points: sample(P0, C, P1), stroke: o.color, strokeWidth: 2, dash: [7, 6], lineCap: 'round', opacity: 0.95, listening: false });
      layer.add(path);
      const mid = { x: 0.25 * P0.x + 0.5 * C.x + 0.25 * P1.x, y: 0.25 * P0.y + 0.5 * C.y + 0.25 * P1.y };
      const handle = new Konva.Circle({ x: mid.x, y: mid.y, radius: 7, fill: '#ffffff', stroke: o.color, strokeWidth: 2.5, draggable: true, name: 'curveHandle', shadowColor: '#000', shadowBlur: 3, shadowOpacity: 0.3 });
      handle.on('dragmove', () => { const nc = { x: 2 * handle.x() - 0.5 * (P0.x + P1.x), y: 2 * handle.y() - 0.5 * (P0.y + P1.y) }; path.points(sample(P0, nc, P1)); layer.batchDraw(); });
      handle.on('dragend', () => {
        const ncx = (2 * handle.x() - 0.5 * (P0.x + P1.x)) / W, ncy = (2 * handle.y() - 0.5 * (P0.y + P1.y)) / H;
        const midN = { x: (o.x + tg.x) / 2, y: (o.y + tg.y) / 2 };
        const straight = Math.hypot(ncx - midN.x, ncy - midN.y) < 0.02;
        st.current.motion!.onCurve(o.id, straight ? null : { x: ncx, y: ncy });
      });
      handle.on('dblclick dbltap', (e: any) => { e.cancelBubble = true; st.current.motion!.onCurve(o.id, null); });
      handle.on('mouseenter', () => { stage.container().style.cursor = 'grab'; });
      handle.on('mouseleave', () => { stage.container().style.cursor = cursorFor(st.current.activeTool); });
      layer.add(handle);
    });
    layer.draw();
  }, []);

  const removeConnector = (id: string) => { commit({ connectors: (st.current.data.connectors || []).filter(c => c.id !== id) }); if (st.current.selectedId === id) st.current.onSelect?.(null); };
  // Prune connectors that reference a deleted object, so no dangling edges remain.
  const withoutObjectConnectors = (objId: string) => (st.current.data.connectors || []).filter(c => c.from !== objId && c.to !== objId);

  /** Paint connector edges (+ filled closed loops) for a given set of object positions. */
  const paintConnectors = useCallback((objs: PitchObject[]) => {
    const layer = connRef.current; const stage = stageRef.current; if (!layer) return;
    const { W, H } = dimsRef.current;
    const { data: d, editable: ed, activeTool: tool, selectedId: sel } = st.current;
    layer.destroyChildren();
    if (!d.connectors?.length) { layer.draw(); return; }
    // Filled closed shapes first (under the lines).
    if (d.fillShapes) {
      const byId = new Map(objs.map(o => [o.id, o]));
      closedLoops(objs, d.connectors).forEach(loop => {
        const pts: number[] = [];
        loop.ids.forEach(id => { const o = byId.get(id); if (o) pts.push(o.x * W, o.y * H); });
        if (pts.length >= 6) layer.add(new Konva.Line({ points: pts, closed: true, fill: hexToRgba(loop.color, 0.18), listening: false }));
      });
    }
    const selectable = ed && !isDraw(tool) && tool !== 'connect' && tool !== 'marquee';
    connectorSegments(objs, d.connectors).forEach(seg => {
      const line = new Konva.Line({
        points: [seg.from.x * W, seg.from.y * H, seg.to.x * W, seg.to.y * H],
        stroke: sel === seg.id ? '#00C49A' : seg.color, strokeWidth: seg.width, lineCap: 'round',
        hitStrokeWidth: 16, name: 'connector', id: seg.id, listening: selectable,
      });
      if (selectable && stage) {
        line.on('click tap', (e: any) => { e.cancelBubble = true; if (st.current.activeTool === 'eraser') { removeConnector(seg.id); return; } st.current.onSelect?.(seg.id); });
        line.on('dblclick dbltap', (e: any) => { e.cancelBubble = true; removeConnector(seg.id); });
        line.on('mouseenter', () => { stage.container().style.cursor = 'pointer'; });
        line.on('mouseleave', () => { stage.container().style.cursor = cursorFor(st.current.activeTool); });
      }
      layer.add(line);
    });
    layer.draw();
  }, []);
  const renderConnectors = useCallback(() => paintConnectors(st.current.data.objects), [paintConnectors]);
  /** Repaint connectors from LIVE Konva node positions (during single or group drags). */
  const renderConnectorsLive = useCallback(() => {
    const layer = objRef.current; if (!layer) return; const { W, H } = dimsRef.current;
    paintConnectors(st.current.data.objects.map(o => { const n = layer.findOne('#' + o.id); return n ? { ...o, x: n.x() / W, y: n.y() / H } : o; }));
  }, [paintConnectors]);

  /** Rubber-band + source ring (+ hovered-target highlight) while the connect tool is active. */
  const drawConnectBand = (pointer?: { x: number; y: number }, targetId?: string | null) => {
    const layer = guideRef.current; if (!layer) return; const { W, H } = dimsRef.current;
    layer.destroyChildren();
    const pc = pendingConnect.current;
    if (pc) {
      const sx = pc.x * W, sy = pc.y * H;
      layer.add(new Konva.Circle({ x: sx, y: sy, radius: 17, stroke: '#00C49A', strokeWidth: 2.5, dash: [4, 3], listening: false }));
      if (pointer) layer.add(new Konva.Line({ points: [sx, sy, pointer.x, pointer.y], stroke: '#00C49A', strokeWidth: 2, dash: [7, 6], lineCap: 'round', listening: false }));
      // Glow the object under the pointer so it's clear which one you'll attach to.
      if (targetId && targetId !== pc.id) {
        const t = st.current.data.objects.find(o => o.id === targetId);
        if (t) layer.add(new Konva.Circle({ x: t.x * W, y: t.y * H, radius: 20, stroke: '#00C49A', strokeWidth: 3, fill: 'rgba(0,196,154,0.20)', listening: false }));
      }
    }
    layer.draw();
  };

  /** Create a connector between two objects (skips duplicates + self-links). */
  const addConnector = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const cons = st.current.data.connectors || [];
    if (cons.some(c => (c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId))) return;
    commit({ connectors: [...cons, { id: uid(), from: fromId, to: toId, color: st.current.activeColor, width: drawWidth(st.current.size) }] });
  };

  // Player-photo avatars — loaded lazily and cached; when one finishes it re-renders the
  // objects layer so the photo pops in (initials show meanwhile). Returns the image only
  // once it's actually decoded, else null.
  const avatarImgs = useRef<Map<string, HTMLImageElement>>(new Map());
  const renderObjectsRef = useRef<() => void>(() => {});
  const getAvatar = useCallback((url: string): HTMLImageElement | null => {
    const cache = avatarImgs.current;
    let img = cache.get(url);
    if (!img) {
      img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => renderObjectsRef.current();
      img.src = url; cache.set(url, img);
    }
    return (img.complete && img.naturalWidth > 0) ? img : null;
  }, []);

  const renderObjects = useCallback(() => {
    const layer = objRef.current; const stage = stageRef.current; if (!layer || !stage) return;
    const { W, H } = dimsRef.current; const { editable: ed, activeTool: tool, selectedId: sel } = st.current;
    trRef.current?.nodes([]); // detach before the nodes it points at are destroyed
    layer.destroyChildren();
    // onion-skin ghosts (faded, non-interactive) under everything
    (st.current.ghostObjects || []).forEach(o => { const g = buildObjectNode(o, W, H, false, getAvatar); g.opacity(0.3); g.listening(false); layer.add(g); });
    // Anything but a draw tool lets you click to select/move/rotate/resize existing items.
    const selectable = ed && !isDraw(tool);
    // drawings first (under objects)
    st.current.data.drawings.forEach(d => {
      const n = buildDrawingNode(d, W, H);
      applyDrawingTransform(n, d); // rotation around the shape's centre
      n.listening(selectable);
      if (sel === d.id) (n as any).stroke?.('#00C49A');
      if (ed) {
        const node = n as Konva.Node;
        node.on('click tap', (e: any) => {
          e.cancelBubble = true;
          if (st.current.activeTool === 'eraser') { commit({ drawings: st.current.data.drawings.filter(x => x.id !== d.id) }); st.current.onSelect?.(null); return; }
          st.current.onSelect?.(d.id);
        });
        node.on('dblclick dbltap', (e: any) => { e.cancelBubble = true; commit({ drawings: st.current.data.drawings.filter(x => x.id !== d.id) }); st.current.onSelect?.(null); });
      }
      layer.add(n);
    });
    const marquee = tool === 'marquee';
    const inGroup = (id: string) => st.current.multiSel.includes(id);
    st.current.data.objects.forEach(o => {
      const g = buildObjectNode(o, W, H, ed, getAvatar);
      // In marquee mode ONLY the selected group is interactive/draggable, so an empty-drag over
      // unselected objects still starts a new box. Otherwise objects listen (unless a draw tool is on).
      g.listening(ed && !isDraw(tool) && (!marquee || inGroup(o.id)));
      g.draggable(ed && tool !== 'eraser' && tool !== 'connect' && (!marquee || inGroup(o.id)));
      // Highlight ring on multi-selected objects.
      if (marquee && inGroup(o.id)) g.add(new Konva.Circle({ radius: 20, stroke: '#00C49A', strokeWidth: 2, dash: [4, 3], listening: false }));
      if (ed) {
        g.on('dragstart', () => {
          if (tool === 'marquee' && inGroup(o.id)) {
            const start: Record<string, { x: number; y: number }> = {};
            st.current.multiSel.forEach(id => { const n = layer.findOne('#' + id); if (n) start[id] = { x: n.x(), y: n.y() }; });
            groupDragRef.current = { anchor: o.id, ax: g.x(), ay: g.y(), start };
          } else groupDragRef.current = null;
        });
        g.on('dragmove', () => {
          const gd = groupDragRef.current;
          if (gd && gd.anchor === o.id) {
            const dx = g.x() - gd.ax, dy = g.y() - gd.ay;
            st.current.multiSel.forEach(id => { if (id === o.id) return; const n = layer.findOne('#' + id); const s = gd.start[id]; if (n && s) n.position({ x: s.x + dx, y: s.y + dy }); });
            layer.batchDraw(); renderConnectorsLive(); return;
          }
          const { sx, sy, guides } = snapDrag(o.id, g.x(), g.y());
          g.position({ x: sx, y: sy }); drawGuides(guides);
          renderConnectorsLive(); // connectors follow the object live
        });
        g.on('dragend', () => {
          guideRef.current?.destroyChildren(); guideRef.current?.draw();
          const gd = groupDragRef.current;
          if (gd && gd.anchor === o.id) {
            const dx = g.x() - gd.ax, dy = g.y() - gd.ay; const moved = new Set(st.current.multiSel);
            commit({ objects: st.current.data.objects.map(x => moved.has(x.id) && gd.start[x.id] ? { ...x, x: Math.max(0, Math.min(1, (gd.start[x.id].x + dx) / W)), y: Math.max(0, Math.min(1, (gd.start[x.id].y + dy) / H)) } : x) });
            groupDragRef.current = null; setMultiSel([]); // done moving → deselect into individual objects
            return;
          }
          const nx = Math.max(0, Math.min(1, g.x() / W)), ny = Math.max(0, Math.min(1, g.y() / H));
          commit({ objects: st.current.data.objects.map(x => x.id === o.id ? { ...x, x: nx, y: ny } : x) });
        });
        g.on('click tap', (e) => {
          e.cancelBubble = true;
          const t = st.current.activeTool;
          if (t === 'connect' || t === 'marquee') return; // drag-driven (handled on the stage)
          if (t === 'eraser') { commit({ objects: st.current.data.objects.filter(x => x.id !== o.id), connectors: withoutObjectConnectors(o.id) }); st.current.onSelect?.(null); return; }
          st.current.onSelect?.(o.id);
        });
        g.on('dblclick dbltap', (e) => {
          e.cancelBubble = true;
          if (st.current.activeTool === 'connect' || st.current.activeTool === 'marquee') return;
          if (o.type === 'text') { const { W: cw, H: ch } = dimsRef.current; setTextEdit({ x: o.x * cw, y: o.y * ch, value: o.label || '', id: o.id }); return; }
          commit({ objects: st.current.data.objects.filter(x => x.id !== o.id), connectors: withoutObjectConnectors(o.id) }); st.current.onSelect?.(null);
        });
        g.on('mouseenter', () => { const t = st.current.activeTool; stage.container().style.cursor = (t === 'connect' || t === 'marquee') ? 'crosshair' : isDraw(t) ? 'crosshair' : 'grab'; });
        g.on('mouseleave', () => { stage.container().style.cursor = cursorFor(st.current.activeTool); });
      }
      layer.add(g);
    });
    // Selection handles (resize + rotate) via a Transformer — objects resize freely (uniform),
    // shapes rotate only (they're already drawn to any size). Touch-friendly out of the box.
    const tr = trRef.current;
    if (tr) {
      const node = sel && selectable ? layer.findOne('#' + sel) : null;
      if (node) {
        const isObjNode = node.name() === 'obj';
        tr.keepRatio(isObjNode);
        tr.resizeEnabled(isObjNode);
        tr.enabledAnchors(isObjNode ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : []);
        tr.nodes([node]);
      } else {
        tr.nodes([]);
      }
      tr.getLayer()?.batchDraw();
    }
    layer.draw();
    renderMotion();
    renderConnectors();
  }, [renderMotion, renderConnectors, renderConnectorsLive, getAvatar]);
  renderObjectsRef.current = renderObjects;

  /** Rotate a drawing node around its own centre (so shapes spin in place). */
  const applyDrawingTransform = (n: Konva.Node, d: PitchDrawing) => {
    if (!d.rot) return;
    const r = n.getClientRect({ skipTransform: true });
    const lc = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    n.position({ x: n.x() + lc.x, y: n.y() + lc.y });
    n.offset(lc);
    n.rotation(d.rot);
  };

  const cursorFor = (tool: ActiveTool) => tool === 'eraser' ? 'pointer' : tool === 'text' ? 'text' : tool === 'connect' || tool === 'marquee' ? 'crosshair' : isObj(tool) ? 'copy' : isDraw(tool) ? 'crosshair' : 'default';

  /** Dashed selection box for the marquee tool. */
  const drawMarquee = (x1: number, y1: number, x2: number, y2: number) => {
    const layer = guideRef.current; if (!layer) return;
    layer.destroyChildren();
    layer.add(new Konva.Rect({ x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), stroke: '#00C49A', strokeWidth: 1.5, dash: [6, 4], fill: 'rgba(0,196,154,0.10)', listening: false }));
    layer.draw();
  };

  // Build the stage once.
  useEffect(() => {
    if (!wrapRef.current) return;
    const { W, H } = computeSize();
    dimsRef.current = { W, H };
    const stage = new Konva.Stage({ container: wrapRef.current, width: W, height: H });
    const bg = new Konva.Layer({ listening: false }); const conn = new Konva.Layer(); const obj = new Konva.Layer(); const guide = new Konva.Layer({ listening: false }); const mo = new Konva.Layer(); const trLayer = new Konva.Layer();
    // Connectors sit UNDER the objects (so player icons stay on top) but over the pitch.
    stage.add(bg); stage.add(conn); stage.add(obj); stage.add(guide); stage.add(mo); stage.add(trLayer);
    stageRef.current = stage; bgRef.current = bg; connRef.current = conn; objRef.current = obj; guideRef.current = guide; motionRef.current = mo;

    // Resize + rotate handles via a Transformer (touch-friendly), brand-teal styled.
    // Lives in its own layer so the obj-layer rebuild (destroyChildren) never wipes it.
    const tr = new Konva.Transformer({
      rotateEnabled: true, rotateAnchorOffset: 26, padding: 4, ignoreStroke: true,
      anchorSize: 12, anchorCornerRadius: 6, anchorStroke: '#00C49A', anchorFill: '#ffffff',
      borderStroke: '#00C49A', borderStrokeWidth: 1.5, borderDash: [4, 3],
      rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315], rotationSnapTolerance: 6,
      boundBoxFunc: (oldB, newB) => (newB.width < 16 || newB.height < 16 ? oldB : newB),
    });
    trLayer.add(tr); trRef.current = tr;
    const showTip = () => {
      const n = tr.nodes()[0]; if (!n) return;
      const r = n.getClientRect();
      setTip({ x: r.x + r.width + 6, y: Math.max(0, r.y - 4), text: `${Math.round(r.width)} × ${Math.round(r.height)} px` });
    };
    tr.on('transform', showTip);
    tr.on('transformend', () => {
      const n = tr.nodes()[0]; setTip(null); if (!n) return;
      const id = n.id(); const { W: cw, H: ch } = dimsRef.current;
      if (n.name() === 'obj') {
        const sc = Math.round(n.scaleX() * 100) / 100, rot = Math.round(n.rotation());
        const nx = Math.max(0, Math.min(1, n.x() / cw)), ny = Math.max(0, Math.min(1, n.y() / ch));
        commit({ objects: st.current.data.objects.map(o => o.id === id ? { ...o, x: nx, y: ny, scale: sc, rot } : o) });
      } else {
        commit({ drawings: st.current.data.drawings.map(d => d.id === id ? { ...d, rot: Math.round(n.rotation()) } : d) });
      }
    });

    renderBg(); renderObjects();

    // Which object (if any) is directly under a stage point — used by the connect tool.
    const objectAt = (pos: { x: number; y: number }): string | null => {
      const t = stage.getIntersection(pos); if (!t) return null;
      const grp = t.getParent();
      if (grp && grp.name && grp.name() === 'obj') { const id = grp.id(); if (st.current.data.objects.some(o => o.id === id)) return id; }
      return null;
    };

    // Eraser: delete whatever object/drawing is under the pointer (click, or drag over them).
    const eraseAt = () => {
      const pos = stage.getPointerPosition(); if (!pos) return;
      const t = stage.getIntersection(pos); if (!t) return;
      const grp = t.getParent();
      if (grp && grp.name && grp.name() === 'obj' && st.current.data.objects.some(o => o.id === grp.id())) {
        commit({ objects: st.current.data.objects.filter(o => o.id !== grp.id()), connectors: withoutObjectConnectors(grp.id()) }); st.current.onSelect?.(null);
      } else if (t.name && t.name() === 'draw' && st.current.data.drawings.some(d => d.id === t.id())) {
        commit({ drawings: st.current.data.drawings.filter(d => d.id !== t.id()) }); st.current.onSelect?.(null);
      } else if (t.name && t.name() === 'connector' && (st.current.data.connectors || []).some(c => c.id === t.id())) {
        removeConnector(t.id());
      }
    };

    // Place object / start drawing on empty-pitch press.
    stage.on('mousedown touchstart', (e) => {
      const { editable: ed, activeTool: tool } = st.current; if (!ed) return;
      const onEmpty = e.target === stage || e.target.getLayer() === bgRef.current;
      const pos = stage.getPointerPosition(); if (!pos) return;
      const { W, H } = dimsRef.current;
      // Touch on empty pitch while selecting → scroll the page (a big pitch never traps the scroll).
      if (st.current.touchScroll && 'touches' in e.evt && onEmpty && (tool === 'select' || tool == null)) {
        const el = findScrollParent(wrapRef.current);
        scrollDragRef.current = { y: (e.evt as TouchEvent).touches[0].clientY, el, top: el.scrollTop, moved: false };
        return;
      }
      if (tool === 'eraser') { erasingRef.current = true; eraseAt(); return; }
      if (tool === 'text') { if (onEmpty) setTextEdit({ x: pos.x, y: pos.y, value: '', id: null }); return; }
      // Connect tool: press on an object begins a drag; release on another links them.
      if (tool === 'connect') {
        const id = objectAt(pos);
        if (id) { const o = st.current.data.objects.find(x => x.id === id); if (o) { pendingConnect.current = { id: o.id, x: o.x, y: o.y }; drawConnectBand(pos); } }
        else { pendingConnect.current = null; guideRef.current?.destroyChildren(); guideRef.current?.draw(); }
        return;
      }
      // Marquee tool: press on empty starts a selection box (drag on a selected object moves the group).
      if (tool === 'marquee') { if (onEmpty) marqueeRef.current = { x0: pos.x, y0: pos.y }; return; }
      if (isObj(tool)) {
        if (!onEmpty) return; // tapping an existing object → let it drag/select
        const playerN = st.current.data.objects.filter(o => o.type === 'player').length + 1;
        // Every tool takes the currently-selected colour when placed.
        const isPlayerTok = tool === 'player' || tool === 'gk';
        const o: PitchObject = { id: uid(), type: tool, x: pos.x / W, y: pos.y / H, color: st.current.activeColor, size: st.current.size, label: tool === 'player' ? String(playerN) : tool === 'number' ? String(st.current.data.objects.filter(x => x.type === 'number').length + 1) : undefined, variant: isPlayerTok ? st.current.playerStyle : undefined };
        commit({ objects: [...st.current.data.objects, o] });
      } else if (isDraw(tool)) {
        drawingRef.current = { pts: [pos.x / W, pos.y / H] };
      } else {
        if (onEmpty) st.current.onSelect?.(null);
      }
    });
    stage.on('mousemove touchmove', (e) => {
      // Empty-pitch touch-drag → scroll the nearest scrollable ancestor.
      if (scrollDragRef.current && 'touches' in e.evt) {
        const sd = scrollDragRef.current; const cy = (e.evt as TouchEvent).touches[0].clientY;
        const dy = sd.y - cy; if (Math.abs(dy) > 3) sd.moved = true;
        sd.el.scrollTop = sd.top + dy; return;
      }
      if (erasingRef.current) { eraseAt(); return; }
      // Connect tool: rubber-band + highlight the object under the pointer (the attach target).
      if (st.current.activeTool === 'connect' && pendingConnect.current) { const p = stage.getPointerPosition(); if (p) drawConnectBand(p, objectAt(p)); return; }
      // Marquee tool: grow the selection box.
      if (st.current.activeTool === 'marquee' && marqueeRef.current) { const p = stage.getPointerPosition(); if (p) drawMarquee(marqueeRef.current.x0, marqueeRef.current.y0, p.x, p.y); return; }
      const dr = drawingRef.current; if (!dr) return; const pos = stage.getPointerPosition(); if (!pos) return;
      const { W, H } = dimsRef.current; const tool = st.current.activeTool as DrawTool;
      const nx = pos.x / W, ny = pos.y / H;
      if (tool === 'pencil' || tool === 'curved') dr.pts.push(nx, ny);
      else if (STRAIGHT_LINE.includes(tool)) {
        // Straight lines/arrows snap to true horizontal/vertical when within ~8° — a guide-line
        // helper so coaches can lay clean lines without a steady hand. Shapes are left free.
        const x0 = dr.pts[0], y0 = dr.pts[1];
        const angle = Math.atan2(Math.abs((ny - y0) * H), Math.abs((nx - x0) * W)) * 180 / Math.PI;
        dr.pts = angle <= 8 ? [x0, y0, nx, y0] : angle >= 82 ? [x0, y0, x0, ny] : [x0, y0, nx, ny];
      }
      else { dr.pts = [dr.pts[0], dr.pts[1], nx, ny]; }
      // live preview
      const layer = guideRef.current!; layer.destroyChildren();
      const preview = buildDrawingNode({ id: 'prev', tool, points: dr.pts, color: st.current.activeColor, width: drawWidth(st.current.size), fill: SHAPE_TOOLS.includes(tool) ? st.current.fill : undefined }, W, H);
      preview.listening(false); layer.add(preview); layer.draw();
    });
    const endDraw = () => {
      // End an empty-pitch scroll gesture (a tap that didn't move = deselect).
      if (scrollDragRef.current) { const moved = scrollDragRef.current.moved; scrollDragRef.current = null; if (!moved) st.current.onSelect?.(null); return; }
      if (erasingRef.current) { erasingRef.current = false; return; }
      // Connect tool: releasing over another object creates the connector (a drag = one edge).
      if (st.current.activeTool === 'connect') {
        const pc = pendingConnect.current;
        if (pc) {
          const pos = stage.getPointerPosition();
          const target = pos ? objectAt(pos) : null;
          if (target && target !== pc.id) addConnector(pc.id, target);
          pendingConnect.current = null; guideRef.current?.destroyChildren(); guideRef.current?.draw();
        }
        return;
      }
      // Marquee tool: the box encloses objects whose centres fall inside → select that group.
      if (st.current.activeTool === 'marquee') {
        const m = marqueeRef.current; marqueeRef.current = null;
        guideRef.current?.destroyChildren(); guideRef.current?.draw();
        if (m) {
          const pos = stage.getPointerPosition();
          if (pos) {
            const { W, H } = dimsRef.current;
            const x1 = Math.min(m.x0, pos.x), x2 = Math.max(m.x0, pos.x), y1 = Math.min(m.y0, pos.y), y2 = Math.max(m.y0, pos.y);
            const ids = st.current.data.objects.filter(o => { const px = o.x * W, py = o.y * H; return px >= x1 && px <= x2 && py >= y1 && py <= y2; }).map(o => o.id);
            setMultiSel(ids); st.current.onSelect?.(null);
          }
        }
        return;
      }
      const dr = drawingRef.current; if (!dr) return; drawingRef.current = null;
      guideRef.current?.destroyChildren(); guideRef.current?.draw();
      if (dr.pts.length >= 4) {
        const tool = st.current.activeTool as DrawTool;
        const d: PitchDrawing = { id: uid(), tool, points: dr.pts, color: st.current.activeColor, width: drawWidth(st.current.size), fill: SHAPE_TOOLS.includes(tool) ? st.current.fill : undefined };
        commit({ drawings: [...st.current.data.drawings, d] });
      }
    };
    stage.on('mouseup touchend', endDraw);

    const resize = () => {
      const { W, H } = computeSize();
      if (Math.abs(W - dimsRef.current.W) < 2 && Math.abs(H - dimsRef.current.H) < 2) return;
      dimsRef.current = { W, H }; stage.size({ width: W, height: H }); renderBg(); renderObjects();
    };
    const ro = new ResizeObserver(resize);
    if (outerRef.current) ro.observe(outerRef.current);
    window.addEventListener('resize', resize);
    // Escape cancels a pending connection or clears a marquee selection.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pendingConnect.current) { pendingConnect.current = null; guideRef.current?.destroyChildren(); guideRef.current?.draw(); }
      if (st.current.multiSel.length) setMultiSel([]);
    };
    window.addEventListener('keydown', onKey);
    return () => { ro.disconnect(); window.removeEventListener('resize', resize); window.removeEventListener('keydown', onKey); stage.destroy(); stageRef.current = null; };
  }, [computeSize, renderBg, renderObjects]);

  // Re-render bg when pitch type/orientation changes.
  useEffect(() => { renderBg(); }, [data.pitchType, data.orientation, data.flip, data.grid, data.gridColor, renderBg]);
  // Re-render objects when data/selection/tool/multi-select changes.
  useEffect(() => { renderObjects(); }, [data.objects, data.drawings, data.connectors, data.fillShapes, selectedId, activeTool, ghostObjects, motion, multiSel, renderObjects]);
  // Cursor reflects tool; leaving the connect/marquee tools cancels any pending state.
  useEffect(() => {
    if (stageRef.current) stageRef.current.container().style.cursor = cursorFor(activeTool);
    if (activeTool !== 'connect' && pendingConnect.current) { pendingConnect.current = null; guideRef.current?.destroyChildren(); guideRef.current?.draw(); }
    if (activeTool !== 'marquee' && multiSel.length) setMultiSel([]);
  }, [activeTool]); // eslint-disable-line react-hooks/exhaustive-deps

  // Commit the inline text editor → add / update / (empty)delete a text object.
  const commitText = () => {
    const te = textEdit; if (!te) return;
    const { W, H } = dimsRef.current; const val = te.value.trim();
    if (te.id) {
      if (val) commit({ objects: st.current.data.objects.map(o => o.id === te.id ? { ...o, label: val } : o) });
      else commit({ objects: st.current.data.objects.filter(o => o.id !== te.id) });
    } else if (val) {
      commit({ objects: [...st.current.data.objects, { id: uid(), type: 'text', x: te.x / W, y: te.y / H, color: st.current.activeColor, size: st.current.size, label: val } as PitchObject] });
    }
    setTextEdit(null);
  };

  return (
    <div ref={outerRef} className="w-full flex justify-center">
      <div className="relative max-w-full">
        <div ref={wrapRef} className="rounded-xl overflow-hidden shadow-inner touch-none select-none max-w-full" data-testid="pitch-canvas" />
        {textEdit && (
          <input
            autoFocus
            value={textEdit.value}
            onChange={e => setTextEdit(te => (te ? { ...te, value: e.target.value } : te))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitText(); } else if (e.key === 'Escape') setTextEdit(null); }}
            onBlur={commitText}
            placeholder="Type…"
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded border border-brand bg-white/95 dark:bg-sentinel-bg/95 px-1.5 py-0.5 text-sm font-bold text-slate-900 dark:text-white outline-none shadow"
            style={{ left: textEdit.x, top: textEdit.y, minWidth: 90 }}
          />
        )}
        {tip && (
          <div className="absolute z-20 pointer-events-none rounded-md bg-[#0a1628] text-white text-[11px] font-semibold px-2 py-1 shadow-lg whitespace-nowrap tabular-nums"
            style={{ left: tip.x, top: tip.y }}>
            {tip.text}
          </div>
        )}
      </div>
    </div>
  );
};

const drawWidth = (s: ObjSize) => (s === 'small' ? 2 : s === 'large' ? 4 : 3);
