import React from 'react';
import type { CalendarItems, CalSession, CalEvent, CalMatch } from '../../services/calendarService';

/**
 * Shared calendar bubble model + renderer, used by the month grid, the week view and the
 * "+N more" day popup so they stay visually consistent.
 *  • Sessions are the richer bubble (team + time + title…) coloured per-team.
 *  • Events + matches are slim single-line bubbles (dot + time + title).
 *  • Items are always ordered by time within a day.
 */
export type CalClickItem =
  | { kind: 'session'; data: CalSession }
  | { kind: 'event'; data: CalEvent }
  | { kind: 'match'; data: CalMatch };

export interface DayItem {
  key: string;
  kind: 'session' | 'event' | 'match';
  time: string | null;
  sortMin: number;
  color: string;
  primary: string;
  secondary?: string;
  payload: CalClickItem;
}

const toMin = (t?: string | null) => { if (!t) return 1e9; const m = t.match(/(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : 1e9; };

export function dayItems(items: CalendarItems, dateStr: string): DayItem[] {
  const out: DayItem[] = [];
  items.sessions.filter(s => s.date === dateStr).forEach(s => {
    const color = items.teamColors[(s.team || '').trim().toLowerCase()] || '#00C49A';
    out.push({ key: 's-' + s.id, kind: 'session', time: s.startTime || null, sortMin: toMin(s.startTime), color, primary: s.team || 'Session', secondary: s.title || 'Session', payload: { kind: 'session', data: s } });
  });
  items.events.filter(e => e.date === dateStr).forEach(e => {
    out.push({ key: 'e-' + e.id, kind: 'event', time: e.startTime || null, sortMin: toMin(e.startTime), color: e.color || '#64748b', primary: e.title, payload: { kind: 'event', data: e } });
  });
  items.matches.filter(m => m.date === dateStr).forEach(m => {
    const isWatch = m.matchType === 'player_watch';
    const isResult = m.isPast && (m.homeScore != null || m.awayScore != null);
    const opp = m.opponent || '';
    const primary = isWatch
      ? (m.watchedPlayerName || 'Player') + (opp ? ` @ ${opp}` : '')
      : isResult ? `${m.squadName} ${m.homeScore}-${m.awayScore} ${opp}`.trim()
      : `${m.squadName} vs ${opp}`.trim();
    out.push({ key: 'm-' + m.id, kind: 'match', time: m.time || null, sortMin: toMin(m.time), color: isWatch ? '#8b5cf6' : '#ef4444', primary, payload: { kind: 'match', data: m } });
  });
  return out.sort((a, b) => a.sortMin - b.sortMin);
}

/** A single calendar bubble. Sessions render richer (two lines); events/matches are slim. */
export const CalBubble: React.FC<{ item: DayItem; onClick?: (e: React.MouseEvent) => void }> = ({ item, onClick }) => {
  if (item.kind === 'session') {
    return (
      <button type="button" onClick={onClick} title={`${item.time ? item.time + ' · ' : ''}${item.primary} — ${item.secondary || ''}`}
        className="w-full text-left rounded-md pl-1.5 pr-1 py-0.5 border-l-[3px] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:brightness-[0.98] active:translate-y-0 active:scale-[0.98]"
        style={{ borderColor: item.color, background: item.color + '1A' }}>
        <div className="flex items-center gap-1 text-[10px] font-bold leading-tight" style={{ color: item.color }}>
          {item.time && <span className="tabular-nums shrink-0">{item.time}</span>}
          <span className="truncate">{item.primary}</span>
        </div>
        {item.secondary && <div className="text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate leading-tight">{item.secondary}</div>}
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} title={`${item.time ? item.time + ' · ' : ''}${item.primary}`}
      className="w-full text-left rounded px-1.5 py-0.5 flex items-center gap-1.5 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm hover:bg-slate-100 dark:hover:bg-white/5 active:translate-y-0 active:scale-[0.98]">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: item.color }} />
      {item.time && <span className="text-[10px] tabular-nums text-slate-400 shrink-0">{item.time}</span>}
      <span className="text-[11px] text-slate-700 dark:text-slate-200 truncate">{item.primary}</span>
    </button>
  );
};
