import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Upload, Trash2, ExternalLink } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { isStoredVideo, youtubeId } from '../../lib/media';
import { uploadVideoToR2 } from '../../services/videoService';
import { fetchScoutVideos, addScoutVideo, deleteScoutVideo } from '../../services/scoutService';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

/** Scout videos for a scouted player (scouting_videos) — link or R2 upload. */
export const ScoutVideosModal: React.FC<{ open: boolean; onClose: () => void; playerId: string; playerName: string }> = ({ open, onClose, playerId, playerName }) => {
  const { effectiveClubId } = useAppState();
  const { user } = useAuth();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const { data: videos } = useQuery({ queryKey: ['scout-videos', playerId], queryFn: () => fetchScoutVideos(playerId), enabled: open && !!playerId });

  const [mode, setMode] = useState<'link' | 'upload'>('link');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['scout-videos', playerId] });
  const add = useMutation({
    mutationFn: (v: { title: string; url: string }) => addScoutVideo(effectiveClubId!, user?.id ?? null, playerId, v.title, v.url),
    onSuccess: () => { invalidate(); setTitle(''); setUrl(''); setProgress(null); showToast('Video added.', 'success'); },
    onError: (e) => { showError(e); setProgress(null); },
  });
  const del = useMutation({ mutationFn: (id: string) => deleteScoutVideo(id), onSuccess: () => { invalidate(); showToast('Video removed.', 'success'); }, onError: (e) => showError(e) });

  const onFile = async (file?: File) => {
    if (!file) return; setProgress(0);
    try { const publicUrl = await uploadVideoToR2(file, 'player_analysis', playerId, setProgress); add.mutate({ title: title.trim() || file.name, url: publicUrl }); }
    catch (e) { showError(e); setProgress(null); }
  };

  const INPUT = 'w-full rounded-lg border border-slate-200 dark:border-sentinel-border bg-slate-50 dark:bg-sentinel-bg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand';

  return (
    <Modal open={open} onClose={onClose} title={`Videos · ${playerName}`} size="lg">
        <div className="space-y-4">
          {/* Add */}
          <div className="rounded-lg border border-slate-200 dark:border-sentinel-border p-3 space-y-3">
            <div className="flex gap-1 rounded-lg bg-slate-100 dark:bg-white/5 p-1">
              <button onClick={() => setMode('link')} className={'flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium ' + (mode === 'link' ? 'bg-white dark:bg-sentinel-surface text-brand shadow-sm' : 'text-slate-500')}><Link2 size={14} /> Link</button>
              <button onClick={() => setMode('upload')} className={'flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium ' + (mode === 'upload' ? 'bg-white dark:bg-sentinel-surface text-brand shadow-sm' : 'text-slate-500')}><Upload size={14} /> Upload</button>
            </div>
            <input className={INPUT} value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional)" />
            {mode === 'link' ? (
              <div className="flex gap-2">
                <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="YouTube / Vimeo / video URL" />
                <Button variant="primary" onClick={() => { if (!url.trim()) return showToast('Enter a URL.', 'error'); add.mutate({ title: title.trim(), url: url.trim() }); }} disabled={add.isPending}>Add</Button>
              </div>
            ) : progress != null ? (
              <div><div className="h-2 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden"><div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} /></div><p className="text-xs text-slate-400 mt-1.5 text-center">Uploading… {progress}%</p></div>
            ) : (
              <button onClick={() => fileRef.current?.click()} className="w-full rounded-lg border-2 border-dashed border-slate-200 dark:border-sentinel-border py-5 text-sm text-slate-500 hover:border-brand flex flex-col items-center gap-2"><Upload size={18} /> Choose video file</button>
            )}
            <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
          </div>

          {/* List */}
          {!videos?.length ? <p className="text-sm text-slate-400 text-center py-4">No videos yet.</p> : (
            <div className="space-y-3">
              {videos.map(v => {
                const yt = youtubeId(v.url);
                return (
                  <div key={v.id} className="rounded-lg overflow-hidden border border-slate-200 dark:border-sentinel-border relative group">
                    <button onClick={() => del.mutate(v.id)} title="Remove" className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-rose-600"><Trash2 size={13} /></button>
                    {isStoredVideo(v.url) ? <video src={v.url} controls preload="metadata" className="w-full aspect-video bg-black block" />
                      : yt ? <iframe src={`https://www.youtube.com/embed/${yt}`} title={v.title || 'Video'} className="w-full aspect-video block" allowFullScreen />
                      : <a href={v.url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 aspect-video bg-slate-100 dark:bg-white/5 text-brand no-underline text-sm"><ExternalLink size={16} /> Open video</a>}
                    {v.title && <div className="px-3 py-2 text-sm text-slate-700 dark:text-slate-200 truncate">{v.title}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
    </Modal>
  );
};
