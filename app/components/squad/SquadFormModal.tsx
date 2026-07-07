import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../context/ToastContext';
import { addSquad, updateSquad, type Squad } from '../../services/squadService';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Textarea, Label } from '../ui/Input';

/** Add / Edit squad modal — ported from squad-ui.js (name, age group, league table URL, notes). */
interface Props { open: boolean; onClose: () => void; squad: Squad | null; }

export const SquadFormModal: React.FC<Props> = ({ open, onClose, squad }) => {
  const { effectiveClubId } = useAppState();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();

  const [f, setF] = useState(() => seed(squad));
  const seededId = useRef<string | null>(squad?.id ?? null);
  if (open && seededId.current !== (squad?.id ?? null)) {
    seededId.current = squad?.id ?? null;
    setF(seed(squad));
  }
  const set = (k: string, v: any) => setF(prev => ({ ...prev, [k]: v }));

  const mutation = useMutation({
    mutationFn: async () => {
      if (squad) await updateSquad(squad.id, f);
      else await addSquad(effectiveClubId!, f);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['squads'] });
      showToast(squad ? 'Squad updated.' : 'Squad added.', 'success');
      onClose();
    },
    onError: (e) => showError(e),
  });

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!f.name.trim()) return showToast('Squad name is required.', 'error');
    mutation.mutate();
  };

  return (
    <Modal open={open} onClose={onClose} title={squad ? 'Edit Squad' : 'Add Squad'} size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={mutation.isPending} onClick={() => submit()}>{mutation.isPending ? 'Saving…' : (squad ? 'Save Changes' : 'Add Squad')}</Button>
      </>}>
      <form onSubmit={submit} className="space-y-4">
        <div><Label>Squad Name *</Label><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. First Team, U17 Boys" autoFocus /></div>
        <div><Label>Age Group</Label><Input value={f.ageGroup} onChange={e => set('ageGroup', e.target.value)} placeholder="e.g. Senior, U17, General" /></div>
        <div><Label>League Table URL (optional)</Label><Input value={f.leagueTableUrl} onChange={e => set('leagueTableUrl', e.target.value)} placeholder="https://…" /></div>
        <div><Label>Notes (optional)</Label><Textarea className="h-20" value={f.notes} onChange={e => set('notes', e.target.value)} /></div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
};

function seed(s: Squad | null) {
  return { name: s?.name || '', ageGroup: s?.ageGroup || '', leagueTableUrl: s?.leagueTableUrl || '', notes: s?.notes || '' };
}
