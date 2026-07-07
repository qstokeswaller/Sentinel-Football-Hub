import React, { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Trash2, Image as ImageIcon, UserCircle } from 'lucide-react';
import { updatePlayer, type Player } from '../../services/squadService';
import { savePlayerMediaArray } from '../../services/mediaService';
import { uploadAvatar } from '../../services/storageService';
import { useToast } from '../../context/ToastContext';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Button } from '../ui/Button';

/** Media tab — Profile Photo (change/remove) + Player Gallery (upload/remove photos). */
const initials = (n: string) => n.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
type Photo = { url: string; name?: string };

export const PlayerMediaTab: React.FC<{ player: Player; canEdit?: boolean }> = ({ player, canEdit = false }) => {
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const photoRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const gallery = (player.galleryPhotos || []) as Photo[];

  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['player', player.id] }); queryClient.invalidateQueries({ queryKey: ['players'] }); };

  const setPhoto = useMutation({
    mutationFn: (url: string) => updatePlayer(player.id, { profileImageUrl: url }),
    onSuccess: () => { invalidate(); showToast('Profile photo updated.', 'success'); },
    onError: (e) => showError(e),
  });
  const saveGallery = useMutation({
    mutationFn: (arr: Photo[]) => savePlayerMediaArray(player.id, 'gallery_photos', arr),
    onSuccess: () => invalidate(),
    onError: (e) => showError(e),
  });

  const onProfilePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    if (file.size > 2 * 1024 * 1024) return showToast('Max 2MB.', 'error');
    setBusy(true);
    try { const url = await uploadAvatar(file, `players/${player.id}`); setPhoto.mutate(url); } catch (err) { showError(err); } finally { setBusy(false); }
  };
  const onGallery = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []); e.target.value = ''; if (!files.length) return;
    setBusy(true);
    try {
      const added: Photo[] = [];
      for (const file of files) {
        if (file.size > 5 * 1024 * 1024) { showToast(`${file.name} skipped (max 5MB).`, 'error'); continue; }
        const url = await uploadAvatar(file, `players/${player.id}/gallery`);
        added.push({ url, name: file.name });
      }
      if (added.length) { await saveGallery.mutateAsync([...gallery, ...added]); showToast(`${added.length} photo(s) added.`, 'success'); }
    } catch (err) { showError(err); } finally { setBusy(false); }
  };
  const removePhoto = (idx: number) => saveGallery.mutate(gallery.filter((_, i) => i !== idx), { onSuccess: () => { invalidate(); showToast('Photo removed.', 'success'); } });

  const Card = 'rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface p-5';

  return (
    <div className="space-y-4">
      <div className={Card}>
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><UserCircle size={18} className="text-brand" /> Profile Photo</h3>
        <div className="flex items-center gap-5 flex-wrap">
          <div className="w-[72px] h-[72px] rounded-full bg-brand/15 text-brand flex items-center justify-center text-2xl font-bold overflow-hidden shrink-0">
            {player.profileImageUrl ? <img src={player.profileImageUrl} alt={player.name} className="w-full h-full object-cover" /> : initials(player.name)}
          </div>
          {canEdit && (
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="secondary" size="sm" onClick={() => photoRef.current?.click()} disabled={busy}><Camera size={14} /> Change Photo</Button>
                {player.profileImageUrl && <Button variant="ghost" size="sm" onClick={() => setPhoto.mutate('')} className="text-rose-500 hover:bg-rose-500/10"><Trash2 size={14} /> Remove</Button>}
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">JPG, PNG or WebP · Max 2MB · Changes save immediately</p>
              <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onProfilePhoto} />
            </div>
          )}
        </div>
      </div>

      <div className={Card}>
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2"><ImageIcon size={18} className="text-brand" /> Player Gallery <span className="text-xs font-normal text-slate-400">({gallery.length})</span></h3>
          {canEdit && <><Button variant="secondary" size="sm" onClick={() => galleryRef.current?.click()} disabled={busy}><Camera size={14} /> {busy ? 'Uploading…' : 'Add Photos'}</Button>
            <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={onGallery} /></>}
        </div>
        <p className="text-xs text-slate-400 mb-4">Photographer shots, match photos, action shots. JPG/PNG/WebP · Max 5MB each.</p>
        {gallery.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {gallery.map((p, i) => (
              <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-sentinel-border">
                <a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={p.name || 'Gallery photo'} className="w-full h-full object-cover hover:scale-105 transition-transform" /></a>
                {canEdit && <button onClick={() => setConfirmRemove(i)} className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-rose-600"><Trash2 size={12} /></button>}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 dark:border-sentinel-border py-10 text-center text-slate-400">
            <ImageIcon size={26} className="mx-auto mb-2 opacity-50" />
            <p className="font-semibold text-slate-500 dark:text-slate-300 text-sm">No gallery photos yet.</p>
            <p className="text-xs mt-0.5">Add action shots or photographer photos for this player.</p>
          </div>
        )}
      </div>

      {confirmRemove != null && (
        <ConfirmModal open onClose={() => setConfirmRemove(null)} onConfirm={() => { removePhoto(confirmRemove); setConfirmRemove(null); }}
          title="Remove this photo?" message="This photo will be removed from the player's gallery." confirmLabel="Remove" busyLabel="Removing…" />
      )}
    </div>
  );
};
