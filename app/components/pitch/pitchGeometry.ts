/**
 * Pitch geometry — a faithful port of v7 `drawPitch` (src/js/drill-builder.js).
 * Pure 2D-canvas drawing so the React/Konva builder renders the EXACT same pitches,
 * proportions and striping as the original. Used to paint the pitch onto an offscreen
 * canvas that the Konva background layer displays (listening:false → never grabs input).
 */
export type PitchType =
  | 'full' | 'half' | 'third' | 'threequarter' | 'smallsided'
  | 'outline' | 'halves' | 'thirds' | 'blank';
export type PitchOrientation = 'landscape' | 'portrait';

export const PITCH_OPTIONS: { value: PitchType; label: string }[] = [
  { value: 'full', label: 'Full Pitch' },
  { value: 'half', label: 'Half Pitch' },
  { value: 'third', label: 'One Third' },
  { value: 'threequarter', label: 'Three Quarter' },
  { value: 'smallsided', label: 'Small Sided' },
  { value: 'outline', label: 'Outline' },
  { value: 'halves', label: '+ Halves' },
  { value: 'thirds', label: '+ Thirds' },
  { value: 'blank', label: 'Blank' },
];

/**
 * Tactical grid overlays — dashed zone outlines drawn over the pitch to highlight
 * thirds / channels / positional-play zones. Never labelled (just outlines); the
 * half-space variant additionally shades the two half-space channels. `only` limits
 * an option to certain pitch types (Thirds is a full-pitch concept).
 */
export type GridType = 'none' | 'thirds' | 'halfspaces' | 'halfspaces-hl' | 'positional' | 'compact' | 'zones18' | 'zones20';
export const GRID_OPTIONS: { value: GridType; label: string; only?: PitchType[] }[] = [
  { value: 'none', label: 'No Grid' },
  { value: 'thirds', label: 'Thirds', only: ['full'] },
  { value: 'halfspaces', label: 'Half-Spaces' },
  { value: 'halfspaces-hl', label: 'Half-Spaces (Shaded)' },
  { value: 'positional', label: 'Positional Play' },
  { value: 'compact', label: '16 Zones' },
  { value: 'zones18', label: '18 Zones' },
  { value: 'zones20', label: '20 Zones' },
];
/** Grid options available for a given pitch type (Thirds only on full pitch). */
export const gridOptionsFor = (pitchType: PitchType) => GRID_OPTIONS.filter(g => !g.only || g.only.includes(pitchType));

/**
 * Stage aspect ratio (W/H) per pitch type — ports v7 `updateCanvasDimensions` so HALF and
 * THIRD pitches render at their true (narrower) proportions instead of being stretched to
 * the full-pitch box. Full / three-quarter / small-sided keep the established full aspect
 * (which already reads correctly); only half (½ length) and third (⅓ length) get v7's width
 * factors — which are also the real-world pitch length ratios (½, ⅓).
 */
export function pitchAspect(pitchType: PitchType, orientation: PitchOrientation = 'landscape'): number {
  if (orientation === 'portrait') {
    const full = 3 / 4;
    if (pitchType === 'half') return full / 0.535;
    if (pitchType === 'third') return full / 0.4;
    return full;
  }
  const full = 3 / 2;
  if (pitchType === 'half') return full * 0.5;
  if (pitchType === 'third') return full / 3;
  return full;
}

const PAD = 28;
const LINE = 'rgba(255,255,255,0.9)';

type Ctx = CanvasRenderingContext2D;

const pLine = (c: Ctx, x1: number, y1: number, x2: number, y2: number) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
const pDot = (c: Ctx, x: number, y: number, r: number) => { c.save(); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = 'white'; c.fill(); c.restore(); };
const pCA = (c: Ctx, x: number, y: number, a0: number, a1: number) => { c.save(); c.beginPath(); c.arc(x, y, 11, a0, a1); c.strokeStyle = LINE; c.lineWidth = 2; c.stroke(); c.restore(); };
function pCorners(c: Ctx, fx: number, fy: number, fw: number, fh: number) {
  pCA(c, fx, fy, 0, Math.PI / 2);
  pCA(c, fx + fw, fy, Math.PI / 2, Math.PI);
  pCA(c, fx + fw, fy + fh, Math.PI, 1.5 * Math.PI);
  pCA(c, fx, fy + fh, 1.5 * Math.PI, 2 * Math.PI);
}

// ── Landscape variants ──────────────────────────────────────────────────────
function pFull(c: Ctx, fx: number, fy: number, fw: number, fh: number) {
  const mx = fx + fw / 2, my = fy + fh / 2;
  c.strokeRect(fx, fy, fw, fh); pLine(c, mx, fy, mx, fy + fh); pDot(c, mx, my, 4);
  c.beginPath(); c.arc(mx, my, fh * 0.175, 0, Math.PI * 2); c.stroke();
  const pbW = fw * 0.138, pbH = fh * 0.44, gbW = fw * 0.053, gbH = fh * 0.22;
  c.strokeRect(fx, my - pbH / 2, pbW, pbH); c.strokeRect(fx, my - gbH / 2, gbW, gbH); c.strokeRect(fx - 10, my - fh * 0.105, 10, fh * 0.21);
  const lS = fx + pbW * 0.72; pDot(c, lS, my, 3);
  c.save(); c.beginPath(); c.rect(fx + pbW, fy, fw, fh); c.clip(); c.beginPath(); c.arc(lS, my, fh * 0.175, 0, Math.PI * 2); c.stroke(); c.restore();
  c.strokeRect(fx + fw - pbW, my - pbH / 2, pbW, pbH); c.strokeRect(fx + fw - gbW, my - gbH / 2, gbW, gbH); c.strokeRect(fx + fw, my - fh * 0.105, 10, fh * 0.21);
  const rS = fx + fw - pbW * 0.72; pDot(c, rS, my, 3);
  c.save(); c.beginPath(); c.rect(fx, fy, fw - pbW, fh); c.clip(); c.beginPath(); c.arc(rS, my, fh * 0.175, 0, Math.PI * 2); c.stroke(); c.restore();
  pCorners(c, fx, fy, fw, fh);
}
function pHalf(c: Ctx, fx: number, fy: number, fw: number, fh: number) {
  c.strokeRect(fx, fy, fw, fh);
  const my = fy + fh / 2;
  pLine(c, fx + fw, fy, fx + fw, fy + fh); pDot(c, fx + fw, my, 4);
  c.save(); c.beginPath(); c.rect(fx, fy, fw, fh); c.clip(); c.beginPath(); c.arc(fx + fw, my, fh * 0.175, 0, Math.PI * 2); c.stroke(); c.restore();
  const pbW = fw * 0.276, pbH = fh * 0.44, gbW = fw * 0.106, gbH = fh * 0.22;
  c.strokeRect(fx, my - pbH / 2, pbW, pbH); c.strokeRect(fx, my - gbH / 2, gbW, gbH); c.strokeRect(fx - 10, my - fh * 0.105, 10, fh * 0.21);
  const lS = fx + pbW * 0.72; pDot(c, lS, my, 3);
  c.save(); c.beginPath(); c.rect(fx + pbW, fy, fw, fh); c.clip(); c.beginPath(); c.arc(lS, my, fh * 0.175, 0, Math.PI * 2); c.stroke(); c.restore();
  pCA(c, fx, fy, 0, Math.PI / 2); pCA(c, fx, fy + fh, 1.5 * Math.PI, 2 * Math.PI);
}
function pThird(c: Ctx, fx: number, fy: number, fw: number, fh: number) {
  c.strokeRect(fx, fy, fw, fh);
  const my = fy + fh / 2;
  const pbW = fw * 0.414, pbH = fh * 0.44, gbW = fw * 0.159, gbH = fh * 0.22;
  c.strokeRect(fx, my - pbH / 2, pbW, pbH); c.strokeRect(fx, my - gbH / 2, gbW, gbH); c.strokeRect(fx - 10, my - fh * 0.105, 10, fh * 0.21);
  const lS = fx + pbW * 0.72; pDot(c, lS, my, 3);
  c.save(); c.beginPath(); c.rect(fx + pbW, fy, fw, fh); c.clip(); c.beginPath(); c.arc(lS, my, fh * 0.175, 0, Math.PI * 2); c.stroke(); c.restore();
  pCA(c, fx, fy, 0, Math.PI / 2); pCA(c, fx, fy + fh, 1.5 * Math.PI, 2 * Math.PI);
}
function pThreeQuarter(c: Ctx, fx: number, fy: number, fw: number, fh: number) {
  c.strokeRect(fx, fy, fw, fh);
  const my = fy + fh / 2;
  const cx = fx + fw * (2 / 3);
  pLine(c, cx, fy, cx, fy + fh); pDot(c, cx, my, 4);
  c.save(); c.beginPath(); c.rect(fx, fy, fw, fh); c.clip(); c.beginPath(); c.arc(cx, my, fh * 0.175, 0, Math.PI * 2); c.stroke(); c.restore();
  const pbW = fw * 0.184, pbH = fh * 0.44, gbW = fw * 0.071, gbH = fh * 0.22;
  c.strokeRect(fx, my - pbH / 2, pbW, pbH); c.strokeRect(fx, my - gbH / 2, gbW, gbH); c.strokeRect(fx - 10, my - fh * 0.105, 10, fh * 0.21);
  const lS = fx + pbW * 0.72; pDot(c, lS, my, 3);
  c.save(); c.beginPath(); c.rect(fx + pbW, fy, fw, fh); c.clip(); c.beginPath(); c.arc(lS, my, fh * 0.175, 0, Math.PI * 2); c.stroke(); c.restore();
  pCA(c, fx, fy, 0, Math.PI / 2); pCA(c, fx, fy + fh, 1.5 * Math.PI, 2 * Math.PI);
}
function pSmall(c: Ctx, fx: number, fy: number, fw: number, fh: number) {
  const mx = fx + fw / 2, my = fy + fh / 2;
  c.strokeRect(fx, fy, fw, fh); pLine(c, mx, fy, mx, fy + fh); pDot(c, mx, my, 4);
  const gbW = fw * 0.10, gbH = fh * 0.38, gW = 16, gH = fh * 0.22;
  c.strokeRect(fx, my - gbH / 2, gbW, gbH); c.strokeRect(fx - gW, my - gH / 2, gW, gH);
  c.strokeRect(fx + fw - gbW, my - gbH / 2, gbW, gbH); c.strokeRect(fx + fw, my - gH / 2, gW, gH);
  pCorners(c, fx, fy, fw, fh);
}

// ── Portrait variants ───────────────────────────────────────────────────────
function pFullVert(c: Ctx, fx: number, fy: number, fw: number, fh: number) {
  const mx = fx + fw / 2, my = fy + fh / 2;
  c.strokeRect(fx, fy, fw, fh); pLine(c, fx, my, fx + fw, my); pDot(c, mx, my, 4);
  c.beginPath(); c.arc(mx, my, fw * 0.175, 0, Math.PI * 2); c.stroke();
  const pbH = fh * 0.138, pbW = fw * 0.44, gbH = fh * 0.053, gbW = fw * 0.22, gW = fw * 0.21;
  c.strokeRect(mx - pbW / 2, fy, pbW, pbH); c.strokeRect(mx - gbW / 2, fy, gbW, gbH); c.strokeRect(mx - gW / 2, fy - 10, gW, 10);
  const tS = fy + pbH * 0.72; pDot(c, mx, tS, 3);
  c.save(); c.beginPath(); c.rect(fx, fy + pbH, fw, fh); c.clip(); c.beginPath(); c.arc(mx, tS, fw * 0.175, 0, Math.PI * 2); c.stroke(); c.restore();
  c.strokeRect(mx - pbW / 2, fy + fh - pbH, pbW, pbH); c.strokeRect(mx - gbW / 2, fy + fh - gbH, gbW, gbH); c.strokeRect(mx - gW / 2, fy + fh, gW, 10);
  const bS = fy + fh - pbH * 0.72; pDot(c, mx, bS, 3);
  c.save(); c.beginPath(); c.rect(fx, fy, fw, fh - pbH); c.clip(); c.beginPath(); c.arc(mx, bS, fw * 0.175, 0, Math.PI * 2); c.stroke(); c.restore();
  pCorners(c, fx, fy, fw, fh);
}
function pHalfVert(c: Ctx, fx: number, fy: number, fw: number, fh: number) {
  c.strokeRect(fx, fy, fw, fh);
  const mx = fx + fw / 2;
  pLine(c, fx, fy, fx + fw, fy); pDot(c, mx, fy, 4);
  c.save(); c.beginPath(); c.rect(fx, fy, fw, fh); c.clip(); c.beginPath(); c.arc(mx, fy, fw * 0.175, 0, Math.PI); c.stroke(); c.restore();
  const pbH = fh * 0.276, pbW = fw * 0.44, gbH = fh * 0.106, gbW = fw * 0.22, gW = fw * 0.21;
  c.strokeRect(mx - pbW / 2, fy + fh - pbH, pbW, pbH); c.strokeRect(mx - gbW / 2, fy + fh - gbH, gbW, gbH); c.strokeRect(mx - gW / 2, fy + fh, gW, 10);
  const bS = fy + fh - pbH * 0.72; pDot(c, mx, bS, 3);
  c.save(); c.beginPath(); c.rect(fx, fy, fw, fh - pbH); c.clip(); c.beginPath(); c.arc(mx, bS, fw * 0.175, 0, Math.PI * 2); c.stroke(); c.restore();
  pCA(c, fx + fw, fy + fh, Math.PI, 1.5 * Math.PI); pCA(c, fx, fy + fh, 1.5 * Math.PI, 2 * Math.PI);
}
function pThirdVert(c: Ctx, fx: number, fy: number, fw: number, fh: number) {
  c.strokeRect(fx, fy, fw, fh);
  const mx = fx + fw / 2;
  const pbH = fh * 0.414, pbW = fw * 0.44, gbH = fh * 0.159, gbW = fw * 0.22, gW = fw * 0.21;
  c.strokeRect(mx - pbW / 2, fy + fh - pbH, pbW, pbH); c.strokeRect(mx - gbW / 2, fy + fh - gbH, gbW, gbH); c.strokeRect(mx - gW / 2, fy + fh, gW, 10);
  const bS = fy + fh - pbH * 0.72; pDot(c, mx, bS, 3);
  c.save(); c.beginPath(); c.rect(fx, fy, fw, fh - pbH); c.clip(); c.beginPath(); c.arc(mx, bS, fw * 0.175, 0, Math.PI * 2); c.stroke(); c.restore();
  pCA(c, fx + fw, fy + fh, Math.PI, 1.5 * Math.PI); pCA(c, fx, fy + fh, 1.5 * Math.PI, 2 * Math.PI);
}
function pThreeQuarterVert(c: Ctx, fx: number, fy: number, fw: number, fh: number) {
  c.strokeRect(fx, fy, fw, fh);
  const mx = fx + fw / 2;
  const cy = fy + fh * (1 / 3);
  pLine(c, fx, cy, fx + fw, cy); pDot(c, mx, cy, 4);
  c.save(); c.beginPath(); c.rect(fx, fy, fw, fh); c.clip(); c.beginPath(); c.arc(mx, cy, fw * 0.175, 0, Math.PI * 2); c.stroke(); c.restore();
  const pbH = fh * 0.184, pbW = fw * 0.44, gbH = fh * 0.071, gbW = fw * 0.22, gW = fw * 0.21;
  c.strokeRect(mx - pbW / 2, fy + fh - pbH, pbW, pbH); c.strokeRect(mx - gbW / 2, fy + fh - gbH, gbW, gbH); c.strokeRect(mx - gW / 2, fy + fh, gW, 10);
  const bS = fy + fh - pbH * 0.72; pDot(c, mx, bS, 3);
  c.save(); c.beginPath(); c.rect(fx, fy, fw, fh - pbH); c.clip(); c.beginPath(); c.arc(mx, bS, fw * 0.175, 0, Math.PI * 2); c.stroke(); c.restore();
  pCA(c, fx, fy + fh, Math.PI * 1.5, Math.PI * 2); pCA(c, fx + fw, fy + fh, Math.PI, Math.PI * 1.5);
}
function pSmallVert(c: Ctx, fx: number, fy: number, fw: number, fh: number) {
  const mx = fx + fw / 2, my = fy + fh / 2;
  c.strokeRect(fx, fy, fw, fh); pLine(c, fx, my, fx + fw, my); pDot(c, mx, my, 4);
  const gbW = fw * 0.38, gbH = fh * 0.10, gW = 16;
  c.strokeRect(mx - gbW / 2, fy, gbW, gbH); c.strokeRect(mx - gW / 2, fy - 8, gW, 8);
  c.strokeRect(mx - gbW / 2, fy + fh - gbH, gbW, gbH); c.strokeRect(mx - gW / 2, fy + fh, gW, 8);
  pCorners(c, fx, fy, fw, fh);
}

/**
 * Draw a tactical grid overlay inside the field rect (fx,fy,fw,fh). Dashed outlines only —
 * no numbers/labels. Orientation-aware: "length" is the long axis of a full pitch (x in
 * landscape, y in portrait); "width" the short axis. Channels use penalty-area-aligned
 * fractions so the centre lane ≈ 6-yard box and the half-spaces sit between box and area.
 */
const GRID_LINE = 'rgba(255,255,255,0.62)';
// 5 lanes across the width: wing | half-space | centre | half-space | wing (juego de posición).
const LANES = [0.28, 0.39, 0.61, 0.72];

/** Fraction of a FULL pitch's length that a given pitch canvas represents. Zone grids are
 *  anchored to the full pitch, so a half pitch shows ~half the length-zones, a three-quarter
 *  pitch ~three-quarters, etc. (width channels are unaffected — they run the whole length). */
export function pitchLengthFraction(pt: PitchType): number {
  if (pt === 'half') return 0.5;
  if (pt === 'third') return 1 / 3;
  if (pt === 'threequarter') return 0.75;
  return 1; // full / smallsided / outline / halves / thirds / blank
}

interface GridDef { length: number[]; width: number[]; shade?: [number, number][] }
// length[] = cut positions as fractions of the FULL pitch length (0 = goal end); width[] =
// channel positions as fractions of the width; shade = half-space bands (width fractions).
const GRID_DEFS: Record<Exclude<GridType, 'none'>, GridDef> = {
  thirds: { length: [1 / 3, 2 / 3], width: [] },
  halfspaces: { length: [], width: LANES },
  'halfspaces-hl': { length: [], width: LANES, shade: [[LANES[0], LANES[1]], [LANES[2], LANES[3]]] },
  positional: { length: [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6], width: [0.2, 0.4, 0.6, 0.8] },
  compact: { length: [0.25, 0.5, 0.75], width: [0.25, 0.5, 0.75] },
  zones18: { length: [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6], width: [1 / 3, 2 / 3] },
  zones20: { length: [0.25, 0.5, 0.75], width: [0.2, 0.4, 0.6, 0.8] },
};

export function drawGridOverlay(c: Ctx, fx: number, fy: number, fw: number, fh: number, grid: GridType, orientation: PitchOrientation = 'landscape', pitchType: PitchType = 'full', color?: string) {
  if (!grid || grid === 'none' || fw <= 4 || fh <= 4) return;
  const isPort = orientation === 'portrait';
  const Lf = pitchLengthFraction(pitchType);
  // A length cut at full-pitch fraction `p` (0 = goal end). Only drawn if it falls inside the
  // visible window (p < Lf); its on-screen position is p/Lf. Goal end = left (landscape) / bottom (portrait).
  const lengthLine = (p: number) => {
    if (p >= Lf - 1e-6) return;
    const r = p / Lf;
    if (isPort) { const y = fy + fh - fh * r; pLine(c, fx, y, fx + fw, y); }
    else { const x = fx + fw * r; pLine(c, x, fy, x, fy + fh); }
  };
  // Like lengthLine, but the cut only spans the width band [w1,w2] (used for the wing-only
  // subdivisions in the Positional Play grid, which stop at the lane line).
  const lengthLineBand = (p: number, w1: number, w2: number) => {
    if (p >= Lf - 1e-6) return;
    const r = p / Lf;
    if (isPort) { const y = fy + fh - fh * r; pLine(c, fx + fw * w1, y, fx + fw * w2, y); }
    else { const x = fx + fw * r; pLine(c, x, fy + fh * w1, x, fy + fh * w2); }
  };
  // A channel cut across the width at fraction `f` (runs the whole visible length; never scaled).
  const widthLine = (f: number) => isPort ? pLine(c, fx + fw * f, fy, fx + fw * f, fy + fh) : pLine(c, fx, fy + fh * f, fx + fw, fy + fh * f);
  const shadeBand = (f1: number, f2: number) => isPort ? c.fillRect(fx + fw * f1, fy, fw * (f2 - f1), fh) : c.fillRect(fx, fy + fh * f1, fw, fh * (f2 - f1));

  c.save();
  const stroke = color || GRID_LINE;
  c.setLineDash([7, 6]); c.lineWidth = 1.6; c.strokeStyle = stroke; c.lineCap = 'butt'; c.lineJoin = 'miter';

  // Positional Play (juego de posición): the half-space lanes (LANES = penalty-box 0.28/0.72 &
  // 6-yard-box 0.39/0.61 edges → thin half-spaces flanking a bigger centre lane), then the two
  // WING lanes are each split into 3 boxes per half — the penalty-box zone (to the 18-yard line)
  // plus two equal boxes to halfway. Those wing cuts stop at the wing lane line, not the pitch.
  if (grid === 'positional') {
    const lanes = LANES;
    lanes.forEach(widthLine);
    const box = 0.138; // 18-yard line as a fraction of the FULL pitch length (matches pFull)
    [box, 0.5, 1 - box].forEach(lengthLine); // full-height cuts: penalty-box edges + halfway
    [(box + 0.5) / 2, (1 - box + 0.5) / 2].forEach(p => { lengthLineBand(p, 0, lanes[0]); lengthLineBand(p, lanes[3], 1); }); // wings only
    c.restore();
    return;
  }

  const def = GRID_DEFS[grid as Exclude<GridType, 'none'>];
  if (!def) { c.restore(); return; }
  if (def.shade) { c.save(); c.setLineDash([]); c.globalAlpha = 0.16; c.fillStyle = color || '#ffffff'; def.shade.forEach(([a, b]) => shadeBand(a, b)); c.restore(); }
  def.width.forEach(widthLine);
  def.length.forEach(lengthLine);
  c.restore();
}

/** Paint a pitch of the given type/orientation to fill a W×H 2D context.
 *  `flip` mirrors the markings so the goal end swaps to the opposite side
 *  (horizontal mirror for landscape, vertical for portrait). `grid` overlays
 *  dashed tactical zones over the field. */
export function drawPitchBackground(c: Ctx, W: number, H: number, pitchType: PitchType, orientation: PitchOrientation = 'landscape', flip = false, grid: GridType = 'none', gridColor?: string) {
  const isPort = orientation === 'portrait';
  if (pitchType === 'blank') { c.fillStyle = '#1a4a2a'; c.fillRect(0, 0, W, H); return; }

  c.fillStyle = '#1e5c30'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#1a5228';
  if (isPort) { const sh = H / 10; for (let i = 0; i * sh < H; i += 2) c.fillRect(0, i * sh, W, sh); }
  else { const sw = W / 10; for (let i = 0; i * sw < W; i += 2) c.fillRect(i * sw, 0, sw, H); }

  c.strokeStyle = LINE; c.lineWidth = 2; c.lineCap = 'square'; c.lineJoin = 'miter';
  const fx = PAD, fy = PAD, fw = W - 2 * PAD, fh = H - 2 * PAD;
  // Guard: at very small (or transient 0-width) canvases the field dimensions go
  // negative → negative arc radii throw. Just leave the grass filled until the
  // ResizeObserver re-renders at the real size. (Fixed a mobile blank-screen crash.)
  if (fw <= 4 || fh <= 4) return;

  // Mirror the markings (goal end swaps sides) — grass/stripes are symmetric so stay put.
  c.save();
  if (flip) { if (isPort) { c.translate(0, H); c.scale(1, -1); } else { c.translate(W, 0); c.scale(-1, 1); } }

  if (isPort) {
    if (pitchType === 'full') pFullVert(c, fx, fy, fw, fh);
    else if (pitchType === 'half') pHalfVert(c, fx, fy, fw, fh);
    else if (pitchType === 'third') pThirdVert(c, fx, fy, fw, fh);
    else if (pitchType === 'smallsided') pSmallVert(c, fx, fy, fw, fh);
    else if (pitchType === 'threequarter') pThreeQuarterVert(c, fx, fy, fw, fh);
    else if (pitchType === 'outline') { c.strokeRect(fx, fy, fw, fh); pCorners(c, fx, fy, fw, fh); }
    else if (pitchType === 'halves') { c.strokeRect(fx, fy, fw, fh); pLine(c, fx, fy + fh / 2, fx + fw, fy + fh / 2); pDot(c, fx + fw / 2, fy + fh / 2, 4); pCorners(c, fx, fy, fw, fh); }
    else if (pitchType === 'thirds') { c.strokeRect(fx, fy, fw, fh); pLine(c, fx, fy + fh / 3, fx + fw, fy + fh / 3); pLine(c, fx, fy + fh * 2 / 3, fx + fw, fy + fh * 2 / 3); pCorners(c, fx, fy, fw, fh); }
  } else {
    if (pitchType === 'full') pFull(c, fx, fy, fw, fh);
    else if (pitchType === 'half') pHalf(c, fx, fy, fw, fh);
    else if (pitchType === 'third') pThird(c, fx, fy, fw, fh);
    else if (pitchType === 'smallsided') pSmall(c, fx, fy, fw, fh);
    else if (pitchType === 'threequarter') pThreeQuarter(c, fx, fy, fw, fh);
    else if (pitchType === 'outline') { c.strokeRect(fx, fy, fw, fh); pCorners(c, fx, fy, fw, fh); }
    else if (pitchType === 'halves') { c.strokeRect(fx, fy, fw, fh); pLine(c, fx + fw / 2, fy, fx + fw / 2, fy + fh); pDot(c, fx + fw / 2, fy + fh / 2, 4); pCorners(c, fx, fy, fw, fh); }
    else if (pitchType === 'thirds') { c.strokeRect(fx, fy, fw, fh); pLine(c, fx + fw / 3, fy, fx + fw / 3, fy + fh); pLine(c, fx + fw * 2 / 3, fy, fx + fw * 2 / 3, fy + fh); pCorners(c, fx, fy, fw, fh); }
  }
  c.restore();

  // Grid overlay (drawn un-mirrored — zones are symmetric — over the field rect).
  if (grid && grid !== 'none') drawGridOverlay(c, fx, fy, fw, fh, grid, orientation, pitchType, gridColor);
}

/** Render a pitch to a fresh canvas (for offscreen use / Konva.Image / thumbnails). */
export function renderPitchCanvas(W: number, H: number, pitchType: PitchType, orientation: PitchOrientation = 'landscape', dpr = 1, flip = false, grid: GridType = 'none', gridColor?: string): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext('2d')!;
  ctx.scale(dpr, dpr);
  drawPitchBackground(ctx, W, H, pitchType, orientation, flip, grid, gridColor);
  return cv;
}
