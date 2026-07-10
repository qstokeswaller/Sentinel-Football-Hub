import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Camera } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../context/ToastContext';
import { addScoutedPlayer, updateScoutedPlayer, type ScoutedPlayer } from '../../services/scoutService';
import { uploadAvatar } from '../../services/storageService';
import { SCOUTING_STATUSES } from '../../lib/scoutingConstants';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Textarea, Select, Label } from '../ui/Input';

/** Add / Edit scouted player — ported from scouting-ui.js save. Delete lives here (in the
 *  player's profile), not on the card, so it can't be hit by accident from the list. */
interface Props { open: boolean; onClose: () => void; player: ScoutedPlayer | null; onDelete?: (p: ScoutedPlayer) => void; }

const initials = (n: string) => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);

export const ScoutFormModal: React.FC<Props> = ({ open, onClose, player, onDelete }) => {
  const { effectiveClubId } = useAppState();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [f, setF] = useState(() => seed(player));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState(player?.photo_url || '');
  const seededId = useRef<string | null>(player?.id ?? null);
  if (open && seededId.current !== (player?.id ?? null)) {
    seededId.current = player?.id ?? null; setF(seed(player)); setPhotoFile(null); setPhotoPreview(player?.photo_url || '');
  }
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));
  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); };

  const mutation = useMutation({
    mutationFn: async () => {
      let photo_url = player?.photo_url || null;
      if (photoFile) photo_url = await uploadAvatar(photoFile, 'scouts');
      const payload = {
        name: f.name.trim(), position: f.position.trim() || null, age: f.age.trim() || null,
        current_club: f.currentClub.trim() || null, agent_name: f.agentName.trim() || null,
        foot: f.foot || null, notes: f.notes.trim() || null, scouting_status: f.scoutingStatus,
        ...(photo_url ? { photo_url } : {}),
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
        {player && onDelete && <button type="button" onClick={() => onDelete(player)} className="mr-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors"><Trash2 size={15} /> Delete</button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={mutation.isPending} onClick={() => submit()}>{mutation.isPending ? 'Saving…' : (player ? 'Save Changes' : 'Add Player')}</Button>
      </>}>
      <form onSubmit={submit} className="space-y-4">
        {/* Profile photo — real avatar with initials fallback, same as squad players */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-brand/15 text-brand grid place-items-center text-xl font-bold overflow-hidden shrink-0">
            {photoPreview ? <img src={photoPreview} alt={f.name} className="w-full h-full object-cover" /> : initials(f.name)}
          </div>
          <div>
            <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}><Camera size={14} /> {photoPreview ? 'Change Photo' : 'Upload Photo'}</Button>
            <p className="text-[11px] text-slate-400 mt-1.5">JPG, PNG or WebP · Max 2MB</p>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickPhoto} />
          </div>
        </div>
        <div><Label>Name *</Label><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Player name" autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Position(s)</Label><Input value={f.position} onChange={e => set('position', e.target.value)} placeholder="e.g. ST, CAM" /></div>
          <div><Label>Age</Label><Input value={f.age} onChange={e => set('age', e.target.value)} placeholder="e.g. 17" /></div>
          <div><Label>Current Club</Label><Input value={f.currentClub} onChange={e => set('currentClub', e.target.value)} /></div>
          <div><Label>Agent</Label><Input value={f.agentName} onChange={e => set('agentName', e.target.value)} /></div>
          <div><Label>Preferred Foot</Label>
            <Select value={f.foot} onChange={e => set('foot', e.target.value)}>
              <option value="">—</option><option value="Right">Right</option><option value="Left">Left</option><option value="Both">Both</option>
            </Select>
          </div>
          <div><Label>Status</Label>
            <Select className="capitalize" value={f.scoutingStatus} onChange={e => set('scoutingStatus', e.target.value)}>
              {Object.entries(SCOUTING_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </div>
        </div>
        <div><Label>General Notes</Label><Textarea rows={3} value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Anything not tied to a specific report — context, contacts, next steps…" /></div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
};

function seed(p: ScoutedPlayer | null) {
  return {
    name: p?.name || '', position: p?.position || '', age: p?.age?.toString() ?? '',
    currentClub: p?.current_club || '', agentName: p?.agent_name || '', foot: p?.foot || '',
    notes: p?.notes || '', scoutingStatus: p?.scouting_status || 'watching',
  };
}
