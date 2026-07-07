import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchClubFixtures } from '../services/matchService';
import { PublicShareShell, ShareDownloadButton } from '../components/public/PublicShareShell';

/** Public, branded fixtures & results list for a club, filtered by date range + team.
 *  ?club=<id>&from=&to=&team=  — no auth, light mode, social-shareable. */
const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-slate-50 text-slate-500 flex flex-col items-center justify-center text-center px-6">{children}</div>
);
const fmtDay = (d?: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Date TBD';
const fmtShort = (d?: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const OUT: Record<string, string> = { W: 'bg-emerald-100 text-emerald-700', D: 'bg-slate-100 text-slate-600', L: 'bg-rose-100 text-rose-700' };

export const FixturesDossierPage: React.FC = () => {
  const [params] = useSearchParams();
  const club = params.get('club') || '';
  const from = params.get('from') || undefined;
  const to = params.get('to') || undefined;
  const team = params.get('team') || undefined;
  const { data, isLoading, error } = useQuery({ queryKey: ['club-fixtures', club, from, to, team], queryFn: () => fetchClubFixtures({ club, from, to, squadId: team }), enabled: !!club, retry: false });

  const groups = useMemo(() => {
    const ms = (data?.matches || []) as any[];
    const byDate: Record<string, any[]> = {};
    ms.forEach(m => { const k = m.date || 'zzz'; (byDate[k] = byDate[k] || []).push(m); });
    return Object.keys(byDate).sort().map(k => ({ date: k === 'zzz' ? null : k, matches: byDate[k] }));
  }, [data]);

  if (!club) return <Centered>Invalid fixtures link.</Centered>;
  if (isLoading) return <Centered><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mb-3" />Loading fixtures…</Centered>;
  if (error || !data?.club) return <Centered>This fixtures link is invalid.</Centered>;

  const rangeLabel = from && to ? `${fmtShort(from)} — ${fmtShort(to)}` : from ? `From ${fmtShort(from)}` : to ? `Until ${fmtShort(to)}` : 'All fixtures & results';
  const teamLabel = (data.matches || []).length && team ? (data.matches[0].squad || '') : '';

  return (
    <PublicShareShell club={data.club || { name: '' }} label="Fixtures & Results" maxWidth="max-w-3xl" action={<ShareDownloadButton onClick={() => window.print()} label="Print / PDF" />}>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Fixtures &amp; Results</h1>
        <p className="text-sm text-slate-500 mt-1">{rangeLabel}{teamLabel ? ` · ${teamLabel}` : ''}</p>
      </div>

      {!groups.length ? (
        <div className="py-16 text-center text-slate-400">No fixtures or results in this range.</div>
      ) : (
        <div className="space-y-5">
          {groups.map(g => (
            <div key={g.date || 'tbd'}>
              <div className="text-xs font-bold uppercase tracking-wider text-brand mb-2">{fmtDay(g.date)}</div>
              <div className="space-y-2">
                {g.matches.map((m: any) => {
                  const ourHome = m.our_side !== 'away';
                  const ourName = m.squad || 'Our Team';
                  const homeName = ourHome ? ourName : (m.opponent || 'Opponent');
                  const awayName = ourHome ? (m.opponent || 'Opponent') : ourName;
                  const isResult = m.is_past && m.home_score != null;
                  let outcome: string | null = null;
                  if (isResult) { const us = ourHome ? m.home_score : m.away_score; const op = ourHome ? m.away_score : m.home_score; outcome = us > op ? 'W' : us < op ? 'L' : 'D'; }
                  return (
                    <div key={m.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
                      <div className="w-14 text-center shrink-0">
                        <div className="text-xs font-semibold text-slate-400">{m.time || (isResult ? 'FT' : 'TBD')}</div>
                        {m.competition && <div className="text-[10px] text-slate-400 truncate">{m.competition}</div>}
                      </div>
                      <div className="flex-1 min-w-0 flex items-center justify-center gap-2 sm:gap-3">
                        <span className={'flex-1 text-right text-sm leading-tight truncate ' + (ourHome ? 'font-bold text-slate-900' : 'font-semibold text-slate-500')}>{homeName}</span>
                        {isResult
                          ? <span className={'shrink-0 rounded-md px-2.5 py-1 text-base font-extrabold tabular-nums ' + (outcome ? OUT[outcome] : 'bg-slate-100 text-slate-700')}>{m.home_score} - {m.away_score}</span>
                          : <span className="shrink-0 rounded-md bg-slate-100 text-slate-400 px-2 py-1 text-[11px] font-bold tracking-wider">VS</span>}
                        <span className={'flex-1 text-left text-sm leading-tight truncate ' + (!ourHome ? 'font-bold text-slate-900' : 'font-semibold text-slate-500')}>{awayName}</span>
                      </div>
                      <div className="hidden sm:block w-28 text-right shrink-0 text-xs text-slate-400 truncate">{m.venue || ''}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </PublicShareShell>
  );
};
