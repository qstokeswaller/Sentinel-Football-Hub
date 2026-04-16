/**
 * Training Calendar UI Component
 * Renders a monthly calendar with color-coded session bubbles and custom events.
 * Uses Supabase for both sessions and calendar_events data.
 */
import supabase from '../supabase.js';

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let _calSessionsCache = null;
let _calEventsCache = null;
let _calMatchesCache = null;
let _squadNameMap = null;
let _activeCalPopup = null;
let _selectedEventColor = '#00C49A';
let _clubId = null;
let _onSessionClickOverride = null;

// Mobile calendar state
let _mobileCalExpanded = false;   // false=week strip, true=full month
let _selectedDate = null;         // currently selected date string (YYYY-MM-DD)
let _mobileWeekStart = null;      // Date object for start of displayed week

// Team → color map for sessions
const TEAM_COLOR_MAP = {
    'u13': 'teal', 'u14': 'pink', 'u15': 'green', 'u17': 'purple',
    'u19': 'blue', 'u21': 'purple', 'senior': 'navy', 'elite': 'green',
    'first team': 'orange', 'varsity': 'navy'
};
const TEAM_COLORS = {
    blue: 'bubble-team-blue', green: 'bubble-team-green', purple: 'bubble-team-purple',
    orange: 'bubble-team-orange', red: 'bubble-team-red', navy: 'bubble-team-navy',
    teal: 'bubble-team-teal', pink: 'bubble-team-pink', default: 'bubble-team-default'
};

function getTeamColorClass(teamName) {
    if (!teamName) return TEAM_COLORS.default;
    const normalized = teamName.toLowerCase().trim();
    for (const [key, color] of Object.entries(TEAM_COLOR_MAP)) {
        if (normalized.includes(key)) return TEAM_COLORS[color] || TEAM_COLORS.default;
    }
    return TEAM_COLORS.default;
}

function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Inject styles
function injectCalendarStyles() {
    if (document.getElementById('cal-popup-style')) return;
    const style = document.createElement('style');
    style.id = 'cal-popup-style';
    style.textContent = `
        .calendar-bubble {
            position: relative; cursor: pointer; padding: 3px 7px; border-radius: 6px;
            font-size: 0.7rem; font-weight: 600; margin-bottom: 3px; white-space: nowrap;
            overflow: hidden; text-overflow: ellipsis; max-width: 100%; transition: filter 0.15s;
            display: block; color: #fff;
        }
        .calendar-bubble:hover { filter: brightness(0.9); }
        .cal-session-popup {
            position: fixed; z-index: 9999; min-width: 230px; max-width: 320px; width: max-content;
            background: #fff; border: 1px solid #e2e8f0; border-radius: 14px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.18); overflow: hidden; animation: calPopIn 0.15s ease;
        }
        @keyframes calPopIn {
            from { opacity: 0; transform: translateY(-8px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .cal-popup-head {
            background: linear-gradient(135deg, #00C49A 0%, #00a882 100%);
            color: white; padding: 14px 16px;
        }
        .cal-popup-head-title { font-size: 0.95rem; font-weight: 700; line-height: 1.3; margin: 0 0 3px; }
        .cal-popup-head-date { font-size: 0.75rem; opacity: 0.85; }
        .cal-popup-body { padding: 12px 16px 8px; }
        .cal-popup-row {
            display: flex; align-items: flex-start; gap: 9px; font-size: 0.8rem;
            color: #475569; margin-bottom: 8px; line-height: 1.4;
        }
        .cal-popup-row i { color: #00C49A; width: 14px; text-align: center; flex-shrink: 0; margin-top: 1px; }
        .cal-popup-footer { padding: 6px 16px 13px; display: flex; gap: 8px; }
        .cal-popup-btn {
            flex: 1; padding: 8px 0; border-radius: 9px; border: none; cursor: pointer;
            font-size: 0.8rem; font-weight: 600; transition: all 0.15s;
        }
        .cal-popup-btn.primary { background: #00C49A; color: white; }
        .cal-popup-btn.primary:hover { background: #00a882; }
        .cal-popup-btn.ghost { background: #f1f5f9; color: #64748b; }
        .cal-popup-btn.ghost:hover { background: #e2e8f0; }
        .cal-popup-btn.danger { background: #fee2e2; color: #ef4444; }
        .cal-popup-btn.danger:hover { background: #fecaca; }
        .cal-color-swatch {
            width: 28px; height: 28px; border-radius: 50%; border: 3px solid transparent;
            cursor: pointer; transition: all 0.15s; padding: 0;
        }
        .cal-color-swatch:hover { transform: scale(1.15); }
        .cal-color-swatch.active { border-color: #1e293b; box-shadow: 0 0 0 2px #fff, 0 0 0 4px #1e293b; }
    `;
    document.head.appendChild(style);
}

function closeCalPopup() {
    if (_activeCalPopup) { _activeCalPopup.remove(); _activeCalPopup = null; }
}

// --- Data Fetching ---

async function fetchCalendarSessions() {
    if (_calSessionsCache) return _calSessionsCache;
    try {
        const clubId = getClubId() || await fetchClubId();
        // Date window: 3 months back, 6 months forward
        const from = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
        const to = new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0];
        let query = supabase
            .from('sessions')
            .select('id, title, date, start_time, duration, venue, team, author, purpose, player_ids')
            .gte('date', from).lte('date', to)
            .order('date', { ascending: true })
            .limit(500);
        if (clubId) query = query.eq('club_id', clubId);
        const { data, error } = await query;
        if (error) throw error;
        _calSessionsCache = (data || []).map(s => ({
            id: s.id, title: s.title, date: s.date, startTime: s.start_time,
            duration: s.duration, venue: s.venue, team: s.team, author: s.author,
            purpose: s.purpose, playerIds: s.player_ids || [], _type: 'session'
        }));
        return _calSessionsCache;
    } catch (err) {
        console.error('Error fetching calendar sessions:', err);
        return [];
    }
}

async function fetchCalendarEvents() {
    if (_calEventsCache) return _calEventsCache;
    try {
        const clubId = getClubId() || await fetchClubId();
        // Date window: 3 months back, 6 months forward
        const from = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
        const to = new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0];
        let query = supabase
            .from('calendar_events')
            .select('*')
            .gte('date', from).lte('date', to)
            .order('date', { ascending: true })
            .limit(500);
        if (clubId) query = query.eq('club_id', clubId);
        const { data, error } = await query;
        if (error) throw error;
        _calEventsCache = (data || []).map(e => ({
            id: e.id, title: e.title, eventType: e.event_type, date: e.date,
            startTime: e.start_time, endTime: e.end_time, location: e.location,
            description: e.description, color: e.color, _type: 'event'
        }));
        return _calEventsCache;
    } catch (err) {
        console.error('Error fetching calendar events:', err);
        return [];
    }
}

async function fetchCalendarMatches() {
    if (_calMatchesCache) return _calMatchesCache;
    try {
        const clubId = getClubId() || await fetchClubId();
        // Date window: 3 months back, 6 months forward
        const from = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
        const to = new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0];
        let query = supabase
            .from('matches')
            .select('id, squad_id, date, time, opponent, venue, competition, home_team, away_team, our_side, is_past, home_score, away_score, match_type, watched_player_id')
            .gte('date', from).lte('date', to)
            .order('date', { ascending: true })
            .limit(500);
        if (clubId) query = query.eq('club_id', clubId);

        // Coach scoping: use pre-fetched squad IDs from page-init (avoids redundant DB call)
        // null = admin (no filtering), array = coach (filter to assigned squads)
        const coachSquadIds = window._coachSquadIds;
        if (Array.isArray(coachSquadIds)) {
            if (coachSquadIds.length > 0) {
                query = query.in('squad_id', coachSquadIds);
            } else {
                // Coach with zero squad assignments — return empty
                _calMatchesCache = [];
                return _calMatchesCache;
            }
        }

        const { data, error } = await query;
        if (error) throw error;

        // Fetch squad names if not cached
        if (!_squadNameMap) {
            const sQuery = supabase.from('squads').select('id, name');
            if (clubId) sQuery.eq('club_id', clubId);
            const { data: squads } = await sQuery;
            _squadNameMap = {};
            (squads || []).forEach(s => { _squadNameMap[s.id] = s.name; });
        }

        // Resolve watched player names for player_watch matches
        const watchedPlayerIds = (data || []).filter(m => m.match_type === 'player_watch' && m.watched_player_id).map(m => m.watched_player_id);
        let playerNameMap = {};
        if (watchedPlayerIds.length > 0) {
            const { data: players } = await supabase.from('players').select('id, name').in('id', watchedPlayerIds);
            (players || []).forEach(p => { playerNameMap[p.id] = p.name; });
        }

        _calMatchesCache = (data || []).map(m => ({
            id: m.id, squadId: m.squad_id, date: m.date, time: m.time,
            opponent: m.opponent, venue: m.venue, competition: m.competition,
            homeTeam: m.home_team, awayTeam: m.away_team, ourSide: m.our_side || 'home',
            isPast: m.is_past, homeScore: m.home_score, awayScore: m.away_score,
            matchType: m.match_type || 'team',
            watchedPlayerId: m.watched_player_id,
            watchedPlayerName: playerNameMap[m.watched_player_id] || '',
            squadName: _squadNameMap[m.squad_id] || 'Unknown',
            _type: 'match'
        }));
        return _calMatchesCache;
    } catch (err) {
        console.error('Error fetching calendar matches:', err);
        return [];
    }
}

function getClubId() {
    // Impersonation takes priority (super_admin viewing another club)
    const imp = sessionStorage.getItem('impersonating_club_id');
    if (imp) return imp;
    // Fall back to logged-in user's club_id from cached profile
    return _clubId || window._profile?.club_id || null;
}

async function fetchClubId() {
    if (_clubId) return _clubId;
    const imp = sessionStorage.getItem('impersonating_club_id');
    if (imp) { _clubId = imp; return imp; }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        const { data: profile } = await supabase
            .from('profiles').select('club_id').eq('id', user.id).single();
        _clubId = profile?.club_id || null;
    }
    return _clubId;
}

// --- Rendering ---

function _isMobileView() { return window.innerWidth <= 768; }

async function renderCalendar() {
    const container = document.getElementById('calendar-container');
    const monthYearLabel = document.getElementById('calendar-month-year');
    if (!container || !monthYearLabel) return;

    if (_isMobileView()) {
        await _renderMobileCalendar(container, monthYearLabel);
    } else {
        await _renderDesktopCalendar(container, monthYearLabel);
    }
}

// ── Desktop: full month grid (unchanged) ──
async function _renderDesktopCalendar(container, monthYearLabel) {
    const [sessions, events, matches] = await Promise.all([fetchCalendarSessions(), fetchCalendarEvents(), fetchCalendarMatches()]);

    const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(currentYear, currentMonth));
    monthYearLabel.textContent = `${monthName} ${currentYear}`;

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();

    let html = '';
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(day => {
        html += `<div class="calendar-day-header">${day}</div>`;
    });

    // Shift firstDay so Monday=0, Sunday=6
    const firstDayMon = (firstDay + 6) % 7;
    for (let i = firstDayMon; i > 0; i--) {
        html += `<div class="calendar-day other-month"><div class="calendar-date-num">${prevMonthLastDay - i + 1}</div></div>`;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = todayStr === dateStr;

        const daySessions = sessions.filter(s => s.date === dateStr);
        const sessionBubbles = daySessions.map(s => {
            const timeStr = s.startTime || '--:--';
            const teamStr = s.team || 'No Team';
            const label = `[${timeStr}] ${teamStr}`;
            const sid = String(s.id).replace(/'/g, '');
            const clickHandler = _onSessionClickOverride
                ? `window._onRegisterSessionClick(event,'${sid}')`
                : `window._showSessionPopup(event,'${sid}')`;
            return `<div class="calendar-bubble ${getTeamColorClass(s.team)}" data-session-id="${sid}" onclick="${clickHandler}" title="${escHtml(s.title || 'Session')}">${escHtml(label)}</div>`;
        });

        const dayEvents = events.filter(e => e.date === dateStr);
        const eventBubbles = dayEvents.map(e => {
            const timeStr = e.startTime || '';
            const label = timeStr ? `[${timeStr}] ${e.title}` : e.title;
            const eid = String(e.id).replace(/'/g, '');
            return `<div class="calendar-bubble" style="background:${e.color || '#64748b'}" onclick="window._showEventPopup(event,'${eid}')" title="${escHtml(e.eventType + ': ' + e.title)}">${escHtml(label)}</div>`;
        });

        const dayMatches = matches.filter(m => m.date === dateStr);
        const matchBubbles = dayMatches.map(m => {
            const mid = String(m.id).replace(/'/g, '');
            const isResult = m.isPast && (m.homeScore != null || m.awayScore != null);
            const isWatch = m.matchType === 'player_watch';
            const icon = isWatch ? 'fa-eye' : (isResult ? 'fa-flag-checkered' : 'fa-futbol');
            const bubbleColor = isWatch ? 'bubble-team-purple' : 'bubble-team-red';
            const opp = m.opponent || '';
            const timeStr = m.time || '';
            let label;
            if (isWatch) {
                const pName = m.watchedPlayerName || 'Player';
                label = isResult
                    ? `${pName} ${m.homeScore}-${m.awayScore}`
                    : (timeStr ? `[${timeStr}] ${pName}` : pName);
                if (opp) label += ` @ ${opp}`;
            } else {
                label = isResult
                    ? `${m.squadName} ${m.homeScore}-${m.awayScore} ${opp}`.trim()
                    : (timeStr ? `[${timeStr}] ${m.squadName} vs ${opp}`.trim() : `${m.squadName} vs ${opp}`.trim());
            }
            return `<div class="calendar-bubble ${bubbleColor}" onclick="window._showMatchPopup(event,'${mid}')" title="${escHtml(label)}"><i class="fas ${icon}" style="font-size:9px;margin-right:3px;"></i>${escHtml(label)}</div>`;
        });

        // Combine all bubbles, show max 3 then "+N more"
        const allBubbles = [...sessionBubbles, ...eventBubbles, ...matchBubbles];
        const MAX_VISIBLE = 3;
        let bubblesHtml;
        if (allBubbles.length <= MAX_VISIBLE) {
            bubblesHtml = allBubbles.join('');
        } else {
            bubblesHtml = allBubbles.slice(0, MAX_VISIBLE).join('');
            const moreCount = allBubbles.length - MAX_VISIBLE;
            bubblesHtml += `<div class="calendar-more-link" onclick="window._showDayOverflow(event,'${dateStr}')">+${moreCount} more</div>`;
        }

        html += `
            <div class="calendar-day ${isToday ? 'today' : ''}">
                <div class="calendar-date-num">${d}</div>
                <div class="calendar-bubbles-container">${bubblesHtml}</div>
            </div>`;
    }

    const remainingDays = (7 - (firstDayMon + daysInMonth) % 7) % 7;
    for (let i = 1; i <= remainingDays; i++) {
        html += `<div class="calendar-day other-month"><div class="calendar-date-num">${i}</div></div>`;
    }

    container.className = 'calendar-grid-container';
    container.innerHTML = html;
}

// ── Mobile: hybrid week-strip / month + detail panel ──

function _getWeekDays(refDate) {
    const d = new Date(refDate);
    const day = (d.getDay() + 6) % 7; // 0=Mon, 6=Sun
    const start = new Date(d);
    start.setDate(d.getDate() - day); // Monday
    const days = [];
    for (let i = 0; i < 7; i++) {
        const dd = new Date(start);
        dd.setDate(start.getDate() + i);
        days.push(dd);
    }
    return days;
}

function _fmtDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _dayHasItems(dateStr, sessions, events, matches) {
    return sessions.some(s => s.date === dateStr) || events.some(e => e.date === dateStr) || (matches || []).some(m => m.date === dateStr);
}

function _countDayItems(dateStr, sessions, events, matches) {
    return sessions.filter(s => s.date === dateStr).length + events.filter(e => e.date === dateStr).length + (matches || []).filter(m => m.date === dateStr).length;
}

async function _renderMobileCalendar(container, monthYearLabel) {
    const [sessions, events, matches] = await Promise.all([fetchCalendarSessions(), fetchCalendarEvents(), fetchCalendarMatches()]);

    const today = new Date();
    const todayStr = _fmtDateStr(today);

    // Default selected date to today (within current month) or 1st of month
    if (!_selectedDate) {
        if (currentMonth === today.getMonth() && currentYear === today.getFullYear()) {
            _selectedDate = todayStr;
        } else {
            _selectedDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
        }
    }

    // Compute week containing the selected date
    const selDateObj = new Date(_selectedDate + 'T12:00:00');
    if (!_mobileWeekStart || selDateObj < _mobileWeekStart || selDateObj >= new Date(_mobileWeekStart.getTime() + 7 * 86400000)) {
        _mobileWeekStart = new Date(selDateObj);
        _mobileWeekStart.setDate(selDateObj.getDate() - ((selDateObj.getDay() + 6) % 7));
    }

    const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(currentYear, currentMonth));
    monthYearLabel.textContent = `${monthName} ${currentYear}`;

    container.className = 'mcal-container';
    const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    let html = '';

    // Toggle button for expand/collapse
    html += `<div class="mcal-toggle-row">
        <button class="mcal-toggle-btn" onclick="window._toggleMobileCalExpand()">
            <i class="fas fa-chevron-${_mobileCalExpanded ? 'up' : 'down'}"></i>
            ${_mobileCalExpanded ? 'Week view' : 'Month view'}
        </button>
    </div>`;

    if (_mobileCalExpanded) {
        // ── Full month grid (dots only, no bubbles) ──
        html += `<div class="mcal-month-grid">`;
        dayNames.forEach(d => { html += `<div class="mcal-day-header">${d}</div>`; });

        const firstDayRaw = new Date(currentYear, currentMonth, 1).getDay();
        const firstDayMon = (firstDayRaw + 6) % 7; // Mon=0, Sun=6
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const prevLast = new Date(currentYear, currentMonth, 0).getDate();

        for (let i = firstDayMon; i > 0; i--) {
            html += `<div class="mcal-day other-month"><span class="mcal-date-num">${prevLast - i + 1}</span></div>`;
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === _selectedDate;
            const count = _countDayItems(dateStr, sessions, events, matches);
            const dots = count > 0 ? `<div class="mcal-dots">${'<span class="mcal-dot"></span>'.repeat(Math.min(count, 3))}</div>` : '';

            html += `<div class="mcal-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}" onclick="window._selectMobileDate('${dateStr}')">
                <span class="mcal-date-num">${d}</span>${dots}
            </div>`;
        }

        const remaining = (7 - (firstDayMon + daysInMonth) % 7) % 7;
        for (let i = 1; i <= remaining; i++) {
            html += `<div class="mcal-day other-month"><span class="mcal-date-num">${i}</span></div>`;
        }

        html += `</div>`;

    } else {
        // ── Week strip ──
        const weekDays = _getWeekDays(_mobileWeekStart);

        html += `<div class="mcal-week-nav">
            <button class="mcal-week-arrow" onclick="window._shiftMobileWeek(-1)"><i class="fas fa-chevron-left"></i></button>
            <div class="mcal-week-strip">`;

        weekDays.forEach(d => {
            const dateStr = _fmtDateStr(d);
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === _selectedDate;
            const inMonth = d.getMonth() === currentMonth && d.getFullYear() === currentYear;
            const count = _countDayItems(dateStr, sessions, events, matches);
            const dots = count > 0 ? `<div class="mcal-dots">${'<span class="mcal-dot"></span>'.repeat(Math.min(count, 3))}</div>` : '';

            html += `<div class="mcal-week-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${!inMonth ? ' other-month' : ''}" onclick="window._selectMobileDate('${dateStr}')">
                <span class="mcal-wday-label">${dayNames[(d.getDay() + 6) % 7]}</span>
                <span class="mcal-wday-num">${d.getDate()}</span>
                ${dots}
            </div>`;
        });

        html += `</div>
            <button class="mcal-week-arrow" onclick="window._shiftMobileWeek(1)"><i class="fas fa-chevron-right"></i></button>
        </div>`;
    }

    // ── Detail panel for selected date ──
    const selDate = new Date(_selectedDate + 'T12:00:00');
    const dateLabel = selDate.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });

    const daySessions = sessions.filter(s => s.date === _selectedDate);
    const dayEvents = events.filter(e => e.date === _selectedDate);
    const dayMatches = matches.filter(m => m.date === _selectedDate);

    html += `<div class="mcal-detail-panel">
        <div class="mcal-detail-date">${dateLabel}</div>`;

    if (daySessions.length === 0 && dayEvents.length === 0 && dayMatches.length === 0) {
        html += `<div class="mcal-detail-empty"><i class="fas fa-calendar-day"></i> No sessions, events or fixtures</div>`;
    } else {
        // Matches (fixtures first — most time-sensitive)
        dayMatches.forEach(m => {
            const mid = String(m.id).replace(/'/g, '');
            const isWatch = m.matchType === 'player_watch';
            const colorClass = isWatch ? 'bubble-team-purple' : 'bubble-team-red';
            const icon = isWatch ? 'fa-eye' : 'fa-futbol';
            let title, sub;
            if (isWatch) {
                const pName = m.watchedPlayerName || 'Player';
                title = m.opponent ? `${pName} @ ${escHtml(m.opponent)}` : pName;
                sub = 'Player Watch';
            } else {
                title = `${escHtml(m.squadName)} ${m.opponent ? 'vs ' + escHtml(m.opponent) : ''}`;
                sub = escHtml(m.competition || 'Fixture');
            }
            html += `<div class="mcal-detail-row" onclick="window._showMatchPopup(event,'${mid}')">
                <div class="mcal-detail-color ${colorClass}"></div>
                <div class="mcal-detail-info">
                    <div class="mcal-detail-time"><i class="fas ${icon}" style="font-size:10px;margin-right:4px;"></i>${m.time || 'TBC'}</div>
                    <div class="mcal-detail-title">${title}</div>
                    <div class="mcal-detail-sub">${sub}</div>
                </div>
                <i class="fas fa-chevron-right mcal-detail-arrow"></i>
            </div>`;
        });

        // Sessions
        daySessions.forEach(s => {
            const sid = String(s.id).replace(/'/g, '');
            const colorClass = getTeamColorClass(s.team);
            const clickHandler = _onSessionClickOverride
                ? `window._onRegisterSessionClick(event,'${sid}')`
                : `window._showSessionPopup(event,'${sid}')`;

            html += `<div class="mcal-detail-row" data-session-id="${sid}" onclick="${clickHandler}">
                <div class="mcal-detail-color ${colorClass}"></div>
                <div class="mcal-detail-info">
                    <div class="mcal-detail-time">${s.startTime || '--:--'}${s.duration ? ' \u2022 ' + s.duration + ' min' : ''}</div>
                    <div class="mcal-detail-title">${escHtml(s.team || 'No Team')}</div>
                    <div class="mcal-detail-sub">${escHtml(s.title || '')}</div>
                </div>
                <i class="fas fa-chevron-right mcal-detail-arrow"></i>
            </div>`;
        });

        // Events
        dayEvents.forEach(e => {
            const eid = String(e.id).replace(/'/g, '');
            html += `<div class="mcal-detail-row" onclick="window._showEventPopup(event,'${eid}')">
                <div class="mcal-detail-color" style="background:${e.color || '#64748b'}"></div>
                <div class="mcal-detail-info">
                    <div class="mcal-detail-time">${e.startTime || ''}${e.endTime ? ' \u2013 ' + e.endTime : ''}</div>
                    <div class="mcal-detail-title">${escHtml(e.title)}</div>
                    <div class="mcal-detail-sub">${escHtml(e.eventType)}</div>
                </div>
                <i class="fas fa-chevron-right mcal-detail-arrow"></i>
            </div>`;
        });
    }

    html += `</div>`;
    container.innerHTML = html;
}

// ── Mobile calendar interactions ──

function selectMobileDate(dateStr) {
    _selectedDate = dateStr;
    // If tapped date is in a different month, switch to it
    const d = new Date(dateStr + 'T12:00:00');
    if (d.getMonth() !== currentMonth || d.getFullYear() !== currentYear) {
        currentMonth = d.getMonth();
        currentYear = d.getFullYear();
        _calSessionsCache = null;
        _calEventsCache = null;
        _calMatchesCache = null;
    }
    renderCalendar();
}

function shiftMobileWeek(delta) {
    if (!_mobileWeekStart) _mobileWeekStart = new Date();
    _mobileWeekStart.setDate(_mobileWeekStart.getDate() + delta * 7);
    // Update selected date to first day of new week if current selection is out of range
    const selD = new Date(_selectedDate + 'T12:00:00');
    const weekEnd = new Date(_mobileWeekStart.getTime() + 7 * 86400000);
    if (selD < _mobileWeekStart || selD >= weekEnd) {
        _selectedDate = _fmtDateStr(_mobileWeekStart);
    }
    // If week crosses month boundary, update month/year for the header
    const mid = new Date(_mobileWeekStart.getTime() + 3 * 86400000);
    if (mid.getMonth() !== currentMonth || mid.getFullYear() !== currentYear) {
        currentMonth = mid.getMonth();
        currentYear = mid.getFullYear();
        _calSessionsCache = null;
        _calEventsCache = null;
        _calMatchesCache = null;
    }
    renderCalendar();
}

function toggleMobileCalExpand() {
    _mobileCalExpanded = !_mobileCalExpanded;
    renderCalendar();
}

// --- Popup positioning helper ---

function positionPopup(popup, event) {
    const triggerEl = event ? (event.target.closest('.calendar-bubble') || event.target.closest('.mcal-detail-row') || event.target) : null;

    if (_isMobileView()) {
        // Mobile: center popup as a bottom-sheet style overlay
        popup.style.left = '50%';
        popup.style.bottom = '16px';
        popup.style.top = 'auto';
        popup.style.transform = 'translateX(-50%)';
        popup.style.width = 'calc(100% - 32px)';
        popup.style.maxWidth = '400px';
        return;
    }

    if (triggerEl) {
        const rect = triggerEl.getBoundingClientRect();
        const popupW = 270;
        let left = Math.round(rect.left);
        let top = Math.round(rect.bottom + 8);
        if (left + popupW > window.innerWidth - 12) left = window.innerWidth - popupW - 12;
        if (left < 12) left = 12;
        if (top + 280 > window.innerHeight) top = Math.round(rect.top) - 290;
        popup.style.left = left + 'px';
        popup.style.top = top + 'px';
    } else {
        popup.style.left = '50%';
        popup.style.top = '50%';
        popup.style.transform = 'translate(-50%, -50%)';
    }
}

// --- Session Popup ---

async function showSessionPopup(event, sessionId) {
    if (event) event.stopPropagation();
    closeCalPopup();

    const sessions = await fetchCalendarSessions();
    const session = sessions.find(s => String(s.id) === String(sessionId));
    if (!session) return;

    const dateFormatted = session.date
        ? new Date(session.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        : 'No date set';

    const rows = [
        session.team ? `<div class="cal-popup-row" style="color:var(--primary);font-weight:700;background:rgba(0,196,154,0.05);padding:6px 10px;border-radius:8px;margin-bottom:12px;"><i class="fas fa-users"></i>Team: ${escHtml(session.team)}</div>` : '',
        session.startTime ? `<div class="cal-popup-row"><i class="fas fa-clock"></i><strong>Time:</strong> ${session.startTime}${session.duration ? ' (' + session.duration + ' min)' : ''}</div>` : '',
        session.venue ? `<div class="cal-popup-row"><i class="fas fa-map-marker-alt"></i><strong>Venue:</strong> ${escHtml(session.venue)}</div>` : '',
        session.author ? `<div class="cal-popup-row"><i class="fas fa-user"></i><strong>Coach:</strong> ${escHtml(session.author)}</div>` : '',
        session.purpose ? `<div class="cal-popup-row" style="margin-top:8px;"><i class="fas fa-bullseye"></i><strong>Objectives:</strong><br><span style="flex:1;display:block;padding-top:4px;max-height:100px;overflow-y:auto;line-height:1.5;font-style:italic;">${escHtml(session.purpose)}</span></div>` : '',
    ].filter(Boolean).join('');

    const popup = document.createElement('div');
    popup.className = 'cal-session-popup';
    popup.innerHTML = `
        <div class="cal-popup-head">
            <div class="cal-popup-head-title">${escHtml(session.title || 'Untitled Session')}</div>
            <div class="cal-popup-head-date">${dateFormatted}</div>
        </div>
        <div class="cal-popup-body">${rows || '<div class="cal-popup-row"><i class="fas fa-info-circle"></i>No additional details.</div>'}</div>
        <div class="cal-popup-footer">
            <button class="cal-popup-btn ghost" onclick="window._closeCalPopup()">Close</button>
            <button class="cal-popup-btn ghost" onclick="window._shareCalSession('${sessionId}')"><i class="fas fa-share-alt"></i> Share</button>
            <button class="cal-popup-btn primary" onclick="window.location.href='planner.html?load=${sessionId}'">View Plan</button>
        </div>
    `;

    document.body.appendChild(popup);
    _activeCalPopup = popup;
    positionPopup(popup, event);
}

// --- Event Popup ---

async function showEventPopup(event, eventId) {
    if (event) event.stopPropagation();
    closeCalPopup();

    const events = await fetchCalendarEvents();
    const evt = events.find(e => String(e.id) === String(eventId));
    if (!evt) return;

    const dateFormatted = evt.date
        ? new Date(evt.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        : 'No date set';

    const rows = [
        `<div class="cal-popup-row" style="color:${evt.color || '#64748b'};font-weight:700;background:${evt.color || '#64748b'}15;padding:6px 10px;border-radius:8px;margin-bottom:12px;"><i class="fas fa-tag"></i>${escHtml(evt.eventType)}</div>`,
        evt.startTime ? `<div class="cal-popup-row"><i class="fas fa-clock"></i><strong>Time:</strong> ${evt.startTime}${evt.endTime ? ' – ' + evt.endTime : ''}</div>` : '',
        evt.location ? `<div class="cal-popup-row"><i class="fas fa-map-marker-alt"></i><strong>Location:</strong> ${escHtml(evt.location)}</div>` : '',
        evt.description ? `<div class="cal-popup-row"><i class="fas fa-align-left"></i><span style="flex:1;line-height:1.5;">${escHtml(evt.description)}</span></div>` : '',
    ].filter(Boolean).join('');

    const popup = document.createElement('div');
    popup.className = 'cal-session-popup';
    popup.innerHTML = `
        <div class="cal-popup-head" style="background:linear-gradient(135deg, ${evt.color || '#64748b'} 0%, ${evt.color || '#64748b'}dd 100%);">
            <div class="cal-popup-head-title">${escHtml(evt.title)}</div>
            <div class="cal-popup-head-date">${dateFormatted}</div>
        </div>
        <div class="cal-popup-body">${rows}</div>
        <div class="cal-popup-footer">
            <button class="cal-popup-btn ghost" onclick="window._closeCalPopup()">Close</button>
            <button class="cal-popup-btn danger" onclick="window._deleteEvent('${eventId}')"><i class="fas fa-trash-alt" style="margin-right:4px;"></i>Delete</button>
        </div>
    `;

    document.body.appendChild(popup);
    _activeCalPopup = popup;
    positionPopup(popup, event);
}

// --- Add Event Modal ---

function openAddEvent() {
    const modal = document.getElementById('modalAddEvent');
    if (!modal) return;
    // Reset form
    document.getElementById('eventTypeSelect').value = 'Staff Meeting';
    document.getElementById('eventCustomTitleGroup').style.display = 'none';
    document.getElementById('eventCustomTitle').value = '';
    document.getElementById('eventDate').value = '';
    document.getElementById('eventStartTime').value = '';
    document.getElementById('eventEndTime').value = '';
    document.getElementById('eventLocation').value = '';
    document.getElementById('eventDescription').value = '';
    _selectedEventColor = '#00C49A';
    document.querySelectorAll('.cal-color-swatch').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.color === _selectedEventColor);
    });
    modal.classList.add('active');
}

function closeEventModal() {
    const modal = document.getElementById('modalAddEvent');
    if (modal) modal.classList.remove('active');
}

function onEventTypeChange() {
    const val = document.getElementById('eventTypeSelect').value;
    document.getElementById('eventCustomTitleGroup').style.display = val === 'Custom' ? '' : 'none';
}

function pickEventColor(btn) {
    _selectedEventColor = btn.dataset.color;
    document.querySelectorAll('.cal-color-swatch').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.color === _selectedEventColor);
    });
}

async function saveEvent() {
    const typeVal = document.getElementById('eventTypeSelect').value;
    const customTitle = document.getElementById('eventCustomTitle').value.trim();
    const date = document.getElementById('eventDate').value;
    const startTime = document.getElementById('eventStartTime').value;
    const endTime = document.getElementById('eventEndTime').value;
    const location = document.getElementById('eventLocation').value.trim();
    const description = document.getElementById('eventDescription').value.trim();

    const title = typeVal === 'Custom' ? (customTitle || 'Custom Event') : typeVal;

    if (!date) {
        alert('Please select a date.');
        return;
    }

    const clubId = await getClubId();
    if (!clubId) {
        alert('Could not determine club. Please try again.');
        return;
    }

    const btn = document.getElementById('btnSaveEvent');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:6px;"></i> Saving...';

    try {
        const { error } = await supabase.from('calendar_events').insert({
            club_id: clubId,
            title,
            event_type: typeVal === 'Custom' ? 'Custom' : typeVal,
            date,
            start_time: startTime || null,
            end_time: endTime || null,
            location: location || null,
            description: description || null,
            color: _selectedEventColor
        });

        if (error) throw error;

        _calEventsCache = null; // Invalidate cache
        closeEventModal();
        renderCalendar();
    } catch (err) {
        console.error('Error saving event:', err);
        alert('Failed to save event. Please try again.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check" style="margin-right:6px;"></i> Save Event';
    }
}

async function deleteEvent(eventId) {
    if (!confirm('Delete this event?')) return;
    try {
        const { error } = await supabase.from('calendar_events').delete().eq('id', eventId);
        if (error) throw error;
        _calEventsCache = null;
        closeCalPopup();
        renderCalendar();
    } catch (err) {
        console.error('Error deleting event:', err);
        alert('Failed to delete event.');
    }
}

// --- Match Popup ---

async function showMatchPopup(event, matchId) {
    if (event) event.stopPropagation();
    closeCalPopup();

    const matches = await fetchCalendarMatches();
    const match = matches.find(m => String(m.id) === String(matchId));
    if (!match) return;

    const dateFormatted = match.date
        ? new Date(match.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        : 'No date set';

    const isResult = match.isPast && (match.homeScore != null || match.awayScore != null);
    const isWatch = match.matchType === 'player_watch';
    const headColor = isWatch ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
    const accentColor = isWatch ? '#8b5cf6' : '#ef4444';

    const homeName = escHtml(match.homeTeam || match.squadName);
    const awayName = escHtml(match.awayTeam || match.opponent || 'TBC');
    const scoreLine = isResult
        ? `<div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding:10px 8px;margin-bottom:8px;background:${isWatch ? '#f5f3ff' : '#fef2f2'};border-radius:10px;text-align:center;">
            <span style="font-size:0.85rem;font-weight:800;color:#0f172a;">${homeName}</span>
            <span style="font-size:1.2rem;font-weight:900;color:${accentColor};white-space:nowrap;">${match.homeScore ?? '?'} - ${match.awayScore ?? '?'}</span>
            <span style="font-size:0.85rem;font-weight:800;color:#0f172a;">${awayName}</span>
           </div>`
        : '';

    let headerRow;
    if (isWatch) {
        const pName = match.watchedPlayerName || 'Player';
        headerRow = `<div class="cal-popup-row" style="color:#8b5cf6;font-weight:700;background:rgba(139,92,246,0.05);padding:6px 10px;border-radius:8px;margin-bottom:12px;"><i class="fas fa-eye"></i>${escHtml(pName)}${match.opponent ? ' @ ' + escHtml(match.opponent) : ''}</div>`;
    } else {
        headerRow = `<div class="cal-popup-row" style="color:#ef4444;font-weight:700;background:rgba(239,68,68,0.05);padding:6px 10px;border-radius:8px;margin-bottom:12px;"><i class="fas fa-futbol"></i>${escHtml(match.squadName)}${match.opponent ? ' vs ' + escHtml(match.opponent) : ''}</div>`;
    }

    let headTitle;
    if (isWatch) {
        headTitle = isResult ? 'Player Watch Result' : 'Player Watch';
    } else {
        headTitle = isResult ? 'Match Result' : 'Upcoming Fixture';
    }

    const rows = [
        scoreLine,
        headerRow,
        match.time ? `<div class="cal-popup-row"><i class="fas fa-clock"></i><strong>${isWatch ? 'Time:' : 'Kick-off:'}</strong> ${match.time}</div>` : '',
        match.venue ? `<div class="cal-popup-row"><i class="fas fa-map-marker-alt"></i><strong>Venue:</strong> ${escHtml(match.venue)}</div>` : '',
        match.competition ? `<div class="cal-popup-row"><i class="fas fa-trophy"></i><strong>Competition:</strong> ${escHtml(match.competition)}</div>` : '',
        !isWatch && match.ourSide ? `<div class="cal-popup-row"><i class="fas fa-flag"></i><strong>Playing:</strong> ${match.ourSide === 'home' ? 'Home' : 'Away'}</div>` : '',
    ].filter(Boolean).join('');

    const popup = document.createElement('div');
    popup.className = 'cal-session-popup';
    popup.innerHTML = `
        <div class="cal-popup-head" style="background:${headColor};">
            <div class="cal-popup-head-title">${headTitle}</div>
            <div class="cal-popup-head-date">${dateFormatted}</div>
        </div>
        <div class="cal-popup-body">${rows}</div>
        <div class="cal-popup-footer">
            <button class="cal-popup-btn ghost" onclick="window._closeCalPopup()">Close</button>
            <button class="cal-popup-btn primary" style="background:${accentColor};" onclick="window.location.href='match-details.html?id=${matchId}'">View Match</button>
        </div>
    `;

    document.body.appendChild(popup);
    _activeCalPopup = popup;
    positionPopup(popup, event);
}

// --- Day Overflow Popup ("+N more") ---

async function showDayOverflow(event, dateStr) {
    if (event) event.stopPropagation();
    closeCalPopup();

    const [sessions, events, matches] = await Promise.all([fetchCalendarSessions(), fetchCalendarEvents(), fetchCalendarMatches()]);
    const daySessions = sessions.filter(s => s.date === dateStr);
    const dayEvents = events.filter(e => e.date === dateStr);
    const dayMatches = matches.filter(m => m.date === dateStr);

    const dateFormatted = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    let rows = '';

    dayMatches.forEach(m => {
        const mid = String(m.id).replace(/'/g, '');
        const isWatch = m.matchType === 'player_watch';
        const icon = isWatch ? 'fa-eye' : 'fa-futbol';
        const color = isWatch ? '#8b5cf6' : '#ef4444';
        let name;
        if (isWatch) {
            const pName = m.watchedPlayerName || 'Player';
            name = m.opponent ? `${pName} @ ${m.opponent}` : pName;
        } else {
            name = `${m.squadName} ${m.opponent ? 'vs ' + m.opponent : ''}`;
        }
        rows += `<div class="cal-popup-row" style="cursor:pointer;padding:6px 8px;border-radius:6px;" onclick="window._closeCalPopup();window._showMatchPopup(event,'${mid}')">
            <i class="fas ${icon}" style="color:${color};width:14px;text-align:center;"></i>
            <span style="font-weight:600;">${escHtml(name)}</span>
            <span style="margin-left:auto;font-size:0.75rem;color:#94a3b8;">${m.time || 'TBC'}</span>
        </div>`;
    });

    daySessions.forEach(s => {
        const sid = String(s.id).replace(/'/g, '');
        const clickHandler = _onSessionClickOverride
            ? `window._closeCalPopup();window._onRegisterSessionClick(event,'${sid}')`
            : `window._closeCalPopup();window._showSessionPopup(event,'${sid}')`;
        rows += `<div class="cal-popup-row" style="cursor:pointer;padding:6px 8px;border-radius:6px;" onclick="${clickHandler}">
            <i class="fas fa-calendar-check" style="color:#00C49A;width:14px;text-align:center;"></i>
            <span style="font-weight:600;">${escHtml(s.team || 'No Team')}</span>
            <span style="margin-left:auto;font-size:0.75rem;color:#94a3b8;">${s.startTime || '--:--'}</span>
        </div>`;
    });

    dayEvents.forEach(e => {
        const eid = String(e.id).replace(/'/g, '');
        rows += `<div class="cal-popup-row" style="cursor:pointer;padding:6px 8px;border-radius:6px;" onclick="window._closeCalPopup();window._showEventPopup(event,'${eid}')">
            <i class="fas fa-tag" style="color:${e.color || '#64748b'};width:14px;text-align:center;"></i>
            <span style="font-weight:600;">${escHtml(e.title)}</span>
            <span style="margin-left:auto;font-size:0.75rem;color:#94a3b8;">${e.startTime || ''}</span>
        </div>`;
    });

    const popup = document.createElement('div');
    popup.className = 'cal-session-popup';
    popup.innerHTML = `
        <div class="cal-popup-head">
            <div class="cal-popup-head-title">${dateFormatted}</div>
            <div class="cal-popup-head-date">${dayMatches.length + daySessions.length + dayEvents.length} items</div>
        </div>
        <div class="cal-popup-body" style="max-height:300px;overflow-y:auto;">${rows}</div>
        <div class="cal-popup-footer">
            <button class="cal-popup-btn ghost" onclick="window._closeCalPopup()">Close</button>
        </div>
    `;

    document.body.appendChild(popup);
    _activeCalPopup = popup;
    positionPopup(popup, event);
}

// --- Month Navigation ---

function changeMonth(delta) {
    _calSessionsCache = null;
    _calEventsCache = null;
    _calMatchesCache = null;
    currentMonth += delta;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    else if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    // Reset mobile state to 1st of new month
    _selectedDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    _mobileWeekStart = null;
    renderCalendar();
}

// --- Share Session from Calendar ---
async function shareCalSession(sessionId) {
  try {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const { data } = await supabase.from('sessions').select('share_token').eq('id', sessionId).single();
    let token = data?.share_token;
    if (!token) {
      let t = ''; const arr = new Uint8Array(12); crypto.getRandomValues(arr);
      arr.forEach(v => { t += chars[v % chars.length]; }); token = t;
      const { error } = await supabase.from('sessions').update({ share_token: token }).eq('id', sessionId);
      if (error) throw error;
    }
    const url = `${window.location.origin}/src/pages/session-share.html?token=${token}`;
    await navigator.clipboard.writeText(url);
    if (window.showToast) window.showToast('Share link copied!', 'success');
  } catch (e) {
    console.error('Share error:', e);
    if (window.showToast) window.showToast('Failed to share', 'error');
  }
}

// --- Window Bindings ---

window._shareCalSession = shareCalSession;
window._showSessionPopup = showSessionPopup;
window._showEventPopup = showEventPopup;
window._showMatchPopup = showMatchPopup;
window._showDayOverflow = showDayOverflow;
window._closeCalPopup = closeCalPopup;
window._changeMonth = changeMonth;
window._openAddEvent = openAddEvent;
window._closeEventModal = closeEventModal;
window._onEventTypeChange = onEventTypeChange;
window._pickEventColor = pickEventColor;
window._saveEvent = saveEvent;
window._deleteEvent = deleteEvent;
window._selectMobileDate = selectMobileDate;
window._shiftMobileWeek = shiftMobileWeek;
window._toggleMobileCalExpand = toggleMobileCalExpand;

// Close popup on outside click
document.addEventListener('click', (e) => {
    if (_activeCalPopup && !_activeCalPopup.contains(e.target)
        && !e.target.closest('.calendar-bubble')
        && !e.target.closest('.mcal-detail-row')
        && !e.target.closest('.calendar-more-link')) {
        closeCalPopup();
    }
}, true);

// Close popup on scroll
window.addEventListener('scroll', () => { if (_activeCalPopup) closeCalPopup(); }, true);

export function setSessionClickHandler(fn) {
    _onSessionClickOverride = fn;
    if (fn) {
        window._onRegisterSessionClick = fn;
    }
}

function invalidateCalendarCache() {
    _calSessionsCache = null;
    _calEventsCache = null;
    _calMatchesCache = null;
}

export { fetchCalendarSessions, renderCalendar as reRenderCalendar, invalidateCalendarCache };

let _lastMobileState = null;
export function initCalendar() {
    injectCalendarStyles();
    renderCalendar();
    // Re-render on viewport change (rotation, resize) if mobile state changes
    window.addEventListener('resize', () => {
        const nowMobile = _isMobileView();
        if (_lastMobileState !== null && _lastMobileState !== nowMobile) {
            renderCalendar();
        }
        _lastMobileState = nowMobile;
    });
    _lastMobileState = _isMobileView();
}
