/**
 * Static 2D drill renderer — paints a drill (pitch + drawings + objects) onto a 2D
 * canvas. The single source of truth for non-interactive renders: drill thumbnails,
 * library previews, PDF export and the public share page's static drills. Mirrors the
 * Konva visuals in PitchCanvas but as plain canvas (faster, no DOM).
 */
import { drawPitchBackground, pitchAspect, type PitchType, type PitchOrientation, type GridType } from './pitchGeometry';
import type { PitchObject, PitchDrawing, PitchConnector, ObjSize, ObjType, DrawTool } from './PitchCanvas';
import { connectorSegments, closedLoops } from './connectorGraph';

// v7 stored drill objects/lines as ABSOLUTE pixels in a fixed logical canvas (its `{tokens,paths}`
// format). These are the observed bounds (max ≈ 1023×753) — used to normalise legacy coords to 0–1.
const V7_W = 1024, V7_H = 768;
const V8_OBJ_TYPES = new Set<ObjType>(['player', 'gk', 'cone', 'ball', 'goalpost', 'flag', 'number', 'ladder', 'hurdle', 'mannequin', 'pole', 'minigoal', 'ring', 'rebounder', 'text']);
const V8_DRAW_TOOLS = new Set<DrawTool>(['pencil', 'line', 'arrow', 'biarrow', 'dashed', 'dashed-line', 'curved', 'rect', 'circle', 'tri', 'rondo2', 'rondo4', 'transfer']);
const clamp01 = (n: number) => Math.max(0, Math.min(1, n || 0));
const rid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'id' + Math.random().toString(36).slice(2));

/** Convert a legacy v7 {tokens,paths} blob (absolute px) → v8 {objects,drawings} (normalised 0–1). */
function tokensToDrill(dd: any): { objects: PitchObject[]; drawings: PitchDrawing[] } {
  const objects: PitchObject[] = (dd.tokens || []).map((t: any): PitchObject => ({
    id: t.id || rid(),
    type: V8_OBJ_TYPES.has(t.type) ? t.type : 'player',
    x: clamp01((t.x || 0) / V7_W), y: clamp01((t.y || 0) / V7_H),
    color: t.color || '#e53935', size: 'medium',
    ...(t.label ? { label: String(t.label) } : {}),
    ...(t.rot ? { rot: t.rot } : {}), ...(t.scale && t.scale !== 1 ? { scale: t.scale } : {}),
  }));
  const drawings: PitchDrawing[] = (dd.paths || []).map((p: any): PitchDrawing => {
    const pts = Array.isArray(p.points)
      ? p.points.map((v: number, i: number) => clamp01(v / (i % 2 ? V7_H : V7_W)))
      : [clamp01((p.x1 || 0) / V7_W), clamp01((p.y1 || 0) / V7_H), clamp01((p.x2 || 0) / V7_W), clamp01((p.y2 || 0) / V7_H)];
    return {
      id: p.id || rid(),
      tool: V8_DRAW_TOOLS.has(p.type) ? p.type : 'line',
      points: pts, color: p.color || '#ffffff', width: p.width || 3,
      ...(p.filled ? { fill: true } : {}), ...(p.rot ? { rot: p.rot } : {}),
    };
  });
  return { objects, drawings };
}

const SIZE_SCALE: Record<ObjSize, number> = { small: 0.78, medium: 1, large: 1.3 };
const isLight = (hex: string) => { const c = (hex || '#000').replace('#', ''); return (parseInt(c.substr(0, 2), 16) * 299 + parseInt(c.substr(2, 2), 16) * 587 + parseInt(c.substr(4, 2), 16) * 114) / 1000 > 150; };
const hexToRgba = (hex: string, a: number) => { const c = (hex || '#000').replace('#', ''); const n = c.length === 3 ? c.split('').map(x => x + x).join('') : c; return `rgba(${parseInt(n.slice(0, 2), 16)},${parseInt(n.slice(2, 4), 16)},${parseInt(n.slice(4, 6), 16)},${a})`; };

interface RenderableDrill { pitchType: PitchType; orientation: PitchOrientation; objects: PitchObject[]; drawings: PitchDrawing[]; connectors?: PitchConnector[]; fillShapes?: boolean; flip?: boolean; grid?: GridType; gridColor?: string }

/** Draw connector edges (+ filled closed shapes) between objects — mirrors PitchCanvas. */
function drawConnectors(ctx: CanvasRenderingContext2D, drill: RenderableDrill, W: number, H: number) {
  const connectors = drill.connectors; if (!connectors?.length) return;
  ctx.save(); ctx.lineCap = 'round';
  if (drill.fillShapes) {
    const byId = new Map((drill.objects || []).map(o => [o.id, o]));
    closedLoops(drill.objects || [], connectors).forEach(loop => {
      const pts = loop.ids.map(id => byId.get(id)).filter(Boolean) as PitchObject[];
      if (pts.length < 3) return;
      ctx.beginPath(); pts.forEach((o, i) => (i ? ctx.lineTo(o.x * W, o.y * H) : ctx.moveTo(o.x * W, o.y * H))); ctx.closePath();
      ctx.fillStyle = hexToRgba(loop.color, 0.18); ctx.fill();
    });
  }
  connectorSegments(drill.objects || [], connectors).forEach(seg => {
    ctx.beginPath(); ctx.moveTo(seg.from.x * W, seg.from.y * H); ctx.lineTo(seg.to.x * W, seg.to.y * H);
    ctx.strokeStyle = seg.color; ctx.lineWidth = seg.width; ctx.stroke();
  });
  ctx.restore();
}

function poly(ctx: CanvasRenderingContext2D, pts: number[][], close = false) {
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); if (close) ctx.closePath();
}

function drawObject(ctx: CanvasRenderingContext2D, o: PitchObject, W: number, H: number) {
  const x = o.x * W, y = o.y * H, s = SIZE_SCALE[o.size || 'medium'] * ((o as any).scale || 1);
  const stroke = isLight(o.color) ? '#0D1B2A' : '#ffffff';
  ctx.save(); ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot * Math.PI / 180);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const label = (text: string, fill: string, r: number) => { ctx.fillStyle = fill; ctx.font = `bold ${Math.round(r * 1.05)}px Inter, sans-serif`; ctx.fillText(text, 0, 1); };

  switch (o.type) {
    case 'player': case 'gk': {
      const r = 13 * s;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = o.color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke();
      label(o.type === 'gk' ? 'GK' : (o.label || ''), isLight(o.color) ? '#0D1B2A' : '#fff', r); break;
    }
    case 'ball': {
      // Real soccer ball: WHITE body + central black pentagon + seams to the rim (matches PitchCanvas).
      const r = 9 * s, navy = '#0D1B2A', pr = r * 0.44;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = navy; ctx.stroke();
      ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; const px = Math.cos(a) * pr, py = Math.sin(a) * pr; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); ctx.fillStyle = navy; ctx.fill();
      ctx.strokeStyle = navy; ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; ctx.beginPath(); ctx.moveTo(Math.cos(a) * pr, Math.sin(a) * pr); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke(); }
      break;
    }
    case 'cone':
      poly(ctx, [[0, -11 * s], [9.5 * s, 8 * s], [-9.5 * s, 8 * s]], true); ctx.fillStyle = o.color || '#f97316'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#7c2d12'; ctx.stroke(); break;
    case 'flag':
      ctx.lineWidth = 2; ctx.strokeStyle = '#475569'; poly(ctx, [[0, 12 * s], [0, -12 * s]]); ctx.stroke();
      poly(ctx, [[0, -12 * s], [11 * s, -8 * s], [0, -4 * s]], true); ctx.fillStyle = o.color; ctx.fill(); break;
    case 'pole':
      ctx.lineWidth = 4; ctx.strokeStyle = o.color; poly(ctx, [[0, 13 * s], [0, -13 * s]]); ctx.stroke(); break;
    case 'number':
      ctx.beginPath(); ctx.arc(0, 0, 11 * s, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = o.color; ctx.stroke(); label(o.label || '1', o.color, 11 * s); break;
    case 'goalpost': case 'minigoal': {
      const col = o.color || '#e2e8f0';
      const mini = o.type === 'minigoal';
      const hw = (mini ? 13 : 15) * s, ty = (mini ? -5 : -8) * s, by = (mini ? 6 : 9) * s, depth = (mini ? 3 : 5) * s;
      const nx = mini ? 3 : 4, ny = mini ? 2 : 3;
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.45; ctx.lineWidth = 0.8;
      for (let i = 1; i < nx; i++) { const px = -hw + (2 * hw) * i / nx; ctx.beginPath(); ctx.moveTo(px, ty); ctx.lineTo(px, by); ctx.stroke(); }
      for (let i = 1; i < ny; i++) { const py = ty + (by - ty) * i / ny; ctx.beginPath(); ctx.moveTo(-hw, py); ctx.lineTo(hw, py); ctx.stroke(); }
      ctx.globalAlpha = 0.7; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(-hw, ty); ctx.lineTo(-hw + depth, ty - depth); ctx.lineTo(hw - depth, ty - depth); ctx.lineTo(hw, ty); ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineWidth = mini ? 2.4 : 2.8;
      ctx.beginPath(); ctx.moveTo(-hw, by); ctx.lineTo(-hw, ty); ctx.lineTo(hw, ty); ctx.lineTo(hw, by); ctx.stroke();
      ctx.globalAlpha = 0.8; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-hw, by); ctx.lineTo(hw, by); ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
    case 'mannequin':
      ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(0, -8 * s, 4 * s, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = o.color; poly(ctx, [[0, -4 * s], [0, 10 * s]]); ctx.stroke(); poly(ctx, [[-6 * s, 2 * s], [6 * s, 2 * s]]); ctx.stroke(); break;
    case 'ladder':
      ctx.lineWidth = 2; ctx.strokeStyle = o.color || '#fbbf24'; ctx.strokeRect(-7 * s, -13 * s, 14 * s, 26 * s);
      [-6.5, 0, 6.5].forEach(dy => { poly(ctx, [[-7 * s, dy * s], [7 * s, dy * s]]); ctx.lineWidth = 1.5; ctx.stroke(); }); break;
    case 'hurdle':
      ctx.lineWidth = 2.5; ctx.strokeStyle = o.color; poly(ctx, [[-10 * s, 6 * s], [-10 * s, -6 * s], [10 * s, -6 * s], [10 * s, 6 * s]]); ctx.stroke(); break;
    case 'ring':
      ctx.beginPath(); ctx.arc(0, 0, 11 * s, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = o.color; ctx.stroke(); break;
    case 'rebounder':
      ctx.lineWidth = 2; ctx.strokeStyle = o.color; ctx.strokeRect(-11 * s, -8 * s, 22 * s, 16 * s); poly(ctx, [[-11 * s, -8 * s], [11 * s, 8 * s]]); ctx.lineWidth = 1; ctx.stroke(); break;
    case 'text':
      ctx.fillStyle = o.color; ctx.font = `bold ${Math.round(16 * s)}px Inter, sans-serif`; ctx.fillText(o.label || 'Text', 0, 1); break;
  }
  ctx.restore();
}

function arrowHead(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, color: string, len = 10) {
  const a = Math.atan2(toY - fromY, toX - fromX);
  ctx.beginPath(); ctx.moveTo(toX, toY);
  ctx.lineTo(toX - len * Math.cos(a - Math.PI / 6), toY - len * Math.sin(a - Math.PI / 6));
  ctx.lineTo(toX - len * Math.cos(a + Math.PI / 6), toY - len * Math.sin(a + Math.PI / 6));
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}

function drawDrawing(ctx: CanvasRenderingContext2D, d: PitchDrawing, W: number, H: number) {
  const pts: number[][] = []; for (let i = 0; i < d.points.length; i += 2) pts.push([d.points[i] * W, d.points[i + 1] * H]);
  if (pts.length < 2) return;
  ctx.save(); ctx.strokeStyle = d.color; ctx.lineWidth = d.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Rotate the shape around its own centre (mirrors the interactive builder).
  if ((d as any).rot) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pts.forEach(([px, py]) => { minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py); });
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    ctx.translate(cx, cy); ctx.rotate((d as any).rot * Math.PI / 180); ctx.translate(-cx, -cy);
  }
  if (d.tool === 'dashed' || d.tool === 'dashed-line') ctx.setLineDash([8, 6]);
  if (d.tool === 'pencil' || d.tool === 'curved') {
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  } else if (d.tool === 'rect' || d.tool === 'circle' || d.tool === 'tri') {
    const [a, b] = [pts[0], pts[pts.length - 1]]; const [x1, y1] = a, [x2, y2] = b;
    ctx.setLineDash([]); ctx.beginPath();
    if (d.tool === 'rect') ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    else if (d.tool === 'circle') ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
    else { ctx.moveTo((x1 + x2) / 2, y1); ctx.lineTo(x1, y2); ctx.lineTo(x2, y2); ctx.closePath(); }
    if (d.fill) { ctx.fillStyle = hexToRgba(d.color, 0.22); ctx.fill(); }
    ctx.stroke();
  } else if (d.tool === 'rondo2' || d.tool === 'rondo4' || d.tool === 'transfer') {
    // Rondo grids — outer box + internal dividers (transfer = two boxes with a channel between).
    const [a, b] = [pts[0], pts[pts.length - 1]]; const [x1, y1] = a, [x2, y2] = b;
    const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
    ctx.setLineDash([]);
    const box = (rx: number, ry: number, rw: number, rh: number) => { ctx.beginPath(); ctx.rect(rx, ry, rw, rh); if (d.fill) { ctx.fillStyle = hexToRgba(d.color, 0.22); ctx.fill(); } ctx.stroke(); };
    box(x, y, w, h);
    ctx.beginPath();
    if (d.tool === 'transfer') { const bw = w * 0.4; ctx.moveTo(x + bw, y); ctx.lineTo(x + bw, y + h); ctx.moveTo(x + w - bw, y); ctx.lineTo(x + w - bw, y + h); }
    else { ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); if (d.tool === 'rondo4') { ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); } }
    ctx.stroke();
  } else {
    const [a, b] = [pts[0], pts[pts.length - 1]];
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.setLineDash([]);
    if (d.tool === 'arrow' || d.tool === 'dashed') arrowHead(ctx, a[0], a[1], b[0], b[1], d.color);
    if (d.tool === 'biarrow') { arrowHead(ctx, a[0], a[1], b[0], b[1], d.color); arrowHead(ctx, b[0], b[1], a[0], a[1], d.color); }
  }
  ctx.restore();
}

export function drawDrill(ctx: CanvasRenderingContext2D, W: number, H: number, drill: RenderableDrill) {
  drawPitchBackground(ctx, W, H, drill.pitchType, drill.orientation, drill.flip, drill.grid || 'none', drill.gridColor);
  (drill.drawings || []).forEach(d => drawDrawing(ctx, d, W, H));
  drawConnectors(ctx, drill, W, H); // connectors under objects (icons stay on top)
  (drill.objects || []).forEach(o => drawObject(ctx, o, W, H));
}

/** Normalise a stored drawing_data / animation-frame blob → {objects, drawings},
 *  tolerating the legacy {shapes:[{type,x,y,label}]} format. Shared by share + PDF. */
export function normaliseDrawingData(dd: any): { objects: PitchObject[]; drawings: PitchDrawing[]; connectors: PitchConnector[]; fillShapes: boolean; flip: boolean; grid: GridType; gridColor?: string } {
  dd = dd || {};
  // Older saves stored the blob as a JSON *string* — parse it back before reading.
  if (typeof dd === 'string') { try { dd = JSON.parse(dd); } catch { dd = {}; } }
  const conns: PitchConnector[] = Array.isArray(dd.connectors) ? dd.connectors : [];
  if (Array.isArray(dd.objects) || Array.isArray(dd.drawings)) return { objects: dd.objects || [], drawings: dd.drawings || [], connectors: conns, fillShapes: !!dd.fillShapes, flip: !!dd.flip, grid: dd.grid || 'none', gridColor: dd.gridColor };
  // Legacy v7 {tokens,paths} (absolute px) → normalised objects/drawings.
  if (Array.isArray(dd.tokens) || Array.isArray(dd.paths)) {
    const { objects, drawings } = tokensToDrill(dd);
    return { objects, drawings, connectors: conns, fillShapes: !!dd.fillShapes, flip: !!dd.flip, grid: dd.grid || 'none', gridColor: dd.gridColor };
  }
  const objects: PitchObject[] = (dd.shapes || []).map((s: any) => ({
    id: s.id || Math.random().toString(36).slice(2), type: s.type === 'ball' ? 'ball' : s.type === 'cone' ? 'cone' : 'player',
    x: s.x, y: s.y, color: s.type === 'cone' ? '#f97316' : '#e53935', size: 'medium' as ObjSize, label: s.label,
  }));
  return { objects, drawings: [], connectors: conns, fillShapes: !!dd.fillShapes, flip: false, grid: dd.grid || 'none', gridColor: dd.gridColor };
}
export function normaliseFrames(frames: any): { objects: PitchObject[]; drawings: PitchDrawing[]; flip: boolean }[] {
  return (Array.isArray(frames) && frames.length ? frames : [{ objects: [], drawings: [] }]).map(normaliseDrawingData);
}

/** Render a drill to a PNG data URL (thumbnail / preview / PDF). */
export function renderDrillThumbnail(drill: RenderableDrill, W = 320, H?: number, dpr = 2): string {
  const aspect = pitchAspect(drill.pitchType, drill.orientation);
  const h = H ?? Math.round(W / aspect);
  const cv = document.createElement('canvas'); cv.width = W * dpr; cv.height = h * dpr;
  const ctx = cv.getContext('2d')!; ctx.scale(dpr, dpr);
  drawDrill(ctx, W, h, drill);
  return cv.toDataURL('image/png');
}
