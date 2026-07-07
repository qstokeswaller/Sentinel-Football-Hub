import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Film, Link2, Upload, Trash2, ExternalLink } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { isStoredVideo, youtubeId } from '../../lib/media';
import { uploadVideoToR2 } from '../../services/videoService';
import { updateMatch, type Match } from '../../services/matchService';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

/**
 * Match highlights — uploaded (Cloudflare R2) or linked (YouTube/Vimeo/direct) videos
 * stored on `matches.videos`. Assigned coaches/admins (canEdit) manage; anyone with
 * match access can play. Mirrors the scout-video pattern, scoped to the match.
 */
interface MatchVideo { url: string; title?: string }

export const MatchVideos: React.FC<{ match: Match; canEdit: boolean }> = ({ match, canEdit }) => {
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const videos: MatchVideo[] = Array.isArray(match.videos) ? match.videos : [];

  const [mode, setMode] = useState<'link' | 'upload'>('link');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [progress, setProgress] = useState<number | null>(null);

  const save = useMutation({
    mutationFn: (next: MatchVideo[]) => updateMatch(match.id, { videos: next }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['match', match.id] }); queryClient.invalidateQueries({ queryKey: ['matches'] }); },
    onError: (e) => showError(e),
  });

  const addLink = () => {
    const u = url.trim();
    if (!u) return showToast('Enter a video URL.', 'error');
    save.mutate([...videos, { url: u, title: title.trim() || undefined }]);
    setUrl(''); setTitle('');
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    setProgress(0);
    try {
      const publicUrl = await uploadVideoToR2(file, 'match', match.id, setProgress);
      save.mutate([...videos, { url: publicUrl, title: title.trim() || file.name }]);
      setTitle(''); setProgress(null);
    } catch (e) { showError(e); setProgress(null); }
  };

  const remove = (i: number) => save.mutate(videos.filter((_, idx) => idx !== i));

  return (
    <div className="rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-sentinel-border flex items-center gap-2">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><Film size={16} className="text-brand" /> Match Highlights</h3>
        <span className="text-xs text-slate-400">{videos.length || ''}</span>
      </div>

      <div className="p-5 space-y-4">
        {canEdit && (
          <div className="rounded-lg border border-slate-200 dark:border-sentinel-border p-3 space-y-3">
            <div className="flex gap-1 rounded-lg bg-slate-100 dark:bg-white/5 p-1">
              <button onClick={() => setMode('link')} className={'flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium ' + (mode === 'link' ? 'bg-white dark:bg-sentinel-surface text-brand shadow-sm' : 'text-slate-500')}><Link2 size={14} /> Link</button>
              <button onClick={() => setMode('upload')} className={'flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium ' + (mode === 'upload' ? 'bg-white dark:bg-sentinel-surface text-brand shadow-sm' : 'text-slate-500')}><Upload size={14} /> Upload</button>
            </div>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional) — e.g. 2nd-half highlights" />
            {mode === 'link' ? (
              <div className="flex gap-2">
                <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="YouTube / Vimeo / direct video URL" />
                <Button variant="primary" onClick={addLink} disabled={save.isPending}>Add</Button>
              </div>
            ) : progress != null ? (
              <div><div className="h-2 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden"><div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} /></div><p className="text-xs text-slate-400 mt-1.5 text-center">Uploading to R2… {progress}%</p></div>
            ) : (
              <button onClick={() => fileRef.current?.click()} className="w-full rounded-lg border-2 border-dashed border-slate-200 dark:border-sentinel-border py-5 text-sm text-slate-500 hover:border-brand flex flex-col items-center gap-2"><Upload size={18} /> Choose match video file</button>
            )}
            <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
          </div>
        )}

        {!videos.length ? (
          <p className="text-sm text-slate-400 text-center py-6">{canEdit ? 'No highlights yet — add a link or upload a clip.' : 'No highlights uploaded for this match.'}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {videos.map((v, i) => {
              const yt = youtubeId(v.url);
              return (
                <div key={i} className="rounded-lg overflow-hidden border border-slate-200 dark:border-sentinel-border relative group">
                  {canEdit && <button onClick={() => remove(i)} title="Remove" className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-rose-600"><Trash2 size={13} /></button>}
                  {isStoredVideo(v.url) ? <video src={v.url} controls preload="metadata" className="w-full aspect-video bg-black block" />
                    : yt ? <iframe src={`https://www.youtube.com/embed/${yt}`} title={v.title || 'Highlights'} className="w-full aspect-video block" allowFullScreen />
                    : <a href={v.url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 aspect-video bg-slate-100 dark:bg-white/5 text-brand no-underline text-sm"><ExternalLink size={16} /> Open video</a>}
                  {v.title && <div className="px-3 py-2 text-sm text-slate-700 dark:text-slate-200 truncate">{v.title}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
