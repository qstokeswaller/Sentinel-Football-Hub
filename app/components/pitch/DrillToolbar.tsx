import React from 'react';
import {
  MousePointer2, Trash2, Undo2, RotateCcw, Circle, Triangle, Flag, Hash,
  Pencil, ArrowRight, ArrowLeftRight, Spline, Minus,
  Square, Type, PaintBucket, Eraser, FlipVertical2, X, MoveHorizontal, MoveVertical, Waypoints, BoxSelect,
} from 'lucide-react';
import { Select } from '../ui/Input';
import { cn } from '../../lib/utils';
import { PITCH_OPTIONS, gridOptionsFor, type PitchType, type PitchOrientation, type GridType } from './pitchGeometry';
import type { ActiveTool, ObjType, DrawTool, ObjSize } from './PitchCanvas';

/** The drill tool palette (v7 parity, touch-friendly): pitch selector + orientation,
 *  colour swatches, players, equipment, draw tools and size. Drives PitchCanvas.
 *  Icons mirror the actual pitch tokens so each tool reads at a glance. */

// Small inline SVGs for equipment that has no clean lucide equivalent — drawn to look
// like the real token that lands on the pitch.
const svgBase = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
// Goal — a real goal: bold posts + crossbar FRAME (open at the bottom) with a finer net mesh inside.
const GoalIcon = () => (<svg {...svgBase}><path d="M4 19V6h16v13" strokeWidth={2.4} /><path d="M4 11.5h16M9.3 6v13M14.6 6v13" strokeWidth={1} opacity={0.55} /></svg>);
// Agility ladder — flat ladder of rungs (2 rails + rungs).
const LadderIcon = () => (<svg {...svgBase}><rect x="6" y="3" width="12" height="18" rx="1" /><path d="M12 3v18M6 7.5h12M6 12h12M6 16.5h12" /></svg>);
// Hurdle — a barrier frame: top bar + uprights + feet + a crossbar (looks like a real plastic hurdle).
const HurdleIcon = () => (<svg {...svgBase}><path d="M5 20V9h14v11" strokeWidth={2.3} /><path d="M5 14h14" strokeWidth={1.4} opacity={0.6} /><path d="M3 20h4M17 20h4" /></svg>);
const PoleIcon = () => (<svg {...svgBase}><path d="M12 4v16M9 20h6" /></svg>);
// Mini goal — same goal frame + net, but small & wide (clearly a smaller goal than the full Goalpost).
const MiniGoalIcon = () => (<svg {...svgBase}><path d="M3 18V11h18v7" strokeWidth={2.3} /><path d="M3 14.4h18M9 11v7M15 11v7" strokeWidth={1} opacity={0.55} /></svg>);
const RebounderIcon = () => (<svg {...svgBase}><rect x="4" y="6" width="16" height="12" rx="1" /><path d="M4 6l16 12" /></svg>);
// Ring — concentric circles (an agility/floor ring; distinct from the plain Circle shape + ball).
const RingIcon = () => (<svg {...svgBase}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.8" /></svg>);
// Cone — a training cone (body + base + band) instead of a plain triangle.
const ConeIcon = () => (<svg {...svgBase}><path d="M12 4.5 16.8 18H7.2z" /><path d="M5.5 18h13" /><path d="M9.7 11.5h4.6" strokeWidth={1.3} opacity={0.6} /></svg>);
// Ball — a line soccer ball (matches the line-icon set, vs the lone colour emoji).
const BallIcon = () => (<svg {...svgBase}><circle cx="12" cy="12" r="8.6" /><path d="M12 7.1l3.4 2.5-1.3 4h-4.2l-1.3-4z" strokeWidth={1.3} /><path d="M12 4.3v2.8M18.1 9l-2.7 1.6M15.7 17.2l-1.7-2.5M8.3 17.2l1.7-2.5M5.9 9l2.7 1.6" strokeWidth={1.2} opacity={0.7} /></svg>);
// Mannequin — a training dummy on a stand (distinct from a Player token).
const MannequinIcon = () => (<svg {...svgBase}><circle cx="12" cy="6" r="2.3" /><path d="M9 21c0-6 1.2-10.7 3-10.7S15 15 15 21" /><path d="M8.5 21h7" /></svg>);
// Rondo grids.
const Rondo2Icon = () => (<svg {...svgBase}><rect x="3" y="6" width="18" height="12" rx="1" /><path d="M12 6v12" /></svg>);
const Rondo4Icon = () => (<svg {...svgBase}><rect x="3" y="6" width="18" height="12" rx="1" /><path d="M12 6v12M3 12h18" /></svg>);
const TransferIcon = () => (<svg {...svgBase}><rect x="3" y="7" width="18" height="10" rx="1" /><path d="M10 7v10M14 7v10" /></svg>);

const PLAYERS: { id: ObjType; label: string; icon: React.ReactNode }[] = [
  { id: 'player', label: 'Player', icon: <Circle size={12} fill="currentColor" /> },
  { id: 'gk', label: 'Goalkeeper', icon: <span className="text-[11px] font-bold">GK</span> },
];
const EQUIPMENT: { id: ObjType; label: string; icon: React.ReactNode }[] = [
  { id: 'cone', label: 'Cone', icon: <ConeIcon /> },
  { id: 'ball', label: 'Ball', icon: <BallIcon /> },
  { id: 'goalpost', label: 'Goal', icon: <GoalIcon /> },
  { id: 'flag', label: 'Flag', icon: <Flag size={14} /> },
  { id: 'number', label: 'Number marker', icon: <Hash size={15} /> },
  { id: 'ladder', label: 'Agility ladder', icon: <LadderIcon /> },
  { id: 'hurdle', label: 'Hurdle', icon: <HurdleIcon /> },
  { id: 'mannequin', label: 'Mannequin', icon: <MannequinIcon /> },
  { id: 'pole', label: 'Pole', icon: <PoleIcon /> },
  { id: 'minigoal', label: 'Mini goal', icon: <MiniGoalIcon /> },
  { id: 'ring', label: 'Ring', icon: <RingIcon /> },
  { id: 'rebounder', label: 'Rebounder', icon: <RebounderIcon /> },
];
const LINES: { id: DrawTool; label: string; icon: React.ReactNode }[] = [
  { id: 'line', label: 'Line', icon: <Minus size={16} className="rotate-45" /> },
  { id: 'arrow', label: 'Arrow', icon: <ArrowRight size={16} /> },
  { id: 'biarrow', label: 'Double arrow', icon: <ArrowLeftRight size={16} /> },
  { id: 'dashed', label: 'Dashed arrow', icon: <ArrowRight size={16} style={{ strokeDasharray: '3 2' }} /> },
  { id: 'dashed-line', label: 'Dashed line', icon: <Minus size={16} className="rotate-45" style={{ strokeDasharray: '3 2' }} /> },
  { id: 'curved', label: 'Curved arrow', icon: <Spline size={15} /> },
];
const SHAPES: { id: DrawTool; label: string; icon: React.ReactNode }[] = [
  { id: 'rect', label: 'Rectangle', icon: <Square size={15} /> },
  { id: 'circle', label: 'Circle / ellipse', icon: <Circle size={15} /> },
  { id: 'tri', label: 'Triangle', icon: <Triangle size={15} /> },
  { id: 'rondo2', label: 'Two-block rondo', icon: <Rondo2Icon /> },
  { id: 'rondo4', label: 'Four-block rondo', icon: <Rondo4Icon /> },
  { id: 'transfer', label: 'Transfer rondo', icon: <TransferIcon /> },
];
// One-row palette (the custom picker at the end of the row covers anything else).
const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#f57c00', '#ffffff'];
const SIZES: ObjSize[] = ['small', 'medium', 'large'];

interface Props {
  pitchType: PitchType; orientation: PitchOrientation;
  activeTool: ActiveTool; activeColor: string; size: ObjSize; fill: boolean;
  onPitch: (t: PitchType) => void; onOrientation: (o: PitchOrientation) => void;
  grid?: GridType; onGrid?: (g: GridType) => void; gridColor?: string; onGridColor?: (c: string) => void;
  onTool: (t: ActiveTool) => void; onColor: (c: string) => void; onSize: (s: ObjSize) => void; onFill: (v: boolean) => void;
  /** Connectors — attach lines between objects; fillShapes fills any closed ring of them. */
  fillShapes?: boolean; onFillShapes?: (v: boolean) => void;
  onUndo: () => void; onClear: () => void; onDeleteSelected: () => void; canDelete: boolean;
  flip?: boolean; onFlip?: () => void;
  /** Mobile sheet mode — renders the palette as a slide-in tool tray (hamburger driven). */
  mobile?: boolean; open?: boolean; onClose?: () => void; landscape?: boolean;
}

const sel = (on: boolean) => 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors ' +
  (on ? 'bg-brand text-[#0D1B2A]' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10');

const ToolBtn: React.FC<{ on: boolean; label: string; onClick: () => void; children: React.ReactNode }> = ({ on, label, onClick, children }) => (
  <button type="button" title={label} aria-label={label} onClick={onClick} className={sel(on) + ' w-7 h-7 text-[13px]'}>{children}</button>
);
const HEADING = 'text-[10px] font-semibold uppercase tracking-wider text-brand';
const Group: React.FC<{ heading: string; action?: React.ReactNode; children: React.ReactNode }> = ({ heading, action, children }) => (
  <div className="flex flex-col gap-0.5">
    <div className="flex items-center justify-between gap-2">
      <span className={HEADING}>{heading}</span>
      {action}
    </div>
    <div className="flex flex-wrap items-center gap-1">{children}</div>
  </div>
);

export const DrillToolbar: React.FC<Props> = (p) => {
  if (p.mobile) return <MobileToolSheet {...p} />;
  const customActive = !COLORS.includes(p.activeColor); // highlight the wheel when a non-preset colour is in use
  return (
  <div className="rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg p-2 flex flex-col gap-2">
    {/* Pitch Layout — pitch + orientation on one row, grid (with its line colour) below */}
    <div className="flex flex-col gap-1">
      <span className={HEADING}>Pitch Layout</span>
      <div className="flex items-center gap-1.5">
        <Select value={p.pitchType} onChange={e => p.onPitch(e.target.value as PitchType)} className="flex-1 min-w-0">
          {PITCH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        {/* Orientation — one toggle showing the current layout; click to flip (arrows + tooltip). */}
        <button type="button" onClick={() => p.onOrientation(p.orientation === 'landscape' ? 'portrait' : 'landscape')}
          title={p.orientation === 'landscape' ? 'Switch to portrait pitch' : 'Switch to landscape pitch'}
          className="shrink-0 w-[122px] justify-center inline-flex items-center gap-1.5 rounded-lg bg-brand text-[#0D1B2A] h-[38px] text-sm font-semibold hover:bg-brand-dark transition-colors">
          {p.orientation === 'landscape' ? <MoveHorizontal size={15} /> : <MoveVertical size={15} />}
          {p.orientation === 'landscape' ? 'Landscape' : 'Portrait'}
        </button>
      </div>
      {p.onGrid && (
        <div className="flex items-center gap-1.5">
          <Select value={p.grid || 'none'} onChange={e => p.onGrid!(e.target.value as GridType)} className="flex-1 min-w-0">
            {gridOptionsFor(p.pitchType).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          {p.onGridColor && p.grid && p.grid !== 'none' && (
            <label title="Grid line colour" style={{ background: 'conic-gradient(from 90deg, #ef4444, #f59e0b, #fde047, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)' }}
              className="w-9 h-9 shrink-0 rounded-full cursor-pointer relative ring-1 ring-slate-300 dark:ring-white/25">
              <span className="absolute inset-[32%] rounded-full ring-1 ring-black/10" style={{ background: p.gridColor || '#ffffff' }} />
              <input type="color" value={p.gridColor || '#ffffff'} onChange={e => p.onGridColor!(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            </label>
          )}
        </div>
      )}
    </div>

    {/* Actions + object size — one tidy left-aligned row (S · M · L pushed to the right) */}
    <div className="flex items-center gap-1">
      <ToolBtn on={p.activeTool === 'select' || p.activeTool === null} label="Select / move" onClick={() => p.onTool('select')}><MousePointer2 size={15} /></ToolBtn>
      {p.onFlip && <button type="button" title="Flip pitch (swap goal end)" onClick={p.onFlip} className={sel(!!p.flip) + ' w-7 h-7'}><FlipVertical2 size={15} /></button>}
      <button type="button" title="Undo last" onClick={p.onUndo} className={sel(false) + ' w-7 h-7'}><Undo2 size={15} /></button>
      <button type="button" title="Delete selected" disabled={!p.canDelete} onClick={p.onDeleteSelected} className={sel(false) + ' w-7 h-7 disabled:opacity-40'}><Trash2 size={15} /></button>
      <button type="button" title="Clear pitch" onClick={p.onClear} className={sel(false) + ' w-7 h-7'}><RotateCcw size={15} /></button>
      <div className="ml-auto inline-flex rounded-md overflow-hidden border border-slate-200 dark:border-sentinel-border" title="Object size">
        {SIZES.map((s, i) => <button key={s} type="button" onClick={() => p.onSize(s)}
          className={'w-6 h-7 text-xs font-bold uppercase ' + (i ? 'border-l border-slate-200 dark:border-sentinel-border ' : '') + (p.size === s ? 'bg-brand text-[#0D1B2A]' : 'bg-white dark:bg-white/5 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10')}>{s[0]}</button>)}
      </div>
    </div>

    {/* Colour — one row + a rainbow colour-wheel for custom colours */}
    <div className="flex flex-col gap-0.5">
      <span className={HEADING}>Colour</span>
      <div className="flex items-center gap-1">
        {COLORS.map(c => (
          <button key={c} type="button" title={c} onClick={() => p.onColor(c)}
            className={'w-6 h-6 rounded-full border transition-transform ' + (p.activeColor === c ? 'ring-2 ring-brand ring-offset-1 ring-offset-slate-50 dark:ring-offset-sentinel-bg scale-110' : 'border-slate-300 dark:border-white/20')}
            style={{ background: c }} />
        ))}
        <label title="Custom colour" style={{ background: 'conic-gradient(from 90deg, #ef4444, #f59e0b, #fde047, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)' }}
          className={'w-6 h-6 rounded-full cursor-pointer relative shrink-0 ring-1 ring-slate-300 dark:ring-white/25 ' + (customActive ? 'ring-2 !ring-brand ring-offset-1 ring-offset-slate-50 dark:ring-offset-sentinel-bg scale-110' : '')}>
          <span className="absolute inset-[30%] rounded-full bg-white dark:bg-sentinel-surface" style={{ background: customActive ? p.activeColor : undefined }} />
          <input type="color" value={p.activeColor} onChange={e => p.onColor(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
        </label>
      </div>
    </div>

    {/* Tool groups (Select moved into the action row; object size is the S·M·L above) */}
    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
      <Group heading="Players">
        {PLAYERS.map(t => <ToolBtn key={t.id} on={p.activeTool === t.id} label={t.label} onClick={() => p.onTool(t.id)}>{t.icon}</ToolBtn>)}
      </Group>
      <Group heading="Equipment">
        {EQUIPMENT.map(t => <ToolBtn key={t.id} on={p.activeTool === t.id} label={t.label} onClick={() => p.onTool(t.id)}>{t.icon}</ToolBtn>)}
      </Group>
      <Group heading="Lines & Arrows">
        {LINES.map(t => <ToolBtn key={t.id} on={p.activeTool === t.id} label={t.label} onClick={() => p.onTool(t.id)}>{t.icon}</ToolBtn>)}
      </Group>
      {/* Connect + Fill — static-diagram only (hidden where connectors aren't persisted, e.g. the
          animated builder, which passes no onFillShapes). */}
      {p.onFillShapes && (
        <Group heading="Connect" action={
          <button type="button" onClick={() => p.onFillShapes!(!p.fillShapes)}
            title={p.fillShapes ? 'Fill closed shapes: ON' : 'Fill closed shapes: OFF (fills any closed ring of connectors)'}
            className={'inline-flex items-center gap-1 rounded-md px-2 h-6 text-[10px] font-bold uppercase tracking-wider transition-colors ' +
              (p.fillShapes ? 'bg-brand text-[#0D1B2A]' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10')}>
            <PaintBucket size={12} /> Fill {p.fillShapes ? 'On' : 'Off'}
          </button>
        }>
          <ToolBtn on={p.activeTool === 'connect'} label="Connect objects — drag from one object to another to link them" onClick={() => p.onTool('connect')}><Waypoints size={15} /></ToolBtn>
        </Group>
      )}
      <Group heading="Shapes" action={
        <button type="button" onClick={() => p.onFill(!p.fill)}
          title={p.fill ? 'Shape fill: ON (filled area)' : 'Shape fill: OFF (outline only)'}
          className={'inline-flex items-center gap-1 rounded-md px-2 h-6 text-[10px] font-bold uppercase tracking-wider transition-colors ' +
            (p.fill ? 'bg-brand text-[#0D1B2A]' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10')}>
          <PaintBucket size={12} /> Fill {p.fill ? 'On' : 'Off'}
        </button>
      }>
        {SHAPES.map(t => <ToolBtn key={t.id} on={p.activeTool === t.id} label={t.label} onClick={() => p.onTool(t.id)}>{t.icon}</ToolBtn>)}
      </Group>
      <Group heading="Tools">
        <ToolBtn on={p.activeTool === 'marquee'} label="Box-select — drag a box over objects to select & move them together" onClick={() => p.onTool('marquee')}><BoxSelect size={15} /></ToolBtn>
        <ToolBtn on={p.activeTool === 'pencil'} label="Free draw" onClick={() => p.onTool('pencil')}><Pencil size={15} /></ToolBtn>
        <ToolBtn on={p.activeTool === 'text'} label="Text label (click pitch, then type)" onClick={() => p.onTool('text')}><Type size={15} /></ToolBtn>
        <ToolBtn on={p.activeTool === 'eraser'} label="Eraser (tap an item to remove it)" onClick={() => p.onTool('eraser')}><Eraser size={15} /></ToolBtn>
      </Group>
    </div>
  </div>
  );
};

/**
 * Mobile tool sheet — the palette as a slide-in tray driven by a hamburger (DrillBlock owns
 * the trigger). Picking a TOOL auto-collapses the tray so the full pitch is revealed (per spec).
 * Portrait phone → bottom sheet; landscape phone (turned sideways / fullscreen) → side sheet.
 * Orientation + size toggles are intentionally omitted on phones — the pitch is always portrait
 * and items are resized by dragging their handles.
 */
const MobileToolSheet: React.FC<Props> = (p) => {
  if (!p.open) return null;
  const pick = (t: ActiveTool) => { p.onTool(t); p.onClose?.(); }; // tool → auto-collapse
  const MGroup: React.FC<{ heading: string; action?: React.ReactNode; children: React.ReactNode }> = ({ heading, action, children }) => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2"><span className={HEADING}>{heading}</span>{action}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
  const MBtn: React.FC<{ on: boolean; label: string; onClick: () => void; children: React.ReactNode }> = ({ on, label, onClick, children }) => (
    <button type="button" title={label} aria-label={label} onClick={onClick} className={sel(on) + ' w-10 h-10 text-[15px]'}>{children}</button>
  );
  return (
    <div className="fixed inset-0 z-[80] flex" onClick={p.onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        onClick={e => e.stopPropagation()}
        className={cn(
          'relative bg-white dark:bg-sentinel-surface shadow-2xl overflow-y-auto overscroll-contain p-4 flex flex-col gap-4',
          p.landscape
            ? 'h-full w-[320px] max-w-[85%] mr-auto'                 // side sheet when phone is sideways
            : 'w-full max-h-[78%] mt-auto rounded-t-2xl',           // bottom sheet when held upright
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900 dark:text-white">Tools</span>
          <button type="button" onClick={p.onClose} aria-label="Close tools" className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><X size={18} /></button>
        </div>

        {/* Pitch type (orientation is always portrait on phones, so no layout toggle) */}
        <div className="flex flex-col gap-1.5">
          <span className={HEADING}>Pitch</span>
          <Select value={p.pitchType} onChange={e => p.onPitch(e.target.value as PitchType)} className="w-full">
            {PITCH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>

        {p.onGrid && (
          <div className="flex flex-col gap-1.5">
            <span className={HEADING}>Grid</span>
            <div className="flex items-center gap-1.5">
              <Select value={p.grid || 'none'} onChange={e => p.onGrid!(e.target.value as GridType)} className="flex-1">
                {gridOptionsFor(p.pitchType).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
              {p.onGridColor && p.grid && p.grid !== 'none' && (
                <label title="Grid line colour" style={{ background: 'conic-gradient(from 90deg, #ef4444, #f59e0b, #fde047, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)' }}
                  className="w-10 h-10 shrink-0 rounded-full cursor-pointer relative ring-1 ring-slate-300 dark:ring-white/25">
                  <span className="absolute inset-[32%] rounded-full ring-1 ring-black/10" style={{ background: p.gridColor || '#ffffff' }} />
                  <input type="color" value={p.gridColor || '#ffffff'} onChange={e => p.onGridColor!(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </label>
              )}
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="flex items-center gap-2">
          {p.onFlip && <button type="button" title="Flip pitch (swap goal end)" onClick={() => { p.onFlip!(); p.onClose?.(); }} className={sel(!!p.flip) + ' w-10 h-10'}><FlipVertical2 size={17} /></button>}
          <button type="button" title="Undo last" onClick={p.onUndo} className={sel(false) + ' w-10 h-10'}><Undo2 size={17} /></button>
          <button type="button" title="Delete selected" disabled={!p.canDelete} onClick={p.onDeleteSelected} className={sel(false) + ' w-10 h-10 disabled:opacity-40'}><Trash2 size={17} /></button>
          <button type="button" title="Clear pitch" onClick={p.onClear} className={sel(false) + ' w-10 h-10'}><RotateCcw size={17} /></button>
        </div>

        <MGroup heading="Colour">
          {COLORS.map(c => (
            <button key={c} type="button" title={c} onClick={() => p.onColor(c)}
              className={'w-8 h-8 rounded-full border transition-transform ' + (p.activeColor === c ? 'ring-2 ring-brand ring-offset-2 ring-offset-white dark:ring-offset-sentinel-surface scale-110' : 'border-slate-300 dark:border-white/20')}
              style={{ background: c }} />
          ))}
          <label title="Custom colour" style={{ background: 'conic-gradient(from 90deg, #ef4444, #f59e0b, #fde047, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)' }}
            className={'w-8 h-8 rounded-full cursor-pointer relative ring-1 ring-slate-300 dark:ring-white/25 ' + (!COLORS.includes(p.activeColor) ? 'ring-2 !ring-brand ring-offset-2 ring-offset-white dark:ring-offset-sentinel-surface scale-110' : '')}>
            <span className="absolute inset-[30%] rounded-full" style={{ background: !COLORS.includes(p.activeColor) ? p.activeColor : '#fff' }} />
            <input type="color" value={p.activeColor} onChange={e => p.onColor(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          </label>
        </MGroup>

        <MGroup heading="Select">
          <MBtn on={p.activeTool === 'select' || p.activeTool === null} label="Select / move" onClick={() => pick('select')}><MousePointer2 size={17} /></MBtn>
        </MGroup>
        <MGroup heading="Players">
          {PLAYERS.map(t => <MBtn key={t.id} on={p.activeTool === t.id} label={t.label} onClick={() => pick(t.id)}>{t.icon}</MBtn>)}
        </MGroup>
        <MGroup heading="Equipment">
          {EQUIPMENT.map(t => <MBtn key={t.id} on={p.activeTool === t.id} label={t.label} onClick={() => pick(t.id)}>{t.icon}</MBtn>)}
        </MGroup>
        <MGroup heading="Lines & Arrows">
          {LINES.map(t => <MBtn key={t.id} on={p.activeTool === t.id} label={t.label} onClick={() => pick(t.id)}>{t.icon}</MBtn>)}
        </MGroup>
        {p.onFillShapes && (
          <MGroup heading="Connect" action={
            <button type="button" onClick={() => p.onFillShapes!(!p.fillShapes)}
              title={p.fillShapes ? 'Fill closed shapes: ON' : 'Fill closed shapes: OFF'}
              className={'inline-flex items-center gap-1 rounded-md px-2.5 h-7 text-[10px] font-bold uppercase tracking-wider transition-colors ' +
                (p.fillShapes ? 'bg-brand text-[#0D1B2A]' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-300')}>
              <PaintBucket size={13} /> Fill {p.fillShapes ? 'On' : 'Off'}
            </button>
          }>
            <MBtn on={p.activeTool === 'connect'} label="Connect objects — drag from one to another to link" onClick={() => pick('connect')}><Waypoints size={17} /></MBtn>
          </MGroup>
        )}
        <MGroup heading="Shapes" action={
          <button type="button" onClick={() => p.onFill(!p.fill)}
            title={p.fill ? 'Shape fill: ON' : 'Shape fill: OFF'}
            className={'inline-flex items-center gap-1 rounded-md px-2.5 h-7 text-[10px] font-bold uppercase tracking-wider transition-colors ' +
              (p.fill ? 'bg-brand text-[#0D1B2A]' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-300')}>
            <PaintBucket size={13} /> Fill {p.fill ? 'On' : 'Off'}
          </button>
        }>
          {SHAPES.map(t => <MBtn key={t.id} on={p.activeTool === t.id} label={t.label} onClick={() => pick(t.id)}>{t.icon}</MBtn>)}
        </MGroup>
        <MGroup heading="Tools">
          <MBtn on={p.activeTool === 'marquee'} label="Box-select — drag a box to select & move objects together" onClick={() => pick('marquee')}><BoxSelect size={17} /></MBtn>
          <MBtn on={p.activeTool === 'pencil'} label="Free draw" onClick={() => pick('pencil')}><Pencil size={17} /></MBtn>
          <MBtn on={p.activeTool === 'text'} label="Text label" onClick={() => pick('text')}><Type size={17} /></MBtn>
          <MBtn on={p.activeTool === 'eraser'} label="Eraser" onClick={() => pick('eraser')}><Eraser size={17} /></MBtn>
        </MGroup>
      </div>
    </div>
  );
};
