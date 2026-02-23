/**
 * Drill Builder Canvas Engine - Enhanced with Orientation & Resizing
 */

// Default Dimensions (Landscape Full)
const MAX_W = 860;
const MAX_H = 460;
const PAD = 28;
const PLACE = ['player', 'goalkeeper', 'cone', 'ball', 'goalpost', 'flag', 'number'];

function initCanvas(id, canvases) {
    const canvas = document.getElementById('dc-' + id);
    if (!canvas) return;

    // Default: Landscape Full
    canvas.width = MAX_W;
    canvas.height = MAX_H;

    const s = {
        canvas, ctx: canvas.getContext('2d'),
        tool: 'pencil', pitchType: 'full', orientation: 'landscape',
        width: MAX_W, height: MAX_H,
        isDrawing: false, sx: 0, sy: 0,
        snapshot: null, history: [],
        tokens: [], dragging: null, rotating: null, resizing: null, hovered: null,
        selColor: '#e53935', drawColor: '#ffffff',
        lineWidth: 4, pCount: 1, nCount: 1,
        cPhase: 0, cPts: [], overlayAlpha: 0.22,
        drawLayer: null
    };

    const dl = document.createElement('canvas');
    dl.width = MAX_W; dl.height = MAX_H;
    s.drawLayer = dl;
    s.dlCtx = dl.getContext('2d');

    let savedPaths = [];
    if (canvases && canvases[id] && canvases[id].paths) {
        savedPaths = canvases[id].paths;
    }
    s.paths = savedPaths;

    // Check if we are restoring state
    if (canvases[id] && canvases[id].orientation) {
        s.orientation = canvases[id].orientation;
        if (canvases[id].pitchType) s.pitchType = canvases[id].pitchType;
        updateCanvasDimensions(s);
    }

    canvases[id] = s;

    canvas.addEventListener('mousedown', e => onDown(id, e, canvases));
    canvas.addEventListener('mousemove', e => onMove(id, e, canvases));
    canvas.addEventListener('mouseup', () => onUp(id, canvases));
    canvas.addEventListener('mouseleave', () => { const s = canvases[id]; if (s && !s.dragging) s.isDrawing = false; });

    const synE = t => ({ clientX: t.clientX, clientY: t.clientY });
    canvas.addEventListener('touchstart', e => { e.preventDefault(); onDown(id, synE(e.touches[0]), canvases); }, { passive: false });
    canvas.addEventListener('touchmove', e => { e.preventDefault(); onMove(id, synE(e.touches[0]), canvases); }, { passive: false });
    canvas.addEventListener('touchend', e => { e.preventDefault(); onUp(id, canvases); }, { passive: false });

    updateCanvasDimensions(s);
    drawAll(id, canvases);
}

function updateCanvasDimensions(s) {
    const isPort = s.orientation === 'portrait';
    const pt = s.pitchType;

    if (isPort) {
        if (pt === 'half') { s.width = 460; s.height = 430; }
        else if (pt === 'third') { s.width = 460; s.height = 286; }
        else { s.width = 460; s.height = 860; }
    } else {
        if (pt === 'half') { s.width = 430; s.height = 460; }
        else if (pt === 'third') { s.width = 286; s.height = 460; }
        else { s.width = 860; s.height = 460; }
    }

    if (s.canvas.width !== s.width || s.canvas.height !== s.height) {
        s.canvas.width = s.width;
        s.canvas.height = s.height;
        s.drawLayer.width = s.width;
        s.drawLayer.height = s.height;
    }
}

function drawAll(id, canvases) {
    const s = canvases[id]; if (!s) return;
    updateCanvasDimensions(s);
    drawPitch(s);

    s.dlCtx.clearRect(0, 0, s.width, s.height);
    s.paths.forEach(p => drawPath(s.dlCtx, p));

    if ((s.isDrawing || (s.tool === 'curved' && s.cPhase > 0)) && s.currentPath) {
        drawPath(s.dlCtx, s.currentPath);
    }

    s.ctx.drawImage(s.drawLayer, 0, 0);
    drawTokens(id, canvases);
}

function drawPath(ctx, p) {
    ctx.save();
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.width || 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (p.type === 'pencil') {
        if (p.points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(p.points[0].x, p.points[0].y);
        for (let i = 1; i < p.points.length; i++) {
            ctx.lineTo(p.points[i].x, p.points[i].y);
        }
        ctx.stroke();
    } else if (p.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(p.x1, p.y1);
        ctx.lineTo(p.x2, p.y2);
        ctx.stroke();
    } else if (p.type === 'arrow') {
        const hL = Math.max(12, ctx.lineWidth * 3);
        const ang = Math.atan2(p.y2 - p.y1, p.x2 - p.x1);
        ctx.beginPath();
        ctx.moveTo(p.x1, p.y1);
        ctx.lineTo(p.x2, p.y2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x2, p.y2);
        ctx.lineTo(p.x2 - hL * Math.cos(ang - Math.PI / 6), p.y2 - hL * Math.sin(ang - Math.PI / 6));
        ctx.moveTo(p.x2, p.y2);
        ctx.lineTo(p.x2 - hL * Math.cos(ang + Math.PI / 6), p.y2 - hL * Math.sin(ang + Math.PI / 6));
        ctx.stroke();
    } else if (p.type === 'dashed') { // Dashed Arrow
        const hL = Math.max(12, ctx.lineWidth * 3);
        const ang = Math.atan2(p.y2 - p.y1, p.x2 - p.x1);
        ctx.setLineDash([10, 6]);
        ctx.beginPath();
        ctx.moveTo(p.x1, p.y1);
        ctx.lineTo(p.x2, p.y2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(p.x2, p.y2);
        ctx.lineTo(p.x2 - hL * Math.cos(ang - Math.PI / 6), p.y2 - hL * Math.sin(ang - Math.PI / 6));
        ctx.moveTo(p.x2, p.y2);
        ctx.lineTo(p.x2 - hL * Math.cos(ang + Math.PI / 6), p.y2 - hL * Math.sin(ang + Math.PI / 6));
        ctx.stroke();
    } else if (p.type === 'dashed-line') { // Simple Dashed Line
        ctx.setLineDash([10, 6]);
        ctx.beginPath();
        ctx.moveTo(p.x1, p.y1);
        ctx.lineTo(p.x2, p.y2);
        ctx.stroke();
        ctx.setLineDash([]);
    } else if (p.type === 'rect') {
        if (p.filled) {
            ctx.fillStyle = toRGBA(p.color, 0.22);
            ctx.fillRect(p.x1, p.y1, p.x2 - p.x1, p.y2 - p.y1);
        }
        ctx.strokeRect(p.x1, p.y1, p.x2 - p.x1, p.y2 - p.y1);
    } else if (p.type === 'circle') {
        const cx = (p.x1 + p.x2) / 2, cy = (p.y1 + p.y2) / 2;
        const rx = Math.abs(p.x2 - p.x1) / 2, ry = Math.abs(p.y2 - p.y1) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (p.filled) {
            ctx.fillStyle = toRGBA(p.color, 0.22);
            ctx.fill();
        }
        ctx.stroke();
    } else if (p.type === 'tri') {
        const tx = (p.x1 + p.x2) / 2;
        ctx.beginPath();
        ctx.moveTo(tx, p.y1);
        ctx.lineTo(p.x2, p.y2);
        ctx.lineTo(p.x1, p.y2);
        ctx.closePath();
        if (p.filled) {
            ctx.fillStyle = toRGBA(p.color, 0.22);
            ctx.fill();
        }
        ctx.stroke();
    } else if (p.type === 'zone') {
        ctx.setLineDash([9, 5]);
        ctx.fillStyle = toRGBA(p.color, 0.11);
        ctx.beginPath();
        ctx.rect(p.x1, p.y1, p.x2 - p.x1, p.y2 - p.y1);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
    } else if (p.type === 'curved') {
        const hL = Math.max(12, ctx.lineWidth * 3);
        if (p.points && p.points.length === 3) {
            const [p0, p2, cp] = p.points;
            const ang = Math.atan2(p2.y - cp.y, p2.x - cp.x);
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(p2.x, p2.y);
            ctx.lineTo(p2.x - hL * Math.cos(ang - Math.PI / 6), p2.y - hL * Math.sin(ang - Math.PI / 6));
            ctx.moveTo(p2.x, p2.y);
            ctx.lineTo(p2.x - hL * Math.cos(ang + Math.PI / 6), p2.y - hL * Math.sin(ang + Math.PI / 6));
            ctx.stroke();
        } else if (p.points && p.points.length === 2) { // Preview
            const [p0, p1] = p.points;
            ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        }
    }
    ctx.restore();
}

function onDown(id, e, canvases) {
    const s = canvases[id]; if (!s) return;
    const { x, y } = gPos(id, e, canvases);

    // Curved Tool
    if (s.tool === 'curved') {
        if (s.cPhase === 0) { s.cPts = [{ x, y }]; s.cPhase = 1; }
        else if (s.cPhase === 1) { s.cPts.push({ x, y }); s.cPhase = 2; }
        else if (s.cPhase === 2) {
            const p0 = s.cPts[0];
            const p2 = s.cPts[1];
            const cp = { x, y };
            saveH(id, canvases);
            s.paths.push({ type: 'curved', points: [p0, p2, cp], color: s.drawColor, width: s.lineWidth });
            s.cPhase = 0; s.cPts = []; s.currentPath = null;
            drawAll(id, canvases);
        }
        return;
    }

    if (s.tool === 'move') {
        const tok = findTok(s, x, y);
        if (tok) {
            const dx = x - tok.x, dy = y - tok.y;
            const cos = Math.cos(-(tok.rot || 0)), sin = Math.sin(-(tok.rot || 0));
            const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
            if (Math.hypot(lx, ly + 42) < 16) { s.rotating = tok; return; }
            if (Math.hypot(lx - 25, ly - 25) < 16) { s.resizing = tok; s.rBase = Math.hypot(lx, ly); s.sBase = tok.scale || 1; return; }
            saveH(id, canvases);
            s.dragging = tok; s.dx = x - tok.x; s.dy = y - tok.y;
        }
        return;
    }

    if (PLACE.includes(s.tool)) { saveH(id, canvases); placeTok(id, x, y, canvases); return; }

    saveH(id, canvases);
    s.isDrawing = true; s.sx = x; s.sy = y;
    const common = { color: s.drawColor, width: s.lineWidth };
    if (s.tool === 'pencil') {
        s.currentPath = { type: 'pencil', points: [{ x, y }], ...common };
    } else if (['rect', 'rect-fill', 'circle', 'circle-fill', 'tri', 'tri-fill', 'zone', 'line', 'arrow', 'dashed', 'dashed-line'].includes(s.tool)) {
        const type = s.tool.replace('-fill', '');
        s.currentPath = { type, x1: x, y1: y, x2: x, y2: y, filled: s.tool.includes('-fill') || s.tool === 'zone', ...common };
    } else if (s.tool === 'eraser') {
        const hitIdx = s.paths.findIndex(p => pathHitTest(p, x, y, 10));
        if (hitIdx >= 0) s.paths.splice(hitIdx, 1);
        else {
            const tok = findTok(s, x, y);
            if (tok) s.tokens = s.tokens.filter(t => t.id !== tok.id);
        }
        s.isDrawing = true;
    }
}

function onMove(id, e, canvases) {
    const s = canvases[id]; if (!s) return;
    const { x, y } = gPos(id, e, canvases);
    s.hovered = findTok(s, x, y);

    if (s.rotating) { s.rotating.rot = Math.atan2(y - s.rotating.y, x - s.rotating.x) + Math.PI / 2; drawAll(id, canvases); return; }
    if (s.resizing) { const dx = x - s.resizing.x, dy = y - s.resizing.y; s.resizing.scale = (Math.hypot(dx, dy) / s.rBase) * s.sBase; drawAll(id, canvases); return; }
    if (s.dragging) { s.dragging.x = x - s.dx; s.dragging.y = y - s.dy; drawAll(id, canvases); return; }

    // Curved Preview
    if (s.tool === 'curved' && s.cPhase > 0) {
        const common = { color: s.drawColor, width: s.lineWidth };
        if (s.cPhase === 1) {
            s.currentPath = { type: 'line', x1: s.cPts[0].x, y1: s.cPts[0].y, x2: x, y2: y, ...common };
        } else if (s.cPhase === 2) {
            s.currentPath = { type: 'curved', points: [s.cPts[0], s.cPts[1], { x, y }], ...common };
        }
        drawAll(id, canvases);
        return;
    }

    if (!s.isDrawing || !s.currentPath) { s.canvas.style.cursor = s.hovered ? 'grab' : 'default'; return; }

    if (s.tool === 'pencil') s.currentPath.points.push({ x, y });
    else if (s.tool === 'eraser') {
        const hitIdx = s.paths.findIndex(p => pathHitTest(p, x, y, 10));
        if (hitIdx >= 0) s.paths.splice(hitIdx, 1);
        else {
            const tok = findTok(s, x, y);
            if (tok) s.tokens = s.tokens.filter(t => t.id !== tok.id);
        }
    } else { s.currentPath.x2 = x; s.currentPath.y2 = y; }
    drawAll(id, canvases);
}

function onUp(id, canvases) {
    const s = canvases[id]; if (!s) return;
    if (s.isDrawing && s.currentPath) {
        if (s.tool !== 'eraser' && s.tool !== 'curved') s.paths.push(s.currentPath);
        s.currentPath = null;
    }
    s.isDrawing = false; s.dragging = null; s.rotating = null; s.resizing = null;
    drawAll(id, canvases);
    if (window.triggerAutosave) window.triggerAutosave();
}

function saveH(id, canvases) {
    const s = canvases[id];
    s.history.push({ paths: JSON.parse(JSON.stringify(s.paths)), tok: JSON.parse(JSON.stringify(s.tokens)), pc: s.pCount, nc: s.nCount, orientation: s.orientation });
    if (s.history.length > 40) s.history.shift();
}
function mUndo(id, canvases) {
    const s = canvases[id]; if (!s.history.length) return;
    const p = s.history.pop();
    s.paths = p.paths; s.tokens = p.tok; s.pCount = p.pc; s.nCount = p.nc;
    if (p.orientation && p.orientation !== s.orientation) s.orientation = p.orientation;
    drawAll(id, canvases);
    if (window.triggerAutosave) window.triggerAutosave();
}
function mClear(id, canvases) {
    const s = canvases[id]; saveH(id, canvases); s.paths = []; s.tokens = []; s.pCount = 1; s.nCount = 1; drawAll(id, canvases);
    if (window.triggerAutosave) window.triggerAutosave();
}

function pathHitTest(p, x, y, tol) {
    if (p.type === 'pencil') return p.points.some(pt => Math.hypot(pt.x - x, pt.y - y) < tol);
    if (p.type === 'curved' && p.points && p.points.length === 3) {
        return p.points.some(pt => Math.hypot(pt.x - x, pt.y - y) < tol * 2);
    }
    if (p.x1 !== undefined) {
        const minX = Math.min(p.x1, p.x2) - tol, maxX = Math.max(p.x1, p.x2) + tol;
        const minY = Math.min(p.y1, p.y2) - tol, maxY = Math.max(p.y1, p.y2) + tol;
        return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }
    return false;
}

function setMT(id, t, canvases) { const s = canvases[id]; s.tool = t; s.cPhase = 0; s.cPts = []; s.hovered = null; document.querySelectorAll(`[id^="mt-${id}-"]`).forEach(b => b.classList.remove('active')); const btn = document.getElementById(`mt-${id}-${t}`); if (btn) btn.classList.add('active'); const cm = { eraser: 'cell', move: 'default', player: 'copy', goalkeeper: 'copy', cone: 'copy', ball: 'copy', goal: 'copy', goalnet: 'copy', flag: 'copy', number: 'copy', text: 'text' }; s.canvas.style.cursor = cm[t] || 'crosshair'; }
function setMC(id, el, canvases) { document.querySelectorAll(`#dcw-${id} .mt-swatch`).forEach(s => s.classList.remove('active')); el.classList.add('active'); canvases[id].selColor = el.dataset.color; if (canvases[id].hovered) { canvases[id].hovered.color = canvases[id].selColor; drawAll(id, canvases); } }
function setMDC(id, v, canvases) { canvases[id].drawColor = v; }
function setMW(id, v, canvases) { canvases[id].lineWidth = v; }

function setPT(id, type, canvases) {
    const s = canvases[id];
    s.pitchType = type;
    document.querySelectorAll(`#pb-${id} .pitch-btn`).forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`#pb-${id} [data-pt="${type}"]`);
    if (btn) btn.classList.add('active');
    drawAll(id, canvases);
    if (window.triggerAutosave) window.triggerAutosave();
}

function toggleOrientation(id, canvases) {
    const s = canvases[id];
    const oldOr = s.orientation || 'landscape';
    const newOr = oldOr === 'landscape' ? 'portrait' : 'landscape';
    s.orientation = newOr;
    rotateCanvasContent(s, oldOr, newOr);
    const btn = document.getElementById(`btn-orient-${id}`);
    if (btn) {
        if (newOr === 'portrait') {
            btn.classList.add('active');
            btn.innerHTML = `<i class="fas fa-arrows-alt-v"></i> Portrait`;
        } else {
            btn.classList.remove('active');
            btn.innerHTML = `<i class="fas fa-arrows-alt-h"></i> Landscape`;
        }
    }
    drawAll(id, canvases);
    if (window.triggerAutosave) window.triggerAutosave();
}

function rotateCanvasContent(s, oldOr, newOr) {
    const oldW = (oldOr === 'landscape') ? 860 : 460;
    const oldH = (oldOr === 'landscape') ? 460 : 860;
    const transform = (x, y) => {
        if (oldOr === 'landscape' && newOr === 'portrait') return { x: y, y: oldW - x };
        else return { x: oldH - y, y: x };
    };
    s.tokens.forEach(t => {
        const p = transform(t.x, t.y); t.x = p.x; t.y = p.y;
        t.rot = (t.rot || 0) + (newOr === 'portrait' ? -Math.PI / 2 : Math.PI / 2);
    });
    s.paths.forEach(p => {
        if (p.type === 'pencil' || p.type === 'curved') {
            if (p.points) p.points.forEach(pt => { const n = transform(pt.x, pt.y); pt.x = n.x; pt.y = n.y; });
        }
        if (p.x1 !== undefined) {
            const p1 = transform(p.x1, p.y1);
            const p2 = transform(p.x2, p.y2);
            p.x1 = p1.x; p.y1 = p1.y; p.x2 = p2.x; p.y2 = p2.y;
        }
    });
}

function drawPitch(s) {
    const c = s.ctx;
    const W = s.width;
    const H = s.height;
    const pt = s.pitchType;
    const isPort = s.orientation === 'portrait';

    if (pt === 'blank') { c.fillStyle = '#1a4a2a'; c.fillRect(0, 0, W, H); return; }

    const FullW = isPort ? 460 : 860;
    const FullH = isPort ? 860 : 460;

    c.fillStyle = '#1e5c30'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#1a5228';
    if (isPort) {
        const sh = FullH / 10;
        for (let i = 0; i * sh < H; i += 2) c.fillRect(0, i * sh, W, sh);
    } else {
        const sw = FullW / 10;
        for (let i = 0; i * sw < W; i += 2) c.fillRect(i * sw, 0, sw, H);
    }

    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2; c.lineCap = 'square'; c.lineJoin = 'miter';

    const fx = PAD, fy = PAD;
    const fw = W - 2 * PAD;
    const fh = H - 2 * PAD;

    if (isPort) {
        const refW = FullW - 2 * PAD;
        const refH = FullH - 2 * PAD;
        if (pt === 'full') pFullVert(c, fx, fy, refW, refH);
        else if (pt === 'half') pHalfVert(c, fx, fy, refW, refH);
        else if (pt === 'third') pThirdVert(c, fx, fy, refW, refH);
        else if (pt === 'smallsided') pSmallVert(c, fx, fy, fw, fh);
        else if (pt === 'outline') { c.strokeRect(fx, fy, fw, fh); pCorners(c, fx, fy, fw, fh); }
        else if (pt === 'halves') { c.strokeRect(fx, fy, fw, fh); pLine(c, fx, fy + fh / 2, fx + fw, fy + fh / 2); pDot(c, fx + fw / 2, fy + fh / 2, 4); pCorners(c, fx, fy, fw, fh); }
        else if (pt === 'thirds') { c.strokeRect(fx, fy, fw, fh); pLine(c, fx, fy + fh / 3, fx + fw, fy + fh / 3); pLine(c, fx, fy + fh * 2 / 3, fx + fw, fy + fh * 2 / 3); pCorners(c, fx, fy, fw, fh); }
    } else {
        const refW = FullW - 2 * PAD;
        const refH = FullH - 2 * PAD;
        if (pt === 'full') pFull(c, fx, fy, refW, refH);
        else if (pt === 'half') pHalf(c, fx, fy, refW, refH);
        else if (pt === 'third') pThird(c, fx, fy, refW, refH);
        else if (pt === 'smallsided') pSmall(c, fx, fy, fw, fh);
        else if (pt === 'outline') { c.strokeRect(fx, fy, fw, fh); pCorners(c, fx, fy, fw, fh); }
        else if (pt === 'halves') { c.strokeRect(fx, fy, fw, fh); pLine(c, fx + fw / 2, fy, fx + fw / 2, fy + fh); pDot(c, fx + fw / 2, fy + fh / 2, 4); pCorners(c, fx, fy, fw, fh); }
        else if (pt === 'thirds') { c.strokeRect(fx, fy, fw, fh); pLine(c, fx + fw / 3, fy, fx + fw / 3, fy + fh); pLine(c, fx + fw * 2 / 3, fy, fx + fw * 2 / 3, fy + fh); pCorners(c, fx, fy, fw, fh); }
    }
}

function pLine(c, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
function pDot(c, x, y, r) { c.save(); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = 'white'; c.fill(); c.restore(); }
function pCA(c, x, y, startAng, endAng) { c.save(); c.beginPath(); c.arc(x, y, 11, startAng, endAng); c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2; c.stroke(); c.restore(); }
function pCorners(c, fx, fy, fw, fh) {
    pCA(c, fx, fy, 0, Math.PI / 2);
    pCA(c, fx + fw, fy, Math.PI / 2, Math.PI);
    pCA(c, fx + fw, fy + fh, Math.PI, 1.5 * Math.PI);
    pCA(c, fx, fy + fh, 1.5 * Math.PI, 2 * Math.PI);
}

function pFullVert(c, fx, fy, fw, fh) {
    const mx = fx + fw / 2;
    const my = fy + fh / 2;
    c.strokeRect(fx, fy, fw, fh);
    pLine(c, fx, my, fx + fw, my);
    pDot(c, mx, my, 4);
    c.beginPath(); c.arc(mx, my, fw * 0.175, 0, Math.PI * 2); c.stroke();

    const pbH = fh * 0.138, pbW = fw * 0.44;
    const gbH = fh * 0.053, gbW = fw * 0.22;
    const gW = fw * 0.21;

    c.strokeRect(mx - pbW / 2, fy, pbW, pbH); c.strokeRect(mx - gbW / 2, fy, gbW, gbH);
    c.strokeRect(mx - gW / 2, fy - 10, gW, 10);
    const tS = fy + pbH * 0.72; pDot(c, mx, tS, 3);
    c.save(); c.beginPath(); c.rect(fx, fy + pbH, fw, fh); c.clip(); c.beginPath(); c.arc(mx, tS, fw * 0.175, 0, Math.PI); c.stroke(); c.restore();

    c.strokeRect(mx - pbW / 2, fy + fh - pbH, pbW, pbH); c.strokeRect(mx - gbW / 2, fy + fh - gbH, gbW, gbH);
    c.strokeRect(mx - gW / 2, fy + fh, gW, 10);
    const bS = fy + fh - pbH * 0.72; pDot(c, mx, bS, 3);
    c.save(); c.beginPath(); c.rect(fx, fy, fw, fh - pbH); c.clip(); c.beginPath(); c.arc(mx, bS, fw * 0.175, Math.PI, 0); c.stroke(); c.restore();

    pCorners(c, fx, fy, fw, fh);
}

function pHalfVert(c, fx, fy, fw, fh) {
    c.strokeRect(fx, fy, fw, fh / 2);
    const mx = fx + fw / 2;
    pDot(c, mx, fy, 4);
    c.save(); c.beginPath(); c.rect(fx, fy, fw, fh / 2); c.clip();
    c.beginPath(); c.arc(mx, fy, fw * 0.175, 0, Math.PI * 2); c.stroke(); c.restore();
    const pbH = fh * 0.138, pbW = fw * 0.44;
    const gbH = fh * 0.053, gbW = fw * 0.22;
    const gW = fw * 0.21;
    const bottomY = fy + fh / 2;
    c.strokeRect(mx - pbW / 2, bottomY - pbH, pbW, pbH);
    c.strokeRect(mx - gbW / 2, bottomY - gbH, gbW, gbH);
    c.strokeRect(mx - gW / 2, bottomY, gW, 10);
    const bS = bottomY - pbH * 0.72;
    pDot(c, mx, bS, 3);
    c.save(); c.beginPath(); c.rect(fx, fy, fw, fh / 2 - pbH); c.clip();
    c.beginPath(); c.arc(mx, bS, fw * 0.175, Math.PI, 0); c.stroke(); c.restore();
    pCA(c, fx + fw, bottomY, Math.PI, 1.5 * Math.PI);
    pCA(c, fx, bottomY, 1.5 * Math.PI, 2 * Math.PI);
}

function pThirdVert(c, fx, fy, fw, fh) {
    const h = fh / 3;
    const mx = fx + fw / 2;
    const bottomY = fy + h;
    c.strokeRect(fx, fy, fw, h);
    const pbH = fh * 0.138, pbW = fw * 0.44;
    const gbH = fh * 0.053, gbW = fw * 0.22;
    const gW = fw * 0.21;
    c.strokeRect(mx - pbW / 2, bottomY - pbH, pbW, pbH);
    c.strokeRect(mx - gbW / 2, bottomY - gbH, gbW, gbH);
    c.strokeRect(mx - gW / 2, bottomY, gW, 10);
    const bS = bottomY - pbH * 0.72;
    pDot(c, mx, bS, 3);
    c.save(); c.beginPath(); c.rect(fx, fy, fw, h - pbH); c.clip();
    c.beginPath(); c.arc(mx, bS, fw * 0.175, Math.PI, 0); c.stroke(); c.restore();
    pCA(c, fx + fw, bottomY, Math.PI, 1.5 * Math.PI);
    pCA(c, fx, bottomY, 1.5 * Math.PI, 2 * Math.PI);
}

function pSmallVert(c, fx, fy, fw, fh) {
    const mx = fx + fw / 2, my = fy + fh / 2;
    const ssW = fw * 0.8, ssH = fh * 0.8;
    const sx = mx - ssW / 2, sy = my - ssH / 2;
    c.strokeRect(sx, sy, ssW, ssH);
    pLine(c, sx, my, sx + ssW, my);
    pDot(c, mx, my, 4);
    const gbW = ssW * 0.38, gbH = ssH * 0.10;
    const gW = 16;
    c.strokeRect(mx - gbW / 2, sy, gbW, gbH);
    c.strokeRect(mx - gW / 2, sy - 8, gW, 8);
    c.strokeRect(mx - gbW / 2, sy + ssH - gbH, gbW, gbH);
    c.strokeRect(mx - gW / 2, sy + ssH, gW, 8);
    pCorners(c, sx, sy, ssW, ssH);
}

function pFull(c, fx, fy, fw, fh) {
    const mx = fx + fw / 2, my = fy + fh / 2;
    c.strokeRect(fx, fy, fw, fh); pLine(c, mx, fy, mx, fy + fh); pDot(c, mx, my, 4);
    c.beginPath(); c.arc(mx, my, fh * 0.175, 0, Math.PI * 2); c.stroke();
    const pbW = fw * 0.138, pbH = fh * 0.44, gbW = fw * 0.053, gbH = fh * 0.22;
    c.strokeRect(fx, my - pbH / 2, pbW, pbH); c.strokeRect(fx, my - gbH / 2, gbW, gbH); c.strokeRect(fx - 10, my - fh * 0.105, 10, fh * 0.21);
    const lS = fx + pbW * 0.72; pDot(c, lS, my, 3);
    c.save(); c.beginPath(); c.rect(fx + pbW, fy, fw, fh); c.clip(); c.beginPath(); c.arc(lS, my, fh * 0.175, -Math.PI * 0.36, Math.PI * 0.36); c.stroke(); c.restore();
    c.strokeRect(fx + fw - pbW, my - pbH / 2, pbW, pbH); c.strokeRect(fx + fw - gbW, my - gbH / 2, gbW, gbH); c.strokeRect(fx + fw, my - fh * 0.105, 10, fh * 0.21);
    const rS = fx + fw - pbW * 0.72; pDot(c, rS, my, 3);
    c.save(); c.beginPath(); c.rect(fx, fy, fw - pbW, fh); c.clip(); c.beginPath(); c.arc(rS, my, fh * 0.175, Math.PI * 0.64, Math.PI * 1.36); c.stroke(); c.restore();
    pCorners(c, fx, fy, fw, fh);
}

function pHalf(c, fx, fy, fw, fh) {
    const w = fw / 2;
    c.strokeRect(fx, fy, w, fh);
    const mx = fx + w;
    const my = fy + fh / 2;
    pDot(c, mx, my, 4);
    const pbW = fw * 0.138, pbH = fh * 0.44, gbW = fw * 0.053, gbH = fh * 0.22;
    c.strokeRect(fx, my - pbH / 2, pbW, pbH); c.strokeRect(fx, my - gbH / 2, gbW, gbH); c.strokeRect(fx - 10, my - fh * 0.105, 10, fh * 0.21);
    const lS = fx + pbW * 0.72; pDot(c, lS, my, 3);
    c.save(); c.beginPath(); c.rect(fx + pbW, fy, w, fh); c.clip(); c.beginPath(); c.arc(lS, my, fh * 0.175, -Math.PI * 0.36, Math.PI * 0.36); c.stroke(); c.restore();
    c.save(); c.beginPath(); c.rect(fx, fy, w, fh); c.clip(); c.beginPath(); c.arc(mx, my, fh * 0.175, 0, Math.PI * 2); c.stroke(); c.restore();
    pCA(c, fx, fy, 0, Math.PI / 2);
    pCA(c, fx, fy + fh, 1.5 * Math.PI, 2 * Math.PI);
}

function pThird(c, fx, fy, fw, fh) {
    const w = fw / 3;
    c.strokeRect(fx, fy, w, fh);
    const pbW = fw * 0.138, pbH = fh * 0.44, gbW = fw * 0.053, gbH = fh * 0.22;
    const my = fy + fh / 2;
    c.strokeRect(fx, my - pbH / 2, pbW, pbH); c.strokeRect(fx, my - gbH / 2, gbW, gbH); c.strokeRect(fx - 10, my - fh * 0.105, 10, fh * 0.21);
    const lS = fx + pbW * 0.72; pDot(c, lS, my, 3);
    c.save(); c.beginPath(); c.rect(fx + pbW, fy, w, fh); c.clip(); c.beginPath(); c.arc(lS, my, fh * 0.175, -Math.PI * 0.36, Math.PI * 0.36); c.stroke(); c.restore();
    pCA(c, fx, fy, 0, Math.PI / 2);
    pCA(c, fx, fy + fh, 1.5 * Math.PI, 2 * Math.PI);
}

function pSmall(c, fx, fy, fw, fh) {
    const mx = fx + fw / 2, my = fy + fh / 2;
    const ssW = fw * 0.72, ssH = fh * 0.78;
    const sx = mx - ssW / 2, sy = my - ssH / 2;
    c.strokeRect(sx, sy, ssW, ssH); pLine(c, mx, sy, mx, sy + ssH); pDot(c, mx, my, 4);
    const gbW = ssW * 0.10, gbH = ssH * 0.38, gW = 16, gH = ssH * 0.22;
    c.strokeRect(sx, my - gbH / 2, gbW, gbH); c.strokeRect(sx - gW, my - gH / 2, gW, gH);
    c.strokeRect(sx + ssW - gbW, my - gbH / 2, gbW, gbH); c.strokeRect(sx + ssW, my - gH / 2, gW, gH);
    pCorners(c, sx, sy, ssW, ssH);
}

function drawTokens(id, canvases) { canvases[id].tokens.forEach(t => renderTok(canvases[id], t)); }
function isLight(hex) { const c = hex.replace('#', ''); return (parseInt(c.substr(0, 2), 16) * 299 + parseInt(c.substr(2, 2), 16) * 587 + parseInt(c.substr(4, 2), 16) * 114) / 1000 > 155; }

function renderTok(s, t) {
    const c = s.ctx; c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.translate(t.x, t.y);
    c.rotate(t.rot || 0);
    const sc = t.scale || 1;
    c.scale(sc, sc);

    if (t === s.hovered && s.tool === 'move') {
        c.beginPath(); c.arc(0, 0, 22 / sc, 0, Math.PI * 2);
        c.strokeStyle = 'rgba(74,144,217,0.7)'; c.lineWidth = 2 / sc; c.setLineDash([4 / sc, 3 / sc]); c.stroke(); c.setLineDash([]);
        c.beginPath(); c.moveTo(0, -22 / sc); c.lineTo(0, -42 / sc); c.stroke();
        c.beginPath(); c.arc(0, -42 / sc, 6 / sc, 0, Math.PI * 2); c.fillStyle = '#4a90d9'; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.5 / sc; c.stroke();
        c.beginPath(); c.rect(20 / sc, 20 / sc, 10 / sc, 10 / sc); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = '#4a90d9'; c.lineWidth = 1.5 / sc; c.stroke();
    }

    if (t.type === 'player' || t.type === 'goalkeeper') {
        c.beginPath(); c.arc(2, 2, 16, 0, Math.PI * 2); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
        c.beginPath(); c.arc(0, 0, 16, 0, Math.PI * 2); c.fillStyle = t.color; c.fill();
        const lt = isLight(t.color); c.strokeStyle = lt ? '#333' : 'white'; c.lineWidth = 2; c.stroke();
        c.font = t.type === 'goalkeeper' ? 'bold 9px Inter,sans-serif' : 'bold 12px Inter,sans-serif';
        c.fillStyle = lt ? '#222' : 'white'; c.fillText(t.type === 'goalkeeper' ? 'GK' : t.label, 0, 0);
    } else if (t.type === 'cone') {
        c.beginPath(); c.moveTo(0, -13); c.lineTo(10, 9); c.lineTo(-10, 9); c.closePath();
        c.fillStyle = t.color || '#ff6d00'; c.fill(); c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1; c.stroke();
        c.beginPath(); c.moveTo(-6, 1); c.lineTo(6, 1); c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 2; c.stroke();
    } else if (t.type === 'ball') {
        const r = 11; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = '#333'; c.lineWidth = 1.5; c.stroke(); c.fillStyle = '#333';
        const drawPent = (px, py, pr, pa) => { c.beginPath(); for (let i = 0; i < 5; i++) { const ang = pa + i * (Math.PI * 2 / 5); const x = px + Math.cos(ang) * pr, y = py + Math.sin(ang) * pr; if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); } c.closePath(); c.fill(); };
        drawPent(0, 0, 4, -Math.PI / 2); for (let i = 0; i < 5; i++) { const ang = i * (Math.PI * 2 / 5) - Math.PI / 2; drawPent(Math.cos(ang) * 8, Math.sin(ang) * 8, 2.5, ang + Math.PI); }
        c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
    } else if (t.type === 'goalpost') {
        const gw = 90, gd = 34, pr = 4;
        c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(-gw / 2, -pr, gw, gd);
        c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 0.8;
        for (let i = 1; i < 8; i++) { const nx = -gw / 2 + i * (gw / 8); c.beginPath(); c.moveTo(nx, 0); c.lineTo(nx, gd); c.stroke(); }
        for (let i = 1; i <= 4; i++) { c.beginPath(); c.moveTo(-gw / 2, i * (gd / 4)); c.lineTo(gw / 2, i * (gd / 4)); c.stroke(); }
        c.strokeStyle = 'rgba(200,200,200,0.6)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(-gw / 2, gd); c.lineTo(gw / 2, gd); c.stroke(); c.beginPath(); c.moveTo(-gw / 2, 0); c.lineTo(-gw / 2, gd); c.stroke(); c.beginPath(); c.moveTo(gw / 2, 0); c.lineTo(gw / 2, gd); c.stroke();
        c.strokeStyle = '#fff'; c.lineWidth = 3; c.strokeRect(-gw / 2 - pr, -pr, gw + pr * 2, pr * 2);
        c.fillStyle = '#fff';[[-gw / 2, 0], [gw / 2, 0]].forEach(([px, py]) => { c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.fill(); });
    }
    else if (t.type === 'flag') {
        c.strokeStyle = '#e0e0e0'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 16); c.lineTo(0, -14); c.stroke();
        c.beginPath(); c.moveTo(0, -14); c.lineTo(14, -7); c.lineTo(0, 0); c.closePath(); c.fillStyle = t.color || '#fdd835'; c.fill();
    } else if (t.type === 'number') {
        c.font = `bold 18px Inter,sans-serif`;
        c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 3; c.strokeText(t.label, 0, 0); c.fillStyle = t.color || '#ffffff'; c.fillText(t.label, 0, 0);
    }
    c.restore();
}

function toRGBA(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function gPos(id, e, canvases) {
    const s = canvases[id];
    const r = s.canvas.getBoundingClientRect();
    let cx, cy;
    if (e.touches && e.touches.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
    else { cx = e.clientX; cy = e.clientY; }
    return { x: (cx - r.left) * (s.width / r.width), y: (cy - r.top) * (s.height / r.height) };
}

function findTok(s, x, y) {
    const rad = s.tool === 'move' ? 60 : 25;
    for (let i = s.tokens.length - 1; i >= 0; i--) {
        const t = s.tokens[i];
        if (Math.hypot(t.x - x, t.y - y) < rad * (t.scale || 1)) return t;
    }
    return null;
}

function placeTok(id, x, y, canvases) {
    const s = canvases[id]; if (!s) return;
    let label = '';
    if (s.tool === 'player') label = s.pCount++;
    if (s.tool === 'number') label = s.nCount++;
    const tok = {
        type: s.tool, x, y,
        color: s.selColor, label,
        rot: 0, scale: 1
    };
    s.tokens.push(tok);
    drawAll(id, canvases);
    if (window.triggerAutosave) window.triggerAutosave();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initCanvas, mUndo, mClear, setMT, setMC, setMDC, setMW, setPT, toggleOrientation, drawAll };
}

window.initCanvas = initCanvas;
window.mUndo = mUndo;
window.mClear = mClear;
window.setMT = setMT;
window.setMC = setMC;
window.setMDC = setMDC;
window.setMW = setMW;
window.setPT = setPT;
window.toggleOrientation = toggleOrientation;
window.drawAll = drawAll;
