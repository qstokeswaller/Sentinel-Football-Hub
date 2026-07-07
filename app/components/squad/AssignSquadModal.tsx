import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reassignPlayer, type Squad } from '../../services/squadService';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select, Label } from '../ui/Input';

/** Reassign a player to a different squad (or unassign). */
export const AssignSquadModal: React.FC<{
  open: boolean; onClose: () => void; playerId: string; playerName: string; currentSquadId: string | null; squads: Squad[];
}> = ({ open, onClose, playerId, playerName, currentSquadId, squads }) => {
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const [squadId, setSquadId] = useState<string>(currentSquadId || '');

  const seeded = React.useRef(open);
  if (open && !seeded.current) { seeded.current = true; setSquadId(currentSquadId || ''); }
  if (!open && seeded.current) seeded.current = false;

  const mut = useMutation({
    mutationFn: () => reassignPlayer(playerId, squadId || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['player', playerId] });
      showToast('Player reassigned.', 'success'); onClose();
    },
    onError: (e) => showError(e),
  });

  return (
    <Modal open={open} onClose={onClose} title="Assign Squad" size="sm"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={mut.isPending} onClick={() => mut.mutate()}>{mut.isPending ? 'Saving…' : 'Move Player'}</Button>
      </>}>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Move <span className="font-semibold text-slate-700 dark:text-slate-200">{playerName}</span> to another squad.</p>
      <div><Label>Squad</Label>
        <Select value={squadId} onChange={e => setSquadId(e.target.value)}>
          <option value="">— Unassigned —</option>
          {squads.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>
    </Modal>
  );
};
