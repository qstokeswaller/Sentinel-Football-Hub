import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

/**
 * Football Hub walkthrough system (driver.js).
 *
 * Two layers (mirrors the SportsLab backbone, FH content):
 *  1. WELCOME_TOUR — the general tour. Auto-runs ONCE per USER on first sign-in
 *     (gated on the DB-backed profile flag, so it never repeats on another
 *     device), and is replayable from Settings → Walkthrough.
 *  2. PAGE_TOURS — one interactive tour per page, launched from Settings →
 *     Walkthrough (navigate to the route, then run). Steps target rendered
 *     `data-tour` anchors / nav hrefs, so the present-filter auto-drops steps for
 *     features the current plan/role hides → each tier gets a tour of its features.
 *
 * Each tour carries an optional `videoUrl` (YouTube/embed). Settings → Walkthrough
 * renders that as an embedded video when set, or a "coming soon" slot when not —
 * so screen-recorded walkthroughs plug in per tour without code changes.
 */

export interface FhTour {
  id: string;
  name: string;
  /** Route the tour runs on (Settings replay navigates here first). */
  route: string;
  /** Optional YouTube/embed URL — rendered in Settings → Walkthrough. */
  videoUrl?: string;
  steps: DriveStep[];
}

const DRIVER_OPTS = {
  showProgress: true,
  popoverClass: 'fh-tour',
  nextBtnText: 'Next',
  prevBtnText: 'Back',
  doneBtnText: 'Done',
  allowClose: true,                 // ✕, Esc and tapping the backdrop all close the tour
  overlayClickBehavior: 'close' as const, // tapping outside the highlight = escape hatch on mobile
};

// ── The general welcome tour (sidebar order; tier-filtered at runtime) ──────────
export const WELCOME_TOUR: FhTour = {
  id: 'welcome',
  name: 'Welcome tour',
  route: '/dashboard',
  videoUrl: undefined, // ← paste a YouTube/embed URL to attach the general video
  steps: [
    { element: '#welcome-msg', popover: { title: 'Welcome to Sentinel Football Hub 👋', description: 'Your command centre for sessions, squads, matches and analysis. Quick tour?' } },
    { element: '[data-tour="global-search"]', popover: { title: 'Search anything', description: 'Jump straight to a player, squad, match or session from here.' } },
    { element: 'a[href$="/planner"]', popover: { title: 'Session Planner', description: 'Build training sessions with the drill designer and save them to your library.' } },
    { element: 'a[href$="/library"]', popover: { title: 'Library', description: 'Your saved sessions, drills and animations — search, reuse and share them.' } },
    { element: 'a[href$="/reports"]', popover: { title: 'Reports', description: 'Log session reflections, attendance and notes, and export them as PDFs.' } },
    { element: 'a[href$="/squad"]', popover: { title: 'Squad Management', description: 'Manage players, availability, assessments and detailed player reports.' } },
    { element: 'a[href$="/matches"]', popover: { title: 'Matches', description: 'Track fixtures and results, line-ups, team stats and per-player stats.' } },
    { element: 'a[href$="/analytics"]', popover: { title: 'Analytics', description: 'See form, attendance trends and your top performers at a glance.' } },
    { element: 'a[href$="/scouting"]', popover: { title: 'Scouting', description: 'Build a scouting pipeline with verdicts, detailed reports and video.' } },
    { element: 'a[href$="/financials"]', popover: { title: 'Financials', description: 'Track club income, expenses, invoices and player fees.' } },
    { element: '[data-tour="settings-button"]', popover: { title: 'Settings', description: 'Club branding, seasons, staff roles, billing and walkthroughs live here. You can replay any tour from Settings → Walkthrough.' } },
  ],
};

// ── Per-page interactive tours (launched from Settings → Walkthrough) ───────────
// Each leads with the page's sidebar nav item (always present) then highlights the
// page's own elements via `data-tour` anchors. Missing anchors are skipped safely.
export const PAGE_TOURS: FhTour[] = [
  {
    id: 'dashboard', name: 'Dashboard', route: '/dashboard', videoUrl: undefined,
    steps: [
      { element: '#welcome-msg', popover: { title: 'Command Centre', description: 'Your home base — today\'s snapshot, quick actions, calendar and recent activity.' } },
      { element: '[data-tour="global-search"]', popover: { title: 'Global search', description: 'Find any player, squad, match or session instantly.' } },
      { element: '[data-tour="dash-calendar"]', popover: { title: 'Calendar & attendance', description: 'Your schedule with sessions and matches. Toggle Attendance to register who showed up.' } },
    ],
  },
  {
    id: 'planner', name: 'Session Planner', route: '/planner', videoUrl: undefined,
    steps: [
      { element: 'a[href$="/planner"]', popover: { title: 'Session Planner', description: 'Where you build training sessions from scratch or a template.' } },
      { element: '[data-tour="planner-main"]', popover: { title: 'Design the session', description: 'Add drills, lay them out on the pitch designer, set durations, and save to your Library.' } },
    ],
  },
  {
    id: 'library', name: 'Library', route: '/library', videoUrl: undefined,
    steps: [
      { element: 'a[href$="/library"]', popover: { title: 'Library', description: 'Your saved sessions, drills and animations live here.' } },
      { element: '[data-tour="library-main"]', popover: { title: 'Browse & reuse', description: 'Search and filter your saved content, reuse it in new sessions, or share it.' } },
    ],
  },
  {
    id: 'reports', name: 'Reports', route: '/reports', videoUrl: undefined,
    steps: [
      { element: 'a[href$="/reports"]', popover: { title: 'Reports', description: 'Write reflection reports for completed sessions.' } },
      { element: '[data-tour="reports-main"]', popover: { title: 'Log & export', description: 'Record notes, attendance and outcomes, then export a clean PDF.' } },
    ],
  },
  {
    id: 'squad', name: 'Squad Management', route: '/squad', videoUrl: undefined,
    steps: [
      { element: 'a[href$="/squad"]', popover: { title: 'Squad Management', description: 'Your players and squads — the people behind everything else.' } },
      { element: '[data-tour="squad-main"]', popover: { title: 'Players & squads', description: 'Add players, set availability, and open a player to see profile, match record, reports and assessments.' } },
    ],
  },
  {
    id: 'matches', name: 'Matches', route: '/matches', videoUrl: undefined,
    steps: [
      { element: 'a[href$="/matches"]', popover: { title: 'Matches', description: 'Fixtures, results, line-ups and stats.' } },
      { element: '[data-tour="matches-main"]', popover: { title: 'Track fixtures', description: 'Log results and per-player stats — these flow straight into player profiles and Analytics.' } },
    ],
  },
  {
    id: 'analytics', name: 'Analytics', route: '/analytics', videoUrl: undefined,
    steps: [
      { element: 'a[href$="/analytics"]', popover: { title: 'Analytics', description: 'Form, attendance trends and top performers — drawn from your matches and sessions.' } },
      { element: '[data-tour="analytics-main"]', popover: { title: 'Read the trends', description: 'Everything here is computed from the data you log elsewhere — no manual entry.' } },
    ],
  },
  {
    id: 'scouting', name: 'Scouting', route: '/scouting', videoUrl: undefined,
    steps: [
      { element: 'a[href$="/scouting"]', popover: { title: 'Scouting', description: 'Your recruitment pipeline — targets, verdicts and reports.' } },
      { element: '[data-tour="scouting-main"]', popover: { title: 'Build the pipeline', description: 'Track scouted players through stages with detailed reports and video.' } },
    ],
  },
  {
    id: 'financials', name: 'Financials', route: '/financials', videoUrl: undefined,
    steps: [
      { element: 'a[href$="/financials"]', popover: { title: 'Financials', description: 'Club income, expenses, invoices and player fees.' } },
      { element: '[data-tour="financials-main"]', popover: { title: 'Track the money', description: 'Record transactions and fees, and see where the club stands at a glance.' } },
    ],
  },
  {
    id: 'settings', name: 'Settings', route: '/settings', videoUrl: undefined,
    steps: [
      { element: '[data-tour="settings-button"]', popover: { title: 'Settings', description: 'Club branding, seasons, staff roles, billing, appearance — and this Walkthrough hub.' } },
    ],
  },
];

/** Run a tour's steps, keeping only those whose target is on the page right now. */
export function runTour(steps: DriveStep[]) {
  const present = steps.filter(s => typeof s.element === 'string' && document.querySelector(s.element as string));
  if (!present.length) return;
  const d = driver({
    ...DRIVER_OPTS,
    steps: present,
    // Inject a large, always-tappable "Skip tour" button into every popover. The
    // default corner ✕ is a tiny 32×28 target that's easy to miss on phones, so we
    // give an explicit, full-size control wired straight to destroy().
    onPopoverRender: (popover) => {
      if (popover.footer.querySelector('.fh-tour-skip')) return;
      const skip = document.createElement('button');
      skip.type = 'button';
      skip.className = 'fh-tour-skip';
      skip.textContent = 'Skip tour';
      skip.addEventListener('click', () => d.destroy());
      popover.footer.insertBefore(skip, popover.footer.firstChild);
    },
  });
  d.drive();
}

/** Back-compat: the welcome tour. */
export function startWalkthrough() {
  runTour(WELCOME_TOUR.steps);
}

let _autoStarted = false;
const LS_SEEN = 'fh_welcome_tour_seen';
/**
 * Run the welcome tour once per USER (not per device). `seen` is the DB-backed
 * profile flag (`has_seen_walkthrough`), so signing in on another device never
 * replays it; `markSeen` persists the flag. The in-session `_autoStarted` guard
 * stops a double-run before the DB write propagates, and a localStorage flag is a
 * same-device fallback so a momentary failed DB write can't make the tour nag on
 * every reload. Only the general welcome tour auto-runs — per-page tours are
 * launched manually from Settings.
 */
export function maybeAutoStartWalkthrough(seen: boolean, markSeen: () => void) {
  let lsSeen = false;
  try { lsSeen = localStorage.getItem(LS_SEEN) === '1'; } catch { /* private mode */ }
  if (seen || lsSeen || _autoStarted) return;
  _autoStarted = true;
  try { localStorage.setItem(LS_SEEN, '1'); } catch { /* private mode */ }
  markSeen();
  setTimeout(startWalkthrough, 900); // let the dashboard + sidebar render first
}
