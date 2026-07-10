import React, { useMemo } from 'react';
import { RatingRadar } from '../ui/RatingRadar';
import {
  PLAYER_REPORT, ASSESSMENT, reportAverage, reportCategoryAverages, aggregateCategoryAverages, overallAverage,
  type NestedRatings, type CategoryAvg,
} from '../../lib/assessmentRadar';

/**
 * Visual reports-history — shared by the in-app player-profile History sub-tab and the public
 * player dossier. Splits a player's assessments into the two kinds (Performance Reports vs
 * Development Reports), each with an OVERALL radar "pentagon" + per-category averages rolled up
 * across every report of that kind, then each individual report (chronological, author-labelled)
 * with its own radar + category breakdown + notes.
 */
export interface HistoryReport {
  id?: string; type: string | null; ratings: NestedRatings;
  notes?: string | null; author?: string | null; date?: string | null; created_at?: string | null;
}

const initials = (n: string) => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
const reportTitle = (t: string | null) => t === PLAYER_REPORT ? 'Player Report' : t === 'match' ? 'Match Assessment' : t === ASSESSMENT ? 'Performance Report' : (t || 'Performance Report');
const fmtDate = (d?: string | null) => d ? new Date(d.length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const ratingColor = (v: number) => v >= 4 ? '#059669' : v >= 3 ? '#d97706' : v >= 2 ? '#ea580c' : '#e11d48';
const card = 'rounded-2xl bg-white dark:bg-sentinel-surface border border-slate-200 dark:border-sentinel-border';
const toAxes = (cats: CategoryAvg[]) => cats.map(c => ({ label: c.short, value: c.avg }));

const Dial: React.FC<{ value: number | null; size?: number; label?: string }> = ({ value, size = 72, label }) => {
  const v = value ?? 0; const col = value == null ? '#94a3b8' : ratingColor(v);
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <div className="rounded-full grid place-items-center" style={{ width: size, height: size, background: `conic-gradient(${col} ${Math.max(0, Math.min(1, v / 5)) * 360}deg, rgba(148,163,184,0.22) 0deg)` }}>
        <div className="rounded-full bg-white dark:bg-sentinel-surface grid place-items-center" style={{ width: size - 11, height: size - 11 }}>
          <span className="font-extrabold" style={{ color: col, fontSize: size * 0.3 }}>{value == null ? '—' : v.toFixed(1)}</span>
        </div>
      </div>
      {label && <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>}
    </div>
  );
};

const CategoryBars: React.FC<{ cats: CategoryAvg[] }> = ({ cats }) => {
  if (!cats.length) return null;
  return (
    <div className="space-y-1.5 w-full">
      {cats.map(c => (
        <div key={c.key} className="flex items-center gap-2.5">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300 w-32 shrink-0 truncate">{c.label}</span>
          <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(c.avg / 5) * 100}%`, background: c.color }} /></div>
          <span className="text-sm font-bold tabular-nums w-8 text-right" style={{ color: ratingColor(c.avg) }}>{c.avg.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
};

const GroupSection: React.FC<{ title: string; icon: string; type: string; reports: HistoryReport[]; onDelete?: (id: string) => void }> = ({ title, icon, type, reports, onDelete }) => {
  const aggCats = useMemo(() => aggregateCategoryAverages(reports, type), [reports, type]);
  const overall = useMemo(() => overallAverage(reports), [reports]);

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 pt-1"><i className={`fas ${icon} text-brand`} />{title} <span className="text-xs font-normal text-slate-400">· {reports.length} report{reports.length === 1 ? '' : 's'}</span></h4>

      {/* Overall history for this kind */}
      <div className={`${card} p-5`}>
        <div className="flex flex-col md:flex-row gap-5 items-center">
          <Dial value={overall} size={84} label="Overall" />
          <div className="w-full md:w-56 shrink-0"><RatingRadar axes={toAxes(aggCats)} /></div>
          <div className="flex-1 w-full min-w-0"><CategoryBars cats={aggCats} /></div>
        </div>
      </div>

      {/* Each report, newest first, author-labelled */}
      {reports.map((r, i) => {
        const avg = reportAverage(r.ratings);
        const cats = reportCategoryAverages(r.ratings, type);
        const who = r.author?.trim();
        return (
          <div key={r.id || i} className={`${card} p-5`}>
            <div className="flex items-start gap-3 flex-wrap">
              {avg != null && <div className="w-11 h-11 rounded-full grid place-items-center text-sm font-extrabold shrink-0 ring-2" style={{ color: ratingColor(avg), borderColor: ratingColor(avg) }}>{avg.toFixed(1)}</div>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-900 dark:text-white">{reportTitle(r.type)}</span>
                  {who && <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-white/10 grid place-items-center text-[9px] font-bold">{initials(who)}</span>{who}</span>}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{fmtDate(r.date || r.created_at)}</div>
              </div>
              {onDelete && r.id && <button onClick={() => onDelete(r.id!)} title="Delete report" className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 shrink-0"><i className="fas fa-trash-can text-sm" /></button>}
            </div>

            {cats.length > 0 && (
              <div className="mt-3 grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4 items-center">
                <div className="shrink-0"><RatingRadar axes={toAxes(cats)} height={180} /></div>
                <CategoryBars cats={cats} />
              </div>
            )}

            {r.notes?.trim() && <p className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{r.notes.trim()}</p>}
          </div>
        );
      })}
    </div>
  );
};

export const ReportsHistory: React.FC<{ assessments: HistoryReport[]; onDelete?: (id: string) => void }> = ({ assessments, onDelete }) => {
  const performance = assessments.filter(a => a.type !== PLAYER_REPORT);
  const development = assessments.filter(a => a.type === PLAYER_REPORT);

  if (!assessments.length) {
    return <div className={`${card} py-10 text-center text-slate-400`}><i className="fas fa-folder-open text-2xl mb-2 opacity-50 block" /><p className="text-sm">No reports yet. Create an assessment or player report to start building this history.</p></div>;
  }

  return (
    <div className="space-y-8">
      {performance.length > 0 && <GroupSection title="Performance Reports" icon="fa-chart-line" type={ASSESSMENT} reports={performance} onDelete={onDelete} />}
      {development.length > 0 && <GroupSection title="Development Reports" icon="fa-seedling" type={PLAYER_REPORT} reports={development} onDelete={onDelete} />}
    </div>
  );
};
