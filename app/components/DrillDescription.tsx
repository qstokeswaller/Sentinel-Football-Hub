import React, { useRef, useEffect, useCallback } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, RemoveFormatting } from 'lucide-react';
import { DRILL_SECTIONS, parseDrillSections, buildDrillDescription, sanitizeDrillHtml } from '../lib/drillText';

/**
 * Structured drill descriptor (v7 parity): a shared rich-text toolbar (bold / italic /
 * underline / bullet + numbered lists / clear formatting) above five labelled sections —
 * Overview, Setup, Function, Progressions/Variations, Coaching Points. Each section is a
 * contenteditable holding lightly-formatted HTML; the whole thing serialises to the
 * v7-compatible JSON blob stored in `drill.description`.
 */
interface Props { value: string; onChange: (blob: string) => void; disabled?: boolean }

const editorCls =
  'min-h-[40px] rounded-lg border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-bg px-3 py-2 ' +
  'text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand leading-relaxed ' +
  'empty:before:content-[attr(data-ph)] before:text-slate-400 dark:before:text-slate-500 before:pointer-events-none ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5';

export const DrillDescription: React.FC<Props> = ({ value, onChange, disabled }) => {
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  // Seed/refresh section HTML from the incoming blob, without clobbering the focused field.
  useEffect(() => {
    const secs = parseDrillSections(value);
    DRILL_SECTIONS.forEach(s => {
      const el = refs.current[s.key];
      const html = secs[s.key] || '';
      if (el && el !== document.activeElement && el.innerHTML !== html) el.innerHTML = html;
    });
  }, [value]);

  const emit = useCallback(() => {
    const secs: Record<string, string> = {};
    DRILL_SECTIONS.forEach(s => { const el = refs.current[s.key]; if (el) secs[s.key] = sanitizeDrillHtml(el.innerHTML); });
    onChange(buildDrillDescription(secs));
  }, [onChange]);

  const exec = (cmd: string) => { if (disabled) return; document.execCommand(cmd, false); emit(); };

  const tBtn = 'inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors';

  return (
    <div className="rounded-xl border border-slate-200 dark:border-sentinel-border overflow-hidden">
      {/* Shared formatting toolbar — preventDefault on mousedown keeps the section's selection. */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg"
           onMouseDown={e => e.preventDefault()}>
        <button type="button" title="Bold" className={tBtn} onClick={() => exec('bold')}><Bold size={15} /></button>
        <button type="button" title="Italic" className={tBtn} onClick={() => exec('italic')}><Italic size={15} /></button>
        <button type="button" title="Underline" className={tBtn} onClick={() => exec('underline')}><Underline size={15} /></button>
        <span className="w-px h-5 bg-slate-200 dark:bg-sentinel-border mx-1" />
        <button type="button" title="Bullet list" className={tBtn} onClick={() => exec('insertUnorderedList')}><List size={15} /></button>
        <button type="button" title="Numbered list" className={tBtn} onClick={() => exec('insertOrderedList')}><ListOrdered size={15} /></button>
        <span className="w-px h-5 bg-slate-200 dark:bg-sentinel-border mx-1" />
        <button type="button" title="Clear formatting" className={tBtn} onClick={() => exec('removeFormat')}><RemoveFormatting size={15} /></button>
      </div>

      <div className="p-3 space-y-3 bg-white dark:bg-sentinel-surface">
        {DRILL_SECTIONS.map(s => (
          <div key={s.key}>
            {/* Teal section header (brand dot + label + divider) — matches the public share page aesthetic. */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand whitespace-nowrap">{s.label}</span>
              <span className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
            </div>
            <div
              ref={el => { refs.current[s.key] = el; }}
              contentEditable={!disabled}
              suppressContentEditableWarning
              data-ph={s.placeholder}
              className={editorCls}
              onInput={e => { const el = e.currentTarget; if (!el.textContent?.trim() && el.innerHTML !== '') el.innerHTML = ''; emit(); }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
