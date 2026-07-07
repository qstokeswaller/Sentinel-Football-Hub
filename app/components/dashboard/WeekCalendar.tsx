import React from 'react';
import type { CalendarItems } from '../../services/calendarService';
import { dayItems, CalBubble, type CalClickItem } from './calendarShared';

/** Week view — 7 tall day columns showing every item for the week (time-ordered). */
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Monday of the week containing `d`. */
export function weekStartOf(d: Date): Date {
  const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(12, 0, 0, 0); return x;
}

export const WeekCalendar: React.FC<{ items: CalendarItems; weekStart: Date; onItemClick?: (i: CalClickItem) => void; onDayClick?: (d: string) => void }> = ({ items, weekStart, onItemClick, onDayClick }) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });
  return (
    <div className="rounded-xl border border-slate-200 dark:border-sentinel-border overflow-hidden bg-white dark:bg-sentinel-surface grid grid-cols-1 sm:grid-cols-7">
      {days.map((d, i) => {
        const ds = fmt(d); const list = dayItems(items, ds); const isToday = ds === todayStr;
        return (
          <div key={ds} onClick={() => onDayClick?.(ds)}
            className={'min-h-[64px] sm:min-h-[300px] flex sm:block gap-3 border-b sm:border-r border-slate-100 dark:border-sentinel-border p-2 sm:p-1.5 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.02] ' + (isToday ? 'bg-brand/[0.05]' : '')}>
            {/* Mobile: day label on the left (agenda style). Desktop: centred header on top. */}
            <div className="shrink-0 sm:text-center sm:mb-2 w-12 sm:w-auto">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">{DAY[i]}</div>
              <div className={'mt-0.5 sm:mx-auto w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold ' + (isToday ? 'bg-brand text-[#0a1628]' : 'text-slate-700 dark:text-slate-200')}>{d.getDate()}</div>
            </div>
            <div className="space-y-1 flex-1 min-w-0">
              {list.map(b => <CalBubble key={b.key} item={b} onClick={(e) => { e.stopPropagation(); onItemClick?.(b.payload); }} />)}
              {!list.length && <div className="text-[11px] text-slate-300 dark:text-slate-600 sm:text-center pt-1 sm:pt-3">—</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
};
