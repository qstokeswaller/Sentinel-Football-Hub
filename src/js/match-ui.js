/**
 * Match Hub UI Logic
 */
import supabase from '../supabase.js';
import squadManager from '../managers/squad-manager.js';
import matchManager from '../managers/match-manager.js';
import { showToast } from '../toast.js';

// Lookup: match_id → plan { id, title }. Populated before first render.
let matchPlanMap = {};

export async function initMatchUI() {
    // Both managers must be initialized before rendering
    await Promise.all([
        squadManager.init(),
        matchManager.init()
    ]);

    // Build match → plan lookup so fixture cards can show plan links
    await buildMatchPlanMap();

    populateTeamSelector();
    renderMatches();

    // Add event listeners for live filtering
    const searchInput = document.getElementById('matchesSearch');
    const teamSelector = document.getElementById('matchesTeamSelector');

    if (searchInput) {
        searchInput.addEventListener('input', renderMatches);
    }
    if (teamSelector) {
        teamSelector.addEventListener('change', renderMatches);
    }
    const leagueFilter = document.getElementById('matchesLeagueFilter');
    if (leagueFilter) {
        leagueFilter.addEventListener('change', renderMatches);
    }

    // Wire the Add Match button to open the modal
    const btnNewMatch = document.getElementById('btn-new-match');
    if (btnNewMatch) {
        btnNewMatch.addEventListener('click', handleAddMatchClick);
    }

    // Form Submission Handler
    const matchForm = document.getElementById('matchForm');
    if (matchForm) {
        matchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleSaveMatch();
        });
    }
}

function getVisibleSquads() {
    const all = squadManager.getSquads();
    const coachIds = window._coachSquadIds;
    if (!coachIds) return all;
    return all.filter(s => coachIds.includes(s.id));
}

function populateTeamSelector() {
    const squads = getVisibleSquads();

    // --- Page-level Team Filter ---
    const selector = document.getElementById('matchesTeamSelector');
    if (selector) {
        selector.innerHTML = '<option value="all">All Teams</option>' +
            squads.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }

    // --- Modal: Home/Away Team Dropdowns ---
    const homeSelect = document.getElementById('matchHomeTeam');
    const awaySelect = document.getElementById('matchAwayTeam');

    const squadOptions = squads.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    if (homeSelect) {
        homeSelect.innerHTML = '<option value="">Select Your Squad</option>' +
            squadOptions +
            '<option value="__other__">Other (type in)</option>';
    }
    if (awaySelect) {
        awaySelect.innerHTML = '<option value="">Select Your Squad</option>' +
            squadOptions +
            '<option value="__other__">Other (type in)</option>';
    }

    // --- Modal: Competition/League Dropdown (from squad leagues) ---
    const competitionSelector = document.getElementById('matchCompetition');
    if (competitionSelector) {
        const uniqueLeagues = new Set();
        squads.forEach(s => {
            if (s.leagues) {
                if (Array.isArray(s.leagues)) s.leagues.forEach(l => uniqueLeagues.add(l));
                else if (typeof s.leagues === 'string') s.leagues.split(',').forEach(l => uniqueLeagues.add(l.trim()));
                else uniqueLeagues.add(s.leagues);
            }
        });

        if (uniqueLeagues.size > 0) {
            competitionSelector.innerHTML = '<option value="">Select Competition / League</option>' +
                Array.from(uniqueLeagues).sort().map(l => `<option value="${l}">${l}</option>`).join('');
        } else {
            // No leagues configured — allow text entry by converting to optional
            competitionSelector.innerHTML = '<option value="">No leagues configured (Optional)</option>';
            competitionSelector.removeAttribute('required');
        }
    }

    // --- Page-level League Filter ---
    const leagueFilterEl = document.getElementById('matchesLeagueFilter');
    if (leagueFilterEl) {
        const allLeagues = new Set();
        squads.forEach(s => {
            if (s.leagues) {
                if (Array.isArray(s.leagues)) s.leagues.forEach(l => allLeagues.add(l));
                else if (typeof s.leagues === 'string') s.leagues.split(',').forEach(l => allLeagues.add(l.trim()));
                else allLeagues.add(s.leagues);
            }
        });
        leagueFilterEl.innerHTML = '<option value="all">All Leagues</option>' +
            Array.from(allLeagues).sort().map(l => `<option value="${l}">${l}</option>`).join('');
    }
}

/**
 * Smart Home/Away toggle:
 * When a squad is selected on one side, the OTHER side becomes a text input for the opponent.
 * If "Other (type in)" is selected, that side becomes a text input too.
 */
function onTeamSelectChange(side) {
    const homeSelect = document.getElementById('matchHomeTeam');
    const awaySelect = document.getElementById('matchAwayTeam');
    const homeWrapper = document.getElementById('homeTeamWrapper');
    const awayWrapper = document.getElementById('awayTeamWrapper');
    const homeTextWrapper = document.getElementById('homeTeamTextWrapper');
    const awayTextWrapper = document.getElementById('awayTeamTextWrapper');

    if (side === 'home') {
        const val = homeSelect.value;
        if (val && val !== '__other__' && val !== '') {
            awayWrapper.style.display = 'none';
            awayTextWrapper.style.display = 'block';
            homeTextWrapper.style.display = 'none';
            homeWrapper.style.display = 'block';
        } else if (val === '__other__') {
            homeWrapper.style.display = 'none';
            homeTextWrapper.style.display = 'block';
            awayWrapper.style.display = 'block';
            awayTextWrapper.style.display = 'none';
        } else {
            homeWrapper.style.display = 'block';
            homeTextWrapper.style.display = 'none';
            awayWrapper.style.display = 'block';
            awayTextWrapper.style.display = 'none';
        }
    } else if (side === 'away') {
        const val = awaySelect.value;
        if (val && val !== '__other__' && val !== '') {
            homeWrapper.style.display = 'none';
            homeTextWrapper.style.display = 'block';
            awayTextWrapper.style.display = 'none';
            awayWrapper.style.display = 'block';
        } else if (val === '__other__') {
            awayWrapper.style.display = 'none';
            awayTextWrapper.style.display = 'block';
            homeWrapper.style.display = 'block';
            homeTextWrapper.style.display = 'none';
        } else {
            homeWrapper.style.display = 'block';
            homeTextWrapper.style.display = 'none';
            awayWrapper.style.display = 'block';
            awayTextWrapper.style.display = 'none';
        }
    }
}
window.onTeamSelectChange = onTeamSelectChange;

// Helper to get squad name safely
function getSquadName(squadId) {
    const squad = squadManager.getSquad(squadId);
    return squad ? squad.name : 'Unknown';
}

function calculateResult(homeScore, awayScore) {
    if (homeScore > awayScore) return 'Win';
    if (homeScore < awayScore) return 'Loss';
    return 'Draw';
}

/* -- Tab Switching ------------------------------------------------ */

function switchMatchesTab(tabName) {
    document.querySelectorAll('.matches-tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.matches-tab-btn[data-tab="${tabName}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    document.querySelectorAll('.matches-tab-content').forEach(tc => {
        tc.classList.remove('active');
        tc.style.display = 'none';
    });
    const activeTab = document.getElementById(`tab-${tabName}`);
    if (activeTab) {
        activeTab.classList.add('active');
        activeTab.style.display = 'block';
    }

    // Show/hide header controls for planning tab
    const headerActions = document.querySelector('.header-actions');
    if (headerActions) {
        headerActions.style.display = tabName === 'planning' ? 'none' : 'flex';
    }

    if (tabName === 'planning') {
        loadMatchPlans();
    }

    // Push tab into URL so browser back preserves tab state
    const url = new URL(window.location);
    url.searchParams.set('tab', tabName);
    window.history.replaceState(null, '', url);
}
window.switchMatchesTab = switchMatchesTab;

/* -- Filtered Match Helpers --------------------------------------- */

function getFilteredMatches() {
    const searchInput = document.getElementById('matchesSearch');
    const teamSelector = document.getElementById('matchesTeamSelector');
    const leagueFilter = document.getElementById('matchesLeagueFilter');

    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const teamId = teamSelector ? teamSelector.value : 'all';
    const leagueVal = leagueFilter ? leagueFilter.value : 'all';

    let matches = matchManager.matches;

    // Coach scoping: when viewing "All", restrict to assigned squads
    if (teamId !== 'all') {
        matches = matches.filter(m => m.squadId === teamId);
    } else if (window._coachSquadIds) {
        matches = matches.filter(m => window._coachSquadIds.includes(m.squadId));
    }
    if (leagueVal !== 'all') matches = matches.filter(m => m.competition === leagueVal);
    if (searchTerm) {
        matches = matches.filter(m =>
            (m.opponent && m.opponent.toLowerCase().includes(searchTerm)) ||
            (m.homeTeam && m.homeTeam.toLowerCase().includes(searchTerm)) ||
            (m.awayTeam && m.awayTeam.toLowerCase().includes(searchTerm)) ||
            (m.venue && m.venue.toLowerCase().includes(searchTerm))
        );
    }

    matches.sort((a, b) => new Date(b.date) - new Date(a.date));
    return matches;
}

const resolveTeamNames = (m) => {
    let home = m.homeTeam;
    let away = m.awayTeam;
    if (!home || !away) {
        const squadName = squadManager.getSquad(m.squadId)?.name || 'UP - Tuks';
        if (m.ourSide === 'away') {
            home = m.opponent || 'Home Team';
            away = squadName;
        } else {
            home = squadName;
            away = m.opponent || 'Away Team';
        }
    }
    return { home, away };
};

const calculateResultObj = (hScore, aScore, ourSide) => {
    const effectiveSide = ourSide || 'home';
    if (hScore === aScore) return { color: '#64748b', text: 'DRAW' };
    if (effectiveSide === 'home') {
        return hScore > aScore ? { color: '#10b981', text: 'WIN' } : { color: '#ef4444', text: 'LOSS' };
    } else {
        return aScore > hScore ? { color: '#10b981', text: 'WIN' } : { color: '#ef4444', text: 'LOSS' };
    }
};

function createMatchCard(m, isPast) {
    const { home: homeName, away: awayName } = resolveTeamNames(m);
    const hScore = m.homeScore || 0;
    const aScore = m.awayScore || 0;
    const res = calculateResultObj(hScore, aScore, m.ourSide);
    const resultColor = res.color;
    const resText = res.text;
    const resultClass = resText.toLowerCase();

    // Resolve watched player name for player watch matches
    let watchedPlayerName = '';
    if (m.matchType === 'player_watch' && m.watchedPlayerId) {
        const allPlayers = squadManager.getPlayers({});
        const wp = allPlayers.find(p => String(p.id) === String(m.watchedPlayerId));
        watchedPlayerName = wp ? wp.name : '';
    }

    return `
    <div class="dash-card match-card" data-id="${m.id}" style="margin-bottom: 12px; padding: 0; overflow: hidden; transition: all 0.2s ease;">
        <div class="match-card-header match-card-grid" onclick="toggleMatchVenue('${m.id}')" style="padding: 20px 24px; cursor: pointer;">
            <div class="match-card-info">
                <span style="font-weight: 700; color: var(--navy-dark); font-size: 1rem;">
                    <i class="far fa-calendar-alt" style="margin-right: 6px; color: var(--text-medium); opacity: 0.7;"></i> ${m.date}
                </span>
                <span style="font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-left: 22px;">
                    ${m.competition || 'Friendly'}
                </span>
                ${m.matchType === 'player_watch' ? `<span style="background:rgba(99,102,241,0.12);color:#6366f1;font-size:0.72rem;padding:3px 8px;border-radius:12px;font-weight:600;margin-left:8px;"><i class="fas fa-eye" style="margin-right:4px;"></i>Player Watch${watchedPlayerName ? ': ' + watchedPlayerName : ''}</span>` : ''}
            </div>
            <div class="match-teams-score">
                <div class="match-team-name home">${homeName}</div>
                <div class="match-score-badge ${isPast ? 'past' : ''} ${isPast ? resultClass : ''}">
                    ${isPast ? `${hScore} - ${aScore}` : 'VS'}
                </div>
                <div class="match-team-name away">${awayName}</div>
            </div>
            <div class="match-meta-info">
                ${!isPast ? `<i class="far fa-clock"></i> ${m.time || 'TBA'}` : `<span style="color: ${resultColor}; letter-spacing: 1px; font-weight: 800;">${resText}</span>`}
            </div>
            <div class="match-actions" style="display: flex; gap: 8px;" onclick="event.stopPropagation()">
                ${isPast
                    ? `<a href="match-details.html?id=${m.id}" class="dash-btn outline sm" title="Report"><i class="fas fa-file-alt"></i> Report</a>
                       <a href="match-analysis.html?id=${m.id}" class="dash-btn outline sm" title="Analysis"><i class="fas fa-video"></i> Analysis</a>`
                    : ''
                }
                <button onclick="handleDeleteMatch('${m.id}')" class="dash-btn outline sm danger" style="padding: 0 10px; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);" title="Delete">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
        <div id="match-venue-${m.id}" style="display: none; background: #f8fafc; padding: 12px 24px; border-top: 1px solid var(--border-light); font-size: 0.9rem; color: var(--text-medium);">
            <div style="display: flex; gap: 24px; flex-wrap: wrap; align-items: center;">
                <span><i class="fas fa-map-marker-alt" style="margin-right: 6px; color: var(--primary);"></i> <strong>Venue:</strong> ${m.venue || 'TBD'}</span>
                ${isPast ? '' : `<span><i class="fas fa-clock" style="margin-right: 6px; color: var(--primary);"></i> <strong>Kickoff:</strong> ${m.time || 'TBA'}</span>`}
            </div>
            ${(() => {
                const plan = matchPlanMap[m.id];
                let html = '';
                if (plan) {
                    html += `<div style="margin-top: 10px; padding: 10px 14px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;" onclick="event.stopPropagation()">
                        <span style="font-size: 0.85rem; color: #166534; font-weight: 600;"><i class="fas fa-chess-board" style="margin-right: 6px;"></i>Match Plan: ${escapeHtmlMP(plan.title)}</span>
                        <a href="match-plan.html?id=${plan.id}" class="dash-btn outline sm" style="font-size: 0.8rem; padding: 4px 12px;">View Plan</a>
                    </div>`;
                } else {
                    html += `<div style="margin-top: 10px; padding: 10px 14px; background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;" onclick="event.stopPropagation()">
                        <span style="font-size: 0.85rem; color: #92400e;"><i class="fas fa-chess-board" style="margin-right: 6px; opacity: 0.5;"></i>No match plan linked yet</span>
                        <a href="match-plan.html?match_id=${m.id}" class="dash-btn outline sm" style="font-size: 0.8rem; padding: 4px 12px;"><i class="fas fa-plus" style="margin-right: 4px;"></i>Create Plan</a>
                    </div>`;
                }
                // Enter Result row — only for upcoming fixtures
                if (!isPast) {
                    html += `<div id="enterResult-${m.id}" style="margin-top: 10px;" onclick="event.stopPropagation()">
                        <button class="dash-btn ghost sm" onclick="toggleEnterResult('${m.id}')" style="font-size:0.82rem;">
                            <i class="fas fa-flag-checkered" style="margin-right:4px;"></i> Enter Result
                        </button>
                        <div id="resultForm-${m.id}" style="display:none;margin-top:8px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
                            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                                <span style="font-size:0.85rem;font-weight:600;color:var(--navy-dark);">${escapeHtmlMP(homeName)}</span>
                                <input type="number" id="resultHome-${m.id}" min="0" value="0" style="width:56px;padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;text-align:center;font-weight:700;font-size:1rem;">
                                <span style="font-weight:700;color:#94a3b8;">–</span>
                                <input type="number" id="resultAway-${m.id}" min="0" value="0" style="width:56px;padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;text-align:center;font-weight:700;font-size:1rem;">
                                <span style="font-size:0.85rem;font-weight:600;color:var(--navy-dark);">${escapeHtmlMP(awayName)}</span>
                                <button class="dash-btn primary sm" onclick="submitResult('${m.id}','${m.ourSide || 'home'}')" style="margin-left:auto;font-size:0.82rem;padding:6px 16px;">
                                    <i class="fas fa-check" style="margin-right:4px;"></i> Save Result
                                </button>
                            </div>
                        </div>
                    </div>`;
                }
                return html;
            })()}
        </div>
    </div>`;
}

function emptyState(title, msg, icon = 'fa-futbol') {
    return `<div class="dash-card" style="text-align: center; padding: 48px;">
        <i class="fas ${icon}" style="font-size: 3rem; color: var(--text-muted); margin-bottom: 16px; opacity: 0.5;"></i>
        <h3 style="color: var(--navy-dark); margin-bottom: 8px;">${title}</h3>
        <p style="color: var(--text-medium);">${msg}</p>
    </div>`;
}

/* -- Main Render (populates both tabs) ----------------------------- */

function renderMatches() {
    const fixturesContainer = document.getElementById('fixturesList');
    const resultsContainer = document.getElementById('resultsList');
    const matches = getFilteredMatches();

    const upcoming = matches.filter(m => !m.isPast);
    const past = matches.filter(m => m.isPast);

    // Fixtures
    if (fixturesContainer) {
        if (upcoming.length > 0) {
            fixturesContainer.innerHTML = upcoming.map(m => createMatchCard(m, false)).join('');
        } else {
            fixturesContainer.innerHTML = emptyState('No Upcoming Fixtures', 'Add a match to see upcoming fixtures here.');
        }
    }

    // Results
    if (resultsContainer) {
        if (past.length > 0) {
            resultsContainer.innerHTML = past.map(m => createMatchCard(m, true)).join('');
        } else {
            resultsContainer.innerHTML = emptyState('No Results Yet', 'Completed matches will appear here.', 'fa-trophy');
        }
    }
}
window.renderMatches = renderMatches;

/* -- Match Plan Map (for fixture card links) ----------------------- */
async function buildMatchPlanMap() {
    try {
        const { data: plans, error } = await supabase
            .from('match_plans')
            .select('id, match_id, title')
            .not('match_id', 'is', null)
            .limit(500);
        if (error) throw error;
        matchPlanMap = {};
        (plans || []).forEach(p => {
            matchPlanMap[p.match_id] = { id: p.id, title: p.title };
        });
    } catch (err) {
        console.error('Failed to build plan map:', err);
    }
}

/* -- Match Plans --------------------------------------------------- */

async function loadMatchPlans() {
    const container = document.getElementById('matchPlansList');
    if (!container) return;

    try {
        const { data: plans, error } = await supabase
            .from('match_plans')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;

        if (!plans || plans.length === 0) {
            container.innerHTML = emptyState('No Match Plans Yet', 'Create your first tactical match plan to get started.', 'fa-chess-board');
            return;
        }

        let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;">';
        plans.forEach(plan => {
            const data = typeof plan.data === 'string' ? JSON.parse(plan.data) : (plan.data || {});
            const formation = data.planA?.formation || '--';
            const linkedMatch = plan.match_id ? matchManager.matches.find(m => m.id === plan.match_id) : null;
            const opponent = linkedMatch ? (linkedMatch.opponent || linkedMatch.awayTeam || 'TBD') : 'Unlinked';

            html += `
            <div class="dash-card plan-card" style="padding: 20px; cursor: pointer; transition: all 0.2s;" onclick="window.location.href='match-plan.html?id=${plan.id}'">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <div>
                        <h4 style="margin: 0; color: var(--navy-dark);">${escapeHtmlMP(plan.title || 'Untitled Plan')}</h4>
                        <p style="margin: 4px 0 0; font-size: 0.85rem; color: var(--text-medium);">vs ${escapeHtmlMP(opponent)}</p>
                    </div>
                    <span style="background: #f1f5f9; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; color: #475569;">${formation}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.8rem; color: var(--text-light);">${plan.created_at ? new Date(plan.created_at).toLocaleDateString() : '--'}</span>
                    <button onclick="event.stopPropagation(); deleteMatchPlan('${plan.id}')" class="dash-btn outline sm danger" style="padding: 4px 8px; color: #ef4444; border-color: rgba(239,68,68,0.3);" title="Delete">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (err) {
        console.error('Failed to load match plans:', err);
        container.innerHTML = emptyState('Error', 'Failed to load match plans.', 'fa-exclamation-triangle');
    }
}

async function deleteMatchPlan(id) {
    if (!confirm('Delete this match plan?')) return;
    try {
        const { error } = await supabase.from('match_plans').delete().eq('id', id);
        if (error) throw error;
        loadMatchPlans();
        showToast('Match plan deleted', 'success');
    } catch (err) {
        console.error('Delete failed:', err);
        showToast('Failed to delete plan', 'error');
    }
}
window.deleteMatchPlan = deleteMatchPlan;

function escapeHtmlMP(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

function toggleMatchVenue(id) {
    const el = document.getElementById(`match-venue-${id}`);
    if (el) {
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }
}
window.toggleMatchVenue = toggleMatchVenue;

/* --- Modal & Form Handling --- */

function handleAddMatchClick() {
    const modal = document.getElementById('createMatchModal');
    if (modal) {
        modal.style.display = 'flex';
    }
    switchTab('details');
    // Populate watched player dropdown
    populateWatchedPlayerDropdown();
}
window.handleAddMatchClick = handleAddMatchClick;

function populateWatchedPlayerDropdown() {
    const select = document.getElementById('matchWatchedPlayer');
    if (!select) return;
    const players = squadManager.getPlayers();
    select.innerHTML = '<option value="">Select Player</option>' +
        players.map(p => {
            const pos = p.position ? ` (${p.position.split(',')[0].trim()})` : '';
            return `<option value="${p.id}">${p.name}${pos}</option>`;
        }).join('');
}

function onMatchTypeChange() {
    const selected = document.querySelector('input[name="matchType"]:checked')?.value || 'team';
    const watchedGroup = document.getElementById('watchedPlayerGroup');
    const teamLabel = document.getElementById('matchTypeTeamLabel');
    const watchLabel = document.getElementById('matchTypeWatchLabel');

    if (watchedGroup) watchedGroup.style.display = selected === 'player_watch' ? '' : 'none';

    // Style the active radio label
    if (teamLabel) {
        teamLabel.style.borderColor = selected === 'team' ? 'var(--primary, #00594f)' : '#e2e8f0';
        teamLabel.style.background = selected === 'team' ? 'rgba(0,196,154,0.08)' : '#f8fafc';
    }
    if (watchLabel) {
        watchLabel.style.borderColor = selected === 'player_watch' ? 'var(--primary, #00594f)' : '#e2e8f0';
        watchLabel.style.background = selected === 'player_watch' ? 'rgba(0,196,154,0.08)' : '#f8fafc';
    }
}
window.onMatchTypeChange = onMatchTypeChange;

function closeAddMatchModal() {
    const modal = document.getElementById('createMatchModal');
    if (modal) modal.style.display = 'none';
}
window.closeAddMatchModal = closeAddMatchModal;

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.getElementById(`tab-btn-${tabId}`);
    if (targetBtn) targetBtn.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    const targetContent = document.getElementById(`tab-${tabId}`);
    if (targetContent) targetContent.classList.add('active');
}
window.switchTab = switchTab;

/* --- Save Match Logic --- */

window.toggleScoreInputs = function () { };

async function handleSaveMatch() {
    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value : '';
    };

    // Determine Home & Away team names captured exactly as entered
    const homeSelect = document.getElementById('matchHomeTeam');
    const awaySelect = document.getElementById('matchAwayTeam');
    const homeSelectVal = homeSelect ? homeSelect.value : '';
    const awaySelectVal = awaySelect ? awaySelect.value : '';
    const homeTextVal = getVal('matchHomeTeamText');
    const awayTextVal = getVal('matchAwayTeamText');

    let homeTeam = '';
    let awayTeam = '';
    let squadId = '';
    let ourSide = 'home';
    let opponent = '';

    // Handle Home Team
    if (homeSelectVal && homeSelectVal !== '__other__' && homeSelectVal !== '') {
        squadId = homeSelectVal;
        homeTeam = homeSelect.options[homeSelect.selectedIndex].text;
        ourSide = 'home';
    } else {
        homeTeam = homeTextVal || '';
    }

    // Handle Away Team
    if (awaySelectVal && awaySelectVal !== '__other__' && awaySelectVal !== '') {
        if (!squadId) {
            squadId = awaySelectVal;
            ourSide = 'away';
        }
        awayTeam = awaySelect.options[awaySelect.selectedIndex].text;
    } else {
        awayTeam = awayTextVal || '';
    }

    // Set Opponent for search/filtering
    opponent = (ourSide === 'home') ? awayTeam : homeTeam;

    if (!homeTeam || !awayTeam) {
        alert('Please specify both Home and Away teams.');
        return;
    }

    const competition = getVal('matchCompetition');
    const date = getVal('matchDate');

    if (!date) {
        alert('Please fill in the Date.');
        return;
    }

    // Match Status Logic
    const status = getVal('matchStatus') || 'upcoming';
    const isPast = status === 'completed';

    // Match type
    const matchType = document.querySelector('input[name="matchType"]:checked')?.value || 'team';
    const watchedPlayerId = matchType === 'player_watch' ? getVal('matchWatchedPlayer') : null;

    const matchData = {
        competition: competition || 'Friendly',
        date,
        time: getVal('matchTime'),
        venue: getVal('matchVenue'),
        squadId,
        homeTeam,
        awayTeam,
        opponent,
        ourSide,
        isPast: isPast,
        homeScore: isPast ? parseInt(getVal('matchHomeScore') || 0) : 0,
        awayScore: isPast ? parseInt(getVal('matchAwayScore') || 0) : 0,
        status: status,
        matchType,
        watchedPlayerId: watchedPlayerId || null,

        // Stats
        stats: matchManager.getDefaultStats(),
        links: [],
        videos: []
    };

    // Calculate Result relative to our squad
    if (matchData.isPast) {
        let ourScore = ourSide === 'away' ? matchData.awayScore : matchData.homeScore;
        let theirScore = ourSide === 'away' ? matchData.homeScore : matchData.awayScore;
        matchData.result = (ourScore > theirScore) ? 'Win' :
            (ourScore < theirScore) ? 'Loss' : 'Draw';
    }

    // Capture Report/Analysis Fields
    const reportLink = getVal('matchReportLink');
    const reportText = getVal('matchTakeaways');
    const videoLink = getVal('matchVideoLink');
    const highlightsLink = getVal('matchHighlightsLink');

    // Handle File Uploads (Metadata only)
    const reportFile = document.getElementById('matchReportFile');
    if (reportFile && reportFile.files.length > 0) {
        matchData.links.push({ title: "Report File: " + reportFile.files[0].name, url: "#", type: "file" });
    }

    const videoFile = document.getElementById('matchVideoFile');
    if (videoFile && videoFile.files.length > 0) {
        matchData.videos.push({ title: "Video File: " + videoFile.files[0].name, url: "#", type: "file" });
    }

    if (reportLink) matchData.links.push({ title: "Match Report", url: reportLink, type: "report" });
    if (videoLink) matchData.videos.push({ title: "Full Match", url: videoLink, type: "full" });
    if (highlightsLink) matchData.videos.push({ title: "Highlights", url: highlightsLink, type: "highlights" });
    if (reportText) matchData.notes = reportText;

    // Save
    try {
        await matchManager.createMatch(matchData);
        showToast("Match Added Successfully!", "success");
        closeAddMatchModal();
        await matchManager.init(); // Refresh data from server
        renderMatches();
    } catch (error) {
        console.error("Failed to create match:", error);
        showToast("Error: Failed to create match.", "error");
    }
}
window.handleSaveMatch = handleSaveMatch;

async function handleDeleteMatch(id) {
    if (!confirm('Are you sure you want to delete this match? This will also remove all associated reports and analysis.')) return;

    try {
        await matchManager.deleteMatch(id);
        showToast('Match Deleted', 'success');
        renderMatches();
    } catch (error) {
        console.error('Failed to delete match:', error);
        showToast('Failed to delete match', 'error');
    }
}
window.handleDeleteMatch = handleDeleteMatch;

/**
 * Module-level resolveTeamNames -- available to all functions in this file.
 */
function resolveTeamNamesGlobal(m) {
    let home = m.homeTeam;
    let away = m.awayTeam;
    if (!home || !away) {
        const squadName = squadManager.getSquad(m.squadId)
            ? squadManager.getSquad(m.squadId).name
            : 'Home';
        if (m.ourSide === 'away') {
            home = m.opponent || 'Home Team';
            away = squadName;
        } else {
            home = squadName;
            away = m.opponent || 'Away Team';
        }
    }
    return { home, away };
}

/**
 * Shared PDF builder -- produces a fully-structured match analysis PDF.
 * Identical output to the version in match-details-ui.js.
 */
function buildMatchPDF(match, resolveNames) {
    if (!window.jspdf) {
        showToast('PDF library not loaded', 'error');
        return;
    }
    const { jsPDF } = window.jspdf;

    const { home: homeName, away: awayName } = resolveNames(match);
    const hScore = match.homeScore !== undefined ? match.homeScore : 0;
    const aScore = match.awayScore !== undefined ? match.awayScore : 0;
    const matchScore = `${hScore} - ${aScore}`;
    const matchDate = match.date || 'TBD';
    const competition = match.competition || 'Friendly';
    const venue = match.venue || 'Venue TBD';

    let resultColor = [100, 116, 139];
    if (hScore !== aScore) {
        const ourSide = match.ourSide || 'home';
        const weWon = (ourSide === 'home' && hScore > aScore) || (ourSide === 'away' && aScore > hScore);
        resultColor = weWon ? [16, 185, 129] : [239, 68, 68];
    }

    const doc = new jsPDF();
    const margin = 20;
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const contentW = PW - (margin * 2);
    const halfW = contentW / 2;

    // -- HEADER BANNER
    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, PW, 44, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('MATCH ANALYSIS REPORT', margin, 22);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('UP PERFORMANCE HUB  ·  CONFIDENTIAL', margin, 31);
    doc.text(`Generated: ${new Date().toLocaleString()}`, PW - margin, 31, { align: 'right' });

    let y = 54;

    // -- SCORELINE CARD
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, contentW, 36, 4, 4, 'F');

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 58, 138);
    doc.text(homeName, margin + 6, y + 13, { maxWidth: halfW - 20 });
    doc.text(awayName, PW - margin - 6, y + 13, { align: 'right', maxWidth: halfW - 20 });

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...resultColor);
    doc.text(matchScore, PW / 2, y + 15, { align: 'center' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`${competition}  ·  ${venue}  ·  ${matchDate}`, PW / 2, y + 28, { align: 'center' });

    y += 46;

    // -- KEY STATISTICS
    const stats = match.stats || {};
    const homeStats = stats.home || {};
    const awayStats = stats.away || {};

    const statItems = [
        { label: 'Goals', key: 'goals' },
        { label: 'Possession', key: 'possession', suffix: '%' },
        { label: 'Shots', key: 'shots' },
        { label: 'Shots on Target', key: 'shotsOnTarget' },
        { label: 'Corners', key: 'corners' },
        { label: 'Fouls', key: 'fouls' },
        { label: 'Yellow Cards', key: 'yellowCards' },
        { label: 'Red Cards', key: 'redCards' },
    ];

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 58, 138);
    doc.text('KEY STATISTICS', margin, y);
    y += 5;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 58, 138);
    doc.text(homeName, margin, y + 4);
    doc.setTextColor(100, 116, 139);
    doc.text(awayName, PW - margin, y + 4, { align: 'right' });
    y += 10;

    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, PW - margin, y);
    y += 6;

    statItems.forEach(item => {
        const hVal = parseFloat(homeStats[item.key]) || 0;
        const aVal = parseFloat(awayStats[item.key]) || 0;
        const suffix = item.suffix || '';
        const total = hVal + aVal || 1;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 58, 138);
        doc.text(`${hVal}${suffix}`, margin, y);

        doc.setTextColor(100);
        doc.setFont('helvetica', 'normal');
        doc.text(item.label, PW / 2, y, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text(`${aVal}${suffix}`, PW - margin, y, { align: 'right' });

        const barH = 4;
        const barY = y + 2;

        doc.setFillColor(226, 232, 240);
        doc.rect(margin, barY, contentW, barH, 'F');

        const hWidth = (hVal / total) * halfW;
        doc.setFillColor(30, 58, 138);
        doc.rect(margin, barY, hWidth, barH, 'F');

        const aWidth = (aVal / total) * halfW;
        doc.setFillColor(100, 116, 139);
        doc.rect(PW - margin - aWidth, barY, aWidth, barH, 'F');

        doc.setFillColor(255, 255, 255);
        doc.rect(PW / 2 - 0.5, barY, 1, barH, 'F');

        y += 14;
        if (y > PH - 40) { doc.addPage(); y = 20; }
    });

    y += 4;

    // -- TACTICAL PHASES
    const tacticalPhases = [
        { title: 'Starting XI -- ' + homeName, content: stats.tactical_lineup_home, color: [30, 58, 138] },
        { title: 'Starting XI -- ' + awayName, content: stats.tactical_lineup_away, color: [100, 116, 139] },
        { title: 'Timeline / Key Events', content: stats.tactical_timeline, color: [30, 58, 138] },
        { title: 'In Possession (Attacking)', content: stats.tactical_in_possession, color: [16, 185, 129] },
        { title: 'Out of Possession (Defence)', content: stats.tactical_out_possession, color: [239, 68, 68] },
        { title: 'Transitions', content: stats.tactical_transitions, color: [245, 158, 11] },
        { title: 'Set Pieces', content: stats.tactical_set_pieces, color: [99, 102, 241] },
    ];

    const stripHtml = (html) => (html || '')
        .replace(/<li>/gi, '\n\u2022 ')
        .replace(/<\/li>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (y > PH - 50) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 58, 138);
    doc.text('TACTICAL ANALYSIS', margin, y);
    y += 3;
    doc.setDrawColor(30, 58, 138);
    doc.line(margin, y, PW - margin, y);
    y += 8;

    tacticalPhases.forEach(phase => {
        const text = stripHtml(phase.content);
        if (!text) return;

        if (y > PH - 40) { doc.addPage(); y = 20; }

        doc.setFillColor(...phase.color);
        doc.rect(margin, y - 3, 3, 7, 'F');

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...phase.color);
        doc.text(phase.title.toUpperCase(), margin + 6, y + 1);
        y += 8;

        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        const lines = doc.splitTextToSize(text, contentW - 6);
        lines.forEach(line => {
            if (y > PH - 20) { doc.addPage(); y = 20; }
            doc.text(line, margin + 6, y);
            y += 5;
        });
        y += 6;
    });

    // -- FOOTER (all pages)
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.setFont('helvetica', 'normal');
        doc.line(margin, PH - 12, PW - margin, PH - 12);
        doc.text('UP Performance Hub  ·  Confidential', margin, PH - 7);
        doc.text(`Page ${i} of ${totalPages}`, PW - margin, PH - 7, { align: 'right' });
    }

    // -- DOWNLOAD
    const filename = `Match_Report_${homeName}_vs_${awayName}_${matchDate}.pdf`
        .replace(/[^a-zA-Z0-9_\-\.]/g, '_');

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

/**
 * PDF Export -- called from the Print button on match cards in the Matches Hub.
 */
async function exportMatchReportPDF(matchId) {
    if (!matchId) return;
    try {
        const m = await matchManager.getMatch(matchId);
        if (!m) {
            showToast('Match not found', 'error');
            return;
        }
        buildMatchPDF(m, resolveTeamNamesGlobal);
    } catch (err) {
        console.error('Match PDF Export Error:', err);
        showToast('Failed to export PDF', 'error');
    }
}
window.exportMatchReportPDF = exportMatchReportPDF;

/* -- Enter Result (convert fixture → result) ------------------------ */

function toggleEnterResult(matchId) {
    const form = document.getElementById(`resultForm-${matchId}`);
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}
window.toggleEnterResult = toggleEnterResult;

async function submitResult(matchId, ourSide) {
    const homeEl = document.getElementById(`resultHome-${matchId}`);
    const awayEl = document.getElementById(`resultAway-${matchId}`);
    const hScore = parseInt(homeEl?.value, 10) || 0;
    const aScore = parseInt(awayEl?.value, 10) || 0;

    const effectiveSide = ourSide || 'home';
    const ourScore = effectiveSide === 'home' ? hScore : aScore;
    const theirScore = effectiveSide === 'home' ? aScore : hScore;
    const result = ourScore > theirScore ? 'Win' : ourScore < theirScore ? 'Loss' : 'Draw';

    try {
        // Update in DB
        await matchManager.updateMatchInfo(matchId, {
            isPast: true,
            homeScore: hScore,
            awayScore: aScore,
            result
        });

        // Re-fetch all match data from DB
        await matchManager.init();
        await buildMatchPlanMap();

        // Verify the match is now marked as past
        const updated = matchManager.matches.find(m => String(m.id) === String(matchId));
        console.log('[Enter Result] match after re-fetch:', updated?.isPast, updated?.homeScore, updated?.awayScore);

        // If DB didn't persist is_past (e.g. RLS), force it locally
        if (updated && !updated.isPast) {
            console.warn('[Enter Result] is_past not persisted — forcing locally');
            updated.isPast = true;
            updated.homeScore = hScore;
            updated.awayScore = aScore;
            updated.result = result;
        }

        renderMatches();
        switchMatchesTab('results');
        showToast(`Result saved: ${hScore} – ${aScore} (${result})`, 'success');
    } catch (err) {
        console.error('Failed to save result:', err);
        showToast('Failed to save result', 'error');
    }
}
window.submitResult = submitResult;
