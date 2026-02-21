/**
 * Reports UI Logic
 * Handles Daily Session Reports, Match Reports Repository, Team History, and Player History.
 */

let selectedSession = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Managers
    await Promise.all([
        squadManager.init(),
        matchManager.init()
    ]);

    // Initial population
    loadSessionReports();
    populateFilters();
    setupRating();

    // Attach Listeners
    if (document.getElementById('match-repo-team-filter')) {
        document.getElementById('match-repo-team-filter').addEventListener('change', loadMatchRepository);
    }

    const leagueFilter = document.getElementById('team-report-league-filter');
    if (leagueFilter) {
        leagueFilter.addEventListener('change', onLeagueChange);
    }

    document.getElementById('team-report-squad-filter').addEventListener('change', loadTeamReports);
    document.getElementById('player-report-squad-filter').addEventListener('change', onPlayerSquadChange);
    document.getElementById('player-report-position-filter').addEventListener('change', loadPlayerReports);
    document.getElementById('player-report-search-filter').addEventListener('input', loadPlayerReports);

    // Assessment Modal Listeners
    const btnAssess = document.getElementById('btnAssessTeam');
    if (btnAssess) {
        btnAssess.addEventListener('click', openTeamAssessmentModal);
    }
    const btnSaveAssess = document.getElementById('btnSaveSquadAssessment');
    if (btnSaveAssess) {
        btnSaveAssess.addEventListener('click', saveTeamAssessment);
    }
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        });
    });
});

// --- NAVIGATION ---
function switchMainTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-btn-${tabName}`).classList.add('active');

    document.querySelectorAll('.main-view').forEach(view => view.style.display = 'none');
    document.getElementById(`view-${tabName}`).style.display = 'block';

    if (tabName === 'match-repo') {
        loadMatchRepository();
    }
}

function switchSubTab(subTab) {
    if (subTab === 'new') {
        document.getElementById('session-sub-view-list').style.display = 'none';
        document.getElementById('session-sub-view-new').style.display = 'block';
    } else {
        document.getElementById('session-sub-view-list').style.display = 'block';
        document.getElementById('session-sub-view-new').style.display = 'none';
        loadSessionReports();
    }
}

// --- FILTERS ---
function populateFilters() {
    const matchRepoSelect = document.getElementById('match-repo-team-filter');
    const teamReportSelect = document.getElementById('team-report-squad-filter');
    const leagueFilter = document.getElementById('team-report-league-filter');
    const playerSquadSelect = document.getElementById('player-report-squad-filter');
    const playerPositionSelect = document.getElementById('player-report-position-filter');

    const squads = squadManager.getSquads();
    const players = squadManager.players;

    // Populate Leagues
    if (leagueFilter) {
        const leagues = new Set();
        squads.forEach(s => {
            if (s.leagues && s.leagues.length > 0) {
                s.leagues.forEach(l => leagues.add(l));
            }
        });
        const sortedLeagues = Array.from(leagues).sort();
        leagueFilter.innerHTML = '<option value="all">All Leagues</option>' +
            sortedLeagues.map(l => `<option value="${l}">${l}</option>`).join('');
    }

    // Populate Squads
    const squadOptions = squads.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    if (matchRepoSelect) matchRepoSelect.innerHTML = '<option value="all">All Teams</option>' + squadOptions;
    if (teamReportSelect) teamReportSelect.innerHTML = '<option value="all">All Teams</option>' + squadOptions;
    if (playerSquadSelect) playerSquadSelect.innerHTML = '<option value="">Select Team</option>' + squadOptions;

    // Populate Positions dynamically
    if (playerPositionSelect) {
        const positions = new Set(['GK', 'DEF', 'MID', 'FWD']);
        players.forEach(p => { if (p.position) positions.add(p.position); });
        const posOptions = Array.from(positions).sort().map(pos => `<option value="${pos}">${pos}</option>`).join('');
        playerPositionSelect.innerHTML = '<option value="all">All Positions</option>' + posOptions;
    }
}

function onLeagueChange() {
    const league = document.getElementById('team-report-league-filter').value;
    const squadSelect = document.getElementById('team-report-squad-filter');
    if (!squadSelect) return;

    let squads = squadManager.getSquads();
    if (league !== 'all') {
        squads = squads.filter(s => s.leagues && s.leagues.includes(league));
    }

    squadSelect.innerHTML = '<option value="all">All Teams</option>' +
        squads.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    loadTeamReports();
}

function onPlayerSquadChange() {
    loadPlayerReports();
}

// --- SESSION REPORTS (Formally Daily) ---
async function loadSessionReports() {
    const grid = document.getElementById('report-grid');
    if (!grid) return;
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-light);"><i class="fas fa-circle-notch fa-spin"></i> Loading...</div>';

    try {
        const response = await fetch(`${window.API_BASE_URL}/reports`, { cache: 'no-store' });
        const reports = await response.json();

        const sRes = await fetch(`${window.API_BASE_URL}/sessions`, { cache: 'no-store' });
        const sessions = await sRes.json();

        const sel = document.getElementById('session-select');
        if (sel) {
            sel.innerHTML = '<option value="">-- Select a Session --</option>';
            sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = `${s.title} (${new Date(s.createdAt).toLocaleDateString()})`;
                sel.appendChild(opt);
            });
        }

        if (reports.length === 0) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-light);"><p>No reports found.</p></div>';
            return;
        }

        grid.innerHTML = reports.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)).map(r => {
            const s = sessions.find(sess => sess.id === r.sessionId);
            const title = s ? s.title : 'General Report';
            const dateShort = new Date(r.date || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

            let stars = '';
            for (let i = 1; i <= 5; i++) stars += i <= (r.rating || 0) ? '<i class="fas fa-star" style="color:var(--warning)"></i>' : '<i class="far fa-star"></i>';

            return `
                <div class="dash-card history-item" style="padding: 16px 20px; display: flex; flex-direction: column; gap: 8px; cursor: pointer;" onclick="openDailyReportDetails('${r.id}')">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 700; color: var(--navy-dark); font-size: 1rem;">${title}</span>
                        <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 600; background: var(--primary-light); padding: 4px 10px; border-radius: 999px;">${dateShort}</span>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-medium); line-height: 1.5; height: 3em; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${r.notes || 'No notes provided.'}</div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; padding-top: 8px; border-top: 1px solid var(--border-light);">
                        <div style="font-size: 0.85rem;">${stars}</div>
                        <div style="display: flex; align-items: center; gap: 4px; font-size: 0.8rem; font-weight: 700; color: var(--primary);">
                            <i class="fas fa-users"></i> ${r.attendanceCount || 0}/${r.attendanceTotal || 0}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) { grid.innerHTML = 'Error loading reports.'; }
}

async function openDailyReportDetails(id) {
    const modal = document.getElementById('modalViewDailyReport');
    const content = document.getElementById('viewDailyReportContent');
    if (!modal || !content) return;

    content.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    modal.classList.add('active');

    try {
        const res = await fetch(`${window.API_BASE_URL}/reports/${id}`);
        if (!res.ok) throw new Error('Not found');
        const r = await res.json();

        const sRes = await fetch(`${window.API_BASE_URL}/sessions/${r.sessionId}`);
        const s = sRes.ok ? await sRes.json() : null;

        content.innerHTML = `
            <div style="background: var(--bg-light); padding: 20px; border-radius: 12px; margin-bottom: 24px;">
                <h3 style="margin-top:0; color:var(--primary);">${s ? s.title : 'Daily Session'}</h3>
                <div style="display: flex; gap: 15px; font-size: 0.9rem; opacity: 0.8;">
                    <span><i class="far fa-calendar-alt"></i> ${new Date(r.date).toLocaleDateString()}</span>
                    <span><i class="fas fa-users"></i> ${r.attendanceCount}/${r.attendanceTotal} Attendance</span>
                </div>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
                <div class="dash-card" style="padding: 20px; border-left: 4px solid var(--primary);">
                    <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">Intensity Focus</div>
                    <div style="font-weight: 800; color: var(--navy-dark); font-size: 1.1rem;">${r.intensity || 'Normal'}</div>
                </div>
                <div class="dash-card" style="padding: 20px; border-left: 4px solid var(--warning);">
                    <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">Overall Rating</div>
                    <div style="font-weight: 700; color: var(--warning); font-size: 1.2rem; letter-spacing: 2px;">${'★'.repeat(r.rating || 0)}${'☆'.repeat(5 - (r.rating || 0))}</div>
                </div>
            </div>

            <h4 style="margin-bottom: 12px; color: var(--navy-dark);">Session Focus</h4>
            <div class="dash-card" style="padding: 16px; margin-bottom: 20px; background: white;">
                ${r.focus || 'No specific focus documented.'}
            </div>

            <h4 style="margin-bottom: 12px; color: var(--navy-dark);">Coaching Notes & Observations</h4>
            <div class="dash-card" style="padding: 16px; background: white; white-space: pre-wrap; line-height: 1.6;">
                ${r.notes || 'No general notes.'}
            </div>

            ${r.drillNotes ? `
                <h4 style="margin: 24px 0 12px 0; color: var(--navy-dark);">Drill-Specific Feedback</h4>
                <div class="dash-card" style="padding: 16px; background: #f8fafc;">
                    ${Object.entries(JSON.parse(r.drillNotes || '{}')).map(([drillId, note]) => `
                        <div style="margin-bottom: 12px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 8px;">
                            <div style="font-weight: 700; font-size: 0.85rem; color: var(--primary);">Drill Update</div>
                            <div style="font-size: 0.9rem;">${note}</div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        `;
    } catch (e) {
        content.innerHTML = '<div style="color:red;padding:20px;">Error loading report details.</div>';
    }
}

window.openSessionReportDetails = openDailyReportDetails;

// --- MATCH REPOSITORY (All Matches) ---
function loadMatchRepository() {
    const grid = document.getElementById('match-reports-grid');
    if (!grid) return;

    const teamFilter = document.getElementById('match-repo-team-filter').value;
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-light);"><i class="fas fa-circle-notch fa-spin"></i> Loading repository...</div>';

    let matches = matchManager.getMatches().filter(m => m.isPast);

    if (teamFilter !== 'all') {
        matches = matches.filter(m => m.squadId === teamFilter);
    }

    matches.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (matches.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-light);"><p>No match reports found.</p></div>';
        return;
    }

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

    const isReportCompleted = (m) => {
        if (m.notes && m.notes.trim() !== '') return true;
        const s = m.stats || {};
        return !!(s.tactical_lineup_home || s.tactical_lineup_away || s.tactical_timeline ||
            s.tactical_in_possession || s.tactical_out_possession ||
            s.tactical_transitions || s.tactical_set_pieces);
    };

    grid.innerHTML = matches.map(m => {
        const { home: homeName, away: awayName } = resolveTeamNames(m);
        const hScore = m.homeScore || 0;
        const aScore = m.awayScore || 0;

        const res = calculateResult(hScore, aScore, m.ourSide);
        const resultColor = res.color;
        const resText = res.text;

        const completed = isReportCompleted(m);
        const statusBadge = completed
            ? `<span style="background: #f0fdf4; color: #166534; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 0.75rem; border: 1px solid #16653430;">COMPLETED</span>`
            : `<span style="background: #fff7ed; color: #9a3412; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 0.75rem; border: 1px solid #9a341230;">FILL REPORT</span>`;

        const printBtn = completed
            ? `<button onclick="event.stopPropagation(); window.location.href='match-details.html?id=${m.id}&download=true'" class="dash-btn outline sm" style="padding: 4px 8px; font-size: 0.7rem; height: auto;">
                 <i class="fas fa-print"></i> Print
               </button>`
            : '';

        return `
            <div class="dash-card match-card" style="padding: 20px; cursor: pointer;" onclick="window.location.href='match-details.html?id=${m.id}'">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div style="font-size: 0.75rem; color: var(--text-secondary); display: flex; align-items: center; gap: 8px;">
                        <span>${new Date(m.date).toLocaleDateString()}</span>
                        ${statusBadge}
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-weight: 700; color: ${resultColor}; font-size: 0.75rem;">${resText}</span>
                        ${printBtn}
                    </div>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                    <div style="text-align: center; flex: 1;">
                        <div style="font-weight: 800; font-size: 1.1rem; color: var(--navy-dark);">${homeName}</div>
                    </div>
                    <div style="padding: 5px 15px; background: #f1f5f9; border-radius: 20px; font-weight: 800; font-size: 1.2rem; color: var(--primary);">
                        ${hScore} - ${aScore}
                    </div>
                    <div style="text-align: center; flex: 1;">
                        <div style="font-weight: 800; font-size: 1.1rem; color: var(--navy-dark);">${awayName}</div>
                    </div>
                </div>
                <div style="border-top: 1px solid var(--border-light); padding-top: 12px; font-size: 0.85rem; color: var(--text-medium);">
                    ${m.venue || 'Venue TBD'} • ${m.competition || 'Friendly'}
                </div>
            </div>
        `;
    }).join('');
}

// --- TEAM REPORTS (History) ---
async function loadTeamReports() {
    const squadId = document.getElementById('team-report-squad-filter').value;
    const container = document.getElementById('team-history-timeline');
    if (!container) return;

    if (squadId === 'all') {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-light);"><p>Select a specific team to view report history.</p></div>';
        return;
    }

    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-light);"><i class="fas fa-circle-notch fa-spin"></i> Loading team history...</div>';

    try {
        const matches = (matchManager.matches || []).filter(m => m.squadId === squadId && m.isPast).sort((a, b) => new Date(b.date) - new Date(a.date));
        const assessments = await squadManager.getSquadAssessments(squadId);

        if (matches.length === 0 && assessments.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-light);"><p>No reports found for this team.</p></div>';
            return;
        }

        // Combine and sort by date
        const allItems = [
            ...matches.map(m => ({ ...m, type: 'match' })),
            ...assessments.map(a => ({ ...a, type: 'assessment' }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

        container.innerHTML = allItems.map(item => {
            const d = new Date(item.date);
            const day = d.getDate();
            const month = d.toLocaleDateString(undefined, { month: 'short' });

            if (item.type === 'match') {
                const res = (item.homeScore > item.awayScore) ? 'W' : (item.homeScore < item.awayScore ? 'L' : 'D');
                const badge = res === 'W' ? 'badge-success' : (res === 'L' ? 'badge-danger' : 'badge-secondary');
                return `
                    <div class="history-item" onclick="window.location.href='match-details.html?id=${item.id}'">
                        <div class="history-date">
                            <div class="day">${day}</div>
                            <div class="month">${month}</div>
                        </div>
                        <div class="history-content">
                            <div class="history-title">vs ${item.opponent || (item.ourSide === 'home' ? item.awayTeam : item.homeTeam)}</div>
                            <div class="history-meta">${item.competition} • ${item.venue}</div>
                            <div class="history-tags">
                                <span class="badge ${badge}" style="width: 24px; text-align: center;">${res}</span>
                                <span style="font-weight: 700; color: var(--navy-dark);">${item.homeScore} - ${item.awayScore}</span>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; color: var(--text-light);">
                            <i class="fas fa-chevron-right"></i>
                        </div>
                    </div>
                `;
            } else {
                return `
                    <div class="history-item" onclick="openSquadAssessmentDetails('${item.id}')" style="border-left: 3px solid var(--primary);">
                        <div class="history-date">
                            <div class="day">${day}</div>
                            <div class="month">${month}</div>
                        </div>
                        <div class="history-content">
                            <div class="history-title">${item.context} Assessment</div>
                            <div class="history-meta">Overall Rating: <strong>${item.ratings?.overall || 0}/10</strong></div>
                            <div class="history-tags">
                                <span class="badge badge-primary">Squad Review</span>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; color: var(--primary);">
                            <i class="fas fa-eye"></i>
                        </div>
                    </div>
                `;
            }
        }).join('');
    } catch (e) {
        console.error('Error loading team reports:', e);
        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-light);"><p>Error loading team reports. Please try again.</p></div>';
    }
}

// --- PLAYER REPORTS (History) ---
async function loadPlayerReports(playerId) {
    // If playerId is an event, or not provided, we ignore it.
    // If it's a string (from viewPlayerTimeline), we use it to force a single player view.
    const targetPlayerId = (typeof playerId === 'string') ? playerId : null;

    const squadId = document.getElementById('player-report-squad-filter').value;
    const positionFilter = document.getElementById('player-report-position-filter').value;
    const searchFilter = document.getElementById('player-report-search-filter').value.toLowerCase();
    const container = document.getElementById('player-history-timeline');

    if (!container) return;

    // Find all matching players
    let players = squadManager.players;

    if (targetPlayerId) {
        // Force strings for robust matching
        players = players.filter(p => String(p.id) === String(targetPlayerId));
    } else {
        if (squadId) players = players.filter(p => p.squadId === squadId);
        if (positionFilter !== 'all') players = players.filter(p => p.position === positionFilter);
        if (searchFilter) players = players.filter(p => p.name.toLowerCase().includes(searchFilter));
    }

    if (players.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:80px 40px;color:var(--text-light); border: 2px dashed var(--border-light); border-radius: 16px;">' +
            '<i class="fas fa-search" style="font-size:48px; margin-bottom: 16px; opacity: 0.1;"></i>' +
            '<p style="font-weight: 500;">No players matching your filters.</p></div>';
        return;
    }

    // For now, if more than 1 player matches, show a list to select, or just the first one?
    // The user's request said "The player filter i think should rather be a search filter".
    // Usually this implies selecting from search results.
    // Let's show a grid of matching players if no specific one is targeted?
    // OR just show all their histories combined (unlikely).
    // Let's show a "Matching Players" list if there are multiple.

    if (players.length > 1) {
        container.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px;">
                ${players.map(p => `
                    <div class="dash-card" style="padding: 16px; cursor: pointer; display: flex; align-items: center; gap: 12px;" onclick="viewPlayerTimeline('${p.id}')">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700;">
                            ${p.name.charAt(0)}
                        </div>
                        <div>
                            <div style="font-weight: 700; color: var(--navy-dark);">${p.name}</div>
                            <div style="font-size: 0.8rem; color: var(--text-secondary);">${p.position}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        return;
    }

    // Single player view
    const player = players[0];

    container.innerHTML = `
        <div style="text-align: center; padding: 40px;">
            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i>
            <p>Loading reports...</p>
        </div>
    `;

    let assessments = [];
    let devStructures = [];
    try {
        const response = await fetch(`${window.API_BASE_URL}/players/${player.id}/assessments`);
        if (!response.ok) throw new Error('Failed to fetch assessments');
        assessments = await response.json();
    } catch (error) {
        console.error('Error loading assessments:', error);
    }

    try {
        const dsResponse = await fetch(`${window.API_BASE_URL}/players/${player.id}/dev-structures`);
        if (!dsResponse.ok) throw new Error('Failed to fetch dev structures');
        devStructures = await dsResponse.json();
    } catch (error) {
        console.error('Error loading dev structures:', error);
    }

    // Grouping
    const matchReports = assessments.filter(r => r.matchId && r.matchId.trim() !== '');
    const overallReports = assessments.filter(r => !r.matchId || r.matchId.trim() === '');

    const renderItems = (list) => {
        if (list.length === 0) return '<p style="padding: 24px; text-align: center; color: var(--text-light); font-size: 0.9rem;">No reports found in this category.</p>';
        return list.sort((a, b) => new Date(b.date) - new Date(a.date)).map(r => {
            const d = new Date(r.date);
            const day = d.getDate();
            const month = d.toLocaleString('default', { month: 'short' });

            // Parse feedback from notes if it's JSON
            let feedback = { strength: 'None', comments: 'No comments' };
            try {
                if (r.notes && r.notes.startsWith('{')) {
                    feedback = JSON.parse(r.notes);
                }
            } catch (e) { }

            return `
                <div class="dash-card history-item" onclick="openAssessmentDetails('${r.id}')" style="cursor: pointer; margin-bottom: 12px; border-left: 3px solid var(--primary);">
                    <div class="history-date">
                        <span class="day">${day || '--'}</span>
                        <span class="month">${month || 'VAL'}</span>
                    </div>
                    <div class="history-content">
                        <div style="margin-top: 12px; font-size: 0.9rem; color: var(--text-dark); line-height: 1.5; border-top: 1px dashed var(--border-light); padding-top: 12px;">
                            <strong>Strengths:</strong> ${r.feedback?.strength || 'None'}<br>
                            <strong>Comments:</strong> ${r.feedback?.comments || 'No comments'}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    };

    container.innerHTML = `
        <div style="background: var(--navy-dark); color: white; border-radius: 12px; padding: 20px; margin-bottom: 24px; display: flex; align-items: center; gap: 20px;">
            <div style="width: 60px; height: 60px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 800;">
                ${player.name.charAt(0)}
            </div>
            <div>
                <h3 style="margin: 0; font-size: 1.25rem;">${player.name}</h3>
                <p style="margin: 0; font-size: 0.9rem; opacity: 0.8;">Intelligence & Scouting Reports</p>
            </div>
            <div style="margin-left: auto;">
                <button class="dash-btn primary sm" onclick="window.location.href='player-profile.html?id=${player.id}'">View Full Profile</button>
            </div>
        </div>

        <h3 style="margin: 32px 0 16px 0; font-size: 1.1rem; color: var(--navy-dark); display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-futbol" style="color: var(--blue-accent);"></i> Match Performance Assessments
        </h3>
        <div class="history-list">
            ${renderItems(matchReports)}
        </div>

        <h3 style="margin: 40px 0 16px 0; font-size: 1.1rem; color: var(--navy-dark); display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-clipboard-list" style="color: var(--blue-accent);"></i> Overall Assessments
        </h3>
        <div class="history-list">
            ${renderDevStructureItems(devStructures)}
        </div>
    `;
}

// --- RENDER DEV STRUCTURE ITEMS ---
function renderDevStructureItems(items) {
    if (!items || items.length === 0) {
        return '<p style="padding: 24px; text-align: center; color: var(--text-light); font-size: 0.9rem;">No overall assessments found for this player.</p>';
    }
    return items.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)).map(ds => {
        const d = new Date(ds.date || ds.createdAt);
        const day = d.getDate();
        const month = d.toLocaleString('default', { month: 'short' });

        const structures = ds.structures || {};
        const firstKeys = Object.keys(structures).slice(0, 3);
        const preview = firstKeys.map(k => {
            const rawVal = (structures[k] || '').toString().replace(/<[^>]*>/g, '').substring(0, 50);
            return `<strong>${k}:</strong> ${rawVal}${rawVal.length >= 50 ? '...' : ''}`;
        }).join('<br>');

        return `
            <div class="dash-card history-item" onclick="viewDevStructureDetails('${ds.id}')" style="cursor: pointer; margin-bottom: 12px; border-left: 3px solid var(--green-accent);">
                <div class="history-date">
                    <span class="day">${day || '--'}</span>
                    <span class="month">${month || 'VAL'}</span>
                </div>
                <div class="history-content">
                    <div class="history-title">Overall Assessment</div>
                    <div style="margin-top: 8px; font-size: 0.85rem; color: var(--text-dark); line-height: 1.5;">
                        ${preview || 'No details recorded.'}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// --- VIEW DEV STRUCTURE DETAILS (for Overall Assessments) ---
async function viewDevStructureDetails(id) {
    const modal = document.getElementById('modalViewAssessment');
    const content = document.getElementById('viewPlayerAssessContent');
    if (!modal || !content) return;

    content.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    modal.classList.add('active');

    try {
        const response = await fetch(`${window.API_BASE_URL}/dev-structures/${id}`);
        if (!response.ok) throw new Error('Failed to fetch');
        const ds = await response.json();

        const player = squadManager.players.find(p => String(p.id) === String(ds.playerId));
        document.getElementById('viewPlayerAssessTitle').textContent = `${player ? player.name : 'Player'} - Overall Assessment`;

        const structures = ds.structures || {};
        const structureHtml = Object.entries(structures).map(([key, val]) => {
            return `
                <div style="margin-bottom: 16px;">
                    <h4 style="color: var(--blue-accent); margin: 0 0 8px; font-size: 0.95rem; border-bottom: 1px solid var(--border-light); padding-bottom: 6px;">${key}</h4>
                    <div style="background: #f8fafc; border-radius: 8px; padding: 12px; font-size: 0.9rem; color: var(--text-dark); line-height: 1.6; border: 1px solid var(--border-light);">
                        ${val || 'No data.'}
                    </div>
                </div>
            `;
        }).join('');

        content.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
                <div class="dash-card" style="padding: 20px; border-left: 4px solid var(--green-accent);">
                    <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">Assessment Date</div>
                    <div style="font-weight: 800; color: var(--navy-dark); font-size: 1.1rem;">${new Date(ds.date || ds.createdAt).toLocaleDateString()}</div>
                </div>
                <div class="dash-card" style="padding: 20px; border-left: 4px solid var(--green-accent);">
                    <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">Type</div>
                    <div style="font-weight: 800; color: var(--navy-dark); font-size: 1.1rem;">Overall Assessment</div>
                </div>
            </div>

            <h3 style="margin-bottom: 16px; color: var(--navy-dark); font-size: 1.1rem; border-bottom: 2px solid var(--green-accent); display: inline-block;">Development Structures</h3>
            <div style="margin-bottom: 24px;">
                ${structureHtml || '<p style="color: var(--text-light);">No structures recorded.</p>'}
            </div>
        `;
    } catch (e) {
        content.innerHTML = '<div style="color:red;padding:20px;">Error loading assessment details.</div>';
    }
}
window.viewDevStructureDetails = viewDevStructureDetails;

// Export to window for HTML access
window.viewPlayerTimeline = viewPlayerTimeline;
window.openAssessmentDetails = openAssessmentDetails;
window.openSquadAssessmentDetails = openSquadAssessmentDetails;
window.printReport = printReport;

async function openAssessmentDetails(id) {
    const modal = document.getElementById('modalViewAssessment');
    const content = document.getElementById('viewPlayerAssessContent');
    if (!modal || !content) return;

    content.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    modal.classList.add('active');

    try {
        const response = await fetch(`${window.API_BASE_URL}/assessments/${id}`);
        if (!response.ok) throw new Error('Failed to fetch');
        const r = await response.json();

        // Fetch player name
        const player = squadManager.players.find(p => String(p.id) === String(r.playerId));
        document.getElementById('viewPlayerAssessTitle').textContent = `${player ? player.name : 'Player'} - Performance Report`;

        // Build ratings HTML - handle nested objects properly
        let ratingsHtml = '';
        const categories = {
            tactical: 'Tactical Analysis',
            technical: 'Technical Skills',
            physical: 'Physical Performance',
            psychological: 'Psychological Assessment'
        };

        if (r.ratings) {
            Object.entries(r.ratings).forEach(([key, val]) => {
                if (val && typeof val === 'object') {
                    // Nested object: e.g. tactical: { decisionMaking: 4, ... }
                    const catLabel = categories[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
                    ratingsHtml += `
                        <div style="margin-bottom: 20px;">
                            <h4 style="color: var(--blue-accent); margin: 0 0 12px; font-size: 0.95rem; border-bottom: 1px solid var(--border-light); padding-bottom: 8px;">${catLabel}</h4>
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                ${Object.entries(val).map(([attr, score]) => {
                        const numScore = parseInt(score) || 0;
                        let stars = '';
                        for (let i = 1; i <= 5; i++) {
                            stars += `<i class="${i <= numScore ? 'fas' : 'far'} fa-star" style="color: ${i <= numScore ? '#f59e0b' : '#cbd5e1'}; font-size: 0.85rem; margin-left: 2px;"></i>`;
                        }
                        const label = attr.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
                        return `
                                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; background: var(--bg-light); border-radius: 6px;">
                                            <span style="font-size: 0.85rem; color: var(--text-dark);">${label}</span>
                                            <div>${stars}</div>
                                        </div>
                                    `;
                    }).join('')}
                            </div>
                        </div>
                    `;
                } else {
                    // Flat value: e.g. overall: 4
                    const numVal = parseInt(val) || 0;
                    let stars = '';
                    for (let i = 1; i <= 5; i++) {
                        stars += `<i class="${i <= numVal ? 'fas' : 'far'} fa-star" style="color: ${i <= numVal ? '#f59e0b' : '#cbd5e1'}; font-size: 0.85rem; margin-left: 2px;"></i>`;
                    }
                    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
                    ratingsHtml += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--bg-light); border-radius: 8px; margin-bottom: 8px;">
                            <span style="font-size: 0.9rem; text-transform: capitalize;">${label}</span>
                            <div>${stars}</div>
                        </div>
                    `;
                }
            });
        }

        // Parse notes - handle JSON-encoded feedback
        let notesHtml = r.notes || 'No detailed notes provided.';
        try {
            if (r.notes && r.notes.startsWith('{')) {
                const feedback = JSON.parse(r.notes);
                notesHtml = Object.entries(feedback).map(([k, v]) => {
                    const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
                    return `<p><strong>${label}:</strong> ${v}</p>`;
                }).join('');
            }
        } catch (e) { /* not JSON, use as-is */ }

        content.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
                <div class="dash-card" style="padding: 20px; border-left: 4px solid var(--primary);">
                    <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">Assessment Date</div>
                    <div style="font-weight: 800; color: var(--navy-dark); font-size: 1.1rem;">${new Date(r.date).toLocaleDateString()}</div>
                </div>
                <div class="dash-card" style="padding: 20px; border-left: 4px solid var(--primary);">
                    <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">Review Type</div>
                    <div style="font-weight: 800; color: var(--navy-dark); font-size: 1.1rem;">${r.type || 'Standard'}</div>
                </div>
            </div>

            <h3 style="margin-bottom: 16px; color: var(--navy-dark); font-size: 1.1rem; border-bottom: 2px solid var(--primary); display: inline-block;">Technical & Tactical Ratings</h3>
            <div style="margin-bottom: 24px;">
                ${ratingsHtml || '<p style="color: var(--text-light);">No ratings recorded.</p>'}
            </div>

            <h3 style="margin-bottom: 16px; color: var(--navy-dark); font-size: 1.1rem; border-bottom: 2px solid var(--primary); display: inline-block;">Detailed Observations</h3>
            <div class="dash-card" style="padding: 20px; background: white; line-height: 1.6; color: var(--text-dark);">
                ${notesHtml}
            </div>
        `;
    } catch (e) {
        content.innerHTML = '<div style="color:red;padding:20px;">Error loading report details.</div>';
    }
}

async function openSquadAssessmentDetails(id) {
    const modal = document.getElementById('modalViewSquadAssessment');
    const content = document.getElementById('viewSquadAssessContent');
    if (!modal || !content) return;

    content.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    modal.classList.add('active');

    try {
        const r = await squadManager.getSquadAssessment(id);
        if (!r) throw new Error('Not found');

        content.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
                <div class="dash-card" style="padding: 16px;">
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 4px;">Report Date</div>
                    <div style="font-weight: 700; color: var(--navy-dark);">${new Date(r.date).toLocaleDateString()}</div>
                </div>
                <div class="dash-card" style="padding: 16px;">
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 4px;">Context</div>
                    <div style="font-weight: 700; color: var(--navy-dark);">${r.context || 'General'}</div>
                </div>
            </div>

            <h3 style="margin-bottom: 16px; color: var(--navy-dark); font-size: 1.1rem; border-bottom: 2px solid var(--primary); display: inline-block;">Squad Ratings (1-10)</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px;">
                <div style="background: var(--bg-light); padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.85rem;">Tactical</span>
                    <span style="font-weight: 700; color: var(--primary);">${r.ratings?.tactical || 0}/10</span>
                </div>
                <div style="background: var(--bg-light); padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.85rem;">Physical</span>
                    <span style="font-weight: 700; color: var(--primary);">${r.ratings?.physical || 0}/10</span>
                </div>
                <div style="background: var(--bg-light); padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.85rem;">Mentality</span>
                    <span style="font-weight: 700; color: var(--primary);">${r.ratings?.mentality || 0}/10</span>
                </div>
                <div style="background: var(--bg-light); padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border: 2px solid var(--primary);">
                    <span style="font-size: 0.85rem; font-weight: 700;">Overall</span>
                    <span style="font-weight: 800; color: var(--primary);">${r.ratings?.overall || 0}/10</span>
                </div>
            </div>

            <h3 style="margin-bottom: 12px; color: var(--navy-dark); font-size: 1.05rem;">Strengths</h3>
            <div class="dash-card" style="padding: 16px; margin-bottom: 16px; background: white; border-left: 4px solid var(--green-accent);">
                ${r.feedback?.strengths || 'None recorded.'}
            </div>

            <h3 style="margin-bottom: 12px; color: var(--navy-dark); font-size: 1.05rem;">Areas for Improvement</h3>
            <div class="dash-card" style="padding: 16px; margin-bottom: 16px; background: white; border-left: 4px solid var(--red-accent);">
                ${r.feedback?.improvements || 'None recorded.'}
            </div>

            <h3 style="margin-bottom: 12px; color: var(--navy-dark); font-size: 1.05rem;">Additional Observations</h3>
            <div class="dash-card" style="padding: 16px; background: #f8fafc; font-style: italic;">
                ${r.feedback?.notes || 'No additional notes.'}
            </div>
        `;
    } catch (e) {
        content.innerHTML = '<div style="color:red;padding:20px;">Error loading report details.</div>';
    }
}

function printReport(elementId) {
    const content = document.getElementById(elementId).innerHTML;
    const title = document.querySelector(`#${elementId}`).parentElement.previousElementSibling.querySelector('h2').textContent;

    const printWindow = window.open('', '_blank', 'height=800,width=1000');
    printWindow.document.write('<html><head><title>UP Performance Hub - Report Print</title>');
    printWindow.document.write('<link rel="stylesheet" href="css/style.css">'); // Try to inherit styles
    printWindow.document.write('<style>');
    printWindow.document.write(`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        body { font-family: 'Outfit', sans-serif; padding: 40px; color: #1e293b; background: white; }
        .dash-card { border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; margin-bottom: 20px; }
        h2 { color: #0f172a; margin-top: 0; }
        h3 { color: #334155; margin-top: 30px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 0.8rem; font-weight: 600; }
        @media print { .no-print { display: none; } }
    `);
    printWindow.document.write('</style></head><body>');
    printWindow.document.write('<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:40px; border-bottom:3px solid #0045e6; padding-bottom:20px;">');
    printWindow.document.write('<h1 style="margin:0; color:#0045e6;">UP PERFORMANCE HUB</h1>');
    printWindow.document.write('<div style="text-align:right;"><div style="font-weight:800;">INTELLIGENCE & SCOUTING</div><div style="font-size:0.8rem; opacity:0.7;">Confidential Report</div></div>');
    printWindow.document.write('</div>');
    printWindow.document.write(`<h2>${title}</h2>`);
    printWindow.document.write(content);
    printWindow.document.write('<div style="margin-top:60px; font-size:0.8rem; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:20px; text-align:center;">');
    printWindow.document.write('&copy; ' + new Date().getFullYear() + ' UP Performance Hub. All rights reserved. Generated on ' + new Date().toLocaleString());
    printWindow.document.write('</div>');
    printWindow.document.write('</body></html>');
    printWindow.document.close();

    // Wait for content to load (especially styles) before printing
    setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        // Option window.close() after print if desired
    }, 500);
}

async function viewPlayerTimeline(playerId) {
    if (!playerId) return;

    // Switch to Player Reports tab
    const tabBtn = document.querySelector('[data-tab="player-reports"]');
    if (tabBtn) tabBtn.click();

    // Clear filters that might hide the targeted player
    const searchFilter = document.getElementById('player-report-search-filter');
    const squadFilter = document.getElementById('player-report-squad-filter');
    const posFilter = document.getElementById('player-report-position-filter');

    if (searchFilter) searchFilter.value = '';
    if (squadFilter) squadFilter.value = '';
    if (posFilter) posFilter.value = 'all';

    // Fetch specifically for this player
    loadPlayerReports(playerId);
}

// --- UTILS ---
async function onSessionSelect() {
    const id = document.getElementById('session-select').value;
    const preview = document.getElementById('session-preview');
    if (!id || !preview) { if (preview) preview.classList.remove('visible'); return; }

    try {
        const res = await fetch(`${window.API_BASE_URL}/sessions/${id}`);
        const s = await res.json();
        preview.classList.add('visible');
        document.getElementById('sp-title').textContent = s.title;
        document.getElementById('sp-meta').textContent = `Created: ${new Date(s.createdAt).toLocaleDateString()}`;
        document.getElementById('sp-drills').innerHTML = (s.drills || []).map((d, i) => `<div class="sp-drill-item">${i + 1}. ${d.title}</div>`).join('');

        // Auto-populate Date Conducted if available
        const dateInput = document.getElementById('report-date');
        if (dateInput && s.date) {
            dateInput.value = s.date;
        }

        // Auto-populate Attendance Total from playersCount
        const attTotal = document.getElementById('att-total');
        if (attTotal && s.playersCount) {
            attTotal.value = s.playersCount;
        }
    } catch (e) { console.error(e); }
}

function setupRating() {
    document.querySelectorAll('.star').forEach(star => {
        star.addEventListener('click', function () {
            const val = this.dataset.val;
            const ratVal = document.getElementById('rating-val');
            if (ratVal) ratVal.value = val;
            document.querySelectorAll('.star').forEach(s => {
                s.classList.toggle('active', s.dataset.val <= val);
                s.classList.toggle('fas', s.dataset.val <= val);
                s.classList.toggle('far', s.dataset.val > val);
            });
        });
    });
}

// --- TEAM ASSESSMENTS ---
function openTeamAssessmentModal() {
    const squadId = document.getElementById('team-report-squad-filter').value;
    if (squadId === 'all') {
        alert('Please select a specific team to assess.');
        return;
    }

    // Set default date to today
    const dateInput = document.getElementById('squadAssessDate');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

    document.getElementById('modalSquadAssessment').classList.add('active');
}

async function saveTeamAssessment() {
    const squadId = document.getElementById('team-report-squad-filter').value;
    const btn = document.getElementById('btnSaveSquadAssessment');
    if (!btn || squadId === 'all') return;

    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    const payload = {
        squadId: squadId,
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

    console.log('Saving Team Assessment:', payload);

    try {
        const success = await squadManager.saveSquadAssessment(payload);

        if (success) {
            btn.innerHTML = '<i class="fas fa-check"></i> Saved!';
            btn.style.background = 'var(--green-accent)';

            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.background = '';
                btn.disabled = false;
                document.getElementById('modalSquadAssessment').classList.remove('active');
                showToast('Team Assessment Saved Successfully');
                loadTeamReports(); // Refresh history
            }, 1000);
        } else {
            throw new Error('Persistence failure');
        }
    } catch (e) {
        console.error('SERVER ERROR during team assessment save:', e);
        btn.innerHTML = originalText;
        btn.disabled = false;
        alert('Error saving assessment to database. Please check server logs.');
    }
}

function showToast(msg) {
    if (window.showGlobalToast) {
        window.showGlobalToast(msg, 'success');
        return;
    }
    const t = document.getElementById('dash-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

/**
 * Export Session Report to PDF
 */
async function saveReport() {
    const sessionId = document.getElementById('session-select').value;
    const date = document.getElementById('report-date').value;
    const attendanceCount = document.getElementById('att-count').value;
    const attendanceTotal = document.getElementById('att-total').value;
    const rating = document.getElementById('rating-val').value;
    const notes = document.getElementById('gen-notes').value;

    if (!sessionId) {
        if (window.showGlobalToast) window.showGlobalToast("Please select a session", "error");
        else alert("Please select a session");
        return;
    }

    const reportData = {
        sessionId,
        date,
        attendanceCount: parseInt(attendanceCount) || 0,
        attendanceTotal: parseInt(attendanceTotal) || 0,
        rating: parseInt(rating) || 0,
        notes,
        createdAt: new Date().toISOString()
    };

    try {
        const response = await fetch(`${window.API_BASE_URL}/reports`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reportData)
        });

        if (response.ok) {
            if (window.showGlobalToast) window.showGlobalToast("Session Report Saved Successfully!", "success");
            switchSubTab('list');
            loadSessionReports();
        } else {
            throw new Error('Failed to save report');
        }
    } catch (e) {
        console.error(e);
        if (window.showGlobalToast) window.showGlobalToast("Error saving report", "error");
    }
}
window.saveReport = saveReport;

function exportSessionReportPDF() {
    if (!window.jspdf) {
        showToast('PDF library not loaded');
        return;
    }
    const { jsPDF } = window.jspdf;

    const sessionSelect = document.getElementById('session-select');
    const sessionName = sessionSelect.options[sessionSelect.selectedIndex]?.text || 'Session';
    const reportDate = document.getElementById('report-date').value || 'N/A';
    const attCount = document.getElementById('att-count').value || '—';
    const attTotal = document.getElementById('att-total').value || '—';
    const rating = document.getElementById('rating-val').value || '0';
    const notes = document.getElementById('gen-notes').value || 'No additional notes provided.';

    const doc = new jsPDF();
    const PW = doc.internal.pageSize.getWidth();
    const margin = 20;
    const contentW = PW - (margin * 2);

    // Header
    doc.setFillColor(30, 58, 138); // Navy
    doc.rect(0, 0, PW, 40, 'F');
    doc.setTextColor(255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('SESSION REFLECTION REPORT', margin, 25);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`GENERATED ON: ${new Date().toLocaleDateString()}`, margin, 33);

    // Metadata Section
    let y = 55;
    const drawField = (label, value, xOffset) => {
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(label.toUpperCase(), xOffset, y);
        doc.setFontSize(11);
        doc.setTextColor(40);
        doc.setFont('helvetica', 'bold');
        doc.text(String(value), xOffset, y + 6);
    };

    drawField('Session Name', sessionName, margin);
    drawField('Date Conducted', reportDate, margin + 70);
    drawField('Attendance', `${attCount} / ${attTotal}`, margin + 140);

    y += 20;
    drawField('Success Rating', `${rating} / 5 Stars`, margin);

    y += 20;
    doc.setDrawColor(200);
    doc.line(margin, y, PW - margin, y);

    // Notes Section
    y += 15;
    doc.setFontSize(12);
    doc.setTextColor(30, 58, 138);
    doc.setFont('helvetica', 'bold');
    doc.text('COACH REFLECTIONS & NOTES', margin, y);

    y += 8;
    doc.setFontSize(11);
    doc.setTextColor(60);
    doc.setFont('helvetica', 'normal');
    const splitNotes = doc.splitTextToSize(notes, contentW);
    doc.text(splitNotes, margin, y);

    // Save
    const filename = `Session_Report_${reportDate.replace(/-/g, '')}.pdf`;
    doc.save(filename);
    if (window.showGlobalToast) window.showGlobalToast(`PDF Exported: ${filename}`, 'success');
}

window.exportSessionReportPDF = exportSessionReportPDF;
