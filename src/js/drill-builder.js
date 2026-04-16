// ES Module - Drill Builder Canvas Engine
/**
 * Drill Builder Canvas Engine - Enhanced with Orientation & Resizing
 */

// Default Dimensions (Landscape Full) — enlarged for better drawing UX
const MAX_W = 1080;
const MAX_H = 578;
const PAD = 28;
const PLACE = ['player', 'goalkeeper', 'cone', 'ball', 'goalpost', 'flag', 'number', 'ladder', 'hurdle', 'mannequin', 'pole', 'minigoal', 'ring', 'rebounder'];

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
        tokens: [], dragging: null, rotating: null, hovered: null, selected: null,
        selColor: '#e53935', drawColor: '#ffffff',
        lineWidth: 4, pCount: 1, nCount: 1, tokenSize: 'medium',
        cPhase: 0, cPts: [], overlayAlpha: 0.22, _activeShape: null, _snapGuides: [],
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
    canvas.addEventListener('dblclick', e => onDblClick(id, e, canvases));
    canvas.addEventListener('mouseleave', () => { const s = canvases[id]; if (s && !s.dragging) s.isDrawing = false; });

    const synE = t => ({ clientX: t.clientX, clientY: t.clientY });
    canvas.addEventListener('touchstart', e => { e.preventDefault(); onDown(id, synE(e.touches[0]), canvases); }, { passive: false });
    canvas.addEventListener('touchmove', e => { e.preventDefault(); onMove(id, synE(e.touches[0]), canvases); }, { passive: false });
    canvas.addEventListener('touchend', e => { e.preventDefault(); onUp(id, canvases); }, { passive: false });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && canvases[id]) {
            const s = canvases[id];
            // Escape cancels any in-progress polygon (no auto-finalize)
            s.selected = null;
            s.cPhase = 0;
            s.cPts = [];
            s.currentPath = null;
            drawAll(id, canvases);
        }
    });

    updateCanvasDimensions(s);
    drawAll(id, canvases);
}

function updateCanvasDimensions(s) {
    const isPort = s.orientation === 'portrait';
    let w = isPort ? MAX_H : MAX_W;
    let h = isPort ? MAX_W : MAX_H;
    const pt = s.pitchType;
    if (pt === 'half') { if (isPort) h = Math.round(h * 0.535); else w = Math.round(w * 0.5); }
    else if (pt === 'third') { if (isPort) h = Math.round(h * 0.4); else w = Math.round(w * 0.333); }
    else if (pt === 'threequarter') { if (isPort) h = Math.round(h * 0.75); else w = Math.round(w * 0.75); }
    else if (pt === 'smallsided') { if (isPort) { w = Math.round(w * 0.78); h = Math.round(h * 0.72); } else { w = Math.round(w * 0.72); h = Math.round(h * 0.78); } }
    s.width = w;
    s.height = h;
    if (s.canvas.width !== w || s.canvas.height !== h) {
        s.canvas.width = w;
        s.canvas.height = h;
        s.drawLayer.width = w;
        s.drawLayer.height = h;
    }
}

function drawAll(id, canvases) {
    const s = canvases[id]; if (!s) return;
    updateCanvasDimensions(s);
    drawPitch(s);

    s.dlCtx.clearRect(0, 0, s.width, s.height);
    s.paths.forEach(p => drawPath(s.dlCtx, p));

    if ((s.isDrawing || ((s.tool === 'curved' || s.tool === 'polygon' || s.tool === 'polygon-fill') && s.cPhase > 0)) && s.currentPath) {
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
    } else if (p.type === 'biarrow') {
        const hL = Math.max(12, ctx.lineWidth * 3);
        const ang = Math.atan2(p.y2 - p.y1, p.x2 - p.x1);
        ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
        // End arrowhead
        ctx.beginPath();
        ctx.moveTo(p.x2, p.y2); ctx.lineTo(p.x2 - hL * Math.cos(ang - Math.PI / 6), p.y2 - hL * Math.sin(ang - Math.PI / 6));
        ctx.moveTo(p.x2, p.y2); ctx.lineTo(p.x2 - hL * Math.cos(ang + Math.PI / 6), p.y2 - hL * Math.sin(ang + Math.PI / 6));
        ctx.stroke();
        // Start arrowhead
        const angB = ang + Math.PI;
        ctx.beginPath();
        ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x1 - hL * Math.cos(angB - Math.PI / 6), p.y1 - hL * Math.sin(angB - Math.PI / 6));
        ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x1 - hL * Math.cos(angB + Math.PI / 6), p.y1 - hL * Math.sin(angB + Math.PI / 6));
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
    } else if (p.type === 'polygon') {
        if (p.points && p.points.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(p.points[0].x, p.points[0].y);
            for (let i = 1; i < p.points.length; i++) {
                ctx.lineTo(p.points[i].x, p.points[i].y);
            }
            ctx.closePath();
            if (p.filled) {
                ctx.fillStyle = toRGBA(p.color, 0.22);
                ctx.fill();
            }
            ctx.stroke();
            // Draw vertex dots during preview — first point larger as close target
            if (p.points.length < 20) {
                p.points.forEach((pt, i) => {
                    const isFirst = i === 0;
                    ctx.fillStyle = isFirst ? '#ff4444' : p.color;
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, isFirst ? 5 : 3, 0, Math.PI * 2);
                    ctx.fill();
                    if (isFirst) {
                        ctx.strokeStyle = 'rgba(255,68,68,0.4)'; ctx.lineWidth = 4;
                        ctx.beginPath(); ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2); ctx.stroke();
                        ctx.lineWidth = p.width; ctx.strokeStyle = p.color;
                    }
                });
            }
            // Snap ring when cursor is near first point
            if (p._snapRing) {
                ctx.save(); ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
                ctx.fillStyle = 'rgba(255,68,68,0.08)';
                ctx.beginPath(); ctx.arc(p._snapRing.x, p._snapRing.y, 20, 0, Math.PI * 2);
                ctx.fill(); ctx.stroke(); ctx.restore();
                ctx.strokeStyle = p.color; ctx.lineWidth = p.width; ctx.setLineDash([]);
            }
        }
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
    } else if (p.type === 'textbox') {
        const bx = Math.min(p.x1, p.x2), by = Math.min(p.y1, p.y2);
        const bw = Math.abs(p.x2 - p.x1), bh = Math.abs(p.y2 - p.y1);
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(bx, by, bw, bh);
        ctx.setLineDash([]);
        if (p.text) {
            ctx.fillStyle = p.color;
            ctx.font = `${p.fontSize || 14}px Inter, sans-serif`;
            ctx.textBaseline = 'top';
            const words = p.text.split(' '), lineH = (p.fontSize || 14) * 1.3;
            let line = '', ty = by + 4;
            for (const w of words) {
                const test = line ? line + ' ' + w : w;
                if (ctx.measureText(test).width > bw - 8 && line) {
                    ctx.fillText(line, bx + 4, ty); ty += lineH; line = w;
                } else { line = test; }
            }
            if (line) ctx.fillText(line, bx + 4, ty);
        }
    }
    ctx.restore();
}

function onDown(id, e, canvases) {
    const s = canvases[id]; if (!s) return;
    const { x, y } = gPos(id, e, canvases);

    // Precision Selection & Dragging for all tools (except eraser)
    if (s.tool !== 'eraser') {
        const tok = findTok(s, x, y);
        if (tok) {
            // If clicking a token that is already selected, check handles first
            if (tok === s.selected) {
                const dx = x - tok.x, dy = y - tok.y;
                const cos = Math.cos(-(tok.rot || 0)), sin = Math.sin(-(tok.rot || 0));
                const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
                const sc = tok.scale || 1;

                if (Math.hypot(lx, ly + 28) < Math.max(10, _minHitRadius(s) * 0.6)) { s.rotating = tok; return; }
            }

            // Select this token and start dragging
            s.selected = tok;
            saveH(id, canvases);
            s.dragging = tok; s.dx = x - tok.x; s.dy = y - tok.y;
            drawAll(id, canvases);
            return;
        }

        // Try selecting a path if no token hit
        const path = findPath(s, x, y);
        if (path) {
            s.selected = null;
            saveH(id, canvases);
            s.draggingPath = path;
            s.dx = x; s.dy = y;
            drawAll(id, canvases);
            return;
        }

        // Clicked empty space — deselect
        if (s.selected) {
            s.selected = null;
            drawAll(id, canvases);
        }
    }

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

    // Polygon Tools (click to add points, click near first point to close)
    if (s.tool === 'polygon' || s.tool === 'polygon-fill') {
        const SNAP = 20;
        if (s.cPhase === 0) {
            s.cPts = [{ x, y }]; s.cPhase = 1;
        } else {
            const first = s.cPts[0];
            if (s.cPts.length >= 3 && Math.hypot(x - first.x, y - first.y) < SNAP) {
                saveH(id, canvases);
                s.paths.push({ type: 'polygon', points: [...s.cPts], filled: s.tool === 'polygon-fill', color: s.drawColor, width: s.lineWidth });
                s.cPhase = 0; s.cPts = []; s.currentPath = null;
                drawAll(id, canvases);
            } else {
                s.cPts.push({ x, y });
            }
        }
        return;
    }

    if (PLACE.includes(s.tool)) { saveH(id, canvases); placeTok(id, x, y, canvases); return; }

    saveH(id, canvases);
    s.isDrawing = true; s.sx = x; s.sy = y;
    const common = { color: s.drawColor, width: s.lineWidth };
    if (s.tool === 'pencil') {
        s.currentPath = { type: 'pencil', points: [{ x, y }], ...common };
    } else if (s.tool === 'textbox') {
        s.currentPath = { type: 'textbox', x1: x, y1: y, x2: x, y2: y, text: '', fontSize: 14, color: s.drawColor, width: s.lineWidth };
    } else if (['rect', 'rect-fill', 'circle', 'circle-fill', 'tri', 'tri-fill', 'line', 'arrow', 'biarrow', 'dashed', 'dashed-line'].includes(s.tool)) {
        const type = s.tool.replace('-fill', '');
        s.currentPath = { type, x1: x, y1: y, x2: x, y2: y, filled: s.tool.includes('-fill'), ...common };
    } else if (s.tool === 'eraser') {
        const hitIdx = s.paths.findIndex(p => pathHitTest(p, x, y, 10));
        if (hitIdx >= 0) s.paths.splice(hitIdx, 1);
        else {
            const tok = findTok(s, x, y);
            if (tok) { const ti = s.tokens.indexOf(tok); if (ti >= 0) s.tokens.splice(ti, 1); }
        }
        s.isDrawing = true;
    }
}

function onMove(id, e, canvases) {
    const s = canvases[id]; if (!s) return;
    const { x, y } = gPos(id, e, canvases);
    s.hovered = findTok(s, x, y);
    const hoveredPath = s.hovered ? null : findPath(s, x, y);

    if (s.rotating) { s.rotating.rot = Math.atan2(y - s.rotating.y, x - s.rotating.x) + Math.PI / 2; drawAll(id, canvases); return; }
    if (s.dragging) {
        let nx = x - s.dx, ny = y - s.dy;
        const snap = calcSnapGuides(s, s.dragging, nx, ny);
        s.dragging.x = snap.x; s.dragging.y = snap.y;
        s._snapGuides = snap.guides;
        drawAll(id, canvases);
        drawSnapGuides(s);
        return;
    }

    if (s.draggingPath) {
        const dx = x - s.dx, dy = y - s.dy;
        s.dx = x; s.dy = y;
        const p = s.draggingPath;
        if (p.points) p.points.forEach(pt => { pt.x += dx; pt.y += dy; });
        if (p.x1 !== undefined) { p.x1 += dx; p.y1 += dy; p.x2 += dx; p.y2 += dy; }
        drawAll(id, canvases);
        return;
    }

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

    // Polygon Preview — snap cursor to first point when close
    if ((s.tool === 'polygon' || s.tool === 'polygon-fill') && s.cPhase > 0 && s.cPts.length > 0) {
        const SNAP = 20;
        let px = x, py = y;
        const first = s.cPts[0];
        const nearFirst = s.cPts.length >= 3 && Math.hypot(x - first.x, y - first.y) < SNAP;
        if (nearFirst) { px = first.x; py = first.y; }
        s.currentPath = { type: 'polygon', points: [...s.cPts, { x: px, y: py }], filled: false, color: s.drawColor, width: s.lineWidth, _snapRing: nearFirst ? first : null };
        drawAll(id, canvases);
        return;
    }

    if (!s.isDrawing || !s.currentPath) {
        if (s.hovered && s.tool !== 'eraser') {
            if (s.hovered === s.selected) {
                // Show handle cursors only for the selected token
                const dx = x - s.hovered.x, dy = y - s.hovered.y;
                const cos = Math.cos(-(s.hovered.rot || 0)), sin = Math.sin(-(s.hovered.rot || 0));
                const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;

                if (Math.hypot(lx, ly + 28) < 10) s.canvas.style.cursor = 'pointer';
                else s.canvas.style.cursor = 'grab';
            } else {
                s.canvas.style.cursor = 'grab';
            }
        } else if (hoveredPath && s.tool !== 'eraser') {
            s.canvas.style.cursor = 'move';
        } else {
            const cm = { eraser: 'cell', player: 'copy', goalkeeper: 'copy', cone: 'copy', ball: 'copy', goalpost: 'copy', flag: 'copy', number: 'copy', ladder: 'copy', hurdle: 'copy', mannequin: 'copy', pole: 'copy', minigoal: 'copy', ring: 'copy', rebounder: 'copy' };
            s.canvas.style.cursor = cm[s.tool] || 'default';
        }
        return;
    }

    if (s.tool === 'pencil') s.currentPath.points.push({ x, y });
    else if (s.tool === 'eraser') {
        const hitIdx = s.paths.findIndex(p => pathHitTest(p, x, y, 10));
        if (hitIdx >= 0) s.paths.splice(hitIdx, 1);
        else {
            const tok = findTok(s, x, y);
            if (tok) { const ti = s.tokens.indexOf(tok); if (ti >= 0) s.tokens.splice(ti, 1); }
        }
    } else { s.currentPath.x2 = x; s.currentPath.y2 = y; }
    drawAll(id, canvases);
}

function onUp(id, canvases) {
    const s = canvases[id]; if (!s) return;
    if (s.isDrawing && s.currentPath) {
        if (s.tool === 'textbox' && s.currentPath.type === 'textbox') {
            const p = s.currentPath;
            const bw = Math.abs(p.x2 - p.x1), bh = Math.abs(p.y2 - p.y1);
            if (bw > 10 && bh > 10) {
                // Show textarea overlay for text input
                s.paths.push(p);
                s.currentPath = null;
                s.isDrawing = false;
                drawAll(id, canvases);
                showTextboxInput(id, p, canvases);
                return;
            }
        } else if (s.tool !== 'eraser' && s.tool !== 'curved' && s.tool !== 'polygon' && s.tool !== 'polygon-fill') {
            s.paths.push(s.currentPath);
        }
        s.currentPath = null;
    }
    s.isDrawing = false; s.dragging = null; s.rotating = null; s.draggingPath = null;
    s._snapGuides = [];
    drawAll(id, canvases);
    if (window.triggerAutosave) window.triggerAutosave();
}

function onDblClick(id, e, canvases) {
    // Polygon closes only by clicking near first point — no dblclick finalize
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

function pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
// Distance from point to a quadratic bezier curve (sampled)
function pointToQuadBezierDist(px, py, p0, cp, p2, steps = 20) {
    let minD = Infinity;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const it = 1 - t;
        const bx = it * it * p0.x + 2 * it * t * cp.x + t * t * p2.x;
        const by = it * it * p0.y + 2 * it * t * cp.y + t * t * p2.y;
        const d = Math.hypot(px - bx, py - by);
        if (d < minD) minD = d;
    }
    return minD;
}

// Distance from point to ellipse outline
function pointToEllipseDist(px, py, cx, cy, rx, ry, steps = 36) {
    if (rx < 1 || ry < 1) return Infinity;
    let minD = Infinity;
    for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const ex = cx + rx * Math.cos(a);
        const ey = cy + ry * Math.sin(a);
        const d = Math.hypot(px - ex, py - ey);
        if (d < minD) minD = d;
    }
    return minD;
}

function pathHitTest(p, x, y, tol) {
    if (p.type === 'pencil') return p.points.some(pt => Math.hypot(pt.x - x, pt.y - y) < tol);
    if (p.type === 'curved' && p.points && p.points.length === 3) {
        const [p0, p2, cp] = p.points;
        return pointToQuadBezierDist(x, y, p0, cp, p2) < tol;
    }
    if (p.type === 'circle') {
        const cx = (p.x1 + p.x2) / 2, cy = (p.y1 + p.y2) / 2;
        const rx = Math.abs(p.x2 - p.x1) / 2, ry = Math.abs(p.y2 - p.y1) / 2;
        return pointToEllipseDist(x, y, cx, cy, rx, ry) < tol;
    }
    if (p.type === 'textbox') {
        const bx = Math.min(p.x1, p.x2), by = Math.min(p.y1, p.y2);
        const bw = Math.abs(p.x2 - p.x1), bh = Math.abs(p.y2 - p.y1);
        return x >= bx - tol && x <= bx + bw + tol && y >= by - tol && y <= by + bh + tol;
    }
    if (p.type === 'rect' || p.type === 'zone') {
        // Test all 4 edges
        const { x1, y1, x2, y2 } = p;
        if (pointToSegmentDist(x, y, x1, y1, x2, y1) < tol) return true;
        if (pointToSegmentDist(x, y, x2, y1, x2, y2) < tol) return true;
        if (pointToSegmentDist(x, y, x2, y2, x1, y2) < tol) return true;
        if (pointToSegmentDist(x, y, x1, y2, x1, y1) < tol) return true;
        return false;
    }
    if (p.type === 'tri') {
        const tx = (p.x1 + p.x2) / 2;
        if (pointToSegmentDist(x, y, tx, p.y1, p.x2, p.y2) < tol) return true;
        if (pointToSegmentDist(x, y, p.x2, p.y2, p.x1, p.y2) < tol) return true;
        if (pointToSegmentDist(x, y, p.x1, p.y2, tx, p.y1) < tol) return true;
        return false;
    }
    if (p.type === 'polygon' && p.points && p.points.length >= 3) {
        for (let i = 0; i < p.points.length; i++) {
            const j = (i + 1) % p.points.length;
            if (pointToSegmentDist(x, y, p.points[i].x, p.points[i].y, p.points[j].x, p.points[j].y) < tol) return true;
        }
        return false;
    }
    if (p.x1 !== undefined) {
        return pointToSegmentDist(x, y, p.x1, p.y1, p.x2, p.y2) < tol;
    }
    return false;
}

function showTextboxInput(id, pathObj, canvases) {
    const s = canvases[id]; if (!s) return;
    const canvas = s.canvas;
    const wrap = canvas.closest('.canvas-el') || canvas.parentElement;
    const cRect = canvas.getBoundingClientRect();
    const wRect = wrap.getBoundingClientRect();
    const scaleX = cRect.width / s.width, scaleY = cRect.height / s.height;
    const bx = Math.min(pathObj.x1, pathObj.x2), by = Math.min(pathObj.y1, pathObj.y2);
    const bw = Math.abs(pathObj.x2 - pathObj.x1), bh = Math.abs(pathObj.y2 - pathObj.y1);

    const ta = document.createElement('textarea');
    ta.value = pathObj.text || '';
    ta.style.cssText = `position:absolute;left:${(cRect.left - wRect.left) + bx * scaleX}px;top:${(cRect.top - wRect.top) + by * scaleY}px;width:${bw * scaleX}px;height:${bh * scaleY}px;font-size:${(pathObj.fontSize || 14) * scaleY}px;font-family:Inter,sans-serif;color:${pathObj.color};background:rgba(0,0,0,0.5);border:1px dashed rgba(255,255,255,0.4);padding:4px;resize:none;outline:none;z-index:999;box-sizing:border-box;`;
    wrap.style.position = 'relative';
    wrap.appendChild(ta);
    ta.focus();

    const commit = () => {
        pathObj.text = ta.value;
        ta.remove();
        drawAll(id, canvases);
        if (window.triggerAutosave) window.triggerAutosave();
    };
    ta.addEventListener('blur', commit);
    ta.addEventListener('keydown', e => { if (e.key === 'Escape') { ta.removeEventListener('blur', commit); ta.remove(); } });
}

function setMT(id, t, canvases) { const s = canvases[id]; s.tool = t; s.cPhase = 0; s.cPts = []; s.hovered = null; document.querySelectorAll(`[id^="mt-${id}-"]`).forEach(b => { if (b.id === `mt-${id}-fill-toggle`) return; b.classList.remove('active'); }); const btn = document.getElementById(`mt-${id}-${t}`); if (btn) { btn.classList.add('active'); const dd = btn.closest('.mt-dropdown'); if (dd) { const toggle = dd.querySelector('.mt-dropdown-toggle'); if (toggle) toggle.classList.add('active'); } } updateDropdownLabel(id, t); const cm = { eraser: 'cell', move: 'default', player: 'copy', goalkeeper: 'copy', cone: 'copy', ball: 'copy', goal: 'copy', goalnet: 'copy', flag: 'copy', number: 'copy', text: 'text', ladder: 'copy', hurdle: 'copy', mannequin: 'copy', pole: 'copy', minigoal: 'copy', ring: 'copy', rebounder: 'copy' }; s.canvas.style.cursor = cm[t] || 'crosshair'; }
function setMC(id, el, canvases) { document.querySelectorAll(`#dcw-${id} .mt-swatch`).forEach(s => s.classList.remove('active')); el.classList.add('active'); canvases[id].selColor = el.dataset.color; if (canvases[id].selected) { canvases[id].selected.color = canvases[id].selColor; drawAll(id, canvases); } setMT(id, 'player', canvases); }
function setGK(id, el, canvases) { document.querySelectorAll(`#dcw-${id} .mt-swatch`).forEach(s => s.classList.remove('active')); el.classList.add('active'); canvases[id].selColor = el.dataset.color; if (canvases[id].selected) { canvases[id].selected.color = canvases[id].selColor; drawAll(id, canvases); } setMT(id, 'goalkeeper', canvases); }
function setEquipColor(id, el, canvases) { document.querySelectorAll(`#dcw-${id} .mt-equip-swatch`).forEach(s => s.classList.remove('active')); el.classList.add('active'); canvases[id].selColor = el.dataset.color; canvases[id].drawColor = el.dataset.color; if (canvases[id].selected) { canvases[id].selected.color = canvases[id].selColor; drawAll(id, canvases); } }
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
    const wrap = document.getElementById(`dcw-${id}`);
    if (wrap) {
        if (newOr === 'portrait') wrap.classList.add('is-portrait');
        else wrap.classList.remove('is-portrait');
    }
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
    const oldW = (oldOr === 'landscape') ? MAX_W : MAX_H;
    const oldH = (oldOr === 'landscape') ? MAX_H : MAX_W;
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

    c.fillStyle = '#1e5c30'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#1a5228';
    if (isPort) {
        const sh = H / 10;
        for (let i = 0; i * sh < H; i += 2) c.fillRect(0, i * sh, W, sh);
    } else {
        const sw = W / 10;
        for (let i = 0; i * sw < W; i += 2) c.fillRect(i * sw, 0, sw, H);
    }

    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2; c.lineCap = 'square'; c.lineJoin = 'miter';

    const fx = PAD, fy = PAD;
    const fw = W - 2 * PAD;
    const fh = H - 2 * PAD;

    if (isPort) {
        if (pt === 'full') pFullVert(c, fx, fy, fw, fh);
        else if (pt === 'half') pHalfVert(c, fx, fy, fw, fh);
        else if (pt === 'third') pThirdVert(c, fx, fy, fw, fh);
        else if (pt === 'smallsided') pSmallVert(c, fx, fy, fw, fh);
        else if (pt === 'threequarter') pThreeQuarterVert(c, fx, fy, fw, fh);
        else if (pt === 'outline') { c.strokeRect(fx, fy, fw, fh); pCorners(c, fx, fy, fw, fh); }
        else if (pt === 'halves') { c.strokeRect(fx, fy, fw, fh); pLine(c, fx, fy + fh / 2, fx + fw, fy + fh / 2); pDot(c, fx + fw / 2, fy + fh / 2, 4); pCorners(c, fx, fy, fw, fh); }
        else if (pt === 'thirds') { c.strokeRect(fx, fy, fw, fh); pLine(c, fx, fy + fh / 3, fx + fw, fy + fh / 3); pLine(c, fx, fy + fh * 2 / 3, fx + fw, fy + fh * 2 / 3); pCorners(c, fx, fy, fw, fh); }
    } else {
        if (pt === 'full') pFull(c, fx, fy, fw, fh);
        else if (pt === 'half') pHalf(c, fx, fy, fw, fh);
        else if (pt === 'third') pThird(c, fx, fy, fw, fh);
        else if (pt === 'smallsided') pSmall(c, fx, fy, fw, fh);
        else if (pt === 'threequarter') pThreeQuarter(c, fx, fy, fw, fh);
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
    c.strokeRect(fx, fy, fw, fh);
    const mx = fx + fw / 2;
    pLine(c, fx, fy, fx + fw, fy);
    pDot(c, mx, fy, 4);
    c.save(); c.beginPath(); c.rect(fx, fy, fw, fh); c.clip();
    c.beginPath(); c.arc(mx, fy, fw * 0.175, 0, Math.PI); c.stroke(); c.restore();
    // proportions scaled: full pitch pbH = fullH * 0.138, here fullH = fh * 2
    const pbH = fh * 0.276, pbW = fw * 0.44;
    const gbH = fh * 0.106, gbW = fw * 0.22;
    const gW = fw * 0.21;
    c.strokeRect(mx - pbW / 2, fy + fh - pbH, pbW, pbH);
    c.strokeRect(mx - gbW / 2, fy + fh - gbH, gbW, gbH);
    c.strokeRect(mx - gW / 2, fy + fh, gW, 10);
    const bS = fy + fh - pbH * 0.72; pDot(c, mx, bS, 3);
    c.save(); c.beginPath(); c.rect(fx, fy, fw, fh - pbH); c.clip();
    c.beginPath(); c.arc(mx, bS, fw * 0.175, Math.PI, 0); c.stroke(); c.restore();
    pCA(c, fx + fw, fy + fh, Math.PI, 1.5 * Math.PI);
    pCA(c, fx, fy + fh, 1.5 * Math.PI, 2 * Math.PI);
}

function pThirdVert(c, fx, fy, fw, fh) {
    c.strokeRect(fx, fy, fw, fh);
    const mx = fx + fw / 2;
    // proportions scaled: full pitch pbH = fullH * 0.138, here fullH = fh * 3
    const pbH = fh * 0.414, pbW = fw * 0.44;
    const gbH = fh * 0.159, gbW = fw * 0.22;
    const gW = fw * 0.21;
    c.strokeRect(mx - pbW / 2, fy + fh - pbH, pbW, pbH);
    c.strokeRect(mx - gbW / 2, fy + fh - gbH, gbW, gbH);
    c.strokeRect(mx - gW / 2, fy + fh, gW, 10);
    const bS = fy + fh - pbH * 0.72; pDot(c, mx, bS, 3);
    c.save(); c.beginPath(); c.rect(fx, fy, fw, fh - pbH); c.clip();
    c.beginPath(); c.arc(mx, bS, fw * 0.175, Math.PI, 0); c.stroke(); c.restore();
    pCA(c, fx + fw, fy + fh, Math.PI, 1.5 * Math.PI);
    pCA(c, fx, fy + fh, 1.5 * Math.PI, 2 * Math.PI);
}

function pSmallVert(c, fx, fy, fw, fh) {
    const mx = fx + fw / 2, my = fy + fh / 2;
    c.strokeRect(fx, fy, fw, fh);
    pLine(c, fx, my, fx + fw, my);
    pDot(c, mx, my, 4);
    const gbW = fw * 0.38, gbH = fh * 0.10;
    const gW = 16;
    c.strokeRect(mx - gbW / 2, fy, gbW, gbH);
    c.strokeRect(mx - gW / 2, fy - 8, gW, 8);
    c.strokeRect(mx - gbW / 2, fy + fh - gbH, gbW, gbH);
    c.strokeRect(mx - gW / 2, fy + fh, gW, 8);
    pCorners(c, fx, fy, fw, fh);
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
    c.strokeRect(fx, fy, fw, fh);
    const my = fy + fh / 2;
    pLine(c, fx + fw, fy, fx + fw, fy + fh);
    pDot(c, fx + fw, my, 4);
    c.save(); c.beginPath(); c.rect(fx, fy, fw, fh); c.clip();
    c.beginPath(); c.arc(fx + fw, my, fh * 0.175, 0, Math.PI * 2); c.stroke(); c.restore();
    // proportions scaled: full pitch pbW = fullW * 0.138, here fullW = fw * 2
    const pbW = fw * 0.276, pbH = fh * 0.44, gbW = fw * 0.106, gbH = fh * 0.22;
    c.strokeRect(fx, my - pbH / 2, pbW, pbH); c.strokeRect(fx, my - gbH / 2, gbW, gbH); c.strokeRect(fx - 10, my - fh * 0.105, 10, fh * 0.21);
    const lS = fx + pbW * 0.72; pDot(c, lS, my, 3);
    c.save(); c.beginPath(); c.rect(fx + pbW, fy, fw, fh); c.clip();
    c.beginPath(); c.arc(lS, my, fh * 0.175, -Math.PI * 0.36, Math.PI * 0.36); c.stroke(); c.restore();
    pCA(c, fx, fy, 0, Math.PI / 2);
    pCA(c, fx, fy + fh, 1.5 * Math.PI, 2 * Math.PI);
}

function pThird(c, fx, fy, fw, fh) {
    c.strokeRect(fx, fy, fw, fh);
    const my = fy + fh / 2;
    // proportions scaled: full pitch pbW = fullW * 0.138, here fullW = fw * 3
    const pbW = fw * 0.414, pbH = fh * 0.44, gbW = fw * 0.159, gbH = fh * 0.22;
    c.strokeRect(fx, my - pbH / 2, pbW, pbH); c.strokeRect(fx, my - gbH / 2, gbW, gbH); c.strokeRect(fx - 10, my - fh * 0.105, 10, fh * 0.21);
    const lS = fx + pbW * 0.72; pDot(c, lS, my, 3);
    c.save(); c.beginPath(); c.rect(fx + pbW, fy, fw, fh); c.clip();
    c.beginPath(); c.arc(lS, my, fh * 0.175, -Math.PI * 0.36, Math.PI * 0.36); c.stroke(); c.restore();
    pCA(c, fx, fy, 0, Math.PI / 2);
    pCA(c, fx, fy + fh, 1.5 * Math.PI, 2 * Math.PI);
}

function pThreeQuarter(c, fx, fy, fw, fh) {
    c.strokeRect(fx, fy, fw, fh);
    const my = fy + fh / 2;
    // fullW = fw * 4/3, so center line at 2/3 of fw
    const cx = fx + fw * (2 / 3);
    pLine(c, cx, fy, cx, fy + fh); pDot(c, cx, my, 4);
    // Center circle (clipped to field)
    c.save(); c.beginPath(); c.rect(fx, fy, fw, fh); c.clip();
    c.beginPath(); c.arc(cx, my, fh * 0.175, 0, Math.PI * 2); c.stroke(); c.restore();
    // Left penalty area (scaled: fullW = fw * 4/3, pbW = fullW * 0.138)
    const pbW = fw * 0.184, pbH = fh * 0.44, gbW = fw * 0.071, gbH = fh * 0.22;
    c.strokeRect(fx, my - pbH / 2, pbW, pbH); c.strokeRect(fx, my - gbH / 2, gbW, gbH); c.strokeRect(fx - 10, my - fh * 0.105, 10, fh * 0.21);
    const lS = fx + pbW * 0.72; pDot(c, lS, my, 3);
    c.save(); c.beginPath(); c.rect(fx + pbW, fy, fw, fh); c.clip();
    c.beginPath(); c.arc(lS, my, fh * 0.175, -Math.PI * 0.36, Math.PI * 0.36); c.stroke(); c.restore();
    pCA(c, fx, fy, 0, Math.PI / 2);
    pCA(c, fx, fy + fh, 1.5 * Math.PI, 2 * Math.PI);
}

function pThreeQuarterVert(c, fx, fy, fw, fh) {
    c.strokeRect(fx, fy, fw, fh);
    const mx = fx + fw / 2;
    // fullH = fh * 4/3, so center line at 1/3 of fh from top
    const cy = fy + fh * (1 / 3);
    pLine(c, fx, cy, fx + fw, cy); pDot(c, mx, cy, 4);
    // Center circle (clipped to field)
    c.save(); c.beginPath(); c.rect(fx, fy, fw, fh); c.clip();
    c.beginPath(); c.arc(mx, cy, fw * 0.175, 0, Math.PI * 2); c.stroke(); c.restore();
    // Bottom penalty area (scaled: fullH = fh * 4/3, pbH = fullH * 0.138)
    const pbH = fh * 0.184, pbW = fw * 0.44, gbH = fh * 0.071, gbW = fw * 0.22, gW = fw * 0.21;
    c.strokeRect(mx - pbW / 2, fy + fh - pbH, pbW, pbH); c.strokeRect(mx - gbW / 2, fy + fh - gbH, gbW, gbH); c.strokeRect(mx - gW / 2, fy + fh, gW, 10);
    const bS = fy + fh - pbH * 0.72; pDot(c, mx, bS, 3);
    c.save(); c.beginPath(); c.rect(fx, fy, fw, fh - pbH); c.clip();
    c.beginPath(); c.arc(mx, bS, fw * 0.175, Math.PI, 0); c.stroke(); c.restore();
    pCA(c, fx, fy + fh, Math.PI * 1.5, Math.PI * 2);
    pCA(c, fx + fw, fy + fh, Math.PI, Math.PI * 1.5);
}

function pSmall(c, fx, fy, fw, fh) {
    const mx = fx + fw / 2, my = fy + fh / 2;
    c.strokeRect(fx, fy, fw, fh); pLine(c, mx, fy, mx, fy + fh); pDot(c, mx, my, 4);
    const gbW = fw * 0.10, gbH = fh * 0.38, gW = 16, gH = fh * 0.22;
    c.strokeRect(fx, my - gbH / 2, gbW, gbH); c.strokeRect(fx - gW, my - gH / 2, gW, gH);
    c.strokeRect(fx + fw - gbW, my - gbH / 2, gbW, gbH); c.strokeRect(fx + fw, my - gH / 2, gW, gH);
    pCorners(c, fx, fy, fw, fh);
}

function drawTokens(id, canvases) { canvases[id].tokens.forEach(t => renderTok(canvases[id], t)); }
function isLight(hex) { const c = hex.replace('#', ''); return (parseInt(c.substr(0, 2), 16) * 299 + parseInt(c.substr(2, 2), 16) * 587 + parseInt(c.substr(4, 2), 16) * 114) / 1000 > 155; }

function renderTok(s, t) {
    const c = s.ctx; c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.translate(t.x, t.y);
    c.rotate(t.rot || 0);
    const sc = t.scale || 1;
    c.scale(sc, sc);

    if (t === s.selected && s.tool !== 'eraser') {
        // Full selection UI with handles
        c.beginPath(); c.arc(0, 0, 22 / sc, 0, Math.PI * 2);
        c.strokeStyle = 'rgba(74,144,217,0.7)'; c.lineWidth = 2 / sc; c.setLineDash([4 / sc, 3 / sc]); c.stroke(); c.setLineDash([]);
        // Rotation handle (28px below)
        c.beginPath(); c.moveTo(0, -22 / sc); c.lineTo(0, -28 / sc); c.stroke();
        c.beginPath(); c.arc(0, -28 / sc, 5 / sc, 0, Math.PI * 2); c.fillStyle = '#4a90d9'; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.5 / sc; c.stroke();
    } else if (t === s.hovered && t !== s.selected && s.tool !== 'eraser') {
        // Subtle hover highlight — no handles
        c.beginPath(); c.arc(0, 0, 22 / sc, 0, Math.PI * 2);
        c.strokeStyle = 'rgba(74,144,217,0.35)'; c.lineWidth = 1.5 / sc; c.setLineDash([4 / sc, 3 / sc]); c.stroke(); c.setLineDash([]);
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
    } else if (t.type === 'ladder') {
        const w = 24, h = 60, rungs = 6;
        c.strokeStyle = '#b0b0b0'; c.lineWidth = 2;
        c.strokeRect(-w / 2, -h / 2, w, h);
        c.fillStyle = 'rgba(255, 193, 7, 0.15)';
        c.fillRect(-w / 2, -h / 2, w, h);
        const spacing = h / (rungs + 1);
        for (let i = 1; i <= rungs; i++) {
            const ry = -h / 2 + i * spacing;
            c.beginPath(); c.moveTo(-w / 2, ry); c.lineTo(w / 2, ry); c.stroke();
        }
    } else if (t.type === 'hurdle') {
        const w = 30, h = 22;
        c.strokeStyle = t.color || '#ff9800'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(-w / 2, h); c.lineTo(-w / 2, 0); c.stroke();
        c.beginPath(); c.moveTo(w / 2, h); c.lineTo(w / 2, 0); c.stroke();
        c.beginPath(); c.moveTo(-w / 2, 0); c.lineTo(w / 2, 0); c.stroke();
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(-w / 2 - 5, h); c.lineTo(-w / 2 + 5, h); c.stroke();
        c.beginPath(); c.moveTo(w / 2 - 5, h); c.lineTo(w / 2 + 5, h); c.stroke();
    } else if (t.type === 'mannequin') {
        c.fillStyle = t.color || '#546e7a';
        c.beginPath(); c.arc(0, -18, 6, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.moveTo(-8, -12); c.lineTo(8, -12); c.lineTo(10, 18); c.lineTo(-10, 18); c.closePath(); c.fill();
        c.beginPath(); c.arc(0, 20, 10, 0, Math.PI); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1;
        c.beginPath(); c.arc(0, -18, 6, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.moveTo(-8, -12); c.lineTo(8, -12); c.lineTo(10, 18); c.lineTo(-10, 18); c.closePath(); c.stroke();
    } else if (t.type === 'pole') {
        c.strokeStyle = t.color || '#ffeb3b'; c.lineWidth = 3; c.lineCap = 'round';
        c.beginPath(); c.moveTo(0, -22); c.lineTo(0, 22); c.stroke();
        c.beginPath(); c.arc(0, -22, 3, 0, Math.PI * 2);
        c.fillStyle = t.color || '#ffeb3b'; c.fill();
    } else if (t.type === 'minigoal') {
        // Small portable training goal — top-down view
        const gw = 40, gd = 20;
        c.strokeStyle = t.color || '#e0e0e0'; c.lineWidth = 3; c.lineCap = 'round';
        // Back net (dashed)
        c.setLineDash([3, 3]);
        c.beginPath(); c.moveTo(-gw / 2, -gd / 2); c.lineTo(-gw / 2, gd / 2); c.stroke();
        c.beginPath(); c.moveTo(gw / 2, -gd / 2); c.lineTo(gw / 2, gd / 2); c.stroke();
        c.beginPath(); c.moveTo(-gw / 2, gd / 2); c.lineTo(gw / 2, gd / 2); c.stroke();
        c.setLineDash([]);
        // Front posts (solid)
        c.lineWidth = 4;
        c.beginPath(); c.moveTo(-gw / 2, -gd / 2); c.lineTo(gw / 2, -gd / 2); c.stroke();
        // Post dots
        c.fillStyle = t.color || '#e0e0e0';
        c.beginPath(); c.arc(-gw / 2, -gd / 2, 3, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(gw / 2, -gd / 2, 3, 0, Math.PI * 2); c.fill();
    } else if (t.type === 'ring') {
        // Agility ring — flat circle on ground
        const r = 14;
        c.strokeStyle = t.color || '#ff9800'; c.lineWidth = 3;
        c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
        // Inner highlight
        c.strokeStyle = toRGBA(t.color || '#ff9800', 0.3); c.lineWidth = 1;
        c.beginPath(); c.arc(0, 0, r - 3, 0, Math.PI * 2); c.stroke();
    } else if (t.type === 'rebounder') {
        // Rebounder / passing wall — top-down view
        const bw = 36, bd = 8;
        c.fillStyle = t.color || '#78909c';
        c.fillRect(-bw / 2, -bd / 2, bw, bd);
        // Frame
        c.strokeStyle = '#37474f'; c.lineWidth = 2;
        c.strokeRect(-bw / 2, -bd / 2, bw, bd);
        // Net lines
        c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 1;
        for (let i = -bw / 2 + 6; i < bw / 2; i += 6) {
            c.beginPath(); c.moveTo(i, -bd / 2); c.lineTo(i, bd / 2); c.stroke();
        }
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

    // This handles the scaling ratio between the internal canvas size and the displayed CSS size
    return {
        x: (cx - r.left) * (s.canvas.width / r.width),
        y: (cy - r.top) * (s.canvas.height / r.height)
    };
}

// Touch devices need larger hit areas for finger precision
// Minimum 24px CSS radius (Material Design 3 = 48dp target) converted to canvas coords
const _isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

function _touchPad(s) {
    if (!_isTouch) return 0;
    // Convert 20 CSS pixels to canvas coordinate space
    const r = s.canvas.getBoundingClientRect();
    return 20 * (s.canvas.width / (r.width || 1));
}

function _minHitRadius(s) {
    if (!_isTouch) return 0;
    // Minimum 24 CSS px radius in canvas coords (ensures ~48px diameter touch target)
    const r = s.canvas.getBoundingClientRect();
    return 24 * (s.canvas.width / (r.width || 1));
}

function findTok(s, x, y) {
    const minR = _minHitRadius(s);
    for (let i = s.tokens.length - 1; i >= 0; i--) {
        const t = s.tokens[i];
        const dx = x - t.x, dy = y - t.y;
        const cos = Math.cos(-(t.rot || 0)), sin = Math.sin(-(t.rot || 0));
        const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
        const sc = t.scale || 1;

        // Shape-aware hit testing (with touch-aware minimum radii)
        let hit = false;
        if (t.type === 'player' || t.type === 'goalkeeper' || t.type === 'ball') {
            const rad = Math.max((t.type === 'ball' ? 11 : 16) * sc, minR);
            hit = Math.hypot(dx, dy) < rad;
        } else if (t.type === 'goalpost') {
            const gw = Math.max(90 * sc, minR * 2), gd = Math.max(34 * sc, minR);
            hit = lx >= -gw / 2 && lx <= gw / 2 && ly >= -4 * sc && ly <= gd;
        } else if (t.type === 'cone') {
            hit = Math.hypot(dx, dy) < Math.max(15 * sc, minR);
        } else if (t.type === 'flag' || t.type === 'number') {
            hit = Math.hypot(dx, dy) < Math.max(20 * sc, minR);
        } else if (t.type === 'ladder') {
            hit = Math.abs(lx) < Math.max(14 * sc, minR) && Math.abs(ly) < Math.max(32 * sc, minR);
        } else if (t.type === 'hurdle') {
            hit = Math.abs(lx) < Math.max(18 * sc, minR) && Math.abs(ly) < Math.max(14 * sc, minR);
        } else if (t.type === 'mannequin') {
            hit = Math.hypot(dx, dy) < Math.max(20 * sc, minR);
        } else if (t.type === 'pole') {
            hit = Math.abs(lx) < Math.max(8 * sc, minR) && Math.abs(ly) < Math.max(24 * sc, minR);
        } else if (t.type === 'minigoal') {
            hit = Math.abs(lx) < Math.max(24 * sc, minR) && Math.abs(ly) < Math.max(14 * sc, minR);
        } else if (t.type === 'ring') {
            hit = Math.hypot(dx, dy) < Math.max(16 * sc, minR);
        } else if (t.type === 'rebounder') {
            hit = Math.abs(lx) < Math.max(20 * sc, minR) && Math.abs(ly) < Math.max(8 * sc, minR);
        }

        if (hit) return t;
        // Only check rotation handle for the currently selected token
        if (t === s.selected) {
            if (Math.hypot(lx, ly + 28) < Math.max(10, minR * 0.6)) return t;
        }
    }
    return null;
}

function findPath(s, x, y) {
    // 12 CSS px tolerance on touch, 8 canvas px on mouse
    const tolerance = _isTouch ? Math.max(14, _minHitRadius(s) * 0.5) : 8;
    for (let i = s.paths.length - 1; i >= 0; i--) {
        if (pathHitTest(s.paths[i], x, y, tolerance)) return s.paths[i];
    }
    return null;
}

function setTokenSize(id, size, canvases) { canvases[id].tokenSize = size; }

// ── Snap Guides (Tier 1) ──
const SNAP_THRESHOLD = 8; // px distance to trigger snap

function calcSnapGuides(s, excludeTok, rawX, rawY) {
    const guides = [];
    let snapX = rawX, snapY = rawY;
    let snappedH = false, snappedV = false;

    const others = s.tokens.filter(t => t !== excludeTok);
    if (others.length === 0) return { x: rawX, y: rawY, guides };

    // Find closest horizontal and vertical alignments
    let bestDx = SNAP_THRESHOLD + 1, bestDy = SNAP_THRESHOLD + 1;
    let alignX = null, alignY = null;

    for (const t of others) {
        const dx = Math.abs(t.x - rawX);
        const dy = Math.abs(t.y - rawY);

        // Vertical alignment (same X)
        if (dx < bestDx) {
            bestDx = dx;
            alignX = t.x;
        }
        // Horizontal alignment (same Y)
        if (dy < bestDy) {
            bestDy = dy;
            alignY = t.y;
        }
    }

    if (bestDx <= SNAP_THRESHOLD && alignX !== null) {
        snapX = alignX;
        snappedV = true;
        guides.push({ type: 'v', x: alignX }); // vertical line
    }
    if (bestDy <= SNAP_THRESHOLD && alignY !== null) {
        snapY = alignY;
        snappedH = true;
        guides.push({ type: 'h', y: alignY }); // horizontal line
    }

    // Spacing echo: if snapped to a line of 2+ tokens, show equal-distance ghost
    if (snappedV || snappedH) {
        const lineTokens = others.filter(t => {
            if (snappedV && Math.abs(t.x - snapX) < 2) return true;
            if (snappedH && Math.abs(t.y - snapY) < 2) return true;
            return false;
        });

        if (snappedV && lineTokens.length >= 2) {
            // Sort by Y to find spacing pattern
            const ys = lineTokens.map(t => t.y).sort((a, b) => a - b);
            if (ys.length >= 2) {
                const gaps = [];
                for (let i = 1; i < ys.length; i++) gaps.push(ys[i] - ys[i - 1]);
                const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
                // If gaps are fairly consistent (within 20%), suggest next position
                const consistent = gaps.every(g => Math.abs(g - avgGap) < avgGap * 0.2);
                if (consistent && avgGap > 10) {
                    const minY = ys[0], maxY = ys[ys.length - 1];
                    const ghostAbove = minY - avgGap;
                    const ghostBelow = maxY + avgGap;
                    // Snap to ghost if close
                    if (Math.abs(snapY - ghostAbove) < SNAP_THRESHOLD * 2) {
                        snapY = ghostAbove;
                        guides.push({ type: 'ghost', x: snapX, y: ghostAbove });
                    } else if (Math.abs(snapY - ghostBelow) < SNAP_THRESHOLD * 2) {
                        snapY = ghostBelow;
                        guides.push({ type: 'ghost', x: snapX, y: ghostBelow });
                    }
                }
            }
        }

        if (snappedH && lineTokens.length >= 2) {
            const xs = lineTokens.map(t => t.x).sort((a, b) => a - b);
            if (xs.length >= 2) {
                const gaps = [];
                for (let i = 1; i < xs.length; i++) gaps.push(xs[i] - xs[i - 1]);
                const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
                const consistent = gaps.every(g => Math.abs(g - avgGap) < avgGap * 0.2);
                if (consistent && avgGap > 10) {
                    const minX = xs[0], maxX = xs[xs.length - 1];
                    const ghostLeft = minX - avgGap;
                    const ghostRight = maxX + avgGap;
                    if (Math.abs(snapX - ghostLeft) < SNAP_THRESHOLD * 2) {
                        snapX = ghostLeft;
                        guides.push({ type: 'ghost', x: ghostLeft, y: snapY });
                    } else if (Math.abs(snapX - ghostRight) < SNAP_THRESHOLD * 2) {
                        snapX = ghostRight;
                        guides.push({ type: 'ghost', x: ghostRight, y: snapY });
                    }
                }
            }
        }
    }

    return { x: snapX, y: snapY, guides };
}

function drawSnapGuides(s) {
    const guides = s._snapGuides;
    if (!guides || guides.length === 0) return;
    const ctx = s.ctx;
    ctx.save();

    for (const g of guides) {
        if (g.type === 'v') {
            // Vertical guide line
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(g.x, 0);
            ctx.lineTo(g.x, s.height);
            ctx.stroke();
            ctx.setLineDash([]);
        } else if (g.type === 'h') {
            // Horizontal guide line
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(0, g.y);
            ctx.lineTo(s.width, g.y);
            ctx.stroke();
            ctx.setLineDash([]);
        } else if (g.type === 'ghost') {
            // Ghost dot showing suggested equal-spacing position
            ctx.fillStyle = 'rgba(59, 130, 246, 0.35)';
            ctx.beginPath();
            ctx.arc(g.x, g.y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(g.x, g.y, 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    ctx.restore();
}

function placeTok(id, x, y, canvases) {
    const s = canvases[id]; if (!s) return;
    let label = '';
    if (s.tool === 'player') label = s.pCount++;
    if (s.tool === 'number') label = s.nCount++;
    const sizeKey = s.tokenSize || 'medium';
    const presets = SIZE_PRESETS[s.tool];
    const scale = presets ? (presets[sizeKey] || 1) : 1;
    // Snap placement to nearby tokens
    const snap = calcSnapGuides(s, null, x, y);
    const tok = {
        type: s.tool, x: snap.x, y: snap.y,
        color: s.selColor, label,
        rot: 0, scale
    };
    s.tokens.push(tok);
    // Flash snap guides briefly
    s._snapGuides = snap.guides;
    drawAll(id, canvases);
    drawSnapGuides(s);
    setTimeout(() => { s._snapGuides = []; drawAll(id, canvases); }, 300);
    if (window.triggerAutosave) window.triggerAutosave();
}

// Shape fill toggle helpers
const SHAPE_TOOLS = ['rect', 'circle', 'tri', 'polygon'];

const SHAPE_LABELS = { rect: '▭ Rect', circle: '○ Circle', tri: '△ Tri', polygon: '⬠ Polygon' };
const LINES_LABELS = { line: '/ Line', arrow: '→ Arrow', biarrow: '↔ Both' };
const DASHED_LABELS = { dashed: '⤳ Dashed Arrow', 'dashed-line': '- - Dashed Line' };

function selectShape(id, shape, canvases) {
    const s = canvases[id]; if (!s) return;
    s._activeShape = shape;
    // Update dropdown toggle label
    const toggle = document.getElementById(`mt-${id}-shapes-grp`);
    if (toggle) toggle.textContent = (SHAPE_LABELS[shape] || shape) + ' ▾';
    // Apply fill state
    const fillBtn = document.getElementById(`mt-${id}-fill-toggle`);
    const isFilled = fillBtn && fillBtn.classList.contains('active');
    const tool = isFilled ? (shape + '-fill') : shape;
    setMT(id, tool, canvases);
}

function updateDropdownLabel(id, tool) {
    // Lines dropdown
    if (LINES_LABELS[tool]) {
        const t = document.getElementById(`mt-${id}-lines-grp`);
        if (t) t.textContent = LINES_LABELS[tool] + ' ▾';
    }
    // Dashed dropdown
    if (DASHED_LABELS[tool]) {
        const t = document.getElementById(`mt-${id}-dashed-grp`);
        if (t) t.textContent = DASHED_LABELS[tool] + ' ▾';
    }
    // Shapes dropdown
    const baseShape = tool.replace('-fill', '');
    if (SHAPE_LABELS[baseShape]) {
        const t = document.getElementById(`mt-${id}-shapes-grp`);
        if (t) t.textContent = SHAPE_LABELS[baseShape] + ' ▾';
    }
}

function toggleShapeFill(id, canvases) {
    const s = canvases[id]; if (!s) return;
    const fillBtn = document.getElementById(`mt-${id}-fill-toggle`);
    if (!fillBtn) return;
    const nowFilled = !fillBtn.classList.contains('active');
    fillBtn.classList.toggle('active', nowFilled);
    // If currently on a shape tool, switch to fill/unfill variant
    const base = s._activeShape;
    if (base && SHAPE_TOOLS.includes(base)) {
        const tool = nowFilled ? (base + '-fill') : base;
        setMT(id, tool, canvases);
    }
}

// ES Module exports
export { initCanvas, mUndo, mClear, setMT, setMC, setGK, setMDC, setMW, setPT, toggleOrientation, drawAll, setTokenSize, setEquipColor, selectShape, toggleShapeFill };

// Window assignments for inline onclick handlers in HTML
window.initCanvas = initCanvas;
window.mUndo = mUndo;
window.mClear = mClear;
window.setMT = setMT;
window.setMC = setMC;
window.setGK = setGK;
window.setMDC = setMDC;
window.setMW = setMW;
window.setPT = setPT;
window.toggleOrientation = toggleOrientation;
window.drawAll = drawAll;
window.setTokenSize = setTokenSize;
window.setEquipColor = setEquipColor;
window.selectShape = selectShape;
window.toggleShapeFill = toggleShapeFill;
