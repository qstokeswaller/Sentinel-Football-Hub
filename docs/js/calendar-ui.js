/**
 * Training Calendar UI Component
 * Handles rendering of the monthly calendar on the dashboard
 * and displays color-coded session bubbles.
 */

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();

const TEAM_COLORS = {
    'blue': 'bubble-team-blue',
    'green': 'bubble-team-green',
    'purple': 'bubble-team-purple',
    'orange': 'bubble-team-orange',
    'red': 'bubble-team-red',
    'navy': 'bubble-team-navy',
    'teal': 'bubble-team-teal',
    'pink': 'bubble-team-pink',
    'default': 'bubble-team-default'
};

// Map team names to colors for consistency
const TEAM_COLOR_MAP = {
    'u19': 'blue',
    'u21': 'purple',
    'senior': 'navy',
    'elite': 'green',
    'first team': 'orange',
    'u17': 'teal',
    'u15': 'pink'
};

function getTeamColorClass(teamName) {
    if (!teamName) return TEAM_COLORS['default'];
    const normalized = teamName.toLowerCase().trim();
    const color = TEAM_COLOR_MAP[normalized] || 'default';
    return TEAM_COLORS[color] || TEAM_COLORS['default'];
}

async function fetchCalendarSessions() {
    if (window.USE_LOCAL_STORAGE) {
        return JSON.parse(localStorage.getItem('up_sessions')) || [];
    }
    try {
        const res = await fetch(`${window.API_BASE_URL}/sessions`, { cache: 'no-store' });
        return await res.json();
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

    // Set Month/Year Label
    const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(currentYear, currentMonth));
    monthYearLabel.textContent = `${monthName} ${currentYear}`;

    // Calendar Logic
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();

    let html = '';

    // Day Headers
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
        html += `<div class="calendar-day-header">${day}</div>`;
    });

    // Previous Month Days
    for (let i = firstDay; i > 0; i--) {
        html += `<div class="calendar-day other-month"><div class="calendar-date-num">${prevMonthLastDay - i + 1}</div></div>`;
    }

    // Current Month Days
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = new Date().toISOString().split('T')[0] === dateStr;

        // Filter sessions for this day
        const daySessions = sessions.filter(s => s.date === dateStr);

        html += `
      <div class="calendar-day ${isToday ? 'today' : ''}">
        <div class="calendar-date-num">${d}</div>
        <div class="calendar-bubbles-container">
          ${daySessions.map(s => `
            <div class="calendar-bubble ${getTeamColorClass(s.team)}" onclick="viewSessionDetails('${s.id}')">
              <span class="bubble-team">${s.team || 'No Team'}</span>
              <span class="bubble-time">${s.startTime || '--:--'}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    }

    // Next Month Days (to fill a 6-row grid usually, but here we just finish the week)
    const remainingDays = (7 - (firstDay + daysInMonth) % 7) % 7;
    for (let i = 1; i <= remainingDays; i++) {
        html += `<div class="calendar-day other-month"><div class="calendar-date-num">${i}</div></div>`;
    }

    container.innerHTML = html;
}

window.changeMonth = (delta) => {
    currentMonth += delta;
    if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    } else if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    }
    renderCalendar();
};

async function viewSessionDetails(sessionId) {
    let sessions = [];
    if (window.USE_LOCAL_STORAGE) {
        sessions = JSON.parse(localStorage.getItem('up_sessions')) || [];
    } else {
        try {
            const res = await fetch(`${window.API_BASE_URL}/sessions`, { cache: 'no-store' });
            sessions = await res.json();
        } catch (err) {
            console.error('Error details:', err);
        }
    }

    const session = sessions.find(s => s.id == sessionId);
    if (!session) return;

    const modal = document.getElementById('session-detail-modal');
    const title = document.getElementById('modal-session-title');
    const body = document.getElementById('modal-session-body');
    const viewBtn = document.getElementById('btn-view-full-session');

    title.textContent = session.title || 'Session Details';

    body.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
            <div>
                <label style="font-size: 11px; font-weight: 700; color: var(--text-light); text-transform: uppercase;">Team</label>
                <div style="font-weight: 600;">${session.team || 'N/A'}</div>
            </div>
            <div>
                <label style="font-size: 11px; font-weight: 700; color: var(--text-light); text-transform: uppercase;">Start Time</label>
                <div style="font-weight: 600;">${session.startTime || 'N/A'}</div>
            </div>
            <div>
                <label style="font-size: 11px; font-weight: 700; color: var(--text-light); text-transform: uppercase;">Date</label>
                <div style="font-weight: 600;">${session.date || 'N/A'}</div>
            </div>
            <div>
                <label style="font-size: 11px; font-weight: 700; color: var(--text-light); text-transform: uppercase;">Duration</label>
                <div style="font-weight: 600;">${session.duration || 'N/A'}</div>
            </div>
        </div>
        
        <div style="margin-bottom: 24px;">
            <label style="font-size: 11px; font-weight: 700; color: var(--text-light); text-transform: uppercase;">Main Objective</label>
            <div style="margin-top: 4px; line-height: 1.5;">${session.purpose || 'No objective specified.'}</div>
        </div>
    `;

    viewBtn.onclick = () => {
        window.location.href = `library.html?sessionId=${sessionId}`;
    };

    modal.classList.add('active');
}

window.closeSessionDetailModal = () => {
    document.getElementById('session-detail-modal').classList.remove('active');
};

document.addEventListener('DOMContentLoaded', renderCalendar);
