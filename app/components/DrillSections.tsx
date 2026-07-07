import React from 'react';
import { DRILL_SECTIONS, parseDrillDescription, parseDrillSections, sanitizeDrillHtml, stripHtml } from '../lib/drillText';

/**
 * Renders a drill description's sections (Overview / Setup / Function / Progressions /
 * Coaching Points) with clear visual separation: a brand dot + bold label + a divider
 * rule, with the body indented beneath. Used in the Library detail + public share pages.
 *
 * `all` → always render every canonical section, showing "N/A" for any left empty
 * (so the layout is consistent and coaches can see what's still missing).
 */
const SectionBlock: React.FC<{ label: string; html?: string; na?: boolean; compact?: boolean }> = ({ label, html, na, compact }) => (
  <div>
    <div className="flex items-center gap-2 mb-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand whitespace-nowrap">{label || 'Description'}</span>
      <span className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
    </div>
    {na ? (
      <div className="text-sm text-slate-400 dark:text-slate-500 italic pl-3.5">N/A</div>
    ) : (
      <div
        className={(compact ? 'text-[13px] ' : 'text-sm ') + 'text-slate-700 dark:text-slate-200 leading-relaxed pl-3.5 whitespace-pre-wrap [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:whitespace-normal [&_ol]:whitespace-normal'}
        dangerouslySetInnerHTML={{ __html: sanitizeDrillHtml(html) }}
      />
    )}
  </div>
);

export const DrillSections: React.FC<{ description?: string | null; className?: string; compact?: boolean; all?: boolean }> = ({ description, className, compact, all }) => {
  if (all) {
    const map = parseDrillSections(description);
    return (
      <div className={'space-y-3.5 ' + (className || '')}>
        {DRILL_SECTIONS.map(s => {
          const html = map[s.key] || '';
          const has = stripHtml(html).trim().length > 0;
          return <SectionBlock key={s.key} label={s.label} html={html} na={!has} compact={compact} />;
        })}
      </div>
    );
  }
  const { sections } = parseDrillDescription(description);
  if (!sections.length) return null;
  return (
    <div className={'space-y-3.5 ' + (className || '')}>
      {sections.map((s, i) => <SectionBlock key={i} label={s.label} html={s.text} compact={compact} />)}
    </div>
  );
};
