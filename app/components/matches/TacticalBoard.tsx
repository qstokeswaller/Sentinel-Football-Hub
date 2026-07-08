import React, { useRef, useState, useEffect } from 'react';
import { Users, UserX, PenTool, Film, Maximize2, Minimize2, Menu } from 'lucide-react';
import { PitchCanvas, flipObjects, type DrillData, type PitchObject, type ActiveTool, type ObjSize } from '../pitch/PitchCanvas';
import { DrillToolbar } from '../pitch/DrillToolbar';
import { AnimationStudio } from '../pitch/AnimationStudio';
import { formationSlots } from '../../lib/formations';
import { Textarea } from '../ui/Input';
import { usePhone, useLandscape } from '../../hooks/useMediaQuery';
import { cn } from '../../lib/utils';
import type { PitchOrientation } from '../pitch/pitchGeometry';
import type { PlanBoard } from '../../services/matchPlanService';

/**
 * TacticalBoard — a match-plan drawing surface. Reuses the drill canvas (DrillToolbar +
 * PitchCanvas) for STATIC plans, or the AnimationStudio for ANIMATED multi-step plans.
 * "Show Formation" drops your XI tokens onto the board; "Show Opposition" drops the
 * opponent's expected shape (mirrored, red) so you can plan against their formation.
 * Mobile-aware (like the session planner's DrillBlock): phones get a portrait pitch +
 * a hamburger tool tray, and every device gets a fullscreen mode.
 */
const OUR_COLOR = '#00C49A';
const OPP_COLOR = '#ef4444';
const emptyData = (): DrillData => ({ pitchType: 'full', orientation: 'landscape', objects: [], drawings: [], connectors: [], flip: false });

function buildTokens(formation: string, prefix: string, color: string, labels: string[] | undefined, mirror: boolean): PitchObject[] {
  return formationSlots(formation).map((s, i) => ({
    id: `${prefix}${i}`, type: s.pos === 'GK' ? 'gk' : 'player',
    x: mirror ? 1 - s.x : s.x, y: mirror ? 1 - s.y : s.y,
    color, size: 'medium' as ObjSize, label: labels?.[i] || s.pos,
  }));
}

interface Props {
  value: PlanBoard;
  onChange: (b: PlanBoard) => void;
  ourFormation: string;
  ourLabels?: string[];
  oppFormation?: string;
  notesPlaceholder?: string;
  showNotes?: boolean;
}

export const TacticalBoard: React.FC<Props> = ({ value, onChange, ourFormation, ourLabels, oppFormation = '4-3-3', notesPlaceholder, showNotes = true }) => {
  const mode = value.mode || 'static';
  const data: DrillData = { ...emptyData(), ...(value.data || {}) };
  const [tool, setTool] = useState<ActiveTool>('select');
  const [color, setColor] = useState('#e53935');
  const [size, setSize] = useState<ObjSize>('medium');
  const [fill, setFill] = useState(false);
  const [playerStyle, setPlayerStyle] = useState<'dot' | 'jersey' | 'shaper'>('dot');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const history = useRef<DrillData[]>([]);

  // Responsive builder (mirrors the session planner): phones get a portrait-only pitch + a
  // hamburger tool tray; all devices get a fullscreen mode. Tablets/laptops keep the side panel.
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
  // On phones the pitch is ALWAYS portrait — the coach makes it "landscape" by turning the phone.
  const effOrientation: PitchOrientation = isPhone ? 'portrait' : data.orientation;

  const setData = (d: DrillData, record = true) => {
    if (record) { history.current.push({ ...data, objects: [...data.objects], drawings: [...data.drawings], connectors: [...(data.connectors || [])] }); if (history.current.length > 40) history.current.shift(); }
    onChange({ ...value, data: d });
  };
  const undo = () => { const prev = history.current.pop(); if (prev) { onChange({ ...value, data: prev }); setSelectedId(null); } };
  const clear = () => { setData({ ...data, objects: [], drawings: [], connectors: [] }); setSelectedId(null); };
  const deleteSelected = () => { if (!selectedId) return; setData({ ...data, objects: data.objects.filter(o => o.id !== selectedId), drawings: data.drawings.filter(d => d.id !== selectedId), connectors: (data.connectors || []).filter(c => c.id !== selectedId && c.from !== selectedId && c.to !== selectedId) }); setSelectedId(null); };
  const applyColor = (c: string) => { setColor(c); if (selectedId) setData({ ...data, objects: data.objects.map(o => o.id === selectedId ? { ...o, color: c } : o), drawings: data.drawings.map(d => d.id === selectedId ? { ...d, color: c } : d), connectors: (data.connectors || []).map(c2 => c2.id === selectedId ? { ...c2, color: c } : c2) }); };
  const applySize = (sz: ObjSize) => { setSize(sz); if (selectedId) setData({ ...data, objects: data.objects.map(o => o.id === selectedId ? { ...o, size: sz } : o) }); };

  const hasOurs = data.objects.some(o => o.id.startsWith('fm-'));
  const hasOpp = data.objects.some(o => o.id.startsWith('opp-'));
  const toggleOurs = () => setData({ ...data, objects: hasOurs ? data.objects.filter(o => !o.id.startsWith('fm-')) : [...data.objects, ...buildTokens(ourFormation, 'fm-', OUR_COLOR, ourLabels, false)] });
  const toggleOpp = () => setData({ ...data, objects: hasOpp ? data.objects.filter(o => !o.id.startsWith('opp-')) : [...data.objects, ...buildTokens(oppFormation, 'opp-', OPP_COLOR, undefined, true)] });

  // In fullscreen, reserve only the overlay padding so the pitch grows as tall as the viewport.
  // The phone-inline board stays LARGE; `touchScroll` lets an empty-pitch drag scroll the page.
  const phoneInline = isPhone && !fullscreen;
  const canvasMaxHeight = fullscreen ? window.innerHeight - 36 : undefined;
  const toolbar = (
    <DrillToolbar
      pitchType={data.pitchType} orientation={effOrientation}
      activeTool={tool} activeColor={color} size={size} fill={fill}
      onPitch={t => setData({ ...data, pitchType: t, grid: data.grid === 'thirds' && t !== 'full' ? 'none' : data.grid }, false)} onOrientation={o => setData({ ...data, orientation: o }, false)}
      grid={data.grid} onGrid={g => setData({ ...data, grid: g }, false)}
      gridColor={data.gridColor} onGridColor={c => setData({ ...data, gridColor: c }, false)}
      onTool={setTool} onColor={applyColor} onSize={applySize} onFill={setFill}
      playerStyle={playerStyle} onPlayerStyle={setPlayerStyle}
      fillShapes={data.fillShapes} onFillShapes={v => setData({ ...data, fillShapes: v })}
      onUndo={undo} onClear={clear} onDeleteSelected={deleteSelected} canDelete={!!selectedId}
      flip={!!data.flip} onFlip={() => { const f = flipObjects(data.objects, data.drawings, effOrientation); setData({ ...data, flip: !data.flip, objects: f.objects, drawings: f.drawings }); }}
      mobile={isPhone} open={toolsOpen} onClose={() => setToolsOpen(false)} landscape={isLandscape}
    />
  );
  const canvas = (
    <PitchCanvas data={{ ...data, orientation: effOrientation }} editable activeTool={tool} activeColor={color} size={size} fill={fill} playerStyle={playerStyle}
      selectedId={selectedId} onSelect={setSelectedId} onChange={(d) => setData(d)} maxHeight={canvasMaxHeight} touchScroll={phoneInline} />
  );
  const FAB = 'inline-flex items-center justify-center w-11 h-11 rounded-full bg-[#0D1B2A] text-white shadow-lg active:scale-95 transition-transform';
  const fsToggle = (
    <button type="button" onClick={() => setFullscreen(f => !f)} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} className={isPhone ? FAB : 'inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#0D1B2A] text-white shadow hover:bg-[#0D1B2A]/90'}>
      {fullscreen ? <Minimize2 size={isPhone ? 18 : 16} /> : <Maximize2 size={isPhone ? 18 : 16} />}
    </button>
  );

  const builderBody = isPhone ? (
    <div className="relative h-full flex items-center justify-center">
      {canvas}
      <div className={cn('absolute z-30 flex flex-col gap-2.5', isLandscape ? 'top-3 right-3' : 'bottom-3 right-3')}>
        <button type="button" onClick={() => setToolsOpen(true)} title="Tools" className={FAB}><Menu size={20} /></button>
        {fsToggle}
      </div>
      {toolbar /* mobile sheet — only visible when toolsOpen */}
    </div>
  ) : (
    <div className={cn('grid grid-cols-1 lg:grid-cols-[236px_1fr] gap-4', fullscreen ? 'h-full items-center' : 'items-start')}>
      <div>{toolbar}</div>
      {/* Pitch + fullscreen button side-by-side (identical to the session-planner DrillBlock and
          AnimationStudio): the button sits BESIDE the pitch, top-aligned with a real gap, never
          overlapping it. Keeps the match-plan board consistent with the drill builders. */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{canvas}</div>
        <div className="shrink-0">{fsToggle}</div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-sentinel-border overflow-hidden text-xs font-semibold">
          <button onClick={() => onChange({ ...value, mode: 'static' })} className={'inline-flex items-center gap-1.5 px-3 h-8 ' + (mode === 'static' ? 'bg-brand text-[#0a1628]' : 'text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5')}><PenTool size={13} /> Static</button>
          <button onClick={() => onChange({ ...value, mode: 'animated' })} className={'inline-flex items-center gap-1.5 px-3 h-8 border-l border-slate-200 dark:border-sentinel-border ' + (mode === 'animated' ? 'bg-brand text-[#0a1628]' : 'text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5')}><Film size={13} /> Animated</button>
        </div>
        {mode === 'static' && <>
          <button onClick={toggleOurs} className={'inline-flex items-center gap-1.5 rounded-lg h-8 px-2.5 text-xs font-semibold border transition-colors ' + (hasOurs ? 'border-brand bg-brand text-[#0a1628]' : 'border-brand/40 text-brand hover:bg-brand/10')}><Users size={14} /> {hasOurs ? 'Hide Formation' : 'Show Formation'}</button>
          <button onClick={toggleOpp} className={'inline-flex items-center gap-1.5 rounded-lg h-8 px-2.5 text-xs font-semibold border transition-colors ' + (hasOpp ? 'border-rose-500 bg-rose-500 text-white' : 'border-rose-400/50 text-rose-500 hover:bg-rose-500/10')}><UserX size={14} /> {hasOpp ? 'Hide Opposition' : 'Show Opposition'}</button>
        </>}
      </div>

      {mode === 'animated' ? (
        <AnimationStudio embedded animationId={value.animationId || undefined}
          onSaved={(id) => onChange({ ...value, mode: 'animated', animationId: id })} />
      ) : (
        fullscreen
          ? <div className="fixed inset-0 z-[60] bg-white dark:bg-sentinel-bg p-3 sm:p-4 overflow-auto">{builderBody}</div>
          : builderBody
      )}

      {showNotes && <Textarea className="mt-4 h-24" value={value.notes || ''} onChange={e => onChange({ ...value, notes: e.target.value })} placeholder={notesPlaceholder || 'Notes…'} />}
    </div>
  );
};
