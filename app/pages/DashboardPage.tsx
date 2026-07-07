import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../context/AppStateContext';
import { useCalendar } from '../hooks/useCalendar';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { MonthCalendar, type CalClickItem } from '../components/dashboard/MonthCalendar';
import { WeekCalendar, weekStartOf } from '../components/dashboard/WeekCalendar';
import { DayItemsPopup } from '../components/dashboard/DayItemsPopup';
import { AddEventModal } from '../components/dashboard/AddEventModal';
import { CalendarItemPopup } from '../components/dashboard/CalendarItemPopup';
import { AttendancePanel } from '../components/dashboard/AttendancePanel';
import { GlobalSearch } from '../components/dashboard/GlobalSearch';
import { QuickSessionModal } from '../components/dashboard/QuickSessionModal';
import { Modal } from '../components/ui/Modal';
import { MonthGridSkeleton, ActivityListSkeleton } from '../components/ui/Skeleton';
import type { CalSession } from '../services/calendarService';
import { maybeAutoStartWalkthrough } from '../lib/walkthrough';
import { supabase } from '../lib/supabase';
import '../styles/dashboard.css';

/**
 * Dashboard — Increment 1 of the Phase 3 port: header, shortcut cards, the month
 * calendar on real club data, and recent activity. Attendance mode, Add Event,
 * Quick Session, global search, and the mobile week view are the next increment
 * (wired here as honest placeholders).
 */

export const DashboardPage: React.FC = () => {
  const { profile, archetype } = useAppState();
  const { data, isLoading } = useCalendar();
  // Auto-play the general welcome tour once per USER (DB-backed flag), so a first
  // sign-in on any device shows it once and never repeats on another device.
  useEffect(() => {
    if (!profile?.id) return;
    maybeAutoStartWalkthrough(!!profile.has_seen_walkthrough, () => {
      // NOTE: a supabase query builder is lazy — it only fires the request when awaited
      // or `.then()`-ed. Without this `.then`, the flag never persisted and the welcome
      // tour replayed on every sign-in.
      supabase.from('profiles').update({ has_seen_walkthrough: true }).eq('id', profile.id)
        .then(({ error }) => { if (error) console.warn('[walkthrough] could not persist has_seen_walkthrough', error.message); });
    });
  }, [profile]);

  const now = new Date();
  const isNarrow = useMediaQuery('(max-width: 767px)');
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [view, setView] = useState<'month' | 'week'>(() => (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'week' : 'month'));
  const [weekStart, setWeekStart] = useState<Date>(() => weekStartOf(new Date()));
  const [mode, setMode] = useState<'calendar' | 'attendance'>('calendar');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showQuickSession, setShowQuickSession] = useState(false);
  const [addDate, setAddDate] = useState<string | undefined>();      // day-click / +add prefill
  const [chooserDate, setChooserDate] = useState<string | null>(null); // day-click → Event vs Quick Session
  const [dayPopupDate, setDayPopupDate] = useState<string | null>(null); // "+N more" → all items that day
  const [selectedItem, setSelectedItem] = useState<CalClickItem | null>(null);
  const [attendanceSession, setAttendanceSession] = useState<CalSession | null>(null);

  const handleItemClick = (item: CalClickItem) => {
    setDayPopupDate(null);
    if (mode === 'attendance') {
      if (item.kind === 'session') setAttendanceSession(item.data);
      return; // events/matches aren't attendance-markable
    }
    setSelectedItem(item);
  };
  // Click a day cell (Google-cal style) → choose Add Event or Quick Session, prefilled with that date.
  const handleDayClick = (dateStr: string) => { if (mode === 'attendance') return; setChooserDate(dateStr); };
  const openAddEvent = (dateStr?: string) => { setAddDate(dateStr); setChooserDate(null); setDayPopupDate(null); setShowAddEvent(true); };
  const openQuickSession = (dateStr?: string) => { setAddDate(dateStr); setChooserDate(null); setDayPopupDate(null); setShowQuickSession(true); };

  const monthLabel = useMemo(
    () => `${new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(year, month))} ${year}`,
    [year, month],
  );
  // Live clock — date + accurate time, ticking every second.
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);
  const dateLabel = new Intl.DateTimeFormat('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' }).format(clock);
  const timeLabel = new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false }).format(clock);

  const navStep = (delta: number) => {
    if (view === 'week') { const d = new Date(weekStart); d.setDate(d.getDate() + delta * 7); setWeekStart(weekStartOf(d)); }
    else { const d = new Date(year, month + delta, 1); setMonth(d.getMonth()); setYear(d.getFullYear()); }
  };
  const weekLabel = useMemo(() => {
    const end = new Date(weekStart); end.setDate(end.getDate() + 6);
    const f = (d: Date, withYear = false) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
    return `${f(weekStart)} – ${f(end, true)}`;
  }, [weekStart]);
  const periodLabel = view === 'week' ? weekLabel : monthLabel;

  const firstName = (profile?.full_name || '').split(' ')[0] || 'Coach';

  const recentSessions = useMemo(
    () => [...(data?.sessions || [])].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5),
    [data],
  );

  return (
    <div className="fh-dashboard">
      <header className="page-header" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className="header-info">
          <div>
            <h1>Command Center</h1>
            <p id="welcome-msg">Welcome back, {firstName}. Here's what's happening today.</p>
          </div>
        </div>
        {/* Search sits up top-right next to the live clock, freeing the row above the calendar. */}
        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div className="w-full sm:w-72"><GlobalSearch /></div>
          <span id="current-date" style={{ fontSize: 14, fontWeight: 600, background: 'var(--bg-card,#fff)', padding: '8px 16px', borderRadius: 20, boxShadow: 'var(--shadow-sm)', whiteSpace: 'nowrap' }}>
            {dateLabel} · <span className="tabular-nums">{timeLabel}</span>
          </span>
        </div>
      </header>

      {/* Calendar — pulled up close under the header now the search moved into it. */}
      <div data-tour="dash-calendar" className="activity-section" style={{ marginTop: 0 }}>
        <div className="activity-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div className="cal-mode-tabs">
              <button className={`cal-mode-tab${mode === 'calendar' ? ' active' : ''}`} onClick={() => setMode('calendar')}>
                <i className="fas fa-calendar-alt" /> Calendar
              </button>
              <button className={`cal-mode-tab${mode === 'attendance' ? ' active' : ''}`} onClick={() => { setMode('attendance'); }}>
                <i className="fas fa-clipboard-check" /> Attendance
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} className="flex-wrap">
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-sentinel-border overflow-hidden text-xs font-semibold">
              {(['month', 'week'] as const).map(v => (
                <button key={v} onClick={() => { setView(v); if (v === 'week') setWeekStart(weekStartOf(new Date(year, month, 1) > new Date() ? new Date(year, month, 1) : new Date())); }}
                  className={'px-3 py-1.5 capitalize transition-colors ' + (view === v ? 'bg-brand text-[#0a1628]' : 'text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5')}>{v}</button>
              ))}
            </div>
            <button className="btn-ghost" onClick={() => navStep(-1)}><i className="fas fa-chevron-left" /></button>
            <span style={{ fontWeight: 700, minWidth: 150, textAlign: 'center', display: 'inline-block' }}>{periodLabel}</span>
            <button className="btn-ghost" onClick={() => navStep(1)}><i className="fas fa-chevron-right" /></button>
            <div style={{ position: 'relative', marginLeft: 12 }}>
              <button className="dash-btn primary" onClick={() => setAddMenuOpen(o => !o)} style={{ borderRadius: 9999, padding: '8px 18px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="fas fa-plus" /> Add <i className="fas fa-caret-down" style={{ fontSize: '0.7rem' }} />
              </button>
              {addMenuOpen && (
                <div className="cal-add-dropdown show" style={{ position: 'absolute', right: 0, top: '100%' }}>
                  <button onClick={() => { setAddMenuOpen(false); openAddEvent(); }}><i className="fas fa-calendar-plus" /> Add Event</button>
                  <button onClick={() => { setAddMenuOpen(false); openQuickSession(); }}><i className="fas fa-bolt" /> Quick Session</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {isLoading ? (
          <MonthGridSkeleton className="mt-2" />
        ) : data ? (
          <>
            {mode === 'attendance' && (
              <div style={{ padding: '10px 16px', background: 'rgba(0,196,154,0.08)', border: '1px solid rgba(0,196,154,0.25)', borderRadius: 10, marginBottom: 12, fontSize: '0.82rem' }}>
                <i className="fas fa-info-circle" style={{ marginRight: 6 }} /> Click a <strong>session</strong> on the calendar to mark attendance.
              </div>
            )}
            {view === 'week'
              ? <WeekCalendar items={data} weekStart={weekStart} onItemClick={handleItemClick} onDayClick={handleDayClick} />
              : <MonthCalendar items={data} year={year} month={month} onItemClick={handleItemClick} onDayClick={handleDayClick} onMore={setDayPopupDate} />}
            {mode === 'attendance' && attendanceSession && (
              <AttendancePanel session={attendanceSession} onClose={() => setAttendanceSession(null)} />
            )}
          </>
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-light,#94a3b8)' }}>No calendar data for this club yet.</div>
        )}
      </div>

      {/* Recent activity */}
      <div className="activity-section" style={{ marginTop: 24 }}>
        <div className="activity-header">
          <h2>Recent Activity</h2>
          <Link to="/library" style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>View All Activity</Link>
        </div>
        <div className="activity-list">
          {isLoading ? (
            <ActivityListSkeleton rows={4} className="p-2" />
          ) : recentSessions.length === 0 ? (
            <div className="activity-item" style={{ justifyContent: 'center', color: 'var(--text-light,#94a3b8)' }}>No recent sessions.</div>
          ) : recentSessions.map(s => (
            <div className="activity-item" key={s.id}>
              <div className="dash-card-icon blue" style={{ width: 36, height: 36, fontSize: '0.9rem' }}><i className="fas fa-clipboard-list" /></div>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: '0.9rem' }}>{s.title || 'Session'}</strong>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-light,#94a3b8)' }}>{s.team || 'No team'} · {s.date}{s.startTime ? ` · ${s.startTime}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AddEventModal open={showAddEvent} onClose={() => setShowAddEvent(false)} defaultDate={addDate} />
      <QuickSessionModal open={showQuickSession} onClose={() => setShowQuickSession(false)} defaultDate={addDate} />
      <CalendarItemPopup item={selectedItem} onClose={() => setSelectedItem(null)} />
      {data && <DayItemsPopup items={data} dateStr={dayPopupDate} onClose={() => setDayPopupDate(null)} onItemClick={handleItemClick} onAdd={(d) => { setDayPopupDate(null); setChooserDate(d); }} />}

      {/* Day-click chooser — Google-cal style: pick what to add on the tapped day. */}
      {chooserDate && (
        <Modal open onClose={() => setChooserDate(null)} size="sm"
          title={`Add to ${new Date(chooserDate + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}`}>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => openQuickSession(chooserDate!)} className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 dark:border-sentinel-border p-4 hover:border-brand hover:bg-brand/5 transition-colors">
              <i className="fas fa-bolt text-brand text-xl" /><span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Quick Session</span>
            </button>
            <button onClick={() => openAddEvent(chooserDate!)} className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 dark:border-sentinel-border p-4 hover:border-brand hover:bg-brand/5 transition-colors">
              <i className="fas fa-calendar-plus text-brand text-xl" /><span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Add Event</span>
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};
