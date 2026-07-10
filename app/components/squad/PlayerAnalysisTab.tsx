import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Star, Film, Plus, Trash2, Link2, Upload, Video, Play, Calendar } from 'lucide-react';
import { isStoredVideo, youtubeId } from '../../lib/media';
import { useToast } from '../../context/ToastContext';
import { uploadVideoToR2, type VideoCategory } from '../../services/videoService';
import { savePlayerMediaArray, type MediaColumn } from '../../services/mediaService';
import type { Player } from '../../services/squadService';
import { Modal } from '../ui/Modal';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { resolveRange, dateInRange, type RangeValue } from '../../lib/dateRange';
import type { Season } from '../../services/seasonsService';

/**
 * Analysis tab — Player Highlights + Analysis Videos. Each item is a real upload
 * (Cloudflare R2 via uploadVideoToR2) or a pasted link, with a COMPULSORY title and
 * a tracked date. Items render as rows, newest first, so multiple uploads per section
 * stay organised.
 */
type VideoItem = { url: string; title: string; date?: string };
const COLUMN_CATEGORY: Record<string, VideoCategory> = { highlights: 'player_highlight', analysis_videos: 'player_analysis' };
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const byNewest = (a: VideoItem, b: VideoItem) => (b.date || '').localeCompare(a.date || '');

const VideoRow: React.FC<{ item: VideoItem; onRemove?: () => void }> = ({ item, onRemove }) => {
  const yt = youtubeId(item.url);
  const [playing, setPlaying] = useState(false);
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface">
      <div className="w-32 shrink-0 aspect-video rounded-md overflow-hidden bg-black relative">
        {playing && isStoredVideo(item.url) ? (
          <video src={item.url} controls autoPlay className="w-full h-full object-contain bg-black" />
        ) : playing && yt ? (
          <iframe src={`https://www.youtube.com/embed/${yt}?autoplay=1`} title={item.title} className="w-full h-full" allowFullScreen />
        ) : isStoredVideo(item.url) || yt ? (
          <button onClick={() => setPlaying(true)} className="w-full h-full flex items-center justify-center bg-slate-900/90 text-white hover:bg-slate-900"><Play size={22} /></button>
        ) : (
          <a href={item.url} target="_blank" rel="noreferrer" className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-white/5 text-brand"><ExternalLink size={18} /></a>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-slate-900 dark:text-white truncate">{item.title || 'Untitled'}</div>
        <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5"><Calendar size={12} /> {fmtDate(item.date) || 'No date'}</div>
      </div>
      <a href={item.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-brand shrink-0 p-1.5" title="Open in new tab"><ExternalLink size={15} /></a>
      {onRemove && <button onClick={onRemove} title="Remove" className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 shrink-0"><Trash2 size={15} /></button>}
    </div>
  );
};

export const PlayerAnalysisTab: React.FC<{ player: Player; canEdit?: boolean; seasons: Season[]; range: RangeValue }> = ({ player, canEdit = false, seasons, range }) => {
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<{ column: MediaColumn; label: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ column: MediaColumn; idx: number } | null>(null);

  const { from, to } = resolveRange(range, seasons);
  const inRange = (v: VideoItem) => dateInRange(v.date, from, to);
  const highlights = [...((player.highlights || []) as VideoItem[])].sort(byNewest).filter(inRange);
  const analysis = [...((player.analysisVideos || []) as VideoItem[])].sort(byNewest).filter(inRange);
  const rawFor = (col: MediaColumn) => (col === 'highlights' ? (player.highlights || []) : (player.analysisVideos || [])) as VideoItem[];
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['player', player.id] });

  const save = useMutation({
    mutationFn: ({ column, array }: { column: MediaColumn; array: any[] }) => savePlayerMediaArray(player.id, column, array),
    onSuccess: invalidate, onError: (e) => showError(e),
  });
  const addItem = (column: MediaColumn, item: VideoItem) => save.mutate({ column, array: [item, ...rawFor(column)] }, { onSuccess: () => { invalidate(); showToast('Video added.', 'success'); } });
  // Remove by identity against the displayed (sorted) array so the right row is dropped.
  const doRemove = (column: MediaColumn, idx: number) => {
    const sorted = column === 'highlights' ? highlights : analysis;
    const target = sorted[idx];
    save.mutate({ column, array: rawFor(column).filter(v => v !== target) }, { onSuccess: () => { invalidate(); showToast('Video removed.', 'success'); } });
  };

  const Card = 'rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface p-5';
  const Section: React.FC<{ title: string; icon: React.ReactNode; column: MediaColumn; items: VideoItem[]; emptyIcon: React.ReactNode; emptyText: string; emptySub: string }> = ({ title, icon, column, items, emptyIcon, emptyText, emptySub }) => (
    <div className={Card}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">{icon} {title} <span className="text-xs font-normal text-slate-400">({items.length})</span></h3>
        {canEdit && <Button variant="primary" size="sm" onClick={() => setModal({ column, label: title })}><Plus size={14} /> Add</Button>}
      </div>
      {items.length ? (
        <div className="space-y-2">{items.map((v, i) => <VideoRow key={i} item={v} onRemove={canEdit ? () => setConfirmRemove({ column, idx: i }) : undefined} />)}</div>
      ) : canEdit ? (
        <button type="button" onClick={() => setModal({ column, label: title })}
          className="w-full rounded-xl border-2 border-dashed border-brand/40 bg-brand/[0.03] hover:bg-brand/[0.07] hover:border-brand/60 transition-colors py-12 flex flex-col items-center gap-2.5 cursor-pointer">
          {emptyIcon}
          <p className="font-semibold text-slate-600 dark:text-slate-300">{emptyText}</p>
          <p className="text-xs text-slate-400">{emptySub}</p>
        </button>
      ) : (
        <div className="w-full rounded-xl border-2 border-dashed border-slate-200 dark:border-sentinel-border py-12 flex flex-col items-center gap-2.5">
          {emptyIcon}<p className="font-semibold text-slate-500 dark:text-slate-300">{emptyText}</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Section title="Player Highlights" icon={<Star size={18} className="text-brand" />} column="highlights" items={highlights}
        emptyIcon={<div className="w-12 h-12 rounded-full bg-brand text-[#0D1B2A] flex items-center justify-center"><Plus size={24} /></div>}
        emptyText="No highlights added yet." emptySub="Click to add a key moment or goal clip" />
      <Section title="Analysis Videos" icon={<Film size={18} className="text-brand" />} column="analysis_videos" items={analysis}
        emptyIcon={<Video size={36} className="text-brand" />}
        emptyText="No analysis videos yet." emptySub="Link a full analysis session for this player" />

      {modal && <AddVideoModal label={modal.label} category={COLUMN_CATEGORY[modal.column]} playerId={player.id} onClose={() => setModal(null)} onAdd={(item) => { addItem(modal.column, item); setModal(null); }} />}
      {confirmRemove && <ConfirmModal open onClose={() => setConfirmRemove(null)} onConfirm={() => { doRemove(confirmRemove.column, confirmRemove.idx); setConfirmRemove(null); }} title="Remove this video?" message="This video will be removed from the player's profile." confirmLabel="Remove" busyLabel="Removing…" />}
    </div>
  );
};

const AddVideoModal: React.FC<{ label: string; category: VideoCategory; playerId: string; onClose: () => void; onAdd: (item: VideoItem) => void }> = ({ label, category, playerId, onClose, onAdd }) => {
  const { showError, showToast } = useToast();
  const [mode, setMode] = useState<'link' | 'upload'>('link');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file?: File) => {
    if (!file) return;
    if (!title.trim()) return showToast('Enter a title first — it is required.', 'error');
    setProgress(0);
    try {
      const publicUrl = await uploadVideoToR2(file, category, playerId, setProgress);
      onAdd({ url: publicUrl, title: title.trim(), date: new Date().toISOString() });
    } catch (e) { showError(e); setProgress(null); }
  };
  const submitLink = () => {
    if (!title.trim()) return showToast('Title is required.', 'error');
    const u = url.trim(); if (!u) return showToast('Enter a video URL.', 'error');
    onAdd({ url: u, title: title.trim(), date: new Date().toISOString() });
  };

  return (
    <Modal open onClose={onClose} title={`Add ${label.replace(/s$/, '')}`} size="md"
      footer={mode === 'link' ? <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submitLink}>Add Video</Button></> : undefined}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Title <span className="text-rose-500">*</span></label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Solo Run Goal vs United" autoFocus />
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-100 dark:bg-white/5 p-1">
          <button onClick={() => setMode('link')} className={'flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium ' + (mode === 'link' ? 'bg-white dark:bg-sentinel-surface text-brand shadow-sm' : 'text-slate-500')}><Link2 size={14} /> Paste Link</button>
          <button onClick={() => setMode('upload')} className={'flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium ' + (mode === 'upload' ? 'bg-white dark:bg-sentinel-surface text-brand shadow-sm' : 'text-slate-500')}><Upload size={14} /> Upload</button>
        </div>
        {mode === 'link' ? <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="YouTube, Vimeo or direct video URL" />
          : progress != null ? <div><div className="h-2 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden"><div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} /></div><p className="text-xs text-slate-400 mt-1.5 text-center">Uploading to R2… {progress}%</p></div>
          : <button onClick={() => fileRef.current?.click()} className="w-full rounded-lg border-2 border-dashed border-slate-200 dark:border-sentinel-border py-8 text-sm text-slate-500 hover:border-brand flex flex-col items-center gap-2"><Upload size={22} /> <span className="font-medium">Drag video here or click to browse</span><span className="text-xs text-slate-400">MP4, MOV, WebM · Max 500MB</span></button>}
        <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
      </div>
    </Modal>
  );
};
