import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Check } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useSquads } from '../../hooks/useSquads';
import { fetchCoachSquadAssignments, setCoachSquadAssignments } from '../../services/settingsService';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

/**
 * Assign a coach/viewer to squads (squad_coaches). Drives coach squad-scoping —
 * an assigned coach only sees those squads' players, matches, calendar & highlights.
 */
export const StaffSquadAssign: React.FC<{ coachId: string; coachName: string }> = ({ coachId, coachName }) => {
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const { data: squads } = useSquads();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: assigned } = useQuery({
    queryKey: ['coachSquadAssignments', coachId],
    queryFn: () => fetchCoachSquadAssignments(coachId),
    staleTime: 60_000,
  });
  useEffect(() => { if (assigned) setSelected(new Set(assigned)); }, [assigned, open]);

  const save = useMutation({
    mutationFn: () => setCoachSquadAssignments(coachId, [...selected]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coachSquadAssignments', coachId] });
      queryClient.invalidateQueries({ queryKey: ['coachSquadIds', coachId] }); // refresh that coach's scope
      showToast('Squad assignments updated.', 'success');
      setOpen(false);
    },
    onError: (e) => showError(e),
  });

  const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const count = assigned?.length ?? 0;

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Shield size={13} /> Squads{count ? ` · ${count}` : ''}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Squad access · ${coachName}`} size="sm"
        footer={<>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</Button>
        </>}>
        {!squads?.length ? (
          <p className="text-sm text-slate-400 py-4 text-center">No squads to assign yet.</p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Select which squads this member can access. Leave all unchecked to give no squad access.</p>
            {squads.map(s => {
              const on = selected.has(s.id);
              return (
                <button key={s.id} onClick={() => toggle(s.id)}
                  className={'w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ' +
                    (on ? 'border-brand bg-brand/10 text-slate-900 dark:text-white' : 'border-slate-200 dark:border-sentinel-border text-slate-600 dark:text-slate-300 hover:border-brand')}>
                  <span className="font-medium">{s.name}{s.ageGroup ? <span className="text-slate-400 font-normal"> · {s.ageGroup}</span> : ''}</span>
                  <span className={'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ' + (on ? 'bg-brand border-brand text-[#0D1B2A]' : 'border-slate-300 dark:border-sentinel-border')}>{on && <Check size={13} />}</span>
                </button>
              );
            })}
          </div>
        )}
      </Modal>
    </>
  );
};
