import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { drawDrill } from './drillRenderer';
import { interpolate } from './animationPlayback';
import type { AnimationFrame } from '../../services/animationService';
import { pitchAspect, type PitchType, type PitchOrientation, type GridType } from './pitchGeometry';

/**
 * Read-only animation player (public share pages). Smoothly interpolates between
 * authored frames on a 2D canvas. Play / pause / scrub — pause just stops the clock
 * (position preserved); frames are never mutated.
 */
interface Props { frames: AnimationFrame[]; pitchType?: PitchType; orientation?: PitchOrientation; frameDuration?: number; flip?: boolean; grid?: GridType; gridColor?: string; autoPlay?: boolean }

export const AnimationPlayer: React.FC<Props> = ({ frames, pitchType = 'full', orientation = 'landscape', frameDuration = 1500, flip = false, grid = 'none', gridColor, autoPlay = false }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(autoPlay);
  const [pos, setPos] = useState(0); // fractional position 0..frames.length-1
  const raf = useRef<number | null>(null);
  const elapsed = useRef(0);
  const playingRef = useRef(autoPlay); playingRef.current = playing;
  const safe = frames?.length ? frames : [{ objects: [], drawings: [] }];
  const multi = safe.length > 1;
  const aspect = pitchAspect(pitchType, orientation);

  const paint = useCallback((p: number) => {
    const cv = canvasRef.current, wrap = wrapRef.current; if (!cv || !wrap) return;
    const W = wrap.clientWidth || 520, H = Math.round(W / aspect);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
    const ctx = cv.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const seg = Math.min(Math.floor(p), safe.length - 1);
    drawDrill(ctx, W, H, { pitchType, orientation, flip, grid, gridColor, objects: interpolate(safe, p), drawings: safe[seg]?.drawings || [] });
  }, [aspect, pitchType, orientation, flip, grid, gridColor, safe]);

  // Playback clock.
  useEffect(() => {
    if (!playing || !multi) { paint(pos); return; }
    const total = (safe.length - 1) * Math.max(300, frameDuration);
    const startedAt = performance.now() - elapsed.current;
    const step = () => {
      const e = performance.now() - startedAt; elapsed.current = total > 0 ? e % total : 0;
      const p = elapsed.current / Math.max(300, frameDuration);
      setPos(p); paint(p);
      if (playingRef.current) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [playing, multi, frameDuration, safe.length, paint]); // eslint-disable-line

  useEffect(() => { const ro = new ResizeObserver(() => paint(pos)); if (wrapRef.current) ro.observe(wrapRef.current); return () => ro.disconnect(); }, [paint, pos]);

  return (
    <div>
      <div ref={wrapRef} className="relative rounded-lg overflow-hidden border border-slate-200 w-full" style={{ aspectRatio: String(aspect) }}>
        <canvas ref={canvasRef} className="block w-full" />
        {multi && !playing && (
          <button onClick={() => setPlaying(true)} className="absolute inset-0 flex items-center justify-center group" aria-label="Play animation">
            <span className="w-16 h-16 rounded-full bg-black/45 text-white flex items-center justify-center group-hover:bg-brand group-hover:text-[#0a1628] transition-colors"><Play size={28} className="ml-1" /></span>
          </button>
        )}
      </div>
      {multi && (
        <div className="flex items-center gap-3 mt-2">
          <button onClick={() => setPlaying(p => !p)} className="w-9 h-9 rounded-full bg-brand text-[#0D1B2A] flex items-center justify-center hover:bg-brand/90" aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
          </button>
          <button onClick={() => { elapsed.current = 0; setPos(0); setPlaying(true); }} className="w-8 h-8 rounded-full border border-slate-200 text-slate-500 flex items-center justify-center hover:border-brand hover:text-brand" aria-label="Restart"><RotateCcw size={14} /></button>
          <input type="range" min={0} max={safe.length - 1} step={0.02} value={pos} onChange={e => { setPlaying(false); const p = Number(e.target.value); elapsed.current = p * Math.max(300, frameDuration); setPos(p); paint(p); }} className="flex-1 accent-brand" />
          <span className="text-xs font-medium text-slate-500 tabular-nums w-12 text-right">{Math.min(Math.floor(pos) + 1, safe.length)}/{safe.length}</span>
        </div>
      )}
    </div>
  );
};
