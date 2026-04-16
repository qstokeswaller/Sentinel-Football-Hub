/**
 * Player Management UI Core Logic
 * With grid/list view toggle and mobile-first grid view
 */

import supabase from '../supabase.js';
import squadManager from '../managers/squad-manager.js';
import matchManager from '../managers/match-manager.js';
import { showToast } from '../toast.js';
import { createYearPicker } from './year-picker.js';

console.log('Player UI: Script Loaded');

// --- Canonical Position Groups ---
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

const ALL_POSITIONS = POSITION_GROUPS.flatMap(g => g.positions);

// Position group key → positions mapping for two-level filter
const POSITION_GROUP_MAP = {
    forward: POSITION_GROUPS[0].positions,
    midfielder: POSITION_GROUPS[1].positions,
    defender: POSITION_GROUPS[2].positions,
    goalkeeper: POSITION_GROUPS[3].positions,
};

// Position code → group key lookup
const POSITION_TO_GROUP = {};
Object.entries(POSITION_GROUP_MAP).forEach(([group, positions]) => {
    positions.forEach(p => { POSITION_TO_GROUP[p.value] = group; });
});

function displayAge(ageValue) {
    if (!ageValue) return '--';
    const year = parseInt(ageValue);
    if (year > 1900 && year <= new Date().getFullYear()) {
        return String(new Date().getFullYear() - year);
    }
    return ageValue;
}

function buildMultiSelectPositions(triggerId, optionsId) {
    const trigger = document.getElementById(triggerId);
    const optionsContainer = document.getElementById(optionsId);
    if (!trigger || !optionsContainer) return;

    let html = '';
    POSITION_GROUPS.forEach(group => {
        html += `<div class="multi-select-group-label">${group.label}</div>`;
        group.positions.forEach(pos => {
            html += `
                <label class="multi-select-option">
                    <input type="checkbox" value="${pos.value}" data-label="${pos.label}">
                    ${pos.label}
                </label>`;
        });
    });
    optionsContainer.innerHTML = html;

    // Toggle dropdown
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = optionsContainer.style.display !== 'none';
        optionsContainer.style.display = isOpen ? 'none' : 'block';
    });

    // Update trigger text on checkbox change
    optionsContainer.addEventListener('change', () => {
        const checked = optionsContainer.querySelectorAll('input[type="checkbox"]:checked');
        const values = Array.from(checked).map(cb => cb.value);
        trigger.textContent = values.length > 0 ? values.join(', ') : 'Select position(s)...';
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!trigger.contains(e.target) && !optionsContainer.contains(e.target)) {
            optionsContainer.style.display = 'none';
        }
    });
}

function getSelectedPositions(optionsId) {
    const container = document.getElementById(optionsId);
    if (!container) return '';
    const checked = container.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checked).map(cb => cb.value).join(', ');
}

function setSelectedPositions(optionsId, triggerId, positionString) {
    const container = document.getElementById(optionsId);
    const trigger = document.getElementById(triggerId);
    if (!container) return;
    const values = positionString ? positionString.split(',').map(s => s.trim()) : [];
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = values.includes(cb.value);
    });
    if (trigger) {
        trigger.textContent = values.length > 0 ? values.join(', ') : 'Select position(s)...';
    }
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

// View state: 'list' or 'grid'
let playerViewMode = window.innerWidth <= 768 ? 'grid' : 'list';

function injectPlayerCardStyles() {
    if (document.getElementById('player-card-styles')) return;
    const s = document.createElement('style');
    s.id = 'player-card-styles';
    s.textContent = `
        .player-cards-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 16px;
            margin-top: 20px;
            padding: 4px 2px;
        }
        .player-card {
            background: #fff;
            border: 1px solid var(--border-light, #e2e8f0);
            border-radius: 18px;
            padding: 22px 18px 18px;
            cursor: pointer;
            transition: transform 0.18s, box-shadow 0.18s;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            text-decoration: none;
            color: inherit;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .player-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 10px 28px rgba(37,99,235,0.13);
            border-color: #bfdbfe;
        }
        .player-card-avatar {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: linear-gradient(135deg, #ccf5ec 0%, #e6f9f4 100%);
            color: #00C49A;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.35rem;
            font-weight: 800;
            margin-bottom: 12px;
            border: 3px solid #fff;
            box-shadow: 0 0 0 2px #bfdbfe;
            letter-spacing: -1px;
        }
        .player-card-name {
            font-size: 0.95rem;
            font-weight: 700;
            color: #1e3a5f;
            margin-bottom: 4px;
            line-height: 1.2;
        }
        .player-card-pos {
            display: inline-block;
            color: #64748b;
            font-size: 0.78rem;
            font-weight: 600;
            margin-bottom: 12px;
            letter-spacing: 0.02em;
        }
        .player-card-stats {
            width: 100%;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px 10px;
            margin-top: 2px;
        }
        .player-card-stat {
            font-size: 0.75rem;
            color: #64748b;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1px;
        }
        .player-card-stat strong {
            font-size: 0.82rem;
            font-weight: 700;
            color: #334155;
        }
        .player-card-squad-tag {
            margin-top: 12px;
            font-size: 0.72rem;
            background: #f1f5f9;
            color: #475569;
            border-radius: 20px;
            padding: 3px 10px;
            font-weight: 600;
            width: 100%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .player-card-divider {
            width: 100%;
            border: 0;
            border-top: 1px solid #f1f5f9;
            margin: 12px 0 10px;
        }
        .player-card-actions {
            display: flex;
            gap: 8px;
            width: 100%;
            justify-content: center;
        }
        .player-card-action-btn {
            flex: 1;
            padding: 7px 0;
            border-radius: 9px;
            border: 1px solid #e2e8f0;
            background: #f8fafc;
            color: #64748b;
            font-size: 0.75rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
        }
        .player-card-action-btn:hover { background: #e0f2fe; color: #0284c7; border-color: #bae6fd; }
        .player-card-action-btn.danger:hover { background: #fee2e2; color: #ef4444; border-color: #fca5a5; }
        .player-card-link {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-decoration: none;
            color: inherit;
            width: 100%;
        }
        .view-toggle-group {
            display: flex;
            gap: 0;
            border: 1px solid var(--border, #e2e8f0);
            border-radius: 10px;
            overflow: hidden;
        }
        .view-toggle-btn {
            background: #fff;
            border: none;
            padding: 9px 14px;
            cursor: pointer;
            color: #94a3b8;
            font-size: 0.92rem;
            transition: all 0.15s;
            line-height: 1;
        }
        .view-toggle-btn:hover { background: #f8fafc; color: #00C49A; }
        .view-toggle-btn.active { background: #00C49A; color: #fff; }
        @media (max-width: 768px) {
            .player-cards-grid { grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: 12px; }
            .view-toggle-group { display: none; } /* Always grid on mobile anyway */
        }
    `;
    document.head.appendChild(s);
}

function injectViewToggle() {
    const actions = document.querySelector('.header-actions');
    if (!actions || document.getElementById('viewToggleGroup')) return;

    const group = document.createElement('div');
    group.className = 'view-toggle-group';
    group.id = 'viewToggleGroup';
    group.innerHTML = `
        <button class="view-toggle-btn ${playerViewMode === 'list' ? 'active' : ''}" id="btnListView" title="List View" onclick="setPlayerView('list')">
            <i class="fas fa-list"></i>
        </button>
        <button class="view-toggle-btn ${playerViewMode === 'grid' ? 'active' : ''}" id="btnGridView" title="Grid View" onclick="setPlayerView('grid')">
            <i class="fas fa-th-large"></i>
        </button>
    `;
    actions.prepend(group);
}

function updateViewToggleUI() {
    const listBtn = document.getElementById('btnListView');
    const gridBtn = document.getElementById('btnGridView');
    if (listBtn) listBtn.classList.toggle('active', playerViewMode === 'list');
    if (gridBtn) gridBtn.classList.toggle('active', playerViewMode === 'grid');
}

window.setPlayerView = function (mode) {
    playerViewMode = mode;
    updateViewToggleUI();
    renderPlayers();
};

export async function initPlayerUI() {
    console.log('Player UI: Initializing...');

    // Inject player card styles
    injectPlayerCardStyles();

    // Inject view toggle into header-actions
    injectViewToggle();

    // Auto-switch on resize
    window.addEventListener('resize', () => {
        const isMobile = window.innerWidth <= 768;
        if (isMobile && playerViewMode !== 'grid') {
            playerViewMode = 'grid';
            updateViewToggleUI();
            renderPlayers();
        }
    });

    try {
        await squadManager.init();
        console.log('Player UI: Manager initialized');

        populateSquadSelectors();
        renderPlayers();

    } catch (err) {
        console.error('Player UI: Critical Error in init:', err);
    }

    // Modal Control
    const btnAddPlayer = document.getElementById('btnAddPlayer');
    if (btnAddPlayer) {
        btnAddPlayer.addEventListener('click', () => {
            populateSquadSelectors();
            openModal('modalPlayer');
        });
    }

    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });

    // Save Handlers
    const btnSavePlayer = document.getElementById('btnSavePlayer');
    if (btnSavePlayer) btnSavePlayer.addEventListener('click', () => savePlayer(false));
    const btnSaveAnother = document.getElementById('btnSavePlayerAnother');
    if (btnSaveAnother) btnSaveAnother.addEventListener('click', () => savePlayer(true));

    // Filters
    const search = document.getElementById('playerSearch');
    if (search) search.addEventListener('input', renderPlayers);

    // Two-level position filter
    const fPosGroup = document.getElementById('filterPositionGroup');
    if (fPosGroup) fPosGroup.addEventListener('change', () => {
        updateSpecificPositionFilter();
        renderPlayers();
    });
    const fPosSpecific = document.getElementById('filterPositionSpecific');
    if (fPosSpecific) fPosSpecific.addEventListener('change', renderPlayers);

    // Club entry add/remove
    const btnAddClub = document.getElementById('btnAddClubEntry');
    if (btnAddClub) btnAddClub.addEventListener('click', addClubEntry);

    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-remove-club')) {
            const entry = e.target.closest('.club-entry');
            const container = document.getElementById('playerClubsContainer');
            if (entry && container && container.children.length > 1) {
                entry.remove();
            } else if (entry) {
                // Last row — just clear the input
                const input = entry.querySelector('.club-input');
                if (input) input.value = '';
            }
        }
    });
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

function populateSquadSelectors() {
    const squads = squadManager.getSquads();

    // Squad selector in the Add Player modal
    const inputSquad = document.getElementById('playerSquadInput');
    if (inputSquad) {
        inputSquad.innerHTML = '<option value="">Not Assigned</option>' +
            squads.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }

    // Build multi-select position widget for the Add Player modal
    buildMultiSelectPositions('playerPositionTrigger', 'playerPositionOptions');

    // Populate year-of-birth selector
    populateYearOfBirthSelect('playerAgeInput');
}

function updateSpecificPositionFilter() {
    const groupVal = document.getElementById('filterPositionGroup')?.value || 'all';
    const specificGroup = document.getElementById('filterPositionSpecificGroup');
    const specificSelect = document.getElementById('filterPositionSpecific');

    if (groupVal === 'all' || !POSITION_GROUP_MAP[groupVal]) {
        if (specificGroup) specificGroup.style.visibility = 'hidden';
        if (specificSelect) specificSelect.value = 'all';
    } else {
        if (specificGroup) specificGroup.style.visibility = 'visible';
        if (specificSelect) {
            const positions = POSITION_GROUP_MAP[groupVal];
            specificSelect.innerHTML = '<option value="all">All</option>' +
                positions.map(p => `<option value="${p.value}">${p.label}</option>`).join('');
        }
    }
}

function renderPlayerCard(p) {
    const initials = p.name.substring(0, 2).toUpperCase();
    const squadName = squadManager.getSquads().find(s => s.id === p.squadId)?.name || '';
    const sid = String(p.id).replace(/'/g, '');
    return `
        <div class="player-card">
            <a href="player-profile.html?id=${p.id}" class="player-card-link">
                <div class="player-card-avatar">${initials}</div>
                <div class="player-card-name">${p.name}</div>
                <span class="player-card-pos">${p.position || '--'}</span>
                <div class="player-card-stats">
                    <div class="player-card-stat"><span>Age</span><strong>${displayAge(p.age)}</strong></div>
                    <div class="player-card-stat"><span>Foot</span><strong>${p.foot || '--'}</strong></div>
                    ${p.height ? `<div class="player-card-stat"><span>Height</span><strong>${p.height} cm</strong></div>` : ''}
                    ${p.weight ? `<div class="player-card-stat"><span>Weight</span><strong>${p.weight} kg</strong></div>` : ''}
                </div>
                ${squadName ? `<div class="player-card-squad-tag"><i class="fas fa-users" style="font-size:0.65rem;margin-right:4px;"></i>${squadName}</div>` : ''}
            </a>
            <hr class="player-card-divider">
            <div class="player-card-actions">
                <button class="player-card-action-btn" onclick="openAssignSquadModal('${sid}', event)" title="Assign/Move Squad">
                    <i class="fas fa-exchange-alt"></i> Assign
                </button>
                <button class="player-card-action-btn danger" onclick="deletePlayer('${sid}', event)" title="Delete Player">
                    <i class="fas fa-trash-alt"></i> Delete
                </button>
            </div>
        </div>`;
}


function renderPlayerRow(p) {
    const initials = p.name.substring(0, 2).toUpperCase();
    const squadName = squadManager.getSquads().find(s => s.id === p.squadId)?.name || 'Unassigned';
    return `
    <tr>
        <td class="player-name-cell">
            <div class="avatar-sm">${initials}</div>
            ${p.name}
        </td>
        <td>${p.position || '--'}</td>
        <td>${displayAge(p.age)}</td>
        <td>${squadName}</td>
        <td>${p.height ? p.height + ' cm' : '--'}</td>
        <td>${p.weight ? p.weight + ' kg' : '--'}</td>
        <td>${p.foot || '--'}</td>
        <td>
            <div style="display: flex; gap: 8px;">
                <a href="player-profile.html?id=${p.id}" class="dash-btn outline sm">
                    <i class="fas fa-external-link-alt"></i> Profile
                </a>
                <button class="dash-btn outline sm" onclick="deletePlayer('${p.id}')" style="border-color: #fca5a5; color: #ef4444; background: #fee2e2;" title="Delete Player">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </td>
    </tr>`;
}

window.deletePlayer = deletePlayer;
function deletePlayer(id, event) {
    if (event) event.stopPropagation();
    if (!confirm('Delete this player? This cannot be undone.')) return;
    squadManager.deletePlayer(id).then(success => {
        if (success) {
            renderPlayers();
            populateSquadSelectors();
            showToast('Player deleted successfully', 'success');
        }
    });
}

function openAssignSquadModal(playerId, event) {
    if (event) event.stopPropagation();
    // Populate the move player modal and open it
    const player = squadManager.players.find(p => String(p.id) === String(playerId));
    if (!player) return;

    const modal = document.getElementById('modalMovePlayer') || document.getElementById('modalAssignPlayer');
    if (!modal) {
        // Fallback: redirect to player page
        window.location.href = `player-profile.html?id=${playerId}`;
        return;
    }
    const nameEl = document.getElementById('movePlayerNameDisplay');
    if (nameEl) nameEl.textContent = player.name;
    const idEl = document.getElementById('movePlayerIdInput');
    if (idEl) idEl.value = playerId;

    // Populate squad select
    const select = document.getElementById('movePlayerSquadSelect');
    if (select) {
        const squads = squadManager.getSquads();
        select.innerHTML = squads.map(s => `<option value="${s.id}"${s.id === player.squadId ? ' selected' : ''}>${s.name}</option>`).join('');
    }
    modal.classList.add('active');
}
window.openAssignSquadModal = openAssignSquadModal;


function renderPlayers() {
    const search = document.getElementById('playerSearch')?.value.toLowerCase() || '';
    const posGroup = document.getElementById('filterPositionGroup')?.value || 'all';
    const posSpecific = document.getElementById('filterPositionSpecific')?.value || 'all';

    let players = squadManager.players;

    if (search) players = players.filter(p => {
        const squadName = squadManager.getSquads().find(s => s.id === p.squadId)?.name || '';
        return p.name.toLowerCase().includes(search) ||
            (p.position && p.position.toLowerCase().includes(search)) ||
            squadName.toLowerCase().includes(search);
    });

    // Two-level position filter
    if (posSpecific !== 'all') {
        // Specific position selected — filter by exact position code
        players = players.filter(p => p.position && p.position.split(',').map(s => s.trim()).includes(posSpecific));
    } else if (posGroup !== 'all' && POSITION_GROUP_MAP[posGroup]) {
        // Group selected but no specific — filter by any position in the group
        const groupCodes = POSITION_GROUP_MAP[posGroup].map(p => p.value);
        players = players.filter(p => {
            if (!p.position) return false;
            const playerPositions = p.position.split(',').map(s => s.trim());
            return playerPositions.some(pp => groupCodes.includes(pp));
        });
    }

    players.sort((a, b) => a.name.localeCompare(b.name));

    const countEl = document.getElementById('playerCount');
    if (countEl) countEl.textContent = `${players.length} players found`;

    const isMobile = window.innerWidth <= 768;
    const useGrid = playerViewMode === 'grid' || isMobile;

    // Show/hide the right containers
    const tableWrapper = document.getElementById('playerTableWrapper');
    const gridWrapper = document.getElementById('playerGridWrapper');

    if (useGrid) {
        if (tableWrapper) tableWrapper.style.display = 'none';
        if (gridWrapper) {
            gridWrapper.style.display = 'block';
            if (players.length === 0) {
                gridWrapper.innerHTML = `<div style="text-align:center; padding:60px; color:var(--text-muted);"><i class="fas fa-search" style="font-size:2rem; opacity:0.4; margin-bottom:12px; display:block;"></i>No players found.</div>`;
            } else {
                gridWrapper.innerHTML = `<div class="player-cards-grid">${players.map(p => renderPlayerCard(p)).join('')}</div>`;
            }
        }
    } else {
        if (gridWrapper) gridWrapper.style.display = 'none';
        if (tableWrapper) tableWrapper.style.display = 'block';
        const tbody = document.getElementById('playerTableBody');
        if (!tbody) return;
        if (players.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 60px; color: var(--text-muted);"><i class="fas fa-search" style="font-size: 2rem; margin-bottom: 16px; opacity: 0.5;"></i><br>No players found.</td></tr>`;
        } else {
            tbody.innerHTML = players.map(p => renderPlayerRow(p)).join('');
        }
    }
}

async function savePlayer(keepOpen) {
    const name = document.getElementById('playerNameInput').value;
    const age = document.getElementById('playerAgeInput').value;
    const position = getSelectedPositions('playerPositionOptions');
    const squadId = document.getElementById('playerSquadInput').value;

    const height = document.getElementById('playerHeightInput').value;
    const weight = document.getElementById('playerWeightInput').value;
    const foot = document.getElementById('playerFootInput').value;
    const isPC = window._profile?.clubs?.settings?.archetype === 'private_coaching';
    const school = isPC
        ? (document.getElementById('playerSchoolInputText')?.value || '')
        : (document.getElementById('playerSchoolInput')?.value || '');
    const newToClub = isPC ? false : (document.getElementById('playerNewToClubInput')?.value === 'true');
    const currentClub = isPC ? (document.getElementById('playerCurrentClubInput')?.value || '') : '';

    // Collect previous clubs from multi-entry rows
    const clubInputs = document.querySelectorAll('#playerClubsContainer .club-input');
    const clubs = Array.from(clubInputs).map(i => i.value.trim()).filter(Boolean).join(', ');

    if (!name || !age) {
        alert("Name and Year of Birth are required.");
        return;
    }

    const btn = document.getElementById('btnSavePlayer');
    const anotherBtn = document.getElementById('btnSavePlayerAnother');
    const activeBtn = keepOpen ? anotherBtn : btn;

    if (activeBtn) {
        const originalText = activeBtn.textContent;
        activeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        activeBtn.disabled = true;

        setTimeout(async () => {
            try {
                await squadManager.addPlayer({ name, age, position, squadId, height, weight, foot, previousClubs: clubs, currentClub, school, newToClub });

                // Reset form
                document.getElementById('playerNameInput').value = '';
                const ageEl = document.getElementById('playerAgeInput');
                if (ageEl?._yearPicker) ageEl._yearPicker.setValue('');
                else ageEl.value = '';
                document.getElementById('playerHeightInput').value = '';
                document.getElementById('playerWeightInput').value = '';
                setSelectedPositions('playerPositionOptions', 'playerPositionTrigger', '');
                resetClubEntries();

                if (!keepOpen) {
                    closeAllModals();
                } else {
                    activeBtn.textContent = 'Saved!';
                    setTimeout(() => {
                        activeBtn.textContent = originalText;
                        document.getElementById('playerNameInput').focus();
                    }, 1000);
                }

                renderPlayers();
                populateSquadSelectors();
            } catch (err) {
                console.error('Error saving player:', err);
                alert('Failed to save player. Please try again.');
            } finally {
                activeBtn.disabled = false;
                activeBtn.textContent = originalText;
            }
        }, 300);
    }
}

// --- Club Entry Add/Remove Logic ---
function addClubEntry() {
    const container = document.getElementById('playerClubsContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'club-entry';
    div.style.cssText = 'display:flex; gap:8px; margin-bottom:6px;';
    div.innerHTML = `
        <input type="text" class="form-control-bubble club-input" placeholder="e.g. SuperSport Academy">
        <button type="button" class="dash-btn outline sm btn-remove-club" style="flex-shrink:0; padding:6px 10px;" title="Remove">&times;</button>
    `;
    container.appendChild(div);
}

function resetClubEntries() {
    const container = document.getElementById('playerClubsContainer');
    if (!container) return;
    container.innerHTML = `
        <div class="club-entry" style="display:flex; gap:8px; margin-bottom:6px;">
            <input type="text" class="form-control-bubble club-input" placeholder="e.g. SuperSport Academy">
            <button type="button" class="dash-btn outline sm btn-remove-club" style="flex-shrink:0; padding:6px 10px;" title="Remove">&times;</button>
        </div>
    `;
}
