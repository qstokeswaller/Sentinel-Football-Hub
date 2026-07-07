import React, { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Link2, Trash2, ExternalLink, Image as ImageIcon, PlayCircle } from 'lucide-react';
import { updateSquad } from '../../services/squadService';
import { uploadAvatar } from '../../services/storageService';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

/** Squad media gallery — photos (Supabase storage) + video links, stored on squads.media. */
type MediaItem = { type: 'photo' | 'video'; url: string; name?: string; title?: string; date?: string };

export const SquadMediaModal: React.FC<{ open: boolean; onClose: () => void; squadId: string; squadName: string; media: any[]; canEdit?: boolean }> = ({ open, onClose, squadId, squadName, media, canEdit = false }) => {
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [videoTitle, setVideoTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');

  const items: MediaItem[] = Array.isArray(media) ? media : [];
  const photos = items.filter(m => m.type === 'photo');
  const videos = items.filter(m => m.type === 'video').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  const save = useMutation({
    mutationFn: (next: MediaItem[]) => updateSquad(squadId, { media: next }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['squads'] }),
    onError: (e) => showError(e),
  });

  const onPickPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []); e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      const uploaded: MediaItem[] = [];
      for (const f of files) {
        if (f.size > 5 * 1024 * 1024) { showToast(`${f.name} skipped (max 5MB).`, 'error'); continue; }
        const url = await uploadAvatar(f, `squads/${squadId}/media`);
        uploaded.push({ type: 'photo', url, name: f.name });
      }
      if (uploaded.length) { await save.mutateAsync([...items, ...uploaded]); showToast(`${uploaded.length} photo(s) added.`, 'success'); }
    } catch (err) { showError(err); } finally { setBusy(false); }
  };

  const addVideo = () => {
    if (!videoTitle.trim()) return showToast('Video title is required.', 'error');
    const u = videoUrl.trim(); if (!u) return showToast('Enter a video URL.', 'error');
    save.mutate([{ type: 'video', url: u, title: videoTitle.trim(), date: new Date().toISOString() }, ...items], { onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['squads'] }); showToast('Video added.', 'success'); setVideoTitle(''); setVideoUrl(''); } });
  };

  const removeAt = (it: MediaItem) => save.mutate(items.filter(x => x !== it), { onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['squads'] }); showToast('Removed.', 'success'); } });

  return (
    <Modal open={open} onClose={onClose} title={`${squadName} — Media`} size="2xl">
      <div className="space-y-5">
        {canEdit && (
          <div className="flex flex-wrap items-end gap-2">
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}><Camera size={15} /> {busy ? 'Uploading…' : 'Upload Photos'}</Button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={onPickPhotos} />
            <div className="flex-1 min-w-[200px] flex items-end gap-2">
              <div className="flex-1"><Input value={videoTitle} onChange={e => setVideoTitle(e.target.value)} placeholder="Video title *" /></div>
              <div className="flex-1"><Input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="Video URL" /></div>
              <Button variant="ghost" onClick={addVideo}><Link2 size={15} /> Add</Button>
            </div>
          </div>
        )}

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5"><ImageIcon size={13} /> Photos ({photos.length})</h4>
          {photos.length ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-sentinel-border aspect-square">
                  <a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={p.name || 'Photo'} className="w-full h-full object-cover" /></a>
                  {canEdit && <button onClick={() => removeAt(p)} className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-rose-600"><Trash2 size={12} /></button>}
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-400">No photos yet.</p>}
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5"><PlayCircle size={13} /> Videos ({videos.length})</h4>
          {videos.length ? (
            <div className="space-y-2">
              {videos.map((v, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-sentinel-border">
                  <PlayCircle size={18} className="text-brand shrink-0" />
                  <div className="flex-1 min-w-0"><div className="text-sm font-medium text-slate-900 dark:text-white truncate">{v.title || 'Video'}</div><div className="text-xs text-slate-400 truncate">{fmtDate(v.date) ? `${fmtDate(v.date)} · ` : ''}{v.url}</div></div>
                  <a href={v.url} target="_blank" rel="noreferrer" className="text-brand text-xs inline-flex items-center gap-1 no-underline"><ExternalLink size={13} /> Open</a>
                  {canEdit && <button onClick={() => removeAt(v)} className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 size={13} /></button>}
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-400">No videos yet.</p>}
        </div>
      </div>
    </Modal>
  );
};
