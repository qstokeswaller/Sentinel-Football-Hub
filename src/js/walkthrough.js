/**
 * Walkthrough / Product-Tour System  —  Sentinel Football Hub
 * ----------------------------------------------------------------------------
 * driver.js-powered tours, adapted from the Sentinel SportsLab architecture
 * (WALKTHROUGH-SYSTEM-GUIDE.md) to this vanilla-JS, multi-page Vite app.
 *
 * Two layers (see guide §1):
 *   L1 — Welcome tour : app-wide intro. Fires once per user account, the first
 *        time they land on the Dashboard. Gated server-side via user metadata.
 *   L2 — Page tours    : one per major page. Fires once per page (per user) the
 *        first time that page is visited. Each highlights 2-6 key elements.
 *
 * Persistence (adapted — no DB migration needed): Supabase `user_metadata` is
 * the source of truth so state follows the user cross-device, mirrored into
 * localStorage as a fast suppress-only cache. State shape:
 *
 *   user_metadata.walkthroughs = {
 *     welcome: 'completed' | 'skipped' | <absent = pending>,
 *     tours:   { [pageId]: 'completed' | 'skipped' | <absent = pending> }
 *   }
 *
 * Targets use stable `data-tour="..."` attributes (guide §9) with a graceful
 * fallback: any step whose element is not in the DOM is filtered out before the
 * tour launches, so a conditionally-rendered target never throws or leaves a
 * broken tour.
 *
 * Content rule (guide §11): every element step explains WHAT it is, WHY the
 * coach cares, and WHERE the data comes from — so the app reads as one
 * connected system. Archetype-specific copy (academy vs private_coaching) is
 * layered on top of the shared steps.
 */

import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

// ═══════════════════════════════════════════════════════════════════════
//  BRANDED STYLING  (guide §5)  — green Football Hub identity, dark-aware
// ═══════════════════════════════════════════════════════════════════════
const STYLE_TAG_ID = 'sfh-tour-styles';

export function injectTourStyles() {
    if (document.getElementById(STYLE_TAG_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_TAG_ID;
    style.textContent = `
        .driver-popover {
            background: #fff !important;
            border: 1px solid #e2e8f0 !important;
            border-radius: 14px !important;
            box-shadow: 0 24px 48px rgba(13,27,42,0.28), 0 0 0 1px rgba(13,27,42,0.05) !important;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif !important;
            padding: 0 !important;
            overflow: hidden !important;
            max-width: 400px !important;
        }
        [data-theme="dark"] .driver-popover {
            background: #132338 !important;
            border-color: #243A58 !important;
            color: #E2E8F0 !important;
        }
        /* Title bar — navy→green gradient strip with platform mark */
        .driver-popover-title {
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            background: linear-gradient(135deg, #0D1B2A 0%, #0f766e 55%, #00C49A 100%) !important;
            color: #fff !important;
            font-size: 13.5px !important;
            font-weight: 700 !important;
            letter-spacing: 0.005em !important;
            margin: 0 !important;
            padding: 12px 18px !important;
            border-bottom: 1px solid rgba(0,196,154,0.35) !important;
            text-shadow: 0 1px 1px rgba(0,0,0,0.12) !important;
        }
        /* Inline football mark — crisp white at any DPI (data-URI, no extra request) */
        .driver-popover-title::before {
            content: '' !important;
            display: inline-block !important;
            width: 18px !important; height: 18px !important;
            background-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 7l4.7 3.4-1.8 5.5H9.1l-1.8-5.5z'/%3E%3Cpath d='M12 7V2.5M16.7 10.4l4.3-1.4M14.9 15.9l2.7 3.6M9.1 15.9l-2.7 3.6M7.3 10.4L3 9'/%3E%3C/svg%3E") !important;
            background-size: contain !important;
            background-repeat: no-repeat !important;
            background-position: center !important;
            opacity: 0.95 !important;
            flex-shrink: 0 !important;
        }
        .driver-popover-description {
            font-size: 13.5px !important;
            line-height: 1.6 !important;
            color: #334155 !important;
            margin: 0 !important;
            padding: 14px 18px 4px !important;
        }
        [data-theme="dark"] .driver-popover-description { color: #CBD5E1 !important; }
        .driver-popover-footer {
            margin: 0 !important;
            padding: 8px 18px 14px !important;
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
        }
        .driver-popover-progress-text {
            font-size: 10.5px !important;
            font-weight: 700 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.08em !important;
            color: #94a3b8 !important;
        }
        .driver-popover-navigation-btns {
            display: flex !important;
            gap: 6px !important;
            margin-left: auto !important;
        }
        .driver-popover-prev-btn, .driver-popover-next-btn {
            background: #fff !important;
            border: 1.5px solid #e2e8f0 !important;
            color: #475569 !important;
            border-radius: 8px !important;
            padding: 6px 14px !important;
            font-size: 12.5px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            transition: all 0.15s !important;
            text-shadow: none !important;
            font-family: inherit !important;
        }
        .driver-popover-prev-btn:hover {
            background: #f8fafc !important;
            border-color: #cbd5e1 !important;
            color: #1e293b !important;
        }
        .driver-popover-next-btn {
            background: #00C49A !important;
            border-color: #00C49A !important;
            color: #fff !important;
        }
        .driver-popover-next-btn:hover {
            background: #00a884 !important;
            border-color: #00a884 !important;
        }
        [data-theme="dark"] .driver-popover-prev-btn {
            background: #1A2D48 !important;
            border-color: #243A58 !important;
            color: #CBD5E1 !important;
        }
        [data-theme="dark"] .driver-popover-prev-btn:hover {
            background: #243A58 !important;
            color: #E2E8F0 !important;
        }
        .driver-popover-close-btn { display: none !important; }
        .driver-overlay { fill: rgba(13,27,42,0.65) !important; }
        .driver-active-element {
            outline: 3px solid rgba(0,196,154,0.65) !important;
            outline-offset: 4px !important;
            border-radius: 12px !important;
        }
        /* Live theme picker (welcome tour) */
        .sfh-theme-picker { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 4px 0 10px; }
        .sfh-theme-btn {
            padding: 10px 12px; border-radius: 10px; border: 2px solid #e2e8f0; background: #fff;
            font-size: 12.5px; font-weight: 600; color: #475569; cursor: pointer; transition: all 0.15s;
            display: flex; flex-direction: column; align-items: center; gap: 4px; font-family: inherit;
        }
        .sfh-theme-btn:hover { border-color: #cbd5e1; }
        .sfh-theme-btn[data-selected="true"] { border-color: #00C49A; background: #e6f9f4; color: #047857; }
        .sfh-theme-btn-icon { font-size: 18px; line-height: 1; }
        [data-theme="dark"] .sfh-theme-btn { background: #1A2D48; border-color: #243A58; color: #CBD5E1; }
        [data-theme="dark"] .sfh-theme-btn[data-selected="true"] { border-color: #00C49A; background: rgba(0,196,154,0.18); color: #5eead4; }
    `;
    document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════════════
//  TOUR DEFINITIONS  (guide §6, §7)
// ═══════════════════════════════════════════════════════════════════════

// L1 — Welcome tour. Element steps use shared-sidebar anchors that exist on
// every app page; centred steps need no element. Step index 5 is the live
// theme picker (see wireThemePicker).
const WELCOME_STEPS = [
    {
        title: 'Welcome to Football Hub',
        description: "Let's take about 90 seconds to walk through the platform — the navigation, your dashboard, how the calendar works, and where to find Settings. You can skip anytime and replay this later from Settings → Walkthrough.",
        center: true,
    },
    {
        element: '[data-tour="sidebar-nav"]',
        title: 'Your navigation',
        description: "Every part of the platform lives in this left sidebar — Dashboard, Session Planner, Library, Reports, Squad, Matches, Analytics, Scouting and more. Items above your current subscription tier show a lock — upgrade from Settings to unlock them. The page you're on is highlighted in green.",
        side: 'right', align: 'start',
    },
    {
        element: '[data-tour="dash-search"]',
        title: 'Global search',
        description: "Find any player, match or squad from one box — start typing a name, opponent or squad and jump straight there. It searches across everything you've added in Squad, Matches and Scouting, so you never have to remember which page something lives on.",
        side: 'bottom', align: 'start',
    },
    {
        element: '[data-tour="dash-calendar"]',
        title: 'Training calendar',
        description: "The heart of your week — every training session, match and event in one view. Sessions you build in the Session Planner and fixtures you add in Matches appear here automatically. Click any entry for details, or switch to Attendance mode to register who showed up.",
        side: 'top', align: 'start',
    },
    {
        element: '[data-tour="dash-add"]',
        title: 'Add events & quick sessions',
        description: "Add a calendar event, or use Quick Session to log a training that already happened and mark attendance in one step. You can also set up recurring weekly sessions here so your calendar fills itself for the season.",
        side: 'bottom', align: 'start',
    },
    {
        title: 'Pick your theme',
        description: "Light or dark — choose whichever you prefer. You can change it anytime from Settings → Appearance, and your choice follows you across devices.",
        center: true,
        themePicker: true,
    },
    {
        element: '[data-tour="settings-button"]',
        title: 'Settings & support',
        description: "Settings lives at the bottom-left of the sidebar. From there you manage your profile and club, change your subscription, recover recently-deleted items, switch theme, and replay any walkthrough from the Walkthrough tab.",
        side: 'right', align: 'end',
    },
    {
        title: "You're ready",
        description: "That's the tour. Every page also has its own short walkthrough that fires the first time you visit it — and you can replay any of them from Settings → Walkthrough whenever you need. Welcome aboard.",
        center: true,
    },
];

// L2 — Page tours. Each builder is a function of archetype so academy and
// private-coaching coaches get language that fits their world. Targets use
// data-tour anchors; any missing target is filtered out gracefully.
function pageTours(archetype) {
    const isPrivate = archetype === 'private_coaching';
    return {
        dashboard: {
            pageName: 'Dashboard',
            steps: [
                { center: true, title: 'Welcome to your Dashboard', description: "This is your home base. From here you can search everything, run your week on the calendar, log sessions and jump into any part of the platform. Here's a quick look at the key pieces." },
                { element: '[data-tour="dash-calendar"]', title: 'Training calendar', description: "Your week at a glance. Sessions built in the Session Planner and fixtures added in Matches surface here automatically. Click any entry to open it, drag to reschedule, or use the mode tabs to switch into attendance.", side: 'top' },
                { element: '[data-tour="dash-add"]', title: 'Add & Quick Session', description: isPrivate
                    ? "Add a calendar event, or use Quick Session to log a coaching session and pick exactly which clients attended — attendance here flows straight into Financials for accurate invoicing."
                    : "Add a calendar event, or use Quick Session to log a training and mark attendance in one step. Set up recurring weekly sessions so your calendar fills itself.", side: 'bottom' },
                { element: '[data-tour="dash-attendance"]', title: 'Attendance mode', description: isPrivate
                    ? "Switch here to register attendance. For private coaching, clients are NOT auto-selected — you add the specific clients who attended, keeping billing accurate."
                    : "Switch here to register attendance. Click a session, pick the squad, and everyone starts as present — tap any player to mark them absent.", side: 'bottom' },
            ],
        },
        squad: {
            pageName: isPrivate ? 'Player Management' : 'Squad & Players',
            steps: [
                { center: true, title: isPrivate ? 'Player Management' : 'Squad & Players', description: isPrivate
                    ? "Manage your client groups and individual players here. Each player is a paying client whose attendance feeds invoicing. Open a group to manage clients, then click any player for their full profile and assessment history."
                    : "Manage your squads and players here. Create squads (U17, U19, First Team), add players with photos and details, import from CSV, and open any player for their full development profile." },
                { element: '[data-tour="squad-tabs"]', title: isPrivate ? 'Groups & All Players' : 'Squads & All Players', description: isPrivate
                    ? "Two views. The Groups tab organises clients into groups (U7-U9, U11-U13) — open one to manage its members and see attendance that feeds Financials. The All Players tab is a flat, searchable list of every client across all groups."
                    : "Two views. The Squads tab groups players into teams (U17, U19, First Team) — open one to see its roster, snapshot, top performers and media. The All Players tab is a flat, searchable list of everyone in the club regardless of squad.", side: 'bottom' },
                { element: '[data-tour="squad-add"]', title: 'Add & import players', description: "Register players individually with photo, jersey number, position, parent contacts and medical info — or bulk-add a whole roster from a spreadsheet with Import CSV. Players you add here populate session attendance, match line-ups and analytics.", side: 'bottom' },
            ],
        },
        planner: {
            pageName: 'Session Planner',
            steps: [
                { center: true, title: 'Session Planner', description: "Build complete training sessions with drill diagrams, descriptions and animations, then save them to your Library or share them by link." },
                { element: '[data-tour="planner-tabbar"]', title: 'Builder, Details & Animation', description: "Three tabs run the whole flow. Session Builder is where you add drill blocks and section blocks — each drill has a pitch canvas for drawing formations. Details sets the date, venue and team. Animation Builder turns a drill into an animated diagram you can export as video.", side: 'bottom' },
                { element: '[data-tour="planner-save"]', title: 'Save & share', description: "Save commits the session to your Library, where it becomes reusable and searchable. From there you can export it as a PDF/PNG or generate a shareable link to send to assistant coaches — no account required to view.", side: 'bottom' },
            ],
        },
        library: {
            pageName: 'Library',
            steps: [
                { center: true, title: 'Session & Drill Library', description: "Everything you save lives here. Search by title, author or category, filter by type (Sessions / Drills) and drill category (Technical, Tactical…). Click any card to view, export as PDF/PNG, or share by link." },
                { element: '[data-tour="library-search"]', title: 'Search & filter', description: "Find any saved session or drill fast. Sessions come from the Session Planner; drills are the reusable building blocks inside them. Star or reuse a drill and it drops straight into your next session in the Planner.", side: 'bottom' },
            ],
        },
        matches: {
            pageName: 'Matches',
            steps: [
                { center: true, title: 'Fixtures & Results', description: isPrivate
                    ? "Track matches your clients play for their clubs using Player Watch — a great way to monitor development outside your own sessions. Add a match, then record individual performances afterwards."
                    : "Track upcoming fixtures and past results. Add a match with opponent, date, venue and competition, set your formation and starting XI with Match Plans, then record scores and player stats afterwards." },
                { element: '[data-tour="matches-add"]', title: 'Add a match', description: isPrivate
                    ? "Create a Player Watch entry for a client's fixture. After the game, open Match Details to log how they performed — ratings and notes feed their player profile and your analytics."
                    : "Create a fixture with opponent, date, venue and competition. Before kick-off, build a Match Plan (formation + starting XI). After the match, Match Details captures scores, goals, assists, cards, MOTM and tactical notes — all feeding Analytics.", side: 'bottom' },
                { element: '[data-tour="matches-list"]', title: 'Fixtures & results list', description: "Upcoming fixtures and completed results live here. Click any match to open its details. Results recorded here populate the form charts and performance trends on the Analytics page.", side: 'top' },
            ],
        },
        'training-register': {
            pageName: 'Training Register',
            steps: [
                { center: true, title: 'Training Register', description: isPrivate
                    ? "Register attendance for coaching sessions. Click a session on the calendar, then add the specific clients who attended — this keeps billing accurate, since only attended sessions are invoiced."
                    : "Mark attendance for training. Click a session on the calendar to open the attendance panel, or use Quick Session to log one planned outside the platform. Set up recurring weekly sessions to save time." },
                { element: '[data-tour="dash-calendar"]', title: 'Pick a session', description: isPrivate
                    ? "Click any session to open its register. Clients are NOT auto-selected for private coaching — search and add exactly who attended. Their attendance flows into Financials for invoicing."
                    : "Click any session to open its register. All squad players appear and start PRESENT — tap a player to mark them absent. Sessions already marked carry a green check badge.", side: 'top' },
            ],
        },
        analytics: {
            pageName: 'Analytics',
            steps: [
                { center: true, title: 'Analytics', description: "See team and player performance — goals, form (W/D/L), possession, xG, attendance trends and assessment scores. The numbers here are built from data you enter in Matches, the Training Register and player assessments." },
                { element: '[data-tour="analytics-filters"]', title: 'Filter your view', description: "Break the data down by squad, coach or time period. Everything recomputes for what you select, so a U15 view and a First Team view never get mixed up. Use this before any review meeting to pull the exact slice you need.", side: 'bottom' },
            ],
        },
        reports: {
            pageName: 'Reports',
            steps: [
                { center: true, title: 'Reports Hub', description: "Create session reports with attendance and drill notes, view match reports linked to Match Details, and track team and individual assessment progress over time. Export any report as a PDF." },
                { element: '[data-tour="reports-tabs"]', title: 'Four report types', description: "These tabs each pull from a different part of the platform. Session Reports come from the Training Register (attendance + drill notes). Match Reports come from Match Details. Team and Player assessment tabs track scores over time from player profiles. Pick a tab, generate the report, then export as PDF to share.", side: 'bottom' },
            ],
        },
        scouting: {
            pageName: 'Scouting',
            steps: [
                { center: true, title: 'Scouting Pipeline', description: "Track scouted players from first sighting to signing — add players, attach reports with attribute ratings, upload match videos, and move them through Watching → Shortlisted → Trialled → Signed. Promote a player straight into your squad when ready." },
                { element: '[data-tour="scouting-add"]', title: 'Add a scouted player', description: "Start a profile for a target. Attach detailed reports with attribute ratings and match video as you watch them. When you promote a signed player, they move into Squad & Players with their data intact — no re-typing.", side: 'bottom' },
            ],
        },
        financials: {
            pageName: 'Financials',
            steps: [
                { center: true, title: 'Financials', description: "Run your coaching business in three steps. 1) Set pricing rules — session tiers, penalties, discounts, equipment charges. 2) Generate invoices — pick a month, load attendance, review per client. 3) Track payments — Draft → Sent → Paid, and export branded PDF invoices with your club logo." },
                { element: '[data-tour="financials-tabbar"]', title: 'Pricing, Generate & History', description: "The three tabs follow the billing flow end-to-end. Pricing Rules sets your session tiers, penalties and discounts. Generate Invoices pulls a month's attendance (from the Training Register and Quick Session) and builds invoices per client. Invoice History tracks each invoice Draft → Sent → Paid and exports branded PDFs.", side: 'bottom' },
            ],
        },
        settings: {
            pageName: 'Settings',
            steps: [
                { center: true, title: 'Settings', description: "Manage everything about your account and club here. Account & Security for your name and password; Club Settings for branding, contacts and season; Appearance for theme; Recently Deleted to recover items from the last 7 days; and Walkthrough to replay any of these guides." },
                { element: '[data-tour="settings-walkthrough-nav"]', title: 'Walkthrough tab', description: "This is where every tour lives for replay — the welcome tour and each page's guide. Useful when onboarding new staff or when you've forgotten how a feature works. Video walkthroughs will slot in here as we record them.", side: 'right' },
            ],
        },
    };
}

// Page IDs that have an L2 tour, in sidebar order (drives Settings list).
const PAGE_ORDER = ['dashboard', 'planner', 'library', 'reports', 'squad', 'matches', 'analytics', 'scouting', 'training-register', 'financials', 'settings'];

// ═══════════════════════════════════════════════════════════════════════
//  STATE  (guide §4, adapted to user_metadata + localStorage cache)
// ═══════════════════════════════════════════════════════════════════════
let _userId = null;
let _sb = null;
let _driver = null;   // active driver instance (only one tour at a time)

function _key() { return `sfh_walkthroughs_${_userId || 'anon'}`; }

function _getState() {
    try {
        const raw = JSON.parse(localStorage.getItem(_key()) || '{}');
        if (!raw.tours) raw.tours = {};
        return raw;
    } catch { return { tours: {} }; }
}

function _saveState(state) {
    try { localStorage.setItem(_key(), JSON.stringify(state)); } catch {}
    const sb = _sb || window.supabase;
    if (sb) sb.auth.updateUser({ data: { walkthroughs: state } }).catch(() => {});
}

function _archetype() {
    return window._profile?.clubs?.settings?.archetype || 'academy';
}

/** Welcome tour status: 'completed' | 'skipped' | undefined(pending) */
function welcomeStatus() { return _getState().welcome; }
/** Page tour status for a pageId */
function tourStatus(pageId) { return _getState().tours[pageId]; }

function markWelcome(status) {
    const s = _getState(); s.welcome = status; _saveState(s);
}
function markTour(pageId, status) {
    const s = _getState(); s.tours[pageId] = status; _saveState(s);
}

/**
 * Initialise once after auth resolves. Merges remote user_metadata (authoritative
 * for cross-device completion) into the local cache, and migrates the legacy
 * `{ pageId: timestamp }` format from the old custom engine so existing users
 * aren't re-shown every tour.
 */
export async function initWalkthroughs(userId, supabaseClient, userObj = null) {
    _userId = userId || null;
    _sb = supabaseClient || window.supabase || null;

    // Migrate legacy unscoped + scoped keys from the pre-driver.js engine
    const legacyKeys = ['sentinel_walkthroughs', `sentinel_walkthroughs_${_userId || 'anon'}`];
    let migrated = null;
    for (const lk of legacyKeys) {
        try {
            const raw = localStorage.getItem(lk);
            if (!raw) continue;
            const old = JSON.parse(raw);
            if (old && typeof old === 'object' && !old.tours) {
                migrated = migrated || { tours: {} };
                for (const [k, v] of Object.entries(old)) {
                    if (v) migrated.tours[k] = 'completed';
                }
            }
            localStorage.removeItem(lk);
        } catch {}
    }
    if (migrated) {
        const cur = _getState();
        _saveState({ welcome: cur.welcome, tours: { ...migrated.tours, ...cur.tours } });
    }

    // Pull remote state from user_metadata (remote wins for completion)
    try {
        if (!_sb) return;
        let user = userObj;
        if (!user) { const { data } = await _sb.auth.getUser(); user = data?.user ?? null; }
        const remote = user?.user_metadata?.walkthroughs;
        if (!remote) return;
        const local = _getState();
        if (remote.tours || remote.welcome) {
            // New shape
            _saveState({
                welcome: remote.welcome || local.welcome,
                tours: { ...local.tours, ...(remote.tours || {}) },
            });
        } else if (typeof remote === 'object') {
            // Legacy shape stored remotely: { pageId: timestamp }
            const tours = { ...local.tours };
            for (const [k, v] of Object.entries(remote)) { if (v) tours[k] = 'completed'; }
            _saveState({ welcome: local.welcome, tours });
        }
    } catch {}
}

// ═══════════════════════════════════════════════════════════════════════
//  SKIP PILL  (guide §6)
// ═══════════════════════════════════════════════════════════════════════
function showSkipPill(onSkip) {
    if (document.getElementById('sfh-skip-tour-pill')) return;
    const pill = document.createElement('button');
    pill.id = 'sfh-skip-tour-pill';
    pill.type = 'button';
    pill.textContent = 'Skip tour';
    pill.style.cssText = `position:fixed;bottom:1rem;right:1rem;z-index:100001;
        background:rgba(13,27,42,0.92);color:rgba(255,255,255,0.95);font-size:12px;font-weight:600;
        padding:7px 16px;border-radius:999px;border:1px solid rgba(255,255,255,0.18);cursor:pointer;
        backdrop-filter:blur(8px);box-shadow:0 6px 18px rgba(0,0,0,0.35);
        font-family:'Inter',-apple-system,sans-serif;`;
    pill.addEventListener('click', onSkip);
    document.body.appendChild(pill);
}
function hideSkipPill() {
    document.getElementById('sfh-skip-tour-pill')?.remove();
}

// ═══════════════════════════════════════════════════════════════════════
//  LIVE THEME PICKER  (guide §6) — wired into the welcome tour's theme step
// ═══════════════════════════════════════════════════════════════════════
function isDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; }
function setTheme(dark) {
    // Mirror the app's own theme toggle EXACTLY (settings.html): set data-theme
    // to 'dark' for dark, REMOVE the attribute for light, persist sentinel-theme.
    if (dark) document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('sentinel-theme', dark ? 'dark' : 'light'); } catch {}
    // Notify any listeners (settings page toggle, charts) that theme changed
    window.dispatchEvent(new CustomEvent('sfh:theme-change', { detail: { dark } }));
}
function wireThemePicker(popover) {
    const wrap = popover.wrapper;
    if (!wrap) return;
    wrap.querySelector('.sfh-theme-picker')?.remove();
    const container = document.createElement('div');
    container.className = 'sfh-theme-picker';
    container.innerHTML = `
        <button type="button" data-theme-choice="light" class="sfh-theme-btn"><span class="sfh-theme-btn-icon">☀️</span><span>Light</span></button>
        <button type="button" data-theme-choice="dark" class="sfh-theme-btn"><span class="sfh-theme-btn-icon">🌙</span><span>Dark</span></button>`;
    const refresh = () => container.querySelectorAll('.sfh-theme-btn').forEach(btn => {
        const wantLight = btn.dataset.themeChoice === 'light';
        btn.dataset.selected = (wantLight && !isDark()) || (!wantLight && isDark()) ? 'true' : 'false';
    });
    container.querySelectorAll('.sfh-theme-btn').forEach(btn => btn.addEventListener('click', () => {
        setTheme(btn.dataset.themeChoice === 'dark');
        refresh();
    }));
    refresh();
    const footer = wrap.querySelector('.driver-popover-footer');
    if (footer) wrap.insertBefore(container, footer);
}

// ═══════════════════════════════════════════════════════════════════════
//  TOUR LAUNCHERS
// ═══════════════════════════════════════════════════════════════════════
function toDriverSteps(steps) {
    // Map our step shape → driver.js, filtering out element steps whose target
    // is not in the DOM (guide §7 — graceful degradation). Centred steps (no
    // element) always survive.
    return steps
        .filter(s => s.center || !s.element || document.querySelector(s.element))
        .map(s => ({
            element: s.center ? undefined : s.element,
            popover: {
                title: s.title,
                description: s.description,
                side: s.center ? 'over' : (s.side || 'bottom'),
                align: s.center ? 'center' : (s.align || 'start'),
            },
            _themePicker: !!s.themePicker,
        }));
}

function destroyActive() {
    if (_driver) { try { _driver.destroy(); } catch {} _driver = null; }
}

/** L1 — welcome tour */
function startWelcomeTour() {
    if (_driver) return;
    injectTourStyles();
    const steps = toDriverSteps(WELCOME_STEPS);
    if (steps.length === 0) return;
    const themeIdx = steps.findIndex(s => s._themePicker);

    const d = driver({
        showProgress: true,
        progressText: '{{current}} of {{total}}',
        showButtons: ['next', 'previous'],
        nextBtnText: 'Next →',
        prevBtnText: '← Back',
        doneBtnText: 'Finish',
        animate: true,
        overlayOpacity: 0.65,
        allowClose: false,
        disableActiveInteraction: true,
        stagePadding: 8,
        stageRadius: 12,
        steps,
        onPopoverRender: (popover, opts) => {
            if (themeIdx >= 0 && opts?.state?.activeIndex === themeIdx) wireThemePicker(popover);
        },
        onDestroyStarted: () => {
            // Reached the end → completed; bailed early → skipped
            markWelcome(d.hasNextStep() ? 'skipped' : 'completed');
            d.destroy();
        },
        onDestroyed: () => { _driver = null; hideSkipPill(); },
    });
    showSkipPill(() => d.destroy());
    d.drive();
    _driver = d;
}

/** L2 — generic page-tour launcher */
function launchPageTour(pageId, steps) {
    destroyActive();
    injectTourStyles();
    const dSteps = toDriverSteps(steps);
    if (dSteps.length === 0) return;
    const d = driver({
        showProgress: true,
        progressText: '{{current}} of {{total}}',
        showButtons: ['next', 'previous', 'close'],
        nextBtnText: 'Next →',
        prevBtnText: '← Back',
        doneBtnText: 'Got it',
        animate: true,
        overlayOpacity: 0.45,
        stagePadding: 8,
        stageRadius: 12,
        steps: dSteps,
        onDestroyStarted: () => {
            markTour(pageId, d.hasNextStep() ? 'skipped' : 'completed');
            d.destroy();
        },
        onDestroyed: () => { _driver = null; hideSkipPill(); },
    });
    showSkipPill(() => d.destroy());
    d.drive();
    _driver = d;
}

// ═══════════════════════════════════════════════════════════════════════
//  PUBLIC API  (called by page-init.js + settings.html)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Decide what (if anything) to auto-fire on this page. Called once per page
 * load from page-init.js after the page is revealed.
 *
 * - On the dashboard, if the welcome tour hasn't been seen, it fires first
 *   (and the dashboard page tour is suppressed until the welcome is done).
 * - Otherwise, if this page's L2 tour is still pending, it fires once.
 */
export function maybeAutoStart(pageId) {
    const onDashboard = pageId === 'dashboard';
    const welcomePending = !welcomeStatus();

    if (onDashboard && welcomePending) {
        setTimeout(startWelcomeTour, 700);
        return;
    }
    // L2: fire only if this page has a tour and it's still pending
    if (tourStatus(pageId)) return; // completed or skipped already
    const tours = pageTours(_archetype());
    if (!tours[pageId]) return;
    setTimeout(() => {
        // Re-check: welcome tour may have started in the meantime
        if (_driver) return;
        if (!tourStatus(pageId)) launchPageTour(pageId, tours[pageId].steps);
    }, 900);
}

/** Manually start a page tour (Settings replay / ?walkthrough= param). force ignores status. */
export function startWalkthrough(pageId, force = false) {
    if (pageId === 'welcome') {
        if (force || !welcomeStatus()) setTimeout(startWelcomeTour, 500); // let calendar/JS render
        return;
    }
    if (!force && tourStatus(pageId)) return;
    const tours = pageTours(_archetype());
    if (!tours[pageId]) return;
    setTimeout(() => launchPageTour(pageId, tours[pageId].steps), 500);
}

/** Replay the welcome tour from Settings (resets status + fires if on dashboard) */
export function replayWelcome() {
    markWelcome(undefined);
    const s = _getState(); delete s.welcome; _saveState(s);
    if (window.location.pathname.includes('dashboard')) {
        setTimeout(startWelcomeTour, 300);
    } else {
        window.location.href = '/src/pages/dashboard.html?walkthrough=welcome';
    }
}

/** Data for the Settings → Walkthrough list */
export function getAvailableWalkthroughs() {
    const archetype = _archetype();
    const tours = pageTours(archetype);
    const pages = PAGE_ORDER.filter(p => {
        if (p === 'financials') return archetype === 'private_coaching';
        return !!tours[p];
    });
    return {
        welcome: { status: welcomeStatus() || 'pending' },
        pages: pages.map(p => ({
            id: p,
            label: tours[p].pageName,
            steps: tours[p].steps.length,
            status: tourStatus(p) || 'pending',
        })),
    };
}

/** Reset everything — every tour will show again */
export function resetWalkthroughs() {
    _saveState({ tours: {} });
}

/** Reset a single page tour to pending without launching it */
export function resetTour(pageId) {
    const s = _getState();
    if (pageId === 'welcome') delete s.welcome; else delete s.tours[pageId];
    _saveState(s);
}
