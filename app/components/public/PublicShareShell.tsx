import React, { useEffect } from 'react';

/**
 * Shared chrome for PUBLIC share pages (player/squad/match/match-plan/fixtures dossiers,
 * session plans). These URLs are viewable by anyone with the link — and often land on
 * social media — so the design is intentionally polished: always light mode, a Sentinel-
 * branded gradient banner with the SHARING CLUB's badge, a premium content frame, and a
 * branded footer CTA. Page data comes from a token/RPC — no auth, no cross-club leakage.
 * A print stylesheet makes the "Print / PDF" output clean (chrome hidden, cards unbroken).
 */
const initials = (n: string) => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);

export interface ShareClub { name?: string | null; display_name?: string | null; logo_url?: string | null; }

const PRINT_CSS = `
@media print {
  .psh-noprint { display: none !important; }
  .psh-header { position: static !important; box-shadow: none !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .psh-root { background: #ffffff !important; }
  .psh-root .bg-white, .psh-root [class*="rounded-2xl"], .psh-root [class*="rounded-xl"] { box-shadow: none !important; break-inside: avoid; }
  .psh-root img, .psh-root canvas { break-inside: avoid; }
  @page { margin: 14mm; }
}`;

export const PublicShareShell: React.FC<{
  club?: ShareClub | null;
  label: string;            // e.g. "Player Dossier", "Match Report"
  action?: React.ReactNode; // primary action, rendered top-right (e.g. Print / PDF)
  maxWidth?: string;        // tailwind max-w-* for the content column
  children: React.ReactNode;
}> = ({ club, label, action, maxWidth = 'max-w-3xl', children }) => {
  // Public pages always render light, regardless of the viewer's theme.
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.getAttribute('data-theme');
    root.removeAttribute('data-theme');
    return () => { if (prev) root.setAttribute('data-theme', prev); };
  }, []);

  const clubName = club?.display_name || club?.name || '';

  return (
    <div className="psh-root min-h-screen text-slate-900" style={{ background: 'radial-gradient(1200px 500px at 50% -10%, #e9fbf5 0%, #f8fafc 45%)' }}>
      <style>{PRINT_CSS}</style>

      {/* Branded banner — sharing club's badge left, product mark + action right */}
      <header className="psh-header sticky top-0 z-20 text-[#0a1628]" style={{ background: 'linear-gradient(120deg, #007a62 0%, #00C49A 52%, #2fe3b6 100%)', boxShadow: '0 2px 18px rgba(0,160,131,0.25)' }}>
        <div className={`${maxWidth} mx-auto px-5 py-3.5 flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-md ring-1 ring-black/5">
              {club?.logo_url ? <img src={club.logo_url} alt={clubName} className="w-full h-full object-contain p-1" /> : <span className="text-[#00A383] font-extrabold text-base">{initials(clubName || 'FH')}</span>}
            </div>
            <div className="min-w-0">
              <div className="font-extrabold leading-tight truncate text-[15px]">{clubName || 'Sentinel Football Hub'}</div>
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-75">{label}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden md:flex items-center gap-1.5 text-sm font-bold"><i className="fas fa-futbol" /> Sentinel Football Hub</span>
            <span className="psh-noprint">{action}</span>
          </div>
        </div>
      </header>

      <main className={`${maxWidth} mx-auto px-4 sm:px-5 py-6`}>{children}</main>

      <footer className="psh-footer text-center pb-10 pt-4">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
          <span className="w-5 h-5 rounded-md bg-gradient-to-br from-[#00C49A] to-[#007a62] text-white flex items-center justify-center text-[10px]"><i className="fas fa-futbol" /></span>
          Powered by <span className="text-slate-700">Sentinel Football Hub</span>
        </div>
        <div className="psh-noprint mt-1.5 text-[11px] text-slate-400">Club management, squads, match planning &amp; analytics — <span className="text-brand font-semibold">sentinelfootballhub.com</span></div>
      </footer>
    </div>
  );
};

/** Branded "Print / PDF" (or Download) action for the banner — navy chip on the green banner. */
export const ShareDownloadButton: React.FC<{ onClick: () => void; label?: string }> = ({ onClick, label = 'Download PDF' }) => (
  <button onClick={onClick} className="inline-flex items-center gap-2 rounded-lg bg-[#0a1628] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#0a1628]/90 active:scale-[0.98] transition-all shadow-sm">
    <i className="fas fa-file-pdf" /> {label}
  </button>
);
