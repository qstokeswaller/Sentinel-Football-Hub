import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../context/ToastContext';
import { addPlayer, updatePlayer, type Player, type Squad } from '../../services/squadService';
import { uploadAvatar } from '../../services/storageService';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Textarea, Select, Label } from '../ui/Input';
import { DatePicker } from '../ui/DatePicker';

/** Add / Edit player modal — ported from squad-players-ui.js. Photo → avatars bucket. */
const FOOT = ['Right', 'Left', 'Both'];
const STATUS = ['active', 'injured', 'suspended', 'inactive'];
const initials = (n: string) => n.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

interface Props { open: boolean; onClose: () => void; player: Player | null; squads: Squad[]; defaultSquadId?: string | null; }

export const PlayerFormModal: React.FC<Props> = ({ open, onClose, player, squads, defaultSquadId }) => {
  const { effectiveClubId } = useAppState();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [f, setF] = useState(() => seed(player, defaultSquadId));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>(player?.profileImageUrl || '');

  const seededId = useRef<string | null>(player?.id ?? null);
  if (open && seededId.current !== (player?.id ?? null)) {
    seededId.current = player?.id ?? null;
    setF(seed(player, defaultSquadId));
    setPhotoFile(null);
    setPhotoPreview(player?.profileImageUrl || '');
  }

  const set = (k: string, v: any) => setF(prev => ({ ...prev, [k]: v }));

  const mutation = useMutation({
    mutationFn: async () => {
      let profileImageUrl = player?.profileImageUrl || '';
      if (photoFile) profileImageUrl = await uploadAvatar(photoFile);
      const payload = {
        ...f,
        age: f.age === '' ? null : Number(f.age),
        jerseyNumber: f.jerseyNumber === '' ? null : Number(f.jerseyNumber),
        ...(profileImageUrl ? { profileImageUrl } : {}),
      };
      if (player) await updatePlayer(player.id, payload);
      else await addPlayer(effectiveClubId!, { ...payload, joinDate: new Date().toISOString().split('T')[0] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      showToast(player ? 'Player updated.' : 'Player added.', 'success');
      onClose();
    },
    onError: (e) => showError(e),
  });

  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!f.name.trim()) return showToast('Player name is required.', 'error');
    mutation.mutate();
  };

  return (
    <Modal open={open} onClose={onClose} title={player ? 'Edit Player' : 'Add Player'} size="lg"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={mutation.isPending} onClick={() => submit()}>{mutation.isPending ? 'Saving…' : (player ? 'Save Changes' : 'Add Player')}</Button>
      </>}>
      <form onSubmit={submit} className="space-y-4">
        {/* Photo */}
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => fileRef.current?.click()} className="relative w-16 h-16 rounded-full bg-brand/15 text-brand flex items-center justify-center text-lg font-bold overflow-hidden shrink-0">
            {photoPreview ? <img src={photoPreview} alt="" className="w-full h-full object-cover" /> : (f.name ? initials(f.name) : <Camera size={20} />)}
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity text-white"><Camera size={16} /></span>
          </button>
          <div className="text-xs text-slate-500 dark:text-slate-400">Click to {photoPreview ? 'change' : 'upload'} a photo. Optional.</div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickPhoto} />
        </div>

        <div><Label>Full Name *</Label><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Player name" autoFocus /></div>

        <div className="grid grid-cols-2 gap-3">
          <div><Label>Squad</Label>
            <Select value={f.squadId} onChange={e => set('squadId', e.target.value)}>
              <option value="">— None —</option>
              {squads.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div><Label>Status</Label>
            <Select className="capitalize" value={f.playerStatus} onChange={e => set('playerStatus', e.target.value)}>
              {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          <div><Label>Jersey #</Label><Input type="number" value={f.jerseyNumber} onChange={e => set('jerseyNumber', e.target.value)} /></div>
          <div><Label>Position</Label><Input value={f.position} onChange={e => set('position', e.target.value)} placeholder="e.g. CM, ST" /></div>
          <div><Label>Age</Label><Input type="number" value={f.age} onChange={e => set('age', e.target.value)} /></div>
          <div><Label>Date of Birth</Label><DatePicker value={f.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} /></div>
          <div><Label>Preferred Foot</Label>
            <Select value={f.foot} onChange={e => set('foot', e.target.value)}>{FOOT.map(x => <option key={x} value={x}>{x}</option>)}</Select>
          </div>
          <div><Label>Nationality</Label><Input value={f.nationality} onChange={e => set('nationality', e.target.value)} /></div>
          <div><Label>Height</Label><Input value={f.height} onChange={e => set('height', e.target.value)} placeholder="e.g. 180cm" /></div>
          <div><Label>Weight</Label><Input value={f.weight} onChange={e => set('weight', e.target.value)} placeholder="e.g. 74kg" /></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><Label>Phone</Label><Input value={f.phone} onChange={e => set('phone', e.target.value)} /></div>
          <div><Label>Email</Label><Input type="email" value={f.email} onChange={e => set('email', e.target.value)} /></div>
        </div>
        <div><Label>Bio / Notes</Label><Textarea className="h-20" value={f.bio} onChange={e => set('bio', e.target.value)} /></div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
};

function seed(p: Player | null, defaultSquadId?: string | null) {
  return {
    name: p?.name || '', squadId: p?.squadId || defaultSquadId || '', jerseyNumber: p?.jerseyNumber?.toString() || '',
    position: p?.position || '', age: p?.age?.toString() || '', dateOfBirth: p?.dateOfBirth || '',
    foot: p?.foot || 'Right', nationality: p?.nationality || '', height: p?.height || '', weight: p?.weight || '',
    phone: p?.phone || '', email: p?.email || '', bio: p?.bio || '', playerStatus: p?.playerStatus || 'active',
  };
}
