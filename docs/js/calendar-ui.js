/**
 * Training Calendar UI Component
 * Handles rendering of the monthly calendar on the dashboard
 * and displays color-coded session bubbles with session title + click popup.
 */

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();

// Inject popup styles once
(function injectCalendarStyles() {
    if (document.getElementById('cal-popup-style')) return;
    const style = document.createElement('style');
    style.id = 'cal-popup-style';
    style.textContent = `
        .calendar-bubble {
            position: relative;
            cursor: pointer;
            padding: 3px 7px;
            border-radius: 6px;
            font-size: 0.7rem;
            font-weight: 600;
            margin-bottom: 3px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
            transition: filter 0.15s;
            display: block;
        }
        .calendar-bubble:hover { filter: brightness(0.9); }

        .cal-session-popup {
            position: fixed;
            z-index: 9999;
            min-width: 230px;
            max-width: 290px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.18);
            overflow: hidden;
            animation: calPopIn 0.15s ease;
        }
        @keyframes calPopIn {
            from { opacity: 0; transform: translateY(-8px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .cal-popup-head {
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
            color: white;
            padding: 14px 16px 11px;
        }
        .cal-popup-head-title {
            font-size: 0.95rem;
            font-weight: 700;
            line-height: 1.3;
            margin: 0 0 3px 0;
        }
        .cal-popup-head-date {
            font-size: 0.75rem;
            opacity: 0.85;
            letter-spacing: 0.02em;
        }
        .cal-popup-body {
            padding: 12px 16px 8px;
        }
        .cal-popup-row {
            display: flex;
            align-items: flex-start;
            gap: 9px;
            font-size: 0.8rem;
            color: #475569;
            margin-bottom: 8px;
            line-height: 1.4;
        }
        .cal-popup-row i {
            color: #2563eb;
            width: 14px;
            text-align: center;
            flex-shrink: 0;
            margin-top: 1px;
        }
        .cal-popup-footer {
            padding: 6px 16px 13px;
            display: flex;
            gap: 8px;
        }
        .cal-popup-btn {
            flex: 1;
            padding: 8px 0;
            border-radius: 9px;
            border: none;
            cursor: pointer;
            font-size: 0.8rem;
            font-weight: 600;
            transition: all 0.15s;
        }
        .cal-popup-btn.primary { background: #2563eb; color: white; }
        .cal-popup-btn.primary:hover { background: #1d4ed8; }
        .cal-popup-btn.ghost { background: #f1f5f9; color: #64748b; }
        .cal-popup-btn.ghost:hover { background: #e2e8f0; }
    `;
    document.head.appendChild(style);
})();

// Popup state
let _activeCalPopup = null;

function closeCalPopup() {
    if (_activeCalPopup) {
        _activeCalPopup.remove();
        _activeCalPopup = null;
    }
}
window.closeCalPopup = closeCalPopup;

// Close popup when clicking outside
document.addEventListener('click', (e) => {
    if (_activeCalPopup && !_activeCalPopup.contains(e.target) && !e.target.closest('.calendar-bubble')) {
        closeCalPopup();
    }
}, true);

// Team → color class map
const TEAM_COLOR_MAP = {
    'u19': 'blue', 'u21': 'purple', 'senior': 'navy', 'elite': 'green',
    'first team': 'orange', 'u17': 'teal', 'u15': 'pink', 'varsity': 'navy'
};
const TEAM_COLORS = {
    'blue': 'bubble-team-blue', 'green': 'bubble-team-green', 'purple': 'bubble-team-purple',
    'orange': 'bubble-team-orange', 'red': 'bubble-team-red', 'navy': 'bubble-team-navy',
    'teal': 'bubble-team-teal', 'pink': 'bubble-team-pink', 'default': 'bubble-team-default'
};

function getTeamColorClass(teamName) {
    if (!teamName) return TEAM_COLORS['default'];
    const normalized = teamName.toLowerCase().trim();
    return TEAM_COLORS[TEAM_COLOR_MAP[normalized] || 'default'] || TEAM_COLORS['default'];
}

// Session fetching with cache
let _calSessionsCache = null;

async function fetchCalendarSessions() {
    if (_calSessionsCache) return _calSessionsCache;
    if (window.USE_LOCAL_STORAGE) {
        _calSessionsCache = JSON.parse(localStorage.getItem('up_sessions')) || [];
        return _calSessionsCache;
    }
    try {
        const res = await fetch(`${window.API_BASE_URL}/sessions`, { cache: 'no-store' });
        _calSessionsCache = await res.json();
        return _calSessionsCache;
    } catch (err) {
        console.error('Error fetching calendar sessions:', err);
        return [];
    }
}

async function renderCalendar() {
    const container = document.getElementById('calendar-container');
    const monthYearLabel = document.getElementById('calendar-month-year');
    if (!container || !monthYearLabel) return;

    const sessions = await fetchCalendarSessions();

    const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(currentYear, currentMonth));
    monthYearLabel.textContent = `${monthName} ${currentYear}`;

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();

    let html = '';

    // Day headers
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
        html += `<div class="calendar-day-header">${day}</div>`;
    });

    // Week summary tracking
    let weekCellCount = 0;
    let weekSessionIds = new Set();
    let weekPlayerIds = new Set();

    const injectWeekSummary = () => {
        const sc = weekSessionIds.size;
        const pc = weekPlayerIds.size;
        if (sc > 0) {
            html += `<div style="grid-column:1/-1;padding:2px 14px 6px;display:flex;gap:16px;justify-content:flex-end;">
                <span style="font-size:0.7rem;font-weight:700;color:#3b82f6;opacity:0.9;">
                    <i class="fas fa-calendar-check" style="margin-right:3px;"></i>${sc} session${sc !== 1 ? 's' : ''}
                </span>
                ${pc > 0 ? `<span style="font-size:0.7rem;font-weight:700;color:#10b981;opacity:0.9;">
                    <i class="fas fa-user" style="margin-right:3px;"></i>${pc} player${pc !== 1 ? 's' : ''}
                </span>` : ''}
            </div>`;
        } else {
            html += `<div style="grid-column:1/-1;padding:2px 0 5px;"></div>`;
        }
        weekCellCount = 0;
        weekSessionIds = new Set();
        weekPlayerIds = new Set();
    };

    // Prev month filler days
    for (let i = firstDay; i > 0; i--) {
        html += `<div class="calendar-day other-month"><div class="calendar-date-num">${prevMonthLastDay - i + 1}</div></div>`;
        if (++weekCellCount === 7) injectWeekSummary();
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = new Date().toISOString().split('T')[0] === dateStr;
        const daySessions = sessions.filter(s => s.date === dateStr);

        daySessions.forEach(s => {
            weekSessionIds.add(s.id || s._id);
            if (s.playerIds) s.playerIds.forEach(pid => weekPlayerIds.add(pid));
        });

        const bubblesHtml = daySessions.flatMap(s => {
            const timeStr = s.startTime || '--:--';
            const sid = String(s.id || s._id || '').replace(/'/g, '');
            const rawTitle = s.title || 'Session';
            const colorClass = getTeamColorClass(s.team);

            // One bubble per session — show time + player names compactly
            if (s.playerIds && s.playerIds.length > 0) {
                const names = s.playerIds.map(pid => getPlayerNameLocal(pid));
                const MAX_NAMES = 3;
                const visibleNames = names.slice(0, MAX_NAMES).join(', ');
                const overflow = names.length > MAX_NAMES ? ` +${names.length - MAX_NAMES}` : '';
                const label = `${timeStr} · ${visibleNames}${overflow}`;
                const fullTip = `${rawTitle}: ${names.join(', ')}`.replace(/"/g, '&quot;');
                return [`<div class="calendar-bubble ${colorClass}" onclick="showSessionPopup(event,'${sid}')" title="${fullTip}">${label}</div>`];
            } else {
                const label = `${timeStr} · ${rawTitle}`;
                return [`<div class="calendar-bubble ${colorClass}" onclick="showSessionPopup(event,'${sid}')" title="${rawTitle.replace(/"/g, '&quot;')}">${label}</div>`];
            }
        }).join('');

        html += `
            <div class="calendar-day ${isToday ? 'today' : ''}">
                <div class="calendar-date-num">${d}</div>
                <div class="calendar-bubbles-container">${bubblesHtml}</div>
            </div>`;

        if (++weekCellCount === 7) injectWeekSummary();
    }

    // Next month filler
    const remainingDays = (7 - (firstDay + daysInMonth) % 7) % 7;
    for (let i = 1; i <= remainingDays; i++) {
        html += `<div class="calendar-day other-month"><div class="calendar-date-num">${i}</div></div>`;
        if (++weekCellCount === 7) injectWeekSummary();
    }

    container.innerHTML = html;
}

async function showSessionPopup(event, sessionId) {
    if (event) event.stopPropagation();
    closeCalPopup();

    const sessions = await fetchCalendarSessions();
    const session = sessions.find(s => String(s.id || s._id || '') === String(sessionId));

    // If we can't find by ID, try finding by time/title from the bubble's context if available
    // but for now, let's just fail gracefully or show a generic popup if the user insists.
    if (!session) {
        console.warn('Session not found for ID:', sessionId);
        return;
    }

    const dateFormatted = session.date
        ? new Date(session.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        : 'No date set';

    const rows = [
        session.playerIds && session.playerIds.length > 0 ? `<div class="cal-popup-row"><i class="fas fa-user-circle"></i><strong>Participants:</strong> ${session.playerIds.map(pid => getPlayerNameLocal(pid)).join(', ')}</div>` : '',
        session.startTime ? `<div class="cal-popup-row"><i class="fas fa-clock"></i><strong>Time:</strong> ${session.startTime}${session.duration ? ' (' + session.duration + ' min)' : ''}</div>` : '',
        session.venue ? `<div class="cal-popup-row"><i class="fas fa-map-marker-alt"></i><strong>Venue:</strong> ${session.venue}</div>` : '',
        session.author ? `<div class="cal-popup-row"><i class="fas fa-user"></i><strong>Coach:</strong> ${session.author}</div>` : '',
        session.purpose || session.objectives ? `<div class="cal-popup-row" style="margin-top:8px;"><i class="fas fa-bullseye"></i><strong>Objectives:</strong><br><span style="flex:1; display:block; padding-top:4px; max-height:100px; overflow-y:auto; line-height:1.5; font-style:italic;">${session.objectives || session.purpose}</span></div>` : '',
    ].filter(Boolean).join('');

    const popup = document.createElement('div');
    popup.className = 'cal-session-popup';
    popup.innerHTML = `
        <div class="cal-popup-head" style="padding-bottom:14px;">
            <div class="cal-popup-head-title">${session.title || 'Untitled Session'}</div>
            <div class="cal-popup-head-date">${dateFormatted}</div>
        </div>
        <div class="cal-popup-body">${rows || '<div class="cal-popup-row"><i class="fas fa-info-circle"></i>No additional details.</div>'}</div>
        <div class="cal-popup-footer">
            <button class="cal-popup-btn ghost" onclick="closeCalPopup()">Close</button>
            <button class="cal-popup-btn primary" onclick="window.location.href='library.html?sessionId=${sessionId}'">View Plan</button>
        </div>
    `;

    document.body.appendChild(popup);
    _activeCalPopup = popup;

    const bubbleEl = event ? (event.target.closest('.calendar-bubble') || event.target) : null;
    if (bubbleEl) {
        const rect = bubbleEl.getBoundingClientRect();
        const popupW = 270;

        // Fixed positioning is relative to viewport
        let left = Math.round(rect.left);
        let top = Math.round(rect.bottom + 8);

        if (left + popupW > window.innerWidth - 12) left = window.innerWidth - popupW - 12;
        if (top + 280 > window.innerHeight) top = Math.round(rect.top) - 290;

        popup.style.left = left + 'px';
        popup.style.top = top + 'px';
    } else {
        // Center of viewport if no event target
        popup.style.left = '50%';
        popup.style.top = '50%';
        popup.style.transform = 'translate(-50%, -50%)';
    }
}

window.showSessionPopup = showSessionPopup;

// Backward compat
async function viewSessionDetails(sessionId) {
    return showSessionPopup(null, sessionId);
}

window.closeSessionDetailModal = () => {
    const modal = document.getElementById('session-detail-modal');
    if (modal) modal.classList.remove('active');
    closeCalPopup();
};

window.changeMonth = (delta) => {
    _calSessionsCache = null; // Invalidate on month nav
    currentMonth += delta;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    else if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
};

function getPlayerNameLocal(pid) {
    if (window.squadManager && squadManager.players) {
        const p = squadManager.players.find(x => x.id === pid);
        return p ? p.name : 'Unknown Player';
    }
    return 'Player ' + pid;
}

document.addEventListener('DOMContentLoaded', () => {
    if (window.squadManager) squadManager.init().then(renderCalendar);
    else renderCalendar();
});
