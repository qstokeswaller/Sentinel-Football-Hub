import React, { useState, useRef, useEffect } from 'react';
import { Trash2, Film, PenTool, Maximize2, Minimize2, Menu, Video, BookmarkPlus, Upload, Link2, Loader2, ChevronUp, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react';
import { PitchCanvas, flipObjects, type DrillData, type ActiveTool, type ObjSize } from './PitchCanvas';
import { DrillToolbar } from './DrillToolbar';
import { AnimationStudio } from './AnimationStudio';
import { DrillDescription } from '../DrillDescription';
import { Select } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { useToast } from '../../context/ToastContext';
import { uploadVideoToR2 } from '../../services/videoService';
import { usePhone, useLandscape } from '../../hooks/useMediaQuery';
import { cn } from '../../lib/utils';
import type { PitchOrientation } from './pitchGeometry';
import type { PlannerDrill } from '../../services/plannerService';

/** DRILL_CATEGORIES — v7 category taxonomy (grouped). */
export const DRILL_CATEGORIES: { group: string; items: string[] }[] = [
  { group: 'Technical', items: ['Passing', 'First Touch', 'Dribbling', 'Shooting', 'Crossing', 'Heading', 'Ball Mastery'] },
  { group: 'Tactical', items: ['Attack', 'Defence', 'Transitions', 'Build-Up Play', 'Possession', 'Pressing', 'Counter-Attack', 'Set Pieces'] },
  { group: 'Physical', items: ['Warm-Up', 'Cool Down', 'Fitness', 'Agility', 'Speed'] },
  { group: 'Positional', items: ['Goalkeeper', 'Defending Shape', 'Midfield Rotations', 'Wing Play', 'Striker Movement'] },
  { group: 'Game-Based', items: ['Small-Sided Games', '1v1 / Duels', '2v2', '3v3+', 'Rondos', 'Match Simulation', 'Conditioned Games'] },
];

const INPUT = 'w-full rounded-lg border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-bg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand';

interface Props { drill: PlannerDrill; index: number; onChange: (d: PlannerDrill) => void; onRemove: () => void; canRemove: boolean; onSaveToLibrary?: () => void; savedToLibrary?: boolean; onMoveUp?: () => void; onMoveDown?: () => void; canMoveUp?: boolean; canMoveDown?: boolean; }

export const DrillBlock: React.FC<Props> = ({ drill, index, onChange, onRemove, canRemove, onSaveToLibrary, savedToLibrary, onMoveUp, onMoveDown, canMoveUp, canMoveDown }) => {
  const { showToast, showError } = useToast();
  const [videoOpen, setVideoOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [linkVal, setLinkVal] = useState('');
  // Per-drill mode (Static pitch builder vs Animated builder) + collapsible builder/descriptors.
  const mode: 'static' | 'animated' = drill.mode ?? (drill.animationId ? 'animated' : 'static');
  const stashAnimId = useRef<string | null>(drill.animationId || null);
  const [builderOpen, setBuilderOpen] = useState(true);
  const [descOpen, setDescOpen] = useState(true);
  const setStatic = () => { if (drill.animationId) stashAnimId.current = drill.animationId; onChange({ ...drill, mode: 'static', animationId: null }); };
  const setAnimated = () => { setBuilderOpen(true); onChange({ ...drill, mode: 'animated', animationId: drill.animationId || stashAnimId.current || null }); };
  const [tool, setTool] = useState<ActiveTool>('select');
  const [color, setColor] = useState('#e53935');
  const [size, setSize] = useState<ObjSize>('medium');
  const [fill, setFill] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const history = useRef<DrillData[]>([]);

  // Responsive builder: phones get a portrait-only pitch + a hamburger tool tray; all devices
  // get a fullscreen mode. Tablets/laptops keep the full side-panel toolbar.
  const isPhone = usePhone();
  const isLandscape = useLandscape();
  const [fullscreen, setFullscreen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [fullscreen]);

  // On phones the pitch is ALWAYS portrait — the coach makes it "landscape" by turning the phone
  // sideways (fullscreen). So we never expose an orientation toggle on phones.
  const effOrientation: PitchOrientation = isPhone ? 'portrait' : drill.orientation;
  const data: DrillData = { pitchType: drill.pitchType, orientation: effOrientation, objects: drill.objects, drawings: drill.drawings, flip: drill.flip, grid: drill.grid, gridColor: drill.gridColor, connectors: drill.connectors, fillShapes: drill.fillShapes };
  const pushHistory = () => { history.current.push({ ...data, objects: [...data.objects], drawings: [...data.drawings], connectors: [...(data.connectors || [])] }); if (history.current.length > 40) history.current.shift(); };

  const setData = (d: DrillData, record = true) => { if (record) pushHistory(); onChange({ ...drill, ...d }); };
  const undo = () => { const prev = history.current.pop(); if (prev) { onChange({ ...drill, ...prev }); setSelectedId(null); } };
  const clear = () => { pushHistory(); onChange({ ...drill, objects: [], drawings: [], connectors: [] }); setSelectedId(null); };
  const deleteSelected = () => {
    if (!selectedId) return; pushHistory();
    onChange({ ...drill, objects: drill.objects.filter(o => o.id !== selectedId), drawings: drill.drawings.filter(d => d.id !== selectedId), connectors: (drill.connectors || []).filter(c => c.id !== selectedId && c.from !== selectedId && c.to !== selectedId) });
    setSelectedId(null);
  };
  // Picking a colour/size also recolours/resizes the currently-selected item (v7 behaviour).
  const applyColor = (c: string) => {
    setColor(c);
    if (selectedId) { pushHistory(); onChange({ ...drill, objects: drill.objects.map(o => o.id === selectedId ? { ...o, color: c } : o), drawings: drill.drawings.map(d => d.id === selectedId ? { ...d, color: c } : d), connectors: (drill.connectors || []).map(c2 => c2.id === selectedId ? { ...c2, color: c } : c2) }); }
  };
  const applySize = (sz: ObjSize) => {
    setSize(sz);
    if (selectedId) { pushHistory(); onChange({ ...drill, objects: drill.objects.map(o => o.id === selectedId ? { ...o, size: sz } : o) }); }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface p-4 sm:p-5">
      {/* Row 1 — number, title, category, remove */}
      <div className="flex items-start gap-3">
        <span className="w-7 h-7 rounded-full bg-brand/15 text-brand flex items-center justify-center text-xs font-bold shrink-0 mt-1">{index + 1}</span>
        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input className={INPUT + ' sm:col-span-2'} value={drill.title} onChange={e => onChange({ ...drill, title: e.target.value })} placeholder="Drill title" />
          <Select value={drill.categoryTag || 'General'} onChange={e => onChange({ ...drill, categoryTag: e.target.value || 'General' })}>
            <option value="General">General</option>
            {DRILL_CATEGORIES.map(g => <optgroup key={g.group} label={g.group}>{g.items.map(it => <option key={it} value={it}>{it}</option>)}</optgroup>)}
          </Select>
        </div>
        {canRemove && <button onClick={onRemove} title="Remove drill" className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 shrink-0 mt-1"><Trash2 size={16} /></button>}
      </div>

      {/* Row 2 — Static/Animated toggle, then video · save-to-library · builder collapse */}
      <div className="flex items-center flex-wrap gap-2 mt-3">
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-sentinel-border overflow-hidden text-xs font-semibold">
          <button onClick={setStatic} className={'inline-flex items-center gap-1.5 px-3 h-8 transition-colors ' + (mode === 'static' ? 'bg-brand text-[#0a1628]' : 'text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5')}><PenTool size={13} /> Static</button>
          <button onClick={setAnimated} className={'inline-flex items-center gap-1.5 px-3 h-8 border-l border-slate-200 dark:border-sentinel-border transition-colors ' + (mode === 'animated' ? 'bg-brand text-[#0a1628]' : 'text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5')}><Film size={13} /> Animated</button>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {(onMoveUp || onMoveDown) && (
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-sentinel-border overflow-hidden">
              <button onClick={onMoveUp} disabled={!canMoveUp} title="Move drill up" className="inline-flex items-center justify-center w-8 h-8 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent"><ArrowUp size={14} /></button>
              <button onClick={onMoveDown} disabled={!canMoveDown} title="Move drill down" className="inline-flex items-center justify-center w-8 h-8 border-l border-slate-200 dark:border-sentinel-border text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent"><ArrowDown size={14} /></button>
            </div>
          )}
          <button onClick={() => setVideoOpen(true)} title={drill.videoUrl ? 'Video attached — view / change' : 'Attach video'}
            className={'inline-flex items-center gap-1.5 rounded-lg h-8 px-2.5 text-xs font-semibold border transition-colors ' + (drill.videoUrl ? 'border-brand bg-brand text-[#0a1628]' : 'border-brand/40 text-brand hover:bg-brand/10')}>
            <Video size={14} /> <span className="hidden sm:inline">{drill.videoUrl ? 'Video added' : 'Video'}</span></button>
          {onSaveToLibrary && <button onClick={onSaveToLibrary} title={savedToLibrary ? 'Saved to library — update' : 'Save this drill to the library'}
            className={'inline-flex items-center gap-1.5 rounded-lg h-8 px-2.5 text-xs font-semibold transition-colors ' + (savedToLibrary ? 'border border-brand bg-brand/15 text-brand' : 'bg-brand text-[#0a1628] hover:bg-brand-dark')}>
            <BookmarkPlus size={14} /> <span className="hidden sm:inline">{savedToLibrary ? 'Saved' : 'Save to library'}</span></button>}
          <button onClick={() => setBuilderOpen(o => !o)} title={builderOpen ? 'Hide drill builder' : 'Show drill builder'}
            className="inline-flex items-center gap-1.5 rounded-lg h-8 px-2.5 text-xs font-semibold border border-slate-200 dark:border-sentinel-border text-slate-600 dark:text-slate-300 hover:border-brand hover:text-brand transition-colors">
            {builderOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />} <span className="hidden sm:inline">Builder</span></button>
        </div>
      </div>

      {/* Attach-video modal — real footage saved to R2 (or an external link), kept with the drill. */}
      {videoOpen && (
        <Modal open onClose={() => setVideoOpen(false)} title="Drill video" size="lg">
          <div className="space-y-4 text-sm">
            {drill.videoUrl ? (
              <div className="space-y-2">
                <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-sentinel-border bg-black">
                  {/youtube\.com|youtu\.be|vimeo\.com/.test(drill.videoUrl)
                    ? <a href={drill.videoUrl} target="_blank" rel="noopener" className="block p-4 text-center text-brand hover:underline break-all">{drill.videoUrl}</a>
                    : <video src={drill.videoUrl} controls className="w-full max-h-64" />}
                </div>
                <button onClick={() => { onChange({ ...drill, videoUrl: undefined }); showToast('Video removed.', 'success'); }}
                  className="inline-flex items-center gap-1.5 text-xs text-rose-500 hover:underline"><Trash2 size={13} /> Remove video</button>
              </div>
            ) : (
              <p className="text-slate-500 dark:text-slate-400">Attach real footage of this drill. It saves with the drill — into the session and the library copy.</p>
            )}

            <label className={'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 dark:border-sentinel-border px-4 py-6 cursor-pointer hover:border-brand transition-colors ' + (uploading ? 'opacity-60 pointer-events-none' : '')}>
              {uploading
                ? <><Loader2 size={20} className="animate-spin text-brand" /><span className="text-xs text-slate-500">Uploading… {progress}%</span></>
                : <><Upload size={20} className="text-brand" /><span className="text-xs font-medium text-slate-600 dark:text-slate-300">{drill.videoUrl ? 'Replace with a new file' : 'Upload a video file'}</span><span className="text-[11px] text-slate-400">MP4 / MOV — stored on Cloudflare R2</span></>}
              <input type="file" accept="video/*" className="hidden" disabled={uploading} onChange={async e => {
                const file = e.target.files?.[0]; if (!file) return;
                setUploading(true); setProgress(0);
                try {
                  const url = await uploadVideoToR2(file, 'drill', drill.id || null, p => setProgress(Math.round(p)));
                  onChange({ ...drill, videoUrl: url }); showToast('Video uploaded & attached.', 'success'); setVideoOpen(false);
                } catch (err) { showError(err); } finally { setUploading(false); }
              }} />
            </label>

            <div className="flex items-center gap-2"><span className="h-px flex-1 bg-slate-200 dark:bg-sentinel-border" /><span className="text-[11px] uppercase tracking-wider text-slate-400">or paste a link</span><span className="h-px flex-1 bg-slate-200 dark:bg-sentinel-border" /></div>
            <div className="flex items-center gap-2">
              <input value={linkVal} onChange={e => setLinkVal(e.target.value)} placeholder="YouTube / Vimeo / video URL" className={INPUT} />
              <button disabled={!linkVal.trim()} onClick={() => { onChange({ ...drill, videoUrl: linkVal.trim() }); showToast('Video link attached.', 'success'); setLinkVal(''); setVideoOpen(false); }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-[#0a1628] disabled:opacity-40 shrink-0"><Link2 size={14} /> Attach</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Builder — Static pitch builder OR Animated builder (inline). Collapsible, so a drill can show just its descriptors. */}
      {builderOpen && (mode === 'animated' ? (
        <div className="mt-4">
          <AnimationStudio embedded titleOverride={drill.title} animationId={drill.animationId || undefined}
            onSaved={(id, meta) => onChange({ ...drill, mode: 'animated', animationId: id, pitchType: meta.pitchType, orientation: meta.orientation, title: meta.title || drill.title })} />
        </div>
      ) : (() => {
        // In fullscreen, reserve only the overlay padding (~16px each side) so the pitch grows
        // as tall as the viewport allows — which, because the pitch keeps real proportions, also
        // makes it as WIDE as possible and fills the side margins. The phone-inline pitch stays
        // LARGE (natural full-width size); `touchScroll` lets an empty-pitch drag scroll the page.
        const phoneInline = isPhone && !fullscreen;
        const canvasMaxHeight = fullscreen ? window.innerHeight - 36 : undefined;
        const toolbar = (
          <DrillToolbar
            pitchType={drill.pitchType} orientation={effOrientation}
            activeTool={tool} activeColor={color} size={size} fill={fill}
            onPitch={t => onChange({ ...drill, pitchType: t, grid: drill.grid === 'thirds' && t !== 'full' ? 'none' : drill.grid })} onOrientation={o => onChange({ ...drill, orientation: o })}
            grid={drill.grid} onGrid={g => onChange({ ...drill, grid: g })}
            gridColor={drill.gridColor} onGridColor={c => onChange({ ...drill, gridColor: c })}
            onTool={setTool} onColor={applyColor} onSize={applySize} onFill={setFill}
            fillShapes={drill.fillShapes} onFillShapes={v => { pushHistory(); onChange({ ...drill, fillShapes: v }); }}
            onUndo={undo} onClear={clear} onDeleteSelected={deleteSelected} canDelete={!!selectedId}
            flip={!!drill.flip} onFlip={() => { pushHistory(); const f = flipObjects(drill.objects, drill.drawings, effOrientation); onChange({ ...drill, flip: !drill.flip, objects: f.objects, drawings: f.drawings }); }}
            mobile={isPhone} open={toolsOpen} onClose={() => setToolsOpen(false)} landscape={isLandscape}
          />
        );
        const canvas = (
          <PitchCanvas data={data} editable activeTool={tool} activeColor={color} size={size} fill={fill}
            selectedId={selectedId} onSelect={setSelectedId} onChange={(d) => setData(d)} maxHeight={canvasMaxHeight} touchScroll={phoneInline} />
        );
        const FAB = 'inline-flex items-center justify-center w-11 h-11 rounded-full bg-[#0D1B2A] text-white shadow-lg active:scale-95 transition-transform';
        const fsToggle = (
          <button type="button" onClick={() => setFullscreen(f => !f)} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} className={isPhone ? FAB : 'inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#0D1B2A] text-white shadow hover:bg-[#0D1B2A]/90'}>
            {fullscreen ? <Minimize2 size={isPhone ? 18 : 16} /> : <Maximize2 size={isPhone ? 18 : 16} />}
          </button>
        );

        const body = isPhone ? (
          <div className="relative h-full flex items-center justify-center">
            {canvas}
            {/* Floating controls — hamburger opens the tool tray; fullscreen turns the builder
                into a sideways, distraction-free canvas. Stacked top-right in landscape. */}
            <div className={cn('absolute z-30 flex flex-col gap-2.5', isLandscape ? 'top-3 right-3' : 'bottom-3 right-3')}>
              <button type="button" onClick={() => setToolsOpen(true)} title="Tools" className={FAB}><Menu size={20} /></button>
              {fsToggle}
            </div>
            {toolbar /* mobile sheet — only visible when toolsOpen */}
          </div>
        ) : (
          <div className={cn('grid grid-cols-1 lg:grid-cols-[236px_1fr] gap-4', fullscreen ? 'h-full items-center' : 'items-start')}>
            <div>{toolbar}</div>
            {/* Pitch + fullscreen button side-by-side: the button sits BESIDE the pitch (top-aligned,
                real gap) instead of overlapping it — the pitch fills the remaining width. */}
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">{canvas}</div>
              <div className="shrink-0">{fsToggle}</div>
            </div>
          </div>
        );

        return fullscreen
          ? <div className="fixed inset-0 z-[60] bg-white dark:bg-sentinel-bg p-3 sm:p-4 overflow-auto">{body}</div>
          : <div className="mt-4">{body}</div>;
      })()
      )}

      {/* Descriptors — collapsible, independent of the builder */}
      <div className="mt-4 border-t border-slate-100 dark:border-sentinel-border pt-3">
        <button onClick={() => setDescOpen(o => !o)} className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-brand transition-colors">
          {descOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Description
        </button>
        {descOpen && <div className="mt-3"><DrillDescription value={drill.description} onChange={blob => onChange({ ...drill, description: blob })} /></div>}
      </div>
    </div>
  );
};
