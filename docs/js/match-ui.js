/**
 * Match Hub UI Logic
 */

// Track current match type selection in modal
let currentMatchType = 'team';

document.addEventListener('DOMContentLoaded', async () => {
    // Both managers must be initialized before rendering
    await Promise.all([
        squadManager.init(),
        matchManager.init()
    ]);

    populateTeamSelector();
    renderMatches();
});

function populateTeamSelector() {
    const squads = squadManager.getSquads();

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
    const leagueFilter = document.getElementById('matchesLeagueFilter');
    if (leagueFilter) {
        const allLeagues = new Set();
        squads.forEach(s => {
            if (s.leagues) {
                if (Array.isArray(s.leagues)) s.leagues.forEach(l => allLeagues.add(l));
                else if (typeof s.leagues === 'string') s.leagues.split(',').forEach(l => allLeagues.add(l.trim()));
                else allLeagues.add(s.leagues);
            }
        });
        leagueFilter.innerHTML = '<option value="all">All Leagues</option>' +
            Array.from(allLeagues).sort().map(l => `<option value="${l}">${l}</option>`).join('');
    }
}

/**
 * Smart Home/Away toggle:
 * When a squad is selected on one side, the OTHER side becomes a text input for the opponent.
 * If "Other (type in)" is selected, that side becomes a text input too.
 */
window.onTeamSelectChange = function (side) {
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
};

// Helper to get squad name safely
function getSquadName(squadId) {
    if (!window.squadManager) return 'Unknown';
    const squad = squadManager.getSquad(squadId);
    return squad ? squad.name : 'Unknown';
}

function calculateResult(homeScore, awayScore) {
    if (homeScore > awayScore) return 'Win';
    if (homeScore < awayScore) return 'Loss';
    return 'Draw';
}

function renderMatches() {
    const container = document.getElementById('matchesList');
    const searchInput = document.getElementById('matchesSearch');
    const teamSelector = document.getElementById('matchesTeamSelector');

    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const teamId = teamSelector ? teamSelector.value : 'all';
    const leagueFilter = document.getElementById('matchesLeagueFilter');
    const leagueVal = leagueFilter ? leagueFilter.value : 'all';
    const typeFilter = document.getElementById('matchesTypeFilter');
    const typeVal = typeFilter ? typeFilter.value : 'all';

    let matches = matchManager.matches;

    // Filter by match type (all / team / player_watch)
    if (typeVal === 'team') {
        matches = matches.filter(m => m.matchType !== 'player_watch');
    } else if (typeVal === 'player_watch') {
        matches = matches.filter(m => m.matchType === 'player_watch');
    }

    // Filter by team (only relevant for team matches)
    if (teamId !== 'all') {
        matches = matches.filter(m => m.squadId === teamId);
    }

    // Filter by league
    if (leagueVal !== 'all') {
        matches = matches.filter(m => m.competition === leagueVal);
    }

    // Filter by search term (opponent, homeTeam, awayTeam, venue, watched player name)
    if (searchTerm) {
        matches = matches.filter(m =>
            (m.opponent && m.opponent.toLowerCase().includes(searchTerm)) ||
            (m.homeTeam && m.homeTeam.toLowerCase().includes(searchTerm)) ||
            (m.awayTeam && m.awayTeam.toLowerCase().includes(searchTerm)) ||
            (m.venue && m.venue.toLowerCase().includes(searchTerm)) ||
            (m.watchedPlayerName && m.watchedPlayerName.toLowerCase().includes(searchTerm))
        );
    }

    // Sort chronologically (newest first)
    matches.sort((a, b) => new Date(b.date) - new Date(a.date));

    const upcoming = matches.filter(m => !m.isPast);
    const past = matches.filter(m => m.isPast);

    let html = '';

    const resolveTeamNames = (m) => {
        let home = m.homeTeam;
        let away = m.awayTeam;

        // Fallback for legacy data or missing explicit sides
        if (!home || !away) {
            const squadName = squadManager.getSquad(m.squadId)?.name || 'UP - Tuks';
            // Default to Squad on LEFT unless explicitly marked as 'away'
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

    const calculateResult = (hScore, aScore, ourSide) => {
        // Default to 'home' for legacy matches where ourSide is missing/null
        const effectiveSide = ourSide || 'home';
        if (hScore === aScore) return { color: '#64748b', text: 'DRAW' };
        if (effectiveSide === 'home') {
            return hScore > aScore ? { color: '#10b981', text: 'WIN' } : { color: '#ef4444', text: 'LOSS' };
        } else {
            return aScore > hScore ? { color: '#10b981', text: 'WIN' } : { color: '#ef4444', text: 'LOSS' };
        }
    };

    const createMatchCard = (m, isPast) => {
        const isPlayerWatch = m.matchType === 'player_watch';

        // --- Player Watch Card ---
        if (isPlayerWatch) {
            const playerName = m.watchedPlayerName || 'Unknown Player';
            const initials = playerName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
            const hScore = m.homeScore || 0;
            const aScore = m.awayScore || 0;
            const hasScore = isPast && (hScore > 0 || aScore > 0);
            const playerProfileBase = `player-profile.html?id=${m.watchedPlayerId}`;
            const assessUrl = `${playerProfileBase}&tab=assessment&matchId=${m.id}&matchDate=${encodeURIComponent(m.date)}&matchLabel=${encodeURIComponent('vs ' + (m.awayTeam || m.opponent || 'Opponent'))}`;
            const clipsUrl = `${playerProfileBase}&tab=analysis`;

            return `
            <div class="dash-card match-card" data-id="${m.id}" style="margin-bottom: 12px; padding: 0; overflow: hidden; transition: all 0.2s ease; border-left: 3px solid #3b82f6;">
                <div class="match-card-header match-card-grid" onclick="toggleMatchVenue('${m.id}')" style="padding: 20px 24px; cursor: pointer;">

                    <!-- Left: Date & Badge -->
                    <div class="match-card-info">
                        <span style="font-weight: 700; color: var(--navy-dark); font-size: 1rem;">
                            <i class="far fa-calendar-alt" style="margin-right: 6px; color: var(--text-medium); opacity: 0.7;"></i> ${m.date}
                        </span>
                        <span style="display: inline-block; margin-left: 10px; background: #eff6ff; color: #3b82f6; border-radius: 6px; padding: 2px 8px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;">
                            <i class="fas fa-eye" style="margin-right: 4px;"></i>Player Watch
                        </span>
                        <div style="margin-top: 6px; display: flex; align-items: center; gap: 8px;">
                            <div style="width: 24px; height: 24px; border-radius: 50%; background: #3b82f6; color: white; font-size: 0.7rem; font-weight: 700; display: flex; align-items: center; justify-content: center;">${initials}</div>
                            <span style="font-size: 0.88rem; font-weight: 600; color: var(--navy-primary);">${playerName}</span>
                        </div>
                    </div>

                    <!-- Center: Teams & Score -->
                    <div class="match-teams-score">
                        <div class="match-team-name home">${m.homeTeam || 'Home'}</div>
                        <div class="match-score-badge ${hasScore ? 'past' : ''}">
                            ${hasScore ? `${hScore} - ${aScore}` : 'VS'}
                        </div>
                        <div class="match-team-name away">${m.awayTeam || m.opponent || 'Away'}</div>
                    </div>

                    <!-- Center Right: Competition / Time -->
                    <div class="match-meta-info">
                        ${!isPast ? `<i class="far fa-clock"></i> ${m.time || 'TBA'}` : `<span style="color: #64748b; font-size: 0.8rem;">${m.competition || 'Player Watch'}</span>`}
                    </div>

                    <!-- Right: Actions -->
                    <div class="match-actions" style="display: flex; gap: 8px;" onclick="event.stopPropagation()">
                        <a href="${assessUrl}" class="dash-btn outline sm" title="Assessment" style="color: #3b82f6; border-color: rgba(59,130,246,0.3);">
                            <i class="fas fa-clipboard-check"></i> Assessment
                        </a>
                        <a href="${clipsUrl}" class="dash-btn outline sm" title="Player Clips">
                            <i class="fas fa-video"></i> Clips
                        </a>
                        <button onclick="handleDeleteMatch('${m.id}')" class="dash-btn outline sm danger" style="padding: 0 10px; color: #ef4444; border-color: rgba(239,68,68,0.3);" title="Delete">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>

                <!-- Expanded Venue Info -->
                <div id="match-venue-${m.id}" style="display: none; background: #f8fafc; padding: 12px 24px; border-top: 1px solid var(--border-light); font-size: 0.9rem; color: var(--text-medium);">
                    <div style="display: flex; gap: 24px;">
                        <span><i class="fas fa-map-marker-alt" style="margin-right: 6px; color: var(--primary);"></i> <strong>Venue:</strong> ${m.venue || 'TBD'}</span>
                        ${!isPast ? `<span><i class="fas fa-clock" style="margin-right: 6px; color: var(--primary);"></i> <strong>Kickoff:</strong> ${m.time || 'TBA'}</span>` : ''}
                    </div>
                </div>
            </div>
            `;
        }

        // --- Team Match Card (existing) ---
        const { home: homeName, away: awayName } = resolveTeamNames(m);
        const hScore = m.homeScore || 0;
        const aScore = m.awayScore || 0;

        const res = calculateResult(hScore, aScore, m.ourSide);
        const resultColor = res.color;
        const resText = res.text;
        const resultClass = resText.toLowerCase(); // 'win', 'loss', or 'draw'

        return `
        <div class="dash-card match-card" data-id="${m.id}" style="margin-bottom: 12px; padding: 0; overflow: hidden; transition: all 0.2s ease;">
            <div class="match-card-header match-card-grid" onclick="toggleMatchVenue('${m.id}')" style="padding: 20px 24px; cursor: pointer;">

                <!-- Left: Date & League -->
                <div class="match-card-info">
                    <span style="font-weight: 700; color: var(--navy-dark); font-size: 1rem;">
                        <i class="far fa-calendar-alt" style="margin-right: 6px; color: var(--text-medium); opacity: 0.7;"></i> ${m.date}
                    </span>
                    <span style="font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-left: 22px;">
                        ${m.competition || 'Friendly'}
                    </span>
                </div>

                <!-- Center: Teams & Score -->
                <div class="match-teams-score">
                    <div class="match-team-name home">
                        ${homeName}
                    </div>
                    <div class="match-score-badge ${isPast ? 'past' : ''} ${isPast ? resultClass : ''}">
                        ${isPast ? `${hScore} - ${aScore}` : 'VS'}
                    </div>
                    <div class="match-team-name away">
                        ${awayName}
                    </div>
                </div>

                <!-- Center Right: Time (if upcoming) / Result (if past) -->
                <div class="match-meta-info">
                    ${!isPast ? `<i class="far fa-clock"></i> ${m.time || 'TBA'}` : `<span style="color: ${resultColor}; letter-spacing: 1px; font-weight: 800;">${resText}</span>`}
                </div>

                <!-- Right: Actions -->
                <div class="match-actions" style="display: flex; gap: 8px;" onclick="event.stopPropagation()">
                    <a href="match-details.html?id=${m.id}" class="dash-btn outline sm" title="Report">
                        <i class="fas fa-file-alt"></i> ${isPast ? 'Report' : 'Details'}
                    </a>
                    <a href="match-analysis.html?id=${m.id}" class="dash-btn outline sm" title="Analysis">
                        <i class="fas fa-video"></i> Analysis
                    </a>
                    <button onclick="handleDeleteMatch('${m.id}')" class="dash-btn outline sm danger" style="padding: 0 10px; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);" title="Delete">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>

            <!-- Expanded Venue Info -->
            <div id="match-venue-${m.id}" style="display: none; background: #f8fafc; padding: 12px 24px; border-top: 1px solid var(--border-light); font-size: 0.9rem; color: var(--text-medium);">
                <div style="display: flex; gap: 24px;">
                    <span><i class="fas fa-map-marker-alt" style="margin-right: 6px; color: var(--primary);"></i> <strong>Venue:</strong> ${m.venue || 'TBD'}</span>
                    ${isPast ? '' : `<span><i class="fas fa-clock" style="margin-right: 6px; color: var(--primary);"></i> <strong>Kickoff:</strong> ${m.time || 'TBA'}</span>`}
                </div>
            </div>
        </div>
        `;
    };

    if (upcoming.length > 0) {
        html += `<div class="fixture-group"><h3 style="margin-bottom: 16px; color: var(--navy-dark);">Upcoming Fixtures</h3>`;
        upcoming.forEach(m => html += createMatchCard(m, false));
        html += `</div>`;
    }

    if (past.length > 0) {
        html += `<div class="fixture-group" style="margin-top: 32px;"><h3 style="margin-bottom: 16px; color: var(--navy-dark);">Past Results</h3>`;
        past.forEach(m => html += createMatchCard(m, true));
        html += `</div>`;
    }

    if (matches.length === 0) {
        html = `
            <div class="dash-card" style="text-align: center; padding: 48px;">
                <i class="fas fa-futbol" style="font-size: 3rem; color: var(--text-muted); margin-bottom: 16px; opacity: 0.5;"></i>
                <h3 style="color: var(--navy-dark); margin-bottom: 8px;">No Matches Found</h3>
                <p style="color: var(--text-medium);">Try adjusting your filters or add a new match.</p>
            </div>
        `;
    }

    container.innerHTML = html;
}

function toggleMatchVenue(id) {
    const el = document.getElementById(`match-venue-${id}`);
    if (el) {
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }
}

// Add event listeners for live filtering
document.addEventListener('DOMContentLoaded', () => {
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
    const typeFilter = document.getElementById('matchesTypeFilter');
    if (typeFilter) {
        typeFilter.addEventListener('change', renderMatches);
    }

    // Wire the Add Match button to open the modal
    const btnNewMatch = document.getElementById('btn-new-match');
    if (btnNewMatch) {
        btnNewMatch.addEventListener('click', handleAddMatchClick);
    }
});

/* --- Modal & Form Handling --- */

window.handleAddMatchClick = function () {
    const modal = document.getElementById('createMatchModal');
    if (modal) {
        modal.style.display = 'flex';
    }
    setMatchType('team');
    switchTab('details');
    populateWatchedPlayerDropdown();
}

/* --- Match Type Toggle --- */

window.setMatchType = function (type) {
    currentMatchType = type;

    document.getElementById('type-btn-team').classList.toggle('active', type === 'team');
    document.getElementById('type-btn-player').classList.toggle('active', type === 'player_watch');

    const isPlayerWatch = type === 'player_watch';

    // Show/hide watched player section
    const watchedSection = document.getElementById('watchedPlayerSection');
    if (watchedSection) watchedSection.style.display = isPlayerWatch ? 'block' : 'none';

    // Show/hide player clips note + clip title in analysis tab
    const clipsNote = document.getElementById('playerWatchClipsNote');
    if (clipsNote) clipsNote.style.display = isPlayerWatch ? 'block' : 'none';
    const clipTitleGroup = document.getElementById('clipTitleGroup');
    if (clipTitleGroup) clipTitleGroup.style.display = isPlayerWatch ? 'block' : 'none';

    // Rename analysis + report tabs
    const tabAnalysis = document.getElementById('tab-btn-analysis');
    const tabReport = document.getElementById('tab-btn-report');
    if (tabAnalysis) tabAnalysis.textContent = isPlayerWatch ? 'Player Clips' : 'Analysis Links';
    if (tabReport) tabReport.textContent = isPlayerWatch ? 'Match Context' : 'Stats Report';

    // Show/hide Post-Match Result section (colour-coded W/L/D is Team Match only)
    const postMatchSection = document.getElementById('postMatchResultSection');
    if (postMatchSection) postMatchSection.style.display = isPlayerWatch ? 'none' : 'block';

    // Player Watch: show plain text inputs for both teams (external clubs)
    // Team Match: restore squad dropdowns
    if (isPlayerWatch) {
        document.getElementById('homeTeamWrapper').style.display = 'none';
        document.getElementById('homeTeamTextWrapper').style.display = 'block';
        document.getElementById('awayTeamWrapper').style.display = 'none';
        document.getElementById('awayTeamTextWrapper').style.display = 'block';
        const comp = document.getElementById('matchCompetition');
        if (comp) comp.removeAttribute('required');
    } else {
        document.getElementById('homeTeamWrapper').style.display = 'block';
        document.getElementById('homeTeamTextWrapper').style.display = 'none';
        document.getElementById('awayTeamWrapper').style.display = 'block';
        document.getElementById('awayTeamTextWrapper').style.display = 'none';
        const comp = document.getElementById('matchCompetition');
        if (comp && comp.options.length > 1) comp.setAttribute('required', '');
    }
};

async function populateWatchedPlayerDropdown() {
    const select = document.getElementById('watchedPlayerId');
    if (!select) return;
    try {
        const resp = await fetch(`${window.API_BASE_URL}/players`);
        const players = await resp.json();
        select.innerHTML = '<option value="">Select Player...</option>';
        players
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name + (p.position ? ` (${p.position})` : '');
                select.appendChild(opt);
            });
    } catch (err) {
        console.error('Failed to load players for watched dropdown:', err);
    }
}

async function syncVideosToPlayer(playerId, videos, matchId) {
    try {
        const resp = await fetch(`${window.API_BASE_URL}/players/${playerId}`);
        const player = await resp.json();
        const existing = player.analysisVideos || [];
        const newEntries = videos.map(v => ({
            title: v.title || 'Video Clip',
            url: v.url,
            timestamp: new Date().toISOString(),
            matchRef: matchId || null
        }));
        await fetch(`${window.API_BASE_URL}/players/${playerId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ analysisVideos: [...existing, ...newEntries] })
        });
    } catch (err) {
        console.error('Failed to sync videos to player:', err);
    }
}

window.closeAddMatchModal = function () {
    const modal = document.getElementById('createMatchModal');
    if (modal) modal.style.display = 'none';
}

window.switchTab = function (tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.getElementById(`tab-btn-${tabId}`);
    if (targetBtn) targetBtn.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    const targetContent = document.getElementById(`tab-${tabId}`);
    if (targetContent) targetContent.classList.add('active');
}

// Form Submission Handler
const matchForm = document.getElementById('matchForm');
if (matchForm) {
    matchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSaveMatch();
    });
}

/* --- Save Match Logic --- */

window.toggleScoreInputs = function () { }

window.handleSaveMatch = async function () {
    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value : '';
    };

    // --- Player Watch branch ---
    if (currentMatchType === 'player_watch') {
        const watchedPlayerId = getVal('watchedPlayerId');
        if (!watchedPlayerId) {
            alert('Please select a player to watch.');
            return;
        }

        const homeTeam = getVal('matchHomeTeamText');
        const awayTeam = getVal('matchAwayTeamText');
        if (!homeTeam || !awayTeam) {
            alert('Please specify both Home and Away teams.');
            return;
        }

        const date = getVal('matchDate');
        if (!date) {
            alert('Please fill in the Date.');
            return;
        }

        const status = getVal('matchStatus') || 'upcoming';
        const isPast = status === 'completed';
        const clipTitle = getVal('matchClipTitle');
        const videoLink = getVal('matchVideoLink');
        const highlightsLink = getVal('matchHighlightsLink');
        const reportLink = getVal('matchReportLink');
        const reportText = getVal('matchTakeaways');

        const videos = [];
        const links = [];

        const videoFileEl = document.getElementById('matchVideoFile');
        if (videoFileEl && videoFileEl.files.length > 0) {
            videos.push({ title: clipTitle || 'Video File', url: '#', type: 'file' });
        }
        if (videoLink) videos.push({ title: clipTitle || 'Full Match', url: videoLink, type: 'full' });
        if (highlightsLink) videos.push({ title: (clipTitle ? clipTitle + ' — Highlights' : 'Highlights'), url: highlightsLink, type: 'highlights' });
        if (reportLink) links.push({ title: 'Match Report', url: reportLink, type: 'report' });

        const matchData = {
            matchType: 'player_watch',
            watchedPlayerId,
            competition: getVal('matchCompetition') || 'Player Watch',
            date,
            time: getVal('matchTime'),
            venue: getVal('matchVenue'),
            homeTeam,
            awayTeam,
            opponent: awayTeam,
            ourSide: null,
            squadId: null,
            isPast,
            homeScore: isPast ? parseInt(getVal('matchHomeScore') || 0) : 0,
            awayScore: isPast ? parseInt(getVal('matchAwayScore') || 0) : 0,
            status,
            videos,
            links
        };
        if (reportText) matchData.notes = reportText;

        try {
            const saved = await matchManager.createMatch(matchData);
            if (videos.length > 0) {
                await syncVideosToPlayer(watchedPlayerId, videos, saved.id);
            }
            if (window.showGlobalToast) window.showGlobalToast('Player Watch Match Added!', 'success');
            else alert('Player Watch Match Added!');
            closeAddMatchModal();
            await matchManager.init();
            renderMatches();
        } catch (err) {
            console.error('Failed to save player watch match:', err);
            if (window.showGlobalToast) window.showGlobalToast('Error saving match.', 'error');
        }
        return;
    }

    // --- Team Match branch (existing logic) ---
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
        // If Home wasn't a squad but Away is, set Away as "ours"
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
    if (typeof matchManager !== 'undefined' && matchManager) {
        await matchManager.createMatch(matchData);
        if (window.showGlobalToast) window.showGlobalToast("Match Added Successfully!", "success");
        else alert("Match Added Successfully!");
        closeAddMatchModal();
        await matchManager.init(); // Refresh data from server
        renderMatches();
    } else {
        console.error("Match Manager not found");
        if (window.showGlobalToast) window.showGlobalToast("Error: Match Manager not loaded.", "error");
        else alert("Error: Match Manager not loaded.");
    }
}

window.handleDeleteMatch = async function (id) {
    if (!confirm('Are you sure you want to delete this match? This will also remove all associated reports and analysis.')) return;

    try {
        await matchManager.deleteMatch(id);
        if (window.showGlobalToast) window.showGlobalToast('Match Deleted', 'success');
        renderMatches();
    } catch (error) {
        console.error('Failed to delete match:', error);
        if (window.showGlobalToast) window.showGlobalToast('Failed to delete match', 'error');
    }
};

/**
 * Module-level resolveTeamNames — available to all functions in this file.
 * (renderMatches() has its own inline copy scoped inside that function;
 *  this one serves exportMatchReportPDF and any other module-level callers.)
 */
function resolveTeamNamesGlobal(m) {
    let home = m.homeTeam;
    let away = m.awayTeam;
    if (!home || !away) {
        const squadName = (window.squadManager && squadManager.getSquad(m.squadId))
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
 * Shared PDF builder — produces a fully-structured match analysis PDF.
 * Identical output to the version in match-details-ui.js.
 */
function buildMatchPDF(match, resolveNames) {
    if (!window.jspdf) {
        if (window.showGlobalToast) window.showGlobalToast('PDF library not loaded', 'error');
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

    // ── HEADER BANNER ─────────────────────────────────────────────────────────
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

    // ── SCORELINE CARD ────────────────────────────────────────────────────────
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

    // ── KEY STATISTICS ────────────────────────────────────────────────────────
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

    // ── TACTICAL PHASES ───────────────────────────────────────────────────────
    const tacticalPhases = [
        { title: 'Starting XI — ' + homeName, content: stats.tactical_lineup_home, color: [30, 58, 138] },
        { title: 'Starting XI — ' + awayName, content: stats.tactical_lineup_away, color: [100, 116, 139] },
        { title: 'Timeline / Key Events', content: stats.tactical_timeline, color: [30, 58, 138] },
        { title: 'In Possession (Attacking)', content: stats.tactical_in_possession, color: [16, 185, 129] },
        { title: 'Out of Possession (Defence)', content: stats.tactical_out_possession, color: [239, 68, 68] },
        { title: 'Transitions', content: stats.tactical_transitions, color: [245, 158, 11] },
        { title: 'Set Pieces', content: stats.tactical_set_pieces, color: [99, 102, 241] },
    ];

    const stripHtml = (html) => (html || '')
        .replace(/<li>/gi, '\n• ')
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

    // ── FOOTER (all pages) ────────────────────────────────────────────────────
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

    // ── DOWNLOAD ──────────────────────────────────────────────────────────────
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

    if (window.showGlobalToast) window.showGlobalToast(`PDF Exported: ${filename}`, 'success');
}

/**
 * PDF Export — called from the Print button on match cards in the Matches Hub.
 */
window.exportMatchReportPDF = async function (matchId) {
    if (!matchId) return;
    try {
        const m = await matchManager.getMatch(matchId);
        if (!m) {
            if (window.showGlobalToast) window.showGlobalToast('Match not found', 'error');
            return;
        }
        buildMatchPDF(m, resolveTeamNamesGlobal);
    } catch (err) {
        console.error('Match PDF Export Error:', err);
        if (window.showGlobalToast) window.showGlobalToast('Failed to export PDF', 'error');
    }
};
