import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Play, Pause, Square, ChevronLeft, ChevronRight, Plus, Copy, Trash2, Save, Layers, Route, Maximize2, Minimize2, Menu } from 'lucide-react';
import { Button } from '../ui/Button';
import { PitchCanvas, flipObjects, type PitchObject, type PitchDrawing, type ActiveTool, type ObjSize } from './PitchCanvas';
import { DrillToolbar } from './DrillToolbar';
import { renderDrillThumbnail } from './drillRenderer';
import { interpolate, pathDrawings } from './animationPlayback';
import type { PitchType, PitchOrientation, GridType } from './pitchGeometry';
import { useAppState } from '../../context/AppStateContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePhone, useLandscape } from '../../hooks/useMediaQuery';
import { cn } from '../../lib/utils';
import { saveAnimation, fetchAnimation } from '../../services/animationService';

/**
 * AnimationStudio — tactical animation builder.
 *
 * CRITICAL design (fixes the v7 pain points):
 *  • AUTHORED keyframes (`frames`) are the single source of truth and are NEVER mutated
 *    by playback. Editing only ever writes to frames[current].
 *  • Playback is a continuous clock that produces a TRANSIENT interpolated `display`.
 *    Pausing simply stops the clock (keeps elapsed) and leaves `display` frozen mid-tween
 *    — it never writes interpolated positions back into a frame. Resume continues from the
 *    exact elapsed time. Stop returns to authored frame 0.
 */
interface AnimFrame { id: string; objects: PitchObject[]; drawings: PitchDrawing[] }
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'f' + Math.random().toString(36).slice(2));
const INPUT = 'rounded-lg border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-bg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand';

export const AnimationStudio: React.FC<{
  animationId?: string;
  /** When in the session planner: called after save to add/update the animated drill in the session. */
  onSaved?: (id: string, meta: { title: string; pitchType: PitchType; orientation: PitchOrientation }) => void;
  /** Embedded inside a drill block — hides the internal title input (the drill header owns the
   *  title) and uses a compact Save row. */
  embedded?: boolean;
  titleOverride?: string;
}> = ({ animationId, onSaved, embedded, titleOverride }) => {
  const { effectiveClubId } = useAppState();
  const { user } = useAuth();
  const { showToast, showError } = useToast();

  const [title, setTitle] = useState('');
  const [pitchType, setPitchType] = useState<PitchType>('full');
  const [orientation, setOrientation] = useState<PitchOrientation>('landscape');
  const [flip, setFlip] = useState(false);
  const [grid, setGrid] = useState<GridType>('none');
  const [gridColor, setGridColor] = useState<string | undefined>();
  const [frameDuration, setFrameDuration] = useState(1500);
  const [frames, setFrames] = useState<AnimFrame[]>([{ id: uid(), objects: [], drawings: [] }]);
  const [current, setCurrent] = useState(0);
  const [tool, setTool] = useState<ActiveTool>('select');
  const [color, setColor] = useState('#e53935');
  const [size, setSize] = useState<ObjSize>('medium');
  const [fill, setFill] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [onion, setOnion] = useState(false);
  const [paths, setPaths] = useState(false);
  const [animId, setAnimId] = useState<string | undefined>();
  // Fullscreen / mobile (mirrors the static drill builder): immersive canvas + hamburger tools.
  const [fullscreen, setFullscreen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const isPhone = usePhone();
  const isLandscape = useLandscape();

  // Load an existing animation (when opened via /animation/:id).
  const seededRef = useRef(false);
  const { data: loaded } = useQuery({ queryKey: ['animation', animationId], queryFn: () => fetchAnimation(animationId!), enabled: !!animationId });
  useEffect(() => {
    if (loaded && !seededRef.current) {
      seededRef.current = true;
      setTitle(loaded.title); setPitchType(loaded.pitchType); setOrientation(loaded.orientation); setFlip(!!loaded.flip); setGrid(loaded.grid || 'none'); setGridColor(loaded.gridColor);
      setFrameDuration(loaded.frameDuration); setAnimId(loaded.id);
      setFrames(loaded.frames.length ? loaded.frames.map(f => ({ id: uid(), objects: f.objects, drawings: f.drawings })) : [{ id: uid(), objects: [], drawings: [] }]);
    }
  }, [loaded]);

  // Playback (transient) — display !== null means we're playing or paused.
  const [display, setDisplay] = useState<PitchObject[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const raf = useRef<number | null>(null);
  const elapsed = useRef(0);
  const playingRef = useRef(false);
  const framesRef = useRef(frames); framesRef.current = frames;
  const durRef = useRef(frameDuration); durRef.current = frameDuration;

  const stopLoop = () => { if (raf.current) cancelAnimationFrame(raf.current); raf.current = null; };
  const tick = useCallback(() => {
    const fr = framesRef.current; const total = (fr.length - 1) * durRef.current;
    const startedAt = performance.now() - elapsed.current;
    const step = () => {
      const e = performance.now() - startedAt;
      elapsed.current = total > 0 ? e % total : 0;
      const pos = total > 0 ? elapsed.current / durRef.current : 0;
      setDisplay(interpolate(framesRef.current, pos));
      if (playingRef.current) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, []);

  const play = () => { if (frames.length < 2) return; setSelectedId(null); playingRef.current = true; setPlaying(true); tick(); };
  const pause = () => { playingRef.current = false; setPlaying(false); stopLoop(); /* display stays frozen; frames untouched */ };
  const stop = () => { playingRef.current = false; setPlaying(false); stopLoop(); elapsed.current = 0; setDisplay(null); setCurrent(0); };
  useEffect(() => () => stopLoop(), []);
  // Fullscreen: Escape to exit + lock body scroll while the overlay is open.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [fullscreen]);
  // On phones the pitch is ALWAYS portrait (turn the phone sideways + fullscreen for landscape).
  const effOrientation: PitchOrientation = isPhone ? 'portrait' : orientation;

  // ── Frame editing (only ever writes authored frames[current]) ──
  const editing = display === null;
  const histRef = useRef<AnimFrame[][]>([]);
  const snapshot = () => { histRef.current.push(framesRef.current.map(f => ({ id: f.id, objects: f.objects.map(o => ({ ...o })), drawings: f.drawings.map(d => ({ ...d })) }))); if (histRef.current.length > 50) histRef.current.shift(); };
  const setFrameData = (objects: PitchObject[], drawings: PitchDrawing[]) => {
    snapshot();
    setFrames(fs => fs.map((f, i) => i === current ? { ...f, objects, drawings } : f));
  };
  const goFrame = (i: number) => { if (!editing) stop(); setCurrent(Math.max(0, Math.min(i, frames.length - 1))); setSelectedId(null); };
  const addFrame = () => { snapshot(); const dup = { id: uid(), objects: frames[current].objects.map(o => ({ ...o })), drawings: frames[current].drawings.map(d => ({ ...d })) }; setFrames(fs => [...fs.slice(0, current + 1), dup, ...fs.slice(current + 1)]); setCurrent(current + 1); };
  const dupFrame = addFrame;
  const delFrame = () => { if (frames.length <= 1) return; snapshot(); setFrames(fs => fs.filter((_, i) => i !== current)); setCurrent(c => Math.max(0, c - 1)); };

  const undo = () => { const prev = histRef.current.pop(); if (prev) { setFrames(prev); setCurrent(c => Math.min(c, prev.length - 1)); setSelectedId(null); } };
  const clearFrame = () => setFrameData([], []);
  const deleteSelected = () => { if (!selectedId) return; const f = frames[current]; setFrameData(f.objects.filter(o => o.id !== selectedId), f.drawings.filter(d => d.id !== selectedId)); setSelectedId(null); };
  // Recolour / resize the selected item (v7 behaviour).
  const applyColor = (c: string) => { setColor(c); if (selectedId && editing) { const f = frames[current]; setFrameData(f.objects.map(o => o.id === selectedId ? { ...o, color: c } : o), f.drawings.map(d => d.id === selectedId ? { ...d, color: c } : d)); } };
  const applySize = (sz: ObjSize) => { setSize(sz); if (selectedId && editing) { const f = frames[current]; setFrameData(f.objects.map(o => o.id === selectedId ? { ...o, size: sz } : o), f.drawings); } };

  // ── What the canvas shows ──
  const baseObjects = editing ? frames[current].objects : (display || []);
  const baseDrawings = editing ? frames[current].drawings : frames[Math.min(current, frames.length - 1)].drawings;
  const shownDrawings = useMemo(() => paths ? [...baseDrawings, ...pathDrawings(frames)] : baseDrawings, [paths, baseDrawings, frames]);
  const ghost = onion && editing && current > 0 ? frames[current - 1].objects : undefined;
  // Path editing: when "Paths" is on, expose draggable bend handles for objects that move to the
  // NEXT frame. Dragging writes a bézier control point (curve) onto the object in the current frame.
  const nextFrame = current < frames.length - 1 ? frames[current + 1] : null;
  const motion = paths && editing && nextFrame ? {
    targets: nextFrame.objects,
    onCurve: (id: string, ctrl: { x: number; y: number } | null) => {
      const f = frames[current];
      setFrameData(f.objects.map(o => o.id === id ? { ...o, curve: ctrl || undefined } : o), f.drawings);
    },
  } : undefined;

  const save = async () => {
    if (!effectiveClubId) return;
    try {
      const saveTitle = (embedded ? titleOverride : title)?.trim() || 'Untitled Animation';
      const id = await saveAnimation(effectiveClubId, user?.id ?? null, {
        id: animId, title: saveTitle, frameDuration, pitchType, orientation, flip, grid, gridColor,
        frames: frames.map(f => ({ objects: f.objects, drawings: f.drawings })),
        thumbnail: renderDrillThumbnail({ pitchType, orientation, flip, grid, gridColor, objects: frames[0].objects, drawings: frames[0].drawings }, 320),
      });
      setAnimId(id);
      if (onSaved) onSaved(id, { title: saveTitle, pitchType, orientation });
      else showToast('Animation saved.', 'success');
    } catch (e) { showError(e); }
  };

  const tBtn = 'inline-flex items-center justify-center w-9 h-9 rounded-md bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-40';

  const immersive = fullscreen || isPhone; // immersive = fullscreen OR phone → hamburger tools + top controls
  const canvasMaxHeight = fullscreen ? window.innerHeight - (isPhone ? 120 : 230) : undefined;
  const FAB = 'inline-flex items-center justify-center w-11 h-11 rounded-full bg-[#0D1B2A] text-white shadow-lg active:scale-95 transition-transform';

  // Animation playback + frame controls (top bar) — shared by inline + immersive.
  const controlsBar = (
    <div className="flex items-center gap-1.5 flex-wrap">
      {playing ? <button className={tBtn} title="Pause" onClick={pause}><Pause size={15} /></button>
        : <button className={tBtn} title="Play" onClick={play} disabled={frames.length < 2}><Play size={15} /></button>}
      <button className={tBtn} title="Stop" onClick={stop}><Square size={14} /></button>
      <span className="w-px h-6 bg-slate-200 dark:bg-sentinel-border mx-1" />
      <button className={tBtn} title="Previous frame" onClick={() => goFrame(current - 1)}><ChevronLeft size={16} /></button>
      <button className={tBtn} title="Next frame" onClick={() => goFrame(current + 1)}><ChevronRight size={16} /></button>
      <button className={tBtn} title="Add frame" onClick={addFrame}><Plus size={15} /></button>
      <button className={tBtn} title="Duplicate frame" onClick={dupFrame}><Copy size={14} /></button>
      <button className={tBtn} title="Delete frame" onClick={delFrame} disabled={frames.length <= 1}><Trash2 size={14} /></button>
      <span className="w-px h-6 bg-slate-200 dark:bg-sentinel-border mx-1" />
      <label className="text-xs text-slate-500 flex items-center gap-1.5">Speed
        <input type="range" min={400} max={4000} step={100} value={frameDuration} onChange={e => setFrameDuration(Number(e.target.value))} className="w-24" />
        <span className="w-9 tabular-nums">{(frameDuration / 1000).toFixed(1)}s</span>
      </label>
      <button className={tBtn + (onion ? ' !bg-brand !text-[#0D1B2A]' : '')} title="Onion skin (ghost of previous frame)" onClick={() => setOnion(o => !o)}><Layers size={15} /></button>
      <button className={tBtn + (paths ? ' !bg-brand !text-[#0D1B2A]' : '')} title="Movement paths — drag a run's handle to curve it" onClick={() => setPaths(p => !p)}><Route size={15} /></button>
      {immersive && <button className={tBtn} title="Save animation" onClick={save}><Save size={15} /></button>}
      <span className="ml-auto text-xs text-slate-400 hidden sm:inline">{editing ? `Frame ${current + 1} / ${frames.length}` : playing ? 'Playing…' : 'Paused'}</span>
    </div>
  );

  const frameStrip = (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {frames.map((f, i) => (
        <button key={f.id} onClick={() => goFrame(i)}
          className={'relative shrink-0 w-24 rounded-md overflow-hidden border-2 transition-colors ' + (editing && current === i ? 'border-brand' : 'border-transparent hover:border-slate-300 dark:hover:border-sentinel-border')}>
          <img src={renderDrillThumbnail({ pitchType, orientation: effOrientation, flip, grid, gridColor, objects: f.objects, drawings: f.drawings }, 300)} alt={`Frame ${i + 1}`} className="w-full block" />
          <span className="absolute bottom-0 left-0 text-[10px] font-bold bg-black/50 text-white px-1.5 rounded-tr">{i + 1}</span>
        </button>
      ))}
    </div>
  );

  const toolbarEl = (
    <DrillToolbar
      pitchType={pitchType} orientation={effOrientation} activeTool={tool} activeColor={color} size={size} fill={fill}
      onPitch={t => { setPitchType(t); if (grid === 'thirds' && t !== 'full') setGrid('none'); }} onOrientation={setOrientation}
      grid={grid} onGrid={setGrid} gridColor={gridColor} onGridColor={setGridColor}
      onTool={setTool} onColor={applyColor} onSize={applySize} onFill={setFill}
      onUndo={undo} onClear={clearFrame} onDeleteSelected={deleteSelected} canDelete={!!selectedId && editing}
      flip={flip} onFlip={() => { snapshot(); setFrames(fs => fs.map(fr => { const m = flipObjects(fr.objects, fr.drawings, effOrientation); return { ...fr, objects: m.objects, drawings: m.drawings }; })); setFlip(f => !f); }}
      mobile={immersive} open={toolsOpen} onClose={() => setToolsOpen(false)} landscape={isLandscape}
    />
  );

  const canvasEl = (
    <PitchCanvas
      data={{ pitchType, orientation: effOrientation, flip, grid, gridColor, objects: baseObjects, drawings: shownDrawings }}
      editable={editing} activeTool={tool} activeColor={color} size={size} fill={fill}
      selectedId={selectedId} onSelect={setSelectedId} ghostObjects={ghost} motion={motion} maxHeight={canvasMaxHeight}
      onChange={d => editing && setFrameData(d.objects, d.drawings)}
    />
  );

  const fsToggle = (
    <button type="button" onClick={() => setFullscreen(f => !f)} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      className={isPhone ? FAB : 'inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#0D1B2A] text-white shadow hover:bg-[#0D1B2A]/90'}>
      {fullscreen ? <Minimize2 size={isPhone ? 18 : 16} /> : <Maximize2 size={isPhone ? 18 : 16} />}
    </button>
  );

  // Immersive (fullscreen desktop OR phone): controls on top, big canvas, hamburger tool tray + fullscreen FAB.
  const immersiveBody = (
    <div className={cn('flex flex-col gap-2', fullscreen && 'h-full min-h-0')}>
      <div className="rounded-xl border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg p-2 shrink-0">
        {controlsBar}
        {!isPhone && <div className="mt-2">{frameStrip}</div>}
      </div>
      <div className={cn('relative flex items-center justify-center', fullscreen && 'flex-1 min-h-0')}>
        {canvasEl}
        <div className={cn('absolute z-30 flex flex-col gap-2.5', isLandscape ? 'top-3 right-3' : 'top-3 right-3')}>
          <button type="button" onClick={() => setToolsOpen(true)} title="Tools" className={FAB}><Menu size={20} /></button>
          {fsToggle}
        </div>
      </div>
      {toolbarEl}
    </div>
  );

  // Inline desktop: timeline card + side toolbar + pitch (with a Fullscreen button on the pitch).
  const inlineBody = (
    <>
      <div className="rounded-xl border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg p-3">
        {controlsBar}
        <div className="mt-3">{frameStrip}</div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[236px_1fr] gap-4 items-start">
        {toolbarEl}
        <div>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">{canvasEl}</div>
            <div className="shrink-0">{fsToggle}</div>
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">
            {editing ? (paths && nextFrame ? 'Drag a run’s white handle to curve the path; double-click it (or drag back to centre) to straighten. Curves play back on the pitch.' : 'Place objects, then Add Frame and move them — playback interpolates between frames. Turn on Paths (route icon) to bend runs into curves.') : 'Press Stop to return to editing your authored frames.'}
          </p>
        </div>
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      {!immersive && (embedded ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">Build the frames below, then save the animation to keep it with this drill.</span>
          <Button variant="primary" onClick={save}><Save size={15} /> Save Animation</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input className={INPUT + ' flex-1 min-w-[200px]'} value={title} onChange={e => setTitle(e.target.value)} placeholder="Animation name…" />
          <Button variant="primary" onClick={save}><Save size={15} /> Save Animation</Button>
        </div>
      ))}
      {immersive
        ? (fullscreen
            ? <div className="fixed inset-0 z-[60] bg-white dark:bg-sentinel-bg p-3 sm:p-4 overflow-auto flex flex-col">{immersiveBody}</div>
            : <div className="mt-2">{immersiveBody}</div>)
        : inlineBody}
    </div>
  );
};
