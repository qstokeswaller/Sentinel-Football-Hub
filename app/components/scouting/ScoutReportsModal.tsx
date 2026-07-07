import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ChevronLeft, FileText } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { fetchScoutReports, addScoutReport, deleteScoutReport, type ScoutReport } from '../../services/scoutService';
import { SCOUTING_VERDICTS } from '../../lib/scoutingConstants';
import { REPORT_SECTIONS, REPORT_SCALE_LABELS, computeGlobalAverage } from '../../lib/reportSections';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Textarea, Select, Label } from '../ui/Input';
import { DatePicker } from '../ui/DatePicker';

/** View + add scouting reports for a scouted player (scouting_reports). */
interface Props { open: boolean; onClose: () => void; playerId: string; playerName: string; canEdit: boolean; }

const VerdictBadge: React.FC<{ verdict: string | null }> = ({ verdict }) => {
  const v = verdict ? SCOUTING_VERDICTS[verdict] : null;
  if (!v) return null;
  return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border" style={{ color: v.color, background: v.bg, borderColor: v.color + '55' }}>{v.label}</span>;
};

export const ScoutReportsModal: React.FC<Props> = ({ open, onClose, playerId, playerName, canEdit }) => {
  const { effectiveClubId, profile } = useAppState();
  const { user } = useAuth();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data: reports, isLoading } = useQuery({ queryKey: ['scoutReports', playerId], queryFn: () => fetchScoutReports(playerId), enabled: open });

  // ── add-form state ──
  const [matchContext, setMatchContext] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [verdict, setVerdict] = useState('');
  const [scout, setScout] = useState(profile?.full_name || '');
  const [ratings, setRatings] = useState<Record<string, Record<string, number>>>({});
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [recommendation, setRecommendation] = useState('');

  const rate = (sec: string, attr: string, val: number) => setRatings(prev => {
    const s = { ...(prev[sec] || {}) };
    if (s[attr] === val) delete s[attr]; else s[attr] = val;
    return { ...prev, [sec]: s };
  });
  const ratedCount = Object.values(ratings).reduce((n, s) => n + Object.keys(s).length, 0);

  const resetForm = () => { setMatchContext(''); setDate(new Date().toISOString().slice(0, 10)); setVerdict(''); setRatings({}); setStrengths(''); setWeaknesses(''); setRecommendation(''); };

  const create = useMutation({
    mutationFn: () => {
      const clean: Record<string, Record<string, number>> = {};
      Object.entries(ratings).forEach(([k, v]) => { if (v && Object.keys(v).length) clean[k] = v; });
      return addScoutReport(effectiveClubId!, user?.id ?? null, playerId, {
        report_type: ratedCount >= 25 ? 'full' : 'quick',
        match_context: matchContext.trim() || null, date: date || null, verdict: verdict || null,
        scout_name: scout.trim() || null, global_average: computeGlobalAverage(clean),
        ratings: clean, feedback: { strengths: strengths.trim(), weaknesses: weaknesses.trim(), recommendation: recommendation.trim() },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scoutReports', playerId] });
      queryClient.invalidateQueries({ queryKey: ['scouted'] });
      showToast('Report saved.', 'success'); resetForm(); setAdding(false);
    },
    onError: (e) => showError(e),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteScoutReport(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['scoutReports', playerId] }); queryClient.invalidateQueries({ queryKey: ['scouted'] }); showToast('Report deleted.', 'success'); },
    onError: (e) => showError(e),
  });

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!verdict && ratedCount === 0) return showToast('Add a verdict or rate some attributes.', 'error');
    create.mutate();
  };

  const title = adding ? (
    <span className="flex items-center gap-2">
      <button onClick={() => setAdding(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><ChevronLeft size={18} /></button>
      New Report · {playerName}
    </span>
  ) : `Scouting Reports · ${playerName}`;

  return (
    <Modal open={open} onClose={onClose} title={title} size="2xl"
      footer={adding ? (
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-slate-400">{ratedCount} attribute{ratedCount === 1 ? '' : 's'} rated{ratedCount > 0 && ` · avg ${computeGlobalAverage(ratings)?.toFixed(1)}`}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button variant="primary" disabled={create.isPending} onClick={() => submit()}>{create.isPending ? 'Saving…' : 'Save Report'}</Button>
          </div>
        </div>
      ) : canEdit ? <Button variant="primary" onClick={() => setAdding(true)}><Plus size={16} /> New Report</Button> : undefined}>

      {adding ? (
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

          {REPORT_SECTIONS.map(sec => (
            <div key={sec.key}>
              <div className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: sec.color }}>
                <i className={`fas ${sec.icon}`} />{sec.label}
              </div>
              <div className="space-y-1">
                {sec.attributes.map(attr => (
                  <div key={attr.key} className="flex items-center justify-between gap-2 py-0.5">
                    <span className="text-sm text-slate-600 dark:text-slate-300 flex-1 min-w-0">{attr.label}</span>
                    <div className="flex gap-1 shrink-0">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button key={n} type="button" title={REPORT_SCALE_LABELS[n - 1]} onClick={() => rate(sec.key, attr.key, n)}
                          className={'w-6 h-6 rounded-md text-[11px] font-bold transition-colors ' + ((ratings[sec.key]?.[attr.key] || 0) >= n ? 'bg-brand text-[#0D1B2A]' : 'bg-slate-100 dark:bg-white/5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10')}>{n}</button>
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
      ) : isLoading ? (
        <div className="py-12 text-center text-slate-400"><i className="fas fa-circle-notch fa-spin" /> Loading…</div>
      ) : !reports?.length ? (
        <div className="py-12 text-center text-slate-400"><FileText size={26} className="mx-auto mb-3 opacity-60" />No reports yet.</div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => <ReportCard key={r.id} report={r} canEdit={canEdit} onDelete={() => del.mutate(r.id)} deleting={del.isPending} />)}
        </div>
      )}
    </Modal>
  );
};

const ReportCard: React.FC<{ report: ScoutReport; canEdit: boolean; onDelete: () => void; deleting: boolean }> = ({ report, canEdit, onDelete }) => {
  const [open, setOpen] = useState(false);
  const fb = report.feedback || {};
  return (
    <div className="rounded-lg border border-slate-200 dark:border-sentinel-border overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 dark:hover:bg-white/5">
        {report.global_average != null && (
          <div className="w-10 h-10 rounded-full border-2 border-brand text-brand flex items-center justify-center text-sm font-bold shrink-0">{Number(report.global_average).toFixed(1)}</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900 dark:text-white">{report.match_context || 'Scouting Report'}</span>
            <VerdictBadge verdict={report.verdict} />
            <span className="text-[10px] uppercase tracking-wider text-slate-400 bg-slate-100 dark:bg-white/5 rounded px-1.5 py-0.5">{report.report_type}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{report.date || '—'}{report.scout_name ? ` · ${report.scout_name}` : ''}</div>
        </div>
        {canEdit && <span role="button" tabIndex={0} onClick={e => { e.stopPropagation(); onDelete(); }} title="Delete" className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 shrink-0"><Trash2 size={14} /></span>}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-100 dark:border-sentinel-border pt-3">
          {(fb.strengths || fb.weaknesses || fb.recommendation) && (
            <div className="space-y-2 text-sm">
              {fb.strengths && <div><span className="text-[11px] uppercase tracking-wider text-emerald-500 font-semibold">Strengths</span><p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{fb.strengths}</p></div>}
              {fb.weaknesses && <div><span className="text-[11px] uppercase tracking-wider text-rose-500 font-semibold">Weaknesses</span><p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{fb.weaknesses}</p></div>}
              {fb.recommendation && <div><span className="text-[11px] uppercase tracking-wider text-brand font-semibold">Recommendation</span><p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{fb.recommendation}</p></div>}
            </div>
          )}
          {REPORT_SECTIONS.map(sec => {
            const secRatings = report.ratings?.[sec.key];
            if (!secRatings || !Object.keys(secRatings).length) return null;
            return (
              <div key={sec.key}>
                <div className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: sec.color }}>{sec.label}</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {sec.attributes.filter(a => secRatings[a.key]).map(a => (
                    <div key={a.key} className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400 truncate">{a.label}</span>
                      <span className="font-bold text-slate-900 dark:text-white ml-2">{secRatings[a.key]}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
