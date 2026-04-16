/**
 * Animation Builder — Konva.js powered drill animation tool
 * Provides drag-from-palette, keyframe animation, drawing tools, and export.
 */
import Konva from 'konva';
import supabase from '../supabase.js';
import { getProfile } from '../auth.js';
import { showToast } from '../toast.js';

// ═══════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════
let stage = null;
let pitchLayer = null;
let objectLayer = null;
let drawLayer = null;

const CANVAS_W = 1080;
const CANVAS_H = 578;
const PAD = 28;

// Active placement color (selected via swatches, like drill-builder's selColor)
let selColor = '#e53935';

let drawColor = '#ffffff';
let activeTool = null; // null = select mode, 'arrow', 'dashed', 'curved', 'wavy'
let drawStartPos = null;
let tempLine = null;

// Placement mode: clicking palette sets pendingPlace, then click pitch to place
let pendingPlace = null; // { type: 'player'|'cone'|..., isGK: bool }

// Size system (small/medium/large) — matches drill-builder SIZE_PRESETS
let currentSize = 'medium';
const SIZE_PRESETS = {
    player:     { small: 0.8, medium: 1.0, large: 1.3 },
    goalkeeper: { small: 0.8, medium: 1.0, large: 1.3 },
    cone:       { small: 0.7, medium: 1.0, large: 1.5 },
    ball:       { small: 0.7, medium: 1.0, large: 1.5 },
    goalpost:   { small: 0.6, medium: 1.0, large: 1.6 },
    flag:       { small: 0.7, medium: 1.0, large: 1.5 },
    number:     { small: 0.7, medium: 1.0, large: 1.4 },
    ladder:     { small: 0.7, medium: 1.0, large: 1.5 },
    hurdle:     { small: 0.7, medium: 1.0, large: 1.5 },
    mannequin:  { small: 0.7, medium: 1.0, large: 1.4 },
    pole:       { small: 0.7, medium: 1.0, large: 1.5 },
    minigoal:   { small: 0.6, medium: 1.0, large: 1.5 },
    ring:       { small: 0.7, medium: 1.0, large: 1.5 },
    rebounder:  { small: 0.7, medium: 1.0, large: 1.5 },
};
const LINE_WIDTHS = { small: 2, medium: 3, large: 5 };

// Snap alignment
const SNAP_THRESHOLD = 8;
let snapLayer = null;

// Onion skinning + movement paths
let ghostLayer = null;
let pathLayer = null;
let onionSkinEnabled = false;
let movementPathsEnabled = false;

// Frame system
let frames = []; // array of frame snapshots: { objects: [...], drawings: [...] }
let currentFrameIdx = 0;
let isPlaying = false;
let _wasPlaying = false;   // true right after stop/pause — prevents goToFrame from capturing corrupted state
let playTimer = null;
let playTweenTimer = null; // timeout for tween completion callback
let _activeTweens = [];    // currently running Konva tweens (so stop can cancel them)
let frameDuration = 1500; // ms

// Undo/redo
let undoStack = [];
let redoStack = [];

// Object counter for IDs
let objCounter = 0;

// Auth / club scoping
let _clubId = null;
let _userId = null;
let _currentAnimationId = null; // Track loaded animation for updates

// Video reference
let _animVideoUrl = '';

// ═══════════════════════════════════════════════════════════
//  PITCH DRAWING — FIFA proportional (matches drill-builder.js)
//  Landscape orientation (1080x578), same as pFull/pHalf/pThird/pSmall
//  Proportions: penalty box W = 0.138*fullW, H = 0.44*fullH
//               goal box   W = 0.053*fullW, H = 0.22*fullH
//               center circle radius = 0.175*fullH
//               goal H = 0.21*fullH, corner arc = 11px
// ═══════════════════════════════════════════════════════════

// Konva helpers to match drill-builder naming
function kLine(points) {
    return new Konva.Line({ points, stroke: 'rgba(255,255,255,0.9)', strokeWidth: 2, listening: false });
}
function kDot(x, y, r = 4) {
    return new Konva.Circle({ x, y, radius: r, fill: 'white', listening: false });
}
function kCornerArc(x, y, startAng, endAng) {
    return new Konva.Arc({
        x, y, innerRadius: 0, outerRadius: 11,
        angle: (endAng - startAng) * (180 / Math.PI),
        rotation: startAng * (180 / Math.PI),
        stroke: 'rgba(255,255,255,0.9)', strokeWidth: 2,
        fill: 'transparent', listening: false
    });
}
function kRect(x, y, w, h) {
    return new Konva.Rect({
        x, y, width: w, height: h,
        stroke: 'rgba(255,255,255,0.9)', strokeWidth: 2,
        fill: 'transparent', listening: false
    });
}
function kCorners(fx, fy, fw, fh) {
    return [
        kCornerArc(fx, fy, 0, Math.PI / 2),
        kCornerArc(fx + fw, fy, Math.PI / 2, Math.PI),
        kCornerArc(fx + fw, fy + fh, Math.PI, 1.5 * Math.PI),
        kCornerArc(fx, fy + fh, 1.5 * Math.PI, 2 * Math.PI)
    ];
}

function penaltyArc(cx, cy, radius, clipX, clipW, clipY, clipH) {
    // Draws a penalty arc clipped to a region — uses Konva.Shape with canvas clip
    return new Konva.Shape({
        sceneFunc: (context, shape) => {
            context.save();
            context.beginPath();
            context.rect(clipX, clipY, clipW, clipH);
            context.clip();
            context.beginPath();
            context.arc(cx, cy, radius, 0, Math.PI * 2);
            context.strokeShape(shape);
            context.restore();
        },
        stroke: 'rgba(255,255,255,0.9)', strokeWidth: 2,
        listening: false
    });
}

function drawPitch(type = 'full') {
    pitchLayer.destroyChildren();

    const W = CANVAS_W;
    const H = CANVAS_H;

    // Dark green base
    if (type === 'blank') {
        pitchLayer.add(new Konva.Rect({ x: 0, y: 0, width: W, height: H, fill: '#1a4a2a', listening: false }));
        pitchLayer.batchDraw();
        return;
    }

    // Green background (full canvas)
    pitchLayer.add(new Konva.Rect({ x: 0, y: 0, width: W, height: H, fill: '#1e5c30', listening: false }));

    // Calculate effective canvas width for each pitch type
    // (matches drill-builder updateCanvasDimensions)
    let effW = W;
    if (type === 'half') effW = Math.round(W * 0.5);
    else if (type === 'third') effW = Math.round(W * 0.333);
    else if (type === 'threequarter') effW = Math.round(W * 0.75);
    else if (type === 'smallsided') { effW = Math.round(W * 0.72); }

    // Grass stripes (vertical, within effective area)
    const stripeCount = 10;
    const effOffset = (W - effW) / 2;
    const sw = effW / stripeCount;
    for (let i = 0; i * sw < effW; i += 2) {
        pitchLayer.add(new Konva.Rect({
            x: effOffset + i * sw, y: 0, width: sw, height: H,
            fill: '#1a5228', listening: false
        }));
    }

    // Field dimensions — centered for narrower pitch types
    const fx = (W - effW) / 2 + PAD;
    const fy = PAD;
    const fw = effW - 2 * PAD;
    const fh = H - 2 * PAD;
    const mx = fx + fw / 2;
    const my = fy + fh / 2;

    if (type === 'full') {
        // ── Full Pitch (Landscape) — matches drill-builder pFull exactly ──
        pitchLayer.add(kRect(fx, fy, fw, fh));
        pitchLayer.add(kLine([mx, fy, mx, fy + fh]));
        pitchLayer.add(kDot(mx, my, 4));
        pitchLayer.add(new Konva.Circle({
            x: mx, y: my, radius: fh * 0.175,
            stroke: 'rgba(255,255,255,0.9)', strokeWidth: 2,
            fill: 'transparent', listening: false
        }));

        const pbW = fw * 0.138, pbH = fh * 0.44;
        const gbW = fw * 0.053, gbH = fh * 0.22;

        // Left penalty area + goal box + goal
        pitchLayer.add(kRect(fx, my - pbH / 2, pbW, pbH));
        pitchLayer.add(kRect(fx, my - gbH / 2, gbW, gbH));
        pitchLayer.add(kRect(fx - 10, my - fh * 0.105, 10, fh * 0.21));
        const lS = fx + pbW * 0.72;
        pitchLayer.add(kDot(lS, my, 3));
        pitchLayer.add(penaltyArc(lS, my, fh * 0.175, fx + pbW, fw, fy, fh));

        // Right penalty area + goal box + goal
        pitchLayer.add(kRect(fx + fw - pbW, my - pbH / 2, pbW, pbH));
        pitchLayer.add(kRect(fx + fw - gbW, my - gbH / 2, gbW, gbH));
        pitchLayer.add(kRect(fx + fw, my - fh * 0.105, 10, fh * 0.21));
        const rS = fx + fw - pbW * 0.72;
        pitchLayer.add(kDot(rS, my, 3));
        pitchLayer.add(penaltyArc(rS, my, fh * 0.175, fx, fw - pbW, fy, fh));

        kCorners(fx, fy, fw, fh).forEach(c => pitchLayer.add(c));

    } else if (type === 'half') {
        // ── Half Pitch — narrower canvas (50% width), goal on left ──
        pitchLayer.add(kRect(fx, fy, fw, fh));

        // Center line on RIGHT edge + semicircle
        pitchLayer.add(kLine([fx + fw, fy, fx + fw, fy + fh]));
        pitchLayer.add(kDot(fx + fw, my, 4));
        pitchLayer.add(penaltyArc(fx + fw, my, fh * 0.175, fx, fw, fy, fh));

        // Proportions scaled for half: fullW = fw*2
        const pbW = fw * 0.276, pbH = fh * 0.44;
        const gbW = fw * 0.106, gbH = fh * 0.22;

        pitchLayer.add(kRect(fx, my - pbH / 2, pbW, pbH));
        pitchLayer.add(kRect(fx, my - gbH / 2, gbW, gbH));
        pitchLayer.add(kRect(fx - 10, my - fh * 0.105, 10, fh * 0.21));
        const lS = fx + pbW * 0.72;
        pitchLayer.add(kDot(lS, my, 3));
        pitchLayer.add(penaltyArc(lS, my, fh * 0.175, fx + pbW, fw, fy, fh));

        pitchLayer.add(kCornerArc(fx, fy, 0, Math.PI / 2));
        pitchLayer.add(kCornerArc(fx, fy + fh, 1.5 * Math.PI, 2 * Math.PI));

    } else if (type === 'third') {
        // ── Third of Pitch — narrower canvas (33% width), goal on left ──
        pitchLayer.add(kRect(fx, fy, fw, fh));

        const pbW = fw * 0.414, pbH = fh * 0.44;
        const gbW = fw * 0.159, gbH = fh * 0.22;

        pitchLayer.add(kRect(fx, my - pbH / 2, pbW, pbH));
        pitchLayer.add(kRect(fx, my - gbH / 2, gbW, gbH));
        pitchLayer.add(kRect(fx - 10, my - fh * 0.105, 10, fh * 0.21));
        const lS = fx + pbW * 0.72;
        pitchLayer.add(kDot(lS, my, 3));
        pitchLayer.add(penaltyArc(lS, my, fh * 0.175, fx + pbW, fw, fy, fh));

        pitchLayer.add(kCornerArc(fx, fy, 0, Math.PI / 2));
        pitchLayer.add(kCornerArc(fx, fy + fh, 1.5 * Math.PI, 2 * Math.PI));

    } else if (type === 'threequarter') {
        // ── Three-Quarter Pitch — one full half + second half ending before far box ──
        pitchLayer.add(kRect(fx, fy, fw, fh));
        // Center line at 2/3 of fw (since fullW = fw * 4/3, center = fullW/2 = fw * 2/3)
        const cx = fx + fw * (2 / 3);
        pitchLayer.add(kLine([cx, fy, cx, fy + fh]));
        pitchLayer.add(kDot(cx, my, 4));
        // Center circle
        pitchLayer.add(new Konva.Circle({ x: cx, y: my, radius: fh * 0.175, stroke: 'rgba(255,255,255,0.9)', strokeWidth: 2, listening: false }));

        // Left side: full penalty area (scaled for 3/4 field)
        const pbW = fw * 0.184, pbH = fh * 0.44;
        const gbW = fw * 0.071, gbH = fh * 0.22;

        pitchLayer.add(kRect(fx, my - pbH / 2, pbW, pbH));
        pitchLayer.add(kRect(fx, my - gbH / 2, gbW, gbH));
        pitchLayer.add(kRect(fx - 10, my - fh * 0.105, 10, fh * 0.21));
        const lS = fx + pbW * 0.72;
        pitchLayer.add(kDot(lS, my, 3));
        pitchLayer.add(penaltyArc(lS, my, fh * 0.175, fx + pbW, fw, fy, fh));

        // Only left-side corner arcs
        pitchLayer.add(kCornerArc(fx, fy, 0, Math.PI / 2));
        pitchLayer.add(kCornerArc(fx, fy + fh, 1.5 * Math.PI, 2 * Math.PI));

    } else if (type === 'smallsided') {
        // ── Small-sided (Landscape) — matches drill-builder pSmall ──
        pitchLayer.add(kRect(fx, fy, fw, fh));
        pitchLayer.add(kLine([mx, fy, mx, fy + fh]));
        pitchLayer.add(kDot(mx, my, 4));

        const gbW = fw * 0.10, gbH = fh * 0.38;
        const gW = 16, gH = fh * 0.22;

        // Left goal area + goal
        pitchLayer.add(kRect(fx, my - gbH / 2, gbW, gbH));
        pitchLayer.add(kRect(fx - gW, my - gH / 2, gW, gH));
        // Right goal area + goal
        pitchLayer.add(kRect(fx + fw - gbW, my - gbH / 2, gbW, gbH));
        pitchLayer.add(kRect(fx + fw, my - gH / 2, gW, gH));

        kCorners(fx, fy, fw, fh).forEach(c => pitchLayer.add(c));

    } else if (type === 'outline') {
        pitchLayer.add(kRect(fx, fy, fw, fh));
        kCorners(fx, fy, fw, fh).forEach(c => pitchLayer.add(c));

    } else if (type === 'halves') {
        pitchLayer.add(kRect(fx, fy, fw, fh));
        pitchLayer.add(kLine([mx, fy, mx, fy + fh]));
        pitchLayer.add(kDot(mx, my, 4));
        kCorners(fx, fy, fw, fh).forEach(c => pitchLayer.add(c));

    } else if (type === 'thirds') {
        pitchLayer.add(kRect(fx, fy, fw, fh));
        pitchLayer.add(kLine([fx + fw / 3, fy, fx + fw / 3, fy + fh]));
        pitchLayer.add(kLine([fx + fw * 2 / 3, fy, fx + fw * 2 / 3, fy + fh]));
        kCorners(fx, fy, fw, fh).forEach(c => pitchLayer.add(c));
    }

    pitchLayer.batchDraw();
}

// ═══════════════════════════════════════════════════════════
//  OBJECT CREATION — Matches drill-builder.js renderTok()
// ═══════════════════════════════════════════════════════════
let playerCount = 1;
let numberCount = 1;

function isLight(hex) {
    const c = hex.replace('#', '');
    return (parseInt(c.substr(0, 2), 16) * 299 + parseInt(c.substr(2, 2), 16) * 587 + parseInt(c.substr(4, 2), 16) * 114) / 1000 > 155;
}

function createPlayerToken(color, x, y, label, isGK, scale) {
    const sc = scale || (SIZE_PRESETS.player[currentSize] || 1);
    const radius = 16;
    const group = new Konva.Group({
        x, y, draggable: true,
        id: `obj_${++objCounter}`,
        name: 'animObject',
        scaleX: sc, scaleY: sc
    });
    group.setAttr('objType', 'player');
    group.setAttr('color', color);

    // Shadow
    group.add(new Konva.Circle({
        x: 2, y: 2, radius,
        fill: 'rgba(0,0,0,0.35)', listening: false
    }));
    // Main circle
    const lt = isLight(color);
    group.add(new Konva.Circle({
        x: 0, y: 0, radius,
        fill: color, stroke: lt ? '#333' : 'white', strokeWidth: 2
    }));
    // Label
    const displayLabel = label || (isGK ? 'GK' : String(playerCount++));
    group.setAttr('label', displayLabel);
    group.add(new Konva.Text({
        text: displayLabel,
        x: -radius, y: isGK ? -6 : -7, width: radius * 2,
        align: 'center', fontSize: isGK ? 9 : 12, fontFamily: 'Inter,sans-serif',
        fontStyle: 'bold', fill: lt ? '#222' : 'white', listening: false
    }));

    group.on('dragend', () => { saveSnapshot(); });
    group.on('click tap', () => selectObject(group));
    return group;
}

function createEquipment(type, x, y, scale) {
    const sc = scale || (SIZE_PRESETS[type]?.[currentSize] || 1);
    const group = new Konva.Group({
        x, y, draggable: true,
        id: `obj_${++objCounter}`,
        name: 'animObject',
        scaleX: sc, scaleY: sc
    });
    group.setAttr('objType', type);

    const configs = {
        cone: () => {
            // Triangle cone with stripe — matches drill-builder
            group.add(new Konva.Line({
                points: [0, -13, 10, 9, -10, 9], closed: true,
                fill: '#ff6d00', stroke: 'rgba(0,0,0,0.25)', strokeWidth: 1
            }));
            group.add(new Konva.Line({
                points: [-6, 1, 6, 1], stroke: 'rgba(255,255,255,0.55)', strokeWidth: 2, listening: false
            }));
        },
        ball: () => {
            // Football — white circle with black pentagons (matches drill builder)
            group.add(new Konva.Circle({ x: 0, y: 0, radius: 11, fill: '#fff', stroke: '#333', strokeWidth: 1.5 }));
            // Center pentagon
            group.add(new Konva.RegularPolygon({ x: 0, y: 0, sides: 5, radius: 4, fill: '#333', rotation: -18, listening: false }));
            // 5 outer pentagons
            for (let i = 0; i < 5; i++) {
                const ang = i * (Math.PI * 2 / 5) - Math.PI / 2;
                const ox = Math.cos(ang) * 8, oy = Math.sin(ang) * 8;
                const rotDeg = (ang + Math.PI) * (180 / Math.PI) - 18;
                group.add(new Konva.RegularPolygon({ x: ox, y: oy, sides: 5, radius: 2.5, fill: '#333', rotation: rotDeg, listening: false }));
            }
        },
        goalpost: () => {
            // Full goalpost — top-down view with net
            const gw = 90, gd = 34, pr = 4;
            group.add(new Konva.Rect({ x: -gw / 2, y: -pr, width: gw, height: gd, fill: 'rgba(255,255,255,0.07)' }));
            // Net lines
            for (let i = 1; i < 8; i++) {
                const nx = -gw / 2 + i * (gw / 8);
                group.add(new Konva.Line({ points: [nx, 0, nx, gd], stroke: 'rgba(255,255,255,0.22)', strokeWidth: 0.8, listening: false }));
            }
            for (let i = 1; i <= 4; i++) {
                group.add(new Konva.Line({ points: [-gw / 2, i * (gd / 4), gw / 2, i * (gd / 4)], stroke: 'rgba(255,255,255,0.22)', strokeWidth: 0.8, listening: false }));
            }
            // Side + back posts
            group.add(new Konva.Line({ points: [-gw / 2, gd, gw / 2, gd], stroke: 'rgba(200,200,200,0.6)', strokeWidth: 2, listening: false }));
            group.add(new Konva.Line({ points: [-gw / 2, 0, -gw / 2, gd], stroke: 'rgba(200,200,200,0.6)', strokeWidth: 2, listening: false }));
            group.add(new Konva.Line({ points: [gw / 2, 0, gw / 2, gd], stroke: 'rgba(200,200,200,0.6)', strokeWidth: 2, listening: false }));
            // Front crossbar
            group.add(new Konva.Rect({ x: -gw / 2 - pr, y: -pr, width: gw + pr * 2, height: pr * 2, stroke: '#fff', strokeWidth: 3, fill: 'transparent' }));
            // Post dots
            group.add(new Konva.Circle({ x: -gw / 2, y: 0, radius: pr, fill: '#fff', listening: false }));
            group.add(new Konva.Circle({ x: gw / 2, y: 0, radius: pr, fill: '#fff', listening: false }));
        },
        flag: () => {
            // Flag pole with pennant
            group.add(new Konva.Line({ points: [0, 16, 0, -14], stroke: '#e0e0e0', strokeWidth: 2, listening: false }));
            group.add(new Konva.Line({
                points: [0, -14, 14, -7, 0, 0], closed: true,
                fill: '#fdd835', listening: false
            }));
        },
        number: () => {
            // Numbered marker
            const lbl = String(numberCount++);
            group.setAttr('label', lbl);
            group.add(new Konva.Text({
                text: lbl, x: -12, y: -10, width: 24,
                align: 'center', fontSize: 18, fontFamily: 'Inter,sans-serif',
                fontStyle: 'bold', fill: '#ffffff',
                stroke: 'rgba(0,0,0,0.6)', strokeWidth: 3, listening: false
            }));
            // White fill on top
            group.add(new Konva.Text({
                text: lbl, x: -12, y: -10, width: 24,
                align: 'center', fontSize: 18, fontFamily: 'Inter,sans-serif',
                fontStyle: 'bold', fill: '#ffffff', listening: false
            }));
        },
        ladder: () => {
            // Agility ladder — matches drill-builder
            const w = 24, h = 60, rungs = 6;
            group.add(new Konva.Rect({ x: -w / 2, y: -h / 2, width: w, height: h, fill: 'rgba(255,193,7,0.15)', stroke: '#b0b0b0', strokeWidth: 2 }));
            const spacing = h / (rungs + 1);
            for (let i = 1; i <= rungs; i++) {
                const ry = -h / 2 + i * spacing;
                group.add(new Konva.Line({ points: [-w / 2, ry, w / 2, ry], stroke: '#b0b0b0', strokeWidth: 2, listening: false }));
            }
        },
        hurdle: () => {
            // Hurdle — two posts + crossbar
            const w = 30, h = 22;
            group.add(new Konva.Line({ points: [-w / 2, h, -w / 2, 0], stroke: '#ff9800', strokeWidth: 3, listening: false }));
            group.add(new Konva.Line({ points: [w / 2, h, w / 2, 0], stroke: '#ff9800', strokeWidth: 3, listening: false }));
            group.add(new Konva.Line({ points: [-w / 2, 0, w / 2, 0], stroke: '#ff9800', strokeWidth: 3, listening: false }));
            // Base
            group.add(new Konva.Line({ points: [-w / 2 - 5, h, -w / 2 + 5, h], stroke: '#ff9800', strokeWidth: 2, listening: false }));
            group.add(new Konva.Line({ points: [w / 2 - 5, h, w / 2 + 5, h], stroke: '#ff9800', strokeWidth: 2, listening: false }));
        },
        mannequin: () => {
            // Mannequin / dummy — head + body + base
            group.add(new Konva.Circle({ x: 0, y: -18, radius: 6, fill: '#546e7a', stroke: 'rgba(0,0,0,0.3)', strokeWidth: 1 }));
            group.add(new Konva.Line({
                points: [-8, -12, 8, -12, 10, 18, -10, 18], closed: true,
                fill: '#546e7a', stroke: 'rgba(0,0,0,0.3)', strokeWidth: 1
            }));
            group.add(new Konva.Arc({
                x: 0, y: 20, innerRadius: 0, outerRadius: 10,
                angle: 180, rotation: 0, fill: '#546e7a', listening: false
            }));
        },
        pole: () => {
            // Slalom pole — vertical stick with top dot
            group.add(new Konva.Line({ points: [0, -22, 0, 22], stroke: '#ffeb3b', strokeWidth: 3, lineCap: 'round', listening: false }));
            group.add(new Konva.Circle({ x: 0, y: -22, radius: 3, fill: '#ffeb3b', listening: false }));
        },
        minigoal: () => {
            // Small portable training goal
            const gw = 40, gd = 20;
            // Back net (dashed)
            group.add(new Konva.Line({ points: [-gw / 2, -gd / 2, -gw / 2, gd / 2], stroke: '#e0e0e0', strokeWidth: 3, dash: [3, 3], listening: false }));
            group.add(new Konva.Line({ points: [gw / 2, -gd / 2, gw / 2, gd / 2], stroke: '#e0e0e0', strokeWidth: 3, dash: [3, 3], listening: false }));
            group.add(new Konva.Line({ points: [-gw / 2, gd / 2, gw / 2, gd / 2], stroke: '#e0e0e0', strokeWidth: 3, dash: [3, 3], listening: false }));
            // Front posts (solid)
            group.add(new Konva.Line({ points: [-gw / 2, -gd / 2, gw / 2, -gd / 2], stroke: '#e0e0e0', strokeWidth: 4, listening: false }));
            // Post dots
            group.add(new Konva.Circle({ x: -gw / 2, y: -gd / 2, radius: 3, fill: '#e0e0e0', listening: false }));
            group.add(new Konva.Circle({ x: gw / 2, y: -gd / 2, radius: 3, fill: '#e0e0e0', listening: false }));
        },
        ring: () => {
            // Agility ring
            group.add(new Konva.Circle({ x: 0, y: 0, radius: 14, stroke: '#ff9800', strokeWidth: 3, fill: 'transparent' }));
            group.add(new Konva.Circle({ x: 0, y: 0, radius: 11, stroke: 'rgba(255,152,0,0.3)', strokeWidth: 1, fill: 'transparent', listening: false }));
        },
        rebounder: () => {
            // Rebounder / passing wall
            const bw = 36, bd = 8;
            group.add(new Konva.Rect({ x: -bw / 2, y: -bd / 2, width: bw, height: bd, fill: '#78909c', stroke: '#37474f', strokeWidth: 2 }));
            // Net lines
            for (let i = -bw / 2 + 6; i < bw / 2; i += 6) {
                group.add(new Konva.Line({ points: [i, -bd / 2, i, bd / 2], stroke: 'rgba(255,255,255,0.4)', strokeWidth: 1, listening: false }));
            }
        }
    };

    if (configs[type]) configs[type]();

    // Add invisible hit area so all equipment is clickable/draggable (min 30x30)
    const box = group.getClientRect({ relativeTo: group });
    const minHit = 30;
    const hw = Math.max(box.width, minHit), hh = Math.max(box.height, minHit);
    const hx = box.x + box.width / 2 - hw / 2, hy = box.y + box.height / 2 - hh / 2;
    group.add(new Konva.Rect({
        x: hx - 4, y: hy - 4,
        width: hw + 8, height: hh + 8,
        fill: 'transparent', stroke: null
    }));

    group.on('dragend', () => { saveSnapshot(); });
    group.on('click tap', () => selectObject(group));
    return group;
}

// ═══════════════════════════════════════════════════════════
//  TEXTBOX
// ═══════════════════════════════════════════════════════════
function createAnimTextbox(bx, by, bw, bh, color, text, fontSize) {
    const fs = fontSize || 14;
    const group = new Konva.Group({
        x: bx, y: by, draggable: true,
        id: `obj_${++objCounter}`, name: 'animObject'
    });
    group.setAttr('objType', 'textbox');
    group.setAttr('boxWidth', bw);
    group.setAttr('boxHeight', bh);
    group.setAttr('textContent', text || '');
    group.setAttr('fontSize', fs);
    group.setAttr('color', color);

    group.add(new Konva.Rect({
        x: 0, y: 0, width: bw, height: bh,
        stroke: color, strokeWidth: 1, dash: [5, 3], fill: 'transparent'
    }));
    group.add(new Konva.Text({
        x: 4, y: 4, width: bw - 8,
        text: text || '', fontSize: fs, fontFamily: 'Inter, sans-serif',
        fill: color, wrap: 'word', listening: false
    }));

    group.on('dragend', () => { saveSnapshot(); });
    group.on('click tap', () => selectObject(group));
    group.on('dblclick dbltap', () => editAnimTextbox(group));

    objectLayer.add(group);
    objectLayer.batchDraw();

    if (!text) {
        // Open editor immediately for new textbox
        setTimeout(() => editAnimTextbox(group), 50);
    }
    return group;
}

function editAnimTextbox(group) {
    const bw = group.getAttr('boxWidth'), bh = group.getAttr('boxHeight');
    const color = group.getAttr('color') || '#fff';
    const fs = group.getAttr('fontSize') || 14;
    const container = stage.container();
    const stageBox = container.getBoundingClientRect();
    const sc = stage.scaleX() || 1;
    const gx = group.x() * sc, gy = group.y() * sc;

    const ta = document.createElement('textarea');
    ta.value = group.getAttr('textContent') || '';
    ta.style.cssText = `position:absolute;left:${gx}px;top:${gy}px;width:${bw * sc}px;height:${bh * sc}px;font-size:${fs * sc}px;font-family:Inter,sans-serif;color:${color};background:rgba(0,0,0,0.5);border:1px dashed rgba(255,255,255,0.4);padding:4px;resize:none;outline:none;z-index:999;box-sizing:border-box;`;
    container.style.position = 'relative';
    container.appendChild(ta);
    ta.focus();

    const commit = () => {
        const txt = ta.value;
        group.setAttr('textContent', txt);
        // Update the Konva.Text node
        const textNode = group.findOne('Text');
        if (textNode) textNode.text(txt);
        ta.remove();
        objectLayer.batchDraw();
        saveSnapshot();
    };
    ta.addEventListener('blur', commit);
    ta.addEventListener('keydown', e => { if (e.key === 'Escape') { ta.removeEventListener('blur', commit); ta.remove(); } });
}

// ═══════════════════════════════════════════════════════════
//  SELECTION
// ═══════════════════════════════════════════════════════════
let selectedObj = null;
let transformer = null;

function selectObject(obj) {
    deselectAll();
    selectedObj = obj;
    transformer = new Konva.Transformer({
        nodes: [obj],
        enabledAnchors: [],
        rotateEnabled: true,
        borderStroke: '#fff',
        borderStrokeWidth: 1.5,
        borderDash: [4, 4]
    });
    objectLayer.add(transformer);
    objectLayer.batchDraw();
}

function deselectAll() {
    if (transformer) {
        transformer.destroy();
        transformer = null;
    }
    selectedObj = null;
    // Also deselect any selected drawing
    if (selectedDrawing) {
        selectedDrawing.stroke(selectedDrawing.getAttr('_origColor') || drawColor);
        selectedDrawing = null;
        drawLayer.batchDraw();
    }
    objectLayer.batchDraw();
}

// ═══════════════════════════════════════════════════════════
//  DRAWING TOOLS — full set matching drill-builder
//  pencil, line, arrow, dashed, dashed-line, curved,
//  rect, circle, tri, polygon (+fill variants)
// ═══════════════════════════════════════════════════════════
let lineWidth = 3;
let fillMode = false; // fill toggle state for shapes
// Polygon drawing state
let polygonPoints = [];
let polygonPreviewLine = null;
let polygonSnapRing = null; // highlight ring on first point when cursor is near
const POLY_SNAP_DIST = 20; // snap-to-close distance

function isDrawTool(t) {
    return ['pencil', 'line', 'arrow', 'biarrow', 'dashed', 'dashed-line', 'curved',
            'rect', 'rect-fill', 'circle', 'circle-fill', 'tri', 'tri-fill',
            'polygon', 'polygon-fill', 'textbox'].includes(t);
}

function makeDrawingClickable(shape) {
    shape.setAttr('name', 'animDrawing');
    shape.setAttr('id', `draw_${++objCounter}`);
    shape.listening(true);
    shape.draggable(true);
    shape.on('click tap', function (e) {
        if (!activeTool) {
            e.cancelBubble = true; // prevent stage deselect handler
            selectDrawing(this);
        }
    });
    shape.on('dragstart', function () {
        if (activeTool) { this.stopDrag(); return; }
        selectDrawing(this);
    });
    shape.on('dragend', function () {
        saveSnapshot();
    });
}

function getEffectiveTool() {
    // If fill mode is on and tool is a shape, return the fill variant
    const base = activeTool?.replace('-fill', '');
    if (fillMode && ['rect', 'circle', 'tri', 'polygon'].includes(base)) {
        return base + '-fill';
    }
    return activeTool;
}

function getFillForTool(tool) {
    if (!tool) return 'transparent';
    return tool.endsWith('-fill') ? toRGBA(drawColor, 0.22) : 'transparent';
}

function toRGBA(hex, alpha) {
    const c = hex.replace('#', '');
    const r = parseInt(c.substr(0, 2), 16);
    const g = parseInt(c.substr(2, 2), 16);
    const b = parseInt(c.substr(4, 2), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function finalizePolygon() {
    if (polygonPoints.length < 3) {
        // Not enough points — clean up
        if (polygonPreviewLine) { polygonPreviewLine.destroy(); polygonPreviewLine = null; }
        if (polygonSnapRing) { polygonSnapRing.destroy(); polygonSnapRing = null; }
        drawLayer.find('.polygonVertex').forEach(v => v.destroy());
        polygonPoints = [];
        drawLayer.batchDraw();
        return;
    }
    const tool = getEffectiveTool();
    const flatPts = [];
    polygonPoints.forEach(p => { flatPts.push(p.x, p.y); });
    const poly = new Konva.Line({
        points: flatPts,
        stroke: drawColor, strokeWidth: lineWidth,
        fill: getFillForTool(tool),
        closed: true, lineCap: 'round', lineJoin: 'round',
        listening: false
    });
    makeDrawingClickable(poly);
    drawLayer.add(poly);
    // Clean up preview + snap ring
    if (polygonPreviewLine) { polygonPreviewLine.destroy(); polygonPreviewLine = null; }
    if (polygonSnapRing) { polygonSnapRing.destroy(); polygonSnapRing = null; }
    // Remove vertex dots
    drawLayer.find('.polygonVertex').forEach(v => v.destroy());
    polygonPoints = [];
    drawLayer.batchDraw();
    saveSnapshot();
}

function setupDrawingHandlers() {
    stage.on('mousedown touchstart', (e) => {
        if (!activeTool) return;
        if (!isDrawTool(activeTool)) return;
        if (e.target !== stage && e.target.parent !== pitchLayer && !e.target.getAttr?.('_isPitchBg')) return;

        const pos = stage.getPointerPosition();
        const tool = getEffectiveTool();
        const baseTool = tool.replace('-fill', '');

        // Polygon: click to add points, click near first point to close
        if (baseTool === 'polygon') {
            if (polygonPoints.length >= 3) {
                const first = polygonPoints[0];
                if (Math.hypot(pos.x - first.x, pos.y - first.y) < POLY_SNAP_DIST) {
                    finalizePolygon();
                    return;
                }
            }
            polygonPoints.push({ x: pos.x, y: pos.y });
            // Draw vertex dot — first point is red/larger as the close target
            const isFirst = polygonPoints.length === 1;
            const dot = new Konva.Circle({
                x: pos.x, y: pos.y, radius: isFirst ? 5 : 3,
                fill: isFirst ? '#ff4444' : drawColor,
                stroke: isFirst ? 'rgba(255,68,68,0.4)' : null,
                strokeWidth: isFirst ? 6 : 0,
                name: 'polygonVertex', listening: false
            });
            drawLayer.add(dot);
            // Update preview line
            if (polygonPreviewLine) polygonPreviewLine.destroy();
            const flatPts = [];
            polygonPoints.forEach(p => { flatPts.push(p.x, p.y); });
            polygonPreviewLine = new Konva.Line({
                points: flatPts, stroke: drawColor, strokeWidth: lineWidth,
                dash: [6, 4], lineCap: 'round', lineJoin: 'round',
                listening: false
            });
            drawLayer.add(polygonPreviewLine);
            drawLayer.batchDraw();
            return;
        }

        drawStartPos = pos;

        if (activeTool === 'pencil') {
            tempLine = new Konva.Line({
                points: [pos.x, pos.y],
                stroke: drawColor, strokeWidth: lineWidth,
                lineCap: 'round', lineJoin: 'round',
                listening: false
            });
        } else if (activeTool === 'curved') {
            tempLine = new Konva.Line({
                points: [pos.x, pos.y],
                stroke: drawColor, strokeWidth: lineWidth,
                lineCap: 'round', lineJoin: 'round',
                tension: 0.5, listening: false
            });
        } else if (activeTool === 'line') {
            tempLine = new Konva.Line({
                points: [pos.x, pos.y, pos.x, pos.y],
                stroke: drawColor, strokeWidth: lineWidth,
                lineCap: 'round', listening: false
            });
        } else if (activeTool === 'arrow') {
            tempLine = new Konva.Arrow({
                points: [pos.x, pos.y, pos.x, pos.y],
                stroke: drawColor, strokeWidth: lineWidth,
                fill: drawColor, pointerLength: Math.max(12, lineWidth * 3),
                pointerWidth: Math.max(10, lineWidth * 2.5),
                lineCap: 'round', listening: false
            });
        } else if (activeTool === 'biarrow') {
            tempLine = new Konva.Arrow({
                points: [pos.x, pos.y, pos.x, pos.y],
                stroke: drawColor, strokeWidth: lineWidth,
                fill: drawColor, pointerLength: Math.max(12, lineWidth * 3),
                pointerWidth: Math.max(10, lineWidth * 2.5),
                pointerAtBeginning: true,
                lineCap: 'round', listening: false
            });
        } else if (activeTool === 'dashed') {
            tempLine = new Konva.Arrow({
                points: [pos.x, pos.y, pos.x, pos.y],
                stroke: drawColor, strokeWidth: lineWidth,
                fill: drawColor, pointerLength: Math.max(12, lineWidth * 3),
                pointerWidth: Math.max(10, lineWidth * 2.5),
                dash: [10, 6], lineCap: 'round', listening: false
            });
        } else if (activeTool === 'dashed-line') {
            tempLine = new Konva.Line({
                points: [pos.x, pos.y, pos.x, pos.y],
                stroke: drawColor, strokeWidth: lineWidth,
                dash: [10, 6], lineCap: 'round', listening: false
            });
        } else if (baseTool === 'rect') {
            tempLine = new Konva.Rect({
                x: pos.x, y: pos.y, width: 0, height: 0,
                stroke: drawColor, strokeWidth: lineWidth,
                fill: getFillForTool(tool), listening: false
            });
        } else if (baseTool === 'circle') {
            tempLine = new Konva.Circle({
                x: pos.x, y: pos.y, radius: 0,
                stroke: drawColor, strokeWidth: lineWidth,
                fill: getFillForTool(tool), listening: false
            });
        } else if (baseTool === 'tri') {
            tempLine = new Konva.RegularPolygon({
                x: pos.x, y: pos.y, sides: 3, radius: 0,
                stroke: drawColor, strokeWidth: lineWidth,
                fill: getFillForTool(tool), listening: false
            });
        } else if (activeTool === 'textbox') {
            tempLine = new Konva.Rect({
                x: pos.x, y: pos.y, width: 0, height: 0,
                stroke: drawColor, strokeWidth: 1,
                dash: [5, 3], fill: 'transparent', listening: false
            });
        }

        if (tempLine) drawLayer.add(tempLine);
    });

    stage.on('mousemove touchmove', () => {
        // Polygon preview: update a dashed line from last point to cursor, snap to first point
        if ((activeTool === 'polygon' || activeTool === 'polygon-fill') && polygonPoints.length > 0) {
            const pos = stage.getPointerPosition();
            let cx = pos.x, cy = pos.y;
            const first = polygonPoints[0];
            const nearFirst = polygonPoints.length >= 3 && Math.hypot(cx - first.x, cy - first.y) < POLY_SNAP_DIST;
            // Snap cursor to first point when close
            if (nearFirst) { cx = first.x; cy = first.y; }
            // Show/hide snap ring on first point
            if (nearFirst && !polygonSnapRing) {
                polygonSnapRing = new Konva.Circle({
                    x: first.x, y: first.y, radius: POLY_SNAP_DIST,
                    stroke: '#ff4444', strokeWidth: 1.5, dash: [4, 3],
                    fill: 'rgba(255,68,68,0.08)', name: 'polygonSnapRing', listening: false
                });
                drawLayer.add(polygonSnapRing);
            } else if (!nearFirst && polygonSnapRing) {
                polygonSnapRing.destroy(); polygonSnapRing = null;
            }
            if (polygonPreviewLine) {
                const flatPts = [];
                polygonPoints.forEach(p => { flatPts.push(p.x, p.y); });
                flatPts.push(cx, cy);
                polygonPreviewLine.points(flatPts);
                drawLayer.batchDraw();
            }
            return;
        }

        if (!tempLine || !drawStartPos) return;
        const pos = stage.getPointerPosition();
        const base = activeTool?.replace('-fill', '');

        if (activeTool === 'pencil' || activeTool === 'curved') {
            const pts = tempLine.points();
            pts.push(pos.x, pos.y);
            tempLine.points(pts);
        } else if (activeTool === 'line' || activeTool === 'arrow' || activeTool === 'biarrow' || activeTool === 'dashed' || activeTool === 'dashed-line') {
            tempLine.points([drawStartPos.x, drawStartPos.y, pos.x, pos.y]);
        } else if (base === 'rect' || activeTool === 'textbox') {
            const dx = pos.x - drawStartPos.x;
            const dy = pos.y - drawStartPos.y;
            tempLine.x(dx < 0 ? pos.x : drawStartPos.x);
            tempLine.y(dy < 0 ? pos.y : drawStartPos.y);
            tempLine.width(Math.abs(dx));
            tempLine.height(Math.abs(dy));
        } else if (base === 'circle') {
            const r = Math.sqrt(Math.pow(pos.x - drawStartPos.x, 2) + Math.pow(pos.y - drawStartPos.y, 2));
            tempLine.radius(r);
        } else if (base === 'tri') {
            const r = Math.sqrt(Math.pow(pos.x - drawStartPos.x, 2) + Math.pow(pos.y - drawStartPos.y, 2));
            tempLine.radius(r);
        }
        drawLayer.batchDraw();
    });

    stage.on('mouseup touchend', () => {
        // Polygon uses click-based drawing, not drag — ignore mouseup
        if (activeTool === 'polygon' || activeTool === 'polygon-fill') return;

        if (!tempLine) return;
        const base = activeTool?.replace('-fill', '');

        // Textbox: convert to object with text input
        if (activeTool === 'textbox') {
            const bw = tempLine.width(), bh = tempLine.height();
            if (bw > 10 && bh > 10) {
                const bx = tempLine.x(), by = tempLine.y();
                tempLine.destroy();
                tempLine = null;
                drawStartPos = null;
                createAnimTextbox(bx, by, bw, bh, drawColor);
            } else {
                tempLine.destroy();
                tempLine = null;
                drawStartPos = null;
            }
            drawLayer.batchDraw();
            return;
        }

        // Validate minimum size
        let valid = false;
        if (activeTool === 'pencil' || activeTool === 'curved') {
            valid = tempLine.points().length >= 4;
        } else if (base === 'rect') {
            valid = tempLine.width() > 3 && tempLine.height() > 3;
        } else if (base === 'circle' || base === 'tri') {
            valid = tempLine.radius() > 3;
        } else {
            const pts = tempLine.points?.();
            valid = pts && pts.length >= 4 && (Math.abs(pts[2] - pts[0]) > 3 || Math.abs(pts[3] - pts[1]) > 3);
        }

        if (valid) {
            makeDrawingClickable(tempLine);
            saveSnapshot();
        } else {
            tempLine.destroy();
        }
        tempLine = null;
        drawStartPos = null;
        drawLayer.batchDraw();
    });

    // (polygon closes only by clicking near first point — no dblclick finalize)
}

let selectedDrawing = null;

function selectDrawing(line) {
    deselectAll(); // clears selectedObj, transformer, and any previous selectedDrawing
    selectedDrawing = line;
    line.setAttr('_origColor', line.stroke());
    line.stroke('#ff0');
    drawLayer.batchDraw();
}

// ═══════════════════════════════════════════════════════════
//  FRAME SYSTEM
// ═══════════════════════════════════════════════════════════
function captureFrameState() {
    const objects = [];
    objectLayer.find('.animObject').forEach(obj => {
        const entry = {
            id: obj.id(),
            x: obj.x(),
            y: obj.y(),
            rotation: obj.rotation(),
            scaleX: obj.scaleX(),
            scaleY: obj.scaleY(),
            type: obj.getAttr('objType'),
            color: obj.getAttr('color') || null,
            label: obj.getAttr('label') || null
        };
        if (entry.type === 'textbox') {
            entry.textContent = obj.getAttr('textContent') || '';
            entry.boxWidth = obj.getAttr('boxWidth');
            entry.boxHeight = obj.getAttr('boxHeight');
            entry.fontSize = obj.getAttr('fontSize') || 14;
        }
        objects.push(entry);
    });
    const drawings = [];
    drawLayer.find('.animDrawing').forEach(d => {
        const className = d.getClassName();
        const entry = {
            id: d.id(),
            className,
            stroke: d.getAttr('_origColor') || d.stroke(),
            strokeWidth: d.strokeWidth(),
            dash: d.dash() || null,
            fill: d.fill ? d.fill() : 'transparent'
        };
        // Shape-specific properties
        if (className === 'Rect') {
            entry.x = d.x(); entry.y = d.y();
            entry.width = d.width(); entry.height = d.height();
        } else if (className === 'Circle') {
            entry.x = d.x(); entry.y = d.y();
            entry.radius = d.radius();
        } else if (className === 'RegularPolygon') {
            entry.x = d.x(); entry.y = d.y();
            entry.radius = d.radius(); entry.sides = d.sides();
        } else {
            // Line or Arrow (includes polygon = closed Line)
            // Bake in any drag offset so restored points are absolute
            const rawPts = d.points().slice();
            const ox = d.x(), oy = d.y();
            if (ox !== 0 || oy !== 0) {
                for (let i = 0; i < rawPts.length; i += 2) {
                    rawPts[i] += ox;
                    rawPts[i + 1] += oy;
                }
            }
            entry.points = rawPts;
            entry.tension = d.tension ? d.tension() : 0;
            entry.pointerLength = d.pointerLength ? d.pointerLength() : 0;
            entry.pointerWidth = d.pointerWidth ? d.pointerWidth() : 0;
            entry.pointerAtBeginning = d.pointerAtBeginning ? d.pointerAtBeginning() : false;
            entry.closed = d.closed ? d.closed() : false;
        }
        drawings.push(entry);
    });
    return { objects, drawings };
}

function restoreFrameState(frame) {
    if (!frame) return;

    // Rebuild objects — suppress auto-increment by passing stored label
    objectLayer.destroyChildren();
    if (transformer) { transformer = null; }
    selectedObj = null;

    // Temporarily suppress counters
    const savedPC = playerCount, savedNC = numberCount;
    frame.objects.forEach(o => {
        let node;
        if (o.type === 'player') {
            const isGK = o.label === 'GK';
            node = createPlayerToken(o.color || '#e53935', o.x, o.y, o.label, isGK, o.scaleX || 1);
        } else if (o.type === 'textbox') {
            node = createAnimTextbox(o.x, o.y, o.boxWidth, o.boxHeight, o.color || '#fff', o.textContent || '', o.fontSize || 14);
        } else {
            node = createEquipment(o.type, o.x, o.y, o.scaleX || 1);
        }
        node.id(o.id);
        node.rotation(o.rotation || 0);
        if (o.scaleX) { node.scaleX(o.scaleX); node.scaleY(o.scaleY || o.scaleX); }
        if (o.label) node.setAttr('label', o.label);
        if (o.type !== 'textbox') objectLayer.add(node); // textbox already added by createAnimTextbox
    });
    playerCount = savedPC;
    numberCount = savedNC;

    // Rebuild drawings
    drawLayer.destroyChildren();
    selectedDrawing = null;
    frame.drawings.forEach(d => {
        let shape;
        if (d.className === 'Rect') {
            shape = new Konva.Rect({
                x: d.x, y: d.y, width: d.width, height: d.height,
                stroke: d.stroke, strokeWidth: d.strokeWidth,
                fill: d.fill || 'transparent', dash: d.dash || undefined,
                id: d.id, name: 'animDrawing'
            });
        } else if (d.className === 'Circle') {
            shape = new Konva.Circle({
                x: d.x, y: d.y, radius: d.radius,
                stroke: d.stroke, strokeWidth: d.strokeWidth,
                fill: d.fill || 'transparent', dash: d.dash || undefined,
                id: d.id, name: 'animDrawing'
            });
        } else if (d.className === 'RegularPolygon') {
            shape = new Konva.RegularPolygon({
                x: d.x, y: d.y, radius: d.radius, sides: d.sides || 3,
                stroke: d.stroke, strokeWidth: d.strokeWidth,
                fill: d.fill || 'transparent', dash: d.dash || undefined,
                id: d.id, name: 'animDrawing'
            });
        } else if (d.className === 'Arrow' || d.pointerLength > 0) {
            shape = new Konva.Arrow({
                points: d.points, stroke: d.stroke, strokeWidth: d.strokeWidth,
                fill: d.fill || 'transparent',
                pointerLength: d.pointerLength || 0, pointerWidth: d.pointerWidth || 0,
                pointerAtBeginning: d.pointerAtBeginning || false,
                dash: d.dash || undefined, lineCap: 'round',
                id: d.id, name: 'animDrawing'
            });
        } else {
            shape = new Konva.Line({
                points: d.points, stroke: d.stroke, strokeWidth: d.strokeWidth,
                fill: d.fill || 'transparent',
                tension: d.tension || 0, lineCap: 'round', lineJoin: 'round',
                closed: d.closed || false,
                dash: d.dash || undefined,
                id: d.id, name: 'animDrawing'
            });
        }
        shape.listening(true);
        shape.draggable(true);
        shape.on('click tap', function (e) {
            if (!activeTool) {
                e.cancelBubble = true;
                selectDrawing(this);
            }
        });
        shape.on('dragstart', function () {
            if (activeTool) { this.stopDrag(); return; }
            selectDrawing(this);
        });
        shape.on('dragend', function () {
            saveSnapshot();
        });
        drawLayer.add(shape);
    });

    objectLayer.batchDraw();
    drawLayer.batchDraw();
}

function saveSnapshot() {
    // Snapshot ALL frames before any changes (so undo can fully reverse propagation)
    const prevAllFrames = JSON.parse(JSON.stringify(frames));
    const prev = frames[currentFrameIdx];

    undoStack.push({ frameIdx: currentFrameIdx, allFrames: prevAllFrames });
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];

    // Capture current canvas state
    const state = captureFrameState();

    // Determine which objects/drawings were added or removed vs the previous frame state
    const prevObjIds = new Set((prev?.objects || []).map(o => o.id));
    const currObjIds = new Set(state.objects.map(o => o.id));
    const addedObjs = state.objects.filter(o => !prevObjIds.has(o.id));
    const removedObjIds = [...prevObjIds].filter(id => !currObjIds.has(id));

    const prevDrawIds = new Set((prev?.drawings || []).map(d => d.id));
    const currDrawIds = new Set(state.drawings.map(d => d.id));
    const addedDraws = state.drawings.filter(d => !prevDrawIds.has(d.id));
    const removedDrawIds = [...prevDrawIds].filter(id => !currDrawIds.has(id));

    // Save current frame
    frames[currentFrameIdx] = state;

    // Propagate additions and removals to all later frames
    if (addedObjs.length || removedObjIds.length || addedDraws.length || removedDrawIds.length) {
        for (let i = currentFrameIdx + 1; i < frames.length; i++) {
            const f = frames[i];
            if (!f) continue;

            for (const obj of addedObjs) {
                if (!f.objects.some(o => o.id === obj.id)) {
                    f.objects.push(JSON.parse(JSON.stringify(obj)));
                }
            }
            if (removedObjIds.length) {
                f.objects = f.objects.filter(o => !removedObjIds.includes(o.id));
            }
            for (const drw of addedDraws) {
                if (!f.drawings.some(d => d.id === drw.id)) {
                    f.drawings.push(JSON.parse(JSON.stringify(drw)));
                }
            }
            if (removedDrawIds.length) {
                f.drawings = f.drawings.filter(d => !removedDrawIds.includes(d.id));
            }
        }
    }

    renderFrameStrip();
    renderOnionSkin();
    renderMovementPaths();
}

function addFrame() {
    // Save current first
    frames[currentFrameIdx] = captureFrameState();
    // New frame copies current state
    const copy = JSON.parse(JSON.stringify(captureFrameState()));
    currentFrameIdx++;
    frames.splice(currentFrameIdx, 0, copy);
    restoreFrameState(frames[currentFrameIdx]);
    renderFrameStrip();
    renderOnionSkin();
    renderMovementPaths();
}

function duplicateFrame() {
    addFrame(); // Same as add — copies current
}

function deleteFrame() {
    if (frames.length <= 1) return;
    frames.splice(currentFrameIdx, 1);
    if (currentFrameIdx >= frames.length) currentFrameIdx = frames.length - 1;
    restoreFrameState(frames[currentFrameIdx]);
    renderFrameStrip();
    renderOnionSkin();
    renderMovementPaths();
}

function goToFrame(idx) {
    if (idx < 0 || idx >= frames.length) return;
    // Only save current canvas state if NOT during or just after playback —
    // during playback objects are at interpolated tween positions
    // and capturing would corrupt the saved frame data
    if (!isPlaying && !_wasPlaying) {
        frames[currentFrameIdx] = captureFrameState();
    }
    currentFrameIdx = idx;
    restoreFrameState(frames[currentFrameIdx]);
    renderFrameStrip();
    renderOnionSkin();
    renderMovementPaths();
}

function renderFrameStrip() {
    const strip = document.getElementById('animFrameStrip');
    if (!strip) return;
    strip.innerHTML = frames.map((_, i) => `
        <div class="anim-frame-thumb${i === currentFrameIdx ? ' active' : ''}" data-idx="${i}" title="Frame ${i + 1}">
            <span class="anim-frame-num">${i + 1}</span>
        </div>
    `).join('');

    strip.querySelectorAll('.anim-frame-thumb').forEach(el => {
        el.addEventListener('click', () => {
            goToFrame(parseInt(el.dataset.idx));
        });
    });
}

// ═══════════════════════════════════════════════════════════
//  PLAYBACK
// ═══════════════════════════════════════════════════════════
function playAnimation() {
    if (frames.length <= 1) return;
    if (isPlaying) return;
    isPlaying = true;
    document.getElementById('animBtnPlay').disabled = true; document.getElementById('animBtnPlay').style.opacity = '0.4';
    document.getElementById('animBtnPause').disabled = false; document.getElementById('animBtnPause').style.opacity = '';

    let fromIdx = currentFrameIdx;

    function step() {
        const nextIdx = fromIdx + 1;
        // Stop at the last frame — no looping
        if (nextIdx >= frames.length) {
            currentFrameIdx = fromIdx;
            renderFrameStrip();
            // Auto-stop: playback finished
            pauseAnimation();
            return;
        }
        animateBetweenFrames(fromIdx, nextIdx, () => {
            fromIdx = nextIdx;
            currentFrameIdx = nextIdx;
            renderFrameStrip();
            if (isPlaying) {
                playTimer = setTimeout(step, 200); // small gap between frames
            }
        });
    }
    step();
}

function animateBetweenFrames(fromIdx, toIdx, onDone) {
    const fromState = frames[fromIdx];
    const toState = frames[toIdx];
    if (!fromState || !toState) { if (onDone) onDone(); return; }

    // Ensure we're showing the from state
    restoreFrameState(fromState);

    // Tween each object to its position in toState
    const tweens = [];
    toState.objects.forEach(toObj => {
        const node = objectLayer.findOne('#' + toObj.id);
        if (!node) return;
        const tween = new Konva.Tween({
            node,
            x: toObj.x,
            y: toObj.y,
            rotation: toObj.rotation || 0,
            duration: frameDuration / 1000,
            easing: Konva.Easings.EaseInOut
        });
        tweens.push(tween);
    });

    // Track tweens globally so stop/pause can cancel them
    _activeTweens = tweens;

    if (tweens.length === 0) {
        playTweenTimer = setTimeout(() => {
            playTweenTimer = null;
            restoreFrameState(toState);
            if (onDone) onDone();
        }, frameDuration);
        return;
    }

    // Play all tweens, call onDone when they finish (all same duration)
    tweens.forEach(t => t.play());
    playTweenTimer = setTimeout(() => {
        playTweenTimer = null;
        _activeTweens = [];
        tweens.forEach(t => t.destroy());
        restoreFrameState(toState);
        if (onDone) onDone();
    }, frameDuration + 50);
}

function pauseAnimation() {
    const wasInPlayback = isPlaying;
    isPlaying = false;
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    if (playTweenTimer) { clearTimeout(playTweenTimer); playTweenTimer = null; }

    // Cancel any in-flight tweens and destroy them
    if (_activeTweens.length) {
        _activeTweens.forEach(t => { try { t.destroy(); } catch (e) {} });
        _activeTweens = [];
    }

    // Restore the current frame's saved state so positions aren't corrupted
    // by mid-tween interpolated values
    if (wasInPlayback && frames[currentFrameIdx]) {
        restoreFrameState(frames[currentFrameIdx]);
    }

    document.getElementById('animBtnPlay').disabled = false; document.getElementById('animBtnPlay').style.opacity = '';
    document.getElementById('animBtnPause').disabled = true; document.getElementById('animBtnPause').style.opacity = '0.4';
}

function stopAnimation() {
    isPlaying = false;
    _wasPlaying = true; // prevent goToFrame from capturing corrupted canvas state
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    if (playTweenTimer) { clearTimeout(playTweenTimer); playTweenTimer = null; }

    // Cancel any in-flight tweens
    if (_activeTweens.length) {
        _activeTweens.forEach(t => { try { t.destroy(); } catch (e) {} });
        _activeTweens = [];
    }

    document.getElementById('animBtnPlay').disabled = false; document.getElementById('animBtnPlay').style.opacity = '';
    document.getElementById('animBtnPause').disabled = true; document.getElementById('animBtnPause').style.opacity = '0.4';

    // Go back to frame 0 with its original saved positions
    goToFrame(0);
    _wasPlaying = false;
}

// ═══════════════════════════════════════════════════════════
//  UNDO / REDO
// ═══════════════════════════════════════════════════════════
function undo() {
    if (undoStack.length === 0) return;
    const entry = undoStack.pop();
    // Save current full state for redo
    redoStack.push({ frameIdx: currentFrameIdx, allFrames: JSON.parse(JSON.stringify(frames)) });
    // Restore all frames (reverses propagation too)
    frames = entry.allFrames;
    currentFrameIdx = entry.frameIdx;
    restoreFrameState(frames[currentFrameIdx]);
    renderFrameStrip();
    renderOnionSkin();
    renderMovementPaths();
}

function redo() {
    if (redoStack.length === 0) return;
    const entry = redoStack.pop();
    // Save current full state for undo
    undoStack.push({ frameIdx: currentFrameIdx, allFrames: JSON.parse(JSON.stringify(frames)) });
    // Restore all frames
    frames = entry.allFrames;
    currentFrameIdx = entry.frameIdx;
    restoreFrameState(frames[currentFrameIdx]);
    renderFrameStrip();
    renderOnionSkin();
    renderMovementPaths();
}

// ═══════════════════════════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════════════════════════
function exportPNG() {
    deselectAll();
    // Temporarily reset to full resolution for clean export
    const prevSX = stage.scaleX(), prevSY = stage.scaleY();
    const prevW = stage.width(), prevH = stage.height();
    stage.scale({ x: 1, y: 1 });
    stage.width(CANVAS_W);
    stage.height(CANVAS_H);
    stage.batchDraw();

    const dataURL = stage.toDataURL({ pixelRatio: 2 });
    const link = document.createElement('a');
    link.download = (document.getElementById('animTitle')?.value || 'drill') + '_frame' + (currentFrameIdx + 1) + '.png';
    link.href = dataURL;
    link.click();

    // Restore responsive scale
    stage.scale({ x: prevSX, y: prevSY });
    stage.width(prevW);
    stage.height(prevH);
    stage.batchDraw();
}

function exportGIF() {
    // GIF export requires a library like gif.js — for now we export individual frames as PNGs
    // and show a toast about it
    deselectAll();
    const origIdx = currentFrameIdx;
    frames.forEach((frame, i) => {
        restoreFrameState(frame);
        stage.batchDraw();
        const dataURL = stage.toDataURL({ pixelRatio: 2 });
        const link = document.createElement('a');
        link.download = (document.getElementById('animTitle')?.value || 'drill') + '_frame' + (i + 1) + '.png';
        link.href = dataURL;
        link.click();
    });
    restoreFrameState(frames[origIdx]);
    currentFrameIdx = origIdx;
    renderFrameStrip();
    showToast(`Exported ${frames.length} frame(s) as PNG`, 'success');
}

// ═══════════════════════════════════════════════════════════
//  PALETTE DRAG-TO-CANVAS
// ═══════════════════════════════════════════════════════════
function setupPaletteDrag() {
    // Click palette item → sets pendingPlace mode → next click on pitch places it
    document.querySelectorAll('.anim-palette-item[data-type]').forEach(item => {
        if (item.classList.contains('anim-draw-tool')) return;

        item.addEventListener('click', () => {
            const type = item.dataset.type;
            const isGK = item.dataset.gk === 'true';

            // Clear draw tool if active
            if (activeTool) {
                activeTool = null;
                document.querySelectorAll('.anim-draw-tool').forEach(b => b.classList.remove('active'));
            }

            // Toggle: click again to deselect
            if (pendingPlace && pendingPlace.type === type && pendingPlace.isGK === isGK) {
                pendingPlace = null;
                document.querySelectorAll('.anim-palette-item[data-type]').forEach(i => i.classList.remove('anim-place-active'));
                stage.container().style.cursor = 'default';
                return;
            }

            pendingPlace = { type, isGK };
            document.querySelectorAll('.anim-palette-item[data-type]').forEach(i => i.classList.remove('anim-place-active'));
            item.classList.add('anim-place-active');
            stage.container().style.cursor = 'copy';
        });
    });

    // Click on pitch to place the pending item
    stage.on('click tap', (e) => {
        if (!pendingPlace) return;
        // Only place if clicking on pitch/empty area (not on existing objects)
        const target = e.target;
        if (target.getAttr?.('name') === 'animObject' || target.parent?.getAttr?.('name') === 'animObject') return;
        if (target.getAttr?.('name') === 'animDrawing') return;

        const pos = stage.getPointerPosition();
        const stageScale = stage.scaleX() || 1;
        const cx = pos.x / stageScale;
        const cy = pos.y / stageScale;

        // Apply snap
        const snapped = calcSnapGuides(cx, cy);

        let node;
        if (pendingPlace.type === 'player') {
            node = createPlayerToken(selColor, snapped.x, snapped.y, pendingPlace.isGK ? 'GK' : null, pendingPlace.isGK);
        } else {
            node = createEquipment(pendingPlace.type, snapped.x, snapped.y);
        }
        objectLayer.add(node);
        objectLayer.batchDraw();
        saveSnapshot();

        // Show snap guides briefly
        showSnapGuides(snapped.guides);
    });
}

// ═══════════════════════════════════════════════════════════
//  TOOL / COLOR SELECTION
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
//  SNAP ALIGNMENT GUIDES
// ═══════════════════════════════════════════════════════════
function calcSnapGuides(rawX, rawY, excludeNode) {
    const guides = [];
    let snapX = rawX, snapY = rawY;

    const objects = objectLayer.find('.animObject');
    if (objects.length === 0) return { x: rawX, y: rawY, guides };

    let bestDx = SNAP_THRESHOLD + 1, bestDy = SNAP_THRESHOLD + 1;
    let alignX = null, alignY = null;

    objects.forEach(obj => {
        if (obj === excludeNode) return;
        const dx = Math.abs(obj.x() - rawX);
        const dy = Math.abs(obj.y() - rawY);
        if (dx < bestDx) { bestDx = dx; alignX = obj.x(); }
        if (dy < bestDy) { bestDy = dy; alignY = obj.y(); }
    });

    if (bestDx <= SNAP_THRESHOLD && alignX !== null) {
        snapX = alignX;
        guides.push({ type: 'v', x: alignX });
    }
    if (bestDy <= SNAP_THRESHOLD && alignY !== null) {
        snapY = alignY;
        guides.push({ type: 'h', y: alignY });
    }

    return { x: snapX, y: snapY, guides };
}

function showSnapGuides(guides) {
    if (!snapLayer) return;
    snapLayer.destroyChildren();
    if (!guides || guides.length === 0) return;

    guides.forEach(g => {
        if (g.type === 'v') {
            snapLayer.add(new Konva.Line({
                points: [g.x, 0, g.x, CANVAS_H],
                stroke: 'rgba(59,130,246,0.5)', strokeWidth: 1,
                dash: [4, 4], listening: false
            }));
        } else if (g.type === 'h') {
            snapLayer.add(new Konva.Line({
                points: [0, g.y, CANVAS_W, g.y],
                stroke: 'rgba(59,130,246,0.5)', strokeWidth: 1,
                dash: [4, 4], listening: false
            }));
        }
    });
    snapLayer.batchDraw();
    setTimeout(() => { if (snapLayer) { snapLayer.destroyChildren(); snapLayer.batchDraw(); } }, 400);
}

function setupDragSnap() {
    // Add snap guides while dragging objects
    stage.on('dragmove', (e) => {
        const node = e.target;
        if (node.getAttr?.('name') !== 'animObject' && node.parent?.getAttr?.('name') !== 'animObject') return;
        const group = node.getAttr('name') === 'animObject' ? node : node.parent;
        const snapped = calcSnapGuides(group.x(), group.y(), group);
        group.x(snapped.x);
        group.y(snapped.y);
        showSnapGuides(snapped.guides);
    });
}

// ═══════════════════════════════════════════════════════════
//  CLEAR / REMOVE
// ═══════════════════════════════════════════════════════════
function clearAll() {
    objectLayer.find('.animObject').forEach(o => o.destroy());
    drawLayer.destroyChildren(); // clears drawings + any polygon vertices/preview
    if (transformer) { transformer.destroy(); transformer = null; }
    selectedObj = null;
    selectedDrawing = null;
    polygonPoints = [];
    polygonPreviewLine = null;
    polygonSnapRing = null;
    objectLayer.batchDraw();
    drawLayer.batchDraw();
    saveSnapshot();
}

function removeSelected() {
    if (selectedObj) {
        selectedObj.destroy();
        deselectAll();
        saveSnapshot();
    } else if (selectedDrawing) {
        selectedDrawing.destroy();
        selectedDrawing = null;
        drawLayer.batchDraw();
        saveSnapshot();
    }
}

function recolorPlayer(group, color) {
    group.setAttr('color', color);
    const circles = group.find('Circle');
    // circles[0] = shadow, circles[1] = main
    if (circles.length >= 2) {
        const lt = isLight(color);
        circles[1].fill(color);
        circles[1].stroke(lt ? '#333' : 'white');
        // Update text color too
        const texts = group.find('Text');
        if (texts.length > 0) texts[0].fill(lt ? '#222' : 'white');
    }
    objectLayer.batchDraw();
    saveSnapshot();
}

function setupToolListeners() {
    // Drawing tools
    document.querySelectorAll('.anim-draw-tool').forEach(btn => {
        btn.addEventListener('click', () => {
            const tool = btn.dataset.tool;

            // Clear placement mode
            pendingPlace = null;
            document.querySelectorAll('.anim-palette-item[data-type]').forEach(i => i.classList.remove('anim-place-active'));

            // If switching away from polygon, cancel any in-progress polygon
            if (activeTool === 'polygon' || activeTool === 'polygon-fill') {
                if (polygonPreviewLine) { polygonPreviewLine.destroy(); polygonPreviewLine = null; }
                if (polygonSnapRing) { polygonSnapRing.destroy(); polygonSnapRing = null; }
                drawLayer.find('.polygonVertex').forEach(v => v.destroy());
                polygonPoints = [];
                drawLayer.batchDraw();
            }

            if (activeTool === tool) {
                // Toggle off
                activeTool = null;
                btn.classList.remove('active');
                stage.container().style.cursor = 'default';
            } else {
                activeTool = tool;
                document.querySelectorAll('.anim-draw-tool').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                stage.container().style.cursor = 'crosshair';
                deselectAll();
            }
        });
    });

    // Fill toggle button
    const fillToggle = document.getElementById('animFillToggle');
    if (fillToggle) {
        fillToggle.addEventListener('click', () => {
            fillMode = !fillMode;
            fillToggle.classList.toggle('active', fillMode);
        });
    }

    // Color swatches — unified: sets selColor (players/equipment) AND drawColor (drawing tools)
    document.querySelectorAll('#animColorRow .anim-color-swatch').forEach(s => {
        s.addEventListener('click', () => {
            selColor = s.dataset.color;
            drawColor = s.dataset.color;
            document.querySelectorAll('#animColorRow .anim-color-swatch').forEach(x => x.classList.remove('active'));
            s.classList.add('active');
            // Recolor selected object if any
            if (selectedObj && selectedObj.getAttr('objType') === 'player') {
                recolorPlayer(selectedObj, selColor);
            }
        });
    });

    // Custom color picker
    const customPicker = document.getElementById('animCustomColor');
    if (customPicker) {
        customPicker.addEventListener('input', (e) => {
            selColor = e.target.value;
            drawColor = e.target.value;
            document.querySelectorAll('#animColorRow .anim-color-swatch').forEach(x => x.classList.remove('active'));
            if (selectedObj && selectedObj.getAttr('objType') === 'player') {
                recolorPlayer(selectedObj, selColor);
            }
        });
    }

    // Size dropdown (S/M/L) — affects line width, equipment scale, player scale
    const sizeSelect = document.getElementById('animSizeSelect');
    if (sizeSelect) {
        sizeSelect.addEventListener('change', () => {
            currentSize = sizeSelect.value;
            lineWidth = LINE_WIDTHS[currentSize] || 3;
        });
    }

    // Pitch type
    const pitchSelect = document.getElementById('animPitchType');
    if (pitchSelect) {
        pitchSelect.addEventListener('change', () => {
            drawPitch(pitchSelect.value);
        });
    }

    // Toolbar buttons
    document.getElementById('animBtnUndo')?.addEventListener('click', undo);
    document.getElementById('animBtnRedo')?.addEventListener('click', redo);
    document.getElementById('animBtnExportPng')?.addEventListener('click', exportPNG);
    document.getElementById('animBtnExportGif')?.addEventListener('click', exportVideo);

    // Onion skin + movement paths toggles
    document.getElementById('animBtnOnion')?.addEventListener('click', toggleOnionSkin);
    document.getElementById('animBtnPaths')?.addEventListener('click', toggleMovementPaths);

    // Palette action buttons
    document.getElementById('animBtnRemove2')?.addEventListener('click', removeSelected);
    document.getElementById('animBtnUndo2')?.addEventListener('click', undo);
    document.getElementById('animBtnClear')?.addEventListener('click', clearAll);

    // Frame controls
    document.getElementById('animBtnPlay')?.addEventListener('click', playAnimation);
    document.getElementById('animBtnPause')?.addEventListener('click', pauseAnimation);
    document.getElementById('animBtnStop')?.addEventListener('click', stopAnimation);
    document.getElementById('animBtnPrevFrame')?.addEventListener('click', () => goToFrame(currentFrameIdx - 1));
    document.getElementById('animBtnNextFrame')?.addEventListener('click', () => goToFrame(currentFrameIdx + 1));
    document.getElementById('animBtnAddFrame')?.addEventListener('click', addFrame);
    document.getElementById('animBtnDupFrame')?.addEventListener('click', duplicateFrame);
    document.getElementById('animBtnDelFrame')?.addEventListener('click', deleteFrame);

    // Speed slider
    const speedSlider = document.getElementById('animSpeedSlider');
    const speedLabel = document.getElementById('animSpeedLabel');
    if (speedSlider) {
        speedSlider.addEventListener('input', () => {
            frameDuration = parseInt(speedSlider.value);
            if (speedLabel) speedLabel.textContent = (frameDuration / 1000).toFixed(1) + 's';
        });
    }

    // Delete key
    document.addEventListener('keydown', (e) => {
        // Only handle if animation tab is visible
        const animTab = document.getElementById('tab-animation');
        if (!animTab || animTab.style.display === 'none') return;

        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (selectedObj) {
                selectedObj.destroy();
                deselectAll();
                saveSnapshot();
            } else if (selectedDrawing) {
                selectedDrawing.destroy();
                selectedDrawing = null;
                drawLayer.batchDraw();
                saveSnapshot();
            }
        }
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
    });

    // Click empty area to deselect (only if no pendingPlace and no activeTool)
    stage.on('click tap', (e) => {
        if (e.target === stage || e.target.parent === pitchLayer) {
            if (!activeTool && !pendingPlace) {
                deselectAll();
            }
        }
    });
}

// ═══════════════════════════════════════════════════════════
//  ONION SKINNING
// ═══════════════════════════════════════════════════════════
function toggleOnionSkin() {
    onionSkinEnabled = !onionSkinEnabled;
    const btn = document.getElementById('animBtnOnion');
    if (btn) btn.classList.toggle('active', onionSkinEnabled);
    renderOnionSkin();
}

function renderOnionSkin() {
    if (!ghostLayer) return;
    ghostLayer.destroyChildren();
    if (!onionSkinEnabled || currentFrameIdx === 0) {
        ghostLayer.batchDraw();
        return;
    }
    const prevFrame = frames[currentFrameIdx - 1];
    if (!prevFrame) { ghostLayer.batchDraw(); return; }

    prevFrame.objects.forEach(o => {
        const ghost = new Konva.Circle({
            x: o.x, y: o.y, radius: 14,
            fill: o.type === 'player' ? (o.color || '#e53935') : '#94a3b8',
            opacity: 0.2, listening: false
        });
        ghostLayer.add(ghost);
        if (o.label) {
            ghostLayer.add(new Konva.Text({
                x: o.x - 8, y: o.y - 6, text: o.label,
                fontSize: 11, fill: '#fff', opacity: 0.25,
                fontFamily: 'Inter,sans-serif', fontStyle: 'bold', listening: false
            }));
        }
    });
    ghostLayer.batchDraw();
}

// ═══════════════════════════════════════════════════════════
//  MOVEMENT PATHS
// ═══════════════════════════════════════════════════════════
function toggleMovementPaths() {
    movementPathsEnabled = !movementPathsEnabled;
    const btn = document.getElementById('animBtnPaths');
    if (btn) btn.classList.toggle('active', movementPathsEnabled);
    renderMovementPaths();
}

function renderMovementPaths() {
    if (!pathLayer) return;
    pathLayer.destroyChildren();
    if (!movementPathsEnabled || frames.length <= 1) {
        pathLayer.batchDraw();
        return;
    }

    // Only show movement from CURRENT frame → NEXT frame (not accumulated history)
    const fromIdx = currentFrameIdx;
    const toIdx = fromIdx + 1;
    if (toIdx >= frames.length) { pathLayer.batchDraw(); return; }

    const fromFrame = frames[fromIdx];
    const toFrame = frames[toIdx];
    if (!fromFrame || !toFrame) { pathLayer.batchDraw(); return; }

    const fallbackColors = { cone: '#ff6d00', flag: '#ff6d00', goalpost: '#94a3b8',
        ladder: '#ff6d00', hurdle: '#ff6d00', mannequin: '#94a3b8', pole: '#94a3b8',
        minigoal: '#94a3b8', ring: '#ff6d00', rebounder: '#94a3b8' };

    fromFrame.objects.forEach(fromObj => {
        const toObj = toFrame.objects.find(o => o.id === fromObj.id);
        if (!toObj) return;

        // Skip if object didn't move between these two frames
        if (fromObj.x === toObj.x && fromObj.y === toObj.y) return;

        const objType = fromObj.type;

        // Ball = white; Players/GK = their team color; Equipment = fallback
        let pathColor;
        if (objType === 'ball') pathColor = '#ffffff';
        else if (objType === 'player' || objType === 'goalkeeper') pathColor = fromObj.color || '#e53935';
        else pathColor = fallbackColors[objType] || '#94a3b8';

        // All paths are dashed
        pathLayer.add(new Konva.Line({
            points: [fromObj.x, fromObj.y, toObj.x, toObj.y],
            stroke: pathColor,
            strokeWidth: objType === 'ball' ? 1.5 : 2,
            dash: [6, 4],
            opacity: 0.6,
            lineCap: 'round', lineJoin: 'round', listening: false
        }));

        // Start dot (current position)
        pathLayer.add(new Konva.Circle({
            x: fromObj.x, y: fromObj.y, radius: 4,
            fill: pathColor, opacity: 0.4,
            stroke: '#fff', strokeWidth: 1, listening: false
        }));

        // End dot (next frame position) — brighter
        pathLayer.add(new Konva.Circle({
            x: toObj.x, y: toObj.y, radius: 3,
            fill: pathColor, opacity: 0.8, listening: false
        }));
    });

    pathLayer.batchDraw();
}

// ═══════════════════════════════════════════════════════════
//  VIDEO EXPORT (WebM via MediaRecorder)
// ═══════════════════════════════════════════════════════════
async function exportVideo() {
    if (frames.length <= 1) {
        showToast('Need at least 2 frames to export video', 'warn');
        return;
    }

    const btn = document.getElementById('animBtnExportGif');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

    deselectAll();
    // Temporarily disable onion/paths for clean export
    const wasOnion = onionSkinEnabled, wasPaths = movementPathsEnabled;
    if (wasOnion) { onionSkinEnabled = false; renderOnionSkin(); }
    if (wasPaths) { movementPathsEnabled = false; renderMovementPaths(); }

    // Temporarily reset stage to full resolution (undo responsive scaling)
    const prevScaleX = stage.scaleX(), prevScaleY = stage.scaleY();
    const prevWidth = stage.width(), prevHeight = stage.height();
    stage.scale({ x: 1, y: 1 });
    stage.width(CANVAS_W);
    stage.height(CANVAS_H);
    stage.batchDraw();

    const origIdx = currentFrameIdx;

    // Create a fixed-size recording canvas at full resolution
    const recCanvas = document.createElement('canvas');
    recCanvas.width = CANVAS_W;
    recCanvas.height = CANVAS_H;
    const recCtx = recCanvas.getContext('2d');
    // 60fps capture stream for smoother playback
    const stream = recCanvas.captureStream(60);
    // Try VP9 first (better quality), fallback to VP8
    let mimeType = 'video/webm; codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm; codecs=vp8';
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    const done = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start();

    // Helper: capture current stage to the recording canvas
    function captureToRec() {
        const fc = stage.toCanvas({ pixelRatio: 1 });
        recCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        recCtx.drawImage(fc, 0, 0, CANVAS_W, CANVAS_H);
    }

    // Helper: wait for next animation frame (smoother than setTimeout)
    function waitFrame() {
        return new Promise(r => requestAnimationFrame(r));
    }

    // Helper: wait N ms using requestAnimationFrame loop (more precise than setTimeout)
    function waitMs(ms) {
        return new Promise(resolve => {
            const start = performance.now();
            function tick() {
                if (performance.now() - start >= ms) { resolve(); return; }
                requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
        });
    }

    // Play through all frames with tweens
    for (let i = 0; i < frames.length; i++) {
        const nextIdx = i + 1;
        if (nextIdx >= frames.length) break;
        restoreFrameState(frames[i]);
        stage.batchDraw();
        captureToRec();
        await waitMs(200); // brief pause at start position (capture several frames for still)

        // Tween to next frame
        restoreFrameState(frames[i]);
        stage.batchDraw();
        const toState = frames[nextIdx];

        // Animate objects
        const tweens = [];
        toState.objects.forEach(toObj => {
            const node = objectLayer.findOne('#' + toObj.id);
            if (!node) return;
            tweens.push(new Konva.Tween({
                node, x: toObj.x, y: toObj.y, rotation: toObj.rotation || 0,
                duration: frameDuration / 1000, easing: Konva.Easings.EaseInOut
            }));
        });
        tweens.forEach(t => t.play());

        // Capture at ~60fps during tween using requestAnimationFrame
        const tweenStart = performance.now();
        while (performance.now() - tweenStart < frameDuration) {
            await waitFrame();
            captureToRec();
        }
        tweens.forEach(t => t.destroy());
        restoreFrameState(toState);
        stage.batchDraw();
        captureToRec();
        await waitMs(400); // longer pause at end position for clarity
    }

    recorder.stop();
    await done;

    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = (document.getElementById('animTitle')?.value || 'animation') + '.webm';
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);

    // Restore responsive scale
    stage.scale({ x: prevScaleX, y: prevScaleY });
    stage.width(prevWidth);
    stage.height(prevHeight);

    // Restore state
    restoreFrameState(frames[origIdx]);
    currentFrameIdx = origIdx;
    renderFrameStrip();
    stage.batchDraw();
    if (wasOnion) { onionSkinEnabled = true; renderOnionSkin(); }
    if (wasPaths) { movementPathsEnabled = true; renderMovementPaths(); }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-film"></i>'; }
    showToast('Video exported!', 'success');
}

// ═══════════════════════════════════════════════════════════
//  SAVE / LOAD (Supabase)
// ═══════════════════════════════════════════════════════════
async function saveAnimation() {
    if (!_clubId) {
        showToast('No club context — cannot save', 'error');
        return;
    }

    const title = document.getElementById('animTitle')?.value?.trim() || 'Untitled Animation';
    const pitchType = document.getElementById('animPitchType')?.value || 'full';

    // Save current frame state
    frames[currentFrameIdx] = captureFrameState();

    // Generate thumbnail at full resolution then scale down
    deselectAll();
    const prevSX = stage.scaleX(), prevSY = stage.scaleY();
    const prevW = stage.width(), prevH = stage.height();
    stage.scale({ x: 1, y: 1 });
    stage.width(CANVAS_W);
    stage.height(CANVAS_H);
    stage.batchDraw();
    const thumbnail = stage.toDataURL({ pixelRatio: 0.3 });
    stage.scale({ x: prevSX, y: prevSY });
    stage.width(prevW);
    stage.height(prevH);
    stage.batchDraw();

    const row = {
        club_id: _clubId,
        created_by: _userId,
        title,
        pitch_type: pitchType,
        frame_duration: frameDuration,
        frames: JSON.parse(JSON.stringify(frames)),
        video_url: _animVideoUrl || null,
        thumbnail,
        updated_at: new Date().toISOString()
    };

    const btn = document.getElementById('animBtnSave');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }

    try {
        let result;
        if (_currentAnimationId) {
            // Update existing
            result = await supabase
                .from('animations')
                .update(row)
                .eq('id', _currentAnimationId)
                .select()
                .single();
        } else {
            // Insert new
            result = await supabase
                .from('animations')
                .insert(row)
                .select()
                .single();
        }

        if (result.error) throw result.error;

        _currentAnimationId = result.data.id;

        // Ensure a drill record exists so this animation appears in the library and drill picker
        try {
            const { data: existingDrillArr } = await supabase.from('drills')
                .select('id').eq('animation_id', _currentAnimationId).limit(1);
            const existingDrill = existingDrillArr?.[0] || null;
            if (existingDrill) {
                // Update title + category on existing drill
                const catTag = document.getElementById('animCategoryTag')?.value || null;
                await supabase.from('drills').update({ title, pitch_type: pitchType, category_tag: catTag }).eq('id', existingDrill.id);
            } else {
                // Create new drill linked to this animation
                const catTag = document.getElementById('animCategoryTag')?.value || null;
                await supabase.from('drills').insert({
                    club_id: _clubId,
                    created_by: _userId,
                    session_id: null,
                    title,
                    description: '',
                    pitch_type: pitchType,
                    drawing_data: JSON.stringify({ tokens: [], paths: [] }),
                    image: null,
                    animation_id: _currentAnimationId,
                    author: window._profile?.full_name || '',
                    category: 'Session Drill',
                    category_tag: catTag,
                });
            }
        } catch (e) { /* Non-fatal */ }

        showToast('Animation saved!', 'success');
    } catch (err) {
        console.error('Save animation error:', err);
        showToast('Failed to save animation: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save'; }
    }
}

async function listAnimations() {
    if (!_clubId) {
        showToast('No club context', 'error');
        return;
    }

    const { data, error } = await supabase
        .from('animations')
        .select('id, title, pitch_type, thumbnail, updated_at')
        .eq('club_id', _clubId)
        .order('updated_at', { ascending: false });

    if (error) {
        console.error('List animations error:', error);
        showToast('Failed to load animations', 'error');
        return;
    }

    showAnimationPicker(data || []);
}

function showAnimationPicker(list) {
    // Remove existing modal
    document.getElementById('animPickerModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'animPickerModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);';

    const card = document.createElement('div');
    card.style.cssText = 'background:var(--card-bg,#1e293b);border-radius:12px;padding:24px;max-width:600px;width:90%;max-height:70vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5);';

    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="margin:0;color:var(--text-primary,#f1f5f9);">Load Animation</h3>
        <button onclick="document.getElementById('animPickerModal')?.remove()" style="background:none;border:none;color:var(--text-secondary,#94a3b8);font-size:1.2rem;cursor:pointer;">&times;</button>
    </div>`;

    if (list.length === 0) {
        html += '<p style="color:var(--text-secondary,#94a3b8);text-align:center;padding:32px 0;">No saved animations yet.</p>';
    } else {
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;">';
        list.forEach(a => {
            const date = new Date(a.updated_at).toLocaleDateString();
            html += `<div class="anim-picker-card" data-id="${a.id}" style="background:var(--bg-secondary,#0f172a);border-radius:8px;padding:8px;cursor:pointer;border:1px solid var(--border-light,#334155);transition:border-color 0.2s;" onmouseenter="this.style.borderColor='var(--primary,#3b82f6)'" onmouseleave="this.style.borderColor='var(--border-light,#334155)'">
                ${a.thumbnail ? `<img src="${a.thumbnail}" style="width:100%;border-radius:4px;margin-bottom:6px;" alt="">` : '<div style="width:100%;height:80px;background:#1e293b;border-radius:4px;margin-bottom:6px;"></div>'}
                <div style="font-size:0.8rem;font-weight:600;color:var(--text-primary,#f1f5f9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.title || 'Untitled'}</div>
                <div style="font-size:0.65rem;color:var(--text-secondary,#94a3b8);">${a.pitch_type} &bull; ${date}</div>
                <button class="anim-delete-btn" data-id="${a.id}" style="margin-top:4px;font-size:0.6rem;color:#ef4444;background:none;border:1px solid #ef4444;border-radius:4px;padding:2px 6px;cursor:pointer;">Delete</button>
            </div>`;
        });
        html += '</div>';
    }

    card.innerHTML = html;
    modal.appendChild(card);
    document.body.appendChild(modal);

    // Click backdrop to close
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    // Click card to load
    card.querySelectorAll('.anim-picker-card').forEach(c => {
        c.addEventListener('click', (e) => {
            if (e.target.closest('.anim-delete-btn')) return;
            loadAnimation(c.dataset.id);
            modal.remove();
        });
    });

    // Delete buttons
    card.querySelectorAll('.anim-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Delete this animation?')) return;
            const { error } = await supabase.from('animations').delete().eq('id', btn.dataset.id);
            if (error) {
                showToast('Delete failed', 'error');
            } else {
                btn.closest('.anim-picker-card')?.remove();
                if (_currentAnimationId === btn.dataset.id) _currentAnimationId = null;
                showToast('Animation deleted', 'success');
            }
        });
    });
}

async function loadAnimation(id) {
    const { data, error } = await supabase
        .from('animations')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !data) {
        console.error('Load animation error:', error);
        showToast('Failed to load animation', 'error');
        return;
    }

    _currentAnimationId = data.id;

    // Restore title
    const titleInput = document.getElementById('animTitle');
    if (titleInput) titleInput.value = data.title || '';

    // Restore pitch type
    const pitchSelect = document.getElementById('animPitchType');
    if (pitchSelect) { pitchSelect.value = data.pitch_type || 'full'; drawPitch(pitchSelect.value); }

    // Restore speed
    frameDuration = data.frame_duration || 1500;
    const slider = document.getElementById('animSpeedSlider');
    const label = document.getElementById('animSpeedLabel');
    if (slider) slider.value = frameDuration;
    if (label) label.textContent = (frameDuration / 1000).toFixed(1) + 's';

    // Restore frames
    frames = data.frames && data.frames.length > 0 ? data.frames : [{ objects: [], drawings: [] }];
    currentFrameIdx = 0;
    restoreFrameState(frames[0]);
    renderFrameStrip();
    renderOnionSkin();
    renderMovementPaths();

    // Restore video
    _animVideoUrl = data.video_url || '';
    const vInput = document.getElementById('animVideoUrl');
    if (vInput) vInput.value = _animVideoUrl;
    previewAnimVideo();

    // Restore category from linked drill (if any)
    try {
        const { data: linkedDrills } = await supabase.from('drills')
            .select('category_tag').eq('animation_id', data.id).limit(1);
        const catSel = document.getElementById('animCategoryTag');
        if (catSel && linkedDrills?.[0]?.category_tag) catSel.value = linkedDrills[0].category_tag;
    } catch (e) { /* non-fatal */ }

    showToast('Animation loaded', 'success');
}

function newAnimation() {
    _currentAnimationId = null;
    _animVideoUrl = '';

    const titleInput = document.getElementById('animTitle');
    if (titleInput) titleInput.value = '';

    const pitchSelect = document.getElementById('animPitchType');
    if (pitchSelect) { pitchSelect.value = 'full'; drawPitch('full'); }

    frameDuration = 1500;
    const slider = document.getElementById('animSpeedSlider');
    const label = document.getElementById('animSpeedLabel');
    if (slider) slider.value = 1500;
    if (label) label.textContent = '1.5s';

    // Clear canvas
    objectLayer.destroyChildren();
    drawLayer.destroyChildren();
    objectLayer.batchDraw();
    drawLayer.batchDraw();

    frames = [{ objects: [], drawings: [] }];
    currentFrameIdx = 0;
    undoStack = [];
    redoStack = [];
    renderFrameStrip();
    renderOnionSkin();
    renderMovementPaths();

    // Clear video panel
    const vInput = document.getElementById('animVideoUrl');
    if (vInput) vInput.value = '';
    const vPrev = document.getElementById('animVideoPreview');
    if (vPrev) vPrev.innerHTML = '';
    const vPanel = document.getElementById('animVideoPanel');
    if (vPanel) vPanel.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════
//  VIDEO REFERENCE (link or upload)
// ═══════════════════════════════════════════════════════════
function toggleAnimVideoPanel() {
    const panel = document.getElementById('animVideoPanel');
    if (!panel) return;
    const hidden = panel.style.display === 'none';
    panel.style.display = hidden ? 'block' : 'none';
    if (hidden && _animVideoUrl) {
        const input = document.getElementById('animVideoUrl');
        if (input && !input.value) input.value = _animVideoUrl;
        previewAnimVideo();
    }
}

function previewAnimVideo() {
    const url = document.getElementById('animVideoUrl')?.value?.trim() || '';
    const container = document.getElementById('animVideoPreview');
    if (!container) return;

    _animVideoUrl = url;
    if (!url) { container.innerHTML = ''; return; }

    // YouTube
    const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
        container.innerHTML = `<iframe src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen style="width:100%;aspect-ratio:16/9;border-radius:6px;"></iframe>`;
        return;
    }

    // Vimeo
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) {
        container.innerHTML = `<iframe src="https://player.vimeo.com/video/${vimeoMatch[1]}" frameborder="0" allowfullscreen style="width:100%;aspect-ratio:16/9;border-radius:6px;"></iframe>`;
        return;
    }

    // Google Drive
    const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (driveMatch) {
        container.innerHTML = `<iframe src="https://drive.google.com/file/d/${driveMatch[1]}/preview" frameborder="0" allowfullscreen style="width:100%;aspect-ratio:16/9;border-radius:6px;"></iframe>`;
        return;
    }

    // Direct video URL
    if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)) {
        container.innerHTML = `<video src="${url}" controls style="width:100%;border-radius:6px;"></video>`;
        return;
    }

    // Fallback — show as link
    container.innerHTML = `<a href="${url}" target="_blank" rel="noopener" style="color:var(--primary);font-size:0.8rem;word-break:break-all;">${url}</a>`;
}

async function uploadAnimVideoFile(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
        showToast('Video must be under 100MB', 'error');
        fileInput.value = '';
        return;
    }

    const progressWrap = document.getElementById('animVideoProgress');
    const progressFill = document.getElementById('animVideoProgressFill');
    const progressText = document.getElementById('animVideoProgressText');
    if (progressWrap) progressWrap.style.display = 'flex';
    if (progressFill) progressFill.style.width = '10%';
    if (progressText) progressText.textContent = `Uploading ${file.name}...`;

    try {
        const ext = file.name.split('.').pop().toLowerCase();
        const fileName = `animations/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

        if (progressFill) progressFill.style.width = '40%';

        const { data, error } = await supabase.storage
            .from('drill-videos')
            .upload(fileName, file, { cacheControl: '3600', upsert: false });

        if (error) throw error;
        if (progressFill) progressFill.style.width = '80%';

        const { data: urlData } = supabase.storage.from('drill-videos').getPublicUrl(fileName);
        const publicUrl = urlData?.publicUrl || '';

        _animVideoUrl = publicUrl;
        const urlInput = document.getElementById('animVideoUrl');
        if (urlInput) urlInput.value = publicUrl;
        previewAnimVideo();

        if (progressFill) progressFill.style.width = '100%';
        if (progressText) progressText.textContent = 'Done!';
        setTimeout(() => { if (progressWrap) progressWrap.style.display = 'none'; }, 1500);

        showToast('Video uploaded', 'success');
    } catch (err) {
        console.error('Upload error:', err);
        showToast('Upload failed: ' + err.message, 'error');
        if (progressWrap) progressWrap.style.display = 'none';
    }
    fileInput.value = '';
}

function removeAnimVideo() {
    _animVideoUrl = '';
    const urlInput = document.getElementById('animVideoUrl');
    if (urlInput) urlInput.value = '';
    const preview = document.getElementById('animVideoPreview');
    if (preview) preview.innerHTML = '';
    const panel = document.getElementById('animVideoPanel');
    if (panel) panel.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
let initialized = false;

export function initAnimationBuilder() {
    if (initialized) return;

    const container = document.getElementById('animCanvasContainer');
    if (!container) return;

    stage = new Konva.Stage({
        container: 'animCanvasContainer',
        width: CANVAS_W,
        height: CANVAS_H
    });

    pitchLayer = new Konva.Layer();
    drawLayer = new Konva.Layer();
    objectLayer = new Konva.Layer();
    snapLayer = new Konva.Layer();

    ghostLayer = new Konva.Layer({ listening: false });
    pathLayer = new Konva.Layer({ listening: false });

    stage.add(pitchLayer);
    stage.add(ghostLayer);
    stage.add(pathLayer);
    stage.add(drawLayer);
    stage.add(objectLayer);
    stage.add(snapLayer);

    drawPitch('full');

    // Initialize with one empty frame
    frames = [{ objects: [], drawings: [] }];
    currentFrameIdx = 0;
    renderFrameStrip();

    setupDrawingHandlers();
    setupPaletteDrag();
    setupToolListeners();
    setupDragSnap();

    // Save / Load / New / Video buttons
    document.getElementById('animBtnSave')?.addEventListener('click', saveAnimation);
    document.getElementById('animBtnLoad')?.addEventListener('click', listAnimations);
    document.getElementById('animBtnNew')?.addEventListener('click', () => {
        if (frames.length > 1 || (frames[0]?.objects?.length > 0)) {
            if (!confirm('Start a new animation? Unsaved changes will be lost.')) return;
        }
        newAnimation();
    });
    document.getElementById('animBtnVideo')?.addEventListener('click', toggleAnimVideoPanel);
    document.getElementById('animVideoUrl')?.addEventListener('input', previewAnimVideo);
    document.getElementById('animVideoFile')?.addEventListener('change', function() { uploadAnimVideoFile(this); });
    document.getElementById('animVideoRemove')?.addEventListener('click', removeAnimVideo);
    document.getElementById('animBtnDoneForDrill')?.addEventListener('click', completeAnimEdit);

    // Fetch club context
    (async () => {
        try {
            const profile = await getProfile();
            _clubId = sessionStorage.getItem('impersonating_club_id') || profile?.club_id || null;
            _userId = profile?.id || null;
        } catch (e) { console.warn('Animation builder: could not get profile', e); }
    })();

    // Make canvas responsive
    function resizeCanvas() {
        const wrap = document.getElementById('animBuilderWrap');
        const isMobileFs = wrap?.classList.contains('anim-mobile-fs');
        const canvasArea = container.parentElement;

        if (isMobileFs && canvasArea) {
            // In mobile fullscreen: fill the canvas area (between toolbar and palette)
            const areaW = canvasArea.clientWidth;
            const areaH = canvasArea.clientHeight;
            const scaleX = areaW / CANVAS_W;
            const scaleY = areaH / CANVAS_H;
            const scale = Math.min(scaleX, scaleY, 1);
            stage.width(CANVAS_W * scale);
            stage.height(CANVAS_H * scale);
            stage.scale({ x: scale, y: scale });
        } else {
            const cw = canvasArea?.clientWidth || CANVAS_W;
            const scale = Math.min(1, cw / CANVAS_W);
            stage.width(CANVAS_W * scale);
            stage.height(CANVAS_H * scale);
            stage.scale({ x: scale, y: scale });
        }
        stage.batchDraw();
    }
    window.addEventListener('resize', resizeCanvas);
    setTimeout(resizeCanvas, 100);

    // ── Mobile touch scroll prevention ──
    // Prevent page scroll when touching the canvas area
    container.addEventListener('touchstart', (e) => { e.preventDefault(); }, { passive: false });
    container.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });

    // ── Mobile fullscreen detection ──
    const _isMobile = window.innerWidth < 768 || ('ontouchstart' in window && window.innerWidth < 1024);

    function enterAnimMobileFs() {
        const wrap = document.getElementById('animBuilderWrap');
        if (!wrap) return;
        wrap.classList.add('anim-mobile-fs');
        document.getElementById('animMobileFsExit').style.display = '';
        document.body.style.overflow = 'hidden';
        // Try to lock orientation to landscape
        try { screen.orientation?.lock('landscape').catch(() => {}); } catch (e) {}
        setTimeout(resizeCanvas, 50);
    }

    function exitAnimMobileFs() {
        const wrap = document.getElementById('animBuilderWrap');
        if (!wrap) return;
        wrap.classList.remove('anim-mobile-fs');
        document.getElementById('animMobileFsExit').style.display = 'none';
        document.body.style.overflow = '';
        try { screen.orientation?.unlock(); } catch (e) {}
        setTimeout(resizeCanvas, 50);
    }

    window._exitAnimMobileFs = exitAnimMobileFs;
    window._enterAnimMobileFs = enterAnimMobileFs;

    // Auto-enter fullscreen on mobile when animation tab is shown
    if (_isMobile) {
        const observer = new MutationObserver(() => {
            const tabPane = document.getElementById('tab-animation');
            if (tabPane && tabPane.style.display !== 'none') {
                const wrap = document.getElementById('animBuilderWrap');
                if (wrap && !wrap.classList.contains('anim-mobile-fs')) {
                    enterAnimMobileFs();
                }
            }
        });
        const tabPane = document.getElementById('tab-animation');
        if (tabPane) observer.observe(tabPane, { attributes: true, attributeFilter: ['style'] });
    }

    initialized = true;
}

export function resizeAnimCanvas() {
    if (!stage) return;
    const container = document.getElementById('animCanvasContainer');
    if (!container) return;
    const canvasArea = container.parentElement;
    const wrap = document.getElementById('animBuilderWrap');
    const isMobileFs = wrap?.classList.contains('anim-mobile-fs');

    if (isMobileFs && canvasArea) {
        const scaleX = canvasArea.clientWidth / CANVAS_W;
        const scaleY = canvasArea.clientHeight / CANVAS_H;
        const scale = Math.min(scaleX, scaleY, 1);
        stage.width(CANVAS_W * scale);
        stage.height(CANVAS_H * scale);
        stage.scale({ x: scale, y: scale });
    } else {
        const cw = canvasArea?.clientWidth || CANVAS_W;
        const scale = Math.min(1, cw / CANVAS_W);
        stage.width(CANVAS_W * scale);
        stage.height(CANVAS_H * scale);
        stage.scale({ x: scale, y: scale });
    }
    stage.batchDraw();
}

// ═══════════════════════════════════════════════════════════
//  DRILL-LINKING API (used by planner.js to link animations to drill blocks)
// ═══════════════════════════════════════════════════════════
let _onAnimEditComplete = null;
let _editingForDrill = false;

export function getCurrentAnimationId() { return _currentAnimationId; }

export function getAnimationThumbnail() {
    if (!stage) return null;
    deselectAll();
    return stage.toDataURL({ pixelRatio: 0.3 });
}

/**
 * Called by planner.js when a drill block wants to edit/create an animation.
 * @param {string|null} animId - existing animation ID to load, or null for new
 * @param {Function} onComplete - callback(animId, thumbnail) when user clicks "Done"
 */
export function editAnimationForDrill(animId, onComplete) {
    _onAnimEditComplete = onComplete;
    _editingForDrill = true;
    // Show the "Done" button
    const doneBtn = document.getElementById('animBtnDoneForDrill');
    if (doneBtn) doneBtn.style.display = '';
    if (animId) {
        loadAnimation(animId);
    } else {
        newAnimation();
    }
}

export function completeAnimEdit() {
    if (!_editingForDrill) return;
    // Must save first if not saved yet
    const finish = () => {
        const thumb = getAnimationThumbnail();
        if (_onAnimEditComplete) {
            _onAnimEditComplete(_currentAnimationId, thumb);
            _onAnimEditComplete = null;
        }
        _editingForDrill = false;
        const doneBtn = document.getElementById('animBtnDoneForDrill');
        if (doneBtn) doneBtn.style.display = 'none';
    };

    if (!_currentAnimationId) {
        // Auto-save before completing
        saveAnimation().then(finish);
    } else {
        saveAnimation().then(finish);
    }
}
