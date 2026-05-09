import scoutingManager from '../managers/scouting-manager.js';
import squadManager from '../managers/squad-manager.js';
import supabase from '../supabase.js';
import { showToast } from '../toast.js';
import { canManage } from '../rbac.js';
import { SCOUTING_STATUSES, SCOUTING_VERDICTS, QUICK_REPORT_SECTIONS, POSITION_OPTIONS, FOOT_OPTIONS } from './scouting-constants.js';
import { REPORT_SECTIONS } from './report-sections.js';

let _profile = null;
let _player = null;
let _reports = [];
let _videos = [];
let _playerId = null;

export async function initScoutedPlayerUI(profile) {
    _profile = profile;
    _playerId = new URLSearchParams(window.location.search).get('id');
    if (!_playerId) {
        showToast('No player ID specified', 'error');
        return;
    }

    const [scoutOk] = await Promise.all([
        scoutingManager.init(),
        squadManager.init(),
    ]);

    if (!scoutOk) {
        showToast('Failed to load scouting data', 'error');
        return;
    }

    _player = scoutingManager.getPlayer(_playerId);
    if (!_player) {
        showToast('Player not found', 'error');
        return;
    }

    _reports = await scoutingManager.getReports(_playerId);

    // Try loading videos (table may not exist yet)
    try {
        _videos = await scoutingManager.getVideos(_playerId);
    } catch { _videos = []; }

    renderHeader();
    renderHeaderActions();
    renderStatusBar();
    renderRadarChart();
    renderReports();
    renderVideos();
    renderActions();
    populateEditDropdowns();
    wireEvents();
}

/* ── Header ── */
function renderHeader() {
    const p = _player;
    const initials = (p.name || '?').split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const age = p.dob ? Math.floor((Date.now() - new Date(p.dob).getTime()) / 31557600000) : null;
    const dobFormatted = p.dob ? new Date(p.dob).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

    document.getElementById('spAvatar').textContent = initials;
    document.getElementById('spInfo').innerHTML = `
        <h1>${esc(p.name)}</h1>
        <div class="sp-pos">
            ${p.position ? `<i class="fas fa-futbol" style="margin-right:4px;"></i>${esc(p.position)}` : 'Position unknown'}
            ${p.foot ? ` \u00B7 <i class="fas fa-shoe-prints" style="margin:0 4px;"></i>${esc(p.foot)}` : ''}
        </div>
        <div class="sp-meta">
            ${age ? `<span><i class="fas fa-birthday-cake"></i> ${dobFormatted} (${age})</span>` : ''}
            ${p.height ? `<span><i class="fas fa-ruler-vertical"></i> ${p.height}cm</span>` : ''}
            ${p.weight ? `<span><i class="fas fa-weight-hanging"></i> ${p.weight}kg</span>` : ''}
            ${p.current_club ? `<span><i class="fas fa-shield-alt"></i> ${esc(p.current_club)}${p.current_team ? ` (${esc(p.current_team)})` : ''}</span>` : ''}
            ${p.agent_name ? `<span><i class="fas fa-user-tie"></i> ${esc(p.agent_name)}${p.agent_contact ? ` \u2014 ${esc(p.agent_contact)}` : ''}</span>` : ''}
        </div>
    `;

    // Global average circle (top-right like FootballISM)
    const avgEl = document.getElementById('spGlobalAvg');
    const avg = p._latestAvg;
    if (avg && avgEl) {
        avgEl.style.display = 'flex';
        avgEl.style.color = avgColor(avg);
        avgEl.style.borderColor = avgColor(avg);
        avgEl.textContent = avg.toFixed(2);
    }
}

/* ── Status Bar ── */
function renderStatusBar() {
    const bar = document.getElementById('spStatusBar');
    const statuses = ['watching', 'shortlisted', 'recommended', 'signed', 'rejected'];
    bar.innerHTML = `<span class="label">Status:</span>` + statuses.map(s => {
        const st = SCOUTING_STATUSES[s];
        const isActive = _player.scouting_status === s;
        const style = isActive
            ? `background:${st.color};color:#fff;border-color:${st.color};`
            : `color:${st.color};border-color:${st.border};`;
        return `<button class="sp-status-btn${isActive ? ' active' : ''}" data-status="${s}" style="${style}">${st.label}</button>`;
    }).join('');

    bar.querySelectorAll('.sp-status-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (btn.dataset.status === _player.scouting_status) return;
            try {
                _player = await scoutingManager.updateStatus(_playerId, btn.dataset.status);
                showToast(`Status changed to ${SCOUTING_STATUSES[btn.dataset.status].label}`, 'success');
                renderStatusBar();
            } catch (err) {
                showToast('Failed: ' + err.message, 'error');
            }
        });
    });
}

/* ── Radar Chart ── */
function renderRadarChart() {
    if (!_reports.length) {
        document.getElementById('radarChart').innerHTML = `<text x="220" y="160" text-anchor="middle" fill="#94a3b8" font-size="13">No reports yet</text>`;
        document.getElementById('radarLegend').innerHTML = '';
        return;
    }

    const sections = QUICK_REPORT_SECTIONS;
    const latest = _reports[0];
    const avgs = scoutingManager.computeCategoryAverages(latest.ratings, sections);

    const cx = 220, cy = 160, maxR = 100;
    const n = sections.length;
    const angleStep = (2 * Math.PI) / n;

    let svg = '';
    // Background rings
    for (let ring = 1; ring <= 5; ring++) {
        const r = (ring / 5) * maxR;
        const pts = [];
        for (let i = 0; i < n; i++) {
            const angle = -Math.PI / 2 + i * angleStep;
            pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
        }
        svg += `<polygon points="${pts.join(' ')}" fill="none" stroke="#e2e8f0" stroke-width="1"/>`;
    }

    // Axis lines + labels (position-aware anchoring)
    for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + i * angleStep;
        const x2 = cx + maxR * Math.cos(angle);
        const y2 = cy + maxR * Math.sin(angle);
        svg += `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="#e2e8f0" stroke-width="1"/>`;
        const labelR = maxR + 16;
        const lx = cx + labelR * Math.cos(angle);
        const ly = cy + labelR * Math.sin(angle);
        // Anchor: left-side labels → end, right-side labels → start, top/bottom → middle
        const cosVal = Math.cos(angle);
        const anchor = cosVal < -0.1 ? 'end' : cosVal > 0.1 ? 'start' : 'middle';
        svg += `<text x="${lx}" y="${ly}" text-anchor="${anchor}" dominant-baseline="middle" font-size="11" fill="#64748b" font-weight="600">${sections[i].label}</text>`;
    }

    // Data polygon
    const dataPts = [];
    for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + i * angleStep;
        const val = avgs[sections[i].key] || 0;
        const r = (val / 5) * maxR;
        dataPts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
    }
    svg += `<polygon points="${dataPts.join(' ')}" fill="rgba(0,196,154,0.2)" stroke="#00C49A" stroke-width="2"/>`;

    // Data dots
    for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + i * angleStep;
        const val = avgs[sections[i].key] || 0;
        const r = (val / 5) * maxR;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        svg += `<circle cx="${px}" cy="${py}" r="4" fill="#00C49A" stroke="#fff" stroke-width="2"/>`;
    }

    document.getElementById('radarChart').innerHTML = svg;

    document.getElementById('radarLegend').innerHTML = sections.map(s => {
        const val = (avgs[s.key] || 0).toFixed(1);
        return `<span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:${s.color};display:inline-block;"></span>${s.label}: ${val}</span>`;
    }).join('');
}

/* ── Reports ── */
function renderReports() {
    const container = document.getElementById('reportsList');
    if (!_reports.length) {
        container.innerHTML = `<p style="color:#94a3b8;font-size:0.85rem;text-align:center;padding:20px;">No reports yet. Add one above.</p>`;
        return;
    }

    container.innerHTML = _reports.map((r, idx) => {
        const typeClass = r.report_type === 'quick' ? 'quick' : 'full';
        const avg = r.global_average ? parseFloat(r.global_average).toFixed(1) : '\u2014';
        const date = r.date ? new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '\u2014';
        const verdict = SCOUTING_VERDICTS[r.verdict];

        return `
            <div class="report-card" data-idx="${idx}">
                <div class="report-card-top">
                    <div>
                        <span class="report-type-badge ${typeClass}">${r.report_type}</span>
                        ${verdict ? `<span class="report-verdict-inline" style="background:${verdict.bg};color:${verdict.color};border:1px solid ${verdict.border};">${verdict.label}</span>` : ''}
                        <span class="report-card-date" style="margin-left:8px;">${date}</span>
                    </div>
                    <span class="report-card-avg" style="color:${avgColor(r.global_average)}">${avg}</span>
                </div>
                ${r.scout_name ? `<div class="report-card-scout"><i class="fas fa-user" style="margin-right:4px;"></i>${esc(r.scout_name)}</div>` : ''}
                ${r.match_context ? `<div style="font-size:0.78rem;color:#94a3b8;margin-top:4px;"><i class="fas fa-futbol" style="margin-right:4px;"></i>${esc(r.match_context)}</div>` : ''}
            </div>
            <div class="report-detail" id="reportDetail${idx}">
                ${renderReportDetail(r)}
                ${canManage(_profile) ? `<div style="display:flex;justify-content:flex-end;margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0;">
                    <button class="dash-btn outline sm btn-delete-report" data-id="${r.id}" style="padding:5px 12px;color:#ef4444;border-color:#fecaca;font-size:0.78rem;">
                        <i class="fas fa-trash" style="margin-right:4px;"></i>Delete Report
                    </button>
                </div>` : ''}
            </div>
        `;
    }).join('');

    container.querySelectorAll('.report-card').forEach(card => {
        card.addEventListener('click', () => {
            const detail = document.getElementById(`reportDetail${card.dataset.idx}`);
            detail.classList.toggle('open');
        });
    });

    container.querySelectorAll('.btn-delete-report').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Delete this report? This cannot be undone.')) return;
            try {
                await scoutingManager.deleteReport(btn.dataset.id);
                _reports = _reports.filter(r => r.id !== btn.dataset.id);
                _player = scoutingManager.getPlayer(_playerId);
                renderHeader();
                renderReports();
                renderRadarChart();
                showToast('Report deleted', 'success');
            } catch (err) {
                showToast('Failed: ' + err.message, 'error');
            }
        });
    });
}

function renderReportDetail(report) {
    const sections = report.report_type === 'quick' ? QUICK_REPORT_SECTIONS : REPORT_SECTIONS;
    const ratings = report.ratings || {};
    const feedback = report.feedback || {};

    let html = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">`;
    html += sections.map(section => {
        const rows = section.attributes.map(a => {
            const val = ratings[a.key];
            return val ? `<div class="rd-row"><span>${a.label}</span><span class="val" style="color:${avgColor(val)}">${val}/5</span></div>` : '';
        }).filter(Boolean).join('');
        if (!rows) return '';
        return `<div class="rd-section">
            <div class="rd-section-title" style="color:${section.color};"><i class="fas ${section.icon}" style="margin-right:4px;"></i>${section.label}</div>
            ${rows}
        </div>`;
    }).join('');
    html += `</div>`;

    if (feedback.strengths || feedback.weaknesses || feedback.recommendation) {
        html += `<div class="rd-feedback" style="margin-top:12px;">`;
        if (feedback.strengths) html += `<strong>Strengths</strong><p>${esc(feedback.strengths)}</p>`;
        if (feedback.weaknesses) html += `<strong>Weaknesses</strong><p>${esc(feedback.weaknesses)}</p>`;
        if (feedback.recommendation) html += `<strong>Recommendation</strong><p>${esc(feedback.recommendation)}</p>`;
        html += `</div>`;
    }

    return html || '<p style="color:#94a3b8;font-size:0.82rem;">No ratings recorded</p>';
}

/* ── Videos ── */
function renderVideos() {
    const container = document.getElementById('videosList');
    if (!_videos.length) {
        container.innerHTML = `<p style="color:#94a3b8;font-size:0.85rem;text-align:center;padding:20px;">No videos yet. Add one above.</p>`;
        return;
    }

    container.innerHTML = _videos.map(v => {
        const date = v.created_at ? new Date(v.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        return `<div class="video-card">
            <div class="video-card-icon"><i class="fas fa-play-circle"></i></div>
            <div class="video-card-info">
                <div class="video-card-title">${esc(v.title)}</div>
                <div class="video-card-date">${date}</div>
            </div>
            <a href="${esc(v.url)}" target="_blank" rel="noopener" class="dash-btn outline sm" style="padding:4px 10px;text-decoration:none;">
                <i class="fas fa-external-link-alt"></i>
            </a>
            ${canManage(_profile) ? `<button class="dash-btn outline sm btn-delete-video" data-id="${v.id}" style="padding:4px 8px;color:#ef4444;"><i class="fas fa-trash"></i></button>` : ''}
        </div>`;
    }).join('');

    container.querySelectorAll('.btn-delete-video').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Delete this video?')) return;
            try {
                await scoutingManager.deleteVideo(btn.dataset.id);
                _videos = _videos.filter(v => v.id !== btn.dataset.id);
                renderVideos();
                showToast('Video deleted', 'success');
            } catch (err) {
                showToast('Failed: ' + err.message, 'error');
            }
        });
    });
}

/* ── Header Actions (Edit + Delete) ── */
function renderHeaderActions() {
    const container = document.getElementById('spHeaderActions');
    if (!container) return;
    let html = '';
    if (canManage(_profile)) {
        html += `<button class="dash-btn outline sm" id="btnEditPlayer" title="Edit Info" style="padding:6px 12px;"><i class="fas fa-pen" style="margin-right:4px;"></i>Edit</button>`;
        html += `<button class="dash-btn outline sm" id="btnDeletePlayer" title="Delete" style="padding:6px 12px;color:#ef4444;border-color:#fecaca;"><i class="fas fa-trash" style="margin-right:4px;"></i>Delete</button>`;
    }
    container.innerHTML = html;
}

/* ── Actions (bottom) ── */
function renderActions() {
    const actions = document.getElementById('spActions');
    let html = '';
    if (canManage(_profile)) {
        html += `<button class="dash-btn primary" id="btnPromote"><i class="fas fa-user-plus" style="margin-right:4px;"></i>Promote to Squad</button>`;
    }
    actions.innerHTML = html;
}

/* ── Edit Player Modal ── */
function populateEditDropdowns() {
    const posSelect = document.getElementById('epPosition');
    const footSelect = document.getElementById('epFoot');
    const targetSquad = document.getElementById('epTargetSquad');

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
    if (targetSquad && squadManager.squads) {
        squadManager.squads.forEach(s => {
            targetSquad.insertAdjacentHTML('beforeend', `<option value="${s.id}">${esc(s.name)}</option>`);
        });
    }
}

function openEditModal() {
    const p = _player;
    if (!p) return;
    document.getElementById('epName').value = p.name || '';
    document.getElementById('epDob').value = p.dob || '';
    document.getElementById('epPosition').value = p.position || '';
    document.getElementById('epFoot').value = p.foot || '';
    document.getElementById('epHeight').value = p.height || '';
    document.getElementById('epWeight').value = p.weight || '';
    document.getElementById('epCurrentClub').value = p.current_club || '';
    document.getElementById('epCurrentTeam').value = p.current_team || '';
    document.getElementById('epTargetSquad').value = p.target_squad_id || '';
    document.getElementById('epAgentName').value = p.agent_name || '';
    document.getElementById('epAgentContact').value = p.agent_contact || '';
    document.getElementById('editPlayerModal').classList.add('active');
}

async function saveEditPlayer() {
    const name = document.getElementById('epName').value.trim();
    if (!name) { showToast('Name is required', 'error'); return; }

    const data = {
        name,
        dob: document.getElementById('epDob').value || null,
        position: document.getElementById('epPosition').value || null,
        foot: document.getElementById('epFoot').value || null,
        height: document.getElementById('epHeight').value.trim() || null,
        weight: document.getElementById('epWeight').value.trim() || null,
        current_club: document.getElementById('epCurrentClub').value.trim() || null,
        current_team: document.getElementById('epCurrentTeam').value.trim() || null,
        target_squad_id: document.getElementById('epTargetSquad').value || null,
        agent_name: document.getElementById('epAgentName').value.trim() || null,
        agent_contact: document.getElementById('epAgentContact').value.trim() || null,
    };

    try {
        _player = await scoutingManager.updatePlayer(_playerId, data);
        showToast('Player updated', 'success');
        document.getElementById('editPlayerModal').classList.remove('active');
        renderHeader();
    } catch (err) {
        showToast('Save failed: ' + err.message, 'error');
    }
}

/* ── Events ── */
function wireEvents() {
    // Tabs
    document.querySelectorAll('.sp-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.sp-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tabReports').style.display = tab.dataset.tab === 'reports' ? 'block' : 'none';
            document.getElementById('tabVideos').style.display = tab.dataset.tab === 'videos' ? 'block' : 'none';
            document.getElementById('tabNotes').style.display = tab.dataset.tab === 'notes' ? 'block' : 'none';
        });
    });

    // Notes
    const notesEl = document.getElementById('playerNotes');
    if (notesEl) notesEl.value = _player.notes || '';
    document.getElementById('btnSaveNotes')?.addEventListener('click', async () => {
        try {
            _player = await scoutingManager.updatePlayer(_playerId, { notes: notesEl.value.trim() });
            showToast('Notes saved', 'success');
        } catch (err) {
            showToast('Failed: ' + err.message, 'error');
        }
    });

    // Report buttons — open modals inline
    document.getElementById('btnAddQuickReport')?.addEventListener('click', () => openReportModal('quick'));
    document.getElementById('btnAddFullReport')?.addEventListener('click', () => openReportModal('full'));
    document.getElementById('btnSaveQR')?.addEventListener('click', () => saveReport('quick'));
    document.getElementById('btnSaveFR')?.addEventListener('click', () => saveReport('full'));

    // Video
    document.getElementById('btnAddVideo')?.addEventListener('click', () => {
        document.getElementById('videoTitle').value = '';
        document.getElementById('videoUrl').value = '';
        document.getElementById('videoModal').classList.add('active');
    });
    document.getElementById('btnSaveVideo')?.addEventListener('click', saveVideo);

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

    // Edit player
    document.getElementById('btnEditPlayer')?.addEventListener('click', openEditModal);
    document.getElementById('btnSaveEditPlayer')?.addEventListener('click', saveEditPlayer);

    // Promote
    document.getElementById('btnPromote')?.addEventListener('click', openPromoteModal);
    document.getElementById('btnConfirmPromote')?.addEventListener('click', confirmPromote);

    // Delete (in header)
    document.getElementById('btnDeletePlayer')?.addEventListener('click', async () => {
        if (!confirm(`Delete ${_player.name} and all their scouting reports? This cannot be undone.`)) return;
        try {
            await scoutingManager.deletePlayer(_playerId);
            showToast('Player deleted', 'success');
            window.location.href = '/src/pages/scouting.html';
        } catch (err) {
            showToast('Failed: ' + err.message, 'error');
        }
    });
}

/* ── Report Modals (inline on this page) ── */
function openReportModal(type) {
    const prefix = type === 'quick' ? 'qr' : 'fr';
    const sections = type === 'quick' ? QUICK_REPORT_SECTIONS : REPORT_SECTIONS;
    document.getElementById(`${prefix}PlayerId`).value = _playerId;
    document.getElementById(`${prefix}Date`).value = new Date().toISOString().slice(0, 10);
    document.getElementById(`${prefix}MatchContext`).value = '';
    document.getElementById(`${prefix}Verdict`).value = '';
    document.getElementById(`${prefix}Strengths`).value = '';
    document.getElementById(`${prefix}Weaknesses`).value = '';
    document.getElementById(`${prefix}Recommendation`).value = '';
    renderReportSections(`${prefix}Sections`, sections);
    document.getElementById(`${type === 'quick' ? 'quickReportModal' : 'fullReportModal'}`).classList.add('active');
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
    const containerId = `${prefix}Sections`;
    const sections = type === 'quick' ? QUICK_REPORT_SECTIONS : REPORT_SECTIONS;

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

    const reportData = {
        scouted_player_id: _playerId,
        report_type: type,
        ratings,
        feedback,
        verdict,
        match_context: document.getElementById(`${prefix}MatchContext`).value.trim() || null,
        scout_name: _profile?.full_name || _profile?.email || null,
        created_by: window._profile?.id || null,
        date: document.getElementById(`${prefix}Date`).value || new Date().toISOString().slice(0, 10),
    };

    try {
        const newReport = await scoutingManager.addReport(reportData);
        _reports.unshift(newReport);
        showToast(`${type === 'quick' ? 'Quick' : 'Full'} report saved`, 'success');
        document.getElementById(`${type === 'quick' ? 'quickReportModal' : 'fullReportModal'}`).classList.remove('active');

        // Refresh displays
        _player = scoutingManager.getPlayer(_playerId);
        renderHeader();
        renderReports();
        renderRadarChart();
    } catch (err) {
        showToast('Save failed: ' + err.message, 'error');
    }
}

/* ── Video Save ── */
async function saveVideo() {
    const title = document.getElementById('videoTitle').value.trim();
    const url = document.getElementById('videoUrl').value.trim();
    if (!title || !url) {
        showToast('Title and URL are required', 'error');
        return;
    }

    try {
        const video = await scoutingManager.addVideo({
            scouted_player_id: _playerId,
            title,
            url,
            created_by: window._profile?.id || null,
        });
        _videos.unshift(video);
        renderVideos();
        document.getElementById('videoModal').classList.remove('active');
        showToast('Video added', 'success');
    } catch (err) {
        showToast('Failed: ' + err.message, 'error');
    }
}

/* ── Promote ── */
function openPromoteModal() {
    const select = document.getElementById('promoteSquadSelect');
    select.innerHTML = '<option value="">Select squad...</option>';
    squadManager.squads.forEach(s => {
        select.insertAdjacentHTML('beforeend', `<option value="${s.id}">${esc(s.name)}</option>`);
    });
    document.getElementById('promoteModal').classList.add('active');
}

async function confirmPromote() {
    const squadId = document.getElementById('promoteSquadSelect').value;
    if (!squadId) {
        showToast('Please select a squad', 'error');
        return;
    }
    try {
        await scoutingManager.promoteToSquad(_playerId, squadId);
        showToast(`${_player.name} promoted to squad!`, 'success');
        document.getElementById('promoteModal').classList.remove('active');
        _player = scoutingManager.getPlayer(_playerId);
        renderStatusBar();
    } catch (err) {
        showToast('Promote failed: ' + err.message, 'error');
    }
}

/* ── Helpers ── */
function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

function avgColor(avg) {
    const v = parseFloat(avg);
    if (v >= 4) return '#10b981';
    if (v >= 3) return '#f59e0b';
    if (v >= 2) return '#f97316';
    return '#ef4444';
}
