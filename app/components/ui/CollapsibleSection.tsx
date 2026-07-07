import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * CollapsibleSection — a card whose whole header banner toggles the body open/closed.
 * Used to make long analytics tables skippable (collapse to scroll past) and to group
 * related blocks. Body is rendered in normal page flow (NO inner scroll) so the page
 * scrolls naturally — collapse a section instead of scrolling through a huge table.
 */
interface Props {
  title: React.ReactNode;
  subtitle?: string;
  right?: React.ReactNode;       // e.g. a count chip, shown in the banner
  defaultOpen?: boolean;
  bodyClassName?: string;        // default 'p-5'; pass '' for edge-to-edge tables
  children: React.ReactNode;
  className?: string;
}

export const CollapsibleSection: React.FC<Props> = ({ title, subtitle, right, defaultOpen = true, bodyClassName = 'p-5', children, className }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn('rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface overflow-hidden', className)}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-white/5">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {right}
          <ChevronDown size={18} className={cn('text-slate-400 transition-transform duration-200', open && 'rotate-180')} />
        </div>
      </button>
      {open && <div className={cn('border-t border-slate-100 dark:border-white/5', bodyClassName)}>{children}</div>}
    </div>
  );
};
