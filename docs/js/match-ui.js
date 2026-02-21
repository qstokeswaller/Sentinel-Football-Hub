/**
 * Match Hub UI Logic
 */

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
            // A squad was selected as Home — Away becomes text input for opponent
            awayWrapper.style.display = 'none';
            awayTextWrapper.style.display = 'block';
            // Reset home text wrapper
            homeTextWrapper.style.display = 'none';
            homeWrapper.style.display = 'block';
        } else if (val === '__other__') {
            // Other selected for Home — show text input for home
            homeWrapper.style.display = 'none';
            homeTextWrapper.style.display = 'block';
            // Reset away to dropdown
            awayWrapper.style.display = 'block';
            awayTextWrapper.style.display = 'none';
        } else {
            // Reset both
            homeWrapper.style.display = 'block';
            homeTextWrapper.style.display = 'none';
            awayWrapper.style.display = 'block';
            awayTextWrapper.style.display = 'none';
        }
    } else if (side === 'away') {
        const val = awaySelect.value;
        if (val && val !== '__other__' && val !== '') {
            // A squad was selected as Away — Home becomes text input for opponent
            homeWrapper.style.display = 'none';
            homeTextWrapper.style.display = 'block';
            // Reset away text wrapper
            awayTextWrapper.style.display = 'none';
            awayWrapper.style.display = 'block';
        } else if (val === '__other__') {
            // Other selected for Away — show text input for away
            awayWrapper.style.display = 'none';
            awayTextWrapper.style.display = 'block';
            // Reset home to dropdown
            homeWrapper.style.display = 'block';
            homeTextWrapper.style.display = 'none';
        } else {
            // Reset both
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

    let matches = matchManager.matches;

    // Filter by team
    if (teamId !== 'all') {
        matches = matches.filter(m => m.squadId === teamId);
    }

    // Filter by league
    if (leagueVal !== 'all') {
        matches = matches.filter(m => m.competition === leagueVal);
    }

    // Filter by search term (opponent, homeTeam, awayTeam, venue)
    if (searchTerm) {
        matches = matches.filter(m =>
            (m.opponent && m.opponent.toLowerCase().includes(searchTerm)) ||
            (m.homeTeam && m.homeTeam.toLowerCase().includes(searchTerm)) ||
            (m.awayTeam && m.awayTeam.toLowerCase().includes(searchTerm)) ||
            (m.venue && m.venue.toLowerCase().includes(searchTerm))
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
        const { home: homeName, away: awayName } = resolveTeamNames(m);
        const hScore = m.homeScore || 0;
        const aScore = m.awayScore || 0;

        const res = calculateResult(hScore, aScore, m.ourSide);
        const resultColor = res.color;
        const resText = res.text;

        let centerBadge = '';
        if (isPast) {
            centerBadge = `
                <div style="background: ${resultColor}20; color: var(--navy-dark); padding: 8px 18px; border-radius: 20px; font-weight: 800; border: 1px solid ${resultColor}40; font-size: 1.1rem; min-width: 80px; text-align: center;">
                    ${hScore} - ${aScore}
                </div>`;
        } else {
            centerBadge = `
                <div style="background: #f1f5f9; color: #64748b; padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 700;">
                    VS
                </div>`;
        }

        return `
        <div class="dash-card match-card" data-id="${m.id}" style="margin-bottom: 12px; padding: 0; overflow: hidden; transition: all 0.2s ease;">
            <div class="match-card-header" onclick="toggleMatchVenue('${m.id}')" style="padding: 20px 24px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
                
                <!-- Left: Date & League -->
                <div style="display: flex; flex-direction: column; gap: 4px; min-width: 150px;">
                    <span style="font-weight: 700; color: var(--navy-dark); font-size: 1rem;">
                        <i class="far fa-calendar-alt" style="margin-right: 6px; color: var(--text-medium); opacity: 0.7;"></i> ${m.date}
                    </span>
                    <span style="font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-left: 22px;">
                        ${m.competition || 'Friendly'}
                    </span>
                </div>

                <!-- Center: Teams & Score -->
                <div style="display: flex; align-items: center; justify-content: center; gap: 24px; flex: 1;">
                    <div style="font-weight: 700; font-size: 1.1rem; color: var(--navy-dark); width: 140px; text-align: right;">
                        ${homeName}
                    </div>
                    ${centerBadge}
                    <div style="font-weight: 700; font-size: 1.1rem; color: var(--navy-dark); width: 140px; text-align: left;">
                        ${awayName}
                    </div>
                </div>

                <!-- Center Right: Time (if upcoming) -->
                ${!isPast ? `<div style="font-size: 0.9rem; color: var(--text-medium); font-weight: 600; margin-right: 24px;"><i class="far fa-clock"></i> ${m.time || 'TBA'}</div>` : `<div style="font-weight: 800; color: ${resultColor}; font-size: 0.8rem; margin-right: 24px; letter-spacing: 1px;">${resText}</div>`}

                <!-- Right: Actions -->
                <div class="match-actions" style="display: flex; gap: 8px;" onclick="event.stopPropagation()">
                    <a href="match-details.html?id=${m.id}" class="dash-btn outline sm">
                        <i class="fas fa-file-alt"></i> ${isPast ? 'Report' : 'Details'}
                    </a>
                    <a href="match-analysis.html?id=${m.id}" class="dash-btn outline sm">
                        <i class="fas fa-video"></i> Analysis
                    </a>
                    <button onclick="handleDeleteMatch('${m.id}')" class="dash-btn outline sm danger" style="padding: 0 10px; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);">
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
    const el = document.getElementById(`match - venue - ${id} `);
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
});

/* --- Modal & Form Handling --- */

window.handleAddMatchClick = function () {
    const modal = document.getElementById('createMatchModal');
    if (modal) {
        modal.style.display = 'block';
    }
    switchTab('details');
}

window.closeAddMatchModal = function () {
    const modal = document.getElementById('createMatchModal');
    if (modal) modal.style.display = 'none';
}

window.switchTab = function (tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.getElementById(`tab - btn - ${tabId} `);
    if (targetBtn) targetBtn.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    const targetContent = document.getElementById(`tab - ${tabId} `);
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
