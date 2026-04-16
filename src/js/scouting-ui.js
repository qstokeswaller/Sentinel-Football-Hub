import scoutingManager from '../managers/scouting-manager.js';
import squadManager from '../managers/squad-manager.js';
import supabase from '../supabase.js';
import { showToast } from '../toast.js';
// canManage not needed on list page — edit/delete is on player profile
import {
    SCOUTING_VERDICTS, QUICK_REPORT_SECTIONS,
    POSITION_OPTIONS, FOOT_OPTIONS,
} from './scouting-constants.js';
import { REPORT_SECTIONS } from './report-sections.js';

let _profile = null;
let _viewMode = 'list';
let _filter = 'all';
let _posFilter = 'all';
let _searchQuery = '';


export async function initScoutingUI(profile) {
    _profile = profile;
    _viewMode = localStorage.getItem('scouting-view') || 'list';

    const [scoutOk] = await Promise.all([
        scoutingManager.init(),
        squadManager.init(),
    ]);
    if (!scoutOk) {
        showToast('Failed to load scouting data', 'error');
        return;
    }

    populateDropdowns();
    wireEvents();
    render();
}

/* ── Dropdowns ── */
function populateDropdowns() {
    const posSelect = document.getElementById('spPosition');
    const footSelect = document.getElementById('spFoot');
    const posFilter = document.getElementById('positionFilter');
    const targetSquad = document.getElementById('spTargetSquad');

    if (posSelect) {
        POSITION_OPTIONS.forEach(p => {
            posSelect.insertAdjacentHTML('beforeend', `<option value="${p}">${p}</option>`);
        });
    }
    if (footSelect) {
        FOOT_OPTIONS.forEach(f => {
            footSelect.insertAdjacentHTML('beforeend', `<option value="${f}">${f}</option>`);
        });
    }
    if (posFilter) {
        POSITION_OPTIONS.forEach(p => {
            posFilter.insertAdjacentHTML('beforeend', `<option value="${p}">${p}</option>`);
        });
    }
    if (targetSquad && squadManager.squads) {
        const visibleSquads = window._coachSquadIds
            ? squadManager.squads.filter(s => window._coachSquadIds.includes(s.id))
            : squadManager.squads;
        visibleSquads.forEach(s => {
            targetSquad.insertAdjacentHTML('beforeend', `<option value="${s.id}">${esc(s.name)}</option>`);
        });
    }
}

/* ── Events ── */
function wireEvents() {
    // Search
    document.getElementById('scoutSearch')?.addEventListener('input', (e) => {
        _searchQuery = e.target.value.toLowerCase().trim();
        render();
    });

    // View toggle
    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _viewMode = btn.dataset.view;
            localStorage.setItem('scouting-view', _viewMode);
            render();
        });
    });

    // Set initial toggle state
    document.querySelectorAll('.view-toggle-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.view === _viewMode);
    });

    // Filter dropdowns
    document.getElementById('scoutFilter')?.addEventListener('change', (e) => {
        _filter = e.target.value;
        render();
    });
    document.getElementById('positionFilter')?.addEventListener('change', (e) => {
        _posFilter = e.target.value;
        render();
    });

    // Add player
    document.getElementById('btnAddScoutedPlayer')?.addEventListener('click', () => openPlayerModal());
    document.getElementById('btnSavePlayer')?.addEventListener('click', savePlayer);

    // Close modals
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', () => btn.closest('.modal-overlay')?.classList.remove('active'));
    });
    document.querySelectorAll('.btn-close-modal-cancel').forEach(btn => {
        btn.addEventListener('click', () => btn.closest('.modal-overlay')?.classList.remove('active'));
    });
    document.querySelectorAll('.modal-overlay').forEach(ov => {
        ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.remove('active'); });
    });

    // Report saves
    document.getElementById('btnSaveQR')?.addEventListener('click', () => saveReport('quick'));
    document.getElementById('btnSaveFR')?.addEventListener('click', () => saveReport('full'));
}

/* ── Filtering ── */
function getFilteredPlayers() {
    let players = scoutingManager.players;

    // Coach scoping: only show scouted players targeting assigned squads (or unassigned)
    if (window._coachSquadIds) {
        players = players.filter(p =>
            !p.target_squad_id || window._coachSquadIds.includes(p.target_squad_id)
        );
    }

    // Evaluation / verdict filter
    if (_filter === 'unevaluated') {
        players = players.filter(p => p._reportCount === 0);
    } else if (_filter === 'evaluated') {
        players = players.filter(p => p._reportCount > 0);
    } else if (_filter !== 'all') {
        // Filter by specific verdict
        players = players.filter(p => p._latestVerdict === _filter);
    }

    // Position filter
    if (_posFilter !== 'all') {
        players = players.filter(p => p.position === _posFilter);
    }

    // Search
    if (_searchQuery) {
        players = players.filter(p =>
            (p.name || '').toLowerCase().includes(_searchQuery) ||
            (p.position || '').toLowerCase().includes(_searchQuery) ||
            (p.current_club || '').toLowerCase().includes(_searchQuery) ||
            (p.current_team || '').toLowerCase().includes(_searchQuery)
        );
    }
    return players;
}

/* ── Render ── */
function render() {
    const players = getFilteredPlayers();
    const countEl = document.getElementById('scoutingCount');
    if (countEl) countEl.textContent = `\u2022 ${players.length} player${players.length !== 1 ? 's' : ''}`;

    const grid = document.getElementById('scoutingGrid');
    const list = document.getElementById('scoutingList');
    const pagination = document.getElementById('paginationBar');

    if (_viewMode === 'grid') {
        grid.style.display = 'grid';
        list.style.display = 'none';
        renderGrid(players);
        if (pagination) pagination.innerHTML = '';
    } else {
        grid.style.display = 'none';
        list.style.display = 'block';
        renderList(players);
        renderPagination(players.length);
    }
}

/* ── Grid View ── */
function renderGrid(players) {
    const grid = document.getElementById('scoutingGrid');
    if (!players.length) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
            <i class="fas fa-binoculars"></i>
            <p>No scouted players found. Click "Add Player" to start.</p>
        </div>`;
        return;
    }

    grid.innerHTML = players.map(p => {
        const initials = (p.name || '?').split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
        const age = calcAge(p.dob);
        const verdict = SCOUTING_VERDICTS[p._latestVerdict];
        const avg = p._latestAvg;

        return `<div class="scout-card" data-id="${p.id}">
            <div class="scout-card-avatar">${initials}</div>
            <div class="scout-card-name">${esc(p.name)}</div>
            <span class="scout-card-pos">${esc(p.position || '\u2014')}${age ? ` \u00B7 ${age}y` : ''}</span>
            ${p.current_club ? `<span class="scout-card-club">${esc(p.current_club)}</span>` : ''}
            <hr class="scout-card-divider">
            <div class="scout-card-footer">
                ${verdict
                    ? `<span class="scout-verdict-badge" style="background:${verdict.bg};color:${verdict.color};border:1px solid ${verdict.border};">${verdict.label}</span>`
                    : `<span class="scout-verdict-badge" style="background:#f1f5f9;color:#94a3b8;border:1px solid #e2e8f0;">Unevaluated</span>`}
                ${avg ? `<div class="scout-avg-circle" style="color:${avgColor(avg)};border-color:${avgColor(avg)};">${avg.toFixed(1)}</div>` : ''}
            </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.scout-card').forEach(card => {
        card.addEventListener('click', () => {
            window.location.href = `/src/pages/scouted-player.html?id=${card.dataset.id}`;
        });
    });
}

/* ── List View ── */
function renderList(players) {
    const tbody = document.getElementById('scoutingListBody');
    if (!players.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="empty-state">
            <i class="fas fa-binoculars"></i>
            <p>No scouted players found</p>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = players.map(p => {
        const initials = (p.name || '?').split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
        const dob = formatDob(p.dob);
        const age = calcAge(p.dob);
        const dobDisplay = dob ? `${dob}${age ? ` (${age})` : ''}` : '\u2014';
        const verdict = SCOUTING_VERDICTS[p._latestVerdict];
        const avg = p._latestAvg;

        return `<tr class="player-row" data-id="${p.id}">
            <td>
                <div class="player-cell">
                    <div class="player-cell-avatar">${initials}</div>
                    <span class="player-cell-name">${esc(p.name)}</span>
                </div>
            </td>
            <td>${esc(p.position || '\u2014')}</td>
            <td>${dobDisplay}</td>
            <td>${esc(p.current_club || '\u2014')}</td>
            <td>${esc(p.current_team || '\u2014')}</td>
            <td>${verdict
                ? `<span class="scout-verdict-badge" style="background:${verdict.bg};color:${verdict.color};border:1px solid ${verdict.border};">${verdict.label}</span>`
                : `<span style="color:#94a3b8;font-size:0.82rem;font-style:italic;">Unevaluated</span>`}</td>
            <td>${avg
                ? `<div class="avg-indicator"><span class="avg-ring" style="color:${avgColor(avg)};border-color:${avgColor(avg)};">${avg.toFixed(1)}</span></div>`
                : `<span style="color:#94a3b8;">\u2014</span>`}</td>
            <td style="font-size:0.82rem;color:var(--text-medium);">${esc(p._latestScout || '\u2014')}</td>
            <td>
                <button class="dash-btn outline sm btn-quick-report" data-id="${p.id}" title="Quick Report" style="padding:4px 8px;"><i class="fas fa-clipboard-check"></i></button>
            </td>
        </tr>`;
    }).join('');

    wireListEvents(tbody);
}

function wireListEvents(tbody) {
    // Row click → navigate to player profile
    tbody.querySelectorAll('.player-row').forEach(tr => {
        tr.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            window.location.href = `/src/pages/scouted-player.html?id=${tr.dataset.id}`;
        });
    });

    // Quick report
    tbody.querySelectorAll('.btn-quick-report').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openQuickReportModal(btn.dataset.id);
        });
    });
}

function renderPagination(total) {
    const bar = document.getElementById('paginationBar');
    if (!bar) return;
    bar.innerHTML = `<span>Showing 1 to ${total} of ${total} entries</span>`;
}

/* ── Player Modal ── */
function openPlayerModal(editId) {
    const modal = document.getElementById('playerModal');
    const title = document.getElementById('playerModalTitle');
    document.getElementById('editPlayerId').value = editId || '';

    if (editId) {
        title.textContent = 'Edit Scouted Player';
        const p = scoutingManager.getPlayer(editId);
        if (p) {
            document.getElementById('spName').value = p.name || '';
            document.getElementById('spDob').value = p.dob || '';
            document.getElementById('spPosition').value = p.position || '';
            document.getElementById('spFoot').value = p.foot || '';
            document.getElementById('spHeight').value = p.height || '';
            document.getElementById('spWeight').value = p.weight || '';
            document.getElementById('spCurrentClub').value = p.current_club || '';
            document.getElementById('spCurrentTeam').value = p.current_team || '';
            document.getElementById('spTargetSquad').value = p.target_squad_id || '';
            document.getElementById('spAgentName').value = p.agent_name || '';
            document.getElementById('spAgentContact').value = p.agent_contact || '';
            document.getElementById('spNotes').value = p.notes || '';
        }
    } else {
        title.textContent = 'Add Scouted Player';
        modal.querySelectorAll('input:not([type=hidden]), select, textarea').forEach(el => {
            if (el.tagName === 'SELECT') el.selectedIndex = 0;
            else el.value = '';
        });
    }
    modal.classList.add('active');
}

async function savePlayer() {
    const name = document.getElementById('spName').value.trim();
    if (!name) { showToast('Name is required', 'error'); return; }

    const data = {
        name,
        dob: document.getElementById('spDob').value || null,
        position: document.getElementById('spPosition').value || null,
        foot: document.getElementById('spFoot').value || null,
        height: document.getElementById('spHeight').value.trim() || null,
        weight: document.getElementById('spWeight').value.trim() || null,
        current_club: document.getElementById('spCurrentClub').value.trim() || null,
        current_team: document.getElementById('spCurrentTeam').value.trim() || null,
        target_squad_id: document.getElementById('spTargetSquad').value || null,
        agent_name: document.getElementById('spAgentName').value.trim() || null,
        agent_contact: document.getElementById('spAgentContact').value.trim() || null,
        notes: document.getElementById('spNotes').value.trim() || null,
    };

    const editId = document.getElementById('editPlayerId').value;

    try {
        if (editId) {
            await scoutingManager.updatePlayer(editId, data);
            showToast('Player updated', 'success');
        } else {
            data.scouting_status = 'watching';
            const { data: { user } } = await supabase.auth.getUser();
            data.created_by = user?.id || null;
            await scoutingManager.addPlayer(data);
            showToast('Player added', 'success');
        }
        document.getElementById('playerModal').classList.remove('active');
        render();
    } catch (err) {
        showToast('Save failed: ' + err.message, 'error');
    }
}

/* ── Report Modals ── */
function openQuickReportModal(playerId) {
    document.getElementById('qrPlayerId').value = playerId;
    document.getElementById('qrDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('qrMatchContext').value = '';
    document.getElementById('qrVerdict').value = '';
    document.getElementById('qrStrengths').value = '';
    document.getElementById('qrWeaknesses').value = '';
    document.getElementById('qrRecommendation').value = '';
    renderReportSections('qrSections', QUICK_REPORT_SECTIONS);
    document.getElementById('quickReportModal').classList.add('active');
}

export function openFullReportModal(playerId) {
    document.getElementById('frPlayerId').value = playerId;
    document.getElementById('frDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('frMatchContext').value = '';
    document.getElementById('frVerdict').value = '';
    document.getElementById('frStrengths').value = '';
    document.getElementById('frWeaknesses').value = '';
    document.getElementById('frRecommendation').value = '';
    renderReportSections('frSections', REPORT_SECTIONS);
    document.getElementById('fullReportModal').classList.add('active');
}

function renderReportSections(containerId, sections) {
    const container = document.getElementById(containerId);
    container.innerHTML = sections.map(section => `
        <div class="report-section-title" style="color:${section.color};">
            <i class="fas ${section.icon}"></i> ${section.label}
        </div>
        ${section.attributes.map(attr => `
            <div class="rating-row">
                <label>${attr.label}</label>
                <div class="rating-stars" data-key="${attr.key}">
                    ${[1,2,3,4,5].map(v => `<button type="button" data-val="${v}">${v}</button>`).join('')}
                </div>
            </div>
        `).join('')}
    `).join('');

    container.querySelectorAll('.rating-stars').forEach(group => {
        group.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    });
}

async function saveReport(type) {
    const prefix = type === 'quick' ? 'qr' : 'fr';
    const playerId = document.getElementById(`${prefix}PlayerId`).value;
    const containerId = `${prefix}Sections`;
    const sections = type === 'quick' ? QUICK_REPORT_SECTIONS : REPORT_SECTIONS;

    // Collect ratings
    const ratings = {};
    const container = document.getElementById(containerId);
    container.querySelectorAll('.rating-stars').forEach(group => {
        const key = group.dataset.key;
        const active = group.querySelector('button.active');
        if (active) ratings[key] = parseInt(active.dataset.val);
    });

    if (Object.keys(ratings).length === 0) {
        showToast('Please rate at least one attribute', 'error');
        return;
    }

    const verdict = document.getElementById(`${prefix}Verdict`)?.value || null;

    const feedback = {
        strengths: document.getElementById(`${prefix}Strengths`).value.trim(),
        weaknesses: document.getElementById(`${prefix}Weaknesses`).value.trim(),
        recommendation: document.getElementById(`${prefix}Recommendation`).value.trim(),
    };

    const { data: { user } } = await supabase.auth.getUser();

    const reportData = {
        scouted_player_id: playerId,
        report_type: type,
        ratings,
        feedback,
        verdict,
        match_context: document.getElementById(`${prefix}MatchContext`).value.trim() || null,
        scout_name: _profile?.full_name || _profile?.email || null,
        created_by: user?.id || null,
        date: document.getElementById(`${prefix}Date`).value || new Date().toISOString().slice(0, 10),
    };

    try {
        await scoutingManager.addReport(reportData);
        showToast(`${type === 'quick' ? 'Quick' : 'Full'} report saved`, 'success');
        document.getElementById(`${type === 'quick' ? 'quickReportModal' : 'fullReportModal'}`).classList.remove('active');
        render();
    } catch (err) {
        showToast('Save failed: ' + err.message, 'error');
    }
}

/* ── Helpers ── */
function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

function calcAge(dob) {
    if (!dob) return null;
    return Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000);
}

function formatDob(dob) {
    if (!dob) return '';
    const d = new Date(dob);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function avgColor(avg) {
    const v = parseFloat(avg);
    if (v >= 4) return '#10b981';
    if (v >= 3) return '#f59e0b';
    if (v >= 2) return '#f97316';
    return '#ef4444';
}
