/**
 * Player Management UI Core Logic
 */

console.log('Player UI: Script Loaded');

document.addEventListener('DOMContentLoaded', () => {
    console.log('Player UI: DOM Content Loaded');
    initPlayerUI();
});

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
            populateSquadSelectors(); // Refresh dropdowns
            openModal('modalPlayer');
        });
    }

    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });

    // Save Handlers
    const btnSavePlayer = document.getElementById('btnSavePlayer');
    if (btnSavePlayer) {
        btnSavePlayer.addEventListener('click', () => savePlayer(false));
    }
    const btnSaveAnother = document.getElementById('btnSavePlayerAnother');
    if (btnSaveAnother) {
        btnSaveAnother.addEventListener('click', () => savePlayer(true));
    }

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

    // Add Player form dropdown
    const inputSquad = document.getElementById('playerSquadInput');
    if (inputSquad) {
        inputSquad.innerHTML = '<option value="">Not Assigned</option>' +
            squads.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }

    // Filter Squad dropdown
    const filterSquad = document.getElementById('filterSquad');
    if (filterSquad) {
        const currentVal = filterSquad.value;
        filterSquad.innerHTML = '<option value="all">All Squads</option>' +
            squads.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        filterSquad.value = currentVal || 'all'; // Preserve selection
    }

    // Filter Position dropdown
    const filterPos = document.getElementById('filterPosition');
    const inputPos = document.getElementById('playerPositionInput');
    if (filterPos || inputPos) {
        const positions = new Set(['GK', 'DEF', 'MID', 'FWD']); // Defaults
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
    </tr>
    `;
}

function deletePlayer(id) {
    squadManager.deletePlayer(id).then(success => {
        if (success) {
            renderPlayers();
            populateSquadSelectors();
            if (window.showToast) window.showToast('Player deleted successfully', 'success');
        }
    });
}

function renderPlayers() {
    const search = document.getElementById('playerSearch')?.value.toLowerCase() || '';
    const position = document.getElementById('filterPosition')?.value || 'all';
    const squadId = document.getElementById('filterSquad')?.value || 'all';

    let players = squadManager.players;

    // Filter
    if (search) {
        players = players.filter(p => p.name.toLowerCase().includes(search));
    }
    if (position !== 'all') {
        players = players.filter(p => p.position === position);
    }
    if (squadId !== 'all') {
        players = players.filter(p => p.squadId === squadId);
    }

    // Sort alphabetically
    players.sort((a, b) => a.name.localeCompare(b.name));

    // Update count
    const countEl = document.getElementById('playerCount');
    if (countEl) countEl.textContent = `${players.length} players found`;

    const tbody = document.getElementById('playerTableBody');
    if (!tbody) return;

    if (players.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 60px; color: var(--text-muted);">
                    <i class="fas fa-search" style="font-size: 2rem; margin-bottom: 16px; opacity: 0.5;"></i><br>
                    No players found. Adjust your filters or add a new player.
                </td>
            </tr>
        `;
    } else {
        tbody.innerHTML = players.map(p => renderPlayerRow(p)).join('');
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

    if (!name || !age || !squadId) {
        alert("Name, Age, and Squad are required.");
        return;
    }

    const btn = document.getElementById('btnSavePlayer');
    const anotherBtn = document.getElementById('btnSavePlayerAnother');
    const activeBtn = keepOpen ? anotherBtn : btn;

    if (activeBtn) {
        const originalText = activeBtn.textContent;
        activeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        activeBtn.disabled = true;

        // Give it a tiny manual delay for UX feel (optional, since it's local storage)
        setTimeout(async () => {
            await squadManager.addPlayer({
                name, age, position, squadId, height, weight, foot, previousClubs: clubs
            });

            // Reset form
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
