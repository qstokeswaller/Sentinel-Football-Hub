import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppState } from '../../context/AppStateContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { addScoutReport, type ScoutedPlayer } from '../../services/scoutService';
import { SCOUTING_VERDICTS } from '../../lib/scoutingConstants';
import { sectionsForType, computeGlobalAverage, REPORT_SCALE_LABELS } from '../../lib/reportSections';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Textarea, Select, Label } from '../ui/Input';
import { DatePicker } from '../ui/DatePicker';

/**
 * Add a quick or in-depth scout report for an existing scouted player. Ratings are stored FLAT
 * ({ attributeKey: 1-5 }); the section list only groups the attributes for entry. Extracted from
 * the old ScoutReportsModal so the scouting profile can live on a real page.
 */
interface Props { open: boolean; onClose: () => void; player: ScoutedPlayer; type: 'quick' | 'full'; }

export const ScoutReportFormModal: React.FC<Props> = ({ open, onClose, player, type }) => {
  const { effectiveClubId, profile } = useAppState();
  const { user } = useAuth();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();

  const [matchContext, setMatchContext] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [verdict, setVerdict] = useState('');
  const [scout, setScout] = useState(profile?.full_name || '');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const sections = sectionsForType(type);
  const rate = (attr: string, val: number) => setRatings(p => { const n = { ...p }; if (n[attr] === val) delete n[attr]; else n[attr] = val; return n; });
  const ratedCount = Object.keys(ratings).length;

  const create = useMutation({
    mutationFn: () => addScoutReport(effectiveClubId!, user?.id ?? null, player.id, {
      report_type: type === 'full' ? 'full' : 'quick',
      match_context: matchContext.trim() || null, date: date || null, verdict: verdict || null,
      scout_name: scout.trim() || null, global_average: computeGlobalAverage(ratings),
      ratings, feedback: { strengths: strengths.trim(), weaknesses: weaknesses.trim(), recommendation: recommendation.trim() },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scoutReports', player.id] });
      queryClient.invalidateQueries({ queryKey: ['scouted'] });
      showToast('Report saved.', 'success'); onClose();
    },
    onError: (e) => showError(e),
  });

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!verdict && ratedCount === 0) return showToast('Add a verdict or rate some attributes.', 'error');
    create.mutate();
  };

  return (
    <Modal open={open} onClose={onClose} title={`New ${type === 'full' ? 'In-depth' : 'Quick'} Report · ${player.name}`} size="2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-slate-400">{ratedCount} rated{ratedCount > 0 ? ` · avg ${computeGlobalAverage(ratings)?.toFixed(1)}` : ''}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={create.isPending} onClick={() => submit()}>{create.isPending ? 'Saving…' : 'Save Report'}</Button>
          </div>
        </div>
      }>
      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Match / Context</Label><Input value={matchContext} onChange={e => setMatchContext(e.target.value)} placeholder="e.g. U17 League vs Sundowns" autoFocus /></div>
          <div><Label>Date</Label><DatePicker value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><Label>Verdict (Final Evaluation)</Label>
            <Select value={verdict} onChange={e => setVerdict(e.target.value)}>
              <option value="">Select verdict…</option>
              {Object.entries(SCOUTING_VERDICTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </div>
          <div><Label>Scout</Label><Input value={scout} onChange={e => setScout(e.target.value)} /></div>
        </div>

        {sections.map(sec => (
          <div key={sec.key}>
            <div className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: sec.color }}><i className={`fas ${sec.icon}`} />{sec.label}</div>
            <div className="space-y-1">
              {sec.attributes.map(attr => (
                <div key={attr.key} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="text-sm text-slate-600 dark:text-slate-300 flex-1 min-w-0">{attr.label}</span>
                  <div className="flex gap-1 shrink-0">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} type="button" title={REPORT_SCALE_LABELS[n - 1]} onClick={() => rate(attr.key, n)}
                        className={'w-6 h-6 rounded-md text-[11px] font-bold transition-colors ' + ((ratings[attr.key] || 0) >= n ? 'bg-brand text-[#0D1B2A]' : 'bg-slate-100 dark:bg-white/5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10')}>{n}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="space-y-3 pt-1 border-t border-slate-100 dark:border-sentinel-border">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 pt-3">Feedback</div>
          <div><Label>Strengths</Label><Textarea rows={2} value={strengths} onChange={e => setStrengths(e.target.value)} /></div>
          <div><Label>Weaknesses</Label><Textarea rows={2} value={weaknesses} onChange={e => setWeaknesses(e.target.value)} /></div>
          <div><Label>Recommendation</Label><Textarea rows={2} value={recommendation} onChange={e => setRecommendation(e.target.value)} /></div>
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
};
