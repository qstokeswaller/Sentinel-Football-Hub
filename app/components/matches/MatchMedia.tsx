import React, { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Trash2, Image as ImageIcon } from 'lucide-react';
import { updateMatch, type Match } from '../../services/matchService';
import { uploadAvatar } from '../../services/storageService';
import { useToast } from '../../context/ToastContext';
import { Button } from '../ui/Button';

/** Match photos — uploaded to storage, stored on matches.match_photos. */
export const MatchMedia: React.FC<{ match: Match; canEdit: boolean }> = ({ match, canEdit }) => {
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const photos = (match.matchPhotos || []) as { url: string; name?: string }[];
  const card = 'rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface p-5';
  const persist = async (next: any[]) => { await updateMatch(match.id, { matchPhotos: next }); queryClient.invalidateQueries({ queryKey: ['match', match.id] }); };
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []); e.target.value = ''; if (!files.length) return; setBusy(true);
    try { const added: any[] = []; for (const f of files) { if (f.size > 5 * 1024 * 1024) { showToast(`${f.name} skipped (max 5MB).`, 'error'); continue; } const url = await uploadAvatar(f, `matches/${match.id}/media`); added.push({ url, name: f.name }); } if (added.length) { await persist([...photos, ...added]); showToast(`${added.length} photo(s) added.`, 'success'); } }
    catch (err) { showError(err); } finally { setBusy(false); }
  };
  return (
    <div className={card}>
      <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><ImageIcon size={16} className="text-brand" /> Match Photos <span className="text-xs font-normal text-slate-400">({photos.length})</span></h3>
        {canEdit && <><Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}><Camera size={14} /> {busy ? 'Uploading…' : 'Upload Photos'}</Button><input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onPick} /></>}
      </div>
      {photos.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{photos.map((p, i) => (
          <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-sentinel-border"><a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={p.name || 'Match photo'} className="w-full h-full object-cover" /></a>{canEdit && <button onClick={() => persist(photos.filter((_, j) => j !== i))} className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-rose-600"><Trash2 size={12} /></button>}</div>
        ))}</div>
      ) : <div className="py-10 text-center text-slate-400 text-sm">No photos uploaded yet.</div>}
    </div>
  );
};
