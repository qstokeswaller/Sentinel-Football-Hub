import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../context/ToastContext';
import { createSquadAssessment } from '../../services/squadAssessmentService';
import type { Squad } from '../../services/squadService';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Textarea, Select, Label } from '../ui/Input';
import { DatePicker } from '../ui/DatePicker';

/** Comprehensive Squad Assessment — group ratings (1–10) + qualitative feedback.
 *  Pass a fixed squadId+squadName (from a roster), or a `squads` list to pick from (Team Reports). */
const CONTEXTS = ['Match', 'Training', 'Tournament', 'Periodic Review'];

export const SquadAssessmentModal: React.FC<{ open: boolean; onClose: () => void; squadId?: string; squadName?: string; squads?: Squad[] }> = ({ open, onClose, squadId: fixedSquadId, squadName, squads }) => {
  const { effectiveClubId, profile } = useAppState();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();

  const [pickedSquadId, setPickedSquadId] = useState('');
  const squadId = fixedSquadId || pickedSquadId;
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [context, setContext] = useState('Match');
  const [tactical, setTactical] = useState('');
  const [physical, setPhysical] = useState('');
  const [mentality, setMentality] = useState('');
  const [overall, setOverall] = useState('');
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');
  const [notes, setNotes] = useState('');

  const num = (v: string) => v === '' ? 0 : Math.min(10, Math.max(0, parseInt(v, 10) || 0));

  const create = useMutation({
    mutationFn: () => {
      if (!squadId) throw new Error('Select a team first.');
      return createSquadAssessment(effectiveClubId!, {
        squadId, date, context, author: profile?.full_name || '',
        ratings: { tactical: num(tactical), physical: num(physical), mentality: num(mentality), overall: num(overall) },
        feedback: { strengths, improvements, notes },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['squadAssessments', squadId] });
      queryClient.invalidateQueries({ queryKey: ['clubSquadAssessments'] });
      showToast('Squad assessment saved.', 'success'); onClose();
    },
    onError: (e) => showError(e),
  });

  const Rating: React.FC<{ label: string; value: string; set: (v: string) => void; ph: string }> = ({ label, value, set, ph }) => (
    <div><Label>{label}</Label><Input type="number" min={1} max={10} value={value} onChange={e => set(e.target.value)} placeholder={ph} /></div>
  );

  return (
    <Modal open={open} onClose={onClose} title="Comprehensive Squad Assessment" size="xl"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Saving…' : 'Save Assessment'}</Button>
      </>}>
      <div className="space-y-5">
        {!fixedSquadId && squads && (
          <div><Label>Team</Label>
            <Select value={pickedSquadId} onChange={e => setPickedSquadId(e.target.value)}>
              <option value="">— Select a team —</option>
              {squads.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label>Assessment Date</Label><DatePicker value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><Label>Context</Label><Select value={context} onChange={e => setContext(e.target.value)}>{CONTEXTS.map(c => <option key={c} value={c}>{c}</option>)}</Select></div>
        </div>

        <div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Group Ratings (1–10)</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Rating label="Tactical Execution" value={tactical} set={setTactical} ph="e.g. 7" />
            <Rating label="Physical Condition" value={physical} set={setPhysical} ph="e.g. 8" />
            <Rating label="Squad Cohesion & Mentality" value={mentality} set={setMentality} ph="e.g. 9" />
            <Rating label="Overall Rating" value={overall} set={setOverall} ph="e.g. 8" />
          </div>
        </div>

        <div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Qualitative Feedback</h4>
          <div className="space-y-3">
            <div><Label>Key Strengths</Label><Textarea rows={2} value={strengths} onChange={e => setStrengths(e.target.value)} placeholder={`What did ${squadName || 'the squad'} do well?`} /></div>
            <div><Label>Areas for Improvement</Label><Textarea rows={2} value={improvements} onChange={e => setImprovements(e.target.value)} placeholder="Where does the squad need work?" /></div>
            <div><Label>Additional Notes</Label><Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any other observations…" /></div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
