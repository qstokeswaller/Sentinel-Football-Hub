import React, { useEffect, useRef } from 'react';
import Konva from 'konva';

/**
 * Drill drawing surface (raw Konva, landscape pitch). Place players/cones/balls
 * with the active tool, drag to position, double-click to remove. Shapes use
 * normalised x/y (0–1) and persist to drills.drawing_data.shapes.
 */
export type DrillTool = 'player' | 'cone' | 'ball';
export interface DrillShape { id: string; type: DrillTool; x: number; y: number; label?: string }
interface Props {
  shapes: DrillShape[]; editable?: boolean; activeTool?: DrillTool | null;
  onChange?: (shapes: DrillShape[]) => void; width?: number; height?: number;
}

export function drawPitch(layer: Konva.Layer, w: number, h: number) {
  const stroke = 'rgba(255,255,255,0.55)';
  layer.add(new Konva.Rect({ x: 0, y: 0, width: w, height: h, fillLinearGradientStartPoint: { x: 0, y: 0 }, fillLinearGradientEndPoint: { x: w, y: 0 }, fillLinearGradientColorStops: [0, '#15803d', 1, '#166534'], name: 'bg' }));
  layer.add(new Konva.Rect({ x: 8, y: 8, width: w - 16, height: h - 16, stroke, strokeWidth: 2, name: 'bg' }));
  layer.add(new Konva.Line({ points: [w / 2, 8, w / 2, h - 8], stroke, strokeWidth: 2, name: 'bg' }));
  layer.add(new Konva.Circle({ x: w / 2, y: h / 2, radius: Math.min(w, h) * 0.13, stroke, strokeWidth: 2, name: 'bg' }));
  const boxH = h * 0.5, boxW = w * 0.16, gy = (h - boxH) / 2;
  layer.add(new Konva.Rect({ x: 8, y: gy, width: boxW, height: boxH, stroke, strokeWidth: 2, name: 'bg' }));
  layer.add(new Konva.Rect({ x: w - 8 - boxW, y: gy, width: boxW, height: boxH, stroke, strokeWidth: 2, name: 'bg' }));
}

export function buildShape(s: DrillShape, w: number, h: number, editable: boolean): Konva.Group {
  const g = new Konva.Group({ x: s.x * w, y: s.y * h, draggable: editable, id: s.id });
  if (s.type === 'player') {
    g.add(new Konva.Circle({ radius: 13, fill: '#00C49A', stroke: '#0D1B2A', strokeWidth: 2 }));
    g.add(new Konva.Text({ text: s.label || '', fontSize: 12, fontStyle: 'bold', fill: '#0D1B2A', width: 26, height: 26, offsetX: 13, offsetY: 13, align: 'center', verticalAlign: 'middle' }));
  } else if (s.type === 'cone') {
    g.add(new Konva.RegularPolygon({ sides: 3, radius: 11, fill: '#f97316', stroke: '#7c2d12', strokeWidth: 1.5 }));
  } else {
    g.add(new Konva.Circle({ radius: 8, fill: '#ffffff', stroke: '#0D1B2A', strokeWidth: 1.5 }));
  }
  return g;
}

export const DrillPitch: React.FC<Props> = ({ shapes = [], editable = false, activeTool = null, onChange, width = 520, height = 340 }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const shapeLayerRef = useRef<Konva.Layer | null>(null);
  const stateRef = useRef({ shapes, activeTool, editable, onChange });
  stateRef.current = { shapes, activeTool, editable, onChange };

  // Build stage + pitch + add-on-click once.
  useEffect(() => {
    if (!containerRef.current) return;
    const stage = new Konva.Stage({ container: containerRef.current, width, height });
    const bg = new Konva.Layer();
    drawPitch(bg, width, height);
    const shapeLayer = new Konva.Layer();
    stage.add(bg); stage.add(shapeLayer); bg.draw();
    stageRef.current = stage; shapeLayerRef.current = shapeLayer;

    stage.on('click tap', (e) => {
      const { editable: ed, activeTool: tool, shapes: sh, onChange: cb } = stateRef.current;
      if (!ed || !tool) return;
      // only add when clicking empty pitch (a bg node or the stage), not an existing shape
      if (e.target !== stage && e.target.name() !== 'bg') return;
      const pos = stage.getPointerPosition(); if (!pos) return;
      const next = [...sh, { id: crypto.randomUUID(), type: tool, x: pos.x / width, y: pos.y / height, label: tool === 'player' ? String(sh.filter(s => s.type === 'player').length + 1) : undefined }];
      cb?.(next);
    });
    return () => { stage.destroy(); stageRef.current = null; shapeLayerRef.current = null; };
  }, [width, height]);

  // (Re)render shapes.
  useEffect(() => {
    const layer = shapeLayerRef.current; const stage = stageRef.current;
    if (!layer || !stage) return;
    layer.destroyChildren();
    shapes.forEach(s => {
      const g = buildShape(s, width, height, editable);
      if (editable) {
        g.on('dragend', () => {
          const { shapes: sh, onChange: cb } = stateRef.current;
          cb?.(sh.map(x => x.id === s.id ? { ...x, x: Math.max(0, Math.min(1, g.x() / width)), y: Math.max(0, Math.min(1, g.y() / height)) } : x));
        });
        g.on('dblclick dbltap', () => {
          const { shapes: sh, onChange: cb } = stateRef.current;
          cb?.(sh.filter(x => x.id !== s.id));
        });
        g.on('mouseenter', () => { stage.container().style.cursor = 'grab'; });
        g.on('mouseleave', () => { stage.container().style.cursor = stateRef.current.activeTool ? 'crosshair' : 'default'; });
      }
      layer.add(g);
    });
    layer.draw();
  }, [shapes, editable, width, height]);

  // Cursor reflects the active tool.
  useEffect(() => {
    if (stageRef.current) stageRef.current.container().style.cursor = editable && activeTool ? 'crosshair' : 'default';
  }, [activeTool, editable]);

  return <div ref={containerRef} style={{ width, height }} className="rounded-xl overflow-hidden mx-auto shadow-inner" data-testid="drill-pitch" />;
};
