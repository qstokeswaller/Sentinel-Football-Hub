import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../context/ToastContext';
import { createAssessment } from '../../services/assessmentService';
import { ASSESS_MATRICES } from '../../lib/assessmentMatrices';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Textarea, Label } from '../ui/Input';

/**
 * Per-player, per-match assessment — the Official Athletic Performance Report (1–5 across
 * Tactical/Technical/Physical/Psychological). Saves to `assessments` with type='Assessment'
 * and match_id, so it shows on the player's profile (Reports → History / radar) as a
 * performance assessment tied to this match.
 */
export const MatchPlayerAssessmentModal: React.FC<{
  open: boolean; onClose: () => void; playerId: string; playerName: string; matchId: string; matchDate?: string | null; opponent?: string | null;
}> = ({ open, onClose, playerId, playerName, matchId, matchDate, opponent }) => {
  const { effectiveClubId, profile } = useAppState();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const [ratings, setRatings] = useState<Record<string, Record<string, number>>>({});
  const [notes, setNotes] = useState('');

  const seeded = React.useRef(open);
  if (open && !seeded.current) { seeded.current = true; setRatings({}); setNotes(''); }
  if (!open && seeded.current) seeded.current = false;

  const rate = (cat: string, attr: string, val: number) => setRatings(prev => { const c = { ...(prev[cat] || {}) }; if (c[attr] === val) delete c[attr]; else c[attr] = val; return { ...prev, [cat]: c }; });
  const rated = Object.values(ratings).reduce((n, c) => n + Object.keys(c).length, 0);

  const save = useMutation({
    mutationFn: () => {
      const clean: Record<string, Record<string, number>> = {};
      Object.entries(ratings).forEach(([k, v]) => { if (v && Object.keys(v).length) clean[k] = v; });
      const note = [opponent ? `Match: vs ${opponent}` : '', notes.trim()].filter(Boolean).join('\n');
      return createAssessment(effectiveClubId!, playerId, { date: matchDate || new Date().toISOString().slice(0, 10), type: 'Assessment', ratings: clean, notes: note, author: profile?.full_name || '', matchId });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['assessments', playerId] }); showToast('Performance assessment saved to player profile.', 'success'); onClose(); },
    onError: (e) => showError(e),
  });
  const submit = () => { if (!rated) return showToast('Rate at least one attribute.', 'error'); save.mutate(); };

  return (
    <Modal open={open} onClose={onClose} size="2xl"
      title={<span className="flex items-center gap-2"><ClipboardCheck size={18} className="text-brand" /> {playerName}</span>}
      footer={<>
        <span className="text-xs text-slate-400 mr-auto">{rated} rated{opponent ? ` · vs ${opponent}` : ''}{matchDate ? ` · ${matchDate}` : ''}</span>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={save.isPending} onClick={submit}>{save.isPending ? 'Saving…' : 'Save Assessment'}</Button>
      </>}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {ASSESS_MATRICES.map(m => (
          <div key={m.key} className="rounded-xl border border-slate-200 dark:border-sentinel-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-white/5">
              <span className="text-sm font-bold flex items-center gap-2" style={{ color: m.color }}><i className={`fas ${m.icon}`} />{m.label}</span>
              <div className="hidden sm:flex gap-1 text-[10px] font-bold text-slate-400">{[1, 2, 3, 4, 5].map(n => <span key={n} className="w-7 text-center">{n}</span>)}</div>
            </div>
            <div className="divide-y divide-slate-50 dark:divide-white/5">
              {m.attrs.map(a => (
                <div key={a.key} className="flex items-center justify-between gap-2 px-4 py-2">
                  <span className="text-sm text-slate-700 dark:text-slate-200 flex-1 min-w-0">{a.label}</span>
                  <div className="flex gap-1 shrink-0">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} type="button" onClick={() => rate(m.key, a.key, n)}
                        className={'w-7 h-7 rounded-md text-[11px] font-bold transition-colors ' + ((ratings[m.key]?.[a.key] || 0) >= n ? 'bg-brand text-[#0D1B2A]' : 'bg-slate-100 dark:bg-white/5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10')}>{n}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5"><Label>General Comments</Label><Textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Key observations, strengths, areas for improvement…" /></div>
    </Modal>
  );
};
