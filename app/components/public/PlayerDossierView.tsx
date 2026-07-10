import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { ReportsHistory, type HistoryReport } from '../reports/ReportsHistory';

/**
 * Reusable player-dossier CONTENT (no share shell) — embedded by the public player dossier
 * AND the squad dossier (when you click a player). Always light mode (public). Renders a
 * real-profile-style layout: bio/info, position-aware season stats (+ % minutes), recent
 * matches, performance-rating averages (lifetime), recent assessments, and media/highlights.
 */
export interface DossierData {
  player: { name: string; position?: string | null; jersey_number?: number | null; photo?: string | null; player_status?: string | null; date_of_birth?: string | null; nationality?: string | null; foot?: string | null; height?: string | null; weight?: string | null; bio?: string | null; previous_clubs?: string | null };
  stats: any[];
  assessments: any[];
  seasonMatches: number;
  media: { gallery: any[]; highlights: any[] };
  squadLabel?: string;
}

const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const calcAge = (dob?: string | null) => { if (!dob) return null; const d = new Date(dob), t = new Date(); let a = t.getFullYear() - d.getFullYear(); if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--; return a; };
const initials = (n: string) => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
const STATUS: Record<string, string> = { active: 'Active', injured: 'Injured', sick: 'Sick', suspended: 'Suspended', trialist: 'Trialist', unavailable: 'Unavailable' };
const STATUS_COLOR: Record<string, string> = { active: 'bg-emerald-100 text-emerald-700', injured: 'bg-rose-100 text-rose-700', suspended: 'bg-amber-100 text-amber-700', trialist: 'bg-sky-100 text-sky-700' };
const isGKPos = (p?: string | null) => { const s = (p || '').toUpperCase(); return s.includes('GK') || s.includes('GOAL'); };
const Card: React.FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-4">
    {title && <div className="px-6 py-3 border-b border-slate-100 text-[12px] font-bold uppercase tracking-wider text-slate-500">{title}</div>}
    <div className="p-6">{children}</div>
  </section>
);
const Stat: React.FC<{ val: React.ReactNode; label: string; accent?: string }> = ({ val, label, accent }) => (
  <div className="rounded-xl border border-slate-200 p-3 text-center"><div className={'text-2xl font-bold ' + (accent || 'text-slate-900')}>{val}</div><div className="text-[11px] text-slate-500 mt-0.5">{label}</div></div>
);

export const PlayerDossierView: React.FC<{ data: DossierData; onBack?: () => void }> = ({ data, onBack }) => {
  const { player, squadLabel } = data;
  const stats = data.stats || [];
  const assessments = data.assessments || [];
  const gk = isGKPos(player.position);
  const age = calcAge(player.date_of_birth);
  const statusCls = player.player_status || 'active';

  // Season / career totals.
  const apps = stats.length;
  const started = stats.filter(s => s.started).length;
  const minutes = stats.reduce((n, s) => n + (s.minutes_played || 0), 0);
  const goals = stats.reduce((n, s) => n + (s.goals || 0), 0);
  const assists = stats.reduce((n, s) => n + (s.assists || 0), 0);
  const motm = stats.filter(s => s.motm).length;
  const cleanSheets = stats.filter(s => s.clean_sheet).length;
  const saves = stats.reduce((n, s) => n + (s.saves || 0), 0);
  const rated = stats.filter(s => s.rating > 0);
  const avgRating = rated.length ? (rated.reduce((n, s) => n + s.rating, 0) / rated.length).toFixed(1) : '—';
  const seasonMinutes = (data.seasonMatches || 0) * 90;
  const pctMinutes = seasonMinutes ? Math.round(minutes / seasonMinutes * 100) : null;

  // Normalise assessments for the shared visual reports-history (ratings may arrive as a JSON string).
  const historyReports: HistoryReport[] = assessments.map((a: any) => {
    let r: any = a.ratings; if (typeof r === 'string') { try { r = JSON.parse(r); } catch { r = {}; } }
    return { id: a.id, type: a.type, ratings: r || {}, notes: a.notes, author: a.author, date: a.date, created_at: a.created_at };
  });

  const info = [
    player.date_of_birth && { label: 'Date of Birth', value: fmtDate(player.date_of_birth) + (age ? ` (${age})` : '') },
    player.nationality && { label: 'Nationality', value: player.nationality },
    player.foot && { label: 'Preferred Foot', value: player.foot },
    player.height && { label: 'Height', value: player.height },
    player.weight && { label: 'Weight', value: player.weight },
  ].filter(Boolean) as { label: string; value: string }[];

  const gallery = (data.media?.gallery || []) as any[];
  const highlights = (data.media?.highlights || []) as any[];
  const hlUrl = (h: any) => typeof h === 'string' ? h : (h?.url || h?.link || '');
  const hlTitle = (h: any) => typeof h === 'string' ? 'Highlight' : (h?.title || h?.name || 'Highlight');

  return (
    <div>
      {onBack && <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand mb-3"><ChevronLeft size={16} /> Back to squad</button>}

      {/* Hero */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-brand/15 text-brand flex items-center justify-center text-2xl font-bold overflow-hidden shrink-0">
            {player.photo ? <img src={player.photo} alt={player.name} className="w-full h-full object-cover" /> : initials(player.name)}
          </div>
          <div className="min-w-0">
            {player.jersey_number != null && <div className="text-brand font-bold text-sm">#{player.jersey_number}</div>}
            <h1 className="text-2xl font-bold truncate">{player.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
              {player.position && <span>{player.position}</span>}
              {squadLabel && <><span>·</span><span>{squadLabel}</span></>}
              <span className={'text-[11px] font-semibold rounded-full px-2 py-0.5 ' + (STATUS_COLOR[statusCls] || 'bg-slate-100 text-slate-600')}>{STATUS[statusCls] || statusCls}</span>
            </div>
          </div>
        </div>
        {info.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-slate-100">
            {info.map(i => <div key={i.label}><div className="text-[11px] uppercase tracking-wider text-slate-400">{i.label}</div><div className="font-semibold mt-0.5">{i.value}</div></div>)}
          </div>
        )}
      </Card>

      {/* Season stats (position-aware) + % minutes */}
      {apps > 0 && (
        <Card title="Season Stats">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            <Stat val={apps} label="Appearances" />
            <Stat val={started} label="Started" />
            <Stat val={minutes} label="Minutes" />
            <Stat val={pctMinutes != null ? `${pctMinutes}%` : '—'} label="% of Minutes" accent="text-sky-500" />
            {gk ? <>
              <Stat val={cleanSheets} label="Clean Sheets" accent="text-emerald-600" />
              <Stat val={saves} label="Saves" />
            </> : <>
              <Stat val={goals} label="Goals" accent="text-emerald-600" />
              <Stat val={assists} label="Assists" accent="text-violet-500" />
              <Stat val={goals + assists} label="G + A" accent="text-orange-500" />
            </>}
            <Stat val={motm} label="MOTM" accent={motm ? 'text-amber-500' : undefined} />
            <Stat val={avgRating} label="Avg Rating" accent="text-amber-500" />
          </div>
          {/* Recent matches (position-aware columns) */}
          <div className="mt-5 overflow-x-auto">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Last {Math.min(8, stats.length)} appearances</div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
                <th className="py-2 pr-2 font-semibold">Date</th><th className="py-2 pr-2 font-semibold">Opponent</th><th className="py-2 px-2 text-center font-semibold">Min</th>
                {gk ? <><th className="py-2 px-2 text-center font-semibold">CS</th><th className="py-2 px-2 text-center font-semibold">Sv</th></> : <><th className="py-2 px-2 text-center font-semibold">G</th><th className="py-2 px-2 text-center font-semibold">A</th></>}
                <th className="py-2 px-2 text-center font-semibold">Rating</th>
              </tr></thead>
              <tbody>
                {stats.slice(0, 8).map((s, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2 pr-2 text-slate-500 whitespace-nowrap">{fmtDate(s.date)}</td>
                    <td className="py-2 pr-2 font-medium">{s.opponent || '—'}</td>
                    <td className="py-2 px-2 text-center text-slate-500">{s.minutes_played ?? '—'}</td>
                    {gk ? <><td className="py-2 px-2 text-center">{s.clean_sheet ? '✓' : '—'}</td><td className="py-2 px-2 text-center">{s.saves || '—'}</td></>
                      : <><td className="py-2 px-2 text-center font-semibold">{s.goals || '—'}</td><td className="py-2 px-2 text-center font-semibold">{s.assists || '—'}</td></>}
                    <td className="py-2 px-2 text-center">{s.rating ? <span className="font-bold">{s.rating}</span> : '—'}{s.motm && <span title="MOTM" className="text-amber-400"> ★</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Performance & development reports — visual history (radar + per-category averages) */}
      {historyReports.length > 0 && (
        <div className="mb-4">
          <div className="text-[12px] font-bold uppercase tracking-wider text-slate-500 mb-3 px-1">Scouting & Assessment Reports</div>
          <ReportsHistory assessments={historyReports} />
        </div>
      )}

      {/* Media & Highlights */}
      {(gallery.length > 0 || highlights.length > 0) && (
        <Card title="Media & Highlights">
          {highlights.length > 0 && (
            <div className="mb-4 space-y-2">
              {highlights.map((h, i) => { const url = hlUrl(h); return url ? (
                <a key={i} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 hover:border-brand no-underline">
                  <span className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0"><i className="fas fa-play" /></span>
                  <span className="text-sm font-medium text-slate-800 truncate">{hlTitle(h)}</span>
                  <i className="fas fa-arrow-up-right-from-square text-slate-300 ml-auto" />
                </a>
              ) : null; })}
            </div>
          )}
          {gallery.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {gallery.map((p, i) => { const url = typeof p === 'string' ? p : p?.url; return url ? <a key={i} href={url} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-slate-200"><img src={url} alt="" className="w-full h-full object-cover" /></a> : null; })}
            </div>
          )}
        </Card>
      )}

      {/* Bio + previous clubs */}
      {player.bio?.trim() && <Card title="About"><p className="text-slate-700 whitespace-pre-wrap">{player.bio.trim()}</p></Card>}
      {player.previous_clubs?.trim() && (
        <Card title="Previous Clubs">
          <div className="flex flex-wrap gap-2">
            {player.previous_clubs.split(/[,\n]+/).map(c => c.trim()).filter(Boolean).map((c, i) => <span key={i} className="rounded-full bg-slate-100 px-3 py-1 text-sm">{c}</span>)}
          </div>
        </Card>
      )}
    </div>
  );
};
