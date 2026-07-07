import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../context/ToastContext';
import { addScoutedPlayer, updateScoutedPlayer, type ScoutedPlayer } from '../../services/scoutService';
import { SCOUTING_STATUSES } from '../../lib/scoutingConstants';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select, Label } from '../ui/Input';

/** Add / Edit scouted player — ported from scouting-ui.js save. */
interface Props { open: boolean; onClose: () => void; player: ScoutedPlayer | null; }

export const ScoutFormModal: React.FC<Props> = ({ open, onClose, player }) => {
  const { effectiveClubId } = useAppState();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();

  const [f, setF] = useState(() => seed(player));
  const seededId = useRef<string | null>(player?.id ?? null);
  if (open && seededId.current !== (player?.id ?? null)) { seededId.current = player?.id ?? null; setF(seed(player)); }
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: f.name.trim(), position: f.position || null, age: f.age === '' ? null : Number(f.age),
        current_club: f.currentClub || null, agent_name: f.agentName || null, nationality: f.nationality || null,
        scouting_status: f.scoutingStatus,
      };
      if (player) await updateScoutedPlayer(player.id, payload);
      else await addScoutedPlayer(effectiveClubId!, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scouted'] });
      showToast(player ? 'Scouted player updated.' : 'Player added to scouting.', 'success');
      onClose();
    },
    onError: (e) => showError(e),
  });

  const submit = (e?: React.FormEvent) => { e?.preventDefault(); if (!f.name.trim()) return showToast('Name is required.', 'error'); mutation.mutate(); };

  return (
    <Modal open={open} onClose={onClose} title={player ? 'Edit Scouted Player' : 'Add Scouted Player'} size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={mutation.isPending} onClick={() => submit()}>{mutation.isPending ? 'Saving…' : (player ? 'Save Changes' : 'Add Player')}</Button>
      </>}>
      <form onSubmit={submit} className="space-y-4">
        <div><Label>Name *</Label><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Player name" autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Position</Label><Input value={f.position} onChange={e => set('position', e.target.value)} placeholder="e.g. ST" /></div>
          <div><Label>Age</Label><Input type="number" value={f.age} onChange={e => set('age', e.target.value)} /></div>
          <div><Label>Current Club</Label><Input value={f.currentClub} onChange={e => set('currentClub', e.target.value)} /></div>
          <div><Label>Nationality</Label><Input value={f.nationality} onChange={e => set('nationality', e.target.value)} /></div>
          <div><Label>Agent</Label><Input value={f.agentName} onChange={e => set('agentName', e.target.value)} /></div>
          <div><Label>Status</Label>
            <Select className="capitalize" value={f.scoutingStatus} onChange={e => set('scoutingStatus', e.target.value)}>
              {Object.entries(SCOUTING_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </div>
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
};

function seed(p: ScoutedPlayer | null) {
  return {
    name: p?.name || '', position: p?.position || '', age: p?.age?.toString() ?? '',
    currentClub: p?.current_club || '', nationality: p?.nationality || '', agentName: p?.agent_name || '',
    scoutingStatus: p?.scouting_status || 'watching',
  };
}
