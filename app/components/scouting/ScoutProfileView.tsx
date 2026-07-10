import React, { useMemo } from 'react';
import { SCOUTING_VERDICTS, SCOUTING_STATUSES } from '../../lib/scoutingConstants';
import { computeGlobalAverage, computeCategoryAverages, sectionsForType, type ScoutRatings } from '../../lib/reportSections';
import { ScoutRadar } from './ScoutRadar';

/**
 * The scouted-player PROFILE — one shared, tab-less layout used both in-app (a modal) and on
 * the public branded share page. Small identity header at the top, then the OVERALL rating
 * with a radar "pentagon" + per-pillar averages rolled up from every report, then each scout's
 * report(s) — verdict, ratings radar, feedback — followed by that scout's own video clips.
 */
export interface ProfileReport {
  id: string; report_type: string | null; verdict: string | null; match_context: string | null;
  date: string | null; global_average: number | null; ratings: ScoutRatings | null;
  feedback: { strengths?: string; weaknesses?: string; recommendation?: string } | null;
  author: string; created_by?: string | null; created_at?: string;
}
export interface ProfileVideo { id: string; title: string | null; url: string; created_by?: string | null; author?: string | null; }
export interface ScoutProfile {
  player: { name: string; position: string | null; current_club: string | null; age: string | null; foot: string | null; agent_name: string | null; scouting_status: string | null; notes: string | null; photo: string | null; };
  reports: ProfileReport[];
  videos: ProfileVideo[];
}

const initials = (n: string) => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
const fmtDate = (d: string | null | undefined) => d ? new Date(d.length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const ratingColor = (v: number) => v >= 4 ? '#059669' : v >= 3 ? '#d97706' : v >= 2 ? '#ea580c' : '#e11d48';

const Verdict: React.FC<{ v: string | null }> = ({ v }) => {
  const c = v ? SCOUTING_VERDICTS[v] : null;
  return c ? <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ color: c.color, background: c.bg }}>{c.label}</span> : null;
};

const Dial: React.FC<{ value: number | null; size?: number; label?: string }> = ({ value, size = 72, label }) => {
  const v = value ?? 0; const col = value == null ? '#94a3b8' : ratingColor(v);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="rounded-full grid place-items-center" style={{ width: size, height: size, background: `conic-gradient(${col} ${Math.max(0, Math.min(1, v / 5)) * 360}deg, rgba(148,163,184,0.22) 0deg)` }}>
        <div className="rounded-full bg-white dark:bg-sentinel-surface grid place-items-center" style={{ width: size - 11, height: size - 11 }}>
          <span className="font-extrabold" style={{ color: col, fontSize: size * 0.3 }}>{value == null ? '—' : v.toFixed(1)}</span>
        </div>
      </div>
      {label && <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>}
    </div>
  );
};

const videoEmbed = (url: string): { kind: 'iframe' | 'video' | 'link'; src: string } => {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return { kind: 'iframe', src: `https://www.youtube.com/embed/${yt[1]}` };
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return { kind: 'iframe', src: `https://player.vimeo.com/video/${vm[1]}` };
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) || /supabase|r2\.dev|cloudflarestorage/.test(url)) return { kind: 'video', src: url };
  return { kind: 'link', src: url };
};

const VideoTile: React.FC<{ v: ProfileVideo }> = ({ v }) => {
  const em = videoEmbed(v.url);
  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-sentinel-border bg-white dark:bg-sentinel-surface">
      <div className="aspect-video bg-slate-900">
        {em.kind === 'iframe' ? <iframe src={em.src} title={v.title || 'Video'} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          : em.kind === 'video' ? <video src={em.src} controls className="w-full h-full" />
          : <a href={em.src} target="_blank" rel="noopener noreferrer" className="w-full h-full grid place-items-center text-white text-sm font-semibold hover:bg-slate-800"><span><i className="fas fa-play-circle mr-2" />Watch video</span></a>}
      </div>
      {v.title && <div className="px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{v.title}</div>}
    </div>
  );
};

const card = 'rounded-2xl bg-white dark:bg-sentinel-surface border border-slate-200 dark:border-sentinel-border';

const CategoryBars: React.FC<{ ratings: ScoutRatings; type: string | null }> = ({ ratings, type }) => {
  const cats = computeCategoryAverages(ratings, sectionsForType(type)).filter(c => c.avg != null);
  if (!cats.length) return null;
  return (
    <div className="space-y-1.5">
      {cats.map(c => (
        <div key={c.key} className="flex items-center gap-2.5">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300 w-28 shrink-0 truncate">{c.label}</span>
          <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(c.avg! / 5) * 100}%`, background: c.color }} /></div>
          <span className="text-sm font-bold tabular-nums w-8 text-right" style={{ color: ratingColor(c.avg!) }}>{c.avg!.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
};

export const ScoutProfileView: React.FC<{ data: ScoutProfile; onDeleteReport?: (id: string) => void }> = ({ data, onDeleteReport }) => {
  const { player, reports, videos } = data;

  // Overall = mean of each report's global average; merged ratings drive the overall radar.
  const overallAvg = useMemo(() => {
    const vals = reports.map(r => r.global_average).filter((n): n is number => n != null).map(Number);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
  }, [reports]);
  const merged = useMemo(() => {
    const acc: Record<string, { s: number; n: number }> = {};
    reports.forEach(r => Object.entries(r.ratings || {}).forEach(([k, v]) => { if (typeof v === 'number' && v > 0) { (acc[k] ||= { s: 0, n: 0 }); acc[k].s += v; acc[k].n++; } }));
    const out: ScoutRatings = {}; Object.entries(acc).forEach(([k, { s, n }]) => out[k] = Math.round((s / n) * 100) / 100); return out;
  }, [reports]);

  // Map a creator id → their display name (from reports) so videos land in the right scout's section.
  const nameByCreator = useMemo(() => { const m: Record<string, string> = {}; reports.forEach(r => { if (r.created_by) m[r.created_by] = r.author; }); return m; }, [reports]);
  const videoAuthor = (v: ProfileVideo) => v.author || (v.created_by ? nameByCreator[v.created_by] : '') || 'Scout';

  // Group reports + videos by scout (author).
  const scouts = useMemo(() => {
    const order: string[] = [];
    const rBy: Record<string, ProfileReport[]> = {}; const vBy: Record<string, ProfileVideo[]> = {};
    reports.forEach(r => { if (!rBy[r.author]) { rBy[r.author] = []; order.push(r.author); } rBy[r.author].push(r); });
    videos.forEach(v => { const a = videoAuthor(v); if (!rBy[a] && !vBy[a]) order.push(a); (vBy[a] ||= []).push(v); });
    return order.map(a => ({ author: a, reports: rBy[a] || [], videos: vBy[a] || [] }));
  }, [reports, videos]); // eslint-disable-line react-hooks/exhaustive-deps

  const meta = [player.position, player.age ? `${player.age}y` : null, player.foot ? `${player.foot}-footed` : null].filter(Boolean).join(' · ');

  return (
    <div className="space-y-5">
      {/* Identity header */}
      <div className={`${card} p-5 sm:p-6`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand/20 to-brand/5 text-brand grid place-items-center text-2xl font-extrabold overflow-hidden shrink-0 ring-1 ring-slate-200 dark:ring-sentinel-border">
            {player.photo ? <img src={player.photo} alt={player.name} className="w-full h-full object-cover" /> : initials(player.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{player.name}</h1>
              {player.scouting_status && <span className="text-[11px] font-bold uppercase tracking-wider rounded-full bg-brand/10 text-brand px-2.5 py-0.5">{SCOUTING_STATUSES[player.scouting_status]?.label || player.scouting_status}</span>}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{meta || 'Scouted player'}</p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
              {player.current_club && <span><i className="fas fa-shield-halved mr-1 opacity-60" />{player.current_club}</span>}
              {player.agent_name && <span><i className="fas fa-user-tie mr-1 opacity-60" />Agent: {player.agent_name}</span>}
            </div>
          </div>
        </div>
        {player.notes && <p className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{player.notes}</p>}
      </div>

      {reports.length === 0 ? (
        <div className={`${card} p-10 text-center text-slate-400`}>No scouting reports yet. Add a quick or in-depth report to build this profile.</div>
      ) : (
        <>
          {/* Overall rating + radar */}
          <div className={`${card} p-5`}>
            <div className="flex flex-col md:flex-row gap-5 items-center">
              <div className="flex items-center gap-5 shrink-0">
                <Dial value={overallAvg} size={84} label="Overall" />
                <div className="text-center">
                  <div className="text-2xl font-extrabold text-slate-900 dark:text-white">{reports.length}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Report{reports.length === 1 ? '' : 's'}</div>
                  <div className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">{scouts.filter(s => s.reports.length).length}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Scout{scouts.filter(s => s.reports.length).length === 1 ? '' : 's'}</div>
                </div>
              </div>
              <div className="w-full md:w-64 shrink-0"><ScoutRadar ratings={merged} /></div>
              <div className="flex-1 w-full min-w-0"><CategoryBars ratings={merged} type={reports.some(r => r.report_type === 'full') ? 'full' : 'quick'} /></div>
            </div>
          </div>

          {/* By scout — reports + that scout's videos */}
          {scouts.map(s => (
            <div key={s.author} className="space-y-3">
              <div className="flex items-center gap-2.5 px-1">
                <span className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-300 grid place-items-center text-[11px] font-bold">{initials(s.author)}</span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{s.author}</h3>
                <span className="text-xs text-slate-400">{s.reports.length ? `${s.reports.length} report${s.reports.length === 1 ? '' : 's'}` : ''}{s.reports.length && s.videos.length ? ' · ' : ''}{s.videos.length ? `${s.videos.length} video${s.videos.length === 1 ? '' : 's'}` : ''}</span>
              </div>

              {s.reports.map(r => (
                <div key={r.id} className={`${card} p-5`}>
                  <div className="flex items-start gap-3 flex-wrap">
                    {r.global_average != null && <div className="w-11 h-11 rounded-full grid place-items-center text-sm font-extrabold shrink-0 ring-2" style={{ color: ratingColor(Number(r.global_average)), borderColor: ratingColor(Number(r.global_average)) }}>{Number(r.global_average).toFixed(1)}</div>}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 dark:text-white">{r.match_context || 'Scouting Report'}</span>
                        <Verdict v={r.verdict} />
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 bg-slate-100 dark:bg-white/5 rounded px-1.5 py-0.5">{r.report_type === 'full' ? 'In-depth' : 'Quick'}</span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{fmtDate(r.date || r.created_at)}</div>
                    </div>
                    {onDeleteReport && <button onClick={() => onDeleteReport(r.id)} title="Delete report" className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 shrink-0"><i className="fas fa-trash-can text-sm" /></button>}
                  </div>

                  <div className="mt-3 grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4 items-center">
                    {r.ratings && <div className="shrink-0"><ScoutRadar ratings={r.ratings} height={180} /></div>}
                    {r.ratings && <CategoryBars ratings={r.ratings} type={r.report_type} />}
                  </div>

                  {r.feedback && (r.feedback.strengths || r.feedback.weaknesses || r.feedback.recommendation) && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {r.feedback.strengths && <Feedback title="Strengths" color="#059669" text={r.feedback.strengths} />}
                      {r.feedback.weaknesses && <Feedback title="Weaknesses" color="#e11d48" text={r.feedback.weaknesses} />}
                      {r.feedback.recommendation && <Feedback title="Recommendation" color="#00A383" text={r.feedback.recommendation} />}
                    </div>
                  )}
                </div>
              ))}

              {s.videos.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{s.videos.map(v => <VideoTile key={v.id} v={v} />)}</div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
};

const Feedback: React.FC<{ title: string; color: string; text: string }> = ({ title, color, text }) => (
  <div className="rounded-lg bg-slate-50 dark:bg-white/5 p-3">
    <div className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color }}>{title}</div>
    <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{text}</p>
  </div>
);
