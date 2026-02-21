/**
 * Squad UI Interactions
 */

console.log('Squad UI: Script Loaded');

document.addEventListener('DOMContentLoaded', () => {
    console.log('Squad UI: DOM Content Loaded');

    // Debug: Attach direct listeners to verify button presence
    const debugBtnSquad = document.getElementById('btnAddSquad');
    if (debugBtnSquad) {
        console.log('Squad UI: btnAddSquad found in DOM');
        debugBtnSquad.addEventListener('click', () => console.log('Squad UI: btnAddSquad clicked (Debug Listener)'));
    } else {
        console.error('Squad UI: btnAddSquad NOT FOUND (Critical)');
    }

    initSquadUI();
});

let currentView = 'squads';
let currentSquadId = null;

async function initSquadUI() {
    console.log('Squad UI: Initializing...');
    try {
        const initialized = await squadManager.init();
        if (!initialized) {
            console.error('Squad UI: Manager failed to initialize');
            return;
        }
        console.log('Squad UI: Manager initialized');

        renderSquadSelectors();
        renderDynamicFilters();
        renderContent(); // Initial render
        console.log('Squad UI: Content rendered');
    } catch (err) {
        console.error('Squad UI: Critical Error in init:', err);
    }

    // Event Delegation for Main Buttons (Robustness)
    document.addEventListener('click', (e) => {
        const btnSquad = e.target.closest('#btnAddSquad');

        if (btnSquad) {
            console.log('Squad UI: Delegated Click - Add Squad');
            openModal('modalSquad');
        }
    });

    // Close Modals
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', () => closeAllModals());
    });

    // Save Actions
    document.getElementById('btnSaveSquad').addEventListener('click', saveSquad);

    // Squad Assessment Actions
    const btnAssessSquad = document.getElementById('btnAssessSquad');
    if (btnAssessSquad) {
        btnAssessSquad.addEventListener('click', openSquadAssessmentModal);
    }
    const btnSaveAssessment = document.getElementById('btnSaveSquadAssessment');
    if (btnSaveAssessment) {
        btnSaveAssessment.addEventListener('click', saveSquadAssessment);
    }

    // Roster Management
    const btnAssignPlayer = document.getElementById('btnAssignPlayerModal');
    if (btnAssignPlayer) {
        btnAssignPlayer.addEventListener('click', openAssignPlayerModal);
    }
    const btnAssignExisting = document.getElementById('btnAssignExistingPlayer');
    if (btnAssignExisting) {
        btnAssignExisting.addEventListener('click', assignExistingPlayer);
    }
    const btnCreateAssign = document.getElementById('btnCreateAndAssignPlayer');
    if (btnCreateAssign) {
        btnCreateAssign.addEventListener('click', createAndAssignPlayer);
    }
    const btnConfirmMove = document.getElementById('btnConfirmMovePlayer');
    if (btnConfirmMove) {
        btnConfirmMove.addEventListener('click', confirmMovePlayer);
    }

    // Event delegation for player move buttons
    document.addEventListener('click', (e) => {
        const btnMove = e.target.closest('.btn-move-player');
        if (btnMove) {
            const playerId = btnMove.getAttribute('data-id');
            openMovePlayerModal(playerId);
        }
    });

    // Filters
    document.getElementById('playerSearch').addEventListener('input', renderContent);
    document.getElementById('filterLeague').addEventListener('change', renderContent);
    document.getElementById('filterAgeGroup').addEventListener('change', renderContent);
    // Back Button
    const btnBack = document.getElementById('btnBackToSquads');
    if (btnBack) {
        btnBack.addEventListener('click', () => {
            document.getElementById('squadDetailView').style.display = 'none';
            document.getElementById('squadGrid').style.display = 'grid';
            // Show Filter Header again
            const filterBar = document.getElementById('squadFilterBar');
            if (filterBar) filterBar.style.display = 'flex';
        });
    }

    // Coach Rows (Dynamic)
    const btnAddCoach = document.getElementById('btnAddCoachRow');
    if (btnAddCoach) {
        btnAddCoach.addEventListener('click', addCoachRow);
        addCoachRow(); // Add initial
    }
}

function renderDynamicFilters() {
    const squads = squadManager.getSquads();

    // Leagues
    const leagueSet = new Set();
    squads.forEach(s => {
        if (s.leagues) {
            if (Array.isArray(s.leagues)) s.leagues.forEach(l => leagueSet.add(l));
            else if (typeof s.leagues === 'string') s.leagues.split(',').forEach(l => leagueSet.add(l.trim()));
            else leagueSet.add(s.leagues);
        }
    });

    const leagueSelect = document.getElementById('filterLeague');
    if (leagueSelect) {
        const currentVal = leagueSelect.value;
        leagueSelect.innerHTML = '<option value="all">All Leagues</option>';
        Array.from(leagueSet).sort().forEach(league => {
            if (!league) return;
            const opt = document.createElement('option');
            opt.value = league;
            opt.textContent = league;
            leagueSelect.appendChild(opt);
        });
        if (leagueSet.has(currentVal)) leagueSelect.value = currentVal;
    }

    // Age Groups
    const ageGroupSet = new Set();
    squads.forEach(s => {
        if (s.ageGroup) ageGroupSet.add(s.ageGroup);
    });

    const ageGroupSelect = document.getElementById('filterAgeGroup');
    if (ageGroupSelect) {
        const currentVal = ageGroupSelect.value;
        ageGroupSelect.innerHTML = '<option value="all">All Age Groups</option>';
        Array.from(ageGroupSet).sort().forEach(ag => {
            if (!ag) return;
            const opt = document.createElement('option');
            opt.value = ag;
            opt.textContent = ag;
            ageGroupSelect.appendChild(opt);
        });
        if (ageGroupSet.has(currentVal)) ageGroupSelect.value = currentVal;
    }
}

function resetFilters() {
    document.getElementById('playerSearch').value = '';
    document.getElementById('filterLeague').value = 'all';
    document.getElementById('filterAgeGroup').value = 'all';

    renderSquads();
}

function updateFilterVisibility() {
    // We only have one view now on the squad page, so filters are always visible
    const filterLeague = document.getElementById('filterLeague');
    const filterAgeGroup = document.getElementById('filterAgeGroup');
    const playerSearch = document.getElementById('playerSearch');

    if (filterLeague && filterLeague.parentElement) {
        filterLeague.parentElement.style.display = 'block';
    }
    if (filterAgeGroup && filterAgeGroup.parentElement) {
        filterAgeGroup.parentElement.style.display = 'block';
    }
}

function renderContent() {
    document.getElementById('squadGrid').style.display = 'grid';
    document.getElementById('squadDetailView').style.display = 'none';
    renderSquads();
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

function renderSquadSelectors() {
    // Only needed if we still use squad selectors in some context
}



function addCoachRow() {
    const container = document.getElementById('coachesContainer');
    const div = document.createElement('div');
    div.className = 'coach-row'; // Style is in squad.html
    div.innerHTML = `
        <input type="text" class="form-control-bubble coach-role" placeholder="Role (e.g. Head Coach)" style="flex: 1; margin-bottom: 0;">
        <input type="text" class="form-control-bubble coach-name" placeholder="Name (e.g. Tlisane Motaung)" style="flex: 2; margin-bottom: 0;">
        <button type="button" class="btn-icon-soft remove-coach-btn" onclick="this.parentElement.remove()" style="flex: 0 0 42px; height: 42px; border-radius: 8px; border: 1px solid #fca5a5; background: #fee2e2; color: #ef4444; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;">
            <i class="fas fa-trash-alt"></i>
        </button>
    `;
    container.appendChild(div);
}

function saveSquad() {
    const name = document.getElementById('squadNameInput').value;
    const ageGroup = document.getElementById('squadAgeGroupInput').value;
    const leaguesRaw = document.getElementById('squadLeagueInput').value;

    // Gather Coaches
    const coachRows = document.querySelectorAll('.coach-row');
    const coaches = [];
    coachRows.forEach(row => {
        const role = row.querySelector('.coach-role').value.trim();
        const cName = row.querySelector('.coach-name').value.trim();
        if (cName) {
            coaches.push(role ? `${role}: ${cName}` : cName);
        }
    });

    if (name) {
        const leagues = leaguesRaw ? leaguesRaw.split(',').map(s => s.trim()) : [];

        squadManager.addSquad({ name, ageGroup, leagues, coaches }).then(res => {
            // Reset
            document.getElementById('squadNameInput').value = '';
            document.getElementById('squadAgeGroupInput').value = '';
            document.getElementById('squadLeagueInput').value = '';
            document.getElementById('coachesContainer').innerHTML = ''; // Clear rows
            addCoachRow(); // Add one back
            closeAllModals();
            renderDynamicFilters();
            renderSquadSelectors();
            renderContent(); // Re-render content to show new squad if in squad view
        });
    }
}

// --- End of Squad UI Logic ---

function renderPlayerRow(p, isSquadView = false) {
    const initials = p.name.substring(0, 2).toUpperCase();
    const squadName = !isSquadView ? (squadManager.getSquads().find(s => s.id === p.squadId)?.name || 'N/A') : '';

    if (isSquadView) {
        // Squad detail view: Profile, Move Squad, Remove from Squad
        return `
        <tr>
            <td class="player-name-cell">
                <div class="avatar-sm">${initials}</div>
                ${p.name}
            </td>
            <td><span class="league-tag" style="background: #e0f2fe; color: #0284c7;">${p.position}</span></td>
            <td>${p.age}</td>
            <td>${p.height ? p.height + ' cm' : '--'}</td>
            <td>${p.weight ? p.weight + ' kg' : '--'}</td>
            <td>${p.foot || '--'}</td>
            <td>
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap;">
                    <a href="player-profile.html?id=${p.id}" class="dash-btn outline sm" style="white-space: nowrap;">
                        <i class="fas fa-external-link-alt"></i> Profile
                    </a>
                    <button class="dash-btn outline sm btn-move-player" data-id="${p.id}" title="Move Squad" style="white-space: nowrap;">
                        <i class="fas fa-exchange-alt"></i>
                    </button>
                    <button class="dash-btn outline sm" onclick="event.stopPropagation(); removePlayerFromSquad('${p.id}')" 
                        style="border-color: #fca5a5; color: #ef4444; background: #fee2e2; white-space: nowrap;" 
                        title="Remove from this squad">
                        <i class="fas fa-user-minus"></i>
                    </button>
                </div>
            </td>
        </tr>
        `;
    }

    // All-players view (fallback — used on Players page)
    return `
    <tr>
        <td class="player-name-cell">
            <div class="avatar-sm">${initials}</div>
            ${p.name}
        </td>
        <td><span class="league-tag" style="background: #e0f2fe; color: #0284c7;">${p.position}</span></td>
        <td>${p.age}</td>
        <td>${p.height ? p.height + ' cm' : '--'}</td>
        <td>${p.weight ? p.weight + ' kg' : '--'}</td>
        <td>${p.foot || '--'}</td>
        <td>
            <div style="display: flex; gap: 8px;">
                <button class="dash-btn outline sm btn-move-player" data-id="${p.id}" title="Move Squad">
                    <i class="fas fa-exchange-alt"></i>
                </button>
                <a href="player-profile.html?id=${p.id}" class="dash-btn outline sm">
                    <i class="fas fa-external-link-alt"></i> Profile
                </a>
            </div>
        </td>
    </tr>
    `;
}

function viewSquadDetails(squadId) {
    const squad = squadManager.getSquads().find(s => s.id === squadId);
    if (!squad) return;

    currentSquadId = squadId;

    const players = squadManager.getPlayers({ squadId: squadId }).sort((a, b) => a.name.localeCompare(b.name));

    // Hide Grids, Show Sheet
    document.getElementById('squadGrid').style.display = 'none';
    const filterBar = document.getElementById('squadFilterBar');
    if (filterBar) filterBar.style.display = 'none'; // Hide filters to focus
    const sheet = document.getElementById('squadDetailView');
    sheet.style.display = 'block';

    // Set Header Info
    document.getElementById('detailSquadName').textContent = squad.name;
    document.getElementById('detailSquadMeta').textContent = `${squad.ageGroup} • ${players.length} Players`;

    // Render Table
    const tbody = document.getElementById('squadDetailTableBody');
    if (players.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">No players in this squad yet.</td></tr>`;
    } else {
        tbody.innerHTML = players.map(p => renderPlayerRow(p, true)).join('');
    }
}

function renderSquads() {
    const searchTerm = document.getElementById('playerSearch').value.toLowerCase();
    const filterLeague = document.getElementById('filterLeague').value;
    const filterAgeGroup = document.getElementById('filterAgeGroup').value;

    // Get squads and sort alphabetically
    let squads = squadManager.getSquads().sort((a, b) => a.name.localeCompare(b.name));

    if (searchTerm) {
        squads = squads.filter(s => s.name.toLowerCase().includes(searchTerm));
    }

    if (filterLeague && filterLeague !== 'all') {
        squads = squads.filter(s => s.leagues && s.leagues.includes(filterLeague));
    }

    if (filterAgeGroup && filterAgeGroup !== 'all') {
        squads = squads.filter(s => s.ageGroup === filterAgeGroup);
    }

    const grid = document.getElementById('squadGrid');
    const count = document.getElementById('playerCount'); // We just reuse this id for count
    if (count) count.textContent = `${squads.length} squads`;

    if (squads.length === 0) {
        grid.innerHTML = `
            <div class="section-card" style="grid-column: 1 / -1; text-align: center; padding: 60px;">
                <i class="fas fa-users" style="font-size: 4rem; color: var(--text-muted); margin-bottom: 24px;"></i>
                <h3 style="color: var(--navy-dark); margin-bottom: 8px;">No Squads Found</h3>
                <p style="color: var(--text-secondary);">Add a new squad to get started.</p>
            </div>
        `;
    } else {
        grid.innerHTML = squads.map(s => {
            const playerCount = squadManager.getPlayers({ squadId: s.id }).length;

            return `
            <div class="dash-card squad-card" onclick="viewSquadDetails('${s.id}')" style="cursor: pointer; transition: transform 0.2s; padding: 24px; position: relative;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
                    <div class="icon-circle" style="width: 48px; height: 48px; background: var(--light-blue); color: var(--blue-accent); display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 1.25rem;">
                         <i class="fas fa-users"></i>
                    </div>
                    <div style="background: #f1f5f9; padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; color: #64748b; font-weight: 600;">
                        ${s.ageGroup}
                    </div>
                </div>
                <h3 style="margin: 0 0 8px 0; font-size: 1.2rem; color: var(--navy-dark);">${s.name}</h3>
                <div style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 20px;">
                    ${playerCount} Registered Players
                </div>
                <div style="border-top: 1px solid var(--border); padding-top: 16px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.85rem; color: var(--blue-accent); font-weight: 600;">View Roster <i class="fas fa-arrow-right" style="margin-left: 4px;"></i></span>
                    <button class="btn-icon-soft delete-squad-btn" 
                            onclick="event.stopPropagation(); deleteSquad('${s.id}')" 
                            style="width: 32px; height: 32px; border: 1px solid #fca5a5; background: #fee2e2; color: #ef4444; position: absolute; bottom: 20px; right: 20px; border-radius: 8px;"
                            title="Delete Squad">
                        <i class="fas fa-trash-alt" style="font-size: 0.85rem;"></i>
                    </button>
                </div>
            </div>
            `;
        }).join('');
    }
}

function deleteSquad(id) {
    squadManager.deleteSquad(id).then(success => {
        if (success) {
            renderSquads();
            renderDynamicFilters();
            if (window.showToast) window.showToast('Squad deleted successfully', 'success');
        }
    });
}

function openSquadAssessmentModal() {
    if (!currentSquadId) return;

    // Set default date
    document.getElementById('squadAssessDate').valueAsDate = new Date();

    // Reset inputs
    document.getElementById('squadAssessContext').value = 'Match';
    document.getElementById('squadAssessTactical').value = '';
    document.getElementById('squadAssessPhysical').value = '';
    document.getElementById('squadAssessMentality').value = '';
    document.getElementById('squadAssessOverall').value = '';
    document.getElementById('squadAssessStrengths').value = '';
    document.getElementById('squadAssessImprovements').value = '';
    document.getElementById('squadAssessNotes').value = '';

    openModal('modalSquadAssessment');
}

function saveSquadAssessment() {
    if (!currentSquadId) return;

    const btn = document.getElementById('btnSaveSquadAssessment');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    // Retrieve values (this mocks creating the payload)
    const payload = {
        squadId: currentSquadId,
        date: document.getElementById('squadAssessDate').value,
        context: document.getElementById('squadAssessContext').value,
        ratings: {
            tactical: parseInt(document.getElementById('squadAssessTactical').value) || 0,
            physical: parseInt(document.getElementById('squadAssessPhysical').value) || 0,
            mentality: parseInt(document.getElementById('squadAssessMentality').value) || 0,
            overall: parseInt(document.getElementById('squadAssessOverall').value) || 0
        },
        feedback: {
            strengths: document.getElementById('squadAssessStrengths').value,
            improvements: document.getElementById('squadAssessImprovements').value,
            notes: document.getElementById('squadAssessNotes').value
        }
    };

    console.log('Saving Squad Assessment:', payload);

    squadManager.saveSquadAssessment(payload).then(success => {
        if (success) {
            btn.innerHTML = '<i class="fas fa-check"></i> Saved!';
            btn.style.background = 'var(--green-accent)';

            if (window.showToast) window.showToast('Squad assessment saved successfully', 'success');

            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.background = '';
                btn.disabled = false;
                closeAllModals();
            }, 1000);
        } else {
            btn.innerHTML = '<i class="fas fa-times"></i> Error';
            btn.style.background = '#ef4444';
            btn.disabled = false;
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.background = '';
            }, 2000);
        }
    });
}

// --- Roster Management Logic ---

function openAssignPlayerModal() {
    if (!currentSquadId) return;

    const select = document.getElementById('assignExistingPlayerSelect');
    const allPlayers = squadManager.getPlayers();

    // Filter out players already in this squad
    const availablePlayers = allPlayers.filter(p => p.squadId !== currentSquadId);

    if (availablePlayers.length === 0) {
        select.innerHTML = '<option value="" disabled selected>No other players available</option>';
        document.getElementById('btnAssignExistingPlayer').disabled = true;
    } else {
        select.innerHTML = availablePlayers.map(p => `<option value="${p.id}">${p.name} (${p.position})</option>`).join('');
        document.getElementById('btnAssignExistingPlayer').disabled = false;
    }

    // Clear new player form
    document.getElementById('newPlayerNameAssign').value = '';
    document.getElementById('newPlayerAgeAssign').value = '';

    openModal('modalAssignPlayer');
}

async function assignExistingPlayer() {
    const playerId = document.getElementById('assignExistingPlayerSelect').value;
    if (!playerId) return;

    await squadManager.updatePlayer(playerId, { squadId: currentSquadId });
    closeAllModals();
    viewSquadDetails(currentSquadId); // refresh
}

async function createAndAssignPlayer() {
    const name = document.getElementById('newPlayerNameAssign').value;
    const age = document.getElementById('newPlayerAgeAssign').value;
    const position = document.getElementById('newPlayerPositionAssign').value;

    if (!name || !age) {
        alert("Please provide the player's name and age.");
        return;
    }

    const btn = document.getElementById('btnCreateAndAssignPlayer');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    btn.disabled = true;

    await squadManager.addPlayer({ name, age, position, squadId: currentSquadId });

    btn.innerHTML = originalText;
    btn.disabled = false;
    closeAllModals();
    viewSquadDetails(currentSquadId); // refresh
}

function openMovePlayerModal(playerId) {
    const player = squadManager.getPlayers().find(p => p.id === playerId);
    if (!player) return;

    document.getElementById('movePlayerNameDisplay').textContent = player.name;
    document.getElementById('movePlayerIdInput').value = player.id;

    const select = document.getElementById('movePlayerSquadSelect');
    const allSquads = squadManager.getSquads();

    const otherSquads = allSquads.filter(s => s.id !== player.squadId);

    if (otherSquads.length === 0) {
        select.innerHTML = '<option value="" disabled selected>No other squads exist</option>';
        document.getElementById('btnConfirmMovePlayer').disabled = true;
    } else {
        select.innerHTML = otherSquads.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        document.getElementById('btnConfirmMovePlayer').disabled = false;
    }

    openModal('modalMovePlayer');
}

async function confirmMovePlayer() {
    const playerId = document.getElementById('movePlayerIdInput').value;
    const newSquadId = document.getElementById('movePlayerSquadSelect').value;

    if (!playerId || !newSquadId) return;

    await squadManager.updatePlayer(playerId, { squadId: newSquadId });
    closeAllModals();

    // Refresh the view to reflect the player being removed from THIS squad
    viewSquadDetails(currentSquadId);
}

async function removePlayerFromSquad(playerId) {
    if (!confirm('Remove this player from the squad? (The player will NOT be deleted, just unassigned.)')) return;
    await squadManager.updatePlayer(playerId, { squadId: '' });
    if (window.showGlobalToast) window.showGlobalToast('Player removed from squad.', 'success');
    viewSquadDetails(currentSquadId);
}
window.removePlayerFromSquad = removePlayerFromSquad;
