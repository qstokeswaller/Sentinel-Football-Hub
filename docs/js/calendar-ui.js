/**
 * Training Calendar UI Component
 * Desktop: full monthly grid.
 * Mobile (≤768 px): week strip + selected-day detail panel.
 */

let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth();

// Mobile state
let _mobileWeekOffset   = 0;   // weeks offset from current week (+ = future, - = past)
let _mobileSelectedDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

// ─── Inject styles once ──────────────────────────────────────────────────────

(function injectCalendarStyles() {
    if (document.getElementById('cal-popup-style')) return;
    const style = document.createElement('style');
    style.id = 'cal-popup-style';
    style.textContent = `
        /* ── Shared bubble ── */
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

        /* ── +N more button ── */
        .cal-more-btn {
            display: block;
            width: 100%;
            margin-top: 2px;
            padding: 2px 6px;
            font-size: 0.68rem;
            font-weight: 700;
            color: #64748b;
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            border-radius: 5px;
            cursor: pointer;
            text-align: center;
            transition: background 0.15s, color 0.15s;
            line-height: 1.6;
        }
        .cal-more-btn:hover { background: #e2e8f0; color: #334155; }

        /* ── Session / day popup ── */
        .cal-session-popup {
            position: fixed;
            z-index: 9999;
            min-width: 240px;
            max-width: 300px;
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
        .cal-popup-head-sub {
            font-size: 0.75rem;
            opacity: 0.85;
            letter-spacing: 0.02em;
        }
        .cal-popup-body  { padding: 12px 16px 8px; }
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
            align-items: center;
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
        .cal-popup-btn.ghost   { background: #f1f5f9; color: #64748b; }
        .cal-popup-btn.ghost:hover { background: #e2e8f0; }
        .cal-popup-btn.danger  { flex: none; padding: 8px 11px; background: #fee2e2; color: #ef4444; border: 1px solid #fecaca; border-radius: 9px; }
        .cal-popup-btn.danger:hover { background: #fecaca; }

        /* ── Mobile calendar ── */
        .mobile-week-strip {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 3px;
            margin-bottom: 14px;
        }
        .mobile-day-pill {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 7px 2px 6px;
            border-radius: 10px;
            cursor: pointer;
            gap: 3px;
            transition: background 0.15s;
            -webkit-tap-highlight-color: transparent;
        }
        .mobile-day-pill:active { background: #e2e8f0; }
        .mobile-day-pill.today-pill  { background: #eff6ff; }
        .mobile-day-pill.active-pill { background: #2563eb; }
        .mobile-day-pill .dp-abbr {
            font-size: 0.6rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: #94a3b8;
            line-height: 1;
        }
        .mobile-day-pill.active-pill .dp-abbr { color: rgba(255,255,255,0.75); }
        .mobile-day-pill .dp-num {
            font-size: 0.9rem;
            font-weight: 800;
            color: #1e293b;
            line-height: 1;
        }
        .mobile-day-pill.today-pill  .dp-num { color: #2563eb; }
        .mobile-day-pill.active-pill .dp-num { color: white; }
        .mobile-day-dot {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            margin-top: 1px;
        }
        .mobile-day-pill.active-pill .mobile-day-dot { opacity: 0.7; filter: brightness(1.5); }

        .mobile-day-panel {
            background: #f8fafc;
            border-radius: 14px;
            padding: 14px 14px 10px;
            min-height: 72px;
        }
        .mobile-day-label {
            font-size: 0.72rem;
            font-weight: 700;
            color: #94a3b8;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin-bottom: 10px;
        }
        .mobile-day-panel .calendar-bubble {
            font-size: 0.82rem;
            padding: 9px 13px;
            border-radius: 9px;
            margin-bottom: 7px;
            white-space: normal;
            line-height: 1.3;
        }
        .mobile-no-sessions {
            text-align: center;
            padding: 18px 0 10px;
            color: #94a3b8;
            font-size: 0.82rem;
        }
        .mobile-no-sessions i { display: block; font-size: 1.4rem; margin-bottom: 6px; opacity: 0.35; }

        /* Hide desktop grid on mobile, mobile layout on desktop */
        @media (max-width: 768px) {
            .cal-desktop-only { display: none !important; }
        }
        @media (min-width: 769px) {
            .cal-mobile-only { display: none !important; }
        }
    `;
    document.head.appendChild(style);
})();

// ─── Popup state ─────────────────────────────────────────────────────────────

let _activeCalPopup = null;

function closeCalPopup() {
    if (_activeCalPopup) { _activeCalPopup.remove(); _activeCalPopup = null; }
}
window.closeCalPopup = closeCalPopup;

document.addEventListener('click', (e) => {
    if (
        _activeCalPopup &&
        !_activeCalPopup.contains(e.target) &&
        !e.target.closest('.calendar-bubble') &&
        !e.target.closest('.cal-more-btn')
    ) closeCalPopup();
}, true);

// ─── Hour-based session colours ──────────────────────────────────────────────

const _HOUR_COLOR_CLASS = {
     6:'bubble-team-navy',  7:'bubble-team-teal',  8:'bubble-team-green', 9:'bubble-team-blue',
    10:'bubble-team-purple',11:'bubble-team-orange',12:'bubble-team-pink',13:'bubble-team-navy',
    14:'bubble-team-teal', 15:'bubble-team-green', 16:'bubble-team-red',  17:'bubble-team-blue',
    18:'bubble-team-purple',19:'bubble-team-orange',20:'bubble-team-pink',21:'bubble-team-navy',
};
const _HOUR_DOT_COLOR = {
     6:'#1e3a5f', 7:'#0d9488', 8:'#16a34a', 9:'#2563eb',
    10:'#7c3aed',11:'#ea580c',12:'#db2777',13:'#1e3a5f',
    14:'#0d9488',15:'#16a34a',16:'#dc2626',17:'#2563eb',
    18:'#7c3aed',19:'#ea580c',20:'#db2777',21:'#1e3a5f',
};

function getSessionColorClass(startTime) {
    if (!startTime) return 'bubble-team-default';
    const h = parseInt(startTime.split(':')[0], 10);
    return _HOUR_COLOR_CLASS[h] || 'bubble-team-default';
}
function getSessionDotColor(startTime) {
    if (!startTime) return '#cbd5e1';
    const h = parseInt(startTime.split(':')[0], 10);
    return _HOUR_DOT_COLOR[h] || '#cbd5e1';
}

// ─── Session cache ────────────────────────────────────────────────────────────

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

// ─── Shared bubble builder ────────────────────────────────────────────────────

const MAX_BUBBLE_NAMES = 2;
const MAX_DAY_BUBBLES  = 3;

function buildBubble(s, { extraStyle = '' } = {}) {
    const timeStr    = s.startTime || '--:--';
    const sid        = String(s.id || s._id || '').replace(/'/g, '');
    const rawTitle   = s.title || 'Session';
    const colorClass = getSessionColorClass(s.startTime);

    let label, tip;
    if (s.playerIds && s.playerIds.length > 0) {
        const names   = s.playerIds.map(pid => getPlayerNameLocal(pid));
        const visible = names.slice(0, MAX_BUBBLE_NAMES).join(', ');
        const over    = names.length > MAX_BUBBLE_NAMES ? ` +${names.length - MAX_BUBBLE_NAMES}` : '';
        label = `${visible}${over} · ${timeStr}`;
        tip   = `${rawTitle}: ${names.join(', ')} @ ${timeStr}`.replace(/"/g, '&quot;');
    } else {
        label = timeStr;
        tip   = rawTitle.replace(/"/g, '&quot;');
    }

    const styleAttr = extraStyle ? ` style="${extraStyle}"` : '';
    return `<div class="calendar-bubble ${colorClass}"${styleAttr} onclick="showSessionPopup(event,'${sid}')" title="${tip}">${label}</div>`;
}

// ─── Delete session ───────────────────────────────────────────────────────────

window.deleteCalSession = async function (sessionId) {
    if (!confirm('Delete this session? The drills will remain in the library.')) return;
    try {
        const res = await fetch(`${window.API_BASE_URL}/sessions/${sessionId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');
        closeCalPopup();
        _calSessionsCache = null;
        isMobileMode() ? renderMobileCalendar() : renderCalendar();
        if (window.showGlobalToast) window.showGlobalToast('Session deleted', 'success');
    } catch (err) {
        console.error('Failed to delete session:', err);
        if (window.showGlobalToast) window.showGlobalToast('Failed to delete session', 'error');
    }
};

// ─── Render dispatcher ────────────────────────────────────────────────────────

function isMobileMode() { return window.innerWidth <= 768; }

function renderCalendarDispatch() {
    isMobileMode() ? renderMobileCalendar() : renderCalendar();
}

// ─── Desktop calendar ─────────────────────────────────────────────────────────

async function renderCalendar() {
    const container      = document.getElementById('calendar-container');
    const monthYearLabel = document.getElementById('calendar-month-year');
    if (!container || !monthYearLabel) return;

    const sessions = await fetchCalendarSessions();

    monthYearLabel.textContent = new Intl.DateTimeFormat('en-US', { month: 'long' })
        .format(new Date(currentYear, currentMonth)) + ' ' + currentYear;

    const firstDay         = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth      = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();

    let html = '';

    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d =>
        html += `<div class="calendar-day-header">${d}</div>`);

    let weekCellCount  = 0;
    let weekSessionIds = new Set();
    let weekPlayerIds  = new Set();

    const injectWeekSummary = () => {
        const sc = weekSessionIds.size, pc = weekPlayerIds.size;
        html += sc > 0
            ? `<div style="grid-column:1/-1;padding:2px 14px 6px;display:flex;gap:16px;justify-content:flex-end;">
                <span style="font-size:0.7rem;font-weight:700;color:#3b82f6;opacity:0.9;">
                    <i class="fas fa-calendar-check" style="margin-right:3px;"></i>${sc} session${sc!==1?'s':''}</span>
                ${pc>0?`<span style="font-size:0.7rem;font-weight:700;color:#10b981;opacity:0.9;">
                    <i class="fas fa-user" style="margin-right:3px;"></i>${pc} player${pc!==1?'s':''}</span>`:''}
               </div>`
            : `<div style="grid-column:1/-1;padding:2px 0 5px;"></div>`;
        weekCellCount = 0; weekSessionIds = new Set(); weekPlayerIds = new Set();
    };

    for (let i = firstDay; i > 0; i--) {
        html += `<div class="calendar-day other-month"><div class="calendar-date-num">${prevMonthLastDay - i + 1}</div></div>`;
        if (++weekCellCount === 7) injectWeekSummary();
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr     = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isToday     = new Date().toISOString().split('T')[0] === dateStr;
        const daySessions = sessions.filter(s => s.date === dateStr)
            .sort((a,b) => (a.startTime||'').localeCompare(b.startTime||''));

        daySessions.forEach(s => {
            weekSessionIds.add(s.id || s._id);
            if (s.playerIds) s.playerIds.forEach(pid => weekPlayerIds.add(pid));
        });

        const visible  = daySessions.slice(0, MAX_DAY_BUBBLES);
        const overflow = daySessions.length - MAX_DAY_BUBBLES;
        const moreBtn  = overflow > 0
            ? `<button class="cal-more-btn" onclick="showDayPopup(event,'${dateStr}')">+${overflow} more</button>`
            : '';

        html += `
            <div class="calendar-day ${isToday ? 'today' : ''}">
                <div class="calendar-date-num">${d}</div>
                <div class="calendar-bubbles-container">${visible.map(s=>buildBubble(s)).join('')}${moreBtn}</div>
            </div>`;

        if (++weekCellCount === 7) injectWeekSummary();
    }

    const remaining = (7 - (firstDay + daysInMonth) % 7) % 7;
    for (let i = 1; i <= remaining; i++) {
        html += `<div class="calendar-day other-month"><div class="calendar-date-num">${i}</div></div>`;
        if (++weekCellCount === 7) injectWeekSummary();
    }

    container.className = 'calendar-grid-container cal-desktop-only';
    container.innerHTML = html;

    // Ensure mobile container is removed when switching to desktop
    const mc = document.getElementById('cal-mobile-wrap');
    if (mc) mc.remove();
}

// ─── Mobile calendar ──────────────────────────────────────────────────────────

function getMobileWeekDates(weekOffset) {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d;
    });
}

async function renderMobileCalendar() {
    const monthYearLabel = document.getElementById('calendar-month-year');
    if (!monthYearLabel) return;

    // Hide desktop grid, ensure mobile wrapper exists in same parent
    const desktopGrid = document.getElementById('calendar-container');
    if (desktopGrid) desktopGrid.style.display = 'none';

    let wrap = document.getElementById('cal-mobile-wrap');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'cal-mobile-wrap';
        wrap.className = 'cal-mobile-only';
        if (desktopGrid) desktopGrid.parentNode.insertBefore(wrap, desktopGrid.nextSibling);
        else document.body.appendChild(wrap);
    }
    wrap.style.display = '';

    const sessions  = await fetchCalendarSessions();
    const weekDays  = getMobileWeekDates(_mobileWeekOffset);
    const todayStr  = new Date().toISOString().split('T')[0];
    const weekStrs  = weekDays.map(d => d.toISOString().split('T')[0]);

    // Keep selected date in the visible week; fall back to today or first day
    if (!weekStrs.includes(_mobileSelectedDate)) {
        _mobileSelectedDate = weekStrs.includes(todayStr) ? todayStr : weekStrs[0];
    }

    // Update label → week range
    const first = weekDays[0], last = weekDays[6];
    const fmtA = first.toLocaleDateString('en-US', { month: 'short' });
    const fmtB = last.toLocaleDateString('en-US',  { month: 'short' });
    const year  = last.getFullYear();
    monthYearLabel.textContent = fmtA === fmtB
        ? `${first.getDate()} – ${last.getDate()} ${fmtA} ${year}`
        : `${first.getDate()} ${fmtA} – ${last.getDate()} ${fmtB} ${year}`;

    // ── Week strip ──
    const DAY_ABBRS = ['S','M','T','W','T','F','S'];
    const stripHtml = weekDays.map(d => {
        const ds         = d.toISOString().split('T')[0];
        const daySess    = sessions.filter(s => s.date === ds).sort((a,b)=>(a.startTime||'').localeCompare(b.startTime||''));
        const isActive   = ds === _mobileSelectedDate;
        const isToday    = ds === todayStr;
        const dotColor   = daySess.length > 0 ? getSessionDotColor(daySess[0].startTime) : '#e2e8f0';
        const cls        = ['mobile-day-pill', isActive ? 'active-pill' : '', isToday && !isActive ? 'today-pill' : ''].filter(Boolean).join(' ');
        return `
            <div class="${cls}" onclick="selectMobileDay('${ds}')">
                <span class="dp-abbr">${DAY_ABBRS[d.getDay()]}</span>
                <span class="dp-num">${d.getDate()}</span>
                <span class="mobile-day-dot" style="background:${dotColor};"></span>
            </div>`;
    }).join('');

    // ── Day detail panel ──
    const selSessions = sessions.filter(s => s.date === _mobileSelectedDate)
        .sort((a,b) => (a.startTime||'').localeCompare(b.startTime||''));
    const selDayObj = weekDays.find(d => d.toISOString().split('T')[0] === _mobileSelectedDate);
    const dayLabel  = selDayObj
        ? selDayObj.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })
        : '';

    const detailHtml = selSessions.length === 0
        ? `<div class="mobile-no-sessions"><i class="fas fa-calendar-day"></i>No sessions planned</div>`
        : selSessions.map(s => buildBubble(s, { extraStyle: 'white-space:normal;margin-bottom:7px;font-size:0.82rem;padding:9px 13px;border-radius:9px;' })).join('');

    wrap.innerHTML = `
        <div class="mobile-week-strip">${stripHtml}</div>
        <div class="mobile-day-panel">
            <div class="mobile-day-label">${dayLabel}</div>
            ${detailHtml}
        </div>`;
}

window.selectMobileDay = function (dateStr) {
    _mobileSelectedDate = dateStr;
    renderMobileCalendar();
};

// ─── Popup positioning ────────────────────────────────────────────────────────

function positionPopup(popup, anchorRect, popupH = 300) {
    const popupW = 300;
    if (anchorRect) {
        let left = Math.round(anchorRect.left);
        let top  = Math.round(anchorRect.bottom + 8);
        if (left + popupW > window.innerWidth - 12)  left = window.innerWidth - popupW - 12;
        if (top  + popupH > window.innerHeight)       top  = Math.round(anchorRect.top) - popupH - 8;
        popup.style.left = left + 'px';
        popup.style.top  = top  + 'px';
    } else {
        popup.style.left = '50%'; popup.style.top = '50%';
        popup.style.transform = 'translate(-50%,-50%)';
    }
}

// ─── Session detail popup ─────────────────────────────────────────────────────

async function showSessionPopup(event, sessionId) {
    if (event) event.stopPropagation();

    // Capture position BEFORE closing any existing popup (element may be removed from DOM)
    const anchorEl   = event ? (event.target.closest('.calendar-bubble') || event.target) : null;
    const anchorRect = anchorEl ? anchorEl.getBoundingClientRect() : null;

    closeCalPopup();

    const sessions = await fetchCalendarSessions();
    const session  = sessions.find(s => String(s.id || s._id || '') === String(sessionId));
    if (!session) { console.warn('Session not found:', sessionId); return; }

    const dateFormatted = session.date
        ? new Date(session.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        : 'No date set';

    const playerNames = session.playerIds && session.playerIds.length > 0
        ? session.playerIds.map(pid => getPlayerNameLocal(pid)).join(', ')
        : null;

    const objective = session.purpose || session.objectives || null;

    const rows = [
        playerNames
            ? `<div class="cal-popup-row"><i class="fas fa-user-circle"></i><span>${playerNames}</span></div>`
            : '',
        `<div class="cal-popup-row"><i class="fas fa-calendar-alt"></i><span>${dateFormatted}${session.startTime ? ' &nbsp;·&nbsp; ' + session.startTime : ''}</span></div>`,
        objective
            ? `<div class="cal-popup-row" style="align-items:flex-start;"><i class="fas fa-bullseye" style="margin-top:2px;"></i><span style="line-height:1.5;font-style:italic;max-height:80px;overflow-y:auto;">${objective}</span></div>`
            : '',
    ].filter(Boolean).join('');

    const popup = document.createElement('div');
    popup.className = 'cal-session-popup';
    popup.innerHTML = `
        <div class="cal-popup-head">
            <div class="cal-popup-head-title">${session.title || 'Untitled Session'}</div>
        </div>
        <div class="cal-popup-body">${rows || '<div class="cal-popup-row"><i class="fas fa-info-circle"></i><span>No details available.</span></div>'}</div>
        <div class="cal-popup-footer">
            <button class="cal-popup-btn ghost" onclick="closeCalPopup()">Close</button>
            <a class="cal-popup-btn primary" href="library.html?view=${sessionId}"
               style="display:flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;">
                <i class="fas fa-eye" style="font-size:0.75rem;"></i> View
            </a>
            <button class="cal-popup-btn danger" onclick="deleteCalSession('${sessionId}')" title="Delete session">
                <i class="fas fa-trash" style="font-size:0.75rem;"></i>
            </button>
        </div>
    `;

    document.body.appendChild(popup);
    _activeCalPopup = popup;
    positionPopup(popup, anchorRect, 280);
}

window.showSessionPopup = showSessionPopup;

// ─── Day-view overflow popup ──────────────────────────────────────────────────

window.showDayPopup = async function (event, dateStr) {
    if (event) event.stopPropagation();
    const anchorEl   = event ? (event.target.closest('.cal-more-btn') || event.target) : null;
    const anchorRect = anchorEl ? anchorEl.getBoundingClientRect() : null;
    closeCalPopup();

    const sessions    = await fetchCalendarSessions();
    const daySessions = sessions.filter(s => s.date === dateStr)
        .sort((a,b) => (a.startTime||'').localeCompare(b.startTime||''));
    if (!daySessions.length) return;

    const dateFormatted = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric'
    });

    const popup = document.createElement('div');
    popup.className = 'cal-session-popup';
    popup.innerHTML = `
        <div class="cal-popup-head">
            <div class="cal-popup-head-title">${dateFormatted}</div>
            <div class="cal-popup-head-sub">${daySessions.length} session${daySessions.length!==1?'s':''} scheduled</div>
        </div>
        <div class="cal-popup-body" style="max-height:240px;overflow-y:auto;padding-top:10px;">
            ${daySessions.map(s => buildBubble(s, { extraStyle: 'margin-bottom:5px;white-space:normal;' })).join('')}
        </div>
        <div class="cal-popup-footer">
            <button class="cal-popup-btn ghost" onclick="closeCalPopup()" style="flex:none;padding:8px 24px;">Close</button>
        </div>`;

    document.body.appendChild(popup);
    _activeCalPopup = popup;
    positionPopup(popup, anchorRect, 340);
};

// ─── Month / week navigation ──────────────────────────────────────────────────

window.changeMonth = (delta) => {
    _calSessionsCache = null;
    if (isMobileMode()) {
        _mobileWeekOffset += delta;
        renderMobileCalendar();
    } else {
        currentMonth += delta;
        if (currentMonth > 11) { currentMonth = 0; currentYear++; }
        else if (currentMonth < 0) { currentMonth = 11; currentYear--; }
        renderCalendar();
    }
};

// ─── Player name resolver ─────────────────────────────────────────────────────

function getPlayerNameLocal(pid) {
    if (window.squadManager && squadManager.players) {
        const p = squadManager.players.find(x => x.id === pid);
        return p ? p.name : 'Unknown Player';
    }
    return 'Player ' + pid;
}

// ─── Backward compat ──────────────────────────────────────────────────────────

async function viewSessionDetails(sessionId) { return showSessionPopup(null, sessionId); }

window.closeSessionDetailModal = () => {
    const modal = document.getElementById('session-detail-modal');
    if (modal) modal.classList.remove('active');
    closeCalPopup();
};

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const init = () => {
        _calSessionsCache = null;
        renderCalendarDispatch();
    };
    if (window.squadManager) squadManager.init().then(init);
    else init();
});

// Re-render on resize (debounced) so switching orientations/breakpoints updates layout
let _resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
        _calSessionsCache = null;
        renderCalendarDispatch();
    }, 250);
});
