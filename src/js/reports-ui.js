/**
 * Reports UI Logic
 * Handles Daily Session Reports, Match Reports Repository, Team History, and Player History.
 */
import supabase from '../supabase.js';
import squadManager from '../managers/squad-manager.js';
import matchManager from '../managers/match-manager.js';
import { showToast } from '../toast.js';

let selectedSession = null;

// In-memory cache of fetched reports and sessions for the modal lookup
const _reportCache = { reports: [], sessions: [] };

export async function initReportsUI() {
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

    // Restore tab from URL param, or default to sessions
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    switchMainTab(urlTab && ['sessions', 'match-repo', 'matches', 'players'].includes(urlTab) ? urlTab : 'sessions');
}

// --- NAVIGATION ---
function switchMainTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-btn-${tabName}`).classList.add('active');

    document.querySelectorAll('.main-view').forEach(view => view.style.display = 'none');
    document.getElementById(`view-${tabName}`).style.display = 'block';

    if (tabName === 'match-repo') {
        loadMatchRepository();
    }

    // Push tab into URL so browser back preserves tab state
    const url = new URL(window.location);
    url.searchParams.set('tab', tabName);
    window.history.replaceState(null, '', url);
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
function getVisibleSquads() {
    const all = squadManager.getSquads();
    const coachIds = window._coachSquadIds;
    if (!coachIds) return all;
    return all.filter(s => coachIds.includes(s.id));
}

function getVisiblePlayers() {
    const all = squadManager.players;
    const coachIds = window._coachSquadIds;
    if (!coachIds) return all;
    return all.filter(p => coachIds.includes(p.squadId));
}

function populateFilters() {
    const matchRepoSelect = document.getElementById('match-repo-team-filter');
    const teamReportSelect = document.getElementById('team-report-squad-filter');
    const leagueFilter = document.getElementById('team-report-league-filter');
    const playerSquadSelect = document.getElementById('player-report-squad-filter');
    const playerPositionSelect = document.getElementById('player-report-position-filter');
    const reportTeamSelect = document.getElementById('report-team-select');

    const squads = getVisibleSquads();
    const players = getVisiblePlayers();

    if (reportTeamSelect) {
        reportTeamSelect.innerHTML = '<option value="">-- No Team / General --</option>' +
            squads.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }

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

    let squads = getVisibleSquads();
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
        const clubId = sessionStorage.getItem('impersonating_club_id') || window._profile?.club_id;
        let rq = supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(500);
        let sq = supabase.from('sessions').select('*').order('created_at', { ascending: false }).limit(1000);
        if (clubId) { rq = rq.eq('club_id', clubId); sq = sq.eq('club_id', clubId); }
        const [{ data: reports, error: rErr }, { data: sessions, error: sErr }] = await Promise.all([rq, sq]);
        if (rErr) throw rErr;
        if (sErr) throw sErr;

        // Coach scoping: filter sessions to only those linked to assigned squads
        const coachIds = window._coachSquadIds;
        let filteredSessions = sessions;
        let filteredReports = reports;
        if (coachIds) {
            const visibleNames = getVisibleSquads().map(s => s.name.toLowerCase());
            filteredSessions = sessions.filter(s => {
                if (!s.team) return false; // no team = not visible to coach
                const teamNames = s.team.split(',').map(t => t.trim().toLowerCase());
                return teamNames.some(t => visibleNames.some(vn => t.includes(vn) || vn.includes(t)));
            });
            const visibleSessionIds = new Set(filteredSessions.map(s => s.id));
            filteredReports = reports.filter(r => !r.session_id || visibleSessionIds.has(r.session_id));
        }

        // Store in cache so modal can use it without re-fetching
        _reportCache.reports = filteredReports;
        _reportCache.sessions = filteredSessions;

        const sel = document.getElementById('session-select');
        if (sel) {
            sel.innerHTML = '<option value="">-- Select a Session --</option>';
            filteredSessions.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at)).forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                const displayDate = s.date ? s.date : new Date(s.created_at).toLocaleDateString();
                opt.textContent = `${s.title} (${displayDate})`;
                sel.appendChild(opt);
            });
        }

        if (filteredReports.length === 0) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-light);"><p>No reports found.</p></div>';
            return;
        }

        const validReports = filteredReports.filter(r => r.id && r.id !== 'null');
        grid.innerHTML = validReports.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at)).map(r => {
            const s = filteredSessions.find(sess => sess.id === r.session_id);
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
                            <i class="fas fa-users"></i> ${r.attendance_count || 0}/${r.attendance_total || 0}
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

    modal.classList.add('active');

    if (!id || id === 'null' || id === 'undefined') {
        content.innerHTML = '<div style="color:orange;padding:20px;">This report has no ID — it may have been saved incorrectly. Please delete and re-save it.</div>';
        return;
    }

    const r = _reportCache.reports.find(rep => rep.id === id);
    if (!r) {
        content.innerHTML = '<div style="color:red;padding:20px;">Report not found in cache. Please refresh the page and try again. refreshed.</div>';
        return;
    }

    const s = _reportCache.sessions.find(sess => sess.id === r.session_id) || null;
    const dateStr = r.date ? new Date(r.date) : (s ? new Date(s.date) : new Date());
    const dateFormatted = isNaN(dateStr) ? 'No date' : dateStr.toLocaleDateString();

    let absentNames = 'None';
    if (r.absent_player_ids && Array.isArray(r.absent_player_ids) && r.absent_player_ids.length > 0) {
        absentNames = r.absent_player_ids.map(pid => {
            const p = squadManager.players.find(player => player.id === pid);
            return p ? p.name : 'Unknown Player';
        }).join(', ');
    }

    // drill_notes is already an object from Supabase
    const drillNotes = (typeof r.drill_notes === 'string') ? JSON.parse(r.drill_notes || '{}') : (r.drill_notes || {});
    const drillNotesEntries = Object.entries(drillNotes);

    content.innerHTML = `
        <div style="background: var(--bg-light); padding: 20px; border-radius: 12px; margin-bottom: 24px;">
            <h3 style="margin-top:0; color:var(--primary);">${s ? s.title : 'General Report'}</h3>
            <div style="display: flex; gap: 15px; font-size: 0.9rem; opacity: 0.8;">
                <span><i class="far fa-calendar-alt"></i> ${dateFormatted}</span>
                <span><i class="fas fa-users"></i> ${r.attendance_count || 0}/${r.attendance_total || 0} Attendance</span>
            </div>
            ${r.absent_player_ids && r.absent_player_ids.length > 0 ? `
            <div style="margin-top:10px; font-size: 0.85rem; color: #e53e3e; font-weight: 600;">
                <i class="fas fa-user-times"></i> Absent: ${absentNames}
            </div>` : ''}
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

        ${r.absent_player_ids && r.absent_player_ids.length > 0 ? `
            <h4 style="margin-bottom: 12px; color: var(--navy-dark);">Absent Players (${r.absent_player_ids.length})</h4>
            <div class="dash-card" style="padding: 12px; margin-bottom: 20px; background: #fff1f2; border: 1px solid #fecaca;">
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    ${r.absent_player_ids.map(pid => {
        const p = squadManager.getPlayer(pid);
        return `<span style="background: white; padding: 4px 10px; border-radius: 999px; font-size: 0.8rem; border: 1px solid #fecaca; color: #b91c1c;">${p ? p.name : 'Unknown Player'}</span>`;
    }).join('')}
                </div>
            </div>
        ` : ''}

        <h4 style="margin-bottom: 12px; color: var(--navy-dark);">Session Focus</h4>
        <div class="dash-card" style="padding: 16px; margin-bottom: 20px; background: white;">
            ${r.focus || 'No specific focus documented.'}
        </div>

        <h4 style="margin-bottom: 12px; color: var(--navy-dark);">Coaching Notes & Observations</h4>
        <div class="dash-card" style="padding: 16px; background: white; white-space: pre-wrap; line-height: 1.6;">
            ${r.notes || 'No general notes.'}
        </div>

        ${drillNotesEntries.length > 0 ? `
            <h4 style="margin: 24px 0 12px 0; color: var(--navy-dark);">Drill-Specific Feedback</h4>
            <div class="dash-card" style="padding: 16px; background: #f8fafc;">
                ${drillNotesEntries.map(([drillId, note]) => `
                    <div style="margin-bottom: 12px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 8px;">
                        <div style="font-weight: 700; font-size: 0.85rem; color: var(--primary);">Drill Update</div>
                        <div style="font-size: 0.9rem;">${note}</div>
                    </div>
                `).join('')}
            </div>
        ` : ''}
    `;
}

window.openSessionReportDetails = openDailyReportDetails;

// --- MATCH REPOSITORY (All Matches) ---
function loadMatchRepository() {
    const grid = document.getElementById('match-reports-grid');
    if (!grid) return;

    const teamFilter = document.getElementById('match-repo-team-filter').value;
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-light);"><i class="fas fa-circle-notch fa-spin"></i> Loading repository...</div>';

    let matches = matchManager.getMatches().filter(m => m.isPast);

    // Coach scoping: restrict to assigned squads
    if (teamFilter !== 'all') {
        matches = matches.filter(m => m.squadId === teamFilter);
    } else if (window._coachSquadIds) {
        matches = matches.filter(m => window._coachSquadIds.includes(m.squadId));
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
        if (m.notes && m.notes.trim() !== '' && m.notes !== 'No notes provided.') return true;
        const s = m.stats || {};
        return !!(s.tactical_lineup_home || s.tactical_lineup_away || s.tactical_timeline ||
            s.tactical_in_possession || s.tactical_out_possession ||
            s.tactical_transitions || s.tactical_set_pieces || s.tactical_lineup);
    };

    grid.innerHTML = matches.map(m => {
        const { home: homeName, away: awayName } = resolveTeamNames(m);
        const hScore = m.homeScore || 0;
        const aScore = m.awayScore || 0;

        const res = calculateResult(hScore, aScore, m.ourSide);
        const resultColor = res.color;
        const resText = res.text;
        const resultClass = resText.toLowerCase();

        const completed = isReportCompleted(m);
        const statusBadge = completed
            ? `<span style="background: #f0fdf4; color: #166534; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 0.75rem; border: 1px solid #16653430;">COMPLETED</span>`
            : `<span style="background: #fff7ed; color: #9a3412; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 0.75rem; border: 1px solid #9a341230;">FILL REPORT</span>`;

        const printBtn = completed
            ? `<button onclick="event.stopPropagation(); exportMatchReportPDF('${m.id}')" class="dash-btn outline sm" style="padding: 4px 8px; font-size: 0.7rem; height: auto;">
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
                    <div class="match-score-badge past ${resultClass}">
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
        const assessments = await squadManager.getSquadAssessments(squadId);

        if (assessments.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-light);"><p>No team assessments found for this squad.</p></div>';
            return;
        }

        // Sort by date descending
        const sortedAssessments = assessments.sort((a, b) => new Date(b.date) - new Date(a.date));

        container.innerHTML = sortedAssessments.map(item => {
            const d = new Date(item.date);
            const day = d.getDate();
            const month = d.toLocaleDateString(undefined, { month: 'short' });

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

    // Find all matching players (coach-scoped)
    let players = window._coachSquadIds
        ? squadManager.players.filter(p => window._coachSquadIds.includes(p.squadId))
        : squadManager.players;

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
        assessments = await squadManager.getAssessments(player.id);
    } catch (error) {
        console.error('Error loading assessments:', error);
    }

    try {
        devStructures = await squadManager.getDevStructures(player.id);
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

            // Parse feedback from notes if it's JSON (fallback for legacy or LocalStorage paths)
            let feedback = r.feedback || { strength: 'None', comments: 'No comments' };
            try {
                if (r.notes && r.notes.startsWith('{') && !r.feedback) {
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
                            <strong>Strengths:</strong> ${feedback.strength || 'None'}<br>
                            <strong>Comments:</strong> ${feedback.comments || 'No comments'}
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
    return items.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at)).map(ds => {
        const d = new Date(ds.date || ds.created_at);
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
        const { data: ds, error: dsErr } = await supabase.from('dev_structures').select('*').eq('id', id).single();
        if (dsErr) throw dsErr;

        const players = await squadManager.getPlayers();
        const player = players.find(p => p.id == ds.player_id);
        const titleEl = document.getElementById('viewPlayerAssessTitle');
        if (titleEl) titleEl.textContent = `${player ? player.name : 'Player'} - Overall Assessment`;

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
                    <div style="font-weight: 800; color: var(--navy-dark); font-size: 1.1rem;">${new Date(ds.date || ds.created_at).toLocaleDateString()}</div>
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
// window.printReport is assigned below after its definition

async function openAssessmentDetails(id) {
    const modal = document.getElementById('modalViewAssessment');
    const content = document.getElementById('viewPlayerAssessContent');
    if (!modal || !content) return;

    content.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    modal.classList.add('active');

    try {
        const { data: r, error: aErr } = await supabase.from('assessments').select('*').eq('id', id).single();
        if (aErr) throw aErr;

        // Fetch player name
        // Use squadManager.getPlayers() and loose equality
        const players = await squadManager.getPlayers();
        const player = players.find(p => p.id == r.playerId);
        const titleEl = document.getElementById('viewPlayerAssessTitle');
        if (titleEl) titleEl.textContent = `${player ? player.name : 'Player'} - Performance Report`;

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
        const { data: s, error: sesErr } = await supabase.from('sessions').select('*, drills(*)').eq('id', id).single();
        if (sesErr) throw sesErr;

        preview.classList.add('visible');
        const titleEl = document.getElementById('sp-title');
        const metaEl = document.getElementById('sp-meta');
        const drillsEl = document.getElementById('sp-drills');

        if (titleEl) titleEl.textContent = s.title || 'Untitled Session';
        if (metaEl) metaEl.textContent = `Created: ${s.created_at ? new Date(s.created_at).toLocaleDateString() : 'Unknown'}`;
        if (drillsEl) {
            drillsEl.innerHTML = (s.drills || []).length > 0
                ? s.drills.map((d, i) => `<div class="sp-drill-item">${i + 1}. ${d.title}</div>`).join('')
                : '<div style="font-size: 12px; color: var(--text-light); padding: 8px;">No drills in this session.</div>';
        }

        // Auto-populate Date Conducted if available
        const dateInput = document.getElementById('report-date');
        if (dateInput && s.date) {
            // Ensure YYYY-MM-DD for date input. 
            // The input type="date" strictly expects this format.
            const isoDate = s.date.includes('T') ? s.date.split('T')[0] : s.date;
            dateInput.value = isoDate;
        }

        // --- TEAM SYNC ---
        const reportTeamSelect = document.getElementById('report-team-select');
        if (reportTeamSelect && s.team) {
            // Find squad by name since sessions currently store name
            // Case-insensitive and trimmed names for better matching
            const sName = s.team.trim().toLowerCase();
            const squad = squadManager.getSquads().find(sq => sq.name.trim().toLowerCase() === sName);

            if (squad) {
                reportTeamSelect.value = squad.id;
                onReportTeamSelect(); // Trigger player list population
            } else {
                reportTeamSelect.value = "";
                onReportTeamSelect();
            }
        } else if (reportTeamSelect) {
            reportTeamSelect.value = "";
            onReportTeamSelect();
        }

        // Auto-populate Attendance Total from playersCount if not already set by team select
        const attTotal = document.getElementById('att-total');
        if (attTotal && s.players_count && (!reportTeamSelect || !reportTeamSelect.value)) {
            attTotal.value = s.players_count;
            const attCountInput = document.getElementById('att-count');
            if (attCountInput) attCountInput.value = s.playersCount;
        }

        // Pre-populate absences from Training Register if attendance was already recorded
        try {
            const { data: regRecord } = await supabase
                .from('training_attendance')
                .select('absent_player_ids, attendance_count, attendance_total')
                .eq('session_id', id)
                .maybeSingle();

            if (regRecord && regRecord.absent_player_ids) {
                const absentIds = Array.isArray(regRecord.absent_player_ids)
                    ? regRecord.absent_player_ids
                    : (typeof regRecord.absent_player_ids === 'string' ? JSON.parse(regRecord.absent_player_ids) : []);

                if (absentIds.length > 0) {
                    // Wait a tick for chips to render
                    setTimeout(() => {
                        absentIds.forEach(pid => {
                            const chip = document.querySelector(`#absent-players-list .player-chip[data-id="${pid}"]`);
                            if (chip) togglePlayerAbsence(chip);
                        });

                        // Show info banner
                        const absentSection = document.getElementById('absent-players-section');
                        if (absentSection && !document.getElementById('regPreloadBanner')) {
                            absentSection.insertAdjacentHTML('afterbegin',
                                `<div id="regPreloadBanner" style="padding: 8px 14px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; font-size: 0.8rem; color: #1e40af; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                                    <i class="fas fa-info-circle"></i> Attendance loaded from Training Register
                                </div>`
                            );
                        }
                    }, 100);
                }
            }
        } catch (regErr) {
            console.warn('Could not pre-load register attendance:', regErr);
        }

    } catch (e) {
        console.error('Error fetching session preview:', e);
        if (preview) preview.classList.remove('visible');
    }
}

function onReportTeamSelect() {
    const squadId = document.getElementById('report-team-select').value;
    const absentSection = document.getElementById('absent-players-section');
    const absentList = document.getElementById('absent-players-list');
    const absentCountLabel = document.getElementById('absent-count-label');
    const attTotal = document.getElementById('att-total');
    const attCountInput = document.getElementById('att-count');

    if (!absentSection || !absentList) return;

    absentSection.style.display = 'none';
    absentList.innerHTML = '';
    if (absentCountLabel) absentCountLabel.textContent = '0 Absences';

    if (!squadId) return;

    const squad = squadManager.getSquad(squadId);
    if (squad) {
        const players = squadManager.players.filter(p => p.squadId === squadId);

        // Update Attendance Total based on squad size
        if (attTotal) {
            attTotal.value = players.length;
            if (attCountInput) attCountInput.value = players.length;
        }

        if (players.length > 0) {
            absentSection.style.display = 'block';
            players.sort((a, b) => a.name.localeCompare(b.name)).forEach(p => {
                const chip = document.createElement('div');
                chip.className = 'player-chip';
                chip.dataset.id = p.id;
                chip.innerHTML = `<i class="fas fa-user"></i> ${p.name}`;
                chip.onclick = () => togglePlayerAbsence(chip);
                absentList.appendChild(chip);
            });
        }
    }
}

function togglePlayerAbsence(chip) {
    chip.classList.toggle('absent');
    const icon = chip.querySelector('i');
    if (chip.classList.contains('absent')) {
        icon.className = 'fas fa-user-times';
    } else {
        icon.className = 'fas fa-user';
    }

    // Update Attendance Count
    const total = parseInt(document.getElementById('att-total').value) || 0;
    const absentCount = document.querySelectorAll('.player-chip.absent').length;
    const presentCount = Math.max(0, total - absentCount);

    const attCountInput = document.getElementById('att-count');
    if (attCountInput) attCountInput.value = presentCount;

    const label = document.getElementById('absent-count-label');
    if (label) label.textContent = `${absentCount} Absence${absentCount === 1 ? '' : 's'}`;
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

// showToast imported from ../toast.js

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

    if (!sessionId && !date) {
        showToast("Please select a session or date", "error");
        return;
    }

    const absentPlayerIds = Array.from(document.querySelectorAll('.player-chip.absent')).map(c => c.dataset.id);

    const _clubId = sessionStorage.getItem('impersonating_club_id') || window._profile?.club_id;
    if (!_clubId) {
        showToast('Cannot save report — club not identified. Please refresh.', 'error');
        return;
    }

    const reportRow = {
        club_id: _clubId,
        session_id: sessionId || null,
        date,
        attendance_count: parseInt(attendanceCount) || 0,
        attendance_total: parseInt(attendanceTotal) || 0,
        absent_player_ids: absentPlayerIds,
        rating: parseInt(rating) || 0,
        notes
    };

    try {
        const { error } = await supabase.from('reports').insert(reportRow);
        if (error) throw error;

        // Also upsert to training_attendance so the register stays in sync
        if (sessionId) {
            try {
                const squadId = document.getElementById('report-team-select')?.value;
                if (squadId) {
                    const _reportClubId = sessionStorage.getItem('impersonating_club_id') || window._profile?.club_id;
                    if (_reportClubId) {
                        await supabase.from('training_attendance').upsert({
                            club_id: _reportClubId,
                            session_id: sessionId,
                            squad_id: squadId,
                            date: date || new Date().toISOString().split('T')[0],
                            absent_player_ids: absentPlayerIds,
                            attendance_count: parseInt(attendanceCount) || 0,
                            attendance_total: parseInt(attendanceTotal) || 0,
                            notes: '',
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'session_id,squad_id' });
                    }
                }
            } catch (regErr) {
                console.warn('Could not sync attendance to register:', regErr);
            }
        }

        showToast("Session Report Saved Successfully!", "success");
        switchSubTab('list');
        loadSessionReports();
    } catch (e) {
        console.error(e);
        showToast("Error saving report", "error");
    }
}
window.saveReport = saveReport;

/**
 * Shared PDF builder — produces a fully-structured match analysis PDF.
 * Used by both the Match Reports hub (exportMatchReportPDF) and
 * the Match Details page (downloadReportPDF via match-details-ui.js).
 */
function buildMatchPDF(match) {
    if (!window.jspdf) {
        showToast('PDF library not loaded', 'error');
        return;
    }
    const { jsPDF } = window.jspdf;

    // Resolve team names — use stored homeTeam/awayTeam first, fall back to squad lookup
    let homeName = match.homeTeam;
    let awayName = match.awayTeam;
    if (!homeName || !awayName) {
        const squadName = (window.squadManager && squadManager.getSquad(match.squadId))
            ? squadManager.getSquad(match.squadId).name
            : 'Home';
        if (match.ourSide === 'away') {
            homeName = match.opponent || 'Home Team';
            awayName = squadName;
        } else {
            homeName = squadName;
            awayName = match.opponent || 'Away Team';
        }
    }

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

    showToast(`PDF Exported: ${filename}`, 'success');
}

async function exportMatchReportPDF(matchId) {
    if (!matchId) return;
    try {
        const m = await matchManager.getMatch(matchId);
        if (!m) return;
        buildMatchPDF(m);
    } catch (err) {
        console.error('Match Print Error:', err);
        showToast('Failed to export PDF', 'error');
    }
}
window.exportMatchReportPDF = exportMatchReportPDF;

// Keep original printReport for squad/player/session assessment modals.
// These use the browser print window because they contain rich HTML (star ratings,
// nested cards etc.) that jsPDF cannot render natively. The styling below
// ensures the printed output is clean and branded.
window.printReport = function (elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;

    let title = 'Report';
    try {
        const modalHeader = el.closest('.modal-container')?.querySelector('.modal-header-bubble h2');
        if (modalHeader) {
            title = modalHeader.textContent.trim();
        }
    } catch (e) { /* fallback to default */ }

    const printWindow = window.open('', '_blank', 'height=900,width=900');
    if (!printWindow) return;

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>UP Performance Hub — ${title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        *, *::before, *::after { box-sizing: border-box; }
        body {
            font-family: 'Inter', sans-serif;
            padding: 40px 48px;
            color: #1e293b;
            background: white;
            line-height: 1.55;
            font-size: 14px;
        }

        /* ── BRANDED HEADER ── */
        .print-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding-bottom: 20px;
            margin-bottom: 28px;
            border-bottom: 3px solid #1e3a8a;
        }
        .print-header-left h1 {
            margin: 0 0 4px;
            font-size: 1.35rem;
            font-weight: 800;
            color: #1e3a8a;
            letter-spacing: 0.5px;
        }
        .print-header-left p {
            margin: 0;
            font-size: 0.78rem;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .print-header-right {
            text-align: right;
            font-size: 0.78rem;
            color: #64748b;
        }
        .print-header-right strong {
            display: block;
            font-size: 0.85rem;
            font-weight: 700;
            color: #1e3a8a;
        }

        /* ── REPORT TITLE ── */
        .print-title {
            font-size: 1.25rem;
            font-weight: 800;
            color: #0f172a;
            margin: 0 0 24px;
            padding-bottom: 10px;
            border-bottom: 1px solid #e2e8f0;
        }

        /* ── CONTENT ELEMENTS ── */
        .dash-card {
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 16px 20px;
            margin-bottom: 16px;
            background: white;
        }
        h3 {
            font-size: 1rem;
            font-weight: 700;
            color: #1e3a8a;
            margin: 24px 0 10px;
            padding-bottom: 6px;
            border-bottom: 2px solid #e2e8f0;
            display: inline-block;
        }
        h4 {
            font-size: 0.9rem;
            font-weight: 700;
            color: #0045e6;
            margin: 16px 0 6px;
        }
        p { margin: 0 0 10px; }
        strong { font-weight: 700; }

        /* ── RATING STARS ── */
        .fa-star, .far.fa-star, .fas.fa-star {
            font-size: 1rem;
        }

        /* ── GRID LAYOUTS ── */
        [style*="grid"] {
            display: flex !important;
            flex-wrap: wrap;
            gap: 12px;
        }
        [style*="grid"] > * {
            flex: 1 1 180px;
            min-width: 0;
        }

        /* ── FOOTER ── */
        .print-footer {
            margin-top: 48px;
            padding-top: 16px;
            border-top: 1px solid #e2e8f0;
            font-size: 0.75rem;
            color: #94a3b8;
            display: flex;
            justify-content: space-between;
        }

        /* ── HIDE INTERACTIVE ELEMENTS ── */
        button, .btn-close-modal, .modal-footer-bubble { display: none !important; }

        @media print {
            body { padding: 20px 28px; }
            .print-header { margin-bottom: 20px; }
        }
    </style>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body>
    <div class="print-header">
        <div class="print-header-left">
            <h1>UP PERFORMANCE HUB</h1>
            <p>Intelligence &amp; Scouting — Confidential Report</p>
        </div>
        <div class="print-header-right">
            <strong>Generated</strong>
            ${new Date().toLocaleString()}
        </div>
    </div>
    <div class="print-title">${title}</div>
    ${el.innerHTML}
    <div class="print-footer">
        <span>UP Performance Hub &copy; ${new Date().getFullYear()}</span>
        <span>Confidential — Not for Distribution</span>
    </div>
</body>
</html>`);

    printWindow.document.close();
    setTimeout(() => {
        printWindow.focus();
        printWindow.print();
    }, 600);
};

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

    const absentChips = document.querySelectorAll('.player-chip.absent');
    const absentNames = Array.from(absentChips).map(c => c.textContent.trim()).join(', ');

    const doc = new jsPDF();
    const PW = doc.internal.pageSize.getWidth();
    // ... rest of setup ...
    const margin = 20;
    const contentW = PW - (margin * 2);

    // Header ...
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

    if (absentNames) {
        drawField('Absences', absentNames, margin + 70);
    }

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

    try {
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
    } catch (err) {
        console.error('PDF Save failed:', err);
        showToast('Failed to save PDF', 'error');
    }
}

window.exportSessionReportPDF = exportSessionReportPDF;
window.switchMainTab = switchMainTab;
window.switchSubTab = switchSubTab;
window.onSessionSelect = onSessionSelect;
window.onReportTeamSelect = onReportTeamSelect;
window.togglePlayerAbsence = togglePlayerAbsence;
