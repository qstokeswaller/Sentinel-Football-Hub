import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppState } from '../../context/AppStateContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Textarea, Select, Label } from '../ui/Input';
import { DatePicker } from '../ui/DatePicker';
import { TimePicker } from '../ui/TimePicker';

/** Add Calendar Event modal — ported from dashboard.html + calendar-ui.js saveEvent. */
const EVENT_TYPES = ['Staff Meeting', 'Video Analysis', 'Tactical Briefing', 'Fitness Testing', 'Medical Review', 'Scouting', 'Team Bonding', 'Parents Meeting', 'Tournament', 'Friendly', 'Custom'];
const COLORS = ['#00C49A', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#1e293b', '#64748b'];

export const AddEventModal: React.FC<{ open: boolean; onClose: () => void; defaultDate?: string }> = ({ open, onClose, defaultDate }) => {
  const { effectiveClubId } = useAppState();
  const { user } = useAuth();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();

  const [type, setType] = useState('Staff Meeting');
  const [customTitle, setCustomTitle] = useState('');
  const [date, setDate] = useState(defaultDate || '');
  React.useEffect(() => { if (open) setDate(defaultDate || ''); }, [open, defaultDate]);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const title = type === 'Custom' ? customTitle.trim() : type;
    if (!title) return showToast('Please enter an event title.', 'error');
    if (!date) return showToast('Please choose a date.', 'error');
    setBusy(true);
    const { error } = await supabase.from('calendar_events').insert({
      club_id: effectiveClubId, created_by: user?.id ?? null, title, event_type: type === 'Custom' ? 'Custom' : type, date,
      start_time: startTime || null, end_time: endTime || null, location: location || null, description: description || null, color,
    });
    setBusy(false);
    if (error) { showError(error); return; }
    queryClient.invalidateQueries({ queryKey: ['calendar'] });
    showToast('Event added.', 'success');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Calendar Event" size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={busy}><Check size={15} /> {busy ? 'Saving…' : 'Save Event'}</Button>
      </>}>
      <div className="space-y-4">
        <div><Label>Event Type</Label>
          <Select value={type} onChange={e => setType(e.target.value)}>{EVENT_TYPES.map(t => <option key={t} value={t}>{t === 'Custom' ? 'Custom…' : t}</option>)}</Select>
        </div>
        {type === 'Custom' && <div><Label>Custom Title</Label><Input value={customTitle} onChange={e => setCustomTitle(e.target.value)} placeholder="e.g. Sponsor Visit" /></div>}
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Date</Label><DatePicker value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><Label>Start Time</Label><TimePicker value={startTime} onChange={setStartTime} /></div>
          <div><Label>End Time</Label><TimePicker value={endTime} onChange={setEndTime} /></div>
        </div>
        <div><Label>Location</Label><Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Conference Room, Main Office" /></div>
        <div><Label>Description (optional)</Label><Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief notes about this event…" /></div>
        <div><Label>Bubble Color</Label>
          <div className="flex gap-2 flex-wrap pt-1">
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)} className={'w-7 h-7 rounded-full transition-transform ' + (color === c ? 'ring-2 ring-offset-2 ring-brand dark:ring-offset-sentinel-surface scale-110' : 'hover:scale-110')} style={{ background: c }} />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
};
