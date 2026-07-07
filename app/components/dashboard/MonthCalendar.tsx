import React from 'react';
import type { CalendarItems } from '../../services/calendarService';
import { dayItems, CalBubble, type CalClickItem } from './calendarShared';

/** Desktop month grid — per-team coloured bubbles, time-ordered, clickable days + "+N more". */
export type { CalClickItem };

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const fmt = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const MAX = 3;

interface CommonProps { items: CalendarItems; onItemClick?: (i: CalClickItem) => void; onDayClick?: (dateStr: string) => void; onMore?: (dateStr: string) => void; }

const DayCell: React.FC<CommonProps & { dateStr: string; dayNum: number; isToday: boolean }> = ({ items, dateStr, dayNum, isToday, onItemClick, onDayClick, onMore }) => {
  const list = dayItems(items, dateStr);
  const visible = list.slice(0, MAX);
  const more = list.length - MAX;
  return (
    <div onClick={() => onDayClick?.(dateStr)}
      className="group relative min-h-[100px] border-b border-r border-slate-100 dark:border-sentinel-border p-1.5 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.02]">
      <div className="flex items-center justify-between mb-1">
        <span className={'inline-flex items-center justify-center text-xs font-semibold w-6 h-6 rounded-full ' + (isToday ? 'bg-brand text-[#0a1628]' : 'text-slate-500 dark:text-slate-400')}>{dayNum}</span>
        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 dark:text-slate-500 text-[15px] leading-none">+</span>
      </div>
      <div className="space-y-1">
        {visible.map(b => <CalBubble key={b.key} item={b} onClick={(e) => { e.stopPropagation(); onItemClick?.(b.payload); }} />)}
        {more > 0 && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onMore?.(dateStr); }}
            className="w-full text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-brand px-1.5">+{more} more</button>
        )}
      </div>
    </div>
  );
};

export const MonthCalendar: React.FC<CommonProps & { year: number; month: number }> = ({ items, year, month, onItemClick, onDayClick, onMore }) => {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  const firstDayMon = (firstDay + 6) % 7;
  const todayStr = new Date().toISOString().split('T')[0];

  const leading: number[] = [];
  for (let i = firstDayMon; i > 0; i--) leading.push(prevMonthLastDay - i + 1);
  const days: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  const trailingCount = (7 - (firstDayMon + daysInMonth) % 7) % 7;
  const trailing: number[] = [];
  for (let i = 1; i <= trailingCount; i++) trailing.push(i);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-sentinel-border overflow-hidden bg-white dark:bg-sentinel-surface">
      <div className="grid grid-cols-7">
        {DAY_HEADERS.map(h => (
          <div key={h} className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 text-center border-b border-r border-slate-100 dark:border-sentinel-border">{h}</div>
        ))}
        {leading.map((n, i) => (
          <div key={`lead-${i}`} className="min-h-[100px] border-b border-r border-slate-100 dark:border-sentinel-border p-1.5 bg-slate-50/40 dark:bg-black/10">
            <span className="text-xs text-slate-300 dark:text-slate-600">{n}</span>
          </div>
        ))}
        {days.map(d => {
          const dateStr = fmt(year, month, d);
          return <DayCell key={`d-${d}`} items={items} dateStr={dateStr} dayNum={d} isToday={todayStr === dateStr} onItemClick={onItemClick} onDayClick={onDayClick} onMore={onMore} />;
        })}
        {trailing.map((n, i) => (
          <div key={`trail-${i}`} className="min-h-[100px] border-b border-r border-slate-100 dark:border-sentinel-border p-1.5 bg-slate-50/40 dark:bg-black/10">
            <span className="text-xs text-slate-300 dark:text-slate-600">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
