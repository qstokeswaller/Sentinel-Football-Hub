import React from 'react';

/**
 * PillTabs — the single, consistent tab style across the whole app (pages + modals),
 * matching the Reports hub: a rounded pill track with the active tab filled brand-green.
 * Supports an optional icon (any node — lucide or <i> fa) and a count badge.
 */
export interface PillTab { id: string; label: string; icon?: React.ReactNode; count?: number }

export const PillTabs: React.FC<{
  tabs: PillTab[];
  value: string;
  onChange: (id: string) => void;
  size?: 'sm' | 'md';
  className?: string;
}> = ({ tabs, value, onChange, size = 'md', className }) => (
  <div className={'inline-flex flex-wrap gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/5 ' + (className || '')}>
    {tabs.map(t => {
      const active = value === t.id;
      return (
        <button key={t.id} type="button" onClick={() => onChange(t.id)}
          className={'inline-flex items-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-colors ' +
            (size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm') + ' ' +
            (active ? 'bg-brand text-[#0D1B2A] shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300')}>
          {t.icon}
          {t.label}
          {t.count != null && <span className={'text-xs tabular-nums ' + (active ? 'opacity-70' : 'opacity-60')}>{t.count}</span>}
        </button>
      );
    })}
  </div>
);
