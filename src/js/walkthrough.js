/**
 * Interactive Walkthrough System
 * Step-by-step guided tours that walk users through actual workflows.
 * Steps can require user actions (click, wait) before advancing.
 */

const WALKTHROUGHS = {};

// ═══════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════
WALKTHROUGHS['dashboard'] = [
    { type: 'center', title: 'Welcome to your Dashboard', text: 'This is your home base. Here\'s what you can do from this page.' },
    { type: 'highlight', target: '#dashSearchWrap', title: 'Search', text: 'Search for any player, match, or squad. Just start typing a name, opponent, or squad.', position: 'bottom' },
    { type: 'highlight', target: '#calendar-container', title: 'Training Calendar', text: 'Your calendar shows all sessions, matches, and events. Click any session to view details or switch to attendance mode to mark attendance.', position: 'top' },
    { type: 'highlight', target: '#calAddDropdown', title: 'Add Events & Quick Sessions', text: 'Add calendar events or use Quick Session to log a training session and mark attendance in one step. You can also set up recurring weekly sessions here.', position: 'bottom' },
];
WALKTHROUGHS['dashboard:academy'] = [
    { type: 'highlight', target: '.cal-mode-tab[data-mode="attendance"]', title: 'Attendance Mode', text: 'Switch here to mark attendance. Click a session, pick the squad — all players start as present. Tap any player chip to mark them absent.', position: 'bottom' },
];
WALKTHROUGHS['dashboard:private_coaching'] = [
    { type: 'center', title: 'Private Coaching Tip', text: 'When using Quick Session, select your squad first, then individually pick which clients attended. Unlike academy mode, players are NOT auto-selected — this keeps your invoicing accurate.' },
];

// ═══════════════════════════════════════════════════════════
//  SQUAD & PLAYERS
// ═══════════════════════════════════════════════════════════
WALKTHROUGHS['squad'] = [
    { type: 'center', title: 'Squad & Players', text: 'Manage your squads and players here. Create squads, add players, import from CSV, and access full player profiles.' },
    { type: 'highlight', target: '.page-header', title: 'Squad Management', text: 'Use "Add New Player" to register players with photo, jersey number, position, parent contacts, and medical info. "Import CSV" lets you bulk-add from a spreadsheet. Click any squad card to view its players, or use the All Players tab to see everyone.', position: 'bottom' },
];
WALKTHROUGHS['squad:academy'] = [
    { type: 'center', title: 'Academy Squads', text: 'Your squads represent teams (U17, U19, First Team). Players are organised into squads for matches, session planning, and analytics. Click into a squad to see its roster, then click any player for their full development profile.' },
];
WALKTHROUGHS['squad:private_coaching'] = [
    { type: 'center', title: 'Client Groups', text: 'Your squads represent client groups (U7-U9, U11-U13). Each player is an individual paying client. Their attendance feeds directly into invoicing. Click into a group to manage clients, then click any player for their full profile and assessment history.' },
];

// ═══════════════════════════════════════════════════════════
//  SESSION PLANNER
// ═══════════════════════════════════════════════════════════
WALKTHROUGHS['planner'] = [
    { type: 'center', title: 'Session Planner', text: 'Build complete training sessions with drill diagrams, descriptions, and animations.' },
    { type: 'highlight', target: '.page-header', title: 'How It Works', text: 'Use the Session Builder tab to add drill blocks and section blocks. Each drill has a pitch canvas for drawing formations. The Details tab sets date, venue, and team. The Animation Builder creates animated drill diagrams you can export as video. Save sessions to your Library and share them via link.', position: 'bottom' },
];

// ═══════════════════════════════════════════════════════════
//  LIBRARY
// ═══════════════════════════════════════════════════════════
WALKTHROUGHS['library'] = [
    { type: 'center', title: 'Session & Drill Library', text: 'All your saved sessions and drills live here. Search by title, author, or category. Filter by type (Sessions/Drills) and drill category (Technical, Tactical, etc.). Click any card to view, export as PDF/PNG, or share via link.' },
];

// ═══════════════════════════════════════════════════════════
//  MATCHES
// ═══════════════════════════════════════════════════════════
WALKTHROUGHS['matches'] = [
    { type: 'center', title: 'Fixtures & Results', text: 'Track upcoming fixtures and past results. Add matches with opponent, date, venue, and competition. After a match, open Match Details to record scores, player stats (goals, assists, cards, MOTM), and tactical notes.' },
];
WALKTHROUGHS['matches:academy'] = [
    { type: 'center', title: 'Team Matches', text: 'Record full team fixtures. Use Match Plans to set formations and starting XI before the game. After the match, log individual player performances with ratings and stats.' },
];
WALKTHROUGHS['matches:private_coaching'] = [
    { type: 'center', title: 'Player Watch', text: 'Use "Player Watch" match type to track individual client performances in matches they play for their clubs. Great for monitoring development outside your training sessions.' },
];

// ═══════════════════════════════════════════════════════════
//  TRAINING REGISTER
// ═══════════════════════════════════════════════════════════
WALKTHROUGHS['training-register'] = [
    { type: 'center', title: 'Training Register', text: 'Mark attendance for training sessions. Click any session on the calendar to open the attendance panel. Use Quick Session to log a session that was planned outside the platform, or set up recurring weekly sessions.' },
];
WALKTHROUGHS['training-register:academy'] = [
    { type: 'center', title: 'Academy Attendance', text: 'When you click a session, all squad players appear — everyone starts PRESENT. Tap a player to mark them absent. Sessions with a green check badge have already been marked.' },
];
WALKTHROUGHS['training-register:private_coaching'] = [
    { type: 'center', title: 'Client Attendance', text: 'For private coaching, players are NOT auto-selected. Search and add the specific clients who attended each session. This keeps your attendance accurate for invoicing — only attended sessions get billed.' },
];

// ═══════════════════════════════════════════════════════════
//  ANALYTICS
// ═══════════════════════════════════════════════════════════
WALKTHROUGHS['analytics'] = [
    { type: 'center', title: 'Analytics', text: 'View team and player performance data — goals, form charts (W/D/L), possession, xG, attendance trends, and assessment scores. Use filters to break down by squad, coach, or time period.' },
];

// ═══════════════════════════════════════════════════════════
//  REPORTS
// ═══════════════════════════════════════════════════════════
WALKTHROUGHS['reports'] = [
    { type: 'center', title: 'Reports Hub', text: 'Create session reports with attendance and drill notes. View match reports linked to match details. Track team assessment history and individual player assessment progress over time. Export reports as PDF.' },
];

// ═══════════════════════════════════════════════════════════
//  SCOUTING
// ═══════════════════════════════════════════════════════════
WALKTHROUGHS['scouting'] = [
    { type: 'center', title: 'Scouting Pipeline', text: 'Track scouted players from first sighting to signing. Add players, attach detailed reports with attribute ratings, upload match videos, and manage status (Watching → Shortlisted → Trialled → Signed). Promote players directly to your squad when ready.' },
];

// ═══════════════════════════════════════════════════════════
//  FINANCIALS (private_coaching only)
// ═══════════════════════════════════════════════════════════
WALKTHROUGHS['financials'] = []; // shared empty — archetype-specific below
WALKTHROUGHS['financials:private_coaching'] = [
    { type: 'center', title: 'Financials — 3 Steps', text: '1) Set pricing rules (session tiers, penalties, discounts, equipment charges).\n2) Generate invoices — pick a month, load attendance, review and adjust per client.\n3) Track payments — change status from Draft → Sent → Paid, export branded PDF invoices with your club logo.' },
];

// ═══════════════════════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════════════════════
WALKTHROUGHS['settings'] = [
    { type: 'center', title: 'Settings', text: 'Account & Security: update your name, password, sign out.\nClub Settings: club name, logo, contact details, current season, default session settings.\nAppearance: light/dark theme.\nRecently Deleted: recover items deleted in the last 7 days.\nWalkthroughs: replay any page guide.' },
];

// ═══════════════════════════════════════════════════════════
//  DEEP PAGES
// ═══════════════════════════════════════════════════════════
WALKTHROUGHS['players'] = [
    { type: 'center', title: 'Player Profile', text: 'View and edit all player details — photo, jersey, position, parent contacts, emergency info, medical details. Use the tabs: Overview for stats and attendance, New Assessment to rate the player, History to track progress over time.' },
];

// ═══════════════════════════════════════════════════════════
//  ENGINE
// ═══════════════════════════════════════════════════════════
let _steps = [];
let _stepIdx = 0;
let _overlayEl = null;
let _styleEl = null;
let _clickListener = null;

function getCompleted() {
    try { return JSON.parse(localStorage.getItem('sentinel_walkthroughs') || '{}'); } catch { return {}; }
}
function markComplete(id) {
    const c = getCompleted(); c[id] = Date.now();
    localStorage.setItem('sentinel_walkthroughs', JSON.stringify(c));
}
function isCompleted(id) { return !!getCompleted()[id]; }

function createOverlay() {
    if (_overlayEl) return;
    _overlayEl = document.createElement('div');
    _overlayEl.id = 'wt-overlay';
    _overlayEl.innerHTML = `
        <div id="wt-backdrop"></div>
        <div id="wt-tooltip">
            <div id="wt-title"></div>
            <div id="wt-text"></div>
            <div id="wt-footer">
                <span id="wt-counter"></span>
                <div>
                    <button id="wt-skip" class="wt-btn">Skip</button>
                    <button id="wt-prev" class="wt-btn">Back</button>
                    <button id="wt-next" class="wt-btn wt-btn-primary">Next</button>
                </div>
            </div>
        </div>`;
    const style = document.createElement('style');
    style.textContent = `
        #wt-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:99990;transition:opacity 0.2s}
        #wt-tooltip{position:fixed;z-index:99999;background:var(--bg-card,#fff);border-radius:14px;padding:20px 24px;max-width:360px;width:calc(100vw - 32px);box-shadow:0 12px 40px rgba(0,0,0,0.2);font-family:'Inter',sans-serif;transition:all 0.2s ease}
        #wt-title{font-size:0.95rem;font-weight:800;color:var(--text-primary,#0f172a);margin-bottom:8px}
        #wt-text{font-size:0.82rem;color:var(--text-secondary,#64748b);line-height:1.6}
        #wt-footer{display:flex;justify-content:space-between;align-items:center;margin-top:16px}
        #wt-counter{font-size:0.7rem;color:var(--text-muted,#94a3b8);font-weight:600}
        .wt-btn{padding:6px 14px;border-radius:8px;border:1px solid var(--border-light,#e2e8f0);background:var(--bg-body,#f8fafc);color:var(--text-primary,#334155);font-family:inherit;font-size:0.78rem;font-weight:600;cursor:pointer;margin-left:6px;transition:all 0.15s}
        .wt-btn:hover{border-color:var(--primary);color:var(--primary)}
        .wt-btn-primary{background:var(--primary,#00C49A);color:#fff;border-color:var(--primary,#00C49A)}
        .wt-btn-primary:hover{filter:brightness(0.85);color:#fff}
        .wt-hl{position:fixed;z-index:99995;border:2px solid var(--primary,#00C49A);border-radius:8px;box-shadow:0 0 0 4px rgba(0,196,154,0.2),0 0 0 9999px rgba(0,0,0,0.4);pointer-events:none;transition:all 0.25s ease}
        .wt-click-hint{animation:wt-pulse 1.5s infinite}
        @keyframes wt-pulse{0%,100%{box-shadow:0 0 0 4px rgba(0,196,154,0.2),0 0 0 9999px rgba(0,0,0,0.4)}50%{box-shadow:0 0 0 8px rgba(0,196,154,0.4),0 0 0 9999px rgba(0,0,0,0.4)}}
    `;
    if (_styleEl) _styleEl.remove();
    _styleEl = style;
    document.head.appendChild(style);
    document.body.appendChild(_overlayEl);

    document.getElementById('wt-skip').addEventListener('click', endWalkthrough);
    document.getElementById('wt-prev').addEventListener('click', () => showStep(_stepIdx - 1));
    document.getElementById('wt-next').addEventListener('click', () => {
        if (_stepIdx >= _steps.length - 1) endWalkthrough();
        else showStep(_stepIdx + 1);
    });
}

async function showStep(idx) {
    if (idx < 0 || idx >= _steps.length) return;
    _stepIdx = idx;
    const step = _steps[idx];

    // Clean up previous
    document.querySelector('.wt-hl')?.remove();
    if (_clickListener) { document.removeEventListener('click', _clickListener, true); _clickListener = null; }

    const tooltip = document.getElementById('wt-tooltip');
    const nextBtn = document.getElementById('wt-next');
    document.getElementById('wt-title').textContent = step.title;
    document.getElementById('wt-text').textContent = step.text;
    document.getElementById('wt-counter').textContent = `${idx + 1} / ${_steps.length}`;
    document.getElementById('wt-prev').style.display = idx > 0 ? '' : 'none';
    tooltip.style.transform = '';

    // Handle step types
    if (step.type === 'center') {
        nextBtn.textContent = idx >= _steps.length - 1 ? 'Done' : 'Next';
        nextBtn.style.display = '';
        tooltip.style.top = '50%';
        tooltip.style.left = '50%';
        tooltip.style.transform = 'translate(-50%, -50%)';
        return;
    }

    // Find target (supports comma-separated selectors — use first match)
    const selectors = (step.target || '').split(',').map(s => s.trim());
    let targetEl = null;
    for (const sel of selectors) {
        targetEl = document.querySelector(sel);
        if (targetEl) break;
    }

    // If target not found, wait briefly (for 'wait' type or dynamic content)
    if (!targetEl && (step.type === 'wait' || step.type === 'click')) {
        await new Promise(r => setTimeout(r, step.timeout || 1000));
        for (const sel of selectors) { targetEl = document.querySelector(sel); if (targetEl) break; }
    }

    if (!targetEl) {
        // Skip this step if target doesn't exist
        if (idx < _steps.length - 1) showStep(idx + 1);
        else endWalkthrough();
        return;
    }

    // Scroll into view
    const checkRect = targetEl.getBoundingClientRect();
    if (checkRect.top < 0 || checkRect.bottom > window.innerHeight) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 400));
    }

    const rect = targetEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Highlight
    const hl = document.createElement('div');
    hl.className = 'wt-hl' + (step.type === 'click' ? ' wt-click-hint' : '');
    hl.style.cssText = `top:${rect.top - 4}px;left:${rect.left - 4}px;width:${Math.min(rect.width + 8, vw - 8)}px;height:${rect.height + 8}px;`;
    if (step.type === 'click') hl.style.pointerEvents = 'none';
    document.body.appendChild(hl);

    // For 'click' steps, allow clicking through backdrop to the target
    if (step.type === 'click') {
        nextBtn.textContent = 'Click the highlighted area ↑';
        nextBtn.disabled = true;
        nextBtn.style.opacity = '0.4';

        // Cut a hole in the backdrop so the target is clickable
        const backdrop = document.getElementById('wt-backdrop');
        if (backdrop) {
            const bRect = targetEl.getBoundingClientRect();
            const insetTop = bRect.top - 6;
            const insetRight = vw - bRect.right - 6;
            const insetBottom = vh - bRect.bottom - 6;
            const insetLeft = bRect.left - 6;
            backdrop.style.clipPath = `polygon(
                0% 0%, 0% 100%, ${insetLeft}px 100%, ${insetLeft}px ${insetTop}px,
                ${vw - insetRight}px ${insetTop}px, ${vw - insetRight}px ${vh - insetBottom}px,
                ${insetLeft}px ${vh - insetBottom}px, ${insetLeft}px 100%, 100% 100%, 100% 0%
            )`;
        }

        _clickListener = (e) => {
            if (targetEl.contains(e.target) || targetEl === e.target) {
                nextBtn.disabled = false;
                nextBtn.style.opacity = '';
                document.removeEventListener('click', _clickListener, true);
                _clickListener = null;
                // Restore backdrop
                if (backdrop) backdrop.style.clipPath = '';
                // Wait for the click action to complete (modal open, navigation, etc.)
                setTimeout(() => {
                    if (_stepIdx < _steps.length - 1) showStep(_stepIdx + 1);
                    else endWalkthrough();
                }, 800);
            }
        };
        hl.style.pointerEvents = 'none';
        document.addEventListener('click', _clickListener, true);
    } else {
        nextBtn.textContent = idx >= _steps.length - 1 ? 'Done' : 'Next';
        nextBtn.disabled = false;
        nextBtn.style.opacity = '';
        // Restore backdrop (remove clip-path hole from previous click step)
        const backdrop = document.getElementById('wt-backdrop');
        if (backdrop) backdrop.style.clipPath = '';
    }

    // Position tooltip with smart viewport clamping
    tooltip.style.visibility = 'hidden';
    tooltip.style.top = '0'; tooltip.style.left = '0';
    const tooltipH = tooltip.offsetHeight || 200;
    const tooltipW = Math.min(360, vw - 32);
    tooltip.style.visibility = '';
    const gap = 14;

    let top, left;
    const pref = step.position || 'bottom';

    // Try preferred, then fallback
    if (pref === 'bottom' && rect.bottom + gap + tooltipH < vh) {
        top = rect.bottom + gap; left = Math.max(gap, Math.min(rect.left, vw - tooltipW - gap));
    } else if (pref === 'top' && rect.top - gap - tooltipH > 0) {
        top = rect.top - gap - tooltipH; left = Math.max(gap, Math.min(rect.left, vw - tooltipW - gap));
    } else if (pref === 'right' && rect.right + gap + tooltipW < vw) {
        top = Math.max(gap, Math.min(rect.top, vh - tooltipH - gap)); left = rect.right + gap;
    } else if (pref === 'left' && rect.left - gap - tooltipW > 0) {
        top = Math.max(gap, Math.min(rect.top, vh - tooltipH - gap)); left = rect.left - gap - tooltipW;
    } else {
        // Fallback: best fit
        if (rect.bottom + gap + tooltipH < vh) { top = rect.bottom + gap; }
        else if (rect.top - gap - tooltipH > 0) { top = rect.top - gap - tooltipH; }
        else { top = Math.max(gap, vh / 2 - tooltipH / 2); }
        left = Math.max(gap, Math.min(vw / 2 - tooltipW / 2, vw - tooltipW - gap));
    }

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
}

function endWalkthrough() {
    document.querySelector('.wt-hl')?.remove();
    if (_clickListener) { document.removeEventListener('click', _clickListener, true); _clickListener = null; }
    if (_overlayEl) { _overlayEl.remove(); _overlayEl = null; }
    if (_styleEl) { _styleEl.remove(); _styleEl = null; }
    if (_steps._pageId) markComplete(_steps._pageId);
}

export function startWalkthrough(pageId, force = false) {
    if (!force && isCompleted(pageId)) return;

    const archetype = window._profile?.clubs?.settings?.archetype || 'academy';
    const shared = WALKTHROUGHS[pageId] || [];
    const specific = WALKTHROUGHS[`${pageId}:${archetype}`] || [];
    const steps = [...shared, ...specific];

    if (steps.length === 0) return;

    _steps = steps;
    _steps._pageId = pageId;
    _stepIdx = 0;

    createOverlay();
    setTimeout(() => showStep(0), 500);
}

export function autoWalkthrough(pageId) {
    if (isCompleted(pageId)) return;
    setTimeout(() => startWalkthrough(pageId), 1500);
}

export function getAvailableWalkthroughs() {
    const archetype = window._profile?.clubs?.settings?.archetype || 'academy';
    const labels = {
        dashboard: 'Dashboard', planner: 'Session Planner', library: 'Library',
        squad: 'Squad & Players', 'training-register': 'Training Register',
        matches: 'Matches', analytics: 'Analytics', reports: 'Reports',
        scouting: 'Scouting', financials: 'Financials', settings: 'Settings',
    };
    const pages = ['dashboard', 'planner', 'library', 'squad', 'training-register', 'matches', 'analytics', 'reports', 'scouting'];
    if (archetype === 'private_coaching') pages.push('financials');
    pages.push('settings');
    return pages.map(p => ({
        id: p, label: labels[p] || p, completed: isCompleted(p),
        steps: (WALKTHROUGHS[p] || []).length + (WALKTHROUGHS[`${p}:${archetype}`] || []).length,
    }));
}

export function resetWalkthroughs() {
    localStorage.removeItem('sentinel_walkthroughs');
}
