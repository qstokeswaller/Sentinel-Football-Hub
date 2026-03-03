/**
 * Analytics UI — Player Performance Matrix + Attendance Tracker
 */

document.addEventListener('DOMContentLoaded', () => {
    initYearSelector();
    loadSquadFilter();

    document.getElementById('filterSquad').addEventListener('change', refreshAll);
    document.getElementById('filterMonth').addEventListener('change', refreshAttendance);
    document.getElementById('filterYear').addEventListener('change', refreshAttendance);
});

// ─── Year selector ────────────────────────────────────────────────────────────

function initYearSelector() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const yearSel = document.getElementById('filterYear');

    for (let y = currentYear; y >= currentYear - 3; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        yearSel.appendChild(opt);
    }

    // Default to current month/year
    document.getElementById('filterMonth').value = now.getMonth() + 1;
}

// ─── Squad filter population ──────────────────────────────────────────────────

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

    refreshAll();
}

// ─── Refresh triggers ─────────────────────────────────────────────────────────

function refreshAll() {
    refreshPerformanceMatrix();
    refreshAttendance();
}

// ─── Performance Matrix ───────────────────────────────────────────────────────

async function refreshPerformanceMatrix() {
    const squadId = document.getElementById('filterSquad').value;
    const tbody = document.getElementById('performanceTableBody');
    const meta = document.getElementById('perfMatrixMeta');

    tbody.innerHTML = '<tr><td colspan="7" class="table-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

    try {
        const params = squadId !== 'all' ? `?squadId=${encodeURIComponent(squadId)}` : '';
        const res = await fetch(`${window.API_BASE_URL}/analytics/player-ratings${params}`);
        if (!res.ok) throw new Error(res.statusText);
        const players = await res.json();

        if (players.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-empty"><i class="fas fa-users" style="font-size:1.4rem; margin-bottom:8px; display:block;"></i>No players found.</td></tr>';
            meta.textContent = '';
            return;
        }

        const withData = players.filter(p => p.assessmentCount > 0).length;
        meta.textContent = `${players.length} players · ${withData} with assessment data`;

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
    } catch (e) {
        console.error('Failed to load player ratings:', e);
        tbody.innerHTML = '<tr><td colspan="7" class="table-empty" style="color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Failed to load data.</td></tr>';
    }
}

// ─── Attendance Tracker ───────────────────────────────────────────────────────

async function refreshAttendance() {
    const squadId = document.getElementById('filterSquad').value;
    const month = document.getElementById('filterMonth').value;
    const year = document.getElementById('filterYear').value;
    const tbody = document.getElementById('attendanceTableBody');

    tbody.innerHTML = '<tr><td colspan="6" class="table-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

    try {
        const params = new URLSearchParams({ month, year });
        if (squadId !== 'all') params.set('squadId', squadId);

        const res = await fetch(`${window.API_BASE_URL}/analytics/attendance?${params}`);
        if (!res.ok) throw new Error(res.statusText);
        const players = await res.json();

        if (players.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-empty"><i class="fas fa-calendar" style="font-size:1.4rem; margin-bottom:8px; display:block;"></i>No players found.</td></tr>';
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
    } catch (e) {
        console.error('Failed to load attendance:', e);
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty" style="color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Failed to load data.</td></tr>';
    }
}

// ─── Render helpers ───────────────────────────────────────────────────────────

function ratingBadge(value) {
    if (value === null || value === undefined) {
        return '<span class="rating-badge none">No data</span>';
    }

    const n = parseFloat(value);
    let cls, stars;

    if (n >= 4.5)      { cls = 'green'; }
    else if (n >= 3.5) { cls = 'blue'; }
    else if (n >= 2.5) { cls = 'amber'; }
    else               { cls = 'red'; }

    stars = buildStars(n);

    return `<span class="rating-badge ${cls}">
        <span class="rating-stars">${stars}</span>
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
