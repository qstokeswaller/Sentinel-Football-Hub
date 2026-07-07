import React, { useEffect, useRef, useState, useCallback } from 'react';
import Konva from 'konva';

/**
 * Reusable football pitch rendered with raw Konva (the installed dep; not
 * react-konva). Draws the pitch markings once and (re)renders draggable player
 * tokens when `tokens` changes. x/y are normalised 0–1 (fractions of the pitch),
 * so the same lineup data scales to any size. Base for match-plan / planner.
 *
 * Responsive: `width`/`height` define the design aspect + max size. The stage
 * shrinks to fit its container width (phones) and tokens scale with it, so the
 * formation preview never overflows on a small screen.
 */
export interface PitchToken { id: string; label: string; sub?: string; x: number; y: number; }
interface Props { tokens: PitchToken[]; editable?: boolean; onMove?: (id: string, x: number, y: number) => void; width?: number; height?: number; }

function drawPitch(layer: Konva.Layer, w: number, h: number) {
  const stroke = 'rgba(255,255,255,0.55)';
  layer.add(new Konva.Rect({ x: 0, y: 0, width: w, height: h, fillLinearGradientStartPoint: { x: 0, y: 0 }, fillLinearGradientEndPoint: { x: 0, y: h }, fillLinearGradientColorStops: [0, '#15803d', 1, '#166534'] }));
  layer.add(new Konva.Rect({ x: 8, y: 8, width: w - 16, height: h - 16, stroke, strokeWidth: 2 }));
  layer.add(new Konva.Line({ points: [8, h / 2, w - 8, h / 2], stroke, strokeWidth: 2 }));
  layer.add(new Konva.Circle({ x: w / 2, y: h / 2, radius: Math.min(w, h) * 0.12, stroke, strokeWidth: 2 }));
  layer.add(new Konva.Circle({ x: w / 2, y: h / 2, radius: 3, fill: stroke }));
  const boxW = w * 0.5, boxH = h * 0.16, gx = (w - boxW) / 2;
  layer.add(new Konva.Rect({ x: gx, y: 8, width: boxW, height: boxH, stroke, strokeWidth: 2 }));
  layer.add(new Konva.Rect({ x: gx, y: h - 8 - boxH, width: boxW, height: boxH, stroke, strokeWidth: 2 }));
}

export const PitchStage: React.FC<Props> = ({ tokens, editable = false, onMove, width = 360, height = 540 }) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const tokenLayerRef = useRef<Konva.Layer | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const aspect = width / height;
  // Fit the container width, but never exceed the requested design width.
  const [dims, setDims] = useState(() => ({ w: width, h: height }));
  const measure = useCallback(() => {
    const avail = outerRef.current?.clientWidth || width;
    const w = Math.max(220, Math.min(avail, width));
    setDims(prev => { const h = Math.round(w / aspect); return (Math.abs(prev.w - w) < 2 && Math.abs(prev.h - h) < 2) ? prev : { w: Math.round(w), h }; });
  }, [aspect, width]);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (outerRef.current) ro.observe(outerRef.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [measure]);

  // Build the stage + static pitch once per size.
  useEffect(() => {
    if (!containerRef.current) return;
    const { w, h } = dims;
    const stage = new Konva.Stage({ container: containerRef.current, width: w, height: h });
    const bg = new Konva.Layer();
    drawPitch(bg, w, h);
    const tokenLayer = new Konva.Layer();
    stage.add(bg); stage.add(tokenLayer);
    bg.draw();
    stageRef.current = stage; tokenLayerRef.current = tokenLayer;
    return () => { stage.destroy(); stageRef.current = null; tokenLayerRef.current = null; };
  }, [dims]);

  // (Re)render tokens whenever they change.
  useEffect(() => {
    const layer = tokenLayerRef.current; const stage = stageRef.current;
    if (!layer || !stage) return;
    const { w, h } = dims;
    const sc = w / width; // scale tokens with the pitch so they stay proportional
    const r = 17 * sc;
    layer.destroyChildren();
    tokens.forEach(t => {
      const g = new Konva.Group({ x: t.x * w, y: t.y * h, draggable: editable });
      g.add(new Konva.Circle({ radius: r, fill: '#00C49A', stroke: '#0D1B2A', strokeWidth: 2, shadowColor: 'black', shadowBlur: 4, shadowOpacity: 0.3 }));
      g.add(new Konva.Text({ text: t.label, fontSize: 13 * sc, fontStyle: 'bold', fill: '#0D1B2A', width: r * 2.4, height: r * 2.4, offsetX: r * 1.2, offsetY: r * 1.2, align: 'center', verticalAlign: 'middle' }));
      if (t.sub) g.add(new Konva.Text({ text: t.sub, fontSize: 9 * sc, fill: '#fff', width: 80 * sc, offsetX: 40 * sc, y: r * 1.1, align: 'center' }));
      if (editable) {
        g.on('dragend', () => onMoveRef.current?.(t.id, Math.max(0, Math.min(1, g.x() / w)), Math.max(0, Math.min(1, g.y() / h))));
        g.on('mouseenter', () => { stage.container().style.cursor = 'grab'; });
        g.on('mouseleave', () => { stage.container().style.cursor = 'default'; });
      }
      layer.add(g);
    });
    layer.draw();
  }, [tokens, editable, dims, width]);

  return (
    <div ref={outerRef} className="w-full flex justify-center">
      <div ref={containerRef} style={{ width: dims.w, height: dims.h }} className="rounded-xl overflow-hidden shadow-inner touch-none" data-testid="pitch-stage" />
    </div>
  );
};
