import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../context/ToastContext';
import { fetchAssessments, createAssessment, deleteAssessment, type Assessment } from '../../services/assessmentService';
import { REPORT_SECTIONS, REPORT_SCALE_LABELS } from '../../lib/reportSections';
import { ASSESS_MATRICES } from '../../lib/assessmentMatrices';
import { Input, Textarea, Label } from '../ui/Input';
import { DatePicker } from '../ui/DatePicker';
import { Button } from '../ui/Button';
import { ConfirmModal } from '../ui/ConfirmModal';
import { PillTabs } from '../ui/PillTabs';
import { ReportsHistory } from '../reports/ReportsHistory';
import { ReportRangeFilter } from './ReportRangeFilter';
import { resolveRange, dateInRange, emptyRange, type RangeValue } from '../../lib/dateRange';
import { useSeasons } from '../../hooks/useSeasons';
import type { Season } from '../../services/seasonsService';

/**
 * Reports tab — three sub-tabs (mirrors the old player-profile Reports tab):
 *  • Player Report — the full 6-section development report (type='Player Report').
 *  • Assessment    — Official Athletic Performance Report, 4 matrices (type='Assessment').
 *  • History       — every saved report, split into Performance Reports + Development Structures.
 */
const PLAYER_REPORT = 'Player Report';
const ASSESSMENT = 'Assessment';

const SUB_TABS = [{ id: 'report', label: 'Player Report', icon: 'fa-seedling' }, { id: 'assessment', label: 'Assessment', icon: 'fa-plus-circle' }, { id: 'history', label: 'History', icon: 'fa-history' }] as const;
type Sub = typeof SUB_TABS[number]['id'];

const Rating: React.FC<{ value: number; onPick: (n: number) => void }> = ({ value, onPick }) => (
  <div className="flex gap-1 shrink-0">
    {[1, 2, 3, 4, 5].map(n => (
      <button key={n} type="button" title={REPORT_SCALE_LABELS[n - 1]} onClick={() => onPick(n)}
        className={'w-7 h-7 rounded-md text-[11px] font-bold transition-colors ' + (value >= n ? 'bg-brand text-[#0D1B2A]' : 'bg-slate-100 dark:bg-white/5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10')}>{n}</button>
    ))}
  </div>
);

export const PlayerReportsTab: React.FC<{ playerId: string; squadName?: string; canEdit?: boolean; seasons?: Season[]; range?: RangeValue }> = ({ playerId, squadName, canEdit = false, seasons: seasonsProp, range: rangeProp }) => {
  const [sub, setSub] = useState<Sub>('report');
  const { data: all } = useQuery({ queryKey: ['assessments', playerId], queryFn: () => fetchAssessments(playerId), enabled: !!playerId, staleTime: 60_000 });

  // Controlled by the profile page (range provided; the picker lives next to Share). Otherwise the
  // Reports page self-manages it and renders the picker inside the History sub-tab.
  const { data: seasonsData } = useSeasons();
  const [internalRange, setInternalRange] = useState<RangeValue>(emptyRange);
  const selfManaged = rangeProp == null;
  const seasons = seasonsProp ?? seasonsData ?? [];
  const range = rangeProp ?? internalRange;

  return (
    <div>
      <div className="mb-6 overflow-x-auto">
        <PillTabs value={sub} onChange={id => setSub(id as Sub)} tabs={SUB_TABS.map(t => ({ id: t.id, label: t.label, icon: <i className={`fas ${t.icon}`} /> }))} />
      </div>
      {sub === 'report' && <PlayerReportForm playerId={playerId} canEdit={canEdit} />}
      {sub === 'assessment' && <AssessmentForm playerId={playerId} squadName={squadName} canEdit={canEdit} />}
      {sub === 'history' && <History playerId={playerId} all={all || []} canEdit={canEdit} seasons={seasons} range={range} onRangeChange={selfManaged ? setInternalRange : undefined} />}
    </div>
  );
};

// ── Player Report (development report) ──
const PlayerReportForm: React.FC<{ playerId: string; canEdit: boolean }> = ({ playerId, canEdit }) => {
  const { effectiveClubId, profile } = useAppState();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [ratings, setRatings] = useState<Record<string, Record<string, number>>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState('');
  const rate = (sec: string, attr: string, val: number) => setRatings(prev => { const s = { ...(prev[sec] || {}) }; if (s[attr] === val) delete s[attr]; else s[attr] = val; return { ...prev, [sec]: s }; });
  const rated = Object.values(ratings).reduce((n, s) => n + Object.keys(s).length, 0);

  const save = useMutation({
    mutationFn: () => {
      const clean: Record<string, any> = {};
      Object.entries(ratings).forEach(([k, v]) => { if (v && Object.keys(v).length) clean[k] = v; });
      const cmt = Object.fromEntries(Object.entries(comments).filter(([, v]) => v.trim()));
      if (Object.keys(cmt).length) clean.__comments = cmt;
      return createAssessment(effectiveClubId!, playerId, { date, type: PLAYER_REPORT, ratings: clean, notes: general, author: profile?.full_name || '' });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['assessments', playerId] }); showToast('Player report saved.', 'success'); setRatings({}); setComments({}); setGeneral(''); },
    onError: (e) => showError(e),
  });
  const submit = () => { if (!rated) return showToast('Rate at least one attribute.', 'error'); save.mutate(); };

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"><i className="fas fa-clipboard-check text-brand" /> Player Report</h3>
        <div className="flex items-center gap-2">
          <DatePicker value={date} onChange={e => setDate(e.target.value)} className="w-44" />
          {canEdit && <Button variant="primary" disabled={save.isPending} onClick={submit}><i className="fas fa-save" /> {save.isPending ? 'Saving…' : 'Save Record'}</Button>}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {REPORT_SECTIONS.map(sec => (
          <div key={sec.key} className="rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-white/5">
              <span className="text-sm font-bold flex items-center gap-2" style={{ color: sec.color }}><i className={`fas ${sec.icon}`} />{sec.label}</span>
              <div className="hidden sm:flex gap-1 text-[10px] font-bold text-slate-400">{[1, 2, 3, 4, 5].map(n => <span key={n} className="w-7 text-center">{n}</span>)}</div>
            </div>
            <div className="divide-y divide-slate-50 dark:divide-white/5">
              {sec.attributes.map(attr => (
                <div key={attr.key} className="flex items-center justify-between gap-2 px-4 py-2">
                  <span className="text-sm text-slate-700 dark:text-slate-200 flex-1 min-w-0">{attr.label}</span>
                  <Rating value={ratings[sec.key]?.[attr.key] || 0} onPick={n => canEdit && rate(sec.key, attr.key, n)} />
                </div>
              ))}
            </div>
            <Textarea rows={2} disabled={!canEdit} value={comments[sec.key] || ''} onChange={e => setComments(p => ({ ...p, [sec.key]: e.target.value }))}
              placeholder={`Comments for ${sec.label}…`} className="rounded-none border-x-0 border-b-0 bg-slate-50/60 dark:bg-white/[0.02] text-xs" />
          </div>
        ))}
      </div>
      <div className="mt-5">
        <Label>General Comments</Label>
        <Textarea rows={3} disabled={!canEdit} value={general} onChange={e => setGeneral(e.target.value)} placeholder="Overall observations, recommendations, development priorities…" />
      </div>
    </div>
  );
};

// ── Assessment (Official Athletic Performance Report) ──
const AssessmentForm: React.FC<{ playerId: string; squadName?: string; canEdit: boolean }> = ({ playerId, squadName, canEdit }) => {
  const { effectiveClubId, profile } = useAppState();
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [matchDetails, setMatchDetails] = useState('');
  const [ratings, setRatings] = useState<Record<string, Record<string, number>>>({});
  const [general, setGeneral] = useState('');
  const rate = (cat: string, attr: string, val: number) => setRatings(prev => { const c = { ...(prev[cat] || {}) }; if (c[attr] === val) delete c[attr]; else c[attr] = val; return { ...prev, [cat]: c }; });
  const rated = Object.values(ratings).reduce((n, c) => n + Object.keys(c).length, 0);

  const save = useMutation({
    mutationFn: () => {
      const clean: Record<string, any> = {};
      Object.entries(ratings).forEach(([k, v]) => { if (v && Object.keys(v).length) clean[k] = v; });
      const notes = [matchDetails.trim() ? `Match: ${matchDetails.trim()}` : '', general.trim()].filter(Boolean).join('\n');
      return createAssessment(effectiveClubId!, playerId, { date, type: ASSESSMENT, ratings: clean, notes, author: profile?.full_name || '' });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['assessments', playerId] }); showToast('Performance report submitted.', 'success'); setRatings({}); setGeneral(''); setMatchDetails(''); },
    onError: (e) => showError(e),
  });
  const submit = () => { if (!rated) return showToast('Rate at least one attribute.', 'error'); save.mutate(); };

  return (
    <div>
      <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4"><i className="fas fa-clipboard-check text-brand" /> Official Athletic Performance Report</h3>
      <div className="rounded-xl border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><Label>Date of Assessment</Label><DatePicker value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><Label>Evaluator</Label><Input value={profile?.full_name || ''} disabled /></div>
          <div><Label>Team Context</Label><Input value={squadName || '—'} disabled /></div>
          <div><Label>Match Details (Optional)</Label><Input value={matchDetails} onChange={e => setMatchDetails(e.target.value)} placeholder="e.g. vs SuperSport Utd (Home)" /></div>
        </div>
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
                    <Rating value={ratings[m.key]?.[a.key] || 0} onPick={n => canEdit && rate(m.key, a.key, n)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div><Label>General Comments</Label><Textarea rows={3} value={general} onChange={e => setGeneral(e.target.value)} placeholder="Key observations, strengths, areas for improvement, development notes…" /></div>
        {canEdit && <div className="flex justify-end pt-1 border-t border-slate-100 dark:border-sentinel-border"><div className="pt-4"><Button variant="primary" disabled={save.isPending} onClick={submit}>{save.isPending ? 'Submitting…' : 'Submit Report'}</Button></div></div>}
      </div>
    </div>
  );
};

// ── History (visual reports history: aggregate radar per type + per-report radars) ──
const History: React.FC<{ playerId: string; all: Assessment[]; canEdit: boolean; seasons: Season[]; range: RangeValue; onRangeChange?: (v: RangeValue) => void }> = ({ playerId, all, canEdit, seasons, range, onRangeChange }) => {
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => deleteAssessment(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['assessments', playerId] }); showToast('Report deleted.', 'success'); setConfirmId(null); },
    onError: (e) => showError(e),
  });

  const { from, to } = resolveRange(range, seasons);
  const filtered = all.filter(a => dateInRange(a.date || a.createdAt, from, to));

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"><i className="fas fa-folder-open text-brand" /> Intelligence & Reports History</h3>
        {onRangeChange && <ReportRangeFilter seasons={seasons} value={range} onChange={onRangeChange} />}
      </div>
      <ReportsHistory assessments={filtered} onDelete={canEdit ? (id) => setConfirmId(id) : undefined} />
      {confirmId && <ConfirmModal open onClose={() => setConfirmId(null)} onConfirm={() => del.mutate(confirmId)} title="Delete this report?" message="This report will be permanently removed." busy={del.isPending} />}
    </div>
  );
};
