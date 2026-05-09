/**
 * Match Plan Wizard -- UI Logic
 * Manages the multi-step match planning wizard with pitch canvases.
 */
import '../css/planner.css';
import supabase from '../supabase.js';
import squadManager from '../managers/squad-manager.js';
import matchManager from '../managers/match-manager.js';
import { showToast } from '../toast.js';
import { initCanvas, drawAll, setTokenSize, setEquipColor } from './drill-builder.js';

/* -- Player unavailability helpers --------------------------------- */
const _UNAVAIL_STATUSES = new Set(['injured', 'sick', 'suspended', 'unavailable']);
function isPlayerUnavail(p) { return _UNAVAIL_STATUSES.has(p?.playerStatus); }

function ensurePlanConfirmModal() {
    if (document.getElementById('planConfirmModal')) return;
    const el = document.createElement('div');
    el.id = 'planConfirmModal';
    el.className = 'modal-overlay';
    el.innerHTML = `
        <div class="modal-container" style="max-width:380px;">
            <div class="modal-header"><h2 id="planConfirmTitle" style="font-size:1rem;font-weight:700;margin:0;"></h2></div>
            <div class="modal-body" style="padding:16px 20px;"><p id="planConfirmMsg" style="font-size:.88rem;color:#475569;margin:0;line-height:1.6;"></p></div>
            <div class="modal-footer">
                <button id="planConfirmCancel" class="dash-btn outline">Cancel</button>
                <button id="planConfirmOk" class="dash-btn primary">Add Anyway</button>
            </div>
        </div>`;
    document.body.appendChild(el);
}
function planConfirm(title, msg) {
    ensurePlanConfirmModal();
    return new Promise(resolve => {
        document.getElementById('planConfirmTitle').textContent = title;
        document.getElementById('planConfirmMsg').textContent = msg;
        const modal = document.getElementById('planConfirmModal');
        modal.classList.add('active');
        const settle = (v) => { modal.classList.remove('active'); resolve(v); };
        const ok = document.getElementById('planConfirmOk');
        const cancel = document.getElementById('planConfirmCancel');
        const ok2 = ok.cloneNode(true); ok.parentNode.replaceChild(ok2, ok);
        const c2 = cancel.cloneNode(true); cancel.parentNode.replaceChild(c2, cancel);
        document.getElementById('planConfirmOk').addEventListener('click', () => settle(true), { once: true });
        document.getElementById('planConfirmCancel').addEventListener('click', () => settle(false), { once: true });
        modal.addEventListener('click', e => { if (e.target === modal) settle(false); }, { once: true });
    });
}

/* -- State --------------------------------------------------------- */
let currentStep = 0;
const TOTAL_STEPS = 10;
const canvases = {};
window.canvases = canvases;
const initializedCanvases = new Set();

let planId = null;
let planData = {};
let squadPlayers = [];
let startingXI = [];   // Array of player IDs
let substitutes = [];  // Array of player IDs
let oppIntelLinks = []; // Array of { url, label }

// Per-plan lineups: each plan has its own XI, subs, formation, and selected pitch slot
const planLineups = {
    planA: { xi: [], subs: [], formation: '4-3-3', selectedSlot: -1 },
    planB: { xi: [], subs: [], formation: '4-3-3', selectedSlot: -1 },
    planC: { xi: [], subs: [], formation: '4-3-3', selectedSlot: -1 }
};

const FORMATIONS = [
    '4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '3-4-3',
    '4-1-4-1', '4-5-1', '5-3-2', '5-4-1', '4-4-1-1'
];

/* -- Formation Position Maps (x%, y% from top-left of pitch) -------- */
// Positions are laid out attacking upward: GK at bottom, forwards at top
const FORMATION_POSITIONS = {
    '4-3-3': [
        { x: 50, y: 92, role: 'GK' },
        { x: 15, y: 75, role: 'LB' }, { x: 38, y: 78, role: 'CB' }, { x: 62, y: 78, role: 'CB' }, { x: 85, y: 75, role: 'RB' },
        { x: 25, y: 55, role: 'CM' }, { x: 50, y: 58, role: 'CM' }, { x: 75, y: 55, role: 'CM' },
        { x: 18, y: 30, role: 'LW' }, { x: 50, y: 25, role: 'ST' }, { x: 82, y: 30, role: 'RW' }
    ],
    '4-4-2': [
        { x: 50, y: 92, role: 'GK' },
        { x: 15, y: 75, role: 'LB' }, { x: 38, y: 78, role: 'CB' }, { x: 62, y: 78, role: 'CB' }, { x: 85, y: 75, role: 'RB' },
        { x: 12, y: 52, role: 'LM' }, { x: 38, y: 55, role: 'CM' }, { x: 62, y: 55, role: 'CM' }, { x: 88, y: 52, role: 'RM' },
        { x: 38, y: 28, role: 'ST' }, { x: 62, y: 28, role: 'ST' }
    ],
    '4-2-3-1': [
        { x: 50, y: 92, role: 'GK' },
        { x: 15, y: 75, role: 'LB' }, { x: 38, y: 78, role: 'CB' }, { x: 62, y: 78, role: 'CB' }, { x: 85, y: 75, role: 'RB' },
        { x: 35, y: 60, role: 'CDM' }, { x: 65, y: 60, role: 'CDM' },
        { x: 18, y: 42, role: 'LW' }, { x: 50, y: 40, role: 'CAM' }, { x: 82, y: 42, role: 'RW' },
        { x: 50, y: 22, role: 'ST' }
    ],
    '3-5-2': [
        { x: 50, y: 92, role: 'GK' },
        { x: 28, y: 78, role: 'CB' }, { x: 50, y: 80, role: 'CB' }, { x: 72, y: 78, role: 'CB' },
        { x: 10, y: 55, role: 'LWB' }, { x: 35, y: 58, role: 'CM' }, { x: 50, y: 55, role: 'CM' }, { x: 65, y: 58, role: 'CM' }, { x: 90, y: 55, role: 'RWB' },
        { x: 38, y: 28, role: 'ST' }, { x: 62, y: 28, role: 'ST' }
    ],
    '3-4-3': [
        { x: 50, y: 92, role: 'GK' },
        { x: 28, y: 78, role: 'CB' }, { x: 50, y: 80, role: 'CB' }, { x: 72, y: 78, role: 'CB' },
        { x: 12, y: 55, role: 'LM' }, { x: 38, y: 58, role: 'CM' }, { x: 62, y: 58, role: 'CM' }, { x: 88, y: 55, role: 'RM' },
        { x: 18, y: 28, role: 'LW' }, { x: 50, y: 24, role: 'ST' }, { x: 82, y: 28, role: 'RW' }
    ],
    '4-1-4-1': [
        { x: 50, y: 92, role: 'GK' },
        { x: 15, y: 75, role: 'LB' }, { x: 38, y: 78, role: 'CB' }, { x: 62, y: 78, role: 'CB' }, { x: 85, y: 75, role: 'RB' },
        { x: 50, y: 62, role: 'CDM' },
        { x: 12, y: 45, role: 'LM' }, { x: 38, y: 48, role: 'CM' }, { x: 62, y: 48, role: 'CM' }, { x: 88, y: 45, role: 'RM' },
        { x: 50, y: 24, role: 'ST' }
    ],
    '4-5-1': [
        { x: 50, y: 92, role: 'GK' },
        { x: 15, y: 75, role: 'LB' }, { x: 38, y: 78, role: 'CB' }, { x: 62, y: 78, role: 'CB' }, { x: 85, y: 75, role: 'RB' },
        { x: 12, y: 52, role: 'LM' }, { x: 35, y: 55, role: 'CM' }, { x: 50, y: 52, role: 'CM' }, { x: 65, y: 55, role: 'CM' }, { x: 88, y: 52, role: 'RM' },
        { x: 50, y: 26, role: 'ST' }
    ],
    '5-3-2': [
        { x: 50, y: 92, role: 'GK' },
        { x: 10, y: 72, role: 'LWB' }, { x: 30, y: 78, role: 'CB' }, { x: 50, y: 80, role: 'CB' }, { x: 70, y: 78, role: 'CB' }, { x: 90, y: 72, role: 'RWB' },
        { x: 25, y: 55, role: 'CM' }, { x: 50, y: 55, role: 'CM' }, { x: 75, y: 55, role: 'CM' },
        { x: 38, y: 28, role: 'ST' }, { x: 62, y: 28, role: 'ST' }
    ],
    '5-4-1': [
        { x: 50, y: 92, role: 'GK' },
        { x: 10, y: 72, role: 'LWB' }, { x: 30, y: 78, role: 'CB' }, { x: 50, y: 80, role: 'CB' }, { x: 70, y: 78, role: 'CB' }, { x: 90, y: 72, role: 'RWB' },
        { x: 12, y: 50, role: 'LM' }, { x: 38, y: 53, role: 'CM' }, { x: 62, y: 53, role: 'CM' }, { x: 88, y: 50, role: 'RM' },
        { x: 50, y: 26, role: 'ST' }
    ],
    '4-4-1-1': [
        { x: 50, y: 92, role: 'GK' },
        { x: 15, y: 75, role: 'LB' }, { x: 38, y: 78, role: 'CB' }, { x: 62, y: 78, role: 'CB' }, { x: 85, y: 75, role: 'RB' },
        { x: 12, y: 55, role: 'LM' }, { x: 38, y: 58, role: 'CM' }, { x: 62, y: 58, role: 'CM' }, { x: 88, y: 55, role: 'RM' },
        { x: 50, y: 38, role: 'CAM' },
        { x: 50, y: 22, role: 'ST' }
    ]
};

let selectedSquadFormation = '4-3-3';

/* -- Position Grouping -------------------------------------------- */
const POSITION_GROUP_ORDER = {
    GK: 0,
    CB: 1, LB: 1, RB: 1, LWB: 1, RWB: 1,
    CDM: 2, CM: 2, CAM: 2, LM: 2, RM: 2,
    ST: 3, LW: 3, RW: 3, CF: 3, Winger: 3
};
const POSITION_GROUP_LABELS = ['Goalkeepers', 'Defenders', 'Midfielders', 'Forwards'];

function groupByPosition(players) {
    const groups = POSITION_GROUP_LABELS.map(label => ({ label, players: [] }));
    const ungrouped = [];
    players.forEach(p => {
        const pos = (p.position || '').split(',')[0].trim();
        const idx = POSITION_GROUP_ORDER[pos];
        if (idx !== undefined) groups[idx].players.push(p);
        else ungrouped.push(p);
    });
    if (ungrouped.length) groups.push({ label: 'Other', players: ungrouped });
    return groups.filter(g => g.players.length > 0);
}

// Canvas IDs for each step that uses a pitch
const CANVAS_IDS = [
    'planA', 'planB', 'planC',
    'off-buildup', 'off-transition', 'off-attack',
    'def-defBlock', 'def-midPress', 'def-highPress',
    'sp-cornersFor', 'sp-cornersAgainst'
];

// Autosave hook for drill-builder
window.triggerAutosave = () => {};

/* -- Dropdown Toolbar Helpers -------------------------------------- */
function closeMTDropdowns(clickedBtn) {
    const menu = clickedBtn.closest('.mt-dropdown-menu');
    if (menu) menu.classList.remove('open');
    const dropdown = clickedBtn.closest('.mt-dropdown');
    if (dropdown) {
        const toggle = dropdown.querySelector('.mt-dropdown-toggle');
        if (toggle) toggle.classList.add('active');
    }
}
window.closeMTDropdowns = closeMTDropdowns;

// Toggle dropdown open/close
document.addEventListener('click', (e) => {
    const toggle = e.target.closest('.mt-dropdown-toggle');
    if (toggle) {
        e.stopPropagation();
        const menu = toggle.nextElementSibling;
        const wasOpen = menu.classList.contains('open');
        document.querySelectorAll('.mt-dropdown-menu.open').forEach(m => m.classList.remove('open'));
        if (!wasOpen) menu.classList.add('open');
        return;
    }
    document.querySelectorAll('.mt-dropdown-menu.open').forEach(m => m.classList.remove('open'));
});

/* -- Initialization ------------------------------------------------ */
export async function initMatchPlanUI() {
    await Promise.all([squadManager.init(), matchManager.init()]);

    // Check URL for existing plan or fixture link
    const params = new URLSearchParams(window.location.search);
    planId = params.get('id');
    const linkedMatchId = params.get('match_id');

    populateSquadSelector();
    populateFixtureSelector();
    buildFormationBars();
    initPitchInteraction();

    if (planId) {
        await loadExistingPlan();
    } else if (linkedMatchId) {
        // Opened from a fixture — auto-select it and hide duplicate fields
        const sel = document.getElementById('planMatchId');
        if (sel) { sel.value = linkedMatchId; onFixtureSelect(); }
        hideManualMatchFields();
    }

    showStep(0);
}

/* -- Squad/Fixture Selectors --------------------------------------- */
function populateSquadSelector() {
    const sel = document.getElementById('planSquadId');
    if (!sel) return;
    const squads = squadManager.getSquads();
    sel.innerHTML = '<option value="">Select Team</option>' +
        squads.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

function populateFixtureSelector() {
    const sel = document.getElementById('planMatchId');
    if (!sel) return;
    const fixtures = matchManager.matches.filter(m => !m.isPast);
    sel.innerHTML = '<option value="">-- Select a fixture (optional) --</option>' +
        fixtures.map(m => {
            const side = m.ourSide === 'away' ? '(A)' : '(H)';
            const label = `${m.date || 'TBD'} \u2014 ${m.homeTeam || '?'} vs ${m.awayTeam || m.opponent || '?'} ${side}`;
            return `<option value="${m.id}">${label}</option>`;
        }).join('');
}

function onFixtureSelect() {
    const matchId = document.getElementById('planMatchId').value;
    if (!matchId) {
        showManualMatchFields();
        return;
    }
    const m = matchManager.matches.find(x => x.id === matchId);
    if (!m) return;
    const el = (id) => document.getElementById(id);
    if (m.opponent) el('planOpponent').value = m.opponent;
    if (m.venue) el('planVenue').value = m.venue;
    if (m.date) el('planDate').value = m.date;
    if (m.time) el('planTime').value = m.time;
    if (m.ourSide) {
        const radio = document.querySelector(`input[name="planSide"][value="${m.ourSide}"]`);
        if (radio) radio.checked = true;
    }
    if (m.squadId && !el('planSquadId').value) {
        el('planSquadId').value = m.squadId;
        onSquadChange();
    }
    // Hide duplicate fields since fixture provides them
    hideManualMatchFields();

    // Show fixture summary instead
    const summary = document.getElementById('fixtureSummary');
    if (summary) {
        summary.style.display = 'block';
        summary.innerHTML = `
            <div style="display:flex;gap:24px;flex-wrap:wrap;font-size:0.9rem;color:var(--navy-dark);">
                <span><i class="fas fa-users" style="margin-right:6px;color:var(--primary);opacity:0.7;"></i><strong>${m.homeTeam || '?'}</strong> vs <strong>${m.awayTeam || m.opponent || '?'}</strong></span>
                <span><i class="far fa-calendar-alt" style="margin-right:6px;color:var(--primary);opacity:0.7;"></i>${m.date || 'TBD'}</span>
                <span><i class="far fa-clock" style="margin-right:6px;color:var(--primary);opacity:0.7;"></i>${m.time || 'TBA'}</span>
                <span><i class="fas fa-map-marker-alt" style="margin-right:6px;color:var(--primary);opacity:0.7;"></i>${m.venue || 'TBD'}</span>
                <span style="background:#f1f5f9;padding:2px 10px;border-radius:6px;font-weight:600;font-size:0.8rem;color:#475569;">${(m.ourSide || 'home').toUpperCase()}</span>
            </div>`;
    }
}
window.onFixtureSelect = onFixtureSelect;

function hideManualMatchFields() {
    const fields = document.getElementById('manualMatchFields');
    if (fields) fields.style.display = 'none';
    const quickBtn = document.getElementById('btnToggleQuickMatch');
    if (quickBtn) quickBtn.style.display = 'none';
}

function showManualMatchFields() {
    const fields = document.getElementById('manualMatchFields');
    if (fields) fields.style.display = '';
    const quickBtn = document.getElementById('btnToggleQuickMatch');
    if (quickBtn) quickBtn.style.display = '';
    const summary = document.getElementById('fixtureSummary');
    if (summary) summary.style.display = 'none';
}

function toggleQuickMatch() {
    const form = document.getElementById('quickMatchForm');
    if (!form) return;
    const opening = form.style.display === 'none';
    form.style.display = opening ? 'block' : 'none';
    // Hide/show manual fields to avoid duplicate Opponent/Venue/Date/Kickoff
    const manual = document.getElementById('manualMatchFields');
    if (manual) manual.style.display = opening ? 'none' : '';
}
window.toggleQuickMatch = toggleQuickMatch;

async function createQuickMatch() {
    const opponent = document.getElementById('qmOpponent')?.value?.trim();
    const date = document.getElementById('qmDate')?.value;
    const time = document.getElementById('qmTime')?.value || '';
    const venue = document.getElementById('qmVenue')?.value?.trim() || '';
    const side = document.querySelector('input[name="qmSide"]:checked')?.value || 'home';

    if (!opponent || !date) {
        showToast('Opponent and date are required', 'error');
        return;
    }

    const squadId = document.getElementById('planSquadId')?.value || null;
    const squadName = squadId
        ? document.getElementById('planSquadId')?.selectedOptions[0]?.textContent || 'Us'
        : 'Us';

    const homeTeam = side === 'home' ? squadName : opponent;
    const awayTeam = side === 'away' ? squadName : opponent;

    try {
        const match = await matchManager.createMatch({
            opponent, date, time, venue,
            ourSide: side,
            homeTeam, awayTeam,
            squadId,
            isPast: false
        });

        // Refresh dropdown and select new match
        populateFixtureSelector();
        const sel = document.getElementById('planMatchId');
        if (sel && match?.id) {
            sel.value = match.id;
            onFixtureSelect();
        }

        // Collapse form and clear inputs
        document.getElementById('quickMatchForm').style.display = 'none';
        document.getElementById('qmOpponent').value = '';
        document.getElementById('qmDate').value = '';
        document.getElementById('qmTime').value = '';
        document.getElementById('qmVenue').value = '';

        showToast('Fixture created and linked!', 'success');
    } catch (err) {
        console.error('Quick match creation failed:', err);
        showToast('Failed to create fixture', 'error');
    }
}
window.createQuickMatch = createQuickMatch;

async function onSquadChange() {
    const squadId = document.getElementById('planSquadId').value;
    if (!squadId) { squadPlayers = []; renderSquadPicker(); return; }
    try {
        const { data, error } = await supabase
            .from('players')
            .select('*')
            .eq('squad_id', squadId)
            .order('name', { ascending: true })
            .limit(500);

        if (error) throw error;

        squadPlayers = (data || []).map(p => ({
            id: p.id,
            name: p.name,
            position: p.position,
            squadId: p.squad_id,
            playerStatus: p.player_status || 'active'
        }));
    } catch (e) {
        console.error('Failed to load players:', e);
        squadPlayers = [];
    }
    renderSquadPicker();
    populateSetPieceTakers();
}
window.onSquadChange = onSquadChange;

/* -- Set Piece Takers ---------------------------------------------- */
function populateSetPieceTakers() {
    const ids = ['spFreeKickNear', 'spFreeKickFar', 'spPenaltyTaker', 'spCornerLeft', 'spCornerRight'];
    const allPlayers = [...startingXI, ...substitutes].map(id => {
        const p = squadPlayers.find(x => x.id === id);
        return p ? `<option value="${p.id}">${p.name}</option>` : '';
    }).join('');
    const optionsHTML = '<option value="">-- Select --</option>' + allPlayers;
    ids.forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = optionsHTML;
        if (prev) sel.value = prev;
    });
}

/* -- Squad Picker -------------------------------------------------- */
let selectedPlayerId = null;
let dragPlayerId = null;
let dragSource = null;

function renderSquadPicker() {
    const availEl = document.getElementById('availablePlayers');
    const xiEl = document.getElementById('startingXI');
    const subEl = document.getElementById('substitutes');

    const xiSet = new Set(startingXI);
    const subSet = new Set(substitutes);
    const available = squadPlayers.filter(p => !xiSet.has(p.id) && !subSet.has(p.id));

    document.getElementById('availCount').textContent = available.length;
    document.getElementById('xiCount').textContent = startingXI.length;
    document.getElementById('subCount').textContent = substitutes.length;

    const chip = (p, source) => {
        const initials = (p.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        const sel = selectedPlayerId === p.id ? ' selected' : '';
        const unavail = isPlayerUnavail(p);
        const statusLabel = p.playerStatus ? (p.playerStatus.charAt(0).toUpperCase() + p.playerStatus.slice(1)) : '';
        const unavailBadge = unavail ? `<span style="position:absolute;top:-3px;right:-3px;background:#ef4444;color:#fff;border-radius:50%;width:13px;height:13px;font-size:8px;display:flex;align-items:center;justify-content:center;font-weight:700;" title="${statusLabel}">✗</span>` : '';
        return `<div class="player-chip${sel}${unavail ? ' unavail-chip' : ''}" draggable="true"
            data-player-id="${p.id}" data-source="${source}"
            onclick="handlePlayerTap('${p.id}','${source}')"
            ondragstart="onChipDragStart(event,'${p.id}','${source}')"
            style="${unavail ? 'opacity:0.6;' : ''}">
            <div class="avatar" style="position:relative;">${initials}${unavailBadge}</div>
            <span>${escH(p.name)}</span>
            <span class="pos-badge">${p.position || '--'}</span>
        </div>`;
    };

    // Available players — grouped by position
    if (availEl) {
        const groups = groupByPosition(available);
        if (!groups.length) {
            availEl.innerHTML = '<p style="color: var(--text-light); font-size: 0.85rem; padding: 12px;">No available players. Select a team above.</p>';
        } else {
            availEl.innerHTML = groups.map(g => `
                <div class="pos-group">
                    <div class="pos-group-label">${g.label}</div>
                    ${g.players.map(p => chip(p, 'available')).join('')}
                </div>
            `).join('');
        }
    }

    // Starting XI — flat ordered list
    if (xiEl) {
        xiEl.innerHTML = startingXI.length
            ? startingXI.map(id => { const p = squadPlayers.find(x => x.id === id); return p ? chip(p, 'xi') : ''; }).join('')
            : '<p style="color: var(--text-light); font-size: 0.85rem; padding: 12px;">Click players to add to Starting XI</p>';
    }

    // Substitutes — flat ordered list
    if (subEl) {
        subEl.innerHTML = substitutes.length
            ? substitutes.map(id => { const p = squadPlayers.find(x => x.id === id); return p ? chip(p, 'sub') : ''; }).join('')
            : '<p style="color: var(--text-light); font-size: 0.85rem; padding: 12px;">Click remaining players to add as substitutes</p>';
    }

    // Wire up drag-and-drop zones
    [availEl, xiEl, subEl].forEach((el, i) => {
        if (!el) return;
        const target = ['available', 'xi', 'sub'][i];
        el.ondragover = onChipDragOver;
        el.ondragleave = onChipDragLeave;
        el.ondrop = (e) => onChipDrop(e, target);
    });

    // Redraw squad pitch preview
    drawSquadPitch();

    // Reset plan lineups so they re-sync from updated squad on next step visit
    ['planA', 'planB', 'planC'].forEach(key => {
        planLineups[key].xi = [];
        planLineups[key].subs = [];
        // Also clear formation tokens from the canvas if it's been initialized
        if (canvases[key]) {
            canvases[key].tokens = canvases[key].tokens.filter(t => t._formationSlot === undefined);
        }
    });
}

/* -- Player Move Logic -------------------------------------------- */
async function movePlayer(playerId, from, to) {
    if (from === to) return;
    if (to === 'xi' || to === 'sub') {
        const p = squadPlayers.find(x => x.id === playerId);
        if (isPlayerUnavail(p)) {
            const statusLabel = p.playerStatus.charAt(0).toUpperCase() + p.playerStatus.slice(1);
            const ok = await planConfirm(
                'Player Unavailable',
                `${p.name} is currently marked as ${statusLabel}. Add them to the lineup anyway?`
            );
            if (!ok) return;
        }
    }
    if (from === 'xi') startingXI = startingXI.filter(id => id !== playerId);
    if (from === 'sub') substitutes = substitutes.filter(id => id !== playerId);
    if (to === 'xi') {
        if (startingXI.length < 11) startingXI.push(playerId);
        else substitutes.push(playerId);
    }
    if (to === 'sub') substitutes.push(playerId);
    selectedPlayerId = null;
    renderSquadPicker();
    populateSetPieceTakers();
}

/* -- Tap interaction (works on mobile + desktop) ------------------ */
function handlePlayerTap(playerId, source) {
    // Quick-move on tap (existing fast behaviour)
    if (source === 'available') {
        movePlayer(playerId, 'available', 'xi');
    } else if (source === 'xi') {
        movePlayer(playerId, 'xi', 'available');
    } else if (source === 'sub') {
        movePlayer(playerId, 'sub', 'available');
    }
}
window.handlePlayerTap = handlePlayerTap;

/* -- Drag-and-Drop (desktop) -------------------------------------- */
function onChipDragStart(e, playerId, source) {
    dragPlayerId = playerId;
    dragSource = source;
    e.dataTransfer.effectAllowed = 'move';
    e.target.classList.add('dragging');
}
window.onChipDragStart = onChipDragStart;

function onChipDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}
window.onChipDragOver = onChipDragOver;

function onChipDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}
window.onChipDragLeave = onChipDragLeave;

function onChipDrop(e, target) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (!dragPlayerId) return;
    const pid = dragPlayerId;
    const src = dragSource;
    dragPlayerId = null;
    dragSource = null;
    movePlayer(pid, src, target);
}
window.onChipDrop = onChipDrop;

/* -- Formation Bars ------------------------------------------------ */
function buildFormationBars() {
    // Squad step formation dropdowns (both sync'd)
    const optionsHTML = FORMATIONS.map(f =>
        `<option value="${f}" ${f === selectedSquadFormation ? 'selected' : ''}>${f}</option>`
    ).join('');

    ['formationDropdown-squad', 'formationDropdown-pitch'].forEach(id => {
        const sel = document.getElementById(id);
        if (sel) sel.innerHTML = optionsHTML;
    });

    // Plan A/B/C formation dropdowns
    ['planA', 'planB', 'planC'].forEach(key => {
        const sel = document.getElementById(`formationDropdown-${key}`);
        if (!sel) return;
        sel.innerHTML = FORMATIONS.map(f =>
            `<option value="${f}" ${f === planLineups[key].formation ? 'selected' : ''}>${f}</option>`
        ).join('');
    });
}

function onSquadFormationChange(value) {
    selectedSquadFormation = value;
    selectedPitchSlot = -1;
    // Sync both dropdowns
    ['formationDropdown-squad', 'formationDropdown-pitch'].forEach(id => {
        const sel = document.getElementById(id);
        if (sel) sel.value = value;
    });
    drawSquadPitch();
}
window.onSquadFormationChange = onSquadFormationChange;

/* -- Squad Pitch Preview ------------------------------------------- */
let selectedPitchSlot = -1; // index of selected position for swap

function isPortraitMode() { return window.innerWidth <= 768; }

function drawSquadPitch() {
    const canvas = document.getElementById('squadPitchCanvas');
    if (!canvas || !canvas.parentElement) return;
    if (canvas.parentElement.clientWidth === 0) return;
    const ctx = canvas.getContext('2d');
    const isPort = isPortraitMode();

    // Sizing: landscape on desktop (like drill-builder 860x460), portrait on mobile
    const dpr = window.devicePixelRatio || 1;
    const displayW = canvas.parentElement.clientWidth;
    const displayH = isPort
        ? Math.round(displayW * 1.45)                     // portrait: tall
        : Math.round(displayW * (460 / 860));              // landscape: match drill-builder ratio
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    canvas.style.width = displayW + 'px';
    canvas.style.height = displayH + 'px';
    ctx.scale(dpr, dpr);

    const W = displayW;
    const H = displayH;

    // Striped grass background (matching drill-builder)
    ctx.fillStyle = '#1e5c30';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1a5228';
    if (isPort) {
        const sh = H / 10;
        for (let i = 0; i * sh < H; i += 2) ctx.fillRect(0, i * sh, W, sh);
    } else {
        const sw = W / 10;
        for (let i = 0; i * sw < W; i += 2) ctx.fillRect(i * sw, 0, sw, H);
    }

    // Field dimensions
    const PAD = 28;
    const fx = PAD, fy = PAD;
    const fw = W - 2 * PAD;
    const fh = H - 2 * PAD;
    const mx = fx + fw / 2;
    const my = fy + fh / 2;

    // Line style (matching drill-builder — bright white)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';

    // Draw pitch markings based on orientation
    if (isPort) {
        drawPitchVert(ctx, fx, fy, fw, fh, mx, my);
    } else {
        drawPitchHoriz(ctx, fx, fy, fw, fh, mx, my);
    }

    // Corner arcs
    const caR = 11;
    [[fx, fy, 0, Math.PI / 2], [fx + fw, fy, Math.PI / 2, Math.PI],
     [fx + fw, fy + fh, Math.PI, 1.5 * Math.PI], [fx, fy + fh, 1.5 * Math.PI, 2 * Math.PI]]
    .forEach(([cx, cy, s, e]) => {
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, caR, s, e);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    });

    // Draw players in formation
    const positions = FORMATION_POSITIONS[selectedSquadFormation] || FORMATION_POSITIONS['4-3-3'];
    const circleR = isPort ? Math.min(fw, fh) * 0.038 : Math.min(fw, fh) * 0.055;

    canvas._hitAreas = [];

    positions.forEach((pos, i) => {
        // Portrait: positions as-defined (x across, y down, attacking upward)
        // Landscape: rotate 90° — attacking goes right. Map portrait y→landscape x (inverted), portrait x→landscape y
        let px, py;
        if (isPort) {
            px = fx + (pos.x / 100) * fw;
            py = fy + (pos.y / 100) * fh;
        } else {
            px = fx + ((100 - pos.y) / 100) * fw;  // flip y→x so GK is left, ST is right
            py = fy + (pos.x / 100) * fh;
        }

        const player = startingXI[i] ? squadPlayers.find(p => p.id === startingXI[i]) : null;
        canvas._hitAreas.push({ x: px, y: py, r: circleR, index: i });
        const isSelected = selectedPitchSlot === i;

        // Draw circle
        if (player) {
            ctx.save();
            ctx.shadowColor = isSelected ? 'rgba(0,196,154,0.8)' : 'rgba(0,0,0,0.4)';
            ctx.shadowBlur = isSelected ? 14 : 6;
            ctx.shadowOffsetY = 2;
            ctx.beginPath(); ctx.arc(px, py, circleR, 0, Math.PI * 2);
            ctx.fillStyle = isSelected ? '#00C49A' : '#1e3a8a';
            ctx.fill();
            ctx.restore();
            ctx.beginPath(); ctx.arc(px, py, circleR, 0, Math.PI * 2);
            ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.85)';
            ctx.lineWidth = isSelected ? 3 : 2;
            ctx.stroke();
        } else {
            ctx.save();
            if (isSelected) { ctx.shadowColor = 'rgba(0,196,154,0.5)'; ctx.shadowBlur = 10; }
            ctx.beginPath(); ctx.arc(px, py, circleR, 0, Math.PI * 2);
            ctx.fillStyle = isSelected ? 'rgba(0,196,154,0.25)' : 'rgba(255,255,255,0.08)';
            ctx.fill();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = isSelected ? '#00C49A' : 'rgba(255,255,255,0.35)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

        // Label
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (player) {
            const nameParts = (player.name || '').split(' ');
            const shortName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];
            const displayName = shortName.length > 8 ? shortName.slice(0, 7) + '.' : shortName;
            ctx.font = `bold ${Math.round(circleR * 0.68)}px Inter, sans-serif`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(displayName, px, py);
            ctx.font = `600 ${Math.round(circleR * 0.52)}px Inter, sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.65)';
            ctx.fillText(pos.role, px, py + circleR + 10);
        } else {
            ctx.font = `bold ${Math.round(circleR * 0.62)}px Inter, sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.fillText(pos.role, px, py);
        }
    });

    renderSubsBar();
}
window.drawSquadPitch = drawSquadPitch;

/* -- Pitch Drawing: Vertical (portrait — attacking upward) --------- */
function drawPitchVert(ctx, fx, fy, fw, fh, mx, my) {
    ctx.strokeRect(fx, fy, fw, fh);
    // Center line + dot + circle
    ctx.beginPath(); ctx.moveTo(fx, my); ctx.lineTo(fx + fw, my); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fillStyle = 'white'; ctx.fill(); ctx.restore();
    const ccR = fw * 0.175;
    ctx.beginPath(); ctx.arc(mx, my, ccR, 0, Math.PI * 2); ctx.stroke();

    const pbH = fh * 0.138, pbW = fw * 0.44;
    const gbH = fh * 0.053, gbW = fw * 0.22;
    const gW = fw * 0.21;

    // Top penalty area + goal
    ctx.strokeRect(mx - pbW / 2, fy, pbW, pbH);
    ctx.strokeRect(mx - gbW / 2, fy, gbW, gbH);
    ctx.strokeRect(mx - gW / 2, fy - 10, gW, 10);
    const tS = fy + pbH * 0.72;
    ctx.save(); ctx.beginPath(); ctx.arc(mx, tS, 3, 0, Math.PI * 2); ctx.fillStyle = 'white'; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(fx, fy + pbH, fw, fh); ctx.clip();
    ctx.beginPath(); ctx.arc(mx, tS, ccR, 0, Math.PI); ctx.stroke(); ctx.restore();

    // Bottom penalty area + goal
    ctx.strokeRect(mx - pbW / 2, fy + fh - pbH, pbW, pbH);
    ctx.strokeRect(mx - gbW / 2, fy + fh - gbH, gbW, gbH);
    ctx.strokeRect(mx - gW / 2, fy + fh, gW, 10);
    const bS = fy + fh - pbH * 0.72;
    ctx.save(); ctx.beginPath(); ctx.arc(mx, bS, 3, 0, Math.PI * 2); ctx.fillStyle = 'white'; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(fx, fy, fw, fh - pbH); ctx.clip();
    ctx.beginPath(); ctx.arc(mx, bS, ccR, Math.PI, 0); ctx.stroke(); ctx.restore();
}

/* -- Pitch Drawing: Horizontal (landscape — attacking right) ------- */
function drawPitchHoriz(ctx, fx, fy, fw, fh, mx, my) {
    ctx.strokeRect(fx, fy, fw, fh);
    // Center line + dot + circle
    ctx.beginPath(); ctx.moveTo(mx, fy); ctx.lineTo(mx, fy + fh); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fillStyle = 'white'; ctx.fill(); ctx.restore();
    const ccR = fh * 0.175;
    ctx.beginPath(); ctx.arc(mx, my, ccR, 0, Math.PI * 2); ctx.stroke();

    const pbW = fw * 0.138, pbH = fh * 0.44;
    const gbW = fw * 0.053, gbH = fh * 0.22;
    const gH = fh * 0.21;

    // Left penalty area + goal (defending side)
    ctx.strokeRect(fx, my - pbH / 2, pbW, pbH);
    ctx.strokeRect(fx, my - gbH / 2, gbW, gbH);
    ctx.strokeRect(fx - 10, my - gH / 2, 10, gH);
    const lS = fx + pbW * 0.72;
    ctx.save(); ctx.beginPath(); ctx.arc(lS, my, 3, 0, Math.PI * 2); ctx.fillStyle = 'white'; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(fx + pbW, fy, fw, fh); ctx.clip();
    ctx.beginPath(); ctx.arc(lS, my, ccR, -Math.PI * 0.36, Math.PI * 0.36); ctx.stroke(); ctx.restore();

    // Right penalty area + goal (attacking side)
    ctx.strokeRect(fx + fw - pbW, my - pbH / 2, pbW, pbH);
    ctx.strokeRect(fx + fw - gbW, my - gbH / 2, gbW, gbH);
    ctx.strokeRect(fx + fw, my - gH / 2, 10, gH);
    const rS = fx + fw - pbW * 0.72;
    ctx.save(); ctx.beginPath(); ctx.arc(rS, my, 3, 0, Math.PI * 2); ctx.fillStyle = 'white'; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(fx, fy, fw - pbW, fh); ctx.clip();
    ctx.beginPath(); ctx.arc(rS, my, ccR, Math.PI * 0.64, Math.PI * 1.36); ctx.stroke(); ctx.restore();
}

/* -- Subs Bar (DOM-based) ------------------------------------------ */
function renderSubsBar() {
    const wrap = document.getElementById('squadSubsBar');
    if (!wrap) return;
    if (substitutes.length === 0) {
        wrap.innerHTML = '<span style="color:#94a3b8;font-size:0.8rem;">No substitutes selected</span>';
        return;
    }
    wrap.innerHTML = substitutes.map(id => {
        const p = squadPlayers.find(x => x.id === id);
        if (!p) return '';
        const initials = (p.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        return `<div class="sub-chip">
            <span class="sub-chip-avatar">${initials}</span>
            <span class="sub-chip-name">${escH(p.name)}</span>
            <span class="sub-chip-pos">${p.position || '--'}</span>
        </div>`;
    }).join('');
}

/* -- Pitch Click-to-Swap ------------------------------------------- */
function initPitchInteraction() {
    const canvas = document.getElementById('squadPitchCanvas');
    if (!canvas || canvas._interactionInit) return;
    canvas._interactionInit = true;

    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const clickX = (e.clientX - rect.left);
        const clickY = (e.clientY - rect.top);

        if (!canvas._hitAreas) return;

        // Find which position was clicked
        let clickedIdx = -1;
        for (const area of canvas._hitAreas) {
            const dx = clickX - area.x;
            const dy = clickY - area.y;
            if (Math.sqrt(dx * dx + dy * dy) <= area.r * 1.5) {
                clickedIdx = area.index;
                break;
            }
        }

        if (clickedIdx === -1) {
            // Clicked empty space — deselect
            selectedPitchSlot = -1;
            drawSquadPitch();
            return;
        }

        if (selectedPitchSlot === -1) {
            // Nothing selected yet — select this slot if it has a player
            if (startingXI[clickedIdx]) {
                selectedPitchSlot = clickedIdx;
                drawSquadPitch();
            }
        } else if (selectedPitchSlot === clickedIdx) {
            // Deselect
            selectedPitchSlot = -1;
            drawSquadPitch();
        } else {
            // Swap the two positions in startingXI array
            const temp = startingXI[selectedPitchSlot];
            startingXI[selectedPitchSlot] = startingXI[clickedIdx];
            startingXI[clickedIdx] = temp;
            selectedPitchSlot = -1;
            renderSquadPicker();
        }
    });

    // Touch support
    canvas.addEventListener('touchend', (e) => {
        const touch = e.changedTouches[0];
        if (!touch) return;
        const simClick = new MouseEvent('click', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        canvas.dispatchEvent(simClick);
        e.preventDefault();
    }, { passive: false });

    // Redraw on resize (orientation change, window resize)
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            drawSquadPitch();
        }, 150);
    });
}

/* -- Plan Pitch (A/B/C) — formation players as drill-builder tokens -- */
const PLAN_CANVAS_IDS = ['planA', 'planB', 'planC'];
// Track which canvases have formation overlay toggled on
const formationOverlayState = {};

function syncPlanLineups() {
    // Copy squad starting XI and subs into each plan that hasn't been customized
    ['planA', 'planB', 'planC'].forEach(key => {
        const pl = planLineups[key];
        if (pl.xi.length === 0) {
            pl.xi = [...startingXI];
            pl.subs = [...substitutes];
        }
    });
}

/**
 * Convert formation percentage positions to pixel coordinates on the drill-builder canvas.
 * The drill-builder canvas is landscape (860x460) with PAD=28.
 * Formation positions are defined as (x%, y%) attacking upward (portrait).
 * For landscape: rotate 90° — portrait y becomes landscape x (inverted), portrait x becomes landscape y.
 */
function formationToPixel(pos, canvasW, canvasH) {
    const PAD = 28;
    const fw = canvasW - 2 * PAD;
    const fh = canvasH - 2 * PAD;
    // Landscape: attacking right. GK on left, forwards on right.
    const px = PAD + ((100 - pos.y) / 100) * fw;
    const py = PAD + (pos.x / 100) * fh;
    return { x: Math.round(px), y: Math.round(py) };
}

/**
 * Inject formation players as drill-builder tokens onto a canvas.
 * Tokens are tagged with _formationSlot so we can identify and manage them.
 */
function injectFormationTokens(canvasId, planKey) {
    const s = canvases[canvasId];
    if (!s) return;
    const pl = planLineups[planKey];
    const positions = FORMATION_POSITIONS[pl.formation] || FORMATION_POSITIONS['4-3-3'];

    // Remove existing formation tokens
    s.tokens = s.tokens.filter(t => t._formationSlot === undefined);

    // Add formation player tokens
    positions.forEach((pos, i) => {
        const playerId = pl.xi[i];
        const player = playerId ? squadPlayers.find(p => p.id === playerId) : null;
        const { x, y } = formationToPixel(pos, s.width, s.height);

        // Build label: surname or role
        let label = pos.role;
        if (player) {
            const parts = (player.name || '').split(' ');
            const surname = parts.length > 1 ? parts[parts.length - 1] : parts[0];
            label = surname.length > 7 ? surname.slice(0, 6) + '.' : surname;
        }

        s.tokens.push({
            type: i === 0 ? 'goalkeeper' : 'player',
            x, y,
            color: player ? '#1e3a8a' : '#475569',
            label,
            scale: 0.7,  // smaller than default
            rot: 0,
            _formationSlot: i,
            _playerId: playerId || null,
            _planKey: planKey
        });
    });

    drawAll(canvasId, canvases);
}

/**
 * Inject formation tokens onto a non-plan canvas (offense/defense/set pieces).
 * Uses Plan A's lineup by default. Toggle on/off.
 */
function toggleFormationOverlay(canvasId) {
    const s = canvases[canvasId];
    if (!s) {
        showToast('Open the canvas first, then toggle formation', 'info');
        return;
    }
    const btn = document.querySelector(`[onclick="toggleFormationOverlay('${canvasId}')"]`);
    const isOn = formationOverlayState[canvasId];

    if (isOn) {
        // Remove formation tokens
        s.tokens = s.tokens.filter(t => t._formationSlot === undefined);
        formationOverlayState[canvasId] = false;
        if (btn) { btn.classList.remove('active'); btn.querySelector('span').textContent = 'Show Formation'; }
    } else {
        // Use Plan A lineup
        syncPlanLineups();
        const pl = planLineups.planA;
        const positions = FORMATION_POSITIONS[pl.formation] || FORMATION_POSITIONS['4-3-3'];

        positions.forEach((pos, i) => {
            const playerId = pl.xi[i];
            const player = playerId ? squadPlayers.find(p => p.id === playerId) : null;
            const { x, y } = formationToPixel(pos, s.width, s.height);

            let label = pos.role;
            if (player) {
                const parts = (player.name || '').split(' ');
                const surname = parts.length > 1 ? parts[parts.length - 1] : parts[0];
                label = surname.length > 7 ? surname.slice(0, 6) + '.' : surname;
            }

            s.tokens.push({
                type: i === 0 ? 'goalkeeper' : 'player',
                x, y,
                color: player ? '#1e3a8a' : '#475569',
                label,
                scale: 0.7,
                rot: 0,
                _formationSlot: i,
                _playerId: playerId || null,
                _planKey: 'planA'
            });
        });

        formationOverlayState[canvasId] = true;
        if (btn) { btn.classList.add('active'); btn.querySelector('span').textContent = 'Hide Formation'; }
    }
    drawAll(canvasId, canvases);
}
window.toggleFormationOverlay = toggleFormationOverlay;

function onPlanFormationChange(planKey, value) {
    planLineups[planKey].formation = value;
    // Re-inject tokens with new formation positions
    if (canvases[planKey]) {
        injectFormationTokens(planKey, planKey);
    }
}
window.onPlanFormationChange = onPlanFormationChange;

function renderPlanSubsBar(planKey) {
    const wrap = document.getElementById(`planSubsBar-${planKey}`);
    if (!wrap) return;
    const pl = planLineups[planKey];
    if (pl.subs.length === 0) {
        wrap.innerHTML = '<span style="color:#94a3b8;font-size:0.8rem;">No substitutes available</span>';
        return;
    }
    wrap.innerHTML = pl.subs.map(id => {
        const p = squadPlayers.find(x => x.id === id);
        if (!p) return '';
        const initials = (p.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        return `<div class="sub-chip" style="cursor:pointer;" onclick="swapSubIntoPlan('${planKey}','${p.id}')">
            <span class="sub-chip-avatar">${initials}</span>
            <span class="sub-chip-name">${escH(p.name)}</span>
            <span class="sub-chip-pos">${p.position || '--'}</span>
        </div>`;
    }).join('');
}

/**
 * Swap a sub into the XI: find the currently selected formation token on the canvas,
 * replace its player, and update the subs bar.
 */
function swapSubIntoPlan(planKey, subPlayerId) {
    const s = canvases[planKey];
    if (!s) return;
    const pl = planLineups[planKey];

    // Find the selected formation token
    const selectedToken = s.selected && (s.selected._formationSlot !== undefined) ? s.selected : null;
    if (!selectedToken) {
        showToast('Select a player on the pitch first (use Move tool), then tap a sub', 'info');
        return;
    }

    const slotIdx = selectedToken._formationSlot;
    const currentPlayerId = pl.xi[slotIdx];

    // Swap
    pl.xi[slotIdx] = subPlayerId;
    pl.subs = pl.subs.filter(id => id !== subPlayerId);
    if (currentPlayerId) pl.subs.push(currentPlayerId);

    // Update the token label
    const newPlayer = squadPlayers.find(p => p.id === subPlayerId);
    if (newPlayer) {
        const parts = (newPlayer.name || '').split(' ');
        const surname = parts.length > 1 ? parts[parts.length - 1] : parts[0];
        selectedToken.label = surname.length > 7 ? surname.slice(0, 6) + '.' : surname;
        selectedToken.color = '#1e3a8a';
    }
    selectedToken._playerId = subPlayerId;
    s.selected = null;

    drawAll(planKey, canvases);
    renderPlanSubsBar(planKey);
}
window.swapSubIntoPlan = swapSubIntoPlan;

/* -- Extra Sections (add more explanation blocks below a plan) ------- */
let extraSectionCount = 0;

function addExtraSection(planKey) {
    const container = document.getElementById(`extraSections-${planKey}`);
    if (!container) return;
    extraSectionCount++;
    const sectionId = `extra-${planKey}-${extraSectionCount}`;
    const section = document.createElement('div');
    section.className = 'dash-card';
    section.id = sectionId;
    section.style.cssText = 'padding: 24px; margin-top: 12px; position: relative;';
    section.innerHTML = `
        <button class="dash-btn ghost sm" onclick="this.closest('.dash-card').remove()" style="position: absolute; top: 12px; right: 12px; color: #94a3b8;" title="Remove section"><i class="fas fa-times"></i></button>
        <input type="text" class="form-input extra-section-title" placeholder="Section title (e.g. Counter-attack, Pressing trigger...)" style="width: calc(100% - 40px); border: none; border-bottom: 1px solid #e2e8f0; padding: 6px 0; margin-bottom: 12px; font-weight: 600; font-size: 0.95rem; background: transparent;">
        <textarea class="plan-notes" placeholder="Explain this aspect of the plan..." style="min-height: 100px;"></textarea>
    `;
    container.appendChild(section);
}
window.addExtraSection = addExtraSection;

/* -- Canvas Builder ------------------------------------------------ */
function buildCanvasHTML(id) {
    return `
    <div class="plan-canvas-wrap" id="dcw-${id}">
        <div style="overflow: auto; background: #1a4a2a;">
            <canvas id="dc-${id}"></canvas>
        </div>
        <div class="mini-toolbar">
            <div class="mini-tool-row">
                <span class="mini-row-label">Draw</span>
                <button class="mt-btn active" id="mt-${id}-pencil" onclick="setMT('${id}','pencil',canvases)">✏ Pencil</button>
                <div class="mt-dropdown">
                    <button class="mt-btn mt-dropdown-toggle" id="mt-${id}-lines-grp">/ Lines ▾</button>
                    <div class="mt-dropdown-menu">
                        <button class="mt-btn" id="mt-${id}-line" onclick="setMT('${id}','line',canvases); closeMTDropdowns(this)">/ Line</button>
                        <button class="mt-btn" id="mt-${id}-arrow" onclick="setMT('${id}','arrow',canvases); closeMTDropdowns(this)">→ Arrow</button>
                    </div>
                </div>
                <div class="mt-dropdown">
                    <button class="mt-btn mt-dropdown-toggle" id="mt-${id}-dashed-grp">⤳ Dashed ▾</button>
                    <div class="mt-dropdown-menu">
                        <button class="mt-btn" id="mt-${id}-dashed" onclick="setMT('${id}','dashed',canvases); closeMTDropdowns(this)">⤳ Dashed Arrow</button>
                        <button class="mt-btn" id="mt-${id}-dashed-line" onclick="setMT('${id}','dashed-line',canvases); closeMTDropdowns(this)">- - Dashed Line</button>
                    </div>
                </div>
                <button class="mt-btn" id="mt-${id}-curved" onclick="setMT('${id}','curved',canvases)">↩ Curved</button>
                <div class="mt-dropdown">
                    <button class="mt-btn mt-dropdown-toggle" id="mt-${id}-shapes-grp">▭ Shapes ▾</button>
                    <div class="mt-dropdown-menu">
                        <button class="mt-btn" id="mt-${id}-rect"    onclick="selectShape('${id}','rect',canvases); closeMTDropdowns(this)">▭ Rect</button>
                        <button class="mt-btn" id="mt-${id}-circle"  onclick="selectShape('${id}','circle',canvases); closeMTDropdowns(this)">○ Circle</button>
                        <button class="mt-btn" id="mt-${id}-tri"     onclick="selectShape('${id}','tri',canvases); closeMTDropdowns(this)">△ Tri</button>
                        <button class="mt-btn" id="mt-${id}-polygon" onclick="selectShape('${id}','polygon',canvases); closeMTDropdowns(this)">⬠ Polygon</button>
                    </div>
                </div>
                <button class="mt-btn mt-fill-toggle" id="mt-${id}-fill-toggle" onclick="toggleShapeFill('${id}',canvases)" title="Toggle fill on shapes">◐ Fill</button>
                <button class="mt-btn" id="mt-${id}-eraser" onclick="setMT('${id}','eraser',canvases)">⌫ Eraser</button>
                <div class="mt-divider"></div>
                <select class="mt-select" onchange="setMW('${id}',parseInt(this.value),canvases)">
                    <option value="2">Thin</option>
                    <option value="4" selected>Medium</option>
                    <option value="7">Thick</option>
                    <option value="11">Bold</option>
                </select>
            </div>
            <div class="mini-tool-row">
                <span class="mini-row-label">Place</span>
                <button class="mt-btn" id="mt-${id}-move" onclick="setMT('${id}','move',canvases)">✥ Move</button>
                <div class="mt-divider"></div>
                <button class="mt-btn" id="mt-${id}-cone" onclick="setMT('${id}','cone',canvases)">▲ Cone</button>
                <button class="mt-btn" id="mt-${id}-ball" onclick="setMT('${id}','ball',canvases)">⚽ Ball</button>
                <button class="mt-btn" id="mt-${id}-goalpost" onclick="setMT('${id}','goalpost',canvases)">🥅 Goalpost</button>
                <button class="mt-btn" id="mt-${id}-flag" onclick="setMT('${id}','flag',canvases)">⚑ Flag</button>
                <button class="mt-btn" id="mt-${id}-number" onclick="setMT('${id}','number',canvases)"># Num</button>
                <div class="mt-divider"></div>
                <button class="mt-btn" id="mt-${id}-ladder" onclick="setMT('${id}','ladder',canvases)">☷ Ladder</button>
                <button class="mt-btn" id="mt-${id}-hurdle" onclick="setMT('${id}','hurdle',canvases)">⊓ Hurdle</button>
                <button class="mt-btn" id="mt-${id}-mannequin" onclick="setMT('${id}','mannequin',canvases)">🧍 Mannequin</button>
                <button class="mt-btn" id="mt-${id}-pole" onclick="setMT('${id}','pole',canvases)">| Pole</button>
                <button class="mt-btn" id="mt-${id}-minigoal" onclick="setMT('${id}','minigoal',canvases)">⊏⊐ Mini Goal</button>
                <button class="mt-btn" id="mt-${id}-ring" onclick="setMT('${id}','ring',canvases)">◎ Ring</button>
                <button class="mt-btn" id="mt-${id}-rebounder" onclick="setMT('${id}','rebounder',canvases)">▥ Rebounder</button>
                <div class="mt-divider"></div>
                <select class="mt-select" onchange="setTokenSize('${id}',this.value,canvases)" title="Token Size">
                    <option value="small">Small</option>
                    <option value="medium" selected>Medium</option>
                    <option value="large">Large</option>
                </select>
            </div>
            <div class="mini-tool-row">
                <span class="mini-row-label">Colour</span>
                <div class="mt-equip-swatch active" data-color="#ff6d00" onclick="setEquipColor('${id}',this,canvases)" style="background:#ff6d00" title="Orange"></div>
                <div class="mt-equip-swatch" data-color="#fdd835" onclick="setEquipColor('${id}',this,canvases)" style="background:#fdd835" title="Yellow"></div>
                <div class="mt-equip-swatch" data-color="#e53935" onclick="setEquipColor('${id}',this,canvases)" style="background:#e53935" title="Red"></div>
                <div class="mt-equip-swatch" data-color="#1e88e5" onclick="setEquipColor('${id}',this,canvases)" style="background:#1e88e5" title="Blue"></div>
                <div class="mt-equip-swatch" data-color="#43a047" onclick="setEquipColor('${id}',this,canvases)" style="background:#43a047" title="Green"></div>
                <div class="mt-equip-swatch" data-color="#ffffff" onclick="setEquipColor('${id}',this,canvases)" style="background:#fff;border:1px solid #cbd5e0" title="White"></div>
                <div class="mt-equip-swatch" data-color="#ff9800" onclick="setEquipColor('${id}',this,canvases)" style="background:#ff9800" title="Amber"></div>
                <div class="mt-equip-swatch" data-color="#8e24aa" onclick="setEquipColor('${id}',this,canvases)" style="background:#8e24aa" title="Purple"></div>
                <input type="color" value="#ff6d00" oninput="this.parentElement.querySelector('.mt-equip-swatch.active')?.classList.remove('active');canvases['${id}'].selColor=this.value;canvases['${id}'].drawColor=this.value"
                       style="width:20px;height:20px;border:1px solid #cbd5e0;border-radius:50%;cursor:pointer;padding:0;" title="Custom Colour">
            </div>
            <div class="mini-tool-row">
                <span class="mini-row-label">Team</span>
                <div class="mt-swatch active" data-color="#e53935" onclick="setMC('${id}',this,canvases)" style="background:#e53935" title="Red">👕</div>
                <div class="mt-swatch" data-color="#1e88e5" onclick="setMC('${id}',this,canvases)" style="background:#1e88e5" title="Blue">👕</div>
                <div class="mt-swatch" data-color="#43a047" onclick="setMC('${id}',this,canvases)" style="background:#43a047" title="Green">👕</div>
                <div class="mt-swatch" data-color="#fdd835" onclick="setMC('${id}',this,canvases)" style="background:#fdd835" title="Yellow">👕</div>
                <div class="mt-swatch" data-color="#f57c00" onclick="setMC('${id}',this,canvases)" style="background:#f57c00" title="Orange">👕</div>
                <div class="mt-swatch" data-color="#8e24aa" onclick="setMC('${id}',this,canvases)" style="background:#8e24aa" title="Purple">👕</div>
                <div class="mt-swatch" data-color="#ffffff" onclick="setMC('${id}',this,canvases)" style="background:#fff;border:1px solid #e2e8f0" title="White">👕</div>
                <div class="mt-swatch" data-color="#212121" onclick="setMC('${id}',this,canvases)" style="background:#212121" title="Black">👕</div>
                <div class="mt-swatch" data-color="#e91e63" onclick="setMC('${id}',this,canvases)" style="background:#e91e63" title="Pink">👕</div>
                <div class="mt-divider"></div>
                <div class="mt-swatch" data-color="#ffeb3b" onclick="setGK('${id}',this,canvases)" style="background:#ffeb3b;font-size:9px;font-weight:700;" title="GK Yellow">GK</div>
                <div class="mt-swatch" data-color="#ff9800" onclick="setGK('${id}',this,canvases)" style="background:#ff9800;font-size:9px;font-weight:700;" title="GK Orange">GK</div>
            </div>
            <div class="mini-tool-row">
                <span class="mini-row-label">Actions</span>
                <button class="mt-action-btn undo" onclick="mUndo('${id}',canvases)"><i class="fas fa-undo"></i> Undo</button>
                <button class="mt-action-btn clear" onclick="mClear('${id}',canvases)"><i class="fas fa-trash"></i> Clear</button>
                <div class="mt-divider"></div>
                <button class="mt-action-btn png" onclick="exportDrillPNG('${id}')"><i class="fas fa-download"></i> PNG</button>
            </div>
        </div>
    </div>`;
}

function exportDrillPNG(id) {
    const s = canvases[id]; if (!s) return;
    const title = document.getElementById('planTitle')?.value || 'MatchPlan';
    const safeTitle = title.replace(/[^a-z0-9]/gi, '_');
    const a = document.createElement('a');
    a.download = `MatchPlan_${safeTitle}_${id}.png`;
    a.href = s.canvas.toDataURL('image/png');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}
window.exportDrillPNG = exportDrillPNG;

function ensureCanvas(id) {
    if (initializedCanvases.has(id)) return;
    const wrap = document.getElementById(`canvasWrap-${id}`);
    if (!wrap) return;
    if (!wrap.innerHTML.trim()) {
        wrap.innerHTML = buildCanvasHTML(id);
    }
    // Restore saved canvas state if editing
    if (planData._canvasStates && planData._canvasStates[id]) {
        const saved = planData._canvasStates[id];
        canvases[id] = {
            paths: saved.paths || [],
            tokens: saved.tokens || [],
            orientation: saved.orientation || 'landscape',
            pitchType: saved.pitchType || 'full'
        };
    }
    initCanvas(id, canvases);
    initializedCanvases.add(id);
}

/* -- Step Navigation ----------------------------------------------- */
function goToStep(index) { showStep(index); }
window.goToStep = goToStep;

function nextStep() { if (currentStep < TOTAL_STEPS - 1) showStep(currentStep + 1); }
window.nextStep = nextStep;

function prevStep() { if (currentStep > 0) showStep(currentStep - 1); }
window.prevStep = prevStep;

function showStep(index) {
    currentStep = index;

    // Update stepper
    document.querySelectorAll('.plan-step').forEach((el, i) => {
        el.classList.toggle('active', i === index);
        if (i < index) el.classList.add('completed');
    });

    // Show/hide panels
    document.querySelectorAll('.step-panel').forEach((el, i) => {
        el.classList.toggle('active', i === index);
    });

    // Prev/Next buttons
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');
    if (btnPrev) btnPrev.style.display = index === 0 ? 'none' : 'inline-flex';
    if (btnNext) {
        if (index === TOTAL_STEPS - 1) {
            btnNext.style.display = 'none';
        } else {
            btnNext.style.display = 'inline-flex';
            btnNext.innerHTML = 'Next <i class="fas fa-chevron-right"></i>';
        }
    }

    // Lazy-init canvases for this step, then redraw visible ones
    initCanvasesForStep(index);
    redrawVisibleCanvases(index);

    // Redraw squad pitch when entering the Squad step
    if (index === 2) {
        setTimeout(() => drawSquadPitch(), 50);
    }

    // Inject formation tokens when entering Plan A/B/C steps
    const planStepMap = { 3: 'planA', 4: 'planB', 5: 'planC' };
    if (planStepMap[index]) {
        const planKey = planStepMap[index];
        syncPlanLineups();
        setTimeout(() => {
            if (canvases[planKey]) {
                injectFormationTokens(planKey, planKey);
                renderPlanSubsBar(planKey);
            }
        }, 80);
    }

    // Scroll to top
    document.querySelector('.main-content')?.scrollTo(0, 0);
}

function redrawVisibleCanvases(stepIndex) {
    const stepCanvasMap = {
        3: ['planA'],
        4: ['planB'],
        5: ['planC'],
        6: ['off-buildup'],   // only first zone tab is visible initially
        7: ['def-defBlock'],
        8: ['sp-cornersFor', 'sp-cornersAgainst']
    };
    const ids = stepCanvasMap[stepIndex];
    if (ids) {
        ids.forEach(id => {
            if (canvases[id]) drawAll(id, canvases);
        });
    }
}

function initCanvasesForStep(stepIndex) {
    const stepCanvasMap = {
        3: ['planA'],
        4: ['planB'],
        5: ['planC'],
        6: ['off-buildup', 'off-transition', 'off-attack'],
        7: ['def-defBlock', 'def-midPress', 'def-highPress'],
        8: ['sp-cornersFor', 'sp-cornersAgainst']
    };
    const ids = stepCanvasMap[stepIndex];
    if (ids) {
        ids.forEach(id => ensureCanvas(id));
    }
}

/* -- Zone Sub-tabs ------------------------------------------------- */
function switchZone(group, zone) {
    const parent = group === 'offense' ? document.getElementById('step-6') : document.getElementById('step-7');
    if (!parent) return;
    parent.querySelectorAll('.zone-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    parent.querySelectorAll('.zone-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`zone-${group}-${zone}`);
    if (panel) panel.classList.add('active');

    // Ensure canvas is initialized when its zone tab is shown
    const zoneCanvasMap = {
        'offense-buildup': 'off-buildup',
        'offense-transition': 'off-transition',
        'offense-attack': 'off-attack',
        'defense-defBlock': 'def-defBlock',
        'defense-midPress': 'def-midPress',
        'defense-highPress': 'def-highPress'
    };
    const canvasId = zoneCanvasMap[`${group}-${zone}`];
    if (canvasId) {
        ensureCanvas(canvasId);
        if (canvases[canvasId]) drawAll(canvasId, canvases);
    }
}
window.switchZone = switchZone;

/* -- Substitution Rows --------------------------------------------- */
function addSubRow(planKey) {
    const container = document.getElementById(`subs-${planKey}`);
    if (!container) return;
    const allPlayers = [...startingXI, ...substitutes].map(id => {
        const p = squadPlayers.find(x => x.id === id);
        return p ? `<option value="${p.id}">${p.name}</option>` : '';
    }).join('');

    const row = document.createElement('div');
    row.className = 'sub-row';
    row.innerHTML = `
        <select class="sub-off"><option value="">Off</option>${allPlayers}</select>
        <i class="fas fa-exchange-alt" style="color: var(--text-light);"></i>
        <select class="sub-on"><option value="">On</option>${allPlayers}</select>
        <button class="dash-btn outline sm danger" onclick="this.parentElement.remove()" style="padding: 6px 10px;"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(row);
}
window.addSubRow = addSubRow;

/* -- Opponent Intel Link Management -------------------------------- */
function addOppIntelLink() {
    const urlEl = document.getElementById('oppIntelLinkUrl');
    const labelEl = document.getElementById('oppIntelLinkLabel');
    const url = urlEl?.value?.trim();
    if (!url) { showToast('Enter a URL', 'error'); return; }
    const label = labelEl?.value?.trim() || url;
    oppIntelLinks.push({ url, label });
    urlEl.value = '';
    labelEl.value = '';
    renderOppIntelLinks();
}
window.addOppIntelLink = addOppIntelLink;

function removeOppIntelLink(index) {
    oppIntelLinks.splice(index, 1);
    renderOppIntelLinks();
}
window.removeOppIntelLink = removeOppIntelLink;

function renderOppIntelLinks() {
    const container = document.getElementById('oppIntelLinks');
    if (!container) return;
    if (!oppIntelLinks.length) {
        container.innerHTML = '<p style="color:#94a3b8;font-size:0.8rem;margin:0;">No links added yet</p>';
        return;
    }
    container.innerHTML = oppIntelLinks.map((link, i) => {
        const isVideo = /youtube|youtu\.be|vimeo|hudl|wyscout|sportscode/i.test(link.url);
        const iconClass = isVideo ? 'video' : 'article';
        const iconFA = isVideo ? 'fa-play-circle' : 'fa-external-link-alt';
        return `<div class="opp-link-card">
            <div class="link-icon ${iconClass}"><i class="fas ${iconFA}"></i></div>
            <div class="link-info">
                <div class="link-label">${escH(link.label)}</div>
                <div class="link-url">${escH(link.url)}</div>
            </div>
            <div class="link-actions">
                <a href="${escH(link.url)}" target="_blank" rel="noopener" class="dash-btn ghost sm" style="padding:5px 8px;"><i class="fas fa-external-link-alt"></i></a>
                <button class="dash-btn ghost sm" onclick="removeOppIntelLink(${i})" style="padding:5px 8px;color:#ef4444;"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

/* -- Collect All Data ---------------------------------------------- */
function collectPlanData() {
    const el = (id) => document.getElementById(id);
    const val = (id) => { const e = el(id); return e ? e.value : ''; };

    // Canvas states
    const canvasStates = {};
    CANVAS_IDS.forEach(id => {
        if (canvases[id]) {
            canvasStates[id] = {
                paths: canvases[id].paths || [],
                tokens: canvases[id].tokens || [],
                orientation: canvases[id].orientation || 'landscape',
                pitchType: canvases[id].pitchType || 'full'
            };
        }
    });

    // Substitution data (sub plan rows)
    const getSubs = (key) => {
        const container = el(`subs-${key}`);
        if (!container) return [];
        return Array.from(container.querySelectorAll('.sub-row')).map(row => ({
            off: row.querySelector('.sub-off')?.value || '',
            on: row.querySelector('.sub-on')?.value || ''
        })).filter(s => s.off || s.on);
    };

    // Per-plan lineup data
    const getPlanData = (key) => {
        const pl = planLineups[key];
        // Collect extra sections
        const extraContainer = el(`extraSections-${key}`);
        const extraSections = [];
        if (extraContainer) {
            extraContainer.querySelectorAll('.dash-card').forEach(card => {
                const title = card.querySelector('.extra-section-title')?.value || '';
                const body = card.querySelector('.plan-notes')?.value || '';
                if (title || body) extraSections.push({ title, body });
            });
        }
        return {
            formation: pl.formation,
            xi: pl.xi,
            subs: pl.subs,
            notes: val(`notes-${key}`),
            extraSections
        };
    };

    return {
        squad: { startingXI, substitutes, formation: selectedSquadFormation },
        match: {
            matchId: val('planMatchId'),
            opponent: val('planOpponent'),
            venue: val('planVenue'),
            date: val('planDate'),
            time: val('planTime'),
            ourSide: document.querySelector('input[name="planSide"]:checked')?.value || 'home'
        },
        opponentAnalysis: {
            context: val('oppIntelContext'),
            collective: val('oppIntelCollective'),
            individual: val('oppIntelIndividual'),
            formation: val('oppIntelFormation'),
            weaknesses: val('oppIntelWeaknesses'),
            strengths: val('oppIntelStrengths'),
            links: [...oppIntelLinks]
        },
        planA: getPlanData('planA'),
        planB: { ...getPlanData('planB'), substitutions: getSubs('planB') },
        planC: { ...getPlanData('planC'), substitutions: getSubs('planC') },
        offense: {
            buildup: { notes: val('notes-off-buildup') },
            transition: { notes: val('notes-off-transition') },
            attack: { notes: val('notes-off-attack') }
        },
        defense: {
            defBlock: { notes: val('notes-def-defBlock') },
            midPress: { notes: val('notes-def-midPress') },
            highPress: { notes: val('notes-def-highPress') }
        },
        setPieces: {
            cornersFor: { notes: val('notes-sp-cornersFor') },
            cornersAgainst: { notes: val('notes-sp-cornersAgainst') },
            freeKickNear: val('spFreeKickNear'),
            freeKickFar: val('spFreeKickFar'),
            penaltyTaker: val('spPenaltyTaker'),
            cornerLeft: val('spCornerLeft'),
            cornerRight: val('spCornerRight')
        },
        _canvasStates: canvasStates
    };
}

/* -- Save Plan ----------------------------------------------------- */
async function savePlan() {
    const titleEl = document.getElementById('planTitle');
    const title = titleEl.value.trim();
    if (!title) {
        titleEl.style.borderColor = '#ef4444';
        titleEl.focus();
        showToast('Plan title is required', 'error');
        return;
    }
    titleEl.style.borderColor = '';
    const squadId = document.getElementById('planSquadId').value;
    const matchId = document.getElementById('planMatchId').value;
    const data = collectPlanData();

    try {
        if (planId) {
            const { error } = await supabase
                .from('match_plans')
                .update({
                    title,
                    squad_id: squadId || null,
                    match_id: matchId || null,
                    data
                })
                .eq('id', planId);

            if (error) throw error;
        } else {
            const clubId = matchManager.clubId;
            if (!clubId) {
                showToast('Club not loaded — please refresh and try again', 'error');
                return;
            }
            const { data: result, error } = await supabase
                .from('match_plans')
                .insert({
                    club_id: clubId,
                    title,
                    squad_id: squadId || null,
                    match_id: matchId || null,
                    data
                })
                .select()
                .single();

            if (error) throw error;
            planId = result.id;
            // Update URL without reload
            history.replaceState(null, '', `match-plan.html?id=${planId}`);
        }
        showToast('Match plan saved!', 'success');
    } catch (err) {
        console.error('Save failed:', err);
        showToast('Failed to save plan', 'error');
    }
}
window.savePlan = savePlan;

/* -- Load Existing Plan -------------------------------------------- */
async function loadExistingPlan() {
    try {
        const { data: plan, error } = await supabase
            .from('match_plans')
            .select('*')
            .eq('id', planId)
            .single();

        if (error) throw error;
        if (!plan) return;

        const data = typeof plan.data === 'string' ? JSON.parse(plan.data) : (plan.data || {});
        planData = data;

        // Title & squad
        document.getElementById('planTitle').value = plan.title || '';
        document.getElementById('planPageTitle').textContent = plan.title || 'Edit Match Plan';
        if (plan.squad_id) {
            document.getElementById('planSquadId').value = plan.squad_id;
            await onSquadChange();
        }

        // Squad selection
        if (data.squad) {
            startingXI = data.squad.startingXI || [];
            substitutes = data.squad.substitutes || [];
            if (data.squad.formation) {
                selectedSquadFormation = data.squad.formation;
                // Sync formation dropdowns
                ['formationDropdown-squad', 'formationDropdown-pitch'].forEach(id => {
                    const sel = document.getElementById(id);
                    if (sel) sel.value = data.squad.formation;
                });
            }
            renderSquadPicker();
        }

        // Match details
        if (data.match) {
            if (data.match.matchId) document.getElementById('planMatchId').value = data.match.matchId;
            if (data.match.opponent) document.getElementById('planOpponent').value = data.match.opponent;
            if (data.match.venue) document.getElementById('planVenue').value = data.match.venue;
            if (data.match.date) document.getElementById('planDate').value = data.match.date;
            if (data.match.time) document.getElementById('planTime').value = data.match.time;
            if (data.match.ourSide) {
                const radio = document.querySelector(`input[name="planSide"][value="${data.match.ourSide}"]`);
                if (radio) radio.checked = true;
            }
        }

        // Opponent Analysis
        if (data.opponentAnalysis) {
            const oa = data.opponentAnalysis;
            if (oa.context) document.getElementById('oppIntelContext').value = oa.context;
            if (oa.collective) document.getElementById('oppIntelCollective').value = oa.collective;
            if (oa.individual) document.getElementById('oppIntelIndividual').value = oa.individual;
            if (oa.formation) document.getElementById('oppIntelFormation').value = oa.formation;
            if (oa.weaknesses) document.getElementById('oppIntelWeaknesses').value = oa.weaknesses;
            if (oa.strengths) document.getElementById('oppIntelStrengths').value = oa.strengths;
            if (oa.links?.length) {
                oppIntelLinks = [...oa.links];
                renderOppIntelLinks();
            }
        }

        // Per-plan lineups and formations
        ['planA', 'planB', 'planC'].forEach(key => {
            if (data[key]) {
                const pl = planLineups[key];
                if (data[key].formation) {
                    pl.formation = data[key].formation;
                    const sel = document.getElementById(`formationDropdown-${key}`);
                    if (sel) sel.value = data[key].formation;
                }
                if (data[key].xi?.length) pl.xi = [...data[key].xi];
                if (data[key].subs?.length) pl.subs = [...data[key].subs];
            }
            if (data[key]?.notes) {
                const textarea = document.getElementById(`notes-${key}`);
                if (textarea) textarea.value = data[key].notes;
            }
            // Restore extra sections
            if (data[key]?.extraSections?.length) {
                data[key].extraSections.forEach(sec => {
                    addExtraSection(key);
                    const container = document.getElementById(`extraSections-${key}`);
                    const lastCard = container?.lastElementChild;
                    if (lastCard) {
                        const titleInput = lastCard.querySelector('.extra-section-title');
                        const bodyTA = lastCard.querySelector('.plan-notes');
                        if (titleInput && sec.title) titleInput.value = sec.title;
                        if (bodyTA && sec.body) bodyTA.value = sec.body;
                    }
                });
            }
        });

        // Substitutions
        ['planB', 'planC'].forEach(key => {
            if (data[key]?.substitutions) {
                data[key].substitutions.forEach(() => addSubRow(key));
                const rows = document.querySelectorAll(`#subs-${key} .sub-row`);
                data[key].substitutions.forEach((sub, i) => {
                    if (rows[i]) {
                        const offSel = rows[i].querySelector('.sub-off');
                        const onSel = rows[i].querySelector('.sub-on');
                        if (offSel && sub.off) offSel.value = sub.off;
                        if (onSel && sub.on) onSel.value = sub.on;
                    }
                });
            }
        });

        // Offense/Defense notes
        if (data.offense) {
            ['buildup', 'transition', 'attack'].forEach(z => {
                if (data.offense[z]?.notes) {
                    const ta = document.getElementById(`notes-off-${z}`);
                    if (ta) ta.value = data.offense[z].notes;
                }
            });
        }
        if (data.defense) {
            ['defBlock', 'midPress', 'highPress'].forEach(z => {
                if (data.defense[z]?.notes) {
                    const ta = document.getElementById(`notes-def-${z}`);
                    if (ta) ta.value = data.defense[z].notes;
                }
            });
        }

        // Set pieces
        if (data.setPieces) {
            if (data.setPieces.cornersFor?.notes) document.getElementById('notes-sp-cornersFor').value = data.setPieces.cornersFor.notes;
            if (data.setPieces.cornersAgainst?.notes) document.getElementById('notes-sp-cornersAgainst').value = data.setPieces.cornersAgainst.notes;
            // Restore taker dropdowns (after squad is loaded so options exist)
            const takerMap = {
                freeKickNear: 'spFreeKickNear',
                freeKickFar: 'spFreeKickFar',
                penaltyTaker: 'spPenaltyTaker',
                cornerLeft: 'spCornerLeft',
                cornerRight: 'spCornerRight'
            };
            for (const [dataKey, elId] of Object.entries(takerMap)) {
                if (data.setPieces[dataKey]) {
                    const sel = document.getElementById(elId);
                    if (sel) sel.value = data.setPieces[dataKey];
                }
            }
        }

    } catch (err) {
        console.error('Failed to load plan:', err);
    }
}

/* -- PDF Export ----------------------------------------------------- */
async function exportPlanPDF() {
    if (!window.jspdf) {
        showToast('PDF library not loaded', 'error');
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const margin = 20;
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const contentW = PW - margin * 2;
    let y = 0;

    // Get selected sections
    const checks = document.querySelectorAll('#exportChecklist input[type="checkbox"]:checked');
    const sections = Array.from(checks).map(c => c.value);
    const data = collectPlanData();
    const title = document.getElementById('planTitle').value || 'Match Plan';

    // -- Header
    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, PW, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('MATCH PLAN', margin, 18);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(title, margin, 28);
    doc.setFontSize(8);
    doc.text(`Generated: ${new Date().toLocaleString()}`, PW - margin, 28, { align: 'right' });
    y = 50;

    // Helper: add section header
    const sectionHeader = (text) => {
        if (y > PH - 40) { doc.addPage(); y = 20; }
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(margin, y, contentW, 10, 2, 2, 'F');
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 58, 138);
        doc.text(text.toUpperCase(), margin + 4, y + 7);
        y += 16;
    };

    const addText = (text, size = 9) => {
        if (!text) return;
        doc.setFontSize(size);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        const lines = doc.splitTextToSize(text, contentW);
        lines.forEach(line => {
            if (y > PH - 20) { doc.addPage(); y = 20; }
            doc.text(line, margin, y);
            y += 5;
        });
        y += 4;
    };

    const addCanvasImage = (canvasId) => {
        if (!canvases[canvasId]) return;
        try {
            const canvas = canvases[canvasId].canvas;
            if (!canvas) return;
            const imgData = canvas.toDataURL('image/png');
            const aspect = canvas.width / canvas.height;
            const imgW = Math.min(contentW, 160);
            const imgH = imgW / aspect;
            if (y + imgH > PH - 20) { doc.addPage(); y = 20; }
            doc.addImage(imgData, 'PNG', margin, y, imgW, imgH);
            y += imgH + 8;
        } catch (e) {
            console.warn('Canvas export failed for', canvasId, e);
        }
    };

    // -- Squad
    if (sections.includes('squad')) {
        sectionHeader('Squad Selection');
        const xiNames = startingXI.map(id => { const p = squadPlayers.find(x => x.id === id); return p ? p.name : id; });
        const subNames = substitutes.map(id => { const p = squadPlayers.find(x => x.id === id); return p ? p.name : id; });
        addText('Starting XI: ' + (xiNames.join(', ') || 'Not selected'));
        addText('Substitutes: ' + (subNames.join(', ') || 'None'));
    }

    // -- Match
    if (sections.includes('match')) {
        sectionHeader('Match Details');
        addText(`Opponent: ${data.match.opponent || 'TBD'}`);
        addText(`Venue: ${data.match.venue || 'TBD'}`);
        addText(`Date: ${data.match.date || 'TBD'}  |  Kickoff: ${data.match.time || 'TBA'}  |  Side: ${data.match.ourSide}`);
    }

    // -- Opponent Intelligence
    if (sections.includes('oppIntel') && data.opponentAnalysis) {
        const oa = data.opponentAnalysis;
        sectionHeader('Opponent Intelligence');
        if (oa.formation) addText(`Expected Formation: ${oa.formation}`);
        if (oa.context) { addText('Context & Overview:', 9); addText(oa.context); }
        if (oa.collective) { addText('Collective Aspects:', 9); addText(oa.collective); }
        if (oa.individual) { addText('Key Players:', 9); addText(oa.individual); }
        if (oa.weaknesses) { addText('Weaknesses to Exploit:', 9); addText(oa.weaknesses); }
        if (oa.strengths) { addText('Strengths to Negate:', 9); addText(oa.strengths); }
        if (oa.links?.length) {
            addText('Reference Links:', 9);
            oa.links.forEach(l => addText(`• ${l.label}: ${l.url}`));
        }
    }

    // -- Plan A/B/C
    ['planA', 'planB', 'planC'].forEach(key => {
        if (!sections.includes(key)) return;
        const label = key === 'planA' ? 'Plan A \u2014 Starting Formation' : key === 'planB' ? 'Plan B \u2014 Alternative' : 'Plan C \u2014 Trailing';
        sectionHeader(label);
        addText(`Formation: ${data[key]?.formation || '--'}`);
        addCanvasImage(key);
        if (data[key]?.notes) addText(data[key].notes);
        if (data[key]?.substitutions?.length) {
            addText('Substitutions:');
            data[key].substitutions.forEach(s => {
                const offName = squadPlayers.find(p => p.id === s.off)?.name || s.off;
                const onName = squadPlayers.find(p => p.id === s.on)?.name || s.on;
                addText(`  ${offName} \u2192 ${onName}`);
            });
        }
    });

    // -- Offense
    if (sections.includes('offense')) {
        sectionHeader('Offensive Behaviour');
        [['off-buildup', 'Build-up'], ['off-transition', 'Transition'], ['off-attack', 'Attack']].forEach(([id, label]) => {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 58, 138);
            if (y > PH - 30) { doc.addPage(); y = 20; }
            doc.text(label, margin, y);
            y += 6;
            addCanvasImage(id);
            const notes = data.offense?.[id.replace('off-', '')]?.notes;
            if (notes) addText(notes);
        });
    }

    // -- Defense
    if (sections.includes('defense')) {
        sectionHeader('Defensive Behaviour');
        [['def-defBlock', 'Defensive Block'], ['def-midPress', 'Midfield Press'], ['def-highPress', 'High Press']].forEach(([id, label]) => {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 58, 138);
            if (y > PH - 30) { doc.addPage(); y = 20; }
            doc.text(label, margin, y);
            y += 6;
            addCanvasImage(id);
            const notes = data.defense?.[id.replace('def-', '')]?.notes;
            if (notes) addText(notes);
        });
    }

    // -- Set Pieces
    if (sections.includes('setPieces')) {
        sectionHeader('Set Pieces');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 58, 138);
        doc.text('Corners \u2014 For Us', margin, y); y += 6;
        addCanvasImage('sp-cornersFor');
        if (data.setPieces?.cornersFor?.notes) addText(data.setPieces.cornersFor.notes);

        if (y > PH - 30) { doc.addPage(); y = 20; }
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 58, 138);
        doc.text('Corners \u2014 Against Us', margin, y); y += 6;
        addCanvasImage('sp-cornersAgainst');
        if (data.setPieces?.cornersAgainst?.notes) addText(data.setPieces.cornersAgainst.notes);

        // Taker assignments
        const takerLabels = [
            ['freeKickNear', 'Free Kick (Near Goal)'],
            ['freeKickFar', 'Free Kick (Far/Deep)'],
            ['penaltyTaker', 'Penalty'],
            ['cornerLeft', 'Corner (Left)'],
            ['cornerRight', 'Corner (Right)']
        ];
        const hasTakers = takerLabels.some(([k]) => data.setPieces?.[k]);
        if (hasTakers) {
            if (y > PH - 30) { doc.addPage(); y = 20; }
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 58, 138);
            doc.text('Set Piece Takers', margin, y); y += 6;
            takerLabels.forEach(([key, label]) => {
                const playerId = data.setPieces?.[key];
                if (!playerId) return;
                const name = squadPlayers.find(p => p.id === playerId)?.name || playerId;
                addText(`${label}: ${name}`);
            });
        }
    }

    // -- Footer
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.setFont('helvetica', 'normal');
        doc.line(margin, PH - 12, PW - margin, PH - 12);
        doc.text('UP Performance Hub  \u00b7  Match Plan  \u00b7  Confidential', margin, PH - 7);
        doc.text(`Page ${i} of ${totalPages}`, PW - margin, PH - 7, { align: 'right' });
    }

    // Download
    const filename = `Match_Plan_${title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
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
}
window.exportPlanPDF = exportPlanPDF;

/* -- Utility ------------------------------------------------------- */
function escH(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
