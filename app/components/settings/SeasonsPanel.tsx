import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, CalendarRange, Check, Lock } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { fetchSeasons, createSeason, updateSeason, deleteSeason, setCurrentSeason, type Season, type SeasonInput } from '../../services/seasonsService';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Input';
import { DatePicker } from '../ui/DatePicker';
import { Badge } from '../ui/Badge';
import { ConfirmModal } from '../ui/ConfirmModal';

/** Settings → Seasons: competition setup (CRUD + set-current). */
const card = 'rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface';

const seed = (s: Season | null): SeasonInput => ({
  name: s?.name || '', startDate: s?.startDate || '', endDate: s?.endDate || '',
  leagueName: s?.leagueName || '', division: s?.division || '', ageGroup: s?.ageGroup || '',
  matchDuration: s?.matchDuration ?? 90, winPoints: s?.winPoints ?? 3, drawPoints: s?.drawPoints ?? 1, lossPoints: s?.lossPoints ?? 0,
});

export const SeasonsPanel: React.FC<{ clubId: string | null; canEdit?: boolean }> = ({ clubId, canEdit = true }) => {
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const { data: seasons, isLoading } = useQuery({ queryKey: ['seasons', clubId], queryFn: () => fetchSeasons(clubId), enabled: !!clubId });

  const [edit, setEdit] = useState<Season | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Season | null>(null);
  const [f, setF] = useState<SeasonInput>(seed(null));
  const set = (k: keyof SeasonInput, v: any) => setF(p => ({ ...p, [k]: v }));

  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['seasons', clubId] }); };

  const save = useMutation({
    mutationFn: () => edit ? updateSeason(edit.id, f) : createSeason(clubId!, f),
    onSuccess: () => { invalidate(); showToast(edit ? 'Season updated.' : 'Season created.', 'success'); setOpen(false); },
    onError: (e) => showError(e),
  });
  const makeCurrent = useMutation({
    mutationFn: (id: string) => setCurrentSeason(clubId!, id),
    onSuccess: () => { invalidate(); showToast('Current season set.', 'success'); },
    onError: (e) => showError(e),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteSeason(id),
    onSuccess: () => { invalidate(); showToast('Season deleted.', 'success'); setConfirmDel(null); },
    onError: (e) => showError(e),
  });

  const openNew = () => { setEdit(null); setF(seed(null)); setOpen(true); };
  const openEdit = (s: Season) => { setEdit(s); setF(seed(s)); setOpen(true); };
  const submit = (e?: React.FormEvent) => { e?.preventDefault(); if (!f.name.trim()) return showToast('Season name is required.', 'error'); save.mutate(); };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Seasons</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Competition setup, points rules and the active season.</p>
        </div>
        {canEdit && <Button variant="primary" onClick={openNew}><Plus size={16} /> New Season</Button>}
      </div>
      {!canEdit && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
          <Lock size={13} /> Read-only — only club admins can add or change seasons.
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-slate-400"><i className="fas fa-circle-notch fa-spin" /> Loading…</div>
      ) : !seasons?.length ? (
        <div className={`${card} p-10 text-center text-slate-400`}><CalendarRange size={26} className="mx-auto mb-3 opacity-60" />No seasons yet.</div>
      ) : (
        <div className="space-y-2">
          {seasons.map(s => (
            <div key={s.id} className={`${card} p-4 flex items-center gap-4`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-900 dark:text-white truncate">{s.name}</span>
                  {s.isCurrent && <Badge tone="brand">Current</Badge>}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap gap-x-3">
                  <span>{s.startDate || '—'} → {s.endDate || '—'}</span>
                  {s.leagueName && <span>{s.leagueName}{s.division ? ` · ${s.division}` : ''}</span>}
                  {s.ageGroup && <span>{s.ageGroup}</span>}
                  <span>{s.winPoints}/{s.drawPoints}/{s.lossPoints} pts</span>
                </div>
              </div>
              {canEdit && !s.isCurrent && <Button variant="secondary" size="sm" onClick={() => makeCurrent.mutate(s.id)} disabled={makeCurrent.isPending}><Check size={14} /> Set current</Button>}
              {canEdit && <button onClick={() => openEdit(s)} title="Edit" className="p-1.5 rounded text-slate-400 hover:text-brand hover:bg-brand/10"><Pencil size={15} /></button>}
              {canEdit && <button onClick={() => setConfirmDel(s)} title="Delete" className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 size={15} /></button>}
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={edit ? 'Edit Season' : 'New Season'} size="md"
        footer={<>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => submit()}>{save.isPending ? 'Saving…' : (edit ? 'Save Changes' : 'Create Season')}</Button>
        </>}>
        <form onSubmit={submit} className="space-y-4">
          <div><Label>Season Name *</Label><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. 2026 League Season" autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start Date</Label><DatePicker value={f.startDate || ''} onChange={e => set('startDate', e.target.value)} /></div>
            <div><Label>End Date</Label><DatePicker value={f.endDate || ''} onChange={e => set('endDate', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>League</Label><Input value={f.leagueName || ''} onChange={e => set('leagueName', e.target.value)} placeholder="e.g. Gauteng Premier" /></div>
            <div><Label>Division</Label><Input value={f.division || ''} onChange={e => set('division', e.target.value)} placeholder="e.g. Division A" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Age Group</Label><Input value={f.ageGroup || ''} onChange={e => set('ageGroup', e.target.value)} placeholder="e.g. U17, Senior" /></div>
            <div><Label>Match Duration (min)</Label><Input type="number" value={f.matchDuration ?? ''} onChange={e => set('matchDuration', e.target.value === '' ? null : Number(e.target.value))} /></div>
          </div>
          <div>
            <Label>Points (Win / Draw / Loss)</Label>
            <div className="grid grid-cols-3 gap-3">
              <Input type="number" value={f.winPoints} onChange={e => set('winPoints', Number(e.target.value))} />
              <Input type="number" value={f.drawPoints} onChange={e => set('drawPoints', Number(e.target.value))} />
              <Input type="number" value={f.lossPoints} onChange={e => set('lossPoints', Number(e.target.value))} />
            </div>
          </div>
          <button type="submit" className="hidden" />
        </form>
      </Modal>

      {confirmDel && (
        <ConfirmModal open onClose={() => setConfirmDel(null)} onConfirm={() => del.mutate(confirmDel.id)}
          title={`Delete ${confirmDel.name}?`} message="This permanently removes the season configuration." busy={del.isPending} />
      )}
    </div>
  );
};
