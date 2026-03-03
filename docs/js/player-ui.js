/**
 * Player Management UI Core Logic
 * With grid/list view toggle and mobile-first grid view
 */

console.log('Player UI: Script Loaded');

// View state: 'list' or 'grid'
let playerViewMode = window.innerWidth <= 768 ? 'grid' : 'list';

document.addEventListener('DOMContentLoaded', () => {
    console.log('Player UI: DOM Content Loaded');

    // Inject player card styles
    injectPlayerCardStyles();

    // Inject view toggle into header-actions
    injectViewToggle();

    initPlayerUI();

    // Auto-switch on resize
    window.addEventListener('resize', () => {
        const isMobile = window.innerWidth <= 768;
        if (isMobile && playerViewMode !== 'grid') {
            playerViewMode = 'grid';
            updateViewToggleUI();
            renderPlayers();
        }
    });
});

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
            background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%);
            color: #2563eb;
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
            background: #e0f2fe;
            color: #0284c7;
            border-radius: 20px;
            font-size: 0.72rem;
            font-weight: 700;
            padding: 2px 10px;
            margin-bottom: 12px;
            letter-spacing: 0.04em;
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
        .view-toggle-btn:hover { background: #f8fafc; color: #2563eb; }
        .view-toggle-btn.active { background: #2563eb; color: #fff; }
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

async function initPlayerUI() {
    console.log('Player UI: Initializing...');
    try {
        const initialized = await squadManager.init();
        if (!initialized) {
            console.error('Player UI: Manager failed to initialize');
            return;
        }
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
    const fPos = document.getElementById('filterPosition');
    if (fPos) fPos.addEventListener('change', renderPlayers);
    const fSquad = document.getElementById('filterSquad');
    if (fSquad) fSquad.addEventListener('change', renderPlayers);
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
    const players = squadManager.players;

    const inputSquad = document.getElementById('playerSquadInput');
    if (inputSquad) {
        inputSquad.innerHTML = '<option value="">Not Assigned</option>' +
            squads.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }

    const filterSquad = document.getElementById('filterSquad');
    if (filterSquad) {
        const currentVal = filterSquad.value;
        filterSquad.innerHTML = '<option value="all">All Squads</option>' +
            squads.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        filterSquad.value = currentVal || 'all';
    }

    const filterPos = document.getElementById('filterPosition');
    const inputPos = document.getElementById('playerPositionInput');
    if (filterPos || inputPos) {
        const positions = new Set(['GK', 'DEF', 'MID', 'FWD']);
        players.forEach(p => { if (p.position) positions.add(p.position); });
        const sortedPos = Array.from(positions).sort();

        if (filterPos) {
            const currentVal = filterPos.value;
            filterPos.innerHTML = '<option value="all">All Positions</option>' +
                sortedPos.map(pos => `<option value="${pos}">${pos}</option>`).join('');
            filterPos.value = currentVal || 'all';
        }
        if (inputPos) {
            const currentVal = inputPos.value;
            inputPos.innerHTML = sortedPos.map(pos => `<option value="${pos}">${pos}</option>`).join('');
            inputPos.value = currentVal;
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
                    <div class="player-card-stat"><span>Age</span><strong>${p.age || '--'}</strong></div>
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
        <td><span class="league-tag" style="background: #e0f2fe; color: #0284c7;">${p.position}</span></td>
        <td>${p.age}</td>
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

function deletePlayer(id, event) {
    if (event) event.stopPropagation();
    if (!confirm('Delete this player? This cannot be undone.')) return;
    squadManager.deletePlayer(id).then(success => {
        if (success) {
            renderPlayers();
            populateSquadSelectors();
            if (window.showToast) window.showToast('Player deleted successfully', 'success');
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
    const position = document.getElementById('filterPosition')?.value || 'all';
    const squadId = document.getElementById('filterSquad')?.value || 'all';

    let players = squadManager.players;

    if (search) players = players.filter(p => p.name.toLowerCase().includes(search));
    if (position !== 'all') players = players.filter(p => p.position === position);
    if (squadId !== 'all') players = players.filter(p => p.squadId === squadId);

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
    const position = document.getElementById('playerPositionInput').value;
    const squadId = document.getElementById('playerSquadInput').value;

    const height = document.getElementById('playerHeightInput').value;
    const weight = document.getElementById('playerWeightInput').value;
    const foot = document.getElementById('playerFootInput').value;
    const clubs = document.getElementById('playerClubsInput').value;

    if (!name || !age) {
        alert("Name and Age are required.");
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
            await squadManager.addPlayer({ name, age, position, squadId, height, weight, foot, previousClubs: clubs });

            document.getElementById('playerNameInput').value = '';
            document.getElementById('playerAgeInput').value = '';
            document.getElementById('playerHeightInput').value = '';
            document.getElementById('playerWeightInput').value = '';
            document.getElementById('playerClubsInput').value = '';

            if (!keepOpen) {
                closeAllModals();
            } else {
                activeBtn.textContent = 'Saved!';
                setTimeout(() => {
                    activeBtn.textContent = originalText;
                    document.getElementById('playerNameInput').focus();
                }, 1000);
            }

            activeBtn.disabled = false;
            if (!keepOpen) activeBtn.textContent = originalText;

            renderPlayers();
            populateSquadSelectors();
        }, 300);
    }
}
