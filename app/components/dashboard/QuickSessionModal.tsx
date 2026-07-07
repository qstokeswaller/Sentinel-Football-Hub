import React, { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppState } from '../../context/AppStateContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useSquads, usePlayers } from '../../hooks/useSquads';
import { saveSession, emptySession } from '../../services/plannerService';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Label, Select } from '../ui/Input';
import { DatePicker } from '../ui/DatePicker';
import { TimePicker } from '../ui/TimePicker';
import { PlayerMultiSelect } from './PlayerMultiSelect';

/**
 * Quick Session — create a session fast from the dashboard, then jump into the planner.
 * Archetype-aware: default clubs pick a SQUAD; one-to-one programmes (Orion) pick the specific
 * PLAYERS (searchable, across squads). Everything is coach-scoped via useSquads/usePlayers.
 */
export const QuickSessionModal: React.FC<{ open: boolean; onClose: () => void; defaultDate?: string }> = ({ open, onClose, defaultDate }) => {
  const { effectiveClubId, archetype } = useAppState();
  const { user } = useAuth();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const { data: squads } = useSquads();
  const { data: players } = usePlayers();
  const isPrivate = archetype === 'private_coaching';
  const squadNames = useMemo(() => Object.fromEntries((squads || []).map(s => [s.id, s.name])), [squads]);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => defaultDate || new Date().toISOString().slice(0, 10));
  React.useEffect(() => { if (open) setDate(defaultDate || new Date().toISOString().slice(0, 10)); }, [open, defaultDate]);
  const [startTime, setStartTime] = useState('');
  const [team, setTeam] = useState('');                  // default clubs: squad name
  const [playerIds, setPlayerIds] = useState<string[]>([]); // Orion: specific players
  const [duration, setDuration] = useState('60');
  const [repeat, setRepeat] = useState(false);
  const [weeks, setWeeks] = useState('4');

  // For Orion, derive the team label from the selected players' squads (so attendance can resolve a squad).
  const orionTeam = useMemo(() => {
    const names = new Set<string>();
    playerIds.forEach(id => { const p = (players || []).find(x => x.id === id); if (p?.squadId && squadNames[p.squadId]) names.add(squadNames[p.squadId]); });
    return [...names].join(', ');
  }, [playerIds, players, squadNames]);

  const create = useMutation({
    mutationFn: async () => {
      const teamLabel = isPrivate ? orionTeam : team;
      const ids: string[] = [];
      const count = repeat ? Math.max(1, Math.min(52, Number(weeks) || 1)) : 1;
      for (let i = 0; i < count; i++) {
        const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + i * 7);
        const id = await saveSession(effectiveClubId!, user?.id ?? null,
          { ...emptySession(), title: title.trim(), team: teamLabel, date: d.toISOString().slice(0, 10), startTime, duration, playerIds: isPrivate ? playerIds : [] }, []);
        ids.push(id);
      }
      return { ids, count };
    },
    onSuccess: ({ count }) => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['lib-sessions'] });
      onClose();
      showToast(count > 1 ? `Created ${count} weekly sessions — on your calendar.` : 'Session created — it’s on your calendar. Open it to add a plan.', 'success');
    },
    onError: (e) => showError(e),
  });

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!title.trim()) return showToast('Session title is required.', 'error');
    if (isPrivate && playerIds.length === 0) return showToast('Select at least one player for this session.', 'error');
    create.mutate();
  };
  const ctaLabel = create.isPending ? 'Creating…' : repeat ? `Create ${Math.max(1, Math.min(52, Number(weeks) || 1))} sessions` : 'Create & Plan';

  return (
    <Modal open={open} onClose={onClose} title="Quick Session" size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={create.isPending} onClick={() => submit()}>{ctaLabel}</Button>
      </>}>
      <form onSubmit={submit} className="space-y-4">
        <div><Label>Session Title *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Tuesday Possession Work" autoFocus /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>{repeat ? 'First date' : 'Date'}</Label><DatePicker value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><Label>Start Time</Label><TimePicker value={startTime} onChange={setStartTime} /></div>
          <div><Label>Duration (min)</Label><Input type="number" value={duration} onChange={e => setDuration(e.target.value)} /></div>
        </div>

        {isPrivate ? (
          <div>
            <Label>Players for this session *</Label>
            <PlayerMultiSelect players={players || []} squadNames={squadNames} value={playerIds} onChange={setPlayerIds} placeholder="Search players across squads…" />
          </div>
        ) : (
          <div><Label>Squad / Team</Label>
            <Select value={team} onChange={e => setTeam(e.target.value)}>
              <option value="">Select squad…</option>
              {(squads || []).map(s => <option key={s.id} value={s.name}>{s.name}{s.ageGroup ? ` · ${s.ageGroup}` : ''}</option>)}
            </Select>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 dark:border-sentinel-border p-3">
          <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
            <input type="checkbox" checked={repeat} onChange={e => setRepeat(e.target.checked)} className="accent-brand w-4 h-4" />
            Repeat weekly
          </label>
          {repeat && (
            <div className="flex items-center gap-2 mt-3 text-sm text-slate-600 dark:text-slate-300">
              for <Input type="number" min={1} max={52} value={weeks} onChange={e => setWeeks(e.target.value)} className="w-20" /> week{Number(weeks) === 1 ? '' : 's'}
              <span className="text-xs text-slate-400">(same day each week)</span>
            </div>
          )}
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
};
