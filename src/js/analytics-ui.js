/**
 * Analytics UI Logic
 * Tab 1 — Team Analytics: match-based KPIs, form, and history
 * Tab 2 — Player Analytics: performance matrix + attendance tracker
 */
import supabase from '../supabase.js';
import squadManager from '../managers/squad-manager.js';
import matchManager from '../managers/match-manager.js';
import { showToast } from '../toast.js';
import { initAnalyticsLogic } from './analytics-logic.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CLUB SCOPING — ensures queries only return data for the active club
// ═══════════════════════════════════════════════════════════════════════════════

function getActiveClubId() {
    const imp = sessionStorage.getItem('impersonating_club_id');
    if (imp) return imp;
    return squadManager.clubId || matchManager.clubId || null;
}

function scopePlayerQuery(query) {
    const clubId = getActiveClubId();
    if (clubId) return query.eq('club_id', clubId);
    return query;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════════════════════════════════════════════

let playerTabInitialized = false;
let teamAttInitialized = false;

window.switchAnalyticsTab = function (tabName) {
    // Update tab buttons
    document.querySelectorAll('.analytics-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(panel => {
        panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });

    // Show/hide export button (team only)
    const exportBtn = document.getElementById('teamExportBtn');
    if (exportBtn) exportBtn.style.display = tabName === 'team' ? '' : 'none';

    // Lazy-init player tab on first visit
    if (tabName === 'player' && !playerTabInitialized) {
        playerTabInitialized = true;
        initPlayerAnalytics();
    }

    // Push tab into URL so browser back preserves tab state
    const url = new URL(window.location);
    url.searchParams.set('tab', tabName);
    window.history.replaceState(null, '', url);

    if (tabName === 'team' && !teamAttInitialized) {
        teamAttInitialized = true;
        initTeamAttendance();
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1: TEAM ANALYTICS (existing logic)
// ═══════════════════════════════════════════════════════════════════════════════

// Coach scoping: filter squads to only those assigned to the current coach
function getVisibleSquads() {
    const all = squadManager.getSquads();
    const coachIds = window._coachSquadIds;
    if (!coachIds) return all; // admin — see everything
    return all.filter(s => coachIds.includes(s.id));
}

export async function initAnalyticsUI() {
    const squads = getVisibleSquads();
    const archetype = window._profile?.clubs?.settings?.archetype;

    // Private coaching clubs skip team analytics (individual-focused)
    if (archetype === 'private_coaching' || squads.length === 0) {
        document.querySelector('.analytics-tabs').style.display = 'none';
        const teamTab = document.getElementById('tab-team');
        if (teamTab) { teamTab.classList.remove('active'); teamTab.style.display = 'none'; }
        document.getElementById('tab-player').classList.add('active');
        const exportBtn = document.getElementById('teamExportBtn');
        if (exportBtn) exportBtn.style.display = 'none';
        playerTabInitialized = true;
        initPlayerAnalytics();
        return;
    }

    populateTeamFilters();
    calculateAndRenderAnalytics();
    initAnalyticsLogic();

    document.getElementById('filterAgeGroup').addEventListener('change', calculateAndRenderAnalytics);
    document.getElementById('filterCoach').addEventListener('change', calculateAndRenderAnalytics);
    document.getElementById('filterTeam').addEventListener('change', calculateAndRenderAnalytics);

    // Init team attendance on first load (team tab is default active)
    teamAttInitialized = true;
    initTeamAttendance();
}

function populateTeamFilters() {
    const ageSelect = document.getElementById('filterAgeGroup');
    const coachSelect = document.getElementById('filterCoach');
    const teamSelect = document.getElementById('filterTeam');
    const squads = getVisibleSquads();

    const ageGroups = new Set();
    const coaches = new Set();

    squads.forEach(s => {
        if (s.ageGroup) ageGroups.add(s.ageGroup);
        if (s.coaches && s.coaches.length > 0) s.coaches.forEach(c => coaches.add(c));
    });

    ageGroups.forEach(age => {
        const opt = document.createElement('option');
        opt.value = age; opt.textContent = age;
        ageSelect.appendChild(opt);
    });

    coaches.forEach(coach => {
        const opt = document.createElement('option');
        opt.value = coach; opt.textContent = coach;
        coachSelect.appendChild(opt);
    });

    squads.forEach(squad => {
        const opt = document.createElement('option');
        opt.value = squad.id; opt.textContent = squad.name;
        teamSelect.appendChild(opt);
    });
}

function calculateResultObj(match) {
    if (!match.isPast || match.homeScore === undefined || match.homeScore === null || match.homeScore === '') return null;
    const home = parseInt(match.homeScore, 10);
    const away = parseInt(match.awayScore, 10);
    const effectiveSide = match.ourSide || 'home';
    if (home === away) return 'D';
    if (effectiveSide === 'home') return home > away ? 'W' : 'L';
    return away > home ? 'W' : 'L';
}

function resolveTeamNames(m) {
    let home = m.homeTeam;
    let away = m.awayTeam;
    if (!home || !away) {
        const squadName = squadManager.getSquad(m.squadId)?.name || 'UP - Tuks';
        if (m.ourSide === 'away') { home = m.opponent || 'Home Team'; away = squadName; }
        else { home = squadName; away = m.opponent || 'Away Team'; }
    }
    return { home, away };
}

function calculateAndRenderAnalytics() {
    const ageFilter = document.getElementById('filterAgeGroup').value;
    const coachFilter = document.getElementById('filterCoach').value;
    const teamFilter = document.getElementById('filterTeam').value;
    const squads = getVisibleSquads();

    const filteredSquadIds = squads.filter(s => {
        const matchesAge = ageFilter === 'all' || s.ageGroup === ageFilter;
        const matchesCoach = coachFilter === 'all' || (s.coaches && s.coaches.includes(coachFilter));
        const matchesTeam = teamFilter === 'all' || s.id === teamFilter;
        return matchesAge && matchesCoach && matchesTeam;
    }).map(s => s.id);

    const allMatches = matchManager.matches;
    const relevantMatches = allMatches.filter(m => filteredSquadIds.includes(m.squadId));
    const pastMatches = relevantMatches.filter(m => m.isPast && m.homeScore !== undefined && m.homeScore !== null && m.homeScore !== '');

    let totalGoalsScored = 0, totalGoalsConceded = 0;
    let totalPossession = 0, possessionMatchCount = 0;
    let totalXG = 0, totalXGA = 0;

    pastMatches.forEach(m => {
        const homeScore = parseInt(m.homeScore, 10) || 0;
        const awayScore = parseInt(m.awayScore, 10) || 0;
        const effectiveSide = m.ourSide || 'home';

        if (effectiveSide === 'home') { totalGoalsScored += homeScore; totalGoalsConceded += awayScore; }
        else { totalGoalsScored += awayScore; totalGoalsConceded += homeScore; }

        if (m.stats && m.stats.home) {
            const squadStats = (effectiveSide === 'home') ? (m.stats.home || m.stats) : (m.stats.away || m.stats.home || m.stats);
            const oppStats = (effectiveSide === 'home') ? (m.stats.away || {}) : (m.stats.home || m.stats);
            if (squadStats.possession) { totalPossession += parseInt(squadStats.possession, 10); possessionMatchCount++; }
            if (squadStats.xG) totalXG += parseFloat(squadStats.xG);
            if (oppStats.xG) totalXGA += parseFloat(oppStats.xG);
        }
    });

    const matchCount = pastMatches.length;
    const avgScored = matchCount ? (totalGoalsScored / matchCount).toFixed(1) : '0.0';
    const avgConceded = matchCount ? (totalGoalsConceded / matchCount).toFixed(1) : '0.0';
    const avgPossession = possessionMatchCount ? Math.round(totalPossession / possessionMatchCount) : 0;
    const xgDiff = (totalXG - totalXGA).toFixed(1);
    const xgDiffStr = xgDiff > 0 ? '+' + xgDiff : xgDiff;

    document.getElementById('statGoalsScored').innerText = totalGoalsScored;
    document.getElementById('statGoalsScoredAvg').innerText = `${avgScored} per game`;
    document.getElementById('statGoalsConceded').innerText = totalGoalsConceded;
    document.getElementById('statGoalsConcededAvg').innerText = `${avgConceded} per game`;
    document.getElementById('statAvgPossession').innerText = `${avgPossession}%`;
    document.getElementById('statMatchesTrackedPos').innerText = `${possessionMatchCount} matches tracked`;
    document.getElementById('statXgDiff').innerText = xgDiffStr;
    document.getElementById('statXgDetails').innerText = `xG: ${totalXG.toFixed(1)} | xGA: ${totalXGA.toFixed(1)}`;

    // Recent Form (Last 5)
    const sortedPast = [...pastMatches].sort((a, b) => new Date(b.date) - new Date(a.date));
    const recent5 = sortedPast.slice(0, 5);
    const chronologicalForm = [...recent5].reverse();
    const formContainer = document.getElementById('recentFormContainer');
    formContainer.innerHTML = '';

    let wins = 0;
    if (recent5.length === 0) {
        formContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9rem;">No completed matches found.</div>';
        document.getElementById('formWinRate').innerText = 'Win Rate: 0%';
    } else {
        chronologicalForm.forEach(m => {
            const res = calculateResultObj(m);
            if (res === 'W') wins++;
            let color = '#64748b', bg = '#f8fafc';
            if (res === 'W') { color = '#166534'; bg = '#dcfce7'; }
            else if (res === 'L') { color = '#991b1b'; bg = '#fee2e2'; }

            const { home: hName, away: aName } = resolveTeamNames(m);
            const oppName = m.ourSide === 'home' ? aName : hName;

            const bubble = document.createElement('div');
            bubble.style.cssText = `width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.85rem;color:${color};background:${bg};border:1px solid ${color}30;cursor:pointer;`;
            bubble.innerText = res;
            bubble.title = `vs ${oppName} (${m.homeScore}-${m.awayScore})`;
            bubble.onclick = () => window.location.href = `match-details.html?id=${m.id}`;
            formContainer.appendChild(bubble);
        });
        document.getElementById('formWinRate').innerText = `Win Rate: ${Math.round((wins / chronologicalForm.length) * 100)}%`;
    }

    // History Table
    const tableBody = document.getElementById('formHistoryTableBody');
    tableBody.innerHTML = '';
    sortedPast.forEach(m => {
        const res = calculateResultObj(m);
        let badgeClass = 'bg-secondary';
        if (res === 'W') badgeClass = 'bg-success';
        if (res === 'L') badgeClass = 'bg-danger';
        const { home: hName, away: aName } = resolveTeamNames(m);
        const oppName = m.ourSide === 'home' ? aName : hName;

        const tr = document.createElement('tr');
        tr.style.verticalAlign = 'middle';
        tr.innerHTML = `
            <td style="padding:16px 24px;font-weight:500;color:#1e293b;">${m.date}</td>
            <td style="color:#64748b;font-size:0.9rem;">${m.competition || '-'}</td>
            <td style="font-weight:600;color:#1e293b;">${oppName}</td>
            <td style="text-align:center;"><span class="badge ${badgeClass}" style="min-width:28px;">${res}</span></td>
            <td style="text-align:center;font-weight:800;color:#0f172a;font-size:1.1rem;">${m.homeScore} - ${m.awayScore}</td>
            <td style="padding:16px 24px;text-align:right;">
                <a href="match-details.html?id=${m.id}" class="dash-btn outline sm" style="font-size:0.8rem;padding:6px 14px;border-radius:8px;">
                    <i class="fas fa-file-alt"></i> Match Details
                </a>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

// Team PDF export
window.exportAnalyticsReport = function () {
    if (!window.jspdf) {
        showToast('PDF library not loaded', 'error');
        return;
    }
    const { jsPDF } = window.jspdf;
    const goalsScored = document.getElementById('statGoalsScored').innerText;
    const goalsScoredAvg = document.getElementById('statGoalsScoredAvg').innerText;
    const goalsConceded = document.getElementById('statGoalsConceded').innerText;
    const goalsConcededAvg = document.getElementById('statGoalsConcededAvg').innerText;
    const avgPossession = document.getElementById('statAvgPossession').innerText;
    const xgDiff = document.getElementById('statXgDiff').innerText;
    const xgDetails = document.getElementById('statXgDetails').innerText;
    const winRate = document.getElementById('formWinRate').innerText;
    const ageFilter = document.getElementById('filterAgeGroup').value;
    const coachFilter = document.getElementById('filterCoach').value;
    const teamName = document.getElementById('filterTeam').options[document.getElementById('filterTeam').selectedIndex].text;

    const doc = new jsPDF();
    const PW = doc.internal.pageSize.getWidth();
    const margin = 20;
    const contentW = PW - (margin * 2);

    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, PW, 40, 'F');
    doc.setTextColor(255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('PERFORMANCE ANALYTICS REPORT', margin, 25);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`UP PERFORMANCE HUB · ${teamName}`, margin, 33);

    let y = 55;
    doc.setTextColor(30, 58, 138);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(teamName, margin, y);
    y += 7;
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    doc.text(`Age Group: ${ageFilter === 'all' ? 'All' : ageFilter} | Coach: ${coachFilter === 'all' ? 'All' : coachFilter} | ${winRate}`, margin, y);
    y += 15;

    const drawStatBox = (label, value, subtext, x, y, w) => {
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(x, y, w, 30, 3, 3, 'F');
        doc.setTextColor(100);
        doc.setFontSize(8);
        doc.text(label.toUpperCase(), x + 5, y + 8);
        doc.setTextColor(30, 58, 138);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(value, x + 5, y + 18);
        doc.setTextColor(150);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(subtext, x + 5, y + 26);
    };

    drawStatBox('Goals Scored', goalsScored, goalsScoredAvg, margin, y, (contentW / 2) - 5);
    drawStatBox('Goals Conceded', goalsConceded, goalsConcededAvg, margin + (contentW / 2) + 5, y, (contentW / 2) - 5);
    y += 35;
    drawStatBox('Avg Possession', avgPossession, 'Team Average', margin, y, (contentW / 2) - 5);
    drawStatBox('xG Difference', xgDiff, xgDetails, margin + (contentW / 2) + 5, y, (contentW / 2) - 5);
    y += 45;

    doc.setFontSize(14);
    doc.setTextColor(30, 58, 138);
    doc.setFont('helvetica', 'bold');
    doc.text('MATCH HISTORY SUMMARY', margin, y);
    y += 10;

    doc.setFillColor(30, 58, 138);
    doc.rect(margin, y, contentW, 8, 'F');
    doc.setTextColor(255);
    doc.setFontSize(8);
    doc.text('DATE', margin + 2, y + 5);
    doc.text('OPPONENT', margin + 40, y + 5);
    doc.text('RES', margin + 110, y + 5);
    doc.text('SCORE', margin + 130, y + 5);
    y += 12;

    const rows = document.querySelectorAll('#formHistoryTableBody tr');
    rows.forEach(tr => {
        if (y > 270) { doc.addPage(); y = 20; }
        const tds = tr.querySelectorAll('td');
        if (tds.length < 5) return;
        doc.setTextColor(40);
        doc.setFont('helvetica', 'normal');
        doc.text(tds[0].innerText, margin + 2, y);
        doc.text(tds[2].innerText, margin + 40, y);
        doc.text(tds[3].innerText, margin + 110, y);
        doc.text(tds[4].innerText, margin + 130, y);
        y += 8;
        doc.setDrawColor(241, 245, 249);
        doc.line(margin, y - 2, PW - margin, y - 2);
    });

    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Generated on ${new Date().toLocaleString()} | UP Performance Hub`, PW / 2, 285, { align: 'center' });

    const filename = `Performance_Analytics_${teamName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    try {
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`PDF Exported: ${filename}`, 'success');
    } catch (err) {
        console.error('PDF Save failed:', err);
    }
};


// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2: PLAYER ANALYTICS (Performance Matrix + Attendance)
// ═══════════════════════════════════════════════════════════════════════════════

function initPlayerAnalytics() {
    initYearSelectors();
    loadSquadFilter();

    document.getElementById('filterSquad').addEventListener('change', onSquadChange);
    document.getElementById('filterPlayer').addEventListener('change', refreshPlayerAll);
    document.getElementById('filterMonth').addEventListener('change', onAttMonthChange);
    document.getElementById('filterYear').addEventListener('change', refreshAttendance);
    document.getElementById('filterPerfMonth').addEventListener('change', onPerfMonthChange);
    document.getElementById('filterPerfYear').addEventListener('change', refreshPerformanceMatrix);

    // Squad Match Stats Leaderboard
    document.getElementById('squadStatsSortBy').addEventListener('change', () => {
        renderSquadStatsTable(_squadStatsCache);
    });
    refreshSquadStats();
    populateH2HSelects();
}

// ─── Year selectors ──────────────────────────────────────────────────────────

function initYearSelectors() {
    const now = new Date();
    const currentYear = now.getFullYear();

    for (const selId of ['filterYear', 'filterPerfYear']) {
        const sel = document.getElementById(selId);
        for (let y = currentYear; y >= currentYear - 3; y--) {
            const opt = document.createElement('option');
            opt.value = y; opt.textContent = y;
            sel.appendChild(opt);
        }
    }

    document.getElementById('filterMonth').value = now.getMonth() + 1;
    document.getElementById('filterPerfYear').style.display = 'none';
}

// ─── Month filter handlers ──────────────────────────────────────────────────

function onPerfMonthChange() {
    const month = document.getElementById('filterPerfMonth').value;
    document.getElementById('filterPerfYear').style.display = month === 'all' ? 'none' : '';
    refreshPerformanceMatrix();
}

function onAttMonthChange() {
    const month = document.getElementById('filterMonth').value;
    document.getElementById('filterYear').style.display = month === 'all' ? 'none' : '';
    const hdr = document.getElementById('attSessionsHeader');
    if (hdr) hdr.textContent = month === 'all' ? 'Total Sessions' : 'Sessions This Month';
    refreshAttendance();
}

// ─── Squad/Player filters ───────────────────────────────────────────────────

async function loadSquadFilter() {
    try {
        const squads = getVisibleSquads();
        const sel = document.getElementById('filterSquad');
        squads.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id; opt.textContent = s.name;
            sel.appendChild(opt);
        });
    } catch (e) {
        console.warn('Could not load squads for filter:', e);
    }
    // Apply ?squad= deep-link param after squads are populated
    const _urlSquad = new URLSearchParams(window.location.search).get('squad');
    if (_urlSquad) {
        const sel = document.getElementById('filterSquad');
        if (sel && [...sel.options].some(o => o.value === _urlSquad)) {
            sel.value = _urlSquad;
            await loadPlayerFilter(_urlSquad);
            refreshPlayerAll();
            refreshSquadStats();
            return;
        }
    }
    await loadPlayerFilter('all');
    refreshPlayerAll();
}

async function onSquadChange() {
    const squadId = document.getElementById('filterSquad').value;
    await loadPlayerFilter(squadId);
    refreshPlayerAll();
    refreshSquadStats();
    populateH2HSelects();
}

async function loadPlayerFilter(squadId) {
    try {
        let query = scopePlayerQuery(supabase.from('players').select('id, name').order('name').limit(2000));
        if (squadId && squadId !== 'all') {
            query = query.eq('squad_id', squadId);
        } else if (window._coachSquadIds) {
            // Coach viewing "All" — only show players from assigned squads
            query = query.in('squad_id', window._coachSquadIds);
        }
        const { data: players, error } = await query;
        if (error) throw error;

        const sel = document.getElementById('filterPlayer');
        const prev = sel.value;
        sel.innerHTML = '<option value="all">All Players</option>';
        (players || []).forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id; opt.textContent = p.name;
            sel.appendChild(opt);
        });
        if ((players || []).some(p => String(p.id) === String(prev))) sel.value = prev;
    } catch (e) {
        console.warn('Could not load players for filter:', e);
    }
}

function refreshPlayerAll() {
    refreshPerformanceMatrix();
    refreshAttendance();
}

// ─── Performance Matrix ─────────────────────────────────────────────────────

async function refreshPerformanceMatrix() {
    const squadId = document.getElementById('filterSquad').value;
    const playerId = document.getElementById('filterPlayer').value;
    const perfMonth = document.getElementById('filterPerfMonth').value;
    const perfYear = document.getElementById('filterPerfYear').value;

    const tbody = document.getElementById('performanceTableBody');
    const meta = document.getElementById('perfMatrixMeta');
    const mobileCards = document.getElementById('perf-mobile-cards');

    tbody.innerHTML = '<tr><td colspan="7" class="table-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
    mobileCards.innerHTML = '<div style="padding:30px;text-align:center;color:#94a3b8;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    try {
        // 1. Fetch players
        let playerQuery = scopePlayerQuery(supabase.from('players').select('id, name, position, squad_id').limit(2000));
        if (squadId !== 'all') playerQuery = playerQuery.eq('squad_id', squadId);
        if (playerId !== 'all') playerQuery = playerQuery.eq('id', playerId);
        const { data: rawPlayers, error: pErr } = await playerQuery;
        if (pErr) throw pErr;
        if (!rawPlayers || rawPlayers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-empty"><i class="fas fa-users" style="font-size:1.4rem;margin-bottom:8px;display:block;"></i>No players found.</td></tr>';
            mobileCards.innerHTML = '<div style="padding:30px;text-align:center;color:#94a3b8;"><i class="fas fa-users"></i><br>No players found.</div>';
            meta.textContent = '';
            return;
        }

        // 2. Fetch assessments for those players
        const playerIds = rawPlayers.map(p => p.id);
        let assessQuery = supabase.from('assessments').select('*').in('player_id', playerIds).limit(5000);
        if (perfMonth !== 'all') {
            const m = String(perfMonth).padStart(2, '0');
            const datePrefix = `${perfYear}-${m}`;
            assessQuery = assessQuery.like('date', `${datePrefix}%`);
        }
        const { data: assessments, error: aErr } = await assessQuery;
        if (aErr) throw aErr;

        // 2b. Fetch match player stats for those players
        const { data: matchStats, error: msErr } = await supabase
            .from('match_player_stats')
            .select('*')
            .in('player_id', playerIds)
            .eq('appeared', true)
            .limit(5000);
        if (msErr) console.error('Error fetching match player stats:', msErr);

        // Group match stats by player_id
        const matchStatsByPlayer = {};
        (matchStats || []).forEach(ms => {
            if (!matchStatsByPlayer[ms.player_id]) matchStatsByPlayer[ms.player_id] = [];
            matchStatsByPlayer[ms.player_id].push(ms);
        });

        // 3. Group assessments by player_id and compute averages
        const grouped = {};
        (assessments || []).forEach(a => {
            if (!grouped[a.player_id]) grouped[a.player_id] = [];
            grouped[a.player_id].push(a);
        });

        const avgCategory = (cat) => {
            if (!cat || typeof cat !== 'object') return typeof cat === 'number' ? cat : null;
            const vals = Object.values(cat).filter(v => v != null && v > 0);
            return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
        };

        const players = rawPlayers.map(p => {
            const pa = grouped[p.id] || [];
            const count = pa.length;
            let tacticalAvg = null, technicalAvg = null, physicalAvg = null, psychologicalAvg = null;
            if (count > 0) {
                let sumTac = 0, cTac = 0, sumTec = 0, cTec = 0, sumPhy = 0, cPhy = 0, sumPsy = 0, cPsy = 0;
                pa.forEach(a => {
                    let ratings = {};
                    try { ratings = typeof a.ratings === 'string' ? JSON.parse(a.ratings) : (a.ratings || {}); } catch (e) { /* ignore */ }
                    const tac = avgCategory(ratings.tactical);
                    const tec = avgCategory(ratings.technical);
                    const phy = avgCategory(ratings.physical);
                    const psy = avgCategory(ratings.psychological);
                    if (tac != null) { sumTac += tac; cTac++; }
                    if (tec != null) { sumTec += tec; cTec++; }
                    if (phy != null) { sumPhy += phy; cPhy++; }
                    if (psy != null) { sumPsy += psy; cPsy++; }
                });
                tacticalAvg = cTac > 0 ? +(sumTac / cTac).toFixed(1) : null;
                technicalAvg = cTec > 0 ? +(sumTec / cTec).toFixed(1) : null;
                physicalAvg = cPhy > 0 ? +(sumPhy / cPhy).toFixed(1) : null;
                psychologicalAvg = cPsy > 0 ? +(sumPsy / cPsy).toFixed(1) : null;
            }

            // Aggregate match stats
            const pms = matchStatsByPlayer[p.id] || [];
            const apps = pms.length;
            const goals = pms.reduce((s, m) => s + (m.goals || 0), 0);
            const assists = pms.reduce((s, m) => s + (m.assists || 0), 0);
            const yellowCards = pms.reduce((s, m) => s + (m.yellow_cards || 0), 0);
            const redCards = pms.reduce((s, m) => s + (m.red_cards || 0), 0);
            const cleanSheets = pms.filter(m => m.clean_sheet).length;
            const saves = pms.reduce((s, m) => s + (m.saves || 0), 0);

            // Global average: combine pillar-based assessment averages + simple match report ratings
            // Each pillar assessment produces one average per assessment (mean of all 4 pillar means)
            // Each simple match report rating (1-5) is also a data point
            const ratingDataPoints = [];

            // Add per-assessment averages from 4-pillar system
            pa.forEach(a => {
                let ratings = {};
                try { ratings = typeof a.ratings === 'string' ? JSON.parse(a.ratings) : (a.ratings || {}); } catch (e) { /* */ }
                const vals = [avgCategory(ratings.tactical), avgCategory(ratings.technical), avgCategory(ratings.physical), avgCategory(ratings.psychological)].filter(v => v != null);
                if (vals.length > 0) ratingDataPoints.push(vals.reduce((x, y) => x + y, 0) / vals.length);
            });

            // Add simple match report ratings
            pms.forEach(m => {
                if (m.rating != null && m.rating > 0) ratingDataPoints.push(m.rating);
            });

            const globalAvg = ratingDataPoints.length > 0 ? +(ratingDataPoints.reduce((a, b) => a + b, 0) / ratingDataPoints.length).toFixed(1) : null;

            return {
                id: p.id, name: p.name, position: p.position || '-',
                tactical: tacticalAvg, technical: technicalAvg, physical: physicalAvg, psychological: psychologicalAvg,
                globalAvg,
                assessmentCount: count + pms.filter(m => m.rating != null && m.rating > 0).length,
                apps, goals, assists, yellowCards, redCards, cleanSheets, saves
            };
        });

        if (players.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-empty"><i class="fas fa-users" style="font-size:1.4rem;margin-bottom:8px;display:block;"></i>No players found.</td></tr>';
            mobileCards.innerHTML = '<div style="padding:30px;text-align:center;color:#94a3b8;"><i class="fas fa-users"></i><br>No players found.</div>';
            meta.textContent = '';
            return;
        }

        const withData = players.filter(p => p.assessmentCount > 0).length;
        meta.textContent = `${players.length} players \u00b7 ${withData} with data`;

        // Sort by position group when filtering by squad
        const perfSquadId = document.getElementById('filterSquad').value;
        const usePerfGrouping = perfSquadId !== 'all';
        const sortedPlayers = usePerfGrouping ? [...players].sort((a, b) => {
            const aGroup = ANALYTICS_POS_GROUP_ORDER[getAnalyticsPositionGroup(a.position)] ?? 4;
            const bGroup = ANALYTICS_POS_GROUP_ORDER[getAnalyticsPositionGroup(b.position)] ?? 4;
            if (aGroup !== bGroup) return aGroup - bGroup;
            return a.name.localeCompare(b.name);
        }) : players;

        tbody.innerHTML = '';
        let lastPerfPosGroup = null;

        sortedPlayers.forEach(p => {
            // Position group header when filtering by squad
            if (usePerfGrouping) {
                const group = getAnalyticsPositionGroup(p.position);
                if (group !== lastPerfPosGroup) {
                    const label = ANALYTICS_POS_GROUP_LABELS[group] || 'Other';
                    const groupTr = document.createElement('tr');
                    groupTr.innerHTML = `<td colspan="7" style="background:#f8fafc;padding:8px 16px;font-weight:700;font-size:0.75rem;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;"><i class="fas fa-layer-group" style="margin-right:6px;opacity:0.5;"></i>${label}</td>`;
                    tbody.appendChild(groupTr);
                    lastPerfPosGroup = group;
                }
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="player-name-cell">
                        <div class="player-avatar">${initials(p.name)}</div>
                        <span class="player-name-text">${escHtml(p.name)}</span>
                    </div>
                </td>
                <td><span class="position-badge">${escHtml(p.position)}</span></td>
                <td class="center">${p.tactical != null ? `<span style="font-weight:700;color:#6366f1;">${p.tactical.toFixed(1)}</span>` : '<span style="color:#94a3b8;">-</span>'}</td>
                <td class="center">${p.technical != null ? `<span style="font-weight:700;color:#0ea5e9;">${p.technical.toFixed(1)}</span>` : '<span style="color:#94a3b8;">-</span>'}</td>
                <td class="center">${p.physical != null ? `<span style="font-weight:700;color:#10b981;">${p.physical.toFixed(1)}</span>` : '<span style="color:#94a3b8;">-</span>'}</td>
                <td class="center">${p.psychological != null ? `<span style="font-weight:700;color:#f59e0b;">${p.psychological.toFixed(1)}</span>` : '<span style="color:#94a3b8;">-</span>'}</td>
                <td class="center">${p.globalAvg != null
                    ? `<span class="perf-global-avg" data-player-id="${p.id}" style="cursor:pointer;font-weight:700;color:#0f172a;text-decoration:underline dotted;text-underline-offset:3px;" title="Click for detail">${ratingBadge(p.globalAvg)}</span>`
                    : '<span style="color:#94a3b8;">-</span>'}</td>
            `;
            tbody.appendChild(tr);
        });

        // Wire up global avg click → popup
        tbody.querySelectorAll('.perf-global-avg').forEach(el => {
            el.addEventListener('click', () => {
                const pid = el.dataset.playerId;
                const player = sortedPlayers.find(pp => pp.id === pid);
                if (player) showPillarPopup(player);
            });
        });

        mobileCards.innerHTML = sortedPlayers.map(p => buildPerfMobileCard(p)).join('');
    } catch (e) {
        console.error('Failed to load player ratings:', e);
        tbody.innerHTML = '<tr><td colspan="7" class="table-empty" style="color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Failed to load data.</td></tr>';
        mobileCards.innerHTML = '<div style="padding:30px;text-align:center;color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Failed to load data.</div>';
    }
}

function buildPerfMobileCard(p) {
    return `
    <div class="player-bubble-card">
        <div class="player-bubble-header" onclick="toggleBubble(this)">
            <div class="player-avatar">${initials(p.name)}</div>
            <div class="player-bubble-info">
                <span class="player-bubble-name">${escHtml(p.name)}</span>
                <span class="position-badge">${escHtml(p.position)}</span>
            </div>
            <i class="fas fa-chevron-down player-bubble-arrow"></i>
        </div>
        <div class="player-bubble-body">
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-chart-line" style="color:#0f172a;"></i> Global Avg</span>
                ${ratingBadge(p.globalAvg)}
            </div>
            <div style="border-top:1px solid #e2e8f0; margin-top:8px; padding-top:8px;">
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><i class="fas fa-brain" style="color:#6366f1;"></i> Tactical</span>
                    <span style="font-weight:700;color:${p.tactical != null ? '#6366f1' : '#94a3b8'};">${p.tactical != null ? p.tactical.toFixed(1) : '-'}</span>
                </div>
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><i class="fas fa-futbol" style="color:#0ea5e9;"></i> Technical</span>
                    <span style="font-weight:700;color:${p.technical != null ? '#0ea5e9' : '#94a3b8'};">${p.technical != null ? p.technical.toFixed(1) : '-'}</span>
                </div>
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><i class="fas fa-running" style="color:#10b981;"></i> Physical</span>
                    <span style="font-weight:700;color:${p.physical != null ? '#10b981' : '#94a3b8'};">${p.physical != null ? p.physical.toFixed(1) : '-'}</span>
                </div>
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><i class="fas fa-heart" style="color:#f59e0b;"></i> Psychological</span>
                    <span style="font-weight:700;color:${p.psychological != null ? '#f59e0b' : '#94a3b8'};">${p.psychological != null ? p.psychological.toFixed(1) : '-'}</span>
                </div>
            </div>
            <div style="border-top:1px solid #e2e8f0; margin-top:8px; padding-top:8px; font-size:0.75rem; color:#94a3b8; text-align:center;">
                ${p.assessmentCount || 0} assessment${p.assessmentCount !== 1 ? 's' : ''}
            </div>
        </div>
    </div>`;
}

// ─── Pillar Detail Popup ────────────────────────────────────────────────────

function showPillarPopup(player) {
    // Remove existing popup if any
    const existing = document.getElementById('pillarPopupOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pillarPopupOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const pillars = [
        { key: 'tactical', label: 'Tactical', icon: 'fa-brain', color: '#6366f1' },
        { key: 'technical', label: 'Technical', icon: 'fa-futbol', color: '#00C49A' },
        { key: 'physical', label: 'Physical', icon: 'fa-running', color: '#10b981' },
        { key: 'psychological', label: 'Psychological', icon: 'fa-heart', color: '#f59e0b' }
    ];

    const pillarRows = pillars.map(pi => {
        const val = player[pi.key];
        const barWidth = val != null ? Math.round((val / 5) * 100) : 0;
        return `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                <div style="width:130px;font-size:0.85rem;font-weight:600;color:${pi.color};display:flex;align-items:center;gap:6px;">
                    <i class="fas ${pi.icon}"></i> ${pi.label}
                </div>
                <div style="flex:1;height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden;">
                    <div style="width:${barWidth}%;height:100%;background:${pi.color};border-radius:4px;"></div>
                </div>
                <span style="font-weight:700;min-width:35px;text-align:right;color:${val != null ? '#0f172a' : '#94a3b8'};">${val != null ? val.toFixed(1) : '-'}</span>
            </div>`;
    }).join('');

    const popup = document.createElement('div');
    popup.style.cssText = 'background:#fff;border-radius:16px;padding:28px 32px;max-width:420px;width:90%;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);';
    popup.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
            <div>
                <h3 style="margin:0;font-size:1.1rem;color:#0f172a;">${escHtml(player.name)}</h3>
                <span style="font-size:0.8rem;color:#64748b;">${player.assessmentCount || 0} assessments &middot; Global Avg: <b>${player.globalAvg != null ? player.globalAvg.toFixed(1) : '-'}</b>/5</span>
            </div>
            <button onclick="this.closest('#pillarPopupOverlay').remove()" style="background:none;border:none;cursor:pointer;font-size:1.2rem;color:#94a3b8;padding:4px 8px;">&times;</button>
        </div>
        ${pillarRows}
    `;
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
}
window.showPillarPopup = showPillarPopup;

// ─── Squad Match Stats Leaderboard ──────────────────────────────────────────

let _squadStatsCache = [];

async function refreshSquadStats() {
    const squadId = document.getElementById('filterSquad').value;
    const perfYear = document.getElementById('filterPerfYear').value;
    const perfMonth = document.getElementById('filterPerfMonth').value;

    const tbody = document.getElementById('squadStatsTableBody');
    const meta = document.getElementById('squadStatsMeta');
    const mobileCards = document.getElementById('squad-stats-mobile-cards');

    tbody.innerHTML = '<tr><td colspan="14" class="table-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
    mobileCards.innerHTML = '<div style="padding:30px;text-align:center;color:#94a3b8;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    try {
        // 1. Fetch players for squad
        let playerQuery = scopePlayerQuery(supabase.from('players').select('id, name, position, squad_id').limit(2000));
        if (squadId !== 'all') playerQuery = playerQuery.eq('squad_id', squadId);
        const { data: rawPlayers, error: pErr } = await playerQuery;
        if (pErr) throw pErr;

        if (!rawPlayers || rawPlayers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="14" class="table-empty"><i class="fas fa-users" style="font-size:1.4rem;margin-bottom:8px;display:block;"></i>No players found.</td></tr>';
            mobileCards.innerHTML = '<div style="padding:30px;text-align:center;color:#94a3b8;"><i class="fas fa-users"></i><br>No players found.</div>';
            meta.textContent = '';
            _squadStatsCache = [];
            return;
        }

        const playerIds = rawPlayers.map(p => p.id);

        // 2. Fetch ALL match_player_stats for those players (including non-appeared for squad tracking)
        const { data: allStatsRaw, error: msErr } = await supabase
            .from('match_player_stats')
            .select('*')
            .in('player_id', playerIds)
            .limit(10000);
        if (msErr) throw msErr;

        // Separate appeared stats (for performance) and all stats (for squad tracking)
        const allStats = (allStatsRaw || []).filter(s => s.appeared === true);
        const allSquadStats = allStatsRaw || []; // includes "in squad but didn't play"

        // 3. Fetch ALL past matches for total season minutes calculation
        const clubId = getActiveClubId();
        let seasonMatchQuery = supabase.from('matches').select('id, date, home_score, away_score, our_side, is_past').limit(1000);
        if (clubId) seasonMatchQuery = seasonMatchQuery.eq('club_id', clubId);
        seasonMatchQuery = seasonMatchQuery.eq('is_past', true);
        const { data: allSeasonMatches, error: smErr } = await seasonMatchQuery;
        if (smErr) console.error('Error fetching season matches:', smErr);

        // 3b. Fetch matches referenced by stats for date filtering
        let matchIds = [...new Set((allStats || []).map(s => s.match_id))];
        let matchDateMap = {};
        var matchInfoMap = {};
        if (matchIds.length > 0) {
            const { data: matches, error: mErr } = await supabase
                .from('matches')
                .select('id, date, home_score, away_score, our_side')
                .in('id', matchIds);
            if (mErr) console.error('Error fetching matches for dates:', mErr);
            (matches || []).forEach(m => { matchDateMap[m.id] = m.date; matchInfoMap[m.id] = m; });
        }

        // Calculate total season minutes (all past matches × 90)
        const seasonMatches = allSeasonMatches || [];
        const totalSeasonMatches = seasonMatches.length;
        const totalSeasonMinutes = totalSeasonMatches * 90;

        // Build date map for season matches too
        const seasonMatchDateMap = {};
        seasonMatches.forEach(m => { seasonMatchDateMap[m.id] = m.date; });

        // 4. Filter stats by month if not "all"
        let filteredStats = allStats || [];
        let filteredSeasonMatchCount = totalSeasonMatches;
        if (perfMonth !== 'all') {
            const m = String(perfMonth).padStart(2, '0');
            const datePrefix = `${perfYear}-${m}`;
            filteredStats = filteredStats.filter(s => {
                const mDate = matchDateMap[s.match_id];
                return mDate && mDate.startsWith(datePrefix);
            });
            filteredSeasonMatchCount = seasonMatches.filter(m => m.date && m.date.startsWith(datePrefix)).length;
        }
        const filteredSeasonMinutes = filteredSeasonMatchCount * 90;

        // Build filtered squad stats (all records including non-appeared)
        let filteredSquadStats = allSquadStats;
        if (perfMonth !== 'all') {
            const m = String(perfMonth).padStart(2, '0');
            const datePrefix = `${perfYear}-${m}`;
            filteredSquadStats = filteredSquadStats.filter(s => {
                const mDate = matchDateMap[s.match_id] || seasonMatchDateMap[s.match_id];
                return mDate && mDate.startsWith(datePrefix);
            });
        }

        // Group all squad records by player (for "in squad" minute calculation)
        const squadRecordsByPlayer = {};
        filteredSquadStats.forEach(s => {
            if (!squadRecordsByPlayer[s.player_id]) squadRecordsByPlayer[s.player_id] = [];
            squadRecordsByPlayer[s.player_id].push(s);
        });

        // 5. Group by player and aggregate
        const statsByPlayer = {};
        filteredStats.forEach(s => {
            if (!statsByPlayer[s.player_id]) statsByPlayer[s.player_id] = [];
            statsByPlayer[s.player_id].push(s);
        });

        const playerMap = {};
        rawPlayers.forEach(p => { playerMap[p.id] = p; });

        const aggregated = rawPlayers.map(p => {
            const stats = statsByPlayer[p.id] || [];
            const apps = stats.length;
            const starts = stats.filter(s => s.started === true).length;
            const totalMinutes = stats.reduce((sum, s) => sum + (s.minutes_played || 0), 0);
            const minuteEntries = stats.filter(s => (s.minutes_played || 0) > 0);
            const avgMinutes = minuteEntries.length > 0 ? Math.round(totalMinutes / minuteEntries.length) : 0;
            const goals = stats.reduce((sum, s) => sum + (s.goals || 0), 0);
            const assists = stats.reduce((sum, s) => sum + (s.assists || 0), 0);
            const contributions = goals + assists;
            const yellowCards = stats.reduce((sum, s) => sum + (s.yellow_cards || 0), 0);
            const redCards = stats.reduce((sum, s) => sum + (s.red_cards || 0), 0);
            const ratedStats = stats.filter(s => s.rating != null && s.rating > 0);
            const avgRating = ratedStats.length > 0
                ? +(ratedStats.reduce((sum, s) => sum + s.rating, 0) / ratedStats.length).toFixed(1)
                : null;
            const motmCount = stats.filter(s => s.motm === true).length;

            // Per-90 stats
            const per90Goals = totalMinutes > 0 ? +(goals / totalMinutes * 90).toFixed(2) : 0;
            const per90Assists = totalMinutes > 0 ? +(assists / totalMinutes * 90).toFixed(2) : 0;

            // Clean sheets
            const cleanSheets = stats.filter(s => {
                const m = matchInfoMap[s.match_id];
                if (!m) return false;
                const opponentScore = Number((m.our_side === 'away') ? m.home_score : m.away_score);
                return opponentScore === 0 && !isNaN(opponentScore);
            }).length;

            // --- Minutes Analytics ---
            // % of Season = minutes played / total season minutes (all matches)
            const pctOfSeason = filteredSeasonMinutes > 0 ? +(totalMinutes / filteredSeasonMinutes * 100).toFixed(1) : 0;

            // Squad minutes = number of matches where player had ANY record (appeared or not) × 90
            const squadRecords = squadRecordsByPlayer[p.id] || [];
            const matchesInSquad = squadRecords.length;
            const squadMinutes = matchesInSquad * 90;
            const pctOfSquadMinutes = squadMinutes > 0 ? +(totalMinutes / squadMinutes * 100).toFixed(1) : 0;

            const saves = stats.reduce((sum, s) => sum + (s.saves || 0), 0);
            return {
                id: p.id, name: p.name, position: p.position || '-',
                apps, starts, totalMinutes, avgMinutes,
                goals, assists, contributions,
                yellowCards, redCards, avgRating, motmCount,
                per90Goals, per90Assists, cleanSheets, saves,
                seasonMinutes: filteredSeasonMinutes,
                pctOfSeason, squadMinutes, pctOfSquadMinutes
            };
        });

        _squadStatsCache = aggregated;

        const withApps = aggregated.filter(p => p.apps > 0).length;
        meta.textContent = `${aggregated.length} players \u00b7 ${withApps} with appearances`;

        renderSquadStatsTable(aggregated);
    } catch (e) {
        console.error('Failed to load squad match stats:', e);
        tbody.innerHTML = '<tr><td colspan="14" class="table-empty" style="color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Failed to load data.</td></tr>';
        mobileCards.innerHTML = '<div style="padding:30px;text-align:center;color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Failed to load data.</div>';
        _squadStatsCache = [];
    }
}

// Position grouping helpers for analytics tables
const ANALYTICS_POS_GROUP_ORDER = { GK: 0, DEF: 1, MID: 2, FWD: 3, '': 4 };
const ANALYTICS_POS_GROUP_LABELS = { GK: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', FWD: 'Forwards', '': 'Other' };

function getAnalyticsPositionGroup(pos) {
    if (!pos) return '';
    const p = pos.toUpperCase().trim().split(/[,/]/)[0].trim();
    if (p.includes('GK') || p.includes('GOAL')) return 'GK';
    if (['CB', 'LB', 'RB', 'LWB', 'RWB', 'SW'].some(x => p.includes(x)) || p.includes('DEF') || p.includes('BACK')) return 'DEF';
    if (['CM', 'CDM', 'CAM', 'LM', 'RM', 'DM', 'AM'].some(x => p.includes(x)) || p.includes('MID')) return 'MID';
    if (['ST', 'CF', 'LW', 'RW', 'SS'].some(x => p.includes(x)) || p.includes('FWD') || p.includes('WING') || p.includes('STRIKER') || p.includes('FORWARD')) return 'FWD';
    return '';
}

function renderSquadStatsTable(players) {
    const tbody = document.getElementById('squadStatsTableBody');
    const mobileCards = document.getElementById('squad-stats-mobile-cards');
    const sortBy = document.getElementById('squadStatsSortBy').value;
    const squadId = document.getElementById('filterSquad').value;
    const usePositionGrouping = squadId !== 'all';

    // Sort players
    const sorted = [...players].sort((a, b) => {
        // When filtering by squad, group by position first
        if (usePositionGrouping) {
            const aGroup = ANALYTICS_POS_GROUP_ORDER[getAnalyticsPositionGroup(a.position)] ?? 4;
            const bGroup = ANALYTICS_POS_GROUP_ORDER[getAnalyticsPositionGroup(b.position)] ?? 4;
            if (aGroup !== bGroup) return aGroup - bGroup;
        }
        switch (sortBy) {
            case 'motm': return (b.motmCount - a.motmCount) || (b.goals - a.goals);
            case 'goals': return (b.goals - a.goals) || (b.motmCount - a.motmCount);
            case 'assists': return (b.assists - a.assists) || (b.goals - a.goals);
            case 'contributions': return (b.contributions - a.contributions) || (b.goals - a.goals);
            case 'apps': return (b.apps - a.apps) || (b.contributions - a.contributions);
            case 'rating': return ((b.avgRating || 0) - (a.avgRating || 0)) || (b.apps - a.apps);
            case 'minutes': return (b.totalMinutes - a.totalMinutes) || (b.apps - a.apps);
            case 'cleansheets': return (b.cleanSheets - a.cleanSheets) || (b.apps - a.apps);
            default: return (b.motmCount - a.motmCount) || (b.goals - a.goals);
        }
    });

    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="14" class="table-empty"><i class="fas fa-users" style="font-size:1.4rem;margin-bottom:8px;display:block;"></i>No players found.</td></tr>';
        mobileCards.innerHTML = '<div style="padding:30px;text-align:center;color:#94a3b8;"><i class="fas fa-users"></i><br>No players found.</div>';
        return;
    }

    tbody.innerHTML = '';
    let lastPosGroup = null;
    let rank = 0;

    sorted.forEach((p) => {
        const isGK = getAnalyticsPositionGroup(p.position) === 'GK';

        // Position group header when filtering by squad
        if (usePositionGrouping) {
            const group = getAnalyticsPositionGroup(p.position);
            if (group !== lastPosGroup) {
                const label = ANALYTICS_POS_GROUP_LABELS[group] || 'Other';
                const groupTr = document.createElement('tr');
                groupTr.innerHTML = `<td colspan="14" style="background:#f8fafc;padding:8px 16px;font-weight:700;font-size:0.75rem;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;"><i class="fas fa-layer-group" style="margin-right:6px;opacity:0.5;"></i>${label}</td>`;
                tbody.appendChild(groupTr);
                lastPosGroup = group;
            }
        }

        rank++;
        const ratingStr = p.avgRating !== null ? p.avgRating.toFixed(1) : '-';
        const ratingColor = p.avgRating !== null
            ? (p.avgRating >= 8 ? '#10b981' : p.avgRating >= 6 ? '#0ea5e9' : p.avgRating >= 4 ? '#f59e0b' : '#ef4444')
            : '#94a3b8';

        const tr = document.createElement('tr');

        // GK rows: show clean sheets instead of G, A, G+A
        if (isGK) {
            tr.innerHTML = `
                <td class="center" style="font-weight:700;color:#64748b;">${rank}</td>
                <td>
                    <div class="player-name-cell">
                        <div class="player-avatar">${initials(p.name)}</div>
                        <span class="player-name-text">${escHtml(p.name)}</span>
                    </div>
                </td>
                <td><span class="position-badge">${escHtml(p.position)}</span></td>
                <td class="center"><span style="font-weight:700;color:${p.apps > 0 ? '#0f172a' : '#94a3b8'};">${p.apps}</span></td>
                <td class="center"><span style="font-weight:700;color:${p.starts > 0 ? '#0f172a' : '#94a3b8'};">${p.starts}</span></td>
                <td class="center"><span style="font-weight:700;color:${p.totalMinutes > 0 ? '#0f172a' : '#94a3b8'};">${p.totalMinutes} / ${p.seasonMinutes}</span></td>
                <td class="center"><span style="font-weight:700;color:${p.pctOfSeason > 0 ? '#0ea5e9' : '#94a3b8'};">${p.pctOfSeason}%</span></td>
                <td class="center"><span style="font-weight:700;color:${p.pctOfSquadMinutes > 0 ? '#6366f1' : '#94a3b8'};">${p.pctOfSquadMinutes}%</span></td>
                <td class="center" colspan="3" style="text-align:center;">
                    <span style="font-weight:700;color:${p.cleanSheets > 0 ? '#10b981' : '#94a3b8'};"><i class="fas fa-shield-alt" style="margin-right:4px;"></i>${p.cleanSheets} CS</span>
                </td>
                <td class="center"><span style="font-weight:700;color:${p.yellowCards > 0 ? '#facc15' : '#94a3b8'};">${p.yellowCards}</span> / <span style="font-weight:700;color:${p.redCards > 0 ? '#ef4444' : '#94a3b8'};">${p.redCards}</span></td>
                <td class="center"><span style="font-weight:700;color:${ratingColor};">${ratingStr}</span></td>
                <td class="center"><span style="font-weight:800;color:${p.motmCount > 0 ? '#f59e0b' : '#94a3b8'};">${p.motmCount > 0 ? '\u2b50 ' + p.motmCount : '0'}</span></td>
            `;
        } else {
            tr.innerHTML = `
                <td class="center" style="font-weight:700;color:#64748b;">${rank}</td>
                <td>
                    <div class="player-name-cell">
                        <div class="player-avatar">${initials(p.name)}</div>
                        <span class="player-name-text">${escHtml(p.name)}</span>
                    </div>
                </td>
                <td><span class="position-badge">${escHtml(p.position)}</span></td>
                <td class="center"><span style="font-weight:700;color:${p.apps > 0 ? '#0f172a' : '#94a3b8'};">${p.apps}</span></td>
                <td class="center"><span style="font-weight:700;color:${p.starts > 0 ? '#0f172a' : '#94a3b8'};">${p.starts}</span></td>
                <td class="center"><span style="font-weight:700;color:${p.totalMinutes > 0 ? '#0f172a' : '#94a3b8'};">${p.totalMinutes} / ${p.seasonMinutes}</span></td>
                <td class="center"><span style="font-weight:700;color:${p.pctOfSeason > 0 ? '#0ea5e9' : '#94a3b8'};">${p.pctOfSeason}%</span></td>
                <td class="center"><span style="font-weight:700;color:${p.pctOfSquadMinutes > 0 ? '#6366f1' : '#94a3b8'};">${p.pctOfSquadMinutes}%</span></td>
                <td class="center"><span style="font-weight:700;color:${p.goals > 0 ? '#10b981' : '#94a3b8'};">${p.goals}</span></td>
                <td class="center"><span style="font-weight:700;color:${p.assists > 0 ? '#8b5cf6' : '#94a3b8'};">${p.assists}</span></td>
                <td class="center"><span style="font-weight:800;color:${p.contributions > 0 ? '#f97316' : '#94a3b8'};">${p.contributions}</span></td>
                <td class="center"><span style="font-weight:700;color:${p.yellowCards > 0 ? '#facc15' : '#94a3b8'};">${p.yellowCards}</span> / <span style="font-weight:700;color:${p.redCards > 0 ? '#ef4444' : '#94a3b8'};">${p.redCards}</span></td>
                <td class="center"><span style="font-weight:700;color:${ratingColor};">${ratingStr}</span></td>
                <td class="center"><span style="font-weight:800;color:${p.motmCount > 0 ? '#f59e0b' : '#94a3b8'};">${p.motmCount > 0 ? '\u2b50 ' + p.motmCount : '0'}</span></td>
            `;
        }
        tbody.appendChild(tr);
    });

    mobileCards.innerHTML = sorted.map((p, i) => buildSquadStatsMobileCard(p, i + 1)).join('');
}

function buildSquadStatsMobileCard(p, rank) {
    const ratingStr = p.avgRating !== null ? p.avgRating.toFixed(1) : '-';
    const ratingColor = p.avgRating !== null
        ? (p.avgRating >= 8 ? '#10b981' : p.avgRating >= 6 ? '#0ea5e9' : p.avgRating >= 4 ? '#f59e0b' : '#ef4444')
        : '#94a3b8';
    const isGK = getAnalyticsPositionGroup(p.position) === 'GK';

    // GK: show clean sheets instead of goals/assists/G+A
    const attackSection = isGK ? `
            <div style="border-top:1px solid #e2e8f0; margin-top:8px; padding-top:8px;">
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><i class="fas fa-shield-alt" style="color:#10b981;"></i> Clean Sheets</span>
                    <span style="font-weight:700;color:${p.cleanSheets > 0 ? '#10b981' : '#94a3b8'};">${p.cleanSheets}</span>
                </div>
            </div>` : `
            <div style="border-top:1px solid #e2e8f0; margin-top:8px; padding-top:8px;">
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><i class="fas fa-bullseye" style="color:#10b981;"></i> Goals</span>
                    <span style="font-weight:700;color:${p.goals > 0 ? '#10b981' : '#94a3b8'};">${p.goals}</span>
                </div>
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><i class="fas fa-hands-helping" style="color:#8b5cf6;"></i> Assists</span>
                    <span style="font-weight:700;color:${p.assists > 0 ? '#8b5cf6' : '#94a3b8'};">${p.assists}</span>
                </div>
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><i class="fas fa-plus-circle" style="color:#f97316;"></i> G+A</span>
                    <span style="font-weight:800;color:${p.contributions > 0 ? '#f97316' : '#94a3b8'};">${p.contributions}</span>
                </div>
            </div>`;

    return `
    <div class="player-bubble-card">
        <div class="player-bubble-header" onclick="toggleBubble(this)">
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-weight:700;color:#64748b;font-size:0.8rem;min-width:20px;">#${rank}</span>
                <div class="player-avatar">${initials(p.name)}</div>
            </div>
            <div class="player-bubble-info">
                <span class="player-bubble-name">${escHtml(p.name)}</span>
                <span class="position-badge">${escHtml(p.position)}</span>
            </div>
            <i class="fas fa-chevron-down player-bubble-arrow"></i>
        </div>
        <div class="player-bubble-body">
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-futbol" style="color:#0f172a;"></i> Apps / Starts</span>
                <span style="font-weight:700;">${p.apps} / ${p.starts}</span>
            </div>
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-clock" style="color:#64748b;"></i> Minutes / Total</span>
                <span style="font-weight:700;">${p.totalMinutes} / ${p.seasonMinutes}</span>
            </div>
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-percentage" style="color:#0ea5e9;"></i> % Season</span>
                <span style="font-weight:700;color:${p.pctOfSeason > 0 ? '#0ea5e9' : '#94a3b8'};">${p.pctOfSeason}%</span>
            </div>
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-percentage" style="color:#6366f1;"></i> % Squad</span>
                <span style="font-weight:700;color:${p.pctOfSquadMinutes > 0 ? '#6366f1' : '#94a3b8'};">${p.pctOfSquadMinutes}%</span>
            </div>
            ${attackSection}
            <div style="border-top:1px solid #e2e8f0; margin-top:8px; padding-top:8px;">
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><span style="display:inline-block;width:10px;height:14px;background:#facc15;border-radius:2px;vertical-align:middle;"></span> / <span style="display:inline-block;width:10px;height:14px;background:#ef4444;border-radius:2px;vertical-align:middle;"></span> Cards</span>
                    <span><span style="font-weight:700;color:${p.yellowCards > 0 ? '#facc15' : '#94a3b8'};">${p.yellowCards}</span> / <span style="font-weight:700;color:${p.redCards > 0 ? '#ef4444' : '#94a3b8'};">${p.redCards}</span></span>
                </div>
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><i class="fas fa-star" style="color:#0ea5e9;"></i> Rating</span>
                    <span style="font-weight:700;color:${ratingColor};">${ratingStr}</span>
                </div>
                <div class="bubble-stat-row">
                    <span class="bubble-stat-label"><i class="fas fa-trophy" style="color:#f59e0b;"></i> MOTM</span>
                    <span style="font-weight:800;color:${p.motmCount > 0 ? '#f59e0b' : '#94a3b8'};">${p.motmCount > 0 ? '\u2b50 ' + p.motmCount : '0'}</span>
                </div>
            </div>
        </div>
    </div>`;
}

// ─── Attendance Tracker ─────────────────────────────────────────────────────

async function refreshAttendance() {
    const squadId = document.getElementById('filterSquad').value;
    const playerId = document.getElementById('filterPlayer').value;
    const month = document.getElementById('filterMonth').value;
    const year = document.getElementById('filterYear').value;
    const tbody = document.getElementById('attendanceTableBody');
    const mobileCards = document.getElementById('att-mobile-cards');

    tbody.innerHTML = '<tr><td colspan="6" class="table-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
    mobileCards.innerHTML = '<div style="padding:30px;text-align:center;color:#94a3b8;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    try {
        // 1. Fetch reports AND training_attendance, optionally filtered by month/year
        let reportQuery = supabase.from('reports').select('id, session_id, absent_player_ids').limit(2000);
        let attendanceQuery = supabase.from('training_attendance').select('id, session_id, absent_player_ids').limit(2000);
        if (month && month !== 'all') {
            const m = String(month).padStart(2, '0');
            const datePrefix = `${year}-${m}`;
            reportQuery = reportQuery.like('date', `${datePrefix}%`);
            attendanceQuery = attendanceQuery.like('date', `${datePrefix}%`);
        }
        const [{ data: reports, error: rErr }, { data: attendance, error: aErr }] = await Promise.all([reportQuery, attendanceQuery]);
        if (rErr) throw rErr;
        if (aErr) throw aErr;

        // Merge: deduplicate by session_id, prefer training_attendance over reports
        const merged = [];
        const seenSessionIds = new Set();
        (attendance || []).forEach(r => {
            if (r.session_id) seenSessionIds.add(r.session_id);
            merged.push(r);
        });
        (reports || []).forEach(r => {
            if (!r.session_id || !seenSessionIds.has(r.session_id)) {
                merged.push(r);
            }
        });

        // 2. Fetch players
        let playerQuery = scopePlayerQuery(supabase.from('players').select('id, name, position, squad_id').limit(2000));
        if (squadId !== 'all') playerQuery = playerQuery.eq('squad_id', squadId);
        if (playerId !== 'all') playerQuery = playerQuery.eq('id', playerId);
        const { data: rawPlayers, error: pErr } = await playerQuery;
        if (pErr) throw pErr;

        if (!rawPlayers || rawPlayers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-empty"><i class="fas fa-calendar" style="font-size:1.4rem;margin-bottom:8px;display:block;"></i>No players found.</td></tr>';
            mobileCards.innerHTML = '<div style="padding:30px;text-align:center;color:#94a3b8;"><i class="fas fa-calendar"></i><br>No players found.</div>';
            return;
        }

        // 3. Compute attendance per player
        const totalSessions = merged.length;
        const players = rawPlayers.map(p => {
            let missed = 0;
            merged.forEach(r => {
                let absentIds = [];
                try { absentIds = typeof r.absent_player_ids === 'string' ? JSON.parse(r.absent_player_ids) : (r.absent_player_ids || []); } catch (e) { /* ignore */ }
                if (Array.isArray(absentIds) && absentIds.includes(p.id)) missed++;
            });
            const attended = totalSessions - missed;
            const pct = totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : null;
            return { id: p.id, name: p.name, position: p.position || '-', totalSessions, attendedSessions: attended, missedSessions: missed, attendancePct: pct };
        });

        if (players.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-empty"><i class="fas fa-calendar" style="font-size:1.4rem;margin-bottom:8px;display:block;"></i>No players found.</td></tr>';
            mobileCards.innerHTML = '<div style="padding:30px;text-align:center;color:#94a3b8;"><i class="fas fa-calendar"></i><br>No players found.</div>';
            return;
        }

        tbody.innerHTML = '';
        players.forEach(p => {
            const tr = document.createElement('tr');
            const pct = p.attendancePct;
            const pctLabel = pct !== null ? `${pct}%` : '\u2014';
            const barColor = pctColor(pct);

            tr.innerHTML = `
                <td>
                    <div class="player-name-cell">
                        <div class="player-avatar">${initials(p.name)}</div>
                        <span class="player-name-text">${escHtml(p.name)}</span>
                    </div>
                </td>
                <td><span class="position-badge">${escHtml(p.position)}</span></td>
                <td class="center" style="font-weight:600;">${p.totalSessions}</td>
                <td class="center" style="font-weight:600;color:#166534;">${p.attendedSessions}</td>
                <td class="center">${missedBadge(p.missedSessions)}</td>
                <td class="center">
                    ${pct !== null ? `
                        <span class="att-pct-bar">
                            <span class="att-pct-fill att-pct-${barColor}" style="width:${pct}%;"></span>
                        </span>
                        <span style="font-weight:700;color:${pctTextColor(pct)};">${pctLabel}</span>
                    ` : '<span style="color:#94a3b8;">No sessions</span>'}
                </td>
            `;
            tbody.appendChild(tr);
        });

        mobileCards.innerHTML = players.map(p => buildAttMobileCard(p)).join('');
    } catch (e) {
        console.error('Failed to load attendance:', e);
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty" style="color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Failed to load data.</td></tr>';
        mobileCards.innerHTML = '<div style="padding:30px;text-align:center;color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Failed to load data.</div>';
    }
}

function buildAttMobileCard(p) {
    const pct = p.attendancePct;
    const pctLabel = pct !== null ? `${pct}%` : '\u2014';
    const barColor = pctColor(pct);
    const pctHtml = pct !== null
        ? `<div style="display:flex;align-items:center;gap:6px;">
            <span class="att-pct-bar-mobile"><span class="att-pct-fill att-pct-${barColor}" style="width:${pct}%;"></span></span>
            <span style="font-weight:700;color:${pctTextColor(pct)};">${pctLabel}</span>
           </div>`
        : '<span style="color:#94a3b8;font-size:0.82rem;">No sessions</span>';

    return `
    <div class="player-bubble-card">
        <div class="player-bubble-header" onclick="toggleBubble(this)">
            <div class="player-avatar">${initials(p.name)}</div>
            <div class="player-bubble-info">
                <span class="player-bubble-name">${escHtml(p.name)}</span>
                <span class="position-badge">${escHtml(p.position)}</span>
            </div>
            <i class="fas fa-chevron-down player-bubble-arrow"></i>
        </div>
        <div class="player-bubble-body">
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-calendar" style="color:#64748b;"></i> Sessions</span>
                <span style="font-weight:600;">${p.totalSessions}</span>
            </div>
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-check" style="color:#166534;"></i> Attended</span>
                <span style="font-weight:600;color:#166534;">${p.attendedSessions}</span>
            </div>
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-times" style="color:#991b1b;"></i> Missed</span>
                ${missedBadge(p.missedSessions)}
            </div>
            <div class="bubble-stat-row">
                <span class="bubble-stat-label"><i class="fas fa-percent" style="color:#00a882;"></i> Attendance</span>
                ${pctHtml}
            </div>
        </div>
    </div>`;
}

// ─── Bubble toggle ──────────────────────────────────────────────────────────

function toggleBubble(header) {
    const body = header.nextElementSibling;
    const arrow = header.querySelector('.player-bubble-arrow');
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
}
window.toggleBubble = toggleBubble;

// ─── Shared render helpers ──────────────────────────────────────────────────

function ratingBadge(value) {
    if (value === null || value === undefined) {
        return '<span class="rating-badge none">No data</span>';
    }
    const n = parseFloat(value);
    let cls;
    if (n >= 4.5) cls = 'green';
    else if (n >= 3.5) cls = 'blue';
    else if (n >= 2.5) cls = 'amber';
    else cls = 'red';

    return `<span class="rating-badge ${cls}">
        <span class="rating-stars">${buildStars(n)}</span>
        ${n.toFixed(1)}
    </span>`;
}

function buildStars(val) {
    const full = Math.floor(val);
    const half = val - full >= 0.25 && val - full < 0.75 ? 1 : 0;
    const empty = 5 - full - half;
    return '\u2605'.repeat(full) + (half ? '\u00bd' : '') + '\u2606'.repeat(empty);
}

function missedBadge(missed) {
    if (missed === 0) return '<span class="missed-badge none">0</span>';
    if (missed <= 2) return `<span class="missed-badge low">${missed}</span>`;
    return `<span class="missed-badge high">${missed}</span>`;
}

function pctColor(pct) {
    if (pct === null) return 'blue';
    if (pct >= 90) return 'green';
    if (pct >= 75) return 'blue';
    if (pct >= 60) return 'amber';
    return 'red';
}

function pctTextColor(pct) {
    if (pct === null) return '#94a3b8';
    if (pct >= 90) return '#166534';
    if (pct >= 75) return '#00a882';
    if (pct >= 60) return '#92400e';
    return '#991b1b';
}

function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Head-to-Head Comparison ─────────────────────────────────────────────────

async function populateH2HSelects() {
    const squadId = document.getElementById('filterSquad').value;
    let q = scopePlayerQuery(supabase.from('players').select('id, name, position').limit(2000));
    if (squadId !== 'all') q = q.eq('squad_id', squadId);
    const { data: players } = await q;

    const opts = '<option value="">Select player...</option>' +
        (players || []).sort((a, b) => a.name.localeCompare(b.name))
            .map(p => `<option value="${p.id}">${escHtml(p.name)} (${p.position || '-'})</option>`).join('');

    document.getElementById('h2hPlayerA').innerHTML = opts;
    document.getElementById('h2hPlayerB').innerHTML = opts;
}

window.compareHeadToHead = async function() {
    const idA = document.getElementById('h2hPlayerA').value;
    const idB = document.getElementById('h2hPlayerB').value;
    const resultDiv = document.getElementById('h2hResult');
    const emptyDiv = document.getElementById('h2hEmpty');

    if (!idA || !idB || idA === idB) {
        if (resultDiv) resultDiv.style.display = 'none';
        if (emptyDiv) { emptyDiv.style.display = 'block'; emptyDiv.querySelector('p').textContent = idA === idB ? 'Please select two different players.' : 'Select two players above to compare.'; }
        return;
    }

    // Fetch stats for both players in parallel
    const [{ data: statsA }, { data: statsB }, { data: playersData }] = await Promise.all([
        supabase.from('match_player_stats').select('*').eq('player_id', idA).eq('appeared', true).limit(1000),
        supabase.from('match_player_stats').select('*').eq('player_id', idB).eq('appeared', true).limit(1000),
        scopePlayerQuery(supabase.from('players').select('id, name')).in('id', [idA, idB]),
    ]);

    const nameMap = {};
    (playersData || []).forEach(p => { nameMap[p.id] = p.name; });

    const aggregate = (stats) => {
        const s = stats || [];
        const mins = s.reduce((sum, r) => sum + (r.minutes_played || 0), 0);
        return {
            apps: s.length,
            starts: s.filter(r => r.started).length,
            minutes: mins,
            goals: s.reduce((sum, r) => sum + (r.goals || 0), 0),
            assists: s.reduce((sum, r) => sum + (r.assists || 0), 0),
            yellowCards: s.reduce((sum, r) => sum + (r.yellow_cards || 0), 0),
            redCards: s.reduce((sum, r) => sum + (r.red_cards || 0), 0),
            motm: s.filter(r => r.motm).length,
            avgRating: (() => { const rated = s.filter(r => r.rating); return rated.length > 0 ? +(rated.reduce((sum, r) => sum + r.rating, 0) / rated.length).toFixed(1) : 0; })(),
            per90Goals: mins > 0 ? +(s.reduce((sum, r) => sum + (r.goals || 0), 0) / mins * 90).toFixed(2) : 0,
            per90Assists: mins > 0 ? +(s.reduce((sum, r) => sum + (r.assists || 0), 0) / mins * 90).toFixed(2) : 0,
        };
    };

    const a = aggregate(statsA);
    const b = aggregate(statsB);

    const nameA = nameMap[idA] || 'Player A';
    const nameB = nameMap[idB] || 'Player B';

    const stats = [
        { label: 'Appearances', vA: a.apps, vB: b.apps },
        { label: 'Starts', vA: a.starts, vB: b.starts },
        { label: 'Minutes', vA: a.minutes, vB: b.minutes },
        { label: 'Goals', vA: a.goals, vB: b.goals },
        { label: 'Assists', vA: a.assists, vB: b.assists },
        { label: 'G+A', vA: a.goals + a.assists, vB: b.goals + b.assists },
        { label: 'Goals/90', vA: a.per90Goals, vB: b.per90Goals },
        { label: 'Assists/90', vA: a.per90Assists, vB: b.per90Assists },
        { label: 'Avg Rating', vA: a.avgRating, vB: b.avgRating },
        { label: 'MOTM', vA: a.motm, vB: b.motm },
        { label: 'Yellow Cards', vA: a.yellowCards, vB: b.yellowCards },
        { label: 'Red Cards', vA: a.redCards, vB: b.redCards },
    ];

    emptyDiv.style.display = 'none';
    resultDiv.style.display = 'block';

    resultDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 16px; padding: 0 8px;">
            <span style="font-weight: 800; color: #0ea5e9; font-size: 0.95rem;">${escHtml(nameA)}</span>
            <span style="font-weight: 800; color: #f97316; font-size: 0.95rem;">${escHtml(nameB)}</span>
        </div>
        ${stats.map(s => {
            const max = Math.max(s.vA, s.vB, 1);
            const pctA = (s.vA / max * 100).toFixed(0);
            const pctB = (s.vB / max * 100).toFixed(0);
            const winA = s.vA > s.vB;
            const winB = s.vB > s.vA;
            // For cards, lower is better
            const isCardStat = s.label.includes('Card');
            const colorA = isCardStat ? (winA ? '#94a3b8' : winB ? '#10b981' : '#64748b') : (winA ? '#0ea5e9' : '#94a3b8');
            const colorB = isCardStat ? (winB ? '#94a3b8' : winA ? '#10b981' : '#64748b') : (winB ? '#f97316' : '#94a3b8');
            const weightA = (winA && !isCardStat) || (winB && isCardStat) ? '800' : '600';
            const weightB = (winB && !isCardStat) || (winA && isCardStat) ? '800' : '600';

            return `<div style="margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-weight: ${weightA}; color: ${colorA}; font-size: 0.9rem; min-width: 50px;">${s.vA}</span>
                    <span style="font-size: 0.72rem; font-weight: 600; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.3px;">${s.label}</span>
                    <span style="font-weight: ${weightB}; color: ${colorB}; font-size: 0.9rem; min-width: 50px; text-align: right;">${s.vB}</span>
                </div>
                <div style="display: flex; gap: 4px; height: 8px;">
                    <div style="flex: 1; display: flex; justify-content: flex-end;">
                        <div style="width: ${pctA}%; background: ${colorA}; border-radius: 4px 0 0 4px; min-width: 4px; transition: width 0.3s;"></div>
                    </div>
                    <div style="flex: 1;">
                        <div style="width: ${pctB}%; background: ${colorB}; border-radius: 0 4px 4px 0; min-width: 4px; transition: width 0.3s;"></div>
                    </div>
                </div>
            </div>`;
        }).join('')}
    `;
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEAM TRAINING ATTENDANCE (Tuks-style squad model)
// ═══════════════════════════════════════════════════════════════════════════════

let _teamAttPlayerMap = {};

async function initTeamAttendance() {
    const card = document.getElementById('teamAttCard');
    if (!card) return;

    // Don't show team attendance for private coaching clubs (no squads)
    const archetype = window._profile?.clubs?.settings?.archetype;
    if (archetype === 'private_coaching') { card.style.display = 'none'; return; }

    // Populate squad selector with visible squads
    const squads = getVisibleSquads();
    const squadSel = document.getElementById('teamAttSquad');
    const yearSel = document.getElementById('teamAttYear');
    if (!squadSel || !yearSel) return;

    squads.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id; opt.textContent = s.name;
        squadSel.appendChild(opt);
    });
    if (squads.length > 0) squadSel.value = squads[0].id;

    // Populate year selector
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= currentYear - 3; y--) {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        yearSel.appendChild(opt);
    }

    squadSel.addEventListener('change', loadTeamAttendance);
    yearSel.addEventListener('change', loadTeamAttendance);

    loadTeamAttendance();
}

async function loadTeamAttendance() {
    const squadId = document.getElementById('teamAttSquad')?.value || 'all';
    const year = document.getElementById('teamAttYear')?.value || 'all';
    const summaryEl = document.getElementById('teamAttSummary');
    const tbody = document.getElementById('teamAttTableBody');
    if (!tbody) return;

    const setEmpty = (msg) => {
        tbody.innerHTML = `<tr><td colspan="5" class="table-empty" style="padding:32px;">
            <i class="fas fa-clipboard-list" style="font-size:1.6rem;margin-bottom:10px;display:block;opacity:0.25;"></i>
            ${msg}
        </td></tr>`;
        if (summaryEl) summaryEl.innerHTML = '';
    };

    tbody.innerHTML = '<tr><td colspan="5" class="table-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
    if (summaryEl) summaryEl.innerHTML = '';

    try {
        const clubId = getActiveClubId();

        // Build date range filter from year
        let dateFrom = null, dateTo = null;
        if (year && year !== 'all') {
            dateFrom = `${year}-01-01`;
            dateTo = `${year}-12-31`;
        }

        // Build attendance query
        let attQ = supabase.from('training_attendance')
            .select('id, session_id, date, absent_player_ids, attendance_count, attendance_total, squad_id')
            .limit(120);
        if (clubId) attQ = attQ.eq('club_id', clubId);
        if (squadId && squadId !== 'all') attQ = attQ.eq('squad_id', squadId);
        if (dateFrom) attQ = attQ.gte('date', dateFrom).lte('date', dateTo);

        // Players query is independent — run in parallel with attendance
        const playersQ = (squadId && squadId !== 'all')
            ? supabase.from('players').select('id, name').eq('squad_id', squadId).limit(2000)
            : Promise.resolve({ data: [] });

        const [{ data: attData, error: attErr }, { data: playersRaw }] = await Promise.all([attQ, playersQ]);
        if (attErr) throw attErr;

        _teamAttPlayerMap = {};
        (playersRaw || []).forEach(p => { _teamAttPlayerMap[p.id] = p.name; });

        const attRecords = (attData || []).sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1);

        // Sessions need attRecords IDs first — unavoidable serial step
        const sessionIds = [...new Set(attRecords.map(r => r.session_id).filter(Boolean))];
        let sessionMap = {};
        if (sessionIds.length > 0) {
            const { data: sessions } = await supabase.from('sessions')
                .select('id, title, date')
                .in('id', sessionIds);
            (sessions || []).forEach(s => { sessionMap[s.id] = s; });
        }

        if (attRecords.length === 0) {
            setEmpty('No attendance records found for this squad.<br><span style="font-size:0.8rem;color:#94a3b8;">Take attendance in Training Register to see data here.</span>');
            return;
        }

        // Summary stats
        let totalPctSum = 0, pctCount = 0;
        attRecords.forEach(r => {
            if (r.attendance_count != null && r.attendance_total > 0) {
                totalPctSum += (r.attendance_count / r.attendance_total) * 100;
                pctCount++;
            }
        });
        const avgPct = pctCount > 0 ? Math.round(totalPctSum / pctCount) : null;
        const textCol = pctTextColor(avgPct);
        const bgCol = avgPct >= 90 ? '#dcfce7' : avgPct >= 75 ? '#ccf5ec' : avgPct >= 60 ? '#fef3c7' : '#fee2e2';

        if (summaryEl) {
            summaryEl.innerHTML = `
                <div style="display:flex;gap:24px;align-items:center;margin-bottom:20px;padding:14px 20px;background:#f8fafc;border-radius:12px;flex-wrap:wrap;">
                    <div style="text-align:center;">
                        <div style="font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">Sessions Tracked</div>
                        <div style="font-size:1.8rem;font-weight:800;color:#0f172a;">${attRecords.length}</div>
                    </div>
                    <div style="width:1px;height:44px;background:#e2e8f0;"></div>
                    <div style="text-align:center;">
                        <div style="font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">Avg Attendance</div>
                        <div style="font-size:1.8rem;font-weight:800;color:${textCol};background:${bgCol};padding:2px 16px;border-radius:8px;display:inline-block;">${avgPct !== null ? avgPct + '%' : '—'}</div>
                    </div>
                </div>`;
        }

        renderTeamAttTable(attRecords, sessionMap);

    } catch (e) {
        console.error('Team attendance load error:', e);
        tbody.innerHTML = `<tr><td colspan="5" class="table-empty" style="color:#ef4444;padding:32px;">
            <i class="fas fa-exclamation-triangle" style="display:block;font-size:1.4rem;margin-bottom:8px;opacity:0.6;"></i>
            Failed to load attendance data.
        </td></tr>`;
        if (summaryEl) summaryEl.innerHTML = '';
    }
}

function renderTeamAttTable(records, sessionMap) {
    const tbody = document.getElementById('teamAttTableBody');
    const playerMap = _teamAttPlayerMap;
    const hasPlayers = Object.keys(playerMap).length > 0;

    tbody.innerHTML = '';
    records.forEach(r => {
        const sess = sessionMap[r.session_id] || {};
        const displayDate = r.date || sess.date || '—';
        const title = sess.title || 'Training Session';
        const count = r.attendance_count ?? '—';
        const total = r.attendance_total ?? '—';
        const pct = (r.attendance_count != null && r.attendance_total > 0)
            ? Math.round(r.attendance_count / r.attendance_total * 100) : null;
        const barCol = pctColor(pct);

        let absentIds = [];
        try { absentIds = Array.isArray(r.absent_player_ids) ? r.absent_player_ids : JSON.parse(r.absent_player_ids || '[]'); } catch (_) {}

        const presentIds = hasPlayers ? Object.keys(playerMap).filter(id => !absentIds.includes(id)) : [];
        const absentNames = absentIds.map(id => playerMap[id] || null).filter(Boolean);
        const presentNames = presentIds.map(id => playerMap[id]);
        const showDetail = hasPlayers || absentNames.length > 0;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:500;color:#1e293b;white-space:nowrap;">${escHtml(String(displayDate))}</td>
            <td style="color:#475569;font-size:0.88rem;">${escHtml(title)}</td>
            <td class="center" style="font-weight:600;">${count} / ${total}</td>
            <td class="center">
                ${pct !== null ? `
                    <span class="att-pct-bar"><span class="att-pct-fill att-pct-${barCol}" style="width:${pct}%;"></span></span>
                    <span style="font-weight:700;color:${pctTextColor(pct)};">${pct}%</span>
                ` : '<span style="color:#94a3b8;">—</span>'}
            </td>
            <td class="center">
                ${showDetail ? `<button class="dash-btn outline sm" style="font-size:0.78rem;padding:4px 10px;border-radius:8px;" onclick="toggleTeamAttRow(this)"><i class="fas fa-chevron-down"></i></button>` : '<span style="color:#94a3b8;">—</span>'}
            </td>
        `;

        tbody.appendChild(tr);

        if (showDetail) {
            const absentChips = absentNames.map(n =>
                `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;background:#fee2e2;color:#991b1b;border-radius:20px;font-size:0.78rem;font-weight:600;margin:2px;"><i class="fas fa-times" style="font-size:0.6rem;"></i>${escHtml(n)}</span>`
            ).join('');
            const presentChips = presentNames.map(n =>
                `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;background:#dcfce7;color:#166534;border-radius:20px;font-size:0.78rem;font-weight:600;margin:2px;"><i class="fas fa-check" style="font-size:0.6rem;"></i>${escHtml(n)}</span>`
            ).join('');

            const expandTr = document.createElement('tr');
            expandTr.className = 'team-att-expand';
            expandTr.style.display = 'none';
            expandTr.innerHTML = `
                <td colspan="5" style="padding:12px 24px;background:#f8fafc;border-bottom:2px solid #e2e8f0;">
                    ${absentNames.length > 0 ? `<div style="margin-bottom:8px;"><span style="font-size:0.72rem;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:0.5px;">Absent (${absentNames.length})</span><div style="margin-top:4px;">${absentChips}</div></div>` : ''}
                    ${hasPlayers && presentNames.length > 0 ? `<div><span style="font-size:0.72rem;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.5px;">Present (${presentNames.length})</span><div style="margin-top:4px;">${presentChips}</div></div>` : ''}
                    ${absentNames.length === 0 ? `<span style="font-size:0.85rem;color:#166534;font-weight:600;"><i class="fas fa-check-circle" style="margin-right:6px;"></i>Full attendance — no absences recorded.</span>` : ''}
                </td>
            `;
            tbody.appendChild(expandTr);
        }
    });
}

window.toggleTeamAttRow = function (btn) {
    const tr = btn.closest('tr');
    const next = tr.nextElementSibling;
    if (!next || !next.classList.contains('team-att-expand')) return;
    const isOpen = next.style.display !== 'none';
    next.style.display = isOpen ? 'none' : '';
    const icon = btn.querySelector('i');
    if (icon) icon.className = isOpen ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
};
