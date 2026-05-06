/**
 * Player Profile UI Core Logic
 */

import supabase from '../supabase.js';
import squadManager from '../managers/squad-manager.js';
import matchManager from '../managers/match-manager.js';
import { showToast } from '../toast.js';
import { createYearPicker } from './year-picker.js';
import { REPORT_SECTIONS, REPORT_SCALE_LABELS } from './report-sections.js';
import { hasFeature, tierAtLeast } from '../tier.js';
import { uploadToR2, isStoredVideo } from './r2-upload.js';

console.log('Player Profile UI: Script Loaded');

let currentPlayer = null;
let currentPlayerId = null;
let editingDevStructureId = null;
let editingAssessmentId = null;

// ── Unsaved changes tracking ───────────────────────────────────────────────
let _dirty = false;

function markDirty() { _dirty = true; }
function resetDirty() { _dirty = false; }

// ── Platform-style confirm modal ──────────────────────────────────────────────
function ensureProfileConfirmModal() {
    if (document.getElementById('profileConfirmModal')) return;
    const el = document.createElement('div');
    el.id = 'profileConfirmModal';
    el.className = 'modal-overlay';
    el.innerHTML = `
        <div class="modal-container" style="max-width:420px;">
            <div class="modal-header">
                <h2 id="profileConfirmTitle" style="font-size:1rem;font-weight:700;margin:0;"></h2>
            </div>
            <div class="modal-body" style="padding:20px 24px;">
                <p id="profileConfirmMessage" style="font-size:.88rem;color:#475569;margin:0;line-height:1.6;"></p>
            </div>
            <div class="modal-footer">
                <button id="profileConfirmCancel" class="dash-btn outline">Cancel</button>
                <button id="profileConfirmOk" class="dash-btn primary">Confirm</button>
            </div>
        </div>`;
    document.body.appendChild(el);
}

function profileConfirm(title, message, confirmLabel = 'Confirm', isDanger = true) {
    ensureProfileConfirmModal();
    return new Promise(resolve => {
        document.getElementById('profileConfirmTitle').textContent = title;
        document.getElementById('profileConfirmMessage').textContent = message;
        const modal = document.getElementById('profileConfirmModal');
        modal.classList.add('active');
        const oldOk = document.getElementById('profileConfirmOk');
        const newOk = oldOk.cloneNode(true);
        newOk.textContent = confirmLabel;
        newOk.className = 'dash-btn';
        newOk.style.cssText = isDanger ? 'background:#ef4444;color:#fff;border-color:#ef4444;' : 'background:var(--blue-accent);color:#fff;border-color:var(--blue-accent);';
        oldOk.parentNode.replaceChild(newOk, oldOk);
        const oldCancel = document.getElementById('profileConfirmCancel');
        const newCancel = oldCancel.cloneNode(true);
        oldCancel.parentNode.replaceChild(newCancel, oldCancel);
        let settled = false;
        const done = (result) => {
            if (settled) return;
            settled = true;
            modal.classList.remove('active');
            resolve(result);
        };
        document.getElementById('profileConfirmOk').addEventListener('click', () => done(true));
        document.getElementById('profileConfirmCancel').addEventListener('click', () => done(false));
        modal.addEventListener('click', (e) => { if (e.target === modal) done(false); }, { once: true });
    });
}

function confirmLeaveIfDirty(message) {
    if (!_dirty) return Promise.resolve(true);
    return profileConfirm('Unsaved Changes', message || 'You have unsaved changes. Leave without saving?', 'Leave', false);
}

function setupDirtyTracking() {
    const panel = document.getElementById('profEditPanel');
    if (!panel || panel._dirtyWired) return;
    panel._dirtyWired = true;
    panel.addEventListener('input', markDirty);
    panel.addEventListener('change', markDirty);
}

window.addEventListener('beforeunload', (e) => {
    if (_dirty) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Tier helpers removed — use hasFeature() from tier.js (imported above)

// --- Position Groups & Helpers (shared with player-ui.js) ---
const POSITION_GROUPS = [
    { label: 'Forward', positions: [
        { value: 'ST', label: 'Striker (ST)' },
        { value: 'LW', label: 'Left Winger (LW)' },
        { value: 'RW', label: 'Right Winger (RW)' },
        { value: 'CF', label: 'Centre Forward (CF)' },
        { value: 'Winger', label: 'Winger' },
    ]},
    { label: 'Midfielder', positions: [
        { value: 'CAM', label: 'Attacking Midfielder (CAM)' },
        { value: 'CM', label: 'Central Midfielder (CM)' },
        { value: 'CDM', label: 'Defensive Midfielder (CDM)' },
        { value: 'LM', label: 'Left Midfielder (LM)' },
        { value: 'RM', label: 'Right Midfielder (RM)' },
    ]},
    { label: 'Defender', positions: [
        { value: 'CB', label: 'Centre Back (CB)' },
        { value: 'LB', label: 'Left Back (LB)' },
        { value: 'RB', label: 'Right Back (RB)' },
        { value: 'LWB', label: 'Left Wing Back (LWB)' },
        { value: 'RWB', label: 'Right Wing Back (RWB)' },
    ]},
    { label: 'Goalkeeper', positions: [
        { value: 'GK', label: 'Goalkeeper (GK)' },
    ]},
];

function displayAge(ageValue) {
    if (!ageValue) return '--';
    const year = parseInt(ageValue);
    if (year > 1900 && year <= new Date().getFullYear()) {
        return String(new Date().getFullYear() - year);
    }
    return ageValue;
}

function buildPositionSelect(selectId, includeBlank = false) {
    const el = document.getElementById(selectId);
    if (!el || el._posBuilt) return;
    el._posBuilt = true;
    let html = includeBlank ? '<option value="">— None —</option>' : '<option value="">Select...</option>';
    POSITION_GROUPS.forEach(group => {
        html += `<optgroup label="${group.label}">`;
        group.positions.forEach(pos => {
            html += `<option value="${pos.value}">${pos.label}</option>`;
        });
        html += '</optgroup>';
    });
    el.innerHTML = html;
}

function setPositionSelects(primary, secondary, third) {
    ['editProfPositionPrimary', 'editProfPositionSecondary', 'editProfPositionThird'].forEach((id, i) => {
        buildPositionSelect(id, i > 0);
        const el = document.getElementById(id);
        if (!el) return;
        const val = [primary, secondary, third][i] || '';
        el.value = val;
    });
}

function getPositionFromSelects() {
    const vals = ['editProfPositionPrimary', 'editProfPositionSecondary', 'editProfPositionThird']
        .map(id => (document.getElementById(id)?.value || '').trim())
        .filter(Boolean);
    return vals.join(', ');
}

function populateYearOfBirthSelect(selectId) {
    const el = document.getElementById(selectId);
    if (!el) return;
    if (el._yearPicker) return;
    const currentYear = new Date().getFullYear();
    createYearPicker(el, {
        minYear: 1970,
        maxYear: currentYear - 5,
        placeholder: 'Select Year',
    });
}

function populateYearJoinedSelect(selectId) {
    const el = document.getElementById(selectId);
    if (!el || el._yearPicker) return;
    const currentYear = new Date().getFullYear();
    createYearPicker(el, {
        minYear: 2000,
        maxYear: currentYear,
        placeholder: 'Select Year',
    });
}

function populateEditClubs(clubsString) {
    const container = document.getElementById('editProfClubsContainer');
    if (!container) return;
    const clubs = clubsString ? clubsString.split(',').map(s => s.trim()).filter(Boolean) : [''];
    container.innerHTML = clubs.map(club => `
        <div class="club-entry" style="display:flex; gap:8px; margin-bottom:6px;">
            <input type="text" class="form-control-bubble edit-club-input" style="padding: 4px 8px; font-size: 1rem; height: auto;" placeholder="e.g. SuperSport Academy" value="${club}">
            <button type="button" class="dash-btn outline sm btn-remove-edit-club" style="flex-shrink:0; padding:4px 8px;" title="Remove">&times;</button>
        </div>
    `).join('');
}

function getEditClubs() {
    const inputs = document.querySelectorAll('#editProfClubsContainer .edit-club-input');
    return Array.from(inputs).map(i => i.value.trim()).filter(Boolean).join(', ');
}

// REPORT_SECTIONS and REPORT_SCALE_LABELS imported from report-sections.js

export async function initPlayerProfileUI() {
    console.log('Player Profile UI: Initializing...');
    try {
        const initialized = await squadManager.init();
        if (!initialized) {
            console.error('Player Profile: Manager failed to initialize');
            return;
        }

        // Parse ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        currentPlayerId = urlParams.get('id');

        if (!currentPlayerId) {
            showToast('No player ID provided', 'error');
            window.location.href = 'players.html';
            return;
        }

        const players = squadManager.getPlayers();
        console.log('Player Profile: Found', players.length, 'players in manager');

        // Use == to handle string/number mismatch from URL vs storage
        currentPlayer = players.find(p => p.id == currentPlayerId);

        if (!currentPlayer) {
            console.error('Player Profile: Player NOT found for ID:', currentPlayerId);
            showToast('Player not found', 'error');
            window.location.href = 'players.html';
            return;
        }

        // Expose for share dossier button
        window._currentPlayer = currentPlayer;

        populateProfileHeader();
        initTabVisibility();
        setupTabs();
        setupDirtyTracking();
        setupBackNavigation();
        setupReportsSubNav();
        setupAssessmentForm();
        setupOverviewEditor();
        setupAnalysisTab();
        setupMediaTab();
        renderAssessmentHistory();
        renderOverviewHistory();
        renderPlayerRadarChart();
        renderOverviewRadarChart();

        // Club entry add/remove for profile edit
        const btnAddEditClub = document.getElementById('btnAddEditClubEntry');
        if (btnAddEditClub) btnAddEditClub.addEventListener('click', () => {
            const container = document.getElementById('editProfClubsContainer');
            if (!container) return;
            const div = document.createElement('div');
            div.className = 'club-entry';
            div.style.cssText = 'display:flex; gap:8px; margin-bottom:6px;';
            div.innerHTML = `
                <input type="text" class="form-control-bubble edit-club-input" style="padding: 4px 8px; font-size: 1rem; height: auto;" placeholder="e.g. SuperSport Academy">
                <button type="button" class="dash-btn outline sm btn-remove-edit-club" style="flex-shrink:0; padding:4px 8px;" title="Remove">&times;</button>
            `;
            container.appendChild(div);
        });

        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-remove-edit-club')) {
                const entry = e.target.closest('.club-entry');
                const container = document.getElementById('editProfClubsContainer');
                if (entry && container && container.children.length > 1) {
                    entry.remove();
                } else if (entry) {
                    const input = entry.querySelector('.edit-club-input');
                    if (input) input.value = '';
                }
            }
        });

        // --- Player Action Buttons (now at bottom of Details tab) ---
        const btnProfileDelete = document.getElementById('btnProfileDeletePlayer');
        if (btnProfileDelete) {
            btnProfileDelete.addEventListener('click', async () => {
                const confirmed = await profileConfirm('Delete Player', `Permanently delete ${currentPlayer.name}? This cannot be undone.`, 'Delete Player');
                if (!confirmed) return;
                const ok = await squadManager.deletePlayer(currentPlayerId);
                if (ok) {
                    resetDirty();
                    showToast('Player deleted', 'success');
                    setTimeout(() => { window.location.href = 'players.html'; }, 800);
                } else {
                    showToast('Failed to delete player', 'error');
                }
            });
        }

        const btnProfileAssign = document.getElementById('btnProfileAssignSquad');
        if (btnProfileAssign) {
            btnProfileAssign.addEventListener('click', () => {
                const squads = squadManager.getSquads();
                if (!squads.length) { showToast('No squads available', 'info'); return; }
                const options = squads.map(s => `<option value="${s.id}" ${s.id === currentPlayer.squadId ? 'selected' : ''}>${s.name}</option>`).join('');
                const overlay = document.createElement('div');
                overlay.className = 'modal-overlay active';
                overlay.style.zIndex = '9999';
                overlay.innerHTML = `
                    <div class="modal-container" style="max-width: 400px;">
                        <div class="modal-header">
                            <h2>Assign Squad</h2>
                            <button class="btn-close-modal" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                        </div>
                        <div class="modal-body" style="padding: 24px;">
                            <p style="margin-bottom: 12px; font-size: 0.9rem; color: #64748b;">Assign <strong>${currentPlayer.name}</strong> to a squad:</p>
                            <select id="profileSquadSelect" class="form-control-bubble">${options}</select>
                        </div>
                        <div class="modal-footer">
                            <button class="dash-btn outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                            <button class="dash-btn primary" id="btnConfirmProfileAssign">Assign</button>
                        </div>
                    </div>`;
                document.body.appendChild(overlay);
                overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
                document.getElementById('btnConfirmProfileAssign').addEventListener('click', async () => {
                    const newSquadId = document.getElementById('profileSquadSelect').value;
                    currentPlayer.squadId = newSquadId;
                    const ok = await squadManager.updatePlayer(currentPlayerId, { squadId: newSquadId });
                    overlay.remove();
                    if (ok) {
                        const squad = squads.find(s => s.id === newSquadId);
                        const profSquadEl = document.getElementById('profSquad');
                        if (profSquadEl && squad) profSquadEl.textContent = squad.name;
                        showToast('Squad updated', 'success');
                    } else {
                        showToast('Failed to update squad', 'error');
                    }
                });
            });
        }

    } catch (err) {
        console.error('Player Profile UI: Critical Error in init:', err);
    }
}

function setupBackNavigation() {
    const btn = document.getElementById('btnProfileBack');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        const ok = await confirmLeaveIfDirty('You have unsaved changes. Leave without saving?');
        if (ok) {
            resetDirty();
            window.history.back();
        }
    });
}

// --- Overview & Dev Structures Logic (TuksFootball Player Report) ---
function setupOverviewEditor() {
    console.log('Player Profile: Setting up Player Report form...');

    const dateInput = document.getElementById('overviewDate');
    if (dateInput) dateInput.valueAsDate = new Date();

    const container = document.getElementById('playerReportForm');
    if (!container) return;

    // Build section pairs in 2-column grid (training attendance is auto-calculated from register)
    let html = '<div class="pr-grid">';
    REPORT_SECTIONS.forEach(section => {
        const scaleHint = ['1', '2', '3', '4', '5'].map((n, i) =>
            `<span title="${REPORT_SCALE_LABELS[i]}">${n}</span>`
        ).join('');

        html += `
            <div>
                <div class="rating-matrix has-comment">
                    <div class="rating-matrix-header" style="--header-bg: ${section.color}10; --header-color: ${section.color};">
                        <h3><i class="fas ${section.icon}"></i> ${section.label}</h3>
                        <div class="pr-scale-hint">${scaleHint}</div>
                    </div>
                    ${section.attributes.map(attr => `
                        <div class="rating-row">
                            <span class="attribute">${attr.label}</span>
                            <div class="rating-stars" data-key="pr_${section.key}_${attr.key}">
                                ${[1, 2, 3, 4, 5].map(v => `
                                    <button type="button" data-val="${v}" title="${REPORT_SCALE_LABELS[v - 1]}">${v}</button>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <textarea class="pr-section-comment" id="pr_comment_${section.key}" placeholder="Comments for ${section.label}..." rows="2"></textarea>
            </div>
        `;
    });
    html += '</div>';

    // General Comments
    html += `
        <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 700; color: var(--navy-dark); font-size: 0.9rem;">
                <i class="fas fa-comment-alt" style="margin-right: 8px; color: var(--blue-accent);"></i> General Comments
            </label>
            <textarea class="pr-general-comments" id="pr_general_comments" placeholder="Overall observations, recommendations, development priorities..." rows="4"></textarea>
        </div>
    `;

    container.innerHTML = html;

    // Wire up number-button rating selectors
    container.querySelectorAll('.rating-stars').forEach(group => {
        group.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    });

    // Save button
    const btnSave = document.getElementById('btnSaveDevStructures');
    if (btnSave) {
        btnSave.addEventListener('click', saveDevStructures);
    }
}

async function saveDevStructures() {
    if (!currentPlayerId) return;

    const btn = document.getElementById('btnSaveDevStructures');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    const getButtonValue = (key) => {
        const group = document.querySelector(`.rating-stars[data-key="${key}"]`);
        const active = group?.querySelector('button.active');
        return active ? parseInt(active.dataset.val) : 0;
    };
    // Build structures object
    const structures = { reportVersion: 2 };

    // Each section (uses number buttons)
    REPORT_SECTIONS.forEach(section => {
        const ratings = {};
        section.attributes.forEach(attr => {
            ratings[attr.key] = getButtonValue(`pr_${section.key}_${attr.key}`);
        });
        const commentEl = document.getElementById(`pr_comment_${section.key}`);
        structures[section.key] = {
            ratings,
            comment: commentEl ? commentEl.value.trim() : ''
        };
    });

    // General Comments
    const generalEl = document.getElementById('pr_general_comments');
    structures.generalComments = generalEl ? generalEl.value.trim() : '';

    const date = document.getElementById('overviewDate').value || new Date().toISOString().split('T')[0];

    const success = await squadManager.saveDevStructure({
        id: editingDevStructureId,
        playerId: String(currentPlayerId),
        date,
        structures
    });

    if (success) {
        editingDevStructureId = null;
        btn.innerHTML = '<i class="fas fa-check"></i> Saved!';
        btn.style.background = 'var(--green-accent)';
        showToast('Player report saved', 'success');
        renderOverviewHistory();
        // Clear the form for a fresh entry
        clearPlayerReportForm();
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = '';
            btn.disabled = false;
        }, 1500);
    } else {
        showToast('Failed to save. Please try again.', 'error');
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function clearPlayerReportForm() {
    // Clear all player report radio buttons (pr_ prefix only)
    document.querySelectorAll('input[name^="pr_"][type="radio"]').forEach(r => r.checked = false);
    // Clear section comments
    REPORT_SECTIONS.forEach(s => {
        const el = document.getElementById(`pr_comment_${s.key}`);
        if (el) el.value = '';
    });
    const genEl = document.getElementById('pr_general_comments');
    if (genEl) genEl.value = '';
    // Reset date
    const dateInput = document.getElementById('overviewDate');
    if (dateInput) dateInput.valueAsDate = new Date();
}

async function renderOverviewHistory() {
    const container = document.getElementById('devHistoryContainer');
    if (!container || !currentPlayerId) return;

    const records = await squadManager.getDevStructures(currentPlayerId);

    if (records.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-light); font-size: 0.85rem;">No historical records found.</div>';
        return;
    }

    container.innerHTML = records.map((rec) => {
        const d = new Date(rec.date).toLocaleDateString();
        const isV2 = rec.structures?.reportVersion === 2;
        const title = isV2 ? 'Player Report' : 'Overall Assessment (Legacy)';
        const icon = isV2 ? 'fa-clipboard-check' : 'fa-chart-line';

        // Show average rating badge for v2 reports
        let badge = '';
        if (isV2) {
            const allRatings = [];
            REPORT_SECTIONS.forEach(section => {
                const sectionData = rec.structures[section.key];
                if (sectionData?.ratings) {
                    Object.values(sectionData.ratings).forEach(v => { if (v > 0) allRatings.push(v); });
                }
            });
            if (allRatings.length > 0) {
                const avg = (allRatings.reduce((a, b) => a + b, 0) / allRatings.length).toFixed(1);
                const avgColor = avg >= 4 ? '#10b981' : avg >= 3 ? '#f59e0b' : avg >= 2 ? '#f97316' : '#ef4444';
                badge = `<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;border:2.5px solid ${avgColor};color:${avgColor};font-size:0.75rem;font-weight:700;margin-left:10px;vertical-align:middle;">${avg}</span>`;
            }
        }

        return `
            <div class="dash-card history-item" style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <h4 style="margin: 0 0 4px 0; color: var(--navy-dark); font-size: 1.05rem;">
                            <i class="fas ${icon}" style="margin-right: 6px; color: var(--blue-accent);"></i>${title}${badge}
                        </h4>
                        <span style="font-size: 0.85rem; color: var(--text-secondary);"><i class="far fa-calendar-alt" style="margin-right: 4px;"></i> ${d} &nbsp; | &nbsp; <i class="far fa-clock" style="margin-right: 4px;"></i> Saved on ${new Date(rec.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="dash-btn outline sm" onclick="viewDevStructureDetails('${rec.id}')" title="View Details">
                            <i class="far fa-eye"></i> View
                        </button>
                        ${isV2 ? `<button class="dash-btn outline sm" onclick="loadOverviewFromHistory('${rec.id}')" title="Edit">
                            <i class="fas fa-edit"></i> Edit
                        </button>` : ''}
                        <button class="dash-btn outline sm" onclick="deleteDevStructure('${rec.id}')" style="border-color: #fca5a5; color: #ef4444;" title="Delete">
                            <i class="fas fa-trash-alt"></i> Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

window.deleteDevStructure = async (id) => {
    const ok = await profileConfirm('Delete Record', 'Are you sure you want to delete this overall assessment record?', 'Delete');
    if (!ok) return;
    const success = await squadManager.deleteDevStructure(id);
    if (success) {
        renderOverviewHistory();
        showToast('Record deleted', 'success');
    }
};

window.viewDevStructureDetails = async (id) => {
    const records = await squadManager.getDevStructures(currentPlayerId);
    const rec = records.find(r => r.id == id);
    if (!rec) return;

    const s = rec.structures;
    const isV2 = s?.reportVersion === 2;

    let bodyHtml = '';

    if (isV2) {
        // Training Attendance
        const attVal = s.trainingAttendance || 0;
        const attLabel = attVal > 0 ? REPORT_SCALE_LABELS[attVal - 1] : 'Not rated';
        bodyHtml += `
            <div style="margin-bottom: 20px; padding: 12px 16px; background: #f0f9ff; border-radius: 8px; border: 1px solid #bae6fd;">
                <strong style="color: var(--navy-dark);">Training Attendance:</strong>
                <span style="margin-left: 8px; font-weight: 600; color: var(--blue-accent);">${attLabel} (${attVal}/5)</span>
            </div>
        `;

        // Section grids
        bodyHtml += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">';
        REPORT_SECTIONS.forEach(section => {
            const sData = s[section.key] || {};
            const ratings = sData.ratings || {};
            const comment = sData.comment || '';

            bodyHtml += `<div class="dash-card" style="padding: 0; overflow: hidden;">
                <div style="background: ${section.color}10; padding: 10px 14px; border-bottom: 1px solid ${section.color}20;">
                    <h4 style="margin: 0; font-size: 0.85rem; color: ${section.color}; font-weight: 700;">
                        <i class="fas ${section.icon}" style="margin-right: 6px;"></i>${section.label}
                    </h4>
                </div>
                <div style="padding: 0;">
                    ${section.attributes.map((attr, i) => {
                        const val = ratings[attr.key] || 0;
                        const label = val > 0 ? REPORT_SCALE_LABELS[val - 1] : '—';
                        const bg = i % 2 === 0 ? '#fff' : '#f8fafc';
                        const barWidth = val > 0 ? (val / 5) * 100 : 0;
                        const barColor = val <= 1 ? '#ef4444' : val <= 2 ? '#f59e0b' : val <= 3 ? '#eab308' : val <= 4 ? '#22c55e' : '#10b981';
                        return `<div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; font-size: 0.82rem; background: ${bg}; border-bottom: 1px solid #f1f5f9;">
                            <span style="color: var(--navy-dark); font-weight: 500; flex: 1;">${attr.label}</span>
                            <div style="display: flex; align-items: center; gap: 8px; min-width: 120px; justify-content: flex-end;">
                                <div style="width: 60px; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                                    <div style="width: ${barWidth}%; height: 100%; background: ${barColor}; border-radius: 3px;"></div>
                                </div>
                                <span style="font-weight: 600; color: ${barColor}; font-size: 0.75rem; min-width: 55px; text-align: right;">${label}</span>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
                ${comment ? `<div style="padding: 10px 14px; background: #fafbfc; border-top: 1px solid #e2e8f0; font-size: 0.82rem; color: #475569; font-style: italic;">${comment}</div>` : ''}
            </div>`;
        });
        bodyHtml += '</div>';

        // General Comments
        if (s.generalComments) {
            bodyHtml += `
                <div style="margin-top: 16px; padding: 14px 16px; background: #f8fafc; border-radius: 8px; border: 1px solid var(--border);">
                    <strong style="color: var(--navy-dark); font-size: 0.85rem;"><i class="fas fa-comment-alt" style="margin-right: 6px; color: var(--blue-accent);"></i>General Comments</strong>
                    <p style="margin: 8px 0 0 0; font-size: 0.85rem; color: #475569; line-height: 1.5;">${s.generalComments}</p>
                </div>
            `;
        }
    } else {
        // Legacy format
        bodyHtml = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                ${['bioenergetics', 'conditional', 'coordinative', 'cognitive', 'socio', 'emotional', 'creative', 'mental'].map(key => `
                    <div class="dash-card" style="padding: 15px;">
                        <h4 style="margin: 0 0 10px 0; color: var(--primary); text-transform: capitalize;">${key}</h4>
                        <div style="font-size: 0.9rem; line-height: 1.5;">${s[key] || 'No notes recorded.'}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    const modalHtml = `
        <div class="modal-overlay active" id="modalDevDetails">
            <div class="modal-content-bubble" style="max-width: 900px; width: 95%;">
                <div class="modal-header-bubble">
                    <h3 class="modal-title-bubble">${isV2 ? 'Player Report' : 'Overall Assessment'} Details</h3>
                    <button class="btn-close-modal" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body-bubble" id="print-area-dev" data-record-id="${id}">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid var(--primary); padding-bottom: 10px;">
                        <div>
                            <h2 style="margin: 0; color: var(--navy-dark);">${currentPlayer?.name || 'Player Name'}</h2>
                            <p style="margin: 5px 0 0 0; color: var(--text-secondary);">${isV2 ? 'Player Report' : 'Overall Assessment'} &bull; ${new Date(rec.date).toLocaleDateString()}</p>
                        </div>
                    </div>
                    ${bodyHtml}
                </div>
                <div class="modal-footer-bubble">
                    <button class="dash-btn outline" onclick="this.closest('.modal-overlay').remove()">Close</button>
                    <button class="dash-btn primary" onclick="printDevAssessment()">
                        <i class="fas fa-file-download"></i> Download PDF
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.printDevAssessment = (elementId) => {
    if (!window.jspdf) {
        showToast('PDF library not loaded', 'error');
        return;
    }
    const { jsPDF } = window.jspdf;
    const element = document.getElementById(elementId || 'print-area-dev');
    if (!element) return;

    const doc = new jsPDF();
    const margin = 20;
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const contentW = PW - (margin * 2);

    // Branded Header
    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, PW, 40, 'F');
    doc.setTextColor(255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('PLAYER REPORT', margin, 25);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`UP PERFORMANCE HUB \u00B7 ${currentPlayer?.name || 'Player Report'}`, margin, 33);

    let y = 55;

    // Player Header
    doc.setTextColor(30, 58, 138);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(currentPlayer?.name || 'Player Name', margin, y);
    y += 7;
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    doc.text(`Position: ${currentPlayer?.position || 'N/A'} | Squad: ${document.getElementById('profSquad')?.textContent || 'N/A'}`, margin, y);
    y += 15;

    const addFooter = () => {
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Generated on ${new Date().toLocaleString()} | UP Performance Hub`, PW / 2, PH - 10, { align: 'center' });
    };

    const checkPage = (needed) => {
        if (y + needed > PH - 20) {
            addFooter();
            doc.addPage();
            y = 20;
        }
    };

    // Try to get record data from the modal
    const recordId = element.getAttribute('data-record-id');
    let recData = null;
    if (recordId) {
        // We'll read from DOM instead since we may not have the data object here
        // Use a simpler approach: detect v2 by checking for the attendance section
        const hasAttendance = element.querySelector('[style*="Training Attendance"]') || element.textContent.includes('Training Attendance');
        if (hasAttendance) {
            // V2 format - parse from DOM
            const allCards = element.querySelectorAll('.dash-card');
            allCards.forEach(card => {
                const titleEl = card.querySelector('h4');
                if (!titleEl) return;
                const title = titleEl.innerText || '';

                checkPage(60);

                // Section header
                doc.setFontSize(11);
                doc.setTextColor(30, 58, 138);
                doc.setFont('helvetica', 'bold');
                doc.text(title.toUpperCase(), margin, y);
                y += 2;

                // Draw a thin line
                doc.setDrawColor(30, 58, 138);
                doc.setLineWidth(0.5);
                doc.line(margin, y, margin + contentW, y);
                y += 6;

                // Attribute rows
                const rows = card.querySelectorAll('div[style*="justify-content: space-between"]');
                rows.forEach(row => {
                    const spans = row.querySelectorAll('span');
                    if (spans.length < 2) return;
                    const attrName = spans[0].innerText.trim();
                    const ratingLabel = spans[spans.length - 1].innerText.trim();
                    if (!attrName || attrName === '') return;

                    checkPage(7);

                    doc.setFontSize(9);
                    doc.setTextColor(60);
                    doc.setFont('helvetica', 'normal');
                    doc.text(attrName, margin + 2, y);
                    doc.setFont('helvetica', 'bold');
                    doc.text(ratingLabel, PW - margin, y, { align: 'right' });
                    y += 5;
                });

                // Section comment
                const commentEl = card.querySelector('div[style*="font-style: italic"]');
                if (commentEl) {
                    checkPage(12);
                    doc.setFontSize(8);
                    doc.setTextColor(100);
                    doc.setFont('helvetica', 'italic');
                    const commentText = doc.splitTextToSize(commentEl.innerText.trim(), contentW - 4);
                    doc.text(commentText, margin + 2, y);
                    y += (commentText.length * 4) + 4;
                }

                y += 8;
            });

            // General comments from DOM
            const genSection = element.querySelector('div[style*="General Comments"]');
            if (genSection) {
                const genP = genSection.querySelector('p');
                if (genP && genP.innerText.trim()) {
                    checkPage(20);
                    doc.setFontSize(11);
                    doc.setTextColor(30, 58, 138);
                    doc.setFont('helvetica', 'bold');
                    doc.text('GENERAL COMMENTS', margin, y);
                    y += 6;
                    doc.setFontSize(9);
                    doc.setTextColor(60);
                    doc.setFont('helvetica', 'normal');
                    const genText = doc.splitTextToSize(genP.innerText.trim(), contentW);
                    doc.text(genText, margin, y);
                    y += (genText.length * 5) + 8;
                }
            }
        } else {
            // Legacy format
            const cards = element.querySelectorAll('.dash-card');
            cards.forEach(card => {
                const title = card.querySelector('h4')?.innerText || '';
                const bodyText = card.querySelector('div')?.innerText || '';

                checkPage(30);

                doc.setFontSize(12);
                doc.setTextColor(30, 58, 138);
                doc.setFont('helvetica', 'bold');
                doc.text(title.toUpperCase(), margin, y);
                y += 6;

                doc.setFontSize(10);
                doc.setTextColor(60);
                doc.setFont('helvetica', 'normal');
                const splitText = doc.splitTextToSize(bodyText, contentW);
                doc.text(splitText, margin, y);
                y += (splitText.length * 5) + 12;
            });
        }
    }

    addFooter();

    const filename = `Player_Report_${currentPlayer?.name || 'Report'}_${new Date().toISOString().split('T')[0]}.pdf`.replace(/\s+/g, '_');

    try {
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`PDF Exported: ${filename}`, 'success');
    } catch (err) {
        console.error('PDF Save failed:', err);
    }
};

// Global export for internal loading
window.loadOverviewFromHistory = async (id) => {
    const records = await squadManager.getDevStructures(currentPlayerId);
    const fullRecord = records.find(r => r.id == id);
    if (!fullRecord) return;

    const s = fullRecord.structures;

    if (!s?.reportVersion || s.reportVersion !== 2) {
        // Legacy format — can't load into new form
        showToast('Legacy format — opening view only', 'info');
        viewDevStructureDetails(id);
        return;
    }

    // Populate each section (uses number buttons)
    REPORT_SECTIONS.forEach(section => {
        const sData = s[section.key] || {};
        const ratings = sData.ratings || {};

        // Set number buttons
        section.attributes.forEach(attr => {
            const val = ratings[attr.key];
            if (val) {
                const group = document.querySelector(`.rating-stars[data-key="pr_${section.key}_${attr.key}"]`);
                if (group) {
                    group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                    const btn = group.querySelector(`button[data-val="${val}"]`);
                    if (btn) btn.classList.add('active');
                }
            }
        });

        // Set section comment
        const commentEl = document.getElementById(`pr_comment_${section.key}`);
        if (commentEl) commentEl.value = sData.comment || '';
    });

    // General Comments
    const genEl = document.getElementById('pr_general_comments');
    if (genEl) genEl.value = s.generalComments || '';

    // Update date
    document.getElementById('overviewDate').value = fullRecord.date;
    editingDevStructureId = fullRecord.id;

    // Switch to Reports tab > player-report section
    document.querySelector('[data-tab="reports"]')?.click();
    setTimeout(() => {
        document.querySelector('.report-sub-btn[data-report="player-report"]')?.click();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 50);
    showToast('Report loaded for editing', 'success');
};

function populateProfileHeader() {
    if (!currentPlayer) return;

    const squad = squadManager.getSquads().find(s => s.id === currentPlayer.squadId);

    document.getElementById('profName').textContent = currentPlayer.name;
    document.getElementById('profPosition').textContent = currentPlayer.position;

    // Avatar: show image if available, otherwise initials
    const avatarInitials = document.getElementById('profAvatarInitials');
    const avatarImage = document.getElementById('profAvatarImage');
    if (currentPlayer.profileImageUrl) {
        avatarInitials.style.display = 'none';
        avatarImage.src = currentPlayer.profileImageUrl;
        avatarImage.style.display = 'block';
    } else {
        avatarInitials.style.display = 'flex';
        avatarInitials.textContent = currentPlayer.name.substring(0, 2).toUpperCase();
        avatarImage.style.display = 'none';
    }

    // Edit panel avatar preview
    const editPreviewInitials = document.getElementById('editAvatarPreviewInitials');
    const editPreviewImage = document.getElementById('editAvatarPreviewImage');
    const btnRemove = document.getElementById('btnRemoveProfImage');
    if (editPreviewInitials) editPreviewInitials.textContent = currentPlayer.name.substring(0, 2).toUpperCase();
    if (currentPlayer.profileImageUrl) {
        if (editPreviewInitials) editPreviewInitials.style.display = 'none';
        if (editPreviewImage) { editPreviewImage.src = currentPlayer.profileImageUrl; editPreviewImage.style.display = 'block'; }
        if (btnRemove) btnRemove.style.display = '';
    } else {
        if (editPreviewInitials) editPreviewInitials.style.display = 'flex';
        if (editPreviewImage) editPreviewImage.style.display = 'none';
        if (btnRemove) btnRemove.style.display = 'none';
    }
    document.getElementById('profSquad').textContent = squad ? squad.name : 'Unassigned';

    const profStatusSel = document.getElementById('profStatusSelect');
    if (profStatusSel) {
        const status = currentPlayer.playerStatus || 'active';
        profStatusSel.value = status;
        profStatusSel.className = `player-status-select status-${status}`;
    }

    // Toggle edit form fields (archetype-specific fields)
    const isPC = window._profile?.clubs?.settings?.archetype === 'private_coaching';
    const editSchoolSelectBox = document.getElementById('editProfSchoolSelectBox');
    const editSchoolTextBox = document.getElementById('editProfSchoolTextBox');
    const editCurrentClubBox = document.getElementById('editProfCurrentClubBox');
    const editNewToClubBox = document.getElementById('editProfNewToClubBox');
    if (isPC) {
        if (editSchoolSelectBox) editSchoolSelectBox.style.display = 'none';
        if (editSchoolTextBox) editSchoolTextBox.style.display = '';
        if (editCurrentClubBox) editCurrentClubBox.style.display = '';
        if (editNewToClubBox) editNewToClubBox.style.display = 'none';
    } else {
        if (editSchoolSelectBox) editSchoolSelectBox.style.display = '';
        if (editSchoolTextBox) editSchoolTextBox.style.display = 'none';
        if (editCurrentClubBox) editCurrentClubBox.style.display = 'none';
        if (editNewToClubBox) editNewToClubBox.style.display = '';
    }

    // Populate Edit Form
    populateYearOfBirthSelect('editProfAge');
    const editAgeEl = document.getElementById('editProfAge');
    if (editAgeEl?._yearPicker) editAgeEl._yearPicker.setValue(currentPlayer.age || '');
    else editAgeEl.value = currentPlayer.age || '';

    // Year Joined Club picker
    populateYearJoinedSelect('editProfYearJoined');
    const editYearJoinedEl = document.getElementById('editProfYearJoined');
    if (editYearJoinedEl?._yearPicker) editYearJoinedEl._yearPicker.setValue(currentPlayer.yearJoined || '');
    else if (editYearJoinedEl) editYearJoinedEl.value = currentPlayer.yearJoined || '';
    document.getElementById('editProfHeight').value = currentPlayer.height || '';
    document.getElementById('editProfWeight').value = currentPlayer.weight || '';
    document.getElementById('editProfFoot').value = currentPlayer.foot || 'Right';
    const posParts = (currentPlayer.position || '').split(',').map(s => s.trim());
    setPositionSelects(posParts[0] || '', posParts[1] || '', posParts[2] || '');
    populateEditClubs(currentPlayer.previousClubs || '');
    if (isPC) {
        const editSchoolText = document.getElementById('editProfSchoolText');
        if (editSchoolText) editSchoolText.value = currentPlayer.school || '';
        const editCurrentClub = document.getElementById('editProfCurrentClub');
        if (editCurrentClub) editCurrentClub.value = currentPlayer.currentClub || '';
    } else {
        const editSchool = document.getElementById('editProfSchool');
        if (editSchool) editSchool.value = currentPlayer.school || '';
        const editNewToClub = document.getElementById('editProfNewToClub');
        if (editNewToClub) editNewToClub.value = currentPlayer.newToClub ? 'true' : 'false';
    }

    // Populate new fields
    const _setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    _setVal('editProfJersey', currentPlayer.jerseyNumber);
    _setVal('editProfNationality', currentPlayer.nationality);
    _setVal('editProfPhone', currentPlayer.phone);
    _setVal('editProfEmail', currentPlayer.email);
    _setVal('editProfParentName', currentPlayer.parentName);
    _setVal('editProfParentPhone', currentPlayer.parentPhone);
    _setVal('editProfParentEmail', currentPlayer.parentEmail);
    _setVal('editProfEmergencyName', currentPlayer.emergencyContactName);
    _setVal('editProfEmergencyPhone', currentPlayer.emergencyContactPhone);
    _setVal('editProfMedical', currentPlayer.medicalInfo);

    // Wire save button once
    const btnSave = document.getElementById('btnSaveProfileInfo');
    if (btnSave && !btnSave._wired) {
        btnSave._wired = true;
        btnSave.addEventListener('click', saveProfileInfo);
    }

    // Profile image upload handler (wire once)
    const imageInput = document.getElementById('editProfImageInput');
    if (imageInput && !imageInput._wired) {
        imageInput._wired = true;
        imageInput.addEventListener('change', handleProfileImageSelect);
    }
    const btnRemoveImg = document.getElementById('btnRemoveProfImage');
    if (btnRemoveImg && !btnRemoveImg._wired) {
        btnRemoveImg._wired = true;
        btnRemoveImg.addEventListener('click', handleRemoveProfileImage);
    }

}

function initTabVisibility() {
    const reportsBtn = document.getElementById('tabBtnReports');
    const analysisBtn = document.getElementById('tabBtnAnalysis');
    const mediaBtn = document.querySelector('.tab-btn[data-tab="media"]');
    const mediaSingle = document.getElementById('mediaSingleHighlight');
    const mediaBase = document.getElementById('mediaBaseMessage');

    if (reportsBtn) {
        if (!hasFeature('player_reports')) {
            reportsBtn.classList.add('tier-locked');
            reportsBtn.title = 'Upgrade to Basic to access Reports';
        }
    }
    if (mediaBtn) {
        if (!hasFeature('media_tabs')) {
            mediaBtn.classList.add('tier-locked');
            mediaBtn.title = 'Upgrade to Pro to access Media';
        }
    }
    if (analysisBtn) {
        if (!hasFeature('media_tabs')) {
            analysisBtn.classList.add('tier-locked');
            analysisBtn.title = 'Upgrade to Pro to access Analysis';
        }
    }
    if (mediaSingle) mediaSingle.style.display = hasFeature('media_tabs') ? '' : 'none';
    if (mediaBase) mediaBase.style.display = hasFeature('media_tabs') ? 'none' : '';
}

function _triggerTabLoad(tabName) {
    if (tabName === 'stats') {
        loadCareerStats(currentPlayerId);
        loadTrainingAttendance(currentPlayerId);
    }
    if (tabName === 'analysis') {
        renderHighlights();
        renderAnalysisVideos();
    }
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = tab.getAttribute('data-tab');

            // Block tier-locked tabs
            if (tab.classList.contains('tier-locked')) {
                showToast(tab.title || 'Upgrade required', 'info');
                return;
            }

            // Warn if leaving Details tab with unsaved changes
            const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab');
            if (activeTab === 'details' && tabName !== 'details' && _dirty) {
                profileConfirm('Unsaved Changes', 'You have unsaved changes. Leave without saving?', 'Leave', false)
                    .then(ok => {
                        if (!ok) return;
                        resetDirty();
                        tabs.forEach(t => t.classList.remove('active'));
                        contents.forEach(c => c.classList.remove('active'));
                        tab.classList.add('active');
                        const targetEl = document.getElementById('tab-' + tabName);
                        if (targetEl) targetEl.classList.add('active');
                        _triggerTabLoad(tabName);
                    });
                return;
            }

            // Remove active
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // Add active
            tab.classList.add('active');
            const targetEl = document.getElementById('tab-' + tabName);
            if (targetEl) targetEl.classList.add('active');

            _triggerTabLoad(tabName);
        });
    });
}

function setupReportsSubNav() {
    const subBtns = document.querySelectorAll('.report-sub-btn');
    const sections = document.querySelectorAll('.report-section');

    // Gate sub-tabs that require Pro+
    const assessSubBtn = document.querySelector('.report-sub-btn[data-report="new-assessment"]');
    const historySubBtn = document.querySelector('.report-sub-btn[data-report="history"]');
    if (assessSubBtn && !hasFeature('assessments')) {
        assessSubBtn.classList.add('tier-locked');
        assessSubBtn.title = 'Upgrade to Pro to create Assessments';
        assessSubBtn.style.opacity = '0.5';
    }
    if (historySubBtn && !hasFeature('assessment_history')) {
        historySubBtn.classList.add('tier-locked');
        historySubBtn.title = 'Upgrade to Pro to view Assessment History';
        historySubBtn.style.opacity = '0.5';
    }

    subBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains('tier-locked')) {
                showToast(btn.title || 'Upgrade required', 'info');
                return;
            }
            const target = btn.getAttribute('data-report');

            subBtns.forEach(b => b.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));

            btn.classList.add('active');
            const targetEl = document.getElementById('report-section-' + target);
            if (targetEl) targetEl.classList.add('active');

            if (target === 'history') {
                renderAssessmentHistory();
                renderOverviewHistory();
                renderPlayerRadarChart();
                renderOverviewRadarChart();
            }
        });
    });

    // Activate first sub-section by default
    if (subBtns.length > 0) subBtns[0].click();
}

function setupAssessmentForm() {
    document.getElementById('assessDate').valueAsDate = new Date();

    // Auto-fill evaluator from logged-in user
    const evalInput = document.getElementById('assessEvaluator');
    if (evalInput && window._profile?.full_name) {
        evalInput.value = window._profile.full_name;
    }

    // Auto-fill team from player's squad
    const teamInput = document.getElementById('assessTeam');
    if (teamInput && currentPlayer?.squadId) {
        const squad = squadManager.getSquads().find(s => s.id === currentPlayer.squadId);
        if (squad) teamInput.value = squad.name;
    }

    // Wire up number-button rating selectors
    document.querySelectorAll('#report-section-new-assessment .rating-stars').forEach(group => {
        group.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    });

    const btnSubmit = document.getElementById('btnSubmitAssessment');
    if (btnSubmit) {
        btnSubmit.addEventListener('click', saveAssessment);
    }

    // Modal Close Logic
    const closeBtns = document.querySelectorAll('.btn-close-modal, [data-close-modal]');
    closeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const modals = document.querySelectorAll('.modal-overlay');
            modals.forEach(m => m.classList.remove('active'));
            // If the element was dynamically added (bubble modal), also remove it
            const bubbleModal = btn.closest('.modal-overlay');
            if (bubbleModal && bubbleModal.hasAttribute('id') === false) {
                bubbleModal.remove();
            }
        });
    });

    // Close on overlay click
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
}

async function saveAssessment() {
    const btnSubmit = document.getElementById('btnSubmitAssessment');
    if (!btnSubmit) return;

    const originalText = btnSubmit.innerHTML;
    btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    btnSubmit.disabled = true;

    // Gather Ratings from number buttons
    const getButtonValue = (key) => {
        const group = document.querySelector(`.rating-stars[data-key="${key}"]`);
        const active = group?.querySelector('button.active');
        return active ? parseInt(active.dataset.val) : 0;
    };

    const record = {
        id: editingAssessmentId,
        playerId: currentPlayerId,
        date: document.getElementById('assessDate').value,
        author: document.getElementById('assessEvaluator').value || window._profile?.full_name || 'System',
        matchId: document.getElementById('assessMatch').value,
        notes: document.getElementById('assessComments').value.trim(),
        ratings: {
            tactical: {
                positioning: getButtonValue('tac_pos'),
                decision: getButtonValue('tac_dec'),
                awareness: getButtonValue('tac_awa'),
                creativity: getButtonValue('tac_cre')
            },
            technical: {
                passing: getButtonValue('tec_pas'),
                touch: getButtonValue('tec_tou'),
                control: getButtonValue('tec_con'),
                dribbling: getButtonValue('tec_dri')
            },
            physical: {
                speed: getButtonValue('phy_spe'),
                agility: getButtonValue('phy_agi'),
                stamina: getButtonValue('phy_sta'),
                strength: getButtonValue('phy_str')
            },
            psychological: {
                workEthic: getButtonValue('psy_wor'),
                communication: getButtonValue('psy_com'),
                focus: getButtonValue('psy_foc'),
                resilience: getButtonValue('psy_res')
            }
        },
    };

    console.log('Final Assessment Record:', record);

    const success = await squadManager.saveAssessment(record);

    if (success) {
        editingAssessmentId = null;
        btnSubmit.innerHTML = '<i class="fas fa-check"></i> Report Submitted!';
        btnSubmit.style.background = 'var(--green-accent)';

        setTimeout(() => {
            btnSubmit.innerHTML = originalText;
            btnSubmit.style.background = '';
            btnSubmit.disabled = false;

            // Clear form (only assessment ratings + comments, not evaluator/team)
            document.querySelectorAll('#report-section-new-assessment .rating-stars button').forEach(b => b.classList.remove('active'));
            document.getElementById('assessComments').value = '';
            document.getElementById('assessMatch').value = '';

            // Refresh history
            renderAssessmentHistory();
        }, 1500);
    } else {
        showToast('Failed to save assessment. Check connection.', 'error');
        btnSubmit.innerHTML = originalText;
        btnSubmit.disabled = false;
    }
}

async function renderAssessmentHistory() {
    if (!currentPlayerId) return;
    const historyData = await squadManager.getAssessments(currentPlayerId);
    const container = document.getElementById('assessmentHistoryContainer');
    if (!container) return;

    if (historyData.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-muted); background: #f8fafc; border-radius: 12px; border: 1px dashed var(--border);">
                <i class="fas fa-file-invoice" style="font-size: 2.5rem; margin-bottom: 16px; opacity: 0.5;"></i>
                <p>No reports found. Create a new assessment to begin tracking.</p>
            </div>
        `;
        return;
    }

    // Fetch match details for assessments linked to matches (for better titles)
    const matchIds = historyData.filter(r => r.matchId).map(r => r.matchId);
    let matchMap = {};
    if (matchIds.length > 0) {
        const { data: matches } = await supabase.from('matches').select('id, opponent, date').in('id', matchIds);
        if (matches) matches.forEach(m => { matchMap[m.id] = m; });
    }

    container.innerHTML = historyData.map(record => {
        const d = new Date(record.date).toLocaleDateString();
        let title = 'Performance Assessment';
        if (record.matchId) {
            const match = matchMap[record.matchId];
            title = match ? `Match: vs ${match.opponent}` : `Match Assessment`;
        }

        // Compute global average from ratings
        let globalAvg = null;
        if (record.ratings) {
            const allVals = [];
            Object.values(record.ratings).forEach(cat => {
                if (cat && typeof cat === 'object') {
                    Object.values(cat).forEach(v => { if (typeof v === 'number' && v > 0) allVals.push(v); });
                }
            });
            if (allVals.length > 0) {
                globalAvg = (allVals.reduce((a, b) => a + b, 0) / allVals.length).toFixed(1);
            }
        }
        const avgColor = globalAvg >= 4 ? '#10b981' : globalAvg >= 3 ? '#f59e0b' : globalAvg >= 2 ? '#f97316' : '#ef4444';

        return `
        <div class="dash-card history-item" style="margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <h4 style="margin: 0 0 4px 0; color: var(--navy-dark); font-size: 1.05rem;">${title}${globalAvg ? `<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;border:2.5px solid ${avgColor};color:${avgColor};font-size:0.75rem;font-weight:700;margin-left:10px;vertical-align:middle;">${globalAvg}</span>` : ''}</h4>
                    <span style="font-size: 0.85rem; color: var(--text-secondary);"><i class="far fa-calendar-alt" style="margin-right: 4px;"></i> ${d} &nbsp; | &nbsp; <i class="far fa-user" style="margin-right: 4px;"></i> Evaluator: ${record.author || record.evaluator || 'Unknown'}</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="dash-btn outline sm" onclick="viewAssessmentDetails('${record.id}')">
                        <i class="far fa-eye"></i> View
                    </button>
                    <button class="dash-btn outline sm" onclick="deleteAssessment('${record.id}')" style="border-color: #fca5a5; color: #ef4444;">
                        <i class="fas fa-trash-alt"></i> Delete
                    </button>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

async function renderPlayerRadarChart() {
    if (!currentPlayerId) return;
    const container = document.getElementById('playerRadarContainer');
    const svgEl = document.getElementById('playerRadarChart');
    const legendEl = document.getElementById('playerRadarLegend');
    if (!container || !svgEl) return;

    const historyData = await squadManager.getAssessments(currentPlayerId);
    if (!historyData.length || !historyData[0].ratings) {
        container.style.display = 'none';
        return;
    }

    const latest = historyData[0];
    const categories = [
        { key: 'tactical', label: 'Tactical', icon: 'fa-chess-knight', color: '#3b82f6' },
        { key: 'technical', label: 'Technical', icon: 'fa-bolt', color: '#f59e0b' },
        { key: 'physical', label: 'Physical', icon: 'fa-dumbbell', color: '#ef4444' },
        { key: 'psychological', label: 'Psychological', icon: 'fa-brain', color: '#8b5cf6' },
    ];

    // Compute category averages
    const avgs = {};
    for (const cat of categories) {
        const catData = latest.ratings[cat.key];
        if (catData && typeof catData === 'object') {
            const vals = Object.values(catData).filter(v => typeof v === 'number' && v > 0);
            avgs[cat.key] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        } else {
            avgs[cat.key] = 0;
        }
    }

    const cx = 220, cy = 160, maxR = 100;
    const n = categories.length;
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

    // Axis lines + labels
    for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + i * angleStep;
        const x2 = cx + maxR * Math.cos(angle);
        const y2 = cy + maxR * Math.sin(angle);
        svg += `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="#e2e8f0" stroke-width="1"/>`;
        const labelR = maxR + 16;
        const lx = cx + labelR * Math.cos(angle);
        const ly = cy + labelR * Math.sin(angle);
        const cosVal = Math.cos(angle);
        const anchor = cosVal < -0.1 ? 'end' : cosVal > 0.1 ? 'start' : 'middle';
        svg += `<text x="${lx}" y="${ly}" text-anchor="${anchor}" dominant-baseline="middle" font-size="11" fill="#64748b" font-weight="600">${categories[i].label}</text>`;
    }

    // Data polygon
    const dataPts = [];
    for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + i * angleStep;
        const val = avgs[categories[i].key] || 0;
        const r = (val / 5) * maxR;
        dataPts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
    }
    svg += `<polygon points="${dataPts.join(' ')}" fill="rgba(0,196,154,0.2)" stroke="#00C49A" stroke-width="2"/>`;

    // Data dots
    for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + i * angleStep;
        const val = avgs[categories[i].key] || 0;
        const r = (val / 5) * maxR;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        svg += `<circle cx="${px}" cy="${py}" r="4" fill="#00C49A" stroke="#fff" stroke-width="2"/>`;
    }

    svgEl.innerHTML = svg;
    container.style.display = 'block';

    // Legend
    legendEl.innerHTML = categories.map(cat => {
        const val = (avgs[cat.key] || 0).toFixed(1);
        return `<span style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:${cat.color};display:inline-block;"></span><strong>${cat.label}:</strong> ${val}/5</span>`;
    }).join('');
}

async function renderOverviewRadarChart() {
    if (!currentPlayerId) return;
    const container = document.getElementById('overviewRadarContainer');
    const svgEl = document.getElementById('overviewRadarChart');
    const legendEl = document.getElementById('overviewRadarLegend');
    if (!container || !svgEl) return;

    const records = await squadManager.getDevStructures(currentPlayerId);
    // Find latest v2 report
    const latest = records.find(r => r.structures?.reportVersion === 2);
    if (!latest) {
        container.style.display = 'none';
        return;
    }

    const s = latest.structures;

    // Compute category averages for each REPORT_SECTION
    const avgs = {};
    REPORT_SECTIONS.forEach(section => {
        const sData = s[section.key];
        if (sData?.ratings) {
            const vals = Object.values(sData.ratings).filter(v => typeof v === 'number' && v > 0);
            avgs[section.key] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        } else {
            avgs[section.key] = 0;
        }
    });

    const cx = 200, cy = 175, maxR = 100;
    const n = REPORT_SECTIONS.length;
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

    // Axis lines + labels
    for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + i * angleStep;
        const x2 = cx + maxR * Math.cos(angle);
        const y2 = cy + maxR * Math.sin(angle);
        svg += `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="#e2e8f0" stroke-width="1"/>`;
        const labelR = maxR + 18;
        const lx = cx + labelR * Math.cos(angle);
        const ly = cy + labelR * Math.sin(angle);
        const cosVal = Math.cos(angle);
        const anchor = cosVal < -0.1 ? 'end' : cosVal > 0.1 ? 'start' : 'middle';
        // Use shorter label for display
        const shortLabel = REPORT_SECTIONS[i].label.replace('Technical - ', 'Tech ').replace('Tactical - ', 'Tac ');
        svg += `<text x="${lx}" y="${ly}" text-anchor="${anchor}" dominant-baseline="middle" font-size="10" fill="#64748b" font-weight="600">${shortLabel}</text>`;
    }

    // Data polygon
    const dataPts = [];
    for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + i * angleStep;
        const val = avgs[REPORT_SECTIONS[i].key] || 0;
        const r = (val / 5) * maxR;
        dataPts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
    }
    svg += `<polygon points="${dataPts.join(' ')}" fill="rgba(16,185,129,0.15)" stroke="#10b981" stroke-width="2"/>`;

    // Data dots
    for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + i * angleStep;
        const val = avgs[REPORT_SECTIONS[i].key] || 0;
        const r = (val / 5) * maxR;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        svg += `<circle cx="${px}" cy="${py}" r="4" fill="#10b981" stroke="#fff" stroke-width="2"/>`;
    }

    svgEl.innerHTML = svg;
    container.style.display = 'block';

    // Legend
    legendEl.innerHTML = REPORT_SECTIONS.map(section => {
        const val = (avgs[section.key] || 0).toFixed(1);
        return `<span style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:${section.color};display:inline-block;"></span><strong>${section.label.replace('Technical - ', 'Tech ').replace('Tactical - ', 'Tac ')}:</strong> ${val}/5</span>`;
    }).join('');
}

window.deleteAssessment = async (id) => {
    const ok = await profileConfirm('Delete Assessment', 'Are you sure you want to delete this assessment?', 'Delete');
    if (!ok) return;
    const success = await squadManager.deleteAssessment(id);
    if (success) {
        renderAssessmentHistory();
        showToast('Assessment deleted', 'success');
    }
};

window.loadAssessmentForEdit = async (id) => {
    const historyData = await squadManager.getAssessments(currentPlayerId);
    const record = historyData.find(r => String(r.id) === String(id));
    if (!record) {
        console.error('Assessment not found for ID:', id);
        return;
    }

    // Populate metadata
    document.getElementById('assessMatch').value = record.matchId || '';
    editingAssessmentId = record.id;

    // Helper to set number button active
    const setButton = (key, value) => {
        const group = document.querySelector(`.rating-stars[data-key="${key}"]`);
        if (!group || !value) return;
        group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        const btn = group.querySelector(`button[data-val="${value}"]`);
        if (btn) btn.classList.add('active');
    };

    // Populate Ratings
    const r = record.ratings;
    if (r) {
        if (r.tactical) {
            setButton('tac_pos', r.tactical.positioning);
            setButton('tac_dec', r.tactical.decision);
            setButton('tac_awa', r.tactical.awareness);
            setButton('tac_cre', r.tactical.creativity);
        }
        if (r.technical) {
            setButton('tec_pas', r.technical.passing);
            setButton('tec_tou', r.technical.touch);
            setButton('tec_con', r.technical.control);
            setButton('tec_dri', r.technical.dribbling);
        }
        if (r.physical) {
            setButton('phy_spe', r.physical.speed);
            setButton('phy_agi', r.physical.agility);
            setButton('phy_sta', r.physical.stamina);
            setButton('phy_str', r.physical.strength);
        }
        if (r.psychological) {
            setButton('psy_wor', r.psychological.workEthic);
            setButton('psy_com', r.psychological.communication);
            setButton('psy_foc', r.psychological.focus);
            setButton('psy_res', r.psychological.resilience);
        }
    }

    // Populate comments
    document.getElementById('assessComments').value = record.notes || '';

    // Switch to Reports > new-assessment section
    document.querySelector('[data-tab="reports"]')?.click();
    setTimeout(() => {
        document.querySelector('.report-sub-btn[data-report="new-assessment"]')?.click();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 50);
    showToast('Assessment loaded for editing', 'success');
};

window.viewAssessmentDetails = async (assessId) => {
    const historyData = await squadManager.getAssessments(currentPlayerId);
    const record = historyData.find(r => r.id == assessId);
    if (!record) return;

    // Set Header
    const evaluatorName = record.author || record.evaluator || 'Unknown';
    document.getElementById('viewAssessMeta').textContent = `Date: ${new Date(record.date).toLocaleDateString()} | Evaluator: ${evaluatorName} | Team: ${record.team || 'N/A'}`;
    if (record.match) {
        document.getElementById('viewAssessTitle').textContent = `Match Report: ${record.match}`;
    } else {
        document.getElementById('viewAssessTitle').textContent = `Overall Performance Review`;
    }

    // Populate Ratings
    const ratingsContainer = document.getElementById('viewAssessRatings');
    ratingsContainer.innerHTML = '';

    const categories = {
        tactical: 'Tactical Analysis',
        technical: 'Technical Skills',
        physical: 'Physical Performance',
        psychological: 'Psychological Assessment'
    };

    if (record.ratings) {
        Object.keys(categories).forEach(catKey => {
            const catData = record.ratings[catKey];
            if (catData) {
                const attrKeys = Object.keys(catData).filter(k => k !== '_comment');
                const comment = catData._comment || '';
                const section = document.createElement('div');
                section.className = 'form-group-bubble';
                section.innerHTML = `
                    <label style="color: var(--blue-accent); border-bottom: 1px solid var(--border); padding-bottom: 8px; margin-bottom: 12px;">${categories[catKey]}</label>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${attrKeys.map(attr => {
                    const val = catData[attr] || 0;
                    let numBtns = '';
                    for (let i = 1; i <= 5; i++) {
                        const isActive = i <= val;
                        numBtns += `<span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:5px;font-size:0.7rem;font-weight:600;border:1px solid ${isActive ? 'var(--primary)' : '#e2e8f0'};background:${isActive ? 'var(--primary)' : '#fff'};color:${isActive ? '#fff' : '#94a3b8'};margin-left:2px;">${i}</span>`;
                    }
                    const label = attr.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                    return `
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-size: 0.85rem; color: var(--text-dark);">${label}</span>
                                    <div style="display:flex;gap:2px;">${numBtns}</div>
                                </div>
                            `;
                }).join('')}
                    </div>
                    ${comment ? `<div style="margin-top:8px;font-size:0.82rem;color:#475569;background:#f8fafc;border-radius:6px;padding:8px 10px;font-style:italic;border:1px solid #e2e8f0;">${comment.replace(/\n/g, '<br>')}</div>` : ''}
                `;
                ratingsContainer.appendChild(section);
            }
        });
    }

    // Populate Feedback
    const feedbackContainer = document.getElementById('viewAssessFeedback');
    feedbackContainer.innerHTML = '';
    const fields = {
        strength: 'Key Strengths',
        improvement: 'Areas to Improve',
        growth: 'Suggestions for Growth',
        comments: 'General Comments'
    };

    if (record.feedback) {
        Object.keys(fields).forEach(fKey => {
            const text = record.feedback[fKey];
            if (text) {
                const div = document.createElement('div');
                div.className = 'form-group-bubble';
                div.innerHTML = `
                    <label>${fields[fKey]}</label>
                    <div style="background: #f8fafc; border-radius: 8px; padding: 12px; font-size: 0.9rem; color: var(--text-dark); line-height: 1.5; border: 1px solid var(--border-light);">
                        ${text.replace(/\n/g, '<br>')}
                    </div>
                `;
                feedbackContainer.appendChild(div);
            }
        });
    }

    // Show Modal
    document.getElementById('modalViewAssessment').classList.add('active');
}

// ── Profile Image Upload ───────────────────────────────────────────────────
let _pendingProfileImage = null; // { file, previewUrl } or 'remove'

function handleProfileImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
        const status = document.getElementById('editProfImageStatus');
        if (status) { status.textContent = 'File too large (max 2MB)'; status.style.color = '#ef4444'; }
        e.target.value = '';
        return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        const status = document.getElementById('editProfImageStatus');
        if (status) { status.textContent = 'Invalid format'; status.style.color = '#ef4444'; }
        e.target.value = '';
        return;
    }

    const previewUrl = URL.createObjectURL(file);
    _pendingProfileImage = { file, previewUrl };

    // Update edit preview
    const editPreviewInitials = document.getElementById('editAvatarPreviewInitials');
    const editPreviewImage = document.getElementById('editAvatarPreviewImage');
    const btnRemove = document.getElementById('btnRemoveProfImage');
    const status = document.getElementById('editProfImageStatus');
    if (editPreviewInitials) editPreviewInitials.style.display = 'none';
    if (editPreviewImage) { editPreviewImage.src = previewUrl; editPreviewImage.style.display = 'block'; }
    if (btnRemove) btnRemove.style.display = '';
    if (status) { status.textContent = file.name; status.style.color = '#10b981'; }
}

function handleRemoveProfileImage() {
    _pendingProfileImage = 'remove';

    const editPreviewInitials = document.getElementById('editAvatarPreviewInitials');
    const editPreviewImage = document.getElementById('editAvatarPreviewImage');
    const btnRemove = document.getElementById('btnRemoveProfImage');
    const status = document.getElementById('editProfImageStatus');
    const imageInput = document.getElementById('editProfImageInput');

    if (editPreviewInitials) { editPreviewInitials.style.display = 'flex'; editPreviewInitials.textContent = (currentPlayer?.name || '--').substring(0, 2).toUpperCase(); }
    if (editPreviewImage) editPreviewImage.style.display = 'none';
    if (btnRemove) btnRemove.style.display = 'none';
    if (status) { status.textContent = 'Photo will be removed on save'; status.style.color = '#f59e0b'; }
    if (imageInput) imageInput.value = '';
}

async function uploadProfileImage(file) {
    const status = document.getElementById('editProfImageStatus');
    if (status) { status.textContent = 'Uploading...'; status.style.color = '#0ea5e9'; }

    // Build path: players/{playerId}/{timestamp}.{ext}
    const ext = file.name.split('.').pop() || 'jpg';
    const filePath = `players/${currentPlayerId}/${Date.now()}.${ext}`;

    const { data, error } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: true,
            contentType: file.type
        });

    if (error) throw new Error(error.message);

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(data.path);

    if (status) { status.textContent = 'Uploaded'; status.style.color = '#10b981'; }
    return publicUrl;
}

window.updateProfileStatus = async function(status) {
    const success = await squadManager.updatePlayerStatus(currentPlayerId, status);
    if (success) {
        if (currentPlayer) currentPlayer.playerStatus = status;
        const sel = document.getElementById('profStatusSelect');
        if (sel) sel.className = `player-status-select status-${status}`;
        const labels = { active: 'Active', injured: 'Injured', sick: 'Sick', suspended: 'Suspended', unavailable: 'Unavailable', trialist: 'Trialist' };
        showToast(labels[status] || status, 'success');
    } else {
        showToast('Failed to update status', 'error');
        const sel = document.getElementById('profStatusSelect');
        if (sel && currentPlayer) { sel.value = currentPlayer.playerStatus || 'active'; }
    }
};

async function saveProfileInfo() {
    const btn = document.getElementById('btnSaveProfileInfo');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    const isPC = window._profile?.clubs?.settings?.archetype === 'private_coaching';
    const updatedData = {
        age: document.getElementById('editProfAge').value,
        height: document.getElementById('editProfHeight').value,
        weight: document.getElementById('editProfWeight').value,
        foot: document.getElementById('editProfFoot').value,
        position: getPositionFromSelects(),
        previousClubs: getEditClubs(),
        school: isPC
            ? (document.getElementById('editProfSchoolText')?.value || '')
            : (document.getElementById('editProfSchool')?.value || ''),
        currentClub: isPC ? (document.getElementById('editProfCurrentClub')?.value || '') : undefined,
        newToClub: isPC ? false : (document.getElementById('editProfNewToClub')?.value === 'true'),
        jerseyNumber: document.getElementById('editProfJersey')?.value || '',
        nationality: document.getElementById('editProfNationality')?.value || '',
        phone: document.getElementById('editProfPhone')?.value || '',
        email: document.getElementById('editProfEmail')?.value || '',
        parentName: document.getElementById('editProfParentName')?.value || '',
        parentPhone: document.getElementById('editProfParentPhone')?.value || '',
        parentEmail: document.getElementById('editProfParentEmail')?.value || '',
        emergencyContactName: document.getElementById('editProfEmergencyName')?.value || '',
        emergencyContactPhone: document.getElementById('editProfEmergencyPhone')?.value || '',
        medicalInfo: document.getElementById('editProfMedical')?.value || '',
        yearJoined: document.getElementById('editProfYearJoined')?.value || '',
    };

    // Handle profile image upload/removal
    try {
        if (_pendingProfileImage === 'remove') {
            updatedData.profileImageUrl = '';
        } else if (_pendingProfileImage && _pendingProfileImage.file) {
            const imageUrl = await uploadProfileImage(_pendingProfileImage.file);
            updatedData.profileImageUrl = imageUrl;
        }
    } catch (imgErr) {
        console.error('Profile image upload failed:', imgErr);
        const status = document.getElementById('editProfImageStatus');
        if (status) { status.textContent = 'Upload failed — saving other details'; status.style.color = '#ef4444'; }
    }

    const success = await squadManager.updatePlayer(currentPlayerId, updatedData);

    if (success) {
        // Update local memory
        currentPlayer = { ...currentPlayer, ...updatedData };
        _pendingProfileImage = null;

        // Refresh avatar display and form values
        populateProfileHeader();
        resetDirty();
        btn.innerHTML = '<i class="fas fa-check"></i> Saved';
        btn.style.background = 'var(--green-accent)';
        btn.style.color = '#fff';
        btn.style.borderColor = 'var(--green-accent)';
        showToast('Player details saved', 'success');

        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.background = '';
            btn.style.color = '';
            btn.style.borderColor = '';
            btn.disabled = false;
        }, 1000);

    } else {
        btn.innerHTML = '<i class="fas fa-times"></i> Error';
        btn.style.background = 'red';
        btn.style.color = '#fff';

        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.background = '';
            btn.style.color = '';
            btn.style.borderColor = '';
            btn.disabled = false;
        }, 2000);
    }
}// --- Player Analysis Logic ---
function setupAnalysisTab() {
    window.openHighlightModal = () => {
        document.getElementById('modalAddHighlight').classList.add('active');
    };
    window.openAnalysisVideoModal = () => {
        document.getElementById('modalAddAnalysisVideo').classList.add('active');
    };
    window.closeModal = (id) => {
        document.getElementById(id).classList.remove('active');
    };

    // Wire drag-and-drop for both video drop zones
    _setupDropZone('highlightDropZone', 'highlightFileInput', 'highlightDropLabel');
    _setupDropZone('analysisDropZone', 'analysisFileInput', 'analysisDropLabel');
}

function _setupDropZone(zoneId, inputId, labelId) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (!zone || !input) return;

    input.addEventListener('change', () => {
        const f = input.files?.[0];
        if (f && label) label.textContent = f.name;
    });

    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const f = e.dataTransfer?.files?.[0];
        if (f && f.type.startsWith('video/')) {
            const dt = new DataTransfer();
            dt.items.add(f);
            input.files = dt.files;
            if (label) label.textContent = f.name;
        } else if (f) {
            showToast('Please drop a video file', 'error');
        }
    });
}

function setupMediaTab() {
    // Populate media tab avatar
    const mediaInitials = document.getElementById('mediaAvatarInitials');
    const mediaImage = document.getElementById('mediaAvatarImage');
    if (mediaInitials) {
        mediaInitials.textContent = (currentPlayer?.name || '--').substring(0, 2).toUpperCase();
        mediaInitials.style.display = currentPlayer?.profileImageUrl ? 'none' : 'flex';
    }
    if (mediaImage) {
        if (currentPlayer?.profileImageUrl) {
            mediaImage.src = currentPlayer.profileImageUrl;
            mediaImage.style.display = 'block';
        } else {
            mediaImage.style.display = 'none';
        }
    }

    // Photo upload in media tab (wire once)
    const mediaProfInput = document.getElementById('mediaProfImageInput');
    if (mediaProfInput && !mediaProfInput._wired) {
        mediaProfInput._wired = true;
        mediaProfInput.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const maxSize = 2 * 1024 * 1024;
            if (file.size > maxSize) { showToast('File too large (max 2MB)', 'error'); e.target.value = ''; return; }
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { showToast('Invalid format', 'error'); e.target.value = ''; return; }
            try {
                const imageUrl = await uploadProfileImage(file);
                const ok = await squadManager.updatePlayer(currentPlayerId, { profileImageUrl: imageUrl });
                if (ok) {
                    currentPlayer.profileImageUrl = imageUrl;
                    populateProfileHeader();
                    setupMediaTab();
                    showToast('Photo updated', 'success');
                }
            } catch (err) {
                showToast('Upload failed', 'error');
            }
        });
    }

    const btnMediaRemove = document.getElementById('btnMediaRemovePhoto');
    if (btnMediaRemove && !btnMediaRemove._wired) {
        btnMediaRemove._wired = true;
        btnMediaRemove.addEventListener('click', async () => {
            const ok = await squadManager.updatePlayer(currentPlayerId, { profileImageUrl: '' });
            if (ok) {
                currentPlayer.profileImageUrl = '';
                populateProfileHeader();
                setupMediaTab();
                showToast('Photo removed', 'success');
            }
        });
    }

    // Show/hide remove button
    if (btnMediaRemove) btnMediaRemove.style.display = currentPlayer?.profileImageUrl ? '' : 'none';

    // ── Gallery Photos ─────────────────────────────────────────────────────
    renderGalleryPhotos();

    const galleryUpload = document.getElementById('mediaGalleryUpload');
    if (galleryUpload && !galleryUpload._wired) {
        galleryUpload._wired = true;
        galleryUpload.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || []);
            if (!files.length) return;

            const statusEl = document.getElementById('mediaGalleryStatus');
            const maxSize = 5 * 1024 * 1024;
            const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
            const valid = files.filter(f => f.size <= maxSize && validTypes.includes(f.type));

            if (valid.length < files.length) {
                showToast(`${files.length - valid.length} file(s) skipped (max 5MB, JPG/PNG/WebP only)`, 'error');
            }
            if (!valid.length) return;

            if (statusEl) statusEl.textContent = `Uploading ${valid.length} photo(s)...`;

            const uploaded = [];
            for (const file of valid) {
                try {
                    const ext = file.name.split('.').pop() || 'jpg';
                    const path = `players/${currentPlayerId}/gallery/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
                    const { data, error } = await supabase.storage.from('avatars').upload(path, file, {
                        cacheControl: '3600', upsert: false, contentType: file.type
                    });
                    if (error) throw error;
                    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(data.path);
                    uploaded.push({ url: publicUrl, name: file.name, uploadedAt: new Date().toISOString() });
                } catch (err) {
                    console.error('Gallery upload failed:', err);
                }
            }

            if (uploaded.length) {
                const existing = Array.isArray(currentPlayer.galleryPhotos) ? currentPlayer.galleryPhotos : [];
                const merged = [...existing, ...uploaded];
                const ok = await squadManager.updatePlayer(currentPlayerId, { galleryPhotos: merged });
                if (ok) {
                    currentPlayer.galleryPhotos = merged;
                    renderGalleryPhotos();
                    showToast(`${uploaded.length} photo(s) added`, 'success');
                }
            } else {
                showToast('Upload failed — check storage bucket permissions', 'error');
            }

            if (statusEl) statusEl.textContent = '';
            e.target.value = '';
        });
    }
}

function renderGalleryPhotos() {
    const grid = document.getElementById('mediaGalleryGrid');
    const empty = document.getElementById('mediaGalleryEmpty');
    if (!grid) return;

    const photos = Array.isArray(currentPlayer?.galleryPhotos) ? currentPlayer.galleryPhotos : [];

    if (photos.length === 0) {
        grid.innerHTML = '';
        if (empty) empty.style.display = '';
        return;
    }
    if (empty) empty.style.display = 'none';

    grid.innerHTML = photos.map((photo, idx) => `
        <div style="position:relative; border-radius:10px; overflow:hidden; background:#f1f5f9; aspect-ratio:1; border:1px solid #e2e8f0;">
            <img src="${photo.url}" alt="${photo.name || 'Gallery photo'}"
                style="width:100%; height:100%; object-fit:cover; display:block; cursor:pointer;"
                onclick="window.open('${photo.url}','_blank')">
            <button onclick="deleteGalleryPhoto(${idx})" title="Delete"
                style="position:absolute; top:5px; right:5px; width:24px; height:24px; border-radius:50%; background:rgba(239,68,68,0.9); border:none; color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:0.65rem; line-height:1; padding:0;">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

window.deleteGalleryPhoto = async (idx) => {
    const confirmed = await profileConfirm('Remove Photo', 'Remove this photo from the gallery?', 'Remove');
    if (!confirmed) return;
    const photos = Array.isArray(currentPlayer?.galleryPhotos) ? [...currentPlayer.galleryPhotos] : [];
    photos.splice(idx, 1);
    const ok = await squadManager.updatePlayer(currentPlayerId, { galleryPhotos: photos });
    if (ok) {
        currentPlayer.galleryPhotos = photos;
        renderGalleryPhotos();
        showToast('Photo removed', 'success');
    }
};

async function loadCareerStats(playerId) {
    const grid = document.getElementById('careerStatsGrid');
    const emptyState = document.getElementById('careerStatsEmpty');
    const yearFilter = document.getElementById('careerStatsYearFilter');
    if (!grid || !playerId) return;

    // Fetch match stats and assessments in parallel
    const [allStats, assessmentsResult] = await Promise.all([
        matchManager.getPlayerCareerStats(playerId),
        supabase.from('assessments').select('ratings, date').eq('player_id', playerId)
    ]);
    const allAssessments = assessmentsResult.data || [];

    if (allStats.length === 0 && allAssessments.length === 0) {
        grid.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';
    grid.style.display = 'grid';

    // Resolve all match objects referenced by stats
    const matchIds = [...new Set(allStats.map(s => s.matchId))];
    const matches = matchIds.map(id => matchManager.matches.find(m => String(m.id) === String(id))).filter(Boolean);

    // Load seasons for this club from Supabase (graceful fallback to calendar-year filter)
    let seasons = [];
    const clubId = squadManager.clubId;
    if (clubId) {
        try {
            const { data: sData } = await supabase
                .from('seasons')
                .select('id, name, start_date, end_date')
                .eq('club_id', clubId)
                .order('start_date', { ascending: false })
                .limit(20);
            seasons = sData || [];
        } catch (e) { /* table may not exist yet */ }
    }

    // Filter seasons to only those where this player has match data
    if (seasons.length > 0 && matches.length > 0) {
        const seasonIdsWithData = new Set();
        seasons.forEach(s => {
            if (!s.start_date || !s.end_date) return;
            const hasMatch = matches.some(m => m.date && m.date >= s.start_date && m.date <= s.end_date);
            if (hasMatch) seasonIdsWithData.add(s.id);
        });
        seasons = seasons.filter(s => seasonIdsWithData.has(s.id));
    }

    if (yearFilter) {
        const currentVal = yearFilter.value;
        if (seasons.length > 0) {
            yearFilter.innerHTML = '<option value="all">All Time</option>' +
                seasons.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        } else {
            // Fallback: calendar years from match dates
            const years = [...new Set(matches.map(m => m.date ? m.date.substring(0, 4) : null).filter(Boolean))].sort().reverse();
            yearFilter.innerHTML = '<option value="all">All Time</option>' +
                years.map(y => `<option value="${y}">${y}</option>`).join('');
        }
        // Restore previous selection if it still exists
        if (currentVal && yearFilter.querySelector(`option[value="${currentVal}"]`)) {
            yearFilter.value = currentVal;
        } else {
            yearFilter.value = 'all';
        }

        if (!yearFilter._wired) {
            yearFilter._wired = true;
            yearFilter.addEventListener('change', () => loadCareerStats(playerId));
        }
    }

    // Filter by selected season or calendar year
    const selectedVal = yearFilter?.value || 'all';
    let filtered = allStats;
    let filteredAssessments = allAssessments;
    if (selectedVal !== 'all') {
        const season = seasons.find(s => String(s.id) === selectedVal);
        if (season && season.start_date && season.end_date) {
            // Season-based filtering: match date must fall within season date range
            const matchIdsInSeason = matches
                .filter(m => m.date && m.date >= season.start_date && m.date <= season.end_date)
                .map(m => m.id);
            filtered = allStats.filter(s => matchIdsInSeason.includes(s.matchId));
            filteredAssessments = allAssessments.filter(a => a.date && a.date >= season.start_date && a.date <= season.end_date);
        } else {
            // Fallback: calendar year matching
            const matchIdsInYear = matches.filter(m => m.date && m.date.startsWith(selectedVal)).map(m => m.id);
            filtered = allStats.filter(s => matchIdsInYear.includes(s.matchId));
            filteredAssessments = allAssessments.filter(a => a.date && a.date.startsWith(selectedVal));
        }
    }

    // Determine player position group for position-aware stat cards
    const allPlayers = squadManager ? squadManager.getPlayers({}) : [];
    const thisPlayer = allPlayers.find(p => String(p.id) === String(playerId));
    const playerPosGroup = (() => {
        const pos = (thisPlayer?.position || '').toUpperCase().trim();
        if (!pos) return '';
        if (pos.includes('GK') || pos.includes('GOAL')) return 'GK';
        if (pos.includes('DEF') || pos.includes('CB') || pos.includes('RB') || pos.includes('LB') || pos.includes('BACK')) return 'DEF';
        return 'OUT';
    })();

    // Aggregate match stats
    const totals = {
        appearances: filtered.length,
        started: filtered.filter(s => s.started).length,
        goals: filtered.reduce((sum, s) => sum + (s.goals || 0), 0),
        assists: filtered.reduce((sum, s) => sum + (s.assists || 0), 0),
        yellowCards: filtered.reduce((sum, s) => sum + (s.yellowCards || 0), 0),
        redCards: filtered.reduce((sum, s) => sum + (s.redCards || 0), 0),
        motm: filtered.filter(s => s.motm).length,
        cleanSheets: filtered.filter(s => s.cleanSheet).length,
        saves: filtered.reduce((sum, s) => sum + (s.saves || 0), 0),
        avgRating: 0
    };

    const rated = filtered.filter(s => s.rating != null && s.rating > 0);
    if (rated.length > 0) {
        totals.avgRating = (rated.reduce((sum, s) => sum + s.rating, 0) / rated.length).toFixed(1);
    }

    // Aggregate 4-pillar assessment averages
    const avgPillarCat = (cat) => {
        if (!cat || typeof cat !== 'object') return typeof cat === 'number' ? cat : null;
        const vals = Object.values(cat).filter(v => v != null && v > 0);
        return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    };

    let sumTac = 0, cTac = 0, sumTec = 0, cTec = 0, sumPhy = 0, cPhy = 0, sumPsy = 0, cPsy = 0;
    const globalRatingPoints = [];

    filteredAssessments.forEach(a => {
        let ratings = {};
        try { ratings = typeof a.ratings === 'string' ? JSON.parse(a.ratings) : (a.ratings || {}); } catch (e) { /* */ }
        const tac = avgPillarCat(ratings.tactical);
        const tec = avgPillarCat(ratings.technical);
        const phy = avgPillarCat(ratings.physical);
        const psy = avgPillarCat(ratings.psychological);
        if (tac != null) { sumTac += tac; cTac++; }
        if (tec != null) { sumTec += tec; cTec++; }
        if (phy != null) { sumPhy += phy; cPhy++; }
        if (psy != null) { sumPsy += psy; cPsy++; }
        const vals = [tac, tec, phy, psy].filter(v => v != null);
        if (vals.length > 0) globalRatingPoints.push(vals.reduce((x, y) => x + y, 0) / vals.length);
    });

    // Add simple match ratings to global avg
    filtered.forEach(s => {
        if (s.rating != null && s.rating > 0) globalRatingPoints.push(s.rating);
    });

    const tacticalAvg = cTac > 0 ? (sumTac / cTac).toFixed(1) : '--';
    const technicalAvg = cTec > 0 ? (sumTec / cTec).toFixed(1) : '--';
    const physicalAvg = cPhy > 0 ? (sumPhy / cPhy).toFixed(1) : '--';
    const psychologicalAvg = cPsy > 0 ? (sumPsy / cPsy).toFixed(1) : '--';
    const globalAvg = globalRatingPoints.length > 0
        ? (globalRatingPoints.reduce((a, b) => a + b, 0) / globalRatingPoints.length).toFixed(1)
        : '--';

    // Position-specific performance cards
    const performanceCards = playerPosGroup === 'GK'
        ? [
            { icon: 'fa-shield-alt', color: '#10b981', value: totals.cleanSheets, label: 'Clean Sheets' },
            { icon: 'fa-hand-paper', color: '#0ea5e9', value: totals.saves, label: 'Saves' },
          ]
        : playerPosGroup === 'DEF'
        ? [
            { icon: 'fa-bullseye', color: '#ef4444', value: totals.goals, label: 'Goals' },
            { icon: 'fa-hands-helping', color: '#8b5cf6', value: totals.assists, label: 'Assists' },
            { icon: 'fa-shield-alt', color: '#10b981', value: totals.cleanSheets, label: 'Clean Sheets' },
          ]
        : [
            { icon: 'fa-bullseye', color: '#ef4444', value: totals.goals, label: 'Goals' },
            { icon: 'fa-hands-helping', color: '#8b5cf6', value: totals.assists, label: 'Assists' },
          ];

    const statCards = [
        { icon: 'fa-futbol', color: '#00C49A', value: totals.appearances, label: 'Appearances' },
        { icon: 'fa-play-circle', color: '#10b981', value: totals.started, label: 'Started' },
        { icon: 'fa-star', color: '#f59e0b', value: totals.avgRating || '--', label: 'Avg Rating' },
        ...performanceCards,
        { icon: 'fa-square', color: '#facc15', value: totals.yellowCards, label: 'Yellow Cards' },
        { icon: 'fa-square', color: '#ef4444', value: totals.redCards, label: 'Red Cards' },
        { icon: 'fa-trophy', color: '#f59e0b', value: totals.motm, label: 'MOTM Awards' },
        { icon: 'fa-brain', color: '#6366f1', value: tacticalAvg, label: 'Tactical' },
        { icon: 'fa-futbol', color: '#0ea5e9', value: technicalAvg, label: 'Technical' },
        { icon: 'fa-running', color: '#10b981', value: physicalAvg, label: 'Physical' },
        { icon: 'fa-heart', color: '#f59e0b', value: psychologicalAvg, label: 'Psychological' },
        { icon: 'fa-chart-line', color: '#0f172a', value: globalAvg, label: 'Global Avg' }
    ];

    grid.innerHTML = statCards.map(c => `
        <div class="career-stat-card">
            <i class="fas ${c.icon} cs-icon" style="color: ${c.color};"></i>
            <div class="cs-value">${c.value}</div>
            <div class="cs-label">${c.label}</div>
        </div>
    `).join('');

    // Render match-by-match history table
    renderMatchHistory(filtered, matches);

    // Render season summary bar
    renderSeasonSummary(filtered);

    // Render rating trend chart
    renderRatingTrend(filtered, matches);
}

// ─── Rating Trend Chart ──────────────────────────────────────────────────────

function renderRatingTrend(filteredStats, matches) {
    const section = document.getElementById('ratingTrendSection');
    const chart = document.getElementById('ratingTrendChart');
    const info = document.getElementById('ratingTrendInfo');
    const oldest = document.getElementById('ratingTrendOldest');
    const newest = document.getElementById('ratingTrendNewest');
    if (!section || !chart) return;

    const rated = filteredStats.filter(s => s.rating)
        .map(s => {
            const m = matches.find(mm => String(mm.id) === String(s.matchId));
            return { ...s, matchDate: m?.date || '', opponent: m?.opponent || '' };
        })
        .sort((a, b) => a.matchDate.localeCompare(b.matchDate))
        .slice(-15); // Last 15

    if (rated.length < 2) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    const avg = (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1);
    info.textContent = `${rated.length} rated matches \u00b7 avg ${avg}/5`;

    const barColor = (r) => r >= 4 ? '#10b981' : r >= 3 ? '#0ea5e9' : r >= 2 ? '#f59e0b' : '#ef4444';

    chart.innerHTML = rated.map(r => {
        const height = (r.rating / 5 * 100);
        const tooltip = `${r.opponent || '?'}: ${r.rating}/5`;
        return `<div title="${tooltip}" style="flex: 1; max-width: 24px; min-width: 6px; height: ${height}%; background: ${barColor(r.rating)}; border-radius: 3px 3px 0 0; cursor: default; transition: opacity 0.15s;" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'"></div>`;
    }).join('');

    if (rated.length > 0) {
        const oldDate = rated[0].matchDate ? new Date(rated[0].matchDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '';
        const newDate = rated[rated.length - 1].matchDate ? new Date(rated[rated.length - 1].matchDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '';
        oldest.textContent = oldDate;
        newest.textContent = newDate;
    }
}

// --- Match stat edit helpers (mirrors match-details-ui.js constants) ---
const MH_APPEARANCE_OPTIONS = [
    { value: '', label: 'Not in Squad' },
    { value: 'squad', label: 'In Squad — Did Not Play' },
    { value: '1/4', label: 'Played 1/4' },
    { value: '2/4', label: 'Played 2/4' },
    { value: '3/4', label: 'Played 3/4' },
    { value: 'full', label: 'Full Match' }
];
const MH_CAUTION_OPTIONS = [
    { value: '', label: 'None' },
    { value: 'yellow', label: 'Yellow Card' },
    { value: '2yellow', label: 'Two Yellows' },
    { value: 'red', label: 'Straight Red' }
];

function mhAppearanceFromStat(s) {
    if (!s || !s.appeared) return '';
    if (!s.started && s.minutesPlayed === 0) return 'squad';
    if (s.minutesPlayed >= 80) return 'full';
    if (s.minutesPlayed >= 55) return '3/4';
    if (s.minutesPlayed >= 30) return '2/4';
    return '1/4';
}

function mhStatFromAppearance(val) {
    switch (val) {
        case 'full':   return { appeared: true, started: true, minutesPlayed: 90 };
        case '3/4':    return { appeared: true, started: true, minutesPlayed: 67 };
        case '2/4':    return { appeared: true, started: false, minutesPlayed: 45 };
        case '1/4':    return { appeared: true, started: false, minutesPlayed: 22 };
        case 'squad':  return { appeared: true, started: false, minutesPlayed: 0 };
        default:       return { appeared: false, started: false, minutesPlayed: 0 };
    }
}

function mhCautionFromStat(s) {
    if (!s) return '';
    if (s.redCards >= 1 && s.yellowCards === 0) return 'red';
    if (s.yellowCards >= 2) return '2yellow';
    if (s.yellowCards >= 1) return 'yellow';
    return '';
}

function mhStatFromCaution(val) {
    switch (val) {
        case 'yellow':  return { yellowCards: 1, redCards: 0 };
        case '2yellow': return { yellowCards: 2, redCards: 1 };
        case 'red':     return { yellowCards: 0, redCards: 1 };
        default:        return { yellowCards: 0, redCards: 0 };
    }
}

// Store current filtered data for refresh after edit
let _lastFilteredStats = [];
let _lastMatches = [];

function renderMatchHistory(filteredStats, matches) {
    const section = document.getElementById('matchHistorySection');
    const tbody = document.getElementById('matchHistoryBody');
    if (!section || !tbody) return;

    // Restore full headers when switching back to 'all' view
    const thead = document.querySelector('#matchHistoryTable thead tr');
    if (thead) {
        const fullHeaders = [
            { label: 'Date', align: 'left' },
            { label: 'Opponent', align: 'left' },
            { label: 'Result', align: 'center' },
            { label: 'App', align: 'center' },
            { label: 'Min/90', align: 'center', title: 'Minutes / 90' },
            { label: '%Game', align: 'center', title: 'Percentage of Game Played' },
            { label: 'G', align: 'center' },
            { label: 'A', align: 'center' },
            { label: 'G+A', align: 'center' },
            { label: '<span style="color:#facc15;">YC</span> / <span style="color:#ef4444;">RC</span>', align: 'center' },
            { label: 'Rtg', align: 'center' },
            { label: 'MOTM', align: 'center' }
        ];
        thead.innerHTML = fullHeaders.map(h =>
            `<th style="padding: 10px 8px; text-align: ${h.align}; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; font-size: 0.7rem;"${h.title ? ` title="${h.title}"` : ''}>${h.label}</th>`
        ).join('');
    }
    // Reset show-all state
    window._showAllBreakdown = false;

    _lastFilteredStats = filteredStats;
    _lastMatches = matches;
    window._lastFilteredStats = _lastFilteredStats;
    window._lastMatches = _lastMatches;

    if (filteredStats.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    // Build rows sorted by match date descending
    const rows = filteredStats.map(s => {
        const match = matches.find(m => String(m.id) === String(s.matchId));
        return { stat: s, match };
    }).sort((a, b) => {
        const da = a.match?.date || '';
        const db = b.match?.date || '';
        return db.localeCompare(da);
    });

    const escH = str => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // GK detection — same logic as analytics-ui.js
    const posStr = (currentPlayer?.position || '').toUpperCase().trim().split(/[,/]/)[0].trim();
    const isGK = posStr.includes('GK') || posStr.includes('GOAL');

    // Helper: check if a match was a clean sheet (opponent scored 0)
    function isCleanSheet(m) {
        if (!m || m.homeScore == null || m.awayScore == null) return false;
        const ourSide = m.ourSide || 'home';
        const opponentScore = Number(ourSide === 'away' ? m.homeScore : m.awayScore);
        return opponentScore === 0 && !isNaN(opponentScore);
    }

    // Update headers if GK — swap G/A/G+A for CS column
    if (isGK && thead) {
        const gkHeaders = [
            { label: 'Date', align: 'left' },
            { label: 'Opponent', align: 'left' },
            { label: 'Result', align: 'center' },
            { label: 'App', align: 'center' },
            { label: 'Min/90', align: 'center', title: 'Minutes / 90' },
            { label: '%Game', align: 'center', title: 'Percentage of Game Played' },
            { label: '<i class="fas fa-shield-alt" style="color:#10b981;margin-right:2px;"></i>CS', align: 'center', title: 'Clean Sheet' },
            { label: '<span style="color:#facc15;">YC</span> / <span style="color:#ef4444;">RC</span>', align: 'center' },
            { label: 'Rtg', align: 'center' },
            { label: 'MOTM', align: 'center' }
        ];
        thead.innerHTML = gkHeaders.map(h =>
            `<th style="padding: 10px 8px; text-align: ${h.align}; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; font-size: 0.7rem;"${h.title ? ` title="${h.title}"` : ''}>${h.label}</th>`
        ).join('');
    }

    // Per-match rows
    const matchRows = rows.map(({ stat: s, match: m }) => {
        const date = m?.date ? new Date(m.date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '--';
        const opponent = m ? escH(m.opponent || 'Unknown') : '--';
        const score = (m && m.homeScore !== null && m.awayScore !== null) ? `${m.homeScore} - ${m.awayScore}` : '--';
        const resultClass = m?.result === 'W' ? 'color:#10b981;font-weight:700;' : m?.result === 'L' ? 'color:#ef4444;font-weight:700;' : 'color:#f59e0b;font-weight:700;';
        const resultLabel = m?.result === 'W' ? 'W' : m?.result === 'L' ? 'L' : m?.result === 'D' ? 'D' : '';
        const appIcon = s.started ? '<i class="fas fa-play-circle" style="color:#10b981;" title="Started"></i>' : (s.minutesPlayed > 0 ? '<i class="fas fa-arrow-right" style="color:#0ea5e9;" title="Sub (played)"></i>' : '<i class="fas fa-chair" style="color:#94a3b8;" title="In Squad"></i>');
        const motmIcon = s.motm ? '<i class="fas fa-trophy" style="color:#f59e0b;"></i>' : '';
        const ratingDisplay = s.rating ? `<span style="font-weight:700;">${s.rating}</span>/5` : '--';
        const min = s.minutesPlayed || 0;
        const pctGame = min > 0 ? Math.round((min / 90) * 100) : 0;
        const yc = s.yellowCards || 0;
        const rc = s.redCards || 0;

        // GK: show clean sheet icon instead of G/A/G+A
        let attackCells;
        if (isGK) {
            const cs = isCleanSheet(m);
            attackCells = `<td style="padding: 8px; text-align: center;">${cs
                ? '<i class="fas fa-shield-alt" style="color:#10b981;"></i> <span style="font-weight:700;color:#10b981;">Yes</span>'
                : '<span style="color:#94a3b8;">No</span>'}</td>`;
        } else {
            const goals = s.goals || 0;
            const assists = s.assists || 0;
            attackCells = `
            <td style="padding: 8px; text-align: center; font-weight: 600;">${goals}</td>
            <td style="padding: 8px; text-align: center;">${assists}</td>
            <td style="padding: 8px; text-align: center; font-weight: 700;">${goals + assists}</td>`;
        }

        return `<tr style="border-bottom: 1px solid #f1f5f9;" data-match-id="${s.matchId}">
            <td style="padding: 8px; white-space: nowrap;">${date}</td>
            <td style="padding: 8px; font-weight: 600;">${opponent}</td>
            <td style="padding: 8px; text-align: center;"><span style="${resultClass}">${resultLabel}</span> ${score}</td>
            <td style="padding: 8px; text-align: center;">${appIcon}</td>
            <td style="padding: 8px; text-align: center;">${min} / 90</td>
            <td style="padding: 8px; text-align: center; font-weight: 600;">${pctGame}%</td>
            ${attackCells}
            <td style="padding: 8px; text-align: center;"><span style="color:#facc15;">${yc}</span> / <span style="color:#ef4444;">${rc}</span></td>
            <td style="padding: 8px; text-align: center;">${ratingDisplay}</td>
            <td style="padding: 8px; text-align: center;">
                ${motmIcon}
                <button class="dash-btn outline sm" onclick="event.stopPropagation(); openEditMatchStat('${s.matchId}')" style="padding:2px 6px; font-size:0.7rem; margin-left:4px;" title="Edit stats for this match">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        </tr>`;
    }).join('');

    // Overall totals row
    const totalApps = filteredStats.filter(s => s.minutesPlayed > 0 || s.started).length;
    const totalStarts = filteredStats.filter(s => s.started).length;
    const totalMin = filteredStats.reduce((sum, s) => sum + (s.minutesPlayed || 0), 0);
    const totalPossibleMin = filteredStats.length * 90;
    const totalPct = totalPossibleMin > 0 ? Math.round((totalMin / totalPossibleMin) * 100) : 0;
    const totalGoals = filteredStats.reduce((sum, s) => sum + (s.goals || 0), 0);
    const totalAssists = filteredStats.reduce((sum, s) => sum + (s.assists || 0), 0);
    const totalYC = filteredStats.reduce((sum, s) => sum + (s.yellowCards || 0), 0);
    const totalRC = filteredStats.reduce((sum, s) => sum + (s.redCards || 0), 0);
    const rated = filteredStats.filter(s => s.rating != null && s.rating > 0);
    const avgRating = rated.length > 0 ? (rated.reduce((sum, s) => sum + s.rating, 0) / rated.length).toFixed(1) : '--';
    const totalMotm = filteredStats.filter(s => s.motm).length;

    // GK totals: clean sheets count instead of G/A/G+A
    let totalsAttackCells;
    if (isGK) {
        const totalCS = rows.filter(({ match: m }) => isCleanSheet(m)).length;
        totalsAttackCells = `<td style="padding: 10px 8px; text-align: center;"><i class="fas fa-shield-alt" style="color:#10b981;margin-right:4px;"></i><span style="color:${totalCS > 0 ? '#10b981' : '#94a3b8'};">${totalCS} CS</span></td>`;
    } else {
        totalsAttackCells = `
        <td style="padding: 10px 8px; text-align: center;">${totalGoals}</td>
        <td style="padding: 10px 8px; text-align: center;">${totalAssists}</td>
        <td style="padding: 10px 8px; text-align: center;">${totalGoals + totalAssists}</td>`;
    }

    const totalsRow = `<tr style="background: #f0f4ff; border-top: 2px solid #cbd5e1; font-weight: 700;">
        <td style="padding: 10px 8px; text-transform: uppercase; font-size: 0.72rem; color: var(--navy-dark);" colspan="3">Overall Totals</td>
        <td style="padding: 10px 8px; text-align: center;">${totalApps}</td>
        <td style="padding: 10px 8px; text-align: center;">${totalMin} / ${totalPossibleMin}</td>
        <td style="padding: 10px 8px; text-align: center;">${totalPct}%</td>
        ${totalsAttackCells}
        <td style="padding: 10px 8px; text-align: center;"><span style="color:#facc15;">${totalYC}</span> / <span style="color:#ef4444;">${totalRC}</span></td>
        <td style="padding: 10px 8px; text-align: center;">${avgRating !== '--' ? avgRating + '/5' : '--'}</td>
        <td style="padding: 10px 8px; text-align: center;">${totalMotm ? '<i class="fas fa-trophy" style="color:#f59e0b;"></i> ' + totalMotm : '--'}</td>
    </tr>`;

    tbody.innerHTML = totalsRow + matchRows;

    // Make rows clickable for navigation (but not when clicking the edit button)
    tbody.querySelectorAll('tr[data-match-id]').forEach(row => {
        row.style.cursor = 'pointer';
        row.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            const mid = row.dataset.matchId;
            const m = matches.find(mm => String(mm.id) === String(mid));
            if (m) window.location.href = `match-details.html?id=${m.id}`;
        });
    });
}

// --- Season Summary & Stat Breakdown ---

function renderSeasonSummary(filteredStats) {
    const section = document.getElementById('seasonSummarySection');
    const bar = document.getElementById('seasonSummaryBar');
    if (!section || !bar) return;

    if (filteredStats.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    const played = filteredStats.filter(s => s.minutesPlayed > 0);
    const totalMinutes = played.reduce((sum, s) => sum + s.minutesPlayed, 0);
    const avgMin = played.length > 0 ? Math.round(totalMinutes / played.length) : 0;
    const totalGoals = filteredStats.reduce((sum, s) => sum + (s.goals || 0), 0);
    const totalAssists = filteredStats.reduce((sum, s) => sum + (s.assists || 0), 0);
    const rated = filteredStats.filter(s => s.rating);
    const avgRating = rated.length > 0 ? (rated.reduce((sum, s) => sum + s.rating, 0) / rated.length).toFixed(1) : '--';
    const motmCount = filteredStats.filter(s => s.motm).length;

    // Per-90 stats
    const per90G = totalMinutes > 0 ? (totalGoals / totalMinutes * 90).toFixed(2) : '--';
    const per90A = totalMinutes > 0 ? (totalAssists / totalMinutes * 90).toFixed(2) : '--';

    // Clean sheets — count matches where player appeared and opponent scored 0
    let cleanSheets = 0;
    filteredStats.forEach(s => {
        const match = (_lastMatches || []).find(m => String(m.id) === String(s.matchId));
        if (!match) return;
        const ourSide = match.ourSide || 'home';
        const opponentScore = Number(ourSide === 'away' ? match.homeScore : match.awayScore);
        if (opponentScore === 0 && !isNaN(opponentScore)) cleanSheets++;
    });

    const items = [
        { icon: 'fa-clock', color: '#0ea5e9', value: avgMin + "'", label: 'Avg Minutes' },
        { icon: 'fa-bullseye', color: '#ef4444', value: totalGoals, label: 'Goals' },
        { icon: 'fa-hands-helping', color: '#8b5cf6', value: totalAssists, label: 'Assists' },
        { icon: 'fa-fire', color: '#f97316', value: totalGoals + totalAssists, label: 'Contributions' },
        { icon: 'fa-star', color: '#0ea5e9', value: avgRating, label: 'Avg Rating' },
        { icon: 'fa-trophy', color: '#f59e0b', value: motmCount, label: 'MOTM' },
        { icon: 'fa-crosshairs', color: '#ef4444', value: per90G, label: 'Per 90 G' },
        { icon: 'fa-hand-point-up', color: '#8b5cf6', value: per90A, label: 'Per 90 A' },
        { icon: 'fa-shield-alt', color: '#10b981', value: cleanSheets, label: 'Clean Sheets' }
    ];

    bar.innerHTML = items.map(c => `
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 8px; text-align: center;">
            <i class="fas ${c.icon}" style="color: ${c.color}; font-size: 0.95rem; margin-bottom: 4px; display: block;"></i>
            <div style="font-size: 1.3rem; font-weight: 800; color: #0f172a; line-height: 1.2;">${c.value}</div>
            <div style="font-size: 0.62rem; font-weight: 600; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.2px; margin-top: 3px;">${c.label}</div>
        </div>
    `).join('');
}

// ── Training Attendance ────────────────────────────────────────────────────

async function loadTrainingAttendance(playerId) {
    const section = document.getElementById('trainingAttendanceSection');
    const content = document.getElementById('trainingAttendanceContent');
    if (!section || !content || !playerId) return;

    try {
        const isPrivateCoaching = window._profile?.clubs?.settings?.archetype === 'private_coaching';
        const playerSquadId = currentPlayer?.squad_id || currentPlayer?.squadId;

        // Fetch attendance records (with date for session-by-session view)
        let attendQuery = supabase.from('training_attendance')
            .select('id, session_id, squad_id, absent_player_ids, date, attendance_count, attendance_total')
            .order('date', { ascending: false })
            .limit(60);
        if (!isPrivateCoaching && playerSquadId) attendQuery = attendQuery.eq('squad_id', playerSquadId);

        const fetchPromises = [attendQuery];

        // For Orion: also fetch sessions to check player_ids inclusion
        if (isPrivateCoaching) {
            fetchPromises.push(supabase.from('sessions').select('id, title, date, player_ids').order('date', { ascending: false }).limit(60));
        } else {
            fetchPromises.push(Promise.resolve({ data: null }));
        }

        const [{ data: attendance }, { data: sessions }] = await Promise.all(fetchPromises);

        // For Orion: build a map of session ID → session metadata where this player was included
        let playerSessionIds = null;
        let sessionMetaMap = {};
        if (isPrivateCoaching && sessions) {
            playerSessionIds = new Set();
            sessions.forEach(s => {
                sessionMetaMap[s.id] = s;
                let pIds = [];
                try { pIds = typeof s.player_ids === 'string' ? JSON.parse(s.player_ids) : (s.player_ids || []); } catch (e) { /* */ }
                if (Array.isArray(pIds) && pIds.includes(playerId)) {
                    playerSessionIds.add(s.id);
                }
            });
        }

        // Filter attendance to only relevant sessions
        let merged = (attendance || []);
        if (isPrivateCoaching && playerSessionIds) {
            merged = merged.filter(r => r.session_id && playerSessionIds.has(r.session_id));
        }

        if (merged.length === 0) {
            section.style.display = 'block';
            content.innerHTML = `<div style="padding:16px 20px;background:white;border:1px solid #e2e8f0;border-radius:12px;text-align:center;color:#94a3b8;font-size:0.85rem;">
                <i class="fas fa-clipboard-list" style="font-size:1.4rem;display:block;margin-bottom:8px;opacity:0.3;"></i>
                No training sessions recorded yet for this player.
            </div>`;
            return;
        }

        // Fetch session titles for squad model (Tuks)
        if (!isPrivateCoaching) {
            const sessionIds = [...new Set(merged.map(r => r.session_id).filter(Boolean))];
            if (sessionIds.length > 0) {
                const { data: sessData } = await supabase.from('sessions').select('id, title, date').in('id', sessionIds);
                (sessData || []).forEach(s => { sessionMetaMap[s.id] = s; });
            }
        }

        // Compute presence per session
        const sessionRows = merged.map(r => {
            let absentIds = [];
            try { absentIds = Array.isArray(r.absent_player_ids) ? r.absent_player_ids : JSON.parse(r.absent_player_ids || '[]'); } catch (e) { /* */ }
            const wasAbsent = absentIds.includes(playerId);
            const sess = sessionMetaMap[r.session_id] || {};
            return {
                date: r.date || sess.date || null,
                title: sess.title || 'Training Session',
                wasAbsent,
            };
        }).sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1);

        const total = sessionRows.length;
        const missed = sessionRows.filter(r => r.wasAbsent).length;
        const attended = total - missed;
        const pct = total > 0 ? Math.round((attended / total) * 100) : null;

        if (pct === null) { section.style.display = 'none'; return; }

        section.style.display = 'block';
        const pctColor = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';

        // Build session history rows
        const historyRows = sessionRows.map(r => {
            const icon = r.wasAbsent
                ? `<span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#fee2e2;color:#dc2626;font-size:0.7rem;"><i class="fas fa-times"></i></span>`
                : `<span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#dcfce7;color:#166534;font-size:0.7rem;"><i class="fas fa-check"></i></span>`;
            const label = r.wasAbsent
                ? `<span style="font-size:0.8rem;font-weight:600;color:#dc2626;">Absent</span>`
                : `<span style="font-size:0.8rem;font-weight:600;color:#166534;">Present</span>`;
            return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #f1f5f9;">
                ${icon}
                <div style="flex:1;min-width:0;">
                    <div style="font-size:0.83rem;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.title !== 'Training Session' ? r.title : (r.date ? 'Session · ' + r.date : 'Training Session')}</div>
                    ${r.date && r.title !== 'Training Session' ? `<div style="font-size:0.72rem;color:#94a3b8;">${r.date}</div>` : ''}
                </div>
                ${label}
            </div>`;
        }).join('');

        content.innerHTML = `
            <div style="display: flex; align-items: center; gap: 20px; background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 20px; margin-bottom: 14px;">
                <div style="text-align: center; min-width: 80px;">
                    <div style="font-size: 2rem; font-weight: 800; color: ${pctColor}; line-height: 1;">${pct}%</div>
                    <div style="font-size: 0.85rem; font-weight: 700; color: #0f172a; margin-top: 4px;">${attended}/${total}</div>
                    <div style="font-size: 0.65rem; text-transform: uppercase; font-weight: 700; color: #94a3b8; letter-spacing: 0.3px; margin-top: 2px;">Sessions</div>
                </div>
                <div style="flex: 1;">
                    <div style="height: 10px; background: #f1f5f9; border-radius: 5px; overflow: hidden; margin-bottom: 10px;">
                        <div style="height: 100%; width: ${pct}%; background: ${pctColor}; border-radius: 5px; transition: width 0.3s;"></div>
                    </div>
                    <div style="display: flex; gap: 16px; font-size: 0.8rem;">
                        <span style="color: #166534; font-weight: 700;"><i class="fas fa-check-circle" style="margin-right: 4px;"></i>${attended} Attended</span>
                        <span style="color: #dc2626; font-weight: 700;"><i class="fas fa-times-circle" style="margin-right: 4px;"></i>${missed} Missed</span>
                    </div>
                </div>
            </div>
            <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px;max-height:280px;overflow-y:auto;">
                <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;margin-bottom:6px;">Session History (${total} sessions)</div>
                ${historyRows}
            </div>
        `;
    } catch (e) {
        console.error('Failed to load training attendance:', e);
        section.style.display = 'none';
    }
}

let _currentStatView = 'all';

window.switchStatView = function(stat) {
    _currentStatView = stat;
    // Update pill active state
    document.querySelectorAll('#statBreakdownPicker .stat-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.stat === stat);
    });

    if (stat === 'all') {
        renderMatchHistory(_lastFilteredStats, _lastMatches);
        return;
    }

    renderStatBreakdownTable(stat, _lastFilteredStats, _lastMatches);
};

function renderStatBreakdownTable(stat, filteredStats, matches) {
    const tbody = document.getElementById('matchHistoryBody');
    const table = document.getElementById('matchHistoryTable');
    if (!tbody || !table) return;

    // Update table headers based on stat
    const thead = table.querySelector('thead tr');
    const headerMap = {
        goals: ['Date', 'Opponent', 'Result', 'Goals'],
        assists: ['Date', 'Opponent', 'Result', 'Assists'],
        minutes: ['Date', 'Opponent', 'App', 'Minutes'],
        ratings: ['Date', 'Opponent', 'Rating', 'MOTM'],
        cards: ['Date', 'Opponent', 'Yellow', 'Red']
    };
    const headers = headerMap[stat] || [];
    thead.innerHTML = headers.map(h =>
        `<th style="padding: 10px 8px; text-align: ${h === 'Date' || h === 'Opponent' ? 'left' : 'center'}; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; font-size: 0.7rem;">${h}</th>`
    ).join('');

    // Sort by date descending
    const rows = filteredStats.map(s => {
        const match = matches.find(m => String(m.id) === String(s.matchId));
        return { stat: s, match };
    }).sort((a, b) => (b.match?.date || '').localeCompare(a.match?.date || ''));

    const limit = window._showAllBreakdown ? rows.length : 5;
    const visible = rows.slice(0, limit);

    const escH = str => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    tbody.innerHTML = visible.map(({ stat: s, match: m }) => {
        const date = m?.date ? new Date(m.date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '--';
        const opponent = m ? escH(m.opponent || 'Unknown') : '--';
        const score = (m && m.homeScore !== null && m.awayScore !== null) ? `${m.homeScore} - ${m.awayScore}` : '--';
        const resultStyle = m?.result === 'W' ? 'color:#10b981;font-weight:700;' : m?.result === 'L' ? 'color:#ef4444;font-weight:700;' : 'color:#f59e0b;font-weight:700;';
        const resultLabel = m?.result || '';

        let cells = '';
        if (stat === 'goals') {
            const highlight = s.goals > 0 ? 'font-weight:800; color:#10b981; font-size:1.1rem;' : '';
            cells = `
                <td style="padding:8px;">${date}</td>
                <td style="padding:8px; font-weight:600;">${opponent}</td>
                <td style="padding:8px; text-align:center;"><span style="${resultStyle}">${resultLabel}</span> ${score}</td>
                <td style="padding:8px; text-align:center; ${highlight}">${s.goals || 0}</td>`;
        } else if (stat === 'assists') {
            const highlight = s.assists > 0 ? 'font-weight:800; color:#8b5cf6; font-size:1.1rem;' : '';
            cells = `
                <td style="padding:8px;">${date}</td>
                <td style="padding:8px; font-weight:600;">${opponent}</td>
                <td style="padding:8px; text-align:center;"><span style="${resultStyle}">${resultLabel}</span> ${score}</td>
                <td style="padding:8px; text-align:center; ${highlight}">${s.assists || 0}</td>`;
        } else if (stat === 'minutes') {
            const appIcon = s.started ? '<i class="fas fa-play-circle" style="color:#10b981;" title="Started"></i>' : (s.minutesPlayed > 0 ? '<i class="fas fa-arrow-right" style="color:#0ea5e9;" title="Sub"></i>' : '<i class="fas fa-chair" style="color:#94a3b8;" title="Squad"></i>');
            cells = `
                <td style="padding:8px;">${date}</td>
                <td style="padding:8px; font-weight:600;">${opponent}</td>
                <td style="padding:8px; text-align:center;">${appIcon}</td>
                <td style="padding:8px; text-align:center; font-weight:700;">${s.minutesPlayed || 0}'</td>`;
        } else if (stat === 'ratings') {
            const ratingDisplay = s.rating ? `<span style="font-weight:800; font-size:1.1rem;">${s.rating}</span><span style="color:#94a3b8;">/5</span>` : '<span style="color:#94a3b8;">--</span>';
            const motmIcon = s.motm ? '<i class="fas fa-trophy" style="color:#f59e0b; font-size:1rem;"></i>' : '<span style="color:#94a3b8;">--</span>';
            cells = `
                <td style="padding:8px;">${date}</td>
                <td style="padding:8px; font-weight:600;">${opponent}</td>
                <td style="padding:8px; text-align:center;">${ratingDisplay}</td>
                <td style="padding:8px; text-align:center;">${motmIcon}</td>`;
        } else if (stat === 'cards') {
            const yc = s.yellowCards || 0;
            const rc = s.redCards || 0;
            const ycHtml = yc > 0 ? '<i class="fas fa-square" style="color:#facc15;font-size:0.8rem;"></i>'.repeat(yc) : '<span style="color:#94a3b8;">0</span>';
            const rcHtml = rc > 0 ? '<i class="fas fa-square" style="color:#ef4444;font-size:0.8rem;"></i>'.repeat(rc) : '<span style="color:#94a3b8;">0</span>';
            cells = `
                <td style="padding:8px;">${date}</td>
                <td style="padding:8px; font-weight:600;">${opponent}</td>
                <td style="padding:8px; text-align:center;">${ycHtml}</td>
                <td style="padding:8px; text-align:center;">${rcHtml}</td>`;
        }

        return `<tr style="border-bottom: 1px solid #f1f5f9;">${cells}</tr>`;
    }).join('');

    // Show "Show all" link if more than 5
    if (rows.length > 5 && !window._showAllBreakdown) {
        tbody.innerHTML += `<tr><td colspan="${headers.length}" style="text-align:center; padding:12px;">
            <button onclick="_showAllBreakdown=true; renderStatBreakdownTable('${stat}', _lastFilteredStats, _lastMatches);"
                style="background:none; border:none; color:var(--blue-accent, #0ea5e9); cursor:pointer; font-weight:600; font-size:0.82rem;">
                Show all ${rows.length} matches <i class="fas fa-chevron-down" style="margin-left:4px;"></i>
            </button>
        </td></tr>`;
    } else if (window._showAllBreakdown && rows.length > 5) {
        tbody.innerHTML += `<tr><td colspan="${headers.length}" style="text-align:center; padding:12px;">
            <button onclick="_showAllBreakdown=false; renderStatBreakdownTable('${stat}', _lastFilteredStats, _lastMatches);"
                style="background:none; border:none; color:var(--blue-accent, #0ea5e9); cursor:pointer; font-weight:600; font-size:0.82rem;">
                Show last 5 <i class="fas fa-chevron-up" style="margin-left:4px;"></i>
            </button>
        </td></tr>`;
    }
}

// Expose to window for inline onclick handlers
window._showAllBreakdown = false;
window.renderStatBreakdownTable = renderStatBreakdownTable;
window._lastFilteredStats = [];
window._lastMatches = [];

window.openEditMatchStat = async (matchId) => {
    // Find this player's stat for the given match
    const stat = _lastFilteredStats.find(s => String(s.matchId) === String(matchId));
    const match = _lastMatches.find(m => String(m.id) === String(matchId));
    if (!stat) { showToast('Stat not found', 'error'); return; }

    const opponent = match?.opponent || 'Unknown';
    const date = match?.date ? new Date(match.date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '--';

    const appVal = mhAppearanceFromStat(stat);
    const cautionVal = mhCautionFromStat(stat);

    const appOptions = MH_APPEARANCE_OPTIONS.map(o =>
        `<option value="${o.value}" ${o.value === appVal ? 'selected' : ''}>${o.label}</option>`
    ).join('');
    const cautionOpts = MH_CAUTION_OPTIONS.map(o =>
        `<option value="${o.value}" ${o.value === cautionVal ? 'selected' : ''}>${o.label}</option>`
    ).join('');
    const ratingOpts = '<option value="">--</option>' +
        [1,2,3,4,5].map(v => `<option value="${v}" ${stat.rating === v ? 'selected' : ''}>${v}/5</option>`).join('');

    const html = `
        <div class="modal-overlay active" id="modalEditMatchStat" style="z-index:9999;">
            <div class="modal-container" style="max-width: 460px;">
                <div class="modal-header">
                    <h2 style="font-size:1rem;"><i class="fas fa-edit" style="margin-right:8px;"></i>Edit Match Stats</h2>
                    <button class="btn-close-modal" onclick="document.getElementById('modalEditMatchStat').remove()">&times;</button>
                </div>
                <div class="modal-body" style="padding: 20px;">
                    <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:10px; padding:12px 16px; margin-bottom:16px; font-size:0.85rem;">
                        <strong>${currentPlayer?.name}</strong> vs <strong>${opponent}</strong> — ${date}
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div>
                            <label style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#64748b; display:block; margin-bottom:4px;">Appearance</label>
                            <select id="mhEditApp" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:0.85rem;">${appOptions}</select>
                        </div>
                        <div>
                            <label style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#64748b; display:block; margin-bottom:4px;">Cautions</label>
                            <select id="mhEditCaution" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:0.85rem;">${cautionOpts}</select>
                        </div>
                        <div>
                            <label style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#64748b; display:block; margin-bottom:4px;">Goals</label>
                            <input type="number" id="mhEditGoals" value="${stat.goals || 0}" min="0" max="10" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:0.85rem; text-align:center;">
                        </div>
                        <div>
                            <label style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#64748b; display:block; margin-bottom:4px;">Assists</label>
                            <input type="number" id="mhEditAssists" value="${stat.assists || 0}" min="0" max="10" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:0.85rem; text-align:center;">
                        </div>
                        <div>
                            <label style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#64748b; display:block; margin-bottom:4px;">Rating</label>
                            <select id="mhEditRating" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:0.85rem;">${ratingOpts}</select>
                        </div>
                        <div>
                            <label style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#64748b; display:block; margin-bottom:4px;">MOTM</label>
                            <select id="mhEditMotm" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:0.85rem;">
                                <option value="false" ${!stat.motm ? 'selected' : ''}>No</option>
                                <option value="true" ${stat.motm ? 'selected' : ''}>Yes</option>
                            </select>
                        </div>
                    </div>
                    <div style="margin-top:12px;">
                        <label style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#64748b; display:block; margin-bottom:4px;">Notes</label>
                        <input type="text" id="mhEditNotes" value="${(stat.notes || '').replace(/"/g, '&quot;')}" placeholder="Match notes..." style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:0.85rem;">
                    </div>
                </div>
                <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:8px; padding:16px 20px; border-top:1px solid #e2e8f0;">
                    <button class="dash-btn outline" onclick="document.getElementById('modalEditMatchStat').remove()">Cancel</button>
                    <button class="dash-btn primary" id="btnSaveMatchStat" onclick="saveEditMatchStat('${matchId}')">
                        <i class="fas fa-save"></i> Save
                    </button>
                </div>
            </div>
        </div>`;

    // Remove existing modal if any
    const existing = document.getElementById('modalEditMatchStat');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', html);

    // Close on overlay click
    const overlay = document.getElementById('modalEditMatchStat');
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
};

window.saveEditMatchStat = async (matchId) => {
    const btn = document.getElementById('btnSaveMatchStat');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    const appVal = document.getElementById('mhEditApp').value;
    const { appeared, started, minutesPlayed } = mhStatFromAppearance(appVal);
    const cautionVal = document.getElementById('mhEditCaution').value;
    const { yellowCards, redCards } = mhStatFromCaution(cautionVal);

    const playerStat = {
        playerId: currentPlayerId,
        appeared,
        started,
        minutesPlayed,
        goals: parseInt(document.getElementById('mhEditGoals').value) || 0,
        assists: parseInt(document.getElementById('mhEditAssists').value) || 0,
        yellowCards,
        redCards,
        rating: parseInt(document.getElementById('mhEditRating').value) || null,
        motm: document.getElementById('mhEditMotm').value === 'true',
        notes: document.getElementById('mhEditNotes').value || ''
    };

    try {
        await matchManager.saveMatchPlayerStats(matchId, [playerStat]);
        showToast('Match stats updated', 'success');
        document.getElementById('modalEditMatchStat').remove();
        // Refresh career stats
        loadCareerStats(currentPlayerId);
    } catch (err) {
        console.error('Error saving match stat:', err);
        showToast('Failed to save — ' + (err.message || 'unknown error'), 'error');
        btn.innerHTML = '<i class="fas fa-save"></i> Save';
        btn.disabled = false;
    }
};

async function renderHighlights() {
    const grid = document.getElementById('highlightsGrid');
    const emptyState = document.getElementById('emptyHighlightsState');
    if (!grid || !currentPlayer) return;

    const highlights = typeof currentPlayer.highlights === 'string'
        ? JSON.parse(currentPlayer.highlights || '[]')
        : (currentPlayer.highlights || []);

    if (highlights.length === 0) {
        grid.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }

    grid.style.display = 'grid';
    emptyState.style.display = 'none';

    grid.innerHTML = highlights.map((h, index) => {
        const stored = isStoredVideo(h.url);
        const mediaPart = stored
            ? `<video src="${h.url}" controls preload="metadata" style="width:100%;aspect-ratio:16/9;background:#000;display:block;"></video>`
            : `<div style="background:#f1f5f9;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;">
                 <i class="fas fa-play-circle" style="font-size:3rem;color:var(--blue-accent);opacity:0.8;"></i>
               </div>`;
        return `
        <div class="dash-card" style="padding:0;overflow:hidden;position:relative;">
            <div style="position:relative;">
                ${mediaPart}
                <button onclick="deleteHighlight(${index})" style="position:absolute;top:8px;right:8px;background:rgba(239,68,68,0.9);color:#fff;border:none;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:0.75rem;z-index:1;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div style="padding:14px 16px;">
                <h5 style="margin:0 0 6px;font-size:0.95rem;color:var(--navy-dark);">${h.title}</h5>
                ${h.description ? `<p style="margin:0 0 10px;font-size:0.82rem;color:var(--text-secondary);line-height:1.4;">${h.description}</p>` : ''}
                ${!stored ? `<a href="${h.url}" target="_blank" rel="noopener" class="dash-btn outline sm" style="width:100%;text-align:center;display:block;text-decoration:none;"><i class="fas fa-external-link-alt"></i> View Highlight</a>` : ''}
            </div>
        </div>`;
    }).join('');
}

async function renderAnalysisVideos() {
    const grid = document.getElementById('analysisVideosGrid');
    const emptyState = document.getElementById('emptyAnalysisVideosState');
    if (!grid || !currentPlayer) return;

    const videos = typeof currentPlayer.analysisVideos === 'string'
        ? JSON.parse(currentPlayer.analysisVideos || '[]')
        : (currentPlayer.analysisVideos || []);

    if (videos.length === 0) {
        grid.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }

    grid.style.display = 'grid';
    emptyState.style.display = 'none';

    grid.innerHTML = videos.map((v, index) => {
        const stored = isStoredVideo(v.url);
        const mediaPart = stored
            ? `<video src="${v.url}" controls preload="metadata" style="width:100%;aspect-ratio:16/9;background:#000;display:block;"></video>`
            : `<div style="background:#f1f5f9;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;">
                 <i class="fas fa-film" style="font-size:3rem;color:var(--blue-accent);opacity:0.8;"></i>
               </div>`;
        return `
        <div class="dash-card" style="padding:0;overflow:hidden;position:relative;">
            <div style="position:relative;">
                ${mediaPart}
                <button onclick="deleteAnalysisVideo(${index})" style="position:absolute;top:8px;right:8px;background:rgba(239,68,68,0.9);color:#fff;border:none;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:0.75rem;z-index:1;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div style="padding:14px 16px;">
                <h5 style="margin:0 0 6px;font-size:0.95rem;color:var(--navy-dark);">${v.title}</h5>
                ${v.notes ? `<p style="margin:0 0 10px;font-size:0.82rem;color:var(--text-secondary);line-height:1.4;">${v.notes}</p>` : ''}
                ${!stored ? `<a href="${v.url}" target="_blank" rel="noopener" class="dash-btn outline sm" style="width:100%;text-align:center;display:block;text-decoration:none;"><i class="fas fa-video"></i> Watch Video</a>` : ''}
            </div>
        </div>`;
    }).join('');
}

window.saveHighlight = async () => {
    const title = document.getElementById('highlightTitle').value.trim();
    const fileInput = document.getElementById('highlightFileInput');
    const urlInput = document.getElementById('highlightUrl').value.trim();
    const description = document.getElementById('highlightDescription').value.trim();
    const file = fileInput?.files?.[0];

    if (!title) { showToast('Please provide a title.', 'warning'); return; }
    if (!file && !urlInput) { showToast('Upload a video file or paste a link.', 'warning'); return; }

    const btn = document.getElementById('btnSaveHighlight');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }

    try {
        let videoUrl = urlInput;

        if (file) {
            const progressEl = document.getElementById('highlightUploadProgress');
            const progressBar = document.getElementById('highlightProgressBar');
            const progressLabel = document.getElementById('highlightProgressLabel');
            if (progressEl) progressEl.style.display = '';
            videoUrl = await uploadToR2(file, 'player_highlight', currentPlayerId, (pct) => {
                if (progressBar) progressBar.style.width = pct + '%';
                if (progressLabel) progressLabel.textContent = pct < 100 ? 'Uploading to R2…' : 'Processing…';
            });
            if (progressEl) progressEl.style.display = 'none';
        }

        const currentHighlights = typeof currentPlayer.highlights === 'string'
            ? JSON.parse(currentPlayer.highlights || '[]')
            : (currentPlayer.highlights || []);

        const newHighlight = { title, url: videoUrl, description, timestamp: new Date().toISOString() };
        let updatedHighlights;

        if (!tierAtLeast('elite') && currentHighlights.length >= 1) {
            const confirmed = await profileConfirm(
                'Replace Existing Highlight',
                'Your plan allows 1 highlight per player. This will replace the current one. Upgrade to Elite for unlimited highlights.',
                'Replace'
            );
            if (!confirmed) return;
            updatedHighlights = [newHighlight];
        } else {
            updatedHighlights = [...currentHighlights, newHighlight];
        }

        const success = await squadManager.updatePlayer(currentPlayerId, { highlights: JSON.stringify(updatedHighlights) });
        if (success) {
            currentPlayer.highlights = updatedHighlights;
            renderHighlights();
            closeModal('modalAddHighlight');
            document.getElementById('highlightTitle').value = '';
            document.getElementById('highlightUrl').value = '';
            document.getElementById('highlightDescription').value = '';
            if (fileInput) { fileInput.value = ''; document.getElementById('highlightDropLabel').textContent = 'Drag video here or click to browse'; }
            showToast('Highlight added', 'success');
        } else {
            showToast('Failed to save highlight.', 'error');
        }
    } catch (err) {
        showToast(err.message || 'Upload failed', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus"></i> Add Highlight'; }
    }
};

window.saveAnalysisVideo = async () => {
    const title = document.getElementById('analysisVideoTitle').value.trim();
    const fileInput = document.getElementById('analysisFileInput');
    const urlInput = document.getElementById('analysisVideoUrl').value.trim();
    const notes = document.getElementById('analysisVideoNotes').value.trim();
    const file = fileInput?.files?.[0];

    if (!title) { showToast('Please provide a title.', 'warning'); return; }
    if (!file && !urlInput) { showToast('Upload a video file or paste a link.', 'warning'); return; }

    const btn = document.getElementById('btnSaveAnalysisVideo');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }

    try {
        let videoUrl = urlInput;

        if (file) {
            const progressEl = document.getElementById('analysisUploadProgress');
            const progressBar = document.getElementById('analysisProgressBar');
            const progressLabel = document.getElementById('analysisProgressLabel');
            if (progressEl) progressEl.style.display = '';
            videoUrl = await uploadToR2(file, 'player_analysis', currentPlayerId, (pct) => {
                if (progressBar) progressBar.style.width = pct + '%';
                if (progressLabel) progressLabel.textContent = pct < 100 ? 'Uploading to R2…' : 'Processing…';
            });
            if (progressEl) progressEl.style.display = 'none';
        }

        const currentVideos = typeof currentPlayer.analysisVideos === 'string'
            ? JSON.parse(currentPlayer.analysisVideos || '[]')
            : (currentPlayer.analysisVideos || []);

        const newVideo = { title, url: videoUrl, notes, timestamp: new Date().toISOString() };
        let updatedVideos;

        if (!tierAtLeast('elite') && currentVideos.length >= 1) {
            const confirmed = await profileConfirm(
                'Replace Existing Video',
                'Your plan allows 1 analysis video per player. This will replace the current one. Upgrade to Elite for unlimited videos.',
                'Replace'
            );
            if (!confirmed) return;
            updatedVideos = [newVideo];
        } else {
            updatedVideos = [...currentVideos, newVideo];
        }

        const success = await squadManager.updatePlayer(currentPlayerId, { analysisVideos: JSON.stringify(updatedVideos) });
        if (success) {
            currentPlayer.analysisVideos = updatedVideos;
            renderAnalysisVideos();
            closeModal('modalAddAnalysisVideo');
            document.getElementById('analysisVideoTitle').value = '';
            document.getElementById('analysisVideoUrl').value = '';
            document.getElementById('analysisVideoNotes').value = '';
            if (fileInput) { fileInput.value = ''; document.getElementById('analysisDropLabel').textContent = 'Drag video here or click to browse'; }
            showToast('Analysis video added', 'success');
        } else {
            showToast('Failed to save video.', 'error');
        }
    } catch (err) {
        showToast(err.message || 'Upload failed', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus"></i> Add Video'; }
    }
};

window.deleteHighlight = async (index) => {
    const ok = await profileConfirm('Delete Highlight', 'Are you sure you want to delete this highlight?', 'Delete');
    if (!ok) return;

    const highlights = typeof currentPlayer.highlights === 'string'
        ? JSON.parse(currentPlayer.highlights || '[]')
        : (currentPlayer.highlights || []);

    highlights.splice(index, 1);

    const success = await squadManager.updatePlayer(currentPlayerId, {
        highlights: JSON.stringify(highlights)
    });

    if (success) {
        currentPlayer.highlights = highlights;
        renderHighlights();
        showToast('Highlight deleted', 'success');
    } else {
        showToast('Failed to delete highlight.', 'error');
    }
};

window.deleteAnalysisVideo = async (index) => {
    const ok = await profileConfirm('Delete Video', 'Are you sure you want to delete this analysis video?', 'Delete');
    if (!ok) return;

    const videos = typeof currentPlayer.analysisVideos === 'string'
        ? JSON.parse(currentPlayer.analysisVideos || '[]')
        : (currentPlayer.analysisVideos || []);

    videos.splice(index, 1);

    const success = await squadManager.updatePlayer(currentPlayerId, {
        analysisVideos: JSON.stringify(videos)
    });

    if (success) {
        currentPlayer.analysisVideos = videos;
        renderAnalysisVideos();
        showToast('Analysis video deleted', 'success');
    } else {
        showToast('Failed to delete video.', 'error');
    }
};

