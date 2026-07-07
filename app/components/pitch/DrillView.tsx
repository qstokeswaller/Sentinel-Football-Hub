import React, { useRef, useEffect, useCallback } from 'react';
import { drawDrill } from './drillRenderer';
import { pitchAspect, type PitchType, type PitchOrientation, type GridType } from './pitchGeometry';
import type { PitchObject, PitchDrawing } from './PitchCanvas';

/** Read-only static drill render (2D canvas, responsive). Used on the public share
 *  page, library detail and anywhere a non-interactive drill needs to display. */
interface Props { pitchType: PitchType; orientation: PitchOrientation; objects: PitchObject[]; drawings: PitchDrawing[]; flip?: boolean; grid?: GridType; gridColor?: string; className?: string }

export const DrillView: React.FC<Props> = ({ pitchType, orientation, objects, drawings, flip, grid, gridColor, className }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aspect = pitchAspect(pitchType, orientation);

  const paint = useCallback(() => {
    const cv = canvasRef.current, wrap = wrapRef.current; if (!cv || !wrap) return;
    const W = wrap.clientWidth || 520, H = Math.round(W / aspect);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const ctx = cv.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawDrill(ctx, W, H, { pitchType, orientation, objects, drawings, flip, grid, gridColor });
  }, [aspect, pitchType, orientation, objects, drawings, flip, grid, gridColor]);

  useEffect(() => { paint(); const ro = new ResizeObserver(paint); if (wrapRef.current) ro.observe(wrapRef.current); return () => ro.disconnect(); }, [paint]);

  return <div ref={wrapRef} className={'w-full rounded-lg overflow-hidden ' + (className || '')} style={{ aspectRatio: String(aspect) }}><canvas ref={canvasRef} className="block" /></div>;
};
