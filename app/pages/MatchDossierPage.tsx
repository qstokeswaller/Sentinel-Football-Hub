import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { fetchMatchDossier } from '../services/matchService';
import { MATCH_STATS } from '../components/matches/MatchStatsModal';
import { PublicShareShell, ShareDownloadButton } from '../components/public/PublicShareShell';

/** Public, branded, read-only match result + report. ?token=<uuid>, no auth, light mode. */
const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-slate-50 text-slate-500 flex flex-col items-center justify-center text-center px-6">{children}</div>
);
const REPORT_SECTIONS: [string, string][] = [['report_general', 'General'], ['report_attacking', 'Attacking'], ['report_defending', 'Defending'], ['report_individual', 'Individual'], ['report_improvements', 'Areas to Improve']];
const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-5">{children}</div>;

export const MatchDossierPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { data, isLoading, error } = useQuery({ queryKey: ['match-dossier', token], queryFn: () => fetchMatchDossier(token), enabled: !!token, retry: false });

  if (!token) return <Centered>Invalid match link.</Centered>;
  if (isLoading) return <Centered><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mb-3" />Loading match…</Centered>;
  if (error || !data?.match) return <Centered>This match link is invalid or has expired.</Centered>;

  const m = data.match; const squad = data.squad; const stats = (data.stats || []) as any[];
  const ourHome = m.our_side !== 'away';
  const ourName = squad?.name || 'Our Team';
  const homeName = ourHome ? ourName : (m.opponent || 'Opponent');
  const awayName = ourHome ? (m.opponent || 'Opponent') : ourName;
  const isResult = m.is_past && m.home_score != null;
  const ourScore = ourHome ? m.home_score : m.away_score; const oppScore = ourHome ? m.away_score : m.home_score;
  const outcome = isResult ? (ourScore > oppScore ? 'W' : ourScore < oppScore ? 'L' : 'D') : null;
  const OUT: Record<string, string> = { W: 'bg-emerald-100 text-emerald-700', D: 'bg-slate-100 text-slate-600', L: 'bg-rose-100 text-rose-700' };
  const home = m.stats?.home || {}; const away = m.stats?.away || {};
  const reportSecs = REPORT_SECTIONS.filter(([k]) => (m[k] || '').trim());
  const photos = (m.match_photos || []) as { url: string; name?: string }[];

  return (
    <PublicShareShell club={data.club || { name: '' }} label="Match Report" maxWidth="max-w-4xl" action={<ShareDownloadButton onClick={() => window.print()} label="Print / PDF" />}>
      {/* Compact scoreboard title */}
      <div className="bg-[#0D1B2A] text-white rounded-2xl px-5 py-3.5 mb-5 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-0 flex items-center justify-center gap-3 sm:gap-5">
          <span className={'flex-1 text-right text-sm sm:text-base font-bold truncate ' + (ourHome ? 'text-brand' : '')}>{homeName}</span>
          {isResult ? <span className="shrink-0 text-2xl font-extrabold tabular-nums bg-white/10 rounded-lg px-3.5 py-1">{m.home_score} - {m.away_score}</span> : <span className="shrink-0 text-xs font-bold tracking-wider text-white/50 bg-white/10 rounded px-2.5 py-1.5">VS</span>}
          <span className={'flex-1 text-left text-sm sm:text-base font-bold truncate ' + (!ourHome ? 'text-brand' : '')}>{awayName}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/60 shrink-0">
          {[m.date, m.venue].filter(Boolean).join(' · ')}
          {outcome && <span className={'font-bold uppercase rounded px-1.5 py-0.5 ' + OUT[outcome]}>{outcome === 'W' ? 'Win' : outcome === 'L' ? 'Loss' : 'Draw'}</span>}
          {m.match_format && <span className="font-bold uppercase rounded px-1.5 py-0.5 bg-white/10 text-white/70">{m.match_format}</span>}
        </div>
      </div>

      {/* Team stats */}
      {MATCH_STATS.some(s => (home[s.key] || away[s.key])) && (
        <Card>
          <h2 className="text-lg font-bold text-slate-900 mb-3">Team Statistics</h2>
          <div className="flex justify-between text-xs font-semibold text-slate-700 mb-2"><span>{ourName}</span><span>{m.opponent || 'Opponent'}</span></div>
          {MATCH_STATS.map(s => { const h = Number((ourHome ? home : away)[s.key]) || 0; const a = Number((ourHome ? away : home)[s.key]) || 0; const tot = h + a; const hp = tot ? (h / tot) * 100 : 50; return (
            <div key={s.key} className="py-1.5"><div className="flex justify-between text-sm mb-1"><span className="font-semibold tabular-nums">{h}</span><span className="text-slate-500 text-xs">{s.label}</span><span className="font-semibold tabular-nums">{a}</span></div><div className="flex h-1.5 rounded-full overflow-hidden bg-slate-100"><div className="bg-brand" style={{ width: `${hp}%` }} /><div className="bg-slate-400" style={{ width: `${100 - hp}%` }} /></div></div>
          ); })}
        </Card>
      )}

      {/* Player stats */}
      {stats.length > 0 && (
        <Card>
          <h2 className="text-lg font-bold text-slate-900 mb-3">{ourName} — Player Stats{m.formation ? ` · ${m.formation}` : ''}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200"><th className="py-2 pr-2 font-semibold">Player</th><th className="px-2 font-semibold">Pos</th><th className="px-2 text-center font-semibold">Min</th><th className="px-2 text-center font-semibold">G</th><th className="px-2 text-center font-semibold">A</th><th className="px-2 text-center font-semibold">Sv</th><th className="px-2 text-center font-semibold">Rating</th></tr></thead>
              <tbody>
                {stats.map((s, i) => {
                  const isGK = (s.position || '').toUpperCase().includes('GK');
                  return (
                    <React.Fragment key={i}>
                      <tr className={s.notes ? '' : 'border-b border-slate-100'}>
                        <td className="py-2 pr-2 font-medium text-slate-900 whitespace-nowrap">
                          {s.jersey ? <span className="text-brand">#{s.jersey} </span> : ''}{s.name}
                          {!s.started && <span className="text-[10px] text-slate-400"> (sub)</span>}
                          {s.cs && <span title="Clean sheet" className="ml-1.5 text-emerald-500">🛡️</span>}
                          {s.yellow ? <span className="ml-1">🟨</span> : ''}{s.red ? <span className="ml-1">🟥</span> : ''}
                          {s.motm ? <Star size={12} className="inline ml-1 -mt-0.5 text-amber-400 fill-amber-400" /> : ''}
                        </td>
                        <td className="px-2 text-slate-400">{s.position || '—'}</td>
                        <td className="px-2 text-center text-slate-500">{s.minutes || '—'}</td>
                        <td className="px-2 text-center font-semibold">{isGK ? <span className="text-slate-300">—</span> : (s.goals || '—')}</td>
                        <td className="px-2 text-center font-semibold">{s.assists || '—'}</td>
                        <td className="px-2 text-center text-slate-500">{isGK && s.saves ? `${s.saves} sv` : '—'}</td>
                        <td className="px-2 text-center">{s.rating ? <span className="font-bold">{s.rating}/5</span> : '—'}</td>
                      </tr>
                      {s.notes && (
                        <tr className="border-b border-slate-100">
                          <td />
                          <td colSpan={6} className="pb-2.5 pr-2 text-xs text-slate-500 leading-relaxed"><i className="fas fa-comment-dots mr-1.5 text-slate-300" />{s.notes}</td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Report */}
      {reportSecs.length > 0 && (
        <Card>
          <h2 className="text-lg font-bold text-slate-900 mb-3">{m.report_title || 'Match Report'}</h2>
          <div className="space-y-3">{reportSecs.map(([k, lab]) => <div key={k}><div className="text-xs font-bold uppercase tracking-wider text-brand mb-1">{lab}</div><p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{m[k]}</p></div>)}</div>
        </Card>
      )}

      {/* Photos */}
      {photos.length > 0 && (
        <Card>
          <h2 className="text-lg font-bold text-slate-900 mb-3">Match Photos</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{photos.map((p, i) => <a key={i} href={p.url} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-slate-200"><img src={p.url} alt={p.name || 'Match photo'} className="w-full h-full object-cover" /></a>)}</div>
        </Card>
      )}
    </PublicShareShell>
  );
};
