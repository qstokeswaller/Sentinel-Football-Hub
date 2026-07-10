import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchSessionReportDossier } from '../services/dossierService';
import { PublicShareShell, ShareDownloadButton } from '../components/public/PublicShareShell';

/**
 * Public training-session report — reached via ?token=<uuid> (share link), no auth. Branded,
 * always light mode. Shows the session summary (attendance, intensity, coach rating, notes).
 * "Print / PDF" uses the shell's print stylesheet — the PDF lives here, inside the share link.
 */
const fmtDate = (d?: string | null) => d ? new Date(d.length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const intensityColor = (i?: string | null) => { const s = (i || '').toLowerCase(); return s.includes('high') ? 'text-rose-600 bg-rose-100' : s.includes('low') ? 'text-sky-600 bg-sky-100' : 'text-amber-600 bg-amber-100'; };

const Stars: React.FC<{ n: number }> = ({ n }) => (
  <span className="inline-flex gap-0.5 text-amber-400">{[1, 2, 3, 4, 5].map(i => <i key={i} className={(i <= n ? 'fas' : 'far') + ' fa-star text-sm'} />)}</span>
);

export const ReportDossierPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const { data, isLoading, error } = useQuery({
    queryKey: ['report-dossier', token],
    queryFn: () => fetchSessionReportDossier(token),
    enabled: !!token,
    retry: false,
  });

  if (!token) return <Centered>Invalid report link.</Centered>;
  if (isLoading) return <Centered><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mb-3" />Loading report…</Centered>;
  if (error || !data?.report) return <Centered>This report link is invalid or has expired.</Centered>;

  const { report, session, club } = data;
  const title = session?.title || 'Training Report';
  const pct = report.attendance_total ? Math.round((report.attendance_count / report.attendance_total) * 100) : null;

  return (
    <PublicShareShell club={club} label="Training Report" maxWidth="max-w-3xl" action={<ShareDownloadButton onClick={() => window.print()} label="Print / PDF" />}>
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold text-slate-900">{title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              <span><i className="far fa-calendar mr-1.5 opacity-70" />{fmtDate(report.date || session?.date)}</span>
              {session?.team && <span><i className="fas fa-shield-halved mr-1.5 opacity-70" />{session.team}</span>}
              {report.author && <span className="italic">by {report.author}</span>}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-400"><i className="fas fa-users mr-1.5" />Attendance</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{report.attendance_count}<span className="text-base text-slate-400">/{report.attendance_total || '—'}</span></div>
            {pct != null && <div className="text-xs font-semibold text-emerald-600 mt-0.5">{pct}% present</div>}
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-400"><i className="fas fa-bolt mr-1.5" />Intensity</div>
            <div className="mt-2"><span className={'text-sm font-bold rounded-full px-2.5 py-1 ' + intensityColor(report.intensity)}>{report.intensity || 'Normal'}</span></div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-400"><i className="fas fa-star mr-1.5" />Session Rating</div>
            <div className="mt-2 text-lg"><Stars n={report.rating || 0} /></div>
          </div>
        </div>

        {report.notes?.trim() && (
          <div className="mt-6 pt-6 border-t border-slate-100">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Coach's Notes</div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{report.notes.trim()}</p>
          </div>
        )}
      </section>
    </PublicShareShell>
  );
};

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-slate-50 text-slate-500 flex flex-col items-center justify-center text-center px-6">{children}</div>
);
