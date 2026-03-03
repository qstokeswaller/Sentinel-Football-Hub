/**
 * Analytics UI — Player Performance Matrix + Attendance Tracker
 */

document.addEventListener('DOMContentLoaded', () => {
    initYearSelectors();
    loadSquadFilter();

    document.getElementById('filterSquad').addEventListener('change', onSquadChange);
    document.getElementById('filterPlayer').addEventListener('change', refreshAll);
    document.getElementById('filterMonth').addEventListener('change', onAttMonthChange);
    document.getElementById('filterYear').addEventListener('change', refreshAttendance);
    document.getElementById('filterPerfMonth').addEventListener('change', onPerfMonthChange);
    document.getElementById('filterPerfYear').addEventListener('change', refreshPerformanceMatrix);
});

// ─── Year selectors ────────────────────────────────────────────────────────────

function initYearSelectors() {
    const now = new Date();
    const currentYear = now.getFullYear();

    for (const selId of ['filterYear', 'filterPerfYear']) {
        const sel = document.getElementById(selId);
        for (let y = currentYear; y >= currentYear - 3; y--) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            sel.appendChild(opt);
        }
    }

    // Default attendance to current month
    document.getElementById('filterMonth').value = now.getMonth() + 1;
    // Default year selectors to current year (already first option)
    // filterYear is visible by default; filterPerfYear hidden until month picked
    document.getElementById('filterPerfYear').style.display = 'none';
}

// ─── Month filter handlers ─────────────────────────────────────────────────────

function onPerfMonthChange() {
    const month = document.getElementById('filterPerfMonth').value;
    document.getElementById('filterPerfYear').style.display = month === 'all' ? 'none' : '';
    refreshPerformanceMatrix();
}

function onAttMonthChange() {
    const month = document.getElementById('filterMonth').value;
    document.getElementById('filterYear').style.display = month === 'all' ? 'none' : '';
    // Update sessions column header
    const hdr = document.getElementById('attSessionsHeader');
    if (hdr) hdr.textContent = month === 'all' ? 'Total Sessions' : 'Sessions This Month';
    refreshAttendance();
}

// ─── Squad filter ──────────────────────────────────────────────────────────────

async function loadSquadFilter() {
    try {
        const res = await fetch(`${window.API_BASE_URL}/squads`);
        const squads = await res.json();
        const sel = document.getElementById('filterSquad');

        squads.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name;
            sel.appendChild(opt);
        });
    } catch (e) {
        console.warn('Could not load squads for filter:', e);
    }

    await loadPlayerFilter('all');
    refreshAll();
}

async function onSquadChange() {
    const squadId = document.getElementById('filterSquad').value;
    await loadPlayerFilter(squadId);
    refreshAll();
}

// ─── Player filter ─────────────────────────────────────────────────────────────

async function loadPlayerFilter(squadId) {
    try {
        const params = squadId !== 'all' ? `?squadId=${encodeURIComponent(squadId)}` : '';
        const res = await fetch(`${window.API_BASE_URL}/players${params}`);
        const players = await res.json();

        const sel = document.getElementById('filterPlayer');
        const prev = sel.value;
        sel.innerHTML = '<option value="all">All Players</option>';
        players.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            sel.appendChild(opt);
        });
        // Keep previous selection if still valid
        if (players.some(p => String(p.id) === String(prev))) sel.value = prev;
    } catch (e) {
        console.warn('Could not load players for filter:', e);
    }
}

// ─── Refresh triggers ─────────────────────────────────────────────────────────

function refreshAll() {
    refreshPerformanceMatrix();
    refreshAttendance();
}

// ─── Performance Matrix ───────────────────────────────────────────────────────

async function refreshPerformanceMatrix() {
    const squadId = document.getElementById('filterSquad').value;
    const playerId = document.getElementById('filterPlayer').value;
    const perfMonth = document.getElementById('filterPerfMonth').value;
    const perfYear = document.getElementById('filterPerfYear').value;

    const tbody = document.getElementById('performanceTableBody');
    const meta = document.getElementById('perfMatrixMeta');
    const mobileCards = document.getElementById('perf-mobile-cards');

    tbody.innerHTML = '<tr><td colspan="7" class="table-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
    mobileCards.innerHTML = '<div class="mobile-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    try {
        const params = new URLSearchParams();
        if (squadId !== 'all') params.set('squadId', squadId);
        if (playerId !== 'all') params.set('playerId', playerId);
        if (perfMonth !== 'all') {
            params.set('month', perfMonth);
            params.set('year', perfYear);
        }

        const res = await fetch(`${window.API_BASE_URL}/analytics/player-ratings?${params}`);
        if (!res.ok) throw new Error(res.statusText);
        const players = await res.json();

        if (players.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-empty"><i class="fas fa-users" style="font-size:1.4rem; margin-bottom:8px; display:block;"></i>No players found.</td></tr>';
            mobileCards.innerHTML = '<div class="mobile-empty"><i class="fas fa-users"></i><br>No players found.</div>';
            meta.textContent = '';
            return;
        }

        const withData = players.filter(p => p.assessmentCount > 0).length;
        meta.textContent = `${players.length} players · ${withData} with data`;

        // Table rows
        tbody.innerHTML = '';
        players.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="player-name-cell">
                        <div class="player-avatar">${initials(p.name)}</div>
                        <span class="player-name-text">${escHtml(p.name)}</span>
                    </div>
                </td>
                <td><span class="position-badge">${escHtml(p.position)}</span></td>
                <td class="center">${ratingBadge(p.tactical)}</td>
                <td class="center">${ratingBadge(p.technical)}</td>
                <td class="center">${ratingBadge(p.physical)}</td>
                <td class="center">${ratingBadge(p.psychological)}</td>
                <td class="center">
                    <span style="font-weight:700; color:${p.assessmentCount > 0 ? '#0f172a' : '#94a3b8'};">
                        ${p.assessmentCount}
                    </span>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Mobile bubble cards
        mobileCards.innerHTML = players.map(p => buildPerfMobileCard(p)).join('');

    } catch (e) {
        console.error('Failed to load player ratings:', e);
        tbody.innerHTML = '<tr><td colspan="7" class="table-empty" style="color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Failed to load data.</td></tr>';
        mobileCards.innerHTML = '<div class="mobile-empty" style="color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Failed to load data.</div>';
    }
}

function buildPerfMobileCard(p) {
    return `
    <div class="player-bubble-card">
        <div class="player-bubble-header" onclick="toggleBubble(this)">
            <div class="player-avatar">${initials(p.name)}</div>
            <div class="player-bubble-info">
                <span class="player-bubble-name">${escHtml(p.name)}</span>
                <span class="position-badge">${escHtml(p.position)}</span>
            </div>
            <i class="fas fa-chevron-down player-bubble-arrow"></i>
        </div>
        <div class="player-bubble-body">
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-brain" style="color:#6366f1;"></i> Tactical</span>
                ${ratingBadge(p.tactical)}
            </div>
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-futbol" style="color:#3b82f6;"></i> Technical</span>
                ${ratingBadge(p.technical)}
            </div>
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-running" style="color:#10b981;"></i> Physical</span>
                ${ratingBadge(p.physical)}
            </div>
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-heart" style="color:#f59e0b;"></i> Psychological</span>
                ${ratingBadge(p.psychological)}
            </div>
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-file-alt" style="color:#64748b;"></i> Reports</span>
                <span style="font-weight:700; color:${p.assessmentCount > 0 ? '#0f172a' : '#94a3b8'};">${p.assessmentCount}</span>
            </div>
        </div>
    </div>`;
}

// ─── Attendance Tracker ───────────────────────────────────────────────────────

async function refreshAttendance() {
    const squadId = document.getElementById('filterSquad').value;
    const playerId = document.getElementById('filterPlayer').value;
    const month = document.getElementById('filterMonth').value;
    const year = document.getElementById('filterYear').value;
    const tbody = document.getElementById('attendanceTableBody');
    const mobileCards = document.getElementById('att-mobile-cards');

    tbody.innerHTML = '<tr><td colspan="6" class="table-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
    mobileCards.innerHTML = '<div class="mobile-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    try {
        const params = new URLSearchParams({ month, year });
        if (squadId !== 'all') params.set('squadId', squadId);
        if (playerId !== 'all') params.set('playerId', playerId);

        const res = await fetch(`${window.API_BASE_URL}/analytics/attendance?${params}`);
        if (!res.ok) throw new Error(res.statusText);
        const players = await res.json();

        if (players.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-empty"><i class="fas fa-calendar" style="font-size:1.4rem; margin-bottom:8px; display:block;"></i>No players found.</td></tr>';
            mobileCards.innerHTML = '<div class="mobile-empty"><i class="fas fa-calendar"></i><br>No players found.</div>';
            return;
        }

        tbody.innerHTML = '';
        players.forEach(p => {
            const tr = document.createElement('tr');
            const pct = p.attendancePct;
            const pctLabel = pct !== null ? `${pct}%` : '—';
            const barColor = pctColor(pct);

            tr.innerHTML = `
                <td>
                    <div class="player-name-cell">
                        <div class="player-avatar">${initials(p.name)}</div>
                        <span class="player-name-text">${escHtml(p.name)}</span>
                    </div>
                </td>
                <td><span class="position-badge">${escHtml(p.position)}</span></td>
                <td class="center" style="font-weight:600;">${p.totalSessions}</td>
                <td class="center" style="font-weight:600; color:#166534;">${p.attendedSessions}</td>
                <td class="center">${missedBadge(p.missedSessions)}</td>
                <td class="center">
                    ${pct !== null ? `
                        <span class="att-pct-bar">
                            <span class="att-pct-fill att-pct-${barColor}" style="width:${pct}%;"></span>
                        </span>
                        <span style="font-weight:700; color:${pctTextColor(pct)};">${pctLabel}</span>
                    ` : '<span style="color:#94a3b8;">No sessions</span>'}
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Mobile bubble cards
        mobileCards.innerHTML = players.map(p => buildAttMobileCard(p)).join('');

    } catch (e) {
        console.error('Failed to load attendance:', e);
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty" style="color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Failed to load data.</td></tr>';
        mobileCards.innerHTML = '<div class="mobile-empty" style="color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Failed to load data.</div>';
    }
}

function buildAttMobileCard(p) {
    const pct = p.attendancePct;
    const pctLabel = pct !== null ? `${pct}%` : '—';
    const barColor = pctColor(pct);
    const pctHtml = pct !== null
        ? `<div style="display:flex;align-items:center;gap:6px;">
            <span class="att-pct-bar-mobile"><span class="att-pct-fill att-pct-${barColor}" style="width:${pct}%;"></span></span>
            <span style="font-weight:700; color:${pctTextColor(pct)};">${pctLabel}</span>
           </div>`
        : '<span style="color:#94a3b8;font-size:0.82rem;">No sessions</span>';

    return `
    <div class="player-bubble-card">
        <div class="player-bubble-header" onclick="toggleBubble(this)">
            <div class="player-avatar">${initials(p.name)}</div>
            <div class="player-bubble-info">
                <span class="player-bubble-name">${escHtml(p.name)}</span>
                <span class="position-badge">${escHtml(p.position)}</span>
            </div>
            <i class="fas fa-chevron-down player-bubble-arrow"></i>
        </div>
        <div class="player-bubble-body">
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-calendar" style="color:#64748b;"></i> Sessions</span>
                <span style="font-weight:600;">${p.totalSessions}</span>
            </div>
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-check" style="color:#166534;"></i> Attended</span>
                <span style="font-weight:600; color:#166534;">${p.attendedSessions}</span>
            </div>
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-times" style="color:#991b1b;"></i> Missed</span>
                ${missedBadge(p.missedSessions)}
            </div>
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-percent" style="color:#1d4ed8;"></i> Attendance</span>
                ${pctHtml}
            </div>
        </div>
    </div>`;
}

// ─── Bubble toggle ─────────────────────────────────────────────────────────────

function toggleBubble(header) {
    const body = header.nextElementSibling;
    const arrow = header.querySelector('.player-bubble-arrow');
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
}
window.toggleBubble = toggleBubble;

// ─── Render helpers ───────────────────────────────────────────────────────────

function ratingBadge(value) {
    if (value === null || value === undefined) {
        return '<span class="rating-badge none">No data</span>';
    }

    const n = parseFloat(value);
    let cls;

    if (n >= 4.5)      { cls = 'green'; }
    else if (n >= 3.5) { cls = 'blue'; }
    else if (n >= 2.5) { cls = 'amber'; }
    else               { cls = 'red'; }

    return `<span class="rating-badge ${cls}">
        <span class="rating-stars">${buildStars(n)}</span>
        ${n.toFixed(1)}
    </span>`;
}

function buildStars(val) {
    const full = Math.floor(val);
    const half = val - full >= 0.25 && val - full < 0.75 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

function missedBadge(missed) {
    if (missed === 0) return `<span class="missed-badge none">0</span>`;
    if (missed <= 2)  return `<span class="missed-badge low">${missed}</span>`;
    return `<span class="missed-badge high">${missed}</span>`;
}

function pctColor(pct) {
    if (pct === null) return 'blue';
    if (pct >= 90) return 'green';
    if (pct >= 75) return 'blue';
    if (pct >= 60) return 'amber';
    return 'red';
}

function pctTextColor(pct) {
    if (pct === null) return '#94a3b8';
    if (pct >= 90) return '#166534';
    if (pct >= 75) return '#1d4ed8';
    if (pct >= 60) return '#92400e';
    return '#991b1b';
}

function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
