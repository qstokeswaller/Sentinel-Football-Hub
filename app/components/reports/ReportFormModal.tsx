import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../context/ToastContext';
import { useLibrarySessions } from '../../hooks/useLibrary';
import { usePlayers, useSquads } from '../../hooks/useSquads';
import { createReport } from '../../services/reportService';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Textarea, Select, Label } from '../ui/Input';
import { DatePicker } from '../ui/DatePicker';

/** Create a session reflection report. Selecting a session auto-fills date, team and
 *  squad size; the recorder's name is attached automatically (created_by). */
const INTENSITIES = ['Low', 'Normal', 'High', 'Very High'];

export const ReportFormModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { effectiveClubId, profile } = useAppState();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const { data: sessions } = useLibrarySessions();
  const { data: players } = usePlayers();
  const { data: squads } = useSquads();

  const [sessionId, setSessionId] = useState('');
  const [date, setDate] = useState('');
  const [team, setTeam] = useState('');
  const [present, setPresent] = useState('');
  const [total, setTotal] = useState('');
  const [rating, setRating] = useState(0);
  const [intensity, setIntensity] = useState('Normal');
  const [notes, setNotes] = useState('');

  // Squad size for a team string = players in the squad(s) whose name matches the session's team.
  const countSquad = (teamName: string | null) => {
    if (!teamName) return 0;
    const names = teamName.toLowerCase().split(',').map(t => t.trim());
    const squadIds = (squads || []).filter(s => names.includes(s.name.toLowerCase())).map(s => s.id);
    if (!squadIds.length) return 0;
    return (players || []).filter(p => p.squadId && squadIds.includes(p.squadId)).length;
  };

  const onPickSession = (id: string) => {
    setSessionId(id);
    const s = sessions?.find(x => x.id === id);
    if (!s) { setTeam(''); return; }
    if (s.date) setDate(s.date as string);
    setTeam(s.team || '');
    // Auto-fill squad size from the matching squad's roster; default present = size.
    const size = countSquad(s.team);
    if (size) { setTotal(String(size)); setPresent(String(size)); }
  };

  const create = useMutation({
    mutationFn: () => createReport(effectiveClubId!, { sessionId: sessionId || null, date, attendanceCount: present, attendanceTotal: total, rating, intensity, notes, createdBy: profile?.id || null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['reports'] }); showToast('Report created.', 'success'); reset(); onClose(); },
    onError: (e) => showError(e),
  });
  const reset = () => { setSessionId(''); setDate(''); setTeam(''); setPresent(''); setTotal(''); setRating(0); setIntensity('Normal'); setNotes(''); };
  const submit = (e?: React.FormEvent) => { e?.preventDefault(); if (!sessionId && !date) return showToast('Pick a session or a date.', 'error'); create.mutate(); };

  return (
    <Modal open={open} onClose={onClose} title="New Session Report" size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={create.isPending} onClick={() => submit()}>{create.isPending ? 'Saving…' : 'Create Report'}</Button>
      </>}>
      <form onSubmit={submit} className="space-y-4">
        <div><Label>Which session did you run?</Label>
          <Select value={sessionId} onChange={e => onPickSession(e.target.value)}>
            <option value="">— General (no session) —</option>
            {(sessions || []).map(s => <option key={s.id} value={s.id}>{s.title || 'Untitled'}{s.date ? ` (${s.date})` : ''}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Date</Label><DatePicker value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><Label>Team / Group</Label><Input value={team} onChange={e => setTeam(e.target.value)} placeholder="No Team / General" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Players present</Label><Input type="number" value={present} onChange={e => setPresent(e.target.value)} /></div>
          <div><Label>Squad size</Label><Input type="number" value={total} onChange={e => setTotal(e.target.value)} /></div>
        </div>
        <div><Label>Overall Rating</Label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" onClick={() => setRating(n === rating ? 0 : n)} className="p-0.5"><Star size={22} className={n <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-300 dark:text-slate-600'} /></button>)}
          </div>
        </div>
        <div><Label>Intensity</Label><Select value={intensity} onChange={e => setIntensity(e.target.value)}>{INTENSITIES.map(i => <option key={i} value={i}>{i}</option>)}</Select></div>
        <div><Label>General Notes</Label><Textarea className="h-24" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reflection, coaching points, what to work on…" /></div>
        <p className="text-xs text-slate-400">Recorded by <span className="font-semibold text-slate-500 dark:text-slate-300">{profile?.full_name || 'You'}</span> — attached automatically.</p>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
};
