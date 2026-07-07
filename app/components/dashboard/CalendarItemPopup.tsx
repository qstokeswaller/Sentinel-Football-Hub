import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { CalClickItem } from './MonthCalendar';

/** Detail popup for a clicked calendar item (session / event / match). Events can be deleted. */
const Row: React.FC<{ icon: string; children: React.ReactNode }> = ({ icon, children }) => (
  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 mb-1.5">
    <i className={`fas ${icon} text-brand`} style={{ width: 16 }} />{children}
  </div>
);

export const CalendarItemPopup: React.FC<{ item: CalClickItem | null; onClose: () => void }> = ({ item, onClose }) => {
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!item) return null;

  const fmtDate = (d?: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'short', month: 'short', day: 'numeric' }) : '—';

  let title = '';
  let typeLabel = '';
  let rows: React.ReactNode = null;
  let link: { to: string; label: string } | null = null;

  if (item.kind === 'session') {
    const s = item.data;
    title = s.title || 'Session'; typeLabel = 'Training Session';
    rows = (<>
      <Row icon="fa-calendar">{fmtDate(s.date)}</Row>
      {s.startTime && <Row icon="fa-clock">{s.startTime}</Row>}
      {s.team && <Row icon="fa-users">{s.team}</Row>}
      {s.venue && <Row icon="fa-map-marker-alt">{s.venue}</Row>}
      {s.purpose && <Row icon="fa-bullseye">{s.purpose}</Row>}
    </>);
    // Sessions open in the planner (a quick session has no drills/library entry yet — build the plan there).
    link = { to: `/planner/${s.id}`, label: 'Open session plan' };
  } else if (item.kind === 'event') {
    const e = item.data;
    title = e.title; typeLabel = e.eventType || 'Event';
    rows = (<>
      <Row icon="fa-calendar">{fmtDate(e.date)}</Row>
      {e.startTime && <Row icon="fa-clock">{e.startTime}</Row>}
      {e.location && <Row icon="fa-map-marker-alt">{e.location}</Row>}
    </>);
  } else {
    const m = item.data;
    title = m.matchType === 'player_watch' ? (m.watchedPlayerName || 'Player Watch') : `${m.squadName} vs ${m.opponent || '—'}`;
    typeLabel = m.isPast ? 'Match Result' : 'Fixture';
    rows = (<>
      <Row icon="fa-calendar">{fmtDate(m.date)}</Row>
      {m.time && <Row icon="fa-clock">{m.time}</Row>}
      {m.opponent && <Row icon="fa-shield-halved">{m.opponent}</Row>}
      {m.isPast && (m.homeScore != null) && <Row icon="fa-futbol">{m.homeScore} – {m.awayScore}</Row>}
    </>);
    link = { to: '/matches', label: 'Open Matches' };
  }

  const deleteEvent = async () => {
    if (item.kind !== 'event') return;
    setBusy(true);
    const { error } = await supabase.from('calendar_events').delete().eq('id', item.data.id);
    setBusy(false);
    if (error) { showError(error); return; }
    queryClient.invalidateQueries({ queryKey: ['calendar'] });
    showToast('Event deleted.', 'success');
    onClose();
  };

  return (
    <Modal open={!!item} onClose={onClose} title={title} size="sm"
      footer={<>
        {item.kind === 'event' && <Button variant="ghost" onClick={deleteEvent} disabled={busy} className="text-rose-500 hover:bg-rose-500/10"><Trash2 size={15} /> {busy ? 'Deleting…' : 'Delete'}</Button>}
        {link && <Button variant="secondary" onClick={() => { navigate(link!.to); onClose(); }}>{link.label}</Button>}
        <Button variant="primary" onClick={onClose}>Close</Button>
      </>}>
      <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-brand mb-3">{typeLabel}</span>
      {rows}
    </Modal>
  );
};
