/**
 * Match Hub UI Logic
 */
import supabase from '../supabase.js';
import squadManager from '../managers/squad-manager.js';
import matchManager from '../managers/match-manager.js';
import { showToast, showConfirm } from '../toast.js';

// Lookup: match_id → plan { id, title }. Populated before first render.
let matchPlanMap = {};

// Add Match modal state
let _amMode = 'fixture'; // 'fixture' | 'result'
let _amEvents = [];      // array of event objects
let _amCurrentEventType = null;

export async function initMatchUI() {
    // Managers already initialized by page-init.js (with clubId).
    // Just build the plan lookup map.
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

    // Wire squad change → refresh competition datalist
    const amSquadEl = document.getElementById('amSquadId');
    if (amSquadEl) amSquadEl.addEventListener('change', _updateAmCompetitionList);

    // Wire score label / preview updates in Add Match modal
    const ourSideEl = document.getElementById('amOurSide');
    if (ourSideEl) ourSideEl.addEventListener('change', _updateScoreLabels);
    const homeScoreEl = document.getElementById('amHomeScore');
    if (homeScoreEl) homeScoreEl.addEventListener('input', _updateResultPreview);
    const awayScoreEl = document.getElementById('amAwayScore');
    if (awayScoreEl) awayScoreEl.addEventListener('input', _updateResultPreview);
}

function getVisibleSquads() {
    const all = squadManager.getSquads();
    const coachIds = window._coachSquadIds;
    if (!coachIds) return all;
    return all.filter(s => coachIds.includes(s.id));
}

function populateTeamSelector() {
    const squads = getVisibleSquads();
    const squadOptions = squads.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    // --- Page-level Team Filter ---
    const selector = document.getElementById('matchesTeamSelector');
    if (selector) {
        selector.innerHTML = '<option value="all">All Teams</option>' + squadOptions;
    }

    // --- Modal: Squad selector (Add Match modal) ---
    const amSquadSelect = document.getElementById('amSquadId');
    if (amSquadSelect) {
        amSquadSelect.innerHTML = '<option value="">Select Squad</option>' + squadOptions;
        if (squads.length === 1) amSquadSelect.value = squads[0].id;
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

    let watchedPlayerName = '';
    if (m.matchType === 'player_watch' && m.watchedPlayerId) {
        const allPlayers = squadManager.getPlayers({});
        const wp = allPlayers.find(p => String(p.id) === String(m.watchedPlayerId));
        watchedPlayerName = wp ? wp.name : '';
    }

    const expandedContent = (() => {
        let html = `<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
            <span><i class="fas fa-map-marker-alt" style="margin-right:6px;color:var(--primary);"></i><strong>Venue:</strong> ${m.venue || 'TBD'}</span>
            ${!isPast ? `<span><i class="fas fa-clock" style="margin-right:6px;color:var(--primary);"></i><strong>Kickoff:</strong> ${m.time || 'TBA'}</span>` : ''}
        </div>`;

        const isPlayerWatch = m.matchType === 'player_watch';

        // Report / Observation link
        const reportLabel = isPlayerWatch ? 'Observation Report' : 'Match Report';
        const reportIcon = isPlayerWatch ? 'fa-clipboard-list' : 'fa-file-alt';
        html += `<div style="margin-top:4px;padding:10px 14px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;display:flex;justify-content:space-between;align-items:center;" onclick="event.stopPropagation()">
            <span style="font-size:0.85rem;color:#0369a1;font-weight:600;"><i class="fas ${reportIcon}" style="margin-right:6px;"></i>${reportLabel}</span>
            <a href="match-details.html?id=${m.id}" class="dash-btn outline sm" style="font-size:0.8rem;padding:4px 14px;">
                <i class="fas fa-arrow-right" style="margin-right:4px;"></i>Open
            </a>
        </div>`;

        // Player profile shortcut for player_watch
        if (isPlayerWatch && m.watchedPlayerId) {
            html += `<div style="margin-top:10px;padding:10px 14px;background:#faf5ff;border:1px solid #ddd6fe;border-radius:8px;display:flex;justify-content:space-between;align-items:center;" onclick="event.stopPropagation()">
                <span style="font-size:0.85rem;color:#6d28d9;font-weight:600;"><i class="fas fa-user" style="margin-right:6px;"></i>${watchedPlayerName || 'Player'}</span>
                <a href="player-profile.html?id=${m.watchedPlayerId}" class="dash-btn outline sm" style="font-size:0.8rem;padding:4px 12px;">View Profile</a>
            </div>`;
        }

        if (!isPast && !isPlayerWatch) {
            // Fixtures only (team matches): Match Planning block
            const plan = matchPlanMap[m.id];
            if (plan) {
                html += `<div style="margin-top:10px;padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;display:flex;justify-content:space-between;align-items:center;" onclick="event.stopPropagation()">
                    <span style="font-size:0.85rem;color:#166534;font-weight:600;"><i class="fas fa-chess-board" style="margin-right:6px;"></i>Match Plan: ${escapeHtmlMP(plan.title)}</span>
                    <a href="match-plan.html?id=${plan.id}" class="dash-btn outline sm" style="font-size:0.8rem;padding:4px 12px;">View Plan</a>
                </div>`;
            } else {
                html += `<div style="margin-top:10px;padding:10px 14px;background:#fefce8;border:1px solid #fde68a;border-radius:8px;display:flex;justify-content:space-between;align-items:center;" onclick="event.stopPropagation()">
                    <span style="font-size:0.85rem;color:#92400e;"><i class="fas fa-chess-board" style="margin-right:6px;opacity:0.5;"></i>No match plan linked yet</span>
                    <a href="match-plan.html?match_id=${m.id}" class="dash-btn outline sm" style="font-size:0.8rem;padding:4px 12px;"><i class="fas fa-plus" style="margin-right:4px;"></i>Create Plan</a>
                </div>`;
            }

            // Enter Result — team matches only
            html += `<div id="enterResult-${m.id}" style="margin-top:10px;" onclick="event.stopPropagation()">
                <button class="dash-btn outline sm" onclick="toggleEnterResult('${m.id}')" style="font-size:0.82rem;border-color:var(--primary);color:var(--primary);">
                    <i class="fas fa-flag-checkered" style="margin-right:4px;"></i> Enter Result
                </button>
                <div id="resultForm-${m.id}" style="display:none;margin-top:8px;padding:14px 16px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;">
                    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
                        <span style="font-size:0.85rem;font-weight:700;color:var(--navy-dark);">${escapeHtmlMP(homeName)}</span>
                        <input type="number" id="resultHome-${m.id}" min="0" value="0" style="width:56px;padding:6px 8px;border:1px solid #e2e8f0;border-radius:8px;text-align:center;font-weight:700;font-size:1.1rem;font-family:inherit;">
                        <span style="font-weight:700;color:#94a3b8;font-size:1.1rem;">–</span>
                        <input type="number" id="resultAway-${m.id}" min="0" value="0" style="width:56px;padding:6px 8px;border:1px solid #e2e8f0;border-radius:8px;text-align:center;font-weight:700;font-size:1.1rem;font-family:inherit;">
                        <span style="font-size:0.85rem;font-weight:700;color:var(--navy-dark);">${escapeHtmlMP(awayName)}</span>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button class="dash-btn outline sm" onclick="submitResult('${m.id}','${m.ourSide || 'home'}',false)" style="font-size:0.82rem;">
                            <i class="fas fa-check" style="margin-right:4px;"></i> Save Result
                        </button>
                        <button class="dash-btn primary sm" onclick="submitResult('${m.id}','${m.ourSide || 'home'}',true)" style="font-size:0.82rem;">
                            <i class="fas fa-file-alt" style="margin-right:4px;"></i> Save & Match Report
                        </button>
                    </div>
                </div>
            </div>`;
        }

        return html;
    })();

    return `
    <div class="dash-card match-card" data-id="${m.id}" style="margin-bottom:12px;padding:0;overflow:hidden;transition:all 0.2s ease;">
        <div class="match-card-header match-card-grid" onclick="toggleMatchVenue('${m.id}')"
            style="padding:18px 24px;cursor:pointer;transition:background 0.15s;"
            onmouseover="this.style.background='#f8fafc';const _ch=document.getElementById('chevron-${m.id}');if(_ch)_ch.style.color='#6366f1';"
            onmouseout="this.style.background='';const _ch=document.getElementById('chevron-${m.id}');const _p=document.getElementById('match-venue-${m.id}');if(_ch)_ch.style.color=(_p&&_p.style.display!=='none')?'#6366f1':'#94a3b8';">
            <div class="match-card-info">
                <span style="font-weight:700;color:var(--navy-dark);font-size:.95rem;">
                    <i class="far fa-calendar-alt" style="margin-right:6px;color:var(--text-medium);opacity:.7;"></i>${m.date}
                </span>
                <span style="font-size:0.82rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-left:20px;">
                    ${m.competition || 'Friendly'}
                </span>
                ${m.matchType === 'player_watch' ? `<span style="background:rgba(99,102,241,0.12);color:#6366f1;font-size:0.72rem;padding:3px 8px;border-radius:12px;font-weight:600;margin-left:8px;"><i class="fas fa-eye" style="margin-right:4px;"></i>Player Watch${watchedPlayerName ? ': ' + watchedPlayerName : ''}</span>` : ''}
            </div>
            <div class="match-teams-score">
                ${m.matchType === 'player_watch'
                    ? `<div style="display:flex;align-items:center;gap:8px;justify-content:center;width:100%;">
                        <i class="fas fa-eye" style="color:#6366f1;font-size:.9rem;"></i>
                        <span style="font-weight:700;color:#1e293b;font-size:.9rem;">${watchedPlayerName || 'Player Watch'}</span>
                        ${isPast && (hScore || aScore) ? `<span style="font-size:.8rem;color:#64748b;margin-left:4px;">${hScore} – ${aScore}</span>` : ''}
                       </div>`
                    : `<div class="match-team-name home">${homeName}</div>
                       <div class="match-score-badge ${isPast ? 'past' : ''} ${isPast ? resultClass : ''}">
                           ${isPast ? `${hScore} - ${aScore}` : 'VS'}
                       </div>
                       <div class="match-team-name away">${awayName}</div>`
                }
            </div>
            <div class="match-meta-info">
                ${m.matchType === 'player_watch'
                    ? `<span style="color:#6366f1;font-weight:600;font-size:.78rem;letter-spacing:.5px;">OBSERVATION</span>`
                    : (!isPast ? `<i class="far fa-clock"></i> ${m.time || 'TBA'}` : `<span style="color:${resultColor};letter-spacing:1px;font-weight:800;">${resText}</span>`)
                }
            </div>
            <div style="display:flex;align-items:center;flex-shrink:0;">
                <button onclick="event.stopPropagation();handleDeleteMatch('${m.id}')"
                    style="border:none;background:none;width:32px;height:32px;border-radius:6px;cursor:pointer;color:#e2e8f0;display:flex;align-items:center;justify-content:center;transition:color .15s,background .15s;flex-shrink:0;"
                    onmouseover="this.style.color='#ef4444';this.style.background='rgba(239,68,68,0.08)'"
                    onmouseout="this.style.color='#e2e8f0';this.style.background='none'"
                    title="Delete match">
                    <i class="fas fa-trash-alt" style="font-size:.7rem;pointer-events:none;"></i>
                </button>
                <div style="width:1px;height:18px;background:#e2e8f0;margin:0 10px;flex-shrink:0;"></div>
                <span id="chevron-${m.id}" style="color:#94a3b8;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;transition:transform .25s ease,color .15s;border-radius:6px;">
                    <i class="fas fa-chevron-down" style="font-size:.75rem;pointer-events:none;"></i>
                </span>
            </div>
        </div>
        <div id="match-venue-${m.id}" style="display:none;background:#f8fafc;padding:14px 24px;border-top:1px solid var(--border-light);font-size:0.9rem;color:var(--text-medium);">
            ${expandedContent}
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

    const upcoming = matches.filter(m => m.status !== 'result' && !m.isPast);
    const past = matches.filter(m => m.status === 'result' || m.isPast);

    // Sort upcoming by date ascending (soonest first)
    upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
    // Results already sorted by desc date from manager

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
    const ok = await showConfirm('Delete Match Plan', 'This will permanently remove the match plan. This cannot be undone.', { confirmLabel: 'Delete', isDanger: true, icon: 'fa-trash-alt' });
    if (!ok) return;
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
    const chevron = document.getElementById(`chevron-${id}`);
    if (el) {
        const isOpen = el.style.display !== 'none';
        el.style.display = isOpen ? 'none' : 'block';
        if (chevron) {
            chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
            chevron.style.color = isOpen ? '#94a3b8' : '#6366f1';
        }
    }
}
window.toggleMatchVenue = toggleMatchVenue;

/* --- Modal & Form Handling --- */

async function handleAddMatchClick() {
    // Reset modal state
    _amMode = 'fixture';
    _amEvents = [];
    _amCurrentEventType = null;

    // Clear fields
    const clearVal = (id, val = '') => { const el = document.getElementById(id); if (el) el.value = val; };
    clearVal('amOpponent');
    clearVal('amDate');
    clearVal('amTime');
    clearVal('amVenue');
    clearVal('amCompetition');
    clearVal('amFormation');
    clearVal('amReportTitle');
    clearVal('amReportGeneral');
    clearVal('amHomeScore', '0');
    clearVal('amAwayScore', '0');

    // Clear lineup lists
    const startersList = document.getElementById('am-starters-list');
    const subsList = document.getElementById('am-subs-list');
    if (startersList) startersList.innerHTML = '';
    if (subsList) subsList.innerHTML = '';

    // Reset events feed
    _renderEventsFeed();

    // Set mode (shows/hides elements correctly)
    setAddMatchMode('fixture');

    // Populate season dropdown async
    await _populateAmSeasonSelect();

    // Update score labels
    _updateScoreLabels();

    // Show modal
    const modal = document.getElementById('createMatchModal');
    if (modal) modal.style.display = 'flex';
}
window.handleAddMatchClick = handleAddMatchClick;

function closeAddMatchModal() {
    const modal = document.getElementById('createMatchModal');
    if (modal) modal.style.display = 'none';
}
window.closeAddMatchModal = closeAddMatchModal;

/* --- Add Match Modal: mode, tabs, lineup, events --- */

function setAddMatchMode(mode) {
    _amMode = mode;
    const isResult = mode === 'result';

    const fixtureBtn = document.getElementById('amToggleFixture');
    const resultBtn = document.getElementById('amToggleResult');

    if (fixtureBtn) {
        fixtureBtn.style.borderColor = isResult ? '#e2e8f0' : 'var(--blue-accent, #2563eb)';
        fixtureBtn.style.background = isResult ? '#f8fafc' : 'rgba(37,99,235,0.07)';
        fixtureBtn.style.color = isResult ? '#64748b' : 'var(--blue-accent, #2563eb)';
    }
    if (resultBtn) {
        resultBtn.style.borderColor = isResult ? 'var(--primary, #00c49a)' : '#e2e8f0';
        resultBtn.style.background = isResult ? 'rgba(0,196,154,0.08)' : '#f8fafc';
        resultBtn.style.color = isResult ? 'var(--primary, #00c49a)' : '#64748b';
    }

    const resultTabs = document.getElementById('amResultTabs');
    if (resultTabs) resultTabs.style.display = isResult ? 'flex' : 'none';

    const scoreRow = document.getElementById('amScoreRow');
    if (scoreRow) scoreRow.style.display = isResult ? 'block' : 'none';

    switchAmTab('am-details');
}
window.setAddMatchMode = setAddMatchMode;

function switchAmTab(tabId) {
    // Validate that details are filled before accessing result-only tabs
    if (tabId !== 'am-details') {
        const squadId = document.getElementById('amSquadId')?.value;
        const date = document.getElementById('amDate')?.value;
        const opponent = document.getElementById('amOpponent')?.value;
        if (!squadId || !date || !opponent) {
            showToast('Fill in Squad, Date and Opponent in Details first', 'error');
            return;
        }
    }
    document.querySelectorAll('.am-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.am-tab-content').forEach(tc => {
        tc.style.display = tc.id === tabId ? 'block' : 'none';
    });
}
window.switchAmTab = switchAmTab;

function _updateAmCompetitionList() {
    const squadId = document.getElementById('amSquadId')?.value;
    const datalist = document.getElementById('amCompetitionList');
    if (!datalist) return;
    if (!squadId) { datalist.innerHTML = ''; return; }
    const squad = squadManager.getSquad(squadId);
    const leagues = Array.isArray(squad?.leagues) ? squad.leagues : [];
    datalist.innerHTML = leagues.map(l => `<option value="${escapeHtmlMP(l)}">`).join('');
    // Auto-fill if only one competition and field is empty
    const compEl = document.getElementById('amCompetition');
    if (compEl && !compEl.value && leagues.length === 1) compEl.value = leagues[0];
}
window._updateAmCompetitionList = _updateAmCompetitionList;

function addLineupRow(containerId, type) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const squadId = document.getElementById('amSquadId')?.value;
    const allPlayers = squadManager.getPlayers(squadId ? { squadId } : {});

    const rowId = `lineup-row-${Date.now()}`;
    const playerOptions = allPlayers.length > 0
        ? allPlayers.map(p => {
            const pos = p.position ? ` — ${p.position.split(',')[0].trim()}` : '';
            return `<option value="${p.id}">${escapeHtmlMP(p.name)}${pos}</option>`;
        }).join('')
        : '<option value="">No players in squad</option>';

    const row = document.createElement('div');
    row.id = rowId;
    row.style.cssText = 'display:flex; align-items:center; gap:8px; padding:6px 10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;';
    row.innerHTML = `
        <span style="font-size:0.7rem; font-weight:700; text-transform:uppercase; color:#94a3b8; min-width:24px;">${type === 'starter' ? 'ST' : 'SB'}</span>
        <select style="flex:1; padding:5px 8px; border:1px solid #e2e8f0; border-radius:6px; font-size:0.85rem; background:white;">
            <option value="">Select player...</option>
            ${playerOptions}
        </select>
        <button type="button" onclick="document.getElementById('${rowId}').remove()" style="padding:4px 8px; background:none; border:1px solid #fca5a5; border-radius:6px; color:#ef4444; cursor:pointer; font-size:0.75rem;" title="Remove">✕</button>
    `;
    container.appendChild(row);
}
window.addLineupRow = addLineupRow;

async function _populateAmSeasonSelect() {
    const sel = document.getElementById('amSeasonId');
    if (!sel) return;
    sel.innerHTML = '<option value="">Loading...</option>';
    const seasons = await matchManager.getSeasons();
    const active = seasons.find(s => s.is_current || s.status === 'active');
    if (seasons.length === 0) {
        const created = await matchManager.getOrCreateActiveSeason();
        if (created) {
            sel.innerHTML = `<option value="${created.id}">${escapeHtmlMP(created.name)}</option>`;
        } else {
            sel.innerHTML = '<option value="">No season</option>';
        }
        return;
    }
    sel.innerHTML = '<option value="">No Season</option>' +
        seasons.map(s =>
            `<option value="${s.id}"${s.id === active?.id ? ' selected' : ''}>${escapeHtmlMP(s.name)}</option>`
        ).join('');
}

function _updateScoreLabels() {
    const ourSide = document.getElementById('amOurSide')?.value || 'home';
    const homeLabel = document.getElementById('amHomeLabel');
    const awayLabel = document.getElementById('amAwayLabel');
    if (homeLabel) homeLabel.textContent = ourSide === 'home' ? 'Home (Us)' : 'Home (Them)';
    if (awayLabel) awayLabel.textContent = ourSide === 'home' ? 'Away (Them)' : 'Away (Us)';
    _updateResultPreview();
}

function _updateResultPreview() {
    const preview = document.getElementById('amResultPreview');
    if (!preview) return;
    const hScore = parseInt(document.getElementById('amHomeScore')?.value) || 0;
    const aScore = parseInt(document.getElementById('amAwayScore')?.value) || 0;
    const ourSide = document.getElementById('amOurSide')?.value || 'home';
    const ourScore = ourSide === 'home' ? hScore : aScore;
    const theirScore = ourSide === 'home' ? aScore : hScore;

    let text, bg, color;
    if (ourScore > theirScore) {
        text = 'WIN'; bg = 'rgba(16,185,129,0.12)'; color = '#059669';
    } else if (ourScore < theirScore) {
        text = 'LOSS'; bg = 'rgba(239,68,68,0.12)'; color = '#dc2626';
    } else {
        text = 'DRAW'; bg = 'rgba(100,116,139,0.12)'; color = '#475569';
    }
    preview.textContent = text;
    preview.style.background = bg;
    preview.style.color = color;
}

/* --- Add Event Modal --- */

function openAddEventModal() {
    _amCurrentEventType = null;
    document.querySelectorAll('.event-type-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('eventDetailForm').style.display = 'none';
    _populateEventPlayerSelect();
    document.getElementById('addEventModal').style.display = 'flex';
}
window.openAddEventModal = openAddEventModal;

function closeAddEventModal() {
    document.getElementById('addEventModal').style.display = 'none';
}
window.closeAddEventModal = closeAddEventModal;

function _populateEventPlayerSelect() {
    const getLineupPlayers = (containerId) => {
        const container = document.getElementById(containerId);
        if (!container) return [];
        return Array.from(container.querySelectorAll('select')).map(sel => ({
            id: sel.value,
            name: sel.options[sel.selectedIndex]?.text || ''
        })).filter(p => p.id);
    };

    const starters = getLineupPlayers('am-starters-list');
    const subs = getLineupPlayers('am-subs-list');
    let players = [...starters, ...subs];

    // Fall back to full squad if lineup empty
    if (players.length === 0) {
        const squadId = document.getElementById('amSquadId')?.value;
        players = squadManager.getPlayers(squadId ? { squadId } : {})
            .map(p => ({ id: p.id, name: p.name }));
    }

    const opts = players.map(p => `<option value="${p.id}">${escapeHtmlMP(p.name)}</option>`).join('');
    document.getElementById('eventPlayer').innerHTML = '<option value="">Select player</option>' + opts;
    document.getElementById('eventAssist').innerHTML = '<option value="">No assist</option>' + opts;
    document.getElementById('eventSubOff').innerHTML = '<option value="">Select player</option>' + opts;
}

function selectEventType(type) {
    _amCurrentEventType = type;
    document.querySelectorAll('.event-type-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.type === type);
    });
    document.getElementById('eventDetailForm').style.display = 'block';

    const assistRow = document.getElementById('eventAssistRow');
    const subOffRow = document.getElementById('eventSubOffRow');
    const playerLabel = document.getElementById('eventPlayerLabel');

    assistRow.style.display = type === 'goal' ? 'block' : 'none';
    subOffRow.style.display = type === 'substitution' ? 'block' : 'none';
    playerLabel.textContent = type === 'substitution' ? 'Player On'
        : type === 'own_goal' ? 'Player (own goal)'
        : 'Player';
}
window.selectEventType = selectEventType;

function confirmAddEvent() {
    if (!_amCurrentEventType) { showToast('Select an event type first', 'error'); return; }

    const playerSel = document.getElementById('eventPlayer');
    const minuteEl = document.getElementById('eventMinute');
    const assistSel = document.getElementById('eventAssist');
    const subOffSel = document.getElementById('eventSubOff');

    const minute = parseInt(minuteEl?.value) || 0;
    if (!minute || minute < 1) { showToast('Enter the minute', 'error'); return; }

    const event = {
        id: Date.now(),
        type: _amCurrentEventType,
        playerId: playerSel?.value || null,
        playerName: playerSel?.value ? (playerSel.options[playerSel.selectedIndex]?.text || '') : '',
        minute
    };

    if (_amCurrentEventType === 'goal') {
        event.assistId = assistSel?.value || null;
        event.assistName = assistSel?.value ? (assistSel.options[assistSel.selectedIndex]?.text || '') : null;
    } else if (_amCurrentEventType === 'substitution') {
        event.subOffId = subOffSel?.value || null;
        event.subOffName = subOffSel?.value ? (subOffSel.options[subOffSel.selectedIndex]?.text || '') : null;
    }

    _amEvents.push(event);
    _renderEventsFeed();
    _updateLiveScore();
    closeAddEventModal();
    showToast('Event added', 'success');
}
window.confirmAddEvent = confirmAddEvent;

function removeAmEvent(id) {
    _amEvents = _amEvents.filter(e => e.id !== id);
    _renderEventsFeed();
    _updateLiveScore();
}
window.removeAmEvent = removeAmEvent;

function _renderEventsFeed() {
    const feed = document.getElementById('amEventsFeed');
    if (!feed) return;

    if (_amEvents.length === 0) {
        feed.innerHTML = `<div style="text-align:center; padding:32px; color:#94a3b8; font-size:0.85rem;">
            <i class="fas fa-bolt" style="font-size:1.5rem; display:block; margin-bottom:8px; opacity:0.4;"></i>
            No events yet — click Add Event to log goals, cards, subs
        </div>`;
        const liveScore = document.getElementById('amLiveScore');
        if (liveScore) liveScore.style.display = 'none';
        return;
    }

    const icons = {
        goal: '<i class="fas fa-futbol" style="color:#10b981;"></i>',
        own_goal: '<i class="fas fa-futbol" style="color:#ef4444; opacity:0.6;"></i>',
        yellow_card: '<i class="fas fa-square" style="color:#fbbf24;"></i>',
        red_card: '<i class="fas fa-square" style="color:#ef4444;"></i>',
        substitution: '<i class="fas fa-exchange-alt" style="color:#6366f1;"></i>',
        penalty_saved: '<i class="fas fa-hand-paper" style="color:#10b981;"></i>',
        missed_penalty: '<i class="fas fa-times-circle" style="color:#ef4444;"></i>',
        injury: '<i class="fas fa-user-injured" style="color:#f59e0b;"></i>'
    };
    const labels = {
        goal: 'Goal', own_goal: 'Own Goal', yellow_card: 'Yellow Card',
        red_card: 'Red Card', substitution: 'Sub', penalty_saved: 'Pen Saved',
        missed_penalty: 'Missed Pen', injury: 'Injury'
    };

    const sorted = [..._amEvents].sort((a, b) => a.minute - b.minute);
    feed.innerHTML = sorted.map(ev => {
        let detail = ev.playerName || '—';
        if (ev.type === 'goal' && ev.assistName) detail += ` (assist: ${escapeHtmlMP(ev.assistName)})`;
        if (ev.type === 'substitution' && ev.subOffName) detail += ` ↔ ${escapeHtmlMP(ev.subOffName)} off`;
        return `<div style="display:flex; align-items:center; gap:10px; padding:8px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
            <span style="min-width:32px; font-size:0.78rem; font-weight:700; color:#64748b;">${ev.minute}'</span>
            ${icons[ev.type] || '<i class="fas fa-circle"></i>'}
            <span style="flex:1; font-size:0.85rem; color:#1e293b;">${escapeHtmlMP(detail)}</span>
            <span style="font-size:0.75rem; color:#94a3b8;">${labels[ev.type] || ev.type}</span>
            <button type="button" onclick="removeAmEvent(${ev.id})" style="padding:2px 6px; background:none; border:1px solid #fca5a5; border-radius:4px; color:#ef4444; cursor:pointer; font-size:0.7rem;" title="Remove">✕</button>
        </div>`;
    }).join('');
}

function _updateLiveScore() {
    const liveScore = document.getElementById('amLiveScore');
    if (!liveScore) return;
    if (_amEvents.length === 0) { liveScore.style.display = 'none'; return; }

    const ourSide = document.getElementById('amOurSide')?.value || 'home';
    const goals = _amEvents.filter(e => e.type === 'goal').length;
    const ownGoals = _amEvents.filter(e => e.type === 'own_goal').length;
    const homeGoals = ourSide === 'home' ? goals : ownGoals;
    const awayGoals = ourSide === 'home' ? ownGoals : goals;

    liveScore.style.display = 'block';
    liveScore.textContent = `${homeGoals} — ${awayGoals}`;
}

function _collectLineup() {
    const getPlayers = (containerId) => {
        const container = document.getElementById(containerId);
        if (!container) return [];
        return Array.from(container.querySelectorAll('select')).map(sel => ({
            playerId: sel.value,
            playerName: sel.options[sel.selectedIndex]?.text || ''
        })).filter(p => p.playerId);
    };
    return { starters: getPlayers('am-starters-list'), subs: getPlayers('am-subs-list') };
}

/* --- Save Match Logic --- */

async function handleSaveMatch() {
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };

    const squadId = getVal('amSquadId');
    const date = getVal('amDate');
    const opponent = getVal('amOpponent');

    if (!squadId) { showToast('Please select a squad', 'error'); return; }
    if (!date) { showToast('Please select a date', 'error'); return; }
    if (!opponent) { showToast('Please enter the opponent name', 'error'); return; }

    const isResult = _amMode === 'result';
    const ourSide = getVal('amOurSide') || 'home';
    const homeScore = isResult ? (parseInt(getVal('amHomeScore')) || 0) : null;
    const awayScore = isResult ? (parseInt(getVal('amAwayScore')) || 0) : null;

    let result = null;
    if (isResult && homeScore !== null && awayScore !== null) {
        const ourScore = ourSide === 'home' ? homeScore : awayScore;
        const theirScore = ourSide === 'home' ? awayScore : homeScore;
        result = ourScore > theirScore ? 'Win' : ourScore < theirScore ? 'Loss' : 'Draw';
    }

    const squad = squadManager.getSquad(squadId);
    const squadName = squad?.name || 'Us';
    const homeTeam = ourSide === 'home' ? squadName : opponent;
    const awayTeam = ourSide === 'home' ? opponent : squadName;

    const lineup = _collectLineup();

    const matchData = {
        squadId,
        date,
        time: getVal('amTime'),
        venue: getVal('amVenue'),
        opponent,
        competition: getVal('amCompetition') || 'Friendly',
        ourSide,
        homeTeam,
        awayTeam,
        status: isResult ? 'result' : 'fixture',
        matchFormat: getVal('amFormat') || '11-a-side',
        formation: getVal('amFormation') || null,
        homeScore,
        awayScore,
        result,
        seasonId: getVal('amSeasonId') || null,
        matchType: getVal('amMatchType') || 'team',
        lineup,
        matchEvents: _amEvents,
        reportTitle: getVal('amReportTitle') || null,
        reportGeneral: getVal('amReportGeneral') || null,
        stats: matchManager.getDefaultStats(),
        links: [],
        videos: []
    };

    const saveBtn = document.getElementById('amSaveBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }

    try {
        const created = await matchManager.createMatch(matchData);
        // Write player stats from lineup + events for result matches
        if (isResult && created?.id) {
            await _deriveAndSavePlayerStats(created.id, lineup, _amEvents, matchData.seasonId);
        }
        showToast('Match added successfully!', 'success');
        closeAddMatchModal();
        await matchManager.init();
        renderMatches();
    } catch (err) {
        console.error('Failed to create match:', err);
        showToast('Failed to save match', 'error');
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Match'; }
    }
}

async function _deriveAndSavePlayerStats(matchId, lineup, events, seasonId) {
    const statsMap = {};

    const ensurePlayer = (playerId) => {
        if (!playerId) return null;
        if (!statsMap[playerId]) {
            statsMap[playerId] = {
                playerId,
                appeared: false, started: false,
                goals: 0, assists: 0,
                yellowCards: 0, redCards: 0,
                motm: false, rating: null, notes: ''
            };
        }
        return statsMap[playerId];
    };

    // Starters
    (lineup.starters || []).forEach(p => {
        const s = ensurePlayer(p.playerId);
        if (s) { s.appeared = true; s.started = true; }
    });
    // Subs
    (lineup.subs || []).forEach(p => {
        const s = ensurePlayer(p.playerId);
        if (s) { s.appeared = true; s.started = false; }
    });

    // Events
    (events || []).forEach(ev => {
        if (ev.type === 'goal' && ev.playerId) {
            const s = ensurePlayer(ev.playerId);
            if (s) { s.appeared = true; s.goals++; }
            if (ev.assistId) {
                const a = ensurePlayer(ev.assistId);
                if (a) { a.appeared = true; a.assists++; }
            }
        } else if (ev.type === 'yellow_card' && ev.playerId) {
            const s = ensurePlayer(ev.playerId);
            if (s) { s.appeared = true; s.yellowCards++; }
        } else if (ev.type === 'red_card' && ev.playerId) {
            const s = ensurePlayer(ev.playerId);
            if (s) { s.appeared = true; s.redCards++; }
        } else if (ev.type === 'substitution') {
            if (ev.playerId) { const s = ensurePlayer(ev.playerId); if (s) s.appeared = true; }
            if (ev.subOffId) { const s = ensurePlayer(ev.subOffId); if (s) s.appeared = true; }
        }
    });

    const playerStatsArray = Object.values(statsMap);
    if (playerStatsArray.length === 0) return;

    await matchManager.saveMatchPlayerStats(matchId, playerStatsArray);

    // Recalc season totals for each player
    if (seasonId) {
        await Promise.all(
            playerStatsArray.map(ps => matchManager.recalcPlayerSeasonStats(ps.playerId, seasonId))
        );
    }
}
window.handleSaveMatch = handleSaveMatch;

async function handleDeleteMatch(id) {
    const ok = await showConfirm('Delete Match', 'This will permanently remove the match and all associated stats, reports and player data. This cannot be undone.', { confirmLabel: 'Delete Match', isDanger: true, icon: 'fa-trash-alt' });
    if (!ok) return;

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

async function submitResult(matchId, ourSide, navigate = false) {
    const homeEl = document.getElementById(`resultHome-${matchId}`);
    const awayEl = document.getElementById(`resultAway-${matchId}`);
    const hScore = parseInt(homeEl?.value, 10) || 0;
    const aScore = parseInt(awayEl?.value, 10) || 0;

    const effectiveSide = ourSide || 'home';
    const ourScore = effectiveSide === 'home' ? hScore : aScore;
    const theirScore = effectiveSide === 'home' ? aScore : hScore;
    const result = ourScore > theirScore ? 'Win' : ourScore < theirScore ? 'Loss' : 'Draw';

    try {
        // Update in DB — write both legacy is_past and new status field
        await matchManager.updateMatchInfo(matchId, {
            isPast: true,
            status: 'result',
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

        if (navigate) {
            showToast(`Result saved: ${hScore} – ${aScore} (${result})`, 'success');
            window.location.href = `match-details.html?id=${matchId}`;
        } else {
            renderMatches();
            switchMatchesTab('results');
            showToast(`Result saved: ${hScore} – ${aScore} (${result})`, 'success');
        }
    } catch (err) {
        console.error('Failed to save result:', err);
        showToast('Failed to save result', 'error');
    }
}
window.submitResult = submitResult;
