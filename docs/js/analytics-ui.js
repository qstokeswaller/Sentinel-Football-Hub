/**
 * Analytics UI Logic
 * Processes match data into aggregate statistics based on Squad filters.
 */

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Managers
    await Promise.all([
        squadManager.init(),
        matchManager.init()
    ]);

    populateFilters();
    calculateAndRenderAnalytics();

    // Attach listeners
    document.getElementById('filterAgeGroup').addEventListener('change', calculateAndRenderAnalytics);
    document.getElementById('filterCoach').addEventListener('change', calculateAndRenderAnalytics);
    document.getElementById('filterTeam').addEventListener('change', calculateAndRenderAnalytics);
});

function populateFilters() {
    const ageSelect = document.getElementById('filterAgeGroup');
    const coachSelect = document.getElementById('filterCoach');
    const teamSelect = document.getElementById('filterTeam');

    const squads = squadManager.getSquads();

    // Extract unique age groups and coaches
    const ageGroups = new Set();
    const coaches = new Set();

    squads.forEach(s => {
        if (s.ageGroup) ageGroups.add(s.ageGroup);
        if (s.coaches && s.coaches.length > 0) {
            s.coaches.forEach(c => coaches.add(c));
        }
    });

    // Populate Age Groups
    ageGroups.forEach(age => {
        const option = document.createElement('option');
        option.value = age;
        option.textContent = age;
        ageSelect.appendChild(option);
    });

    // Populate Coaches
    coaches.forEach(coach => {
        const option = document.createElement('option');
        option.value = coach;
        option.textContent = coach;
        coachSelect.appendChild(option);
    });

    // Populate Teams
    squads.forEach(squad => {
        const option = document.createElement('option');
        option.value = squad.id;
        option.textContent = squad.name;
        teamSelect.appendChild(option);
    });
}

function calculateResultObj(match) {
    if (!match.isPast || match.homeScore === undefined || match.homeScore === null || match.homeScore === '') return null;
    const home = parseInt(match.homeScore, 10);
    const away = parseInt(match.awayScore, 10);

    // Default to 'home' for legacy matches
    const effectiveSide = match.ourSide || 'home';

    if (home === away) return 'D';
    if (effectiveSide === 'home') {
        return home > away ? 'W' : 'L';
    } else {
        return away > home ? 'W' : 'L';
    }
}

function resolveTeamNames(m) {
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
}

function calculateAndRenderAnalytics() {
    const ageFilter = document.getElementById('filterAgeGroup').value;
    const coachFilter = document.getElementById('filterCoach').value;
    const teamFilter = document.getElementById('filterTeam').value;

    const squads = squadManager.getSquads();

    // 1. Filter Squads based on criteria
    const filteredSquadIds = squads.filter(s => {
        const matchesAge = ageFilter === 'all' || s.ageGroup === ageFilter;
        const matchesCoach = coachFilter === 'all' || (s.coaches && s.coaches.includes(coachFilter));
        const matchesTeam = teamFilter === 'all' || s.id === teamFilter;
        return matchesAge && matchesCoach && matchesTeam;
    }).map(s => s.id);

    // 2. Filter Matches based on the filtered Squads
    const allMatches = matchManager.matches;
    const relevantMatches = allMatches.filter(m => filteredSquadIds.includes(m.squadId));

    // Only analyze past completed matches
    const pastMatches = relevantMatches.filter(m => m.isPast && m.homeScore !== undefined && m.homeScore !== null && m.homeScore !== '');

    // 3. Calculate Metrics
    let totalGoalsScored = 0;
    let totalGoalsConceded = 0;

    let totalPossession = 0;
    let possessionMatchCount = 0;

    let totalXG = 0;
    let totalXGA = 0;

    pastMatches.forEach(m => {
        const homeScore = parseInt(m.homeScore, 10) || 0;
        const awayScore = parseInt(m.awayScore, 10) || 0;
        const effectiveSide = m.ourSide || 'home';

        if (effectiveSide === 'home') {
            totalGoalsScored += homeScore;
            totalGoalsConceded += awayScore;
        } else {
            totalGoalsScored += awayScore;
            totalGoalsConceded += homeScore;
        }

        if (m.stats && m.stats.home) {
            // Possession is currently only stored in 'home' or shared stats for many matches
            // If we have distinct home/away stats, we should pick the correct one
            const squadStats = (effectiveSide === 'home') ? (m.stats.home || m.stats) : (m.stats.away || m.stats.home || m.stats);
            const oppStats = (effectiveSide === 'home') ? (m.stats.away || {}) : (m.stats.home || m.stats);

            if (squadStats.possession) {
                totalPossession += parseInt(squadStats.possession, 10);
                possessionMatchCount++;
            }
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

    // 4. Update UI Metrics
    document.getElementById('statGoalsScored').innerText = totalGoalsScored;
    document.getElementById('statGoalsScoredAvg').innerText = `${avgScored} per game`;

    document.getElementById('statGoalsConceded').innerText = totalGoalsConceded;
    document.getElementById('statGoalsConcededAvg').innerText = `${avgConceded} per game`;

    document.getElementById('statAvgPossession').innerText = `${avgPossession}%`;
    document.getElementById('statMatchesTrackedPos').innerText = `${possessionMatchCount} matches tracked`;

    document.getElementById('statXgDiff').innerText = xgDiffStr;
    document.getElementById('statXgDetails').innerText = `xG: ${totalXG.toFixed(1)} | xGA: ${totalXGA.toFixed(1)}`;

    // 5. Build Recent Form (Last 5 matches sorted by date descending)
    const sortedPast = [...pastMatches].sort((a, b) => new Date(b.date) - new Date(a.date));
    const recent5 = sortedPast.slice(0, 5);

    // Sort recent 5 chronologically so oldest is left, newest is right (standard format)
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

            let color = '#64748b';
            let bg = '#f8fafc';

            if (res === 'W') { color = '#166534'; bg = '#dcfce7'; }
            else if (res === 'L') { color = '#991b1b'; bg = '#fee2e2'; }

            // Name Resolution
            const { home: hName, away: aName } = resolveTeamNames(m);
            const oppName = m.ourSide === 'home' ? aName : hName;

            const bubble = document.createElement('div');
            bubble.style.cssText = `
                width: 32px; height: 32px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                font-weight: 800; font-size: 0.85rem;
                color: ${color}; background: ${bg}; border: 1px solid ${color}30;
                cursor: pointer;
            `;
            bubble.innerText = res;
            bubble.title = `vs ${oppName} (${m.homeScore}-${m.awayScore})`;

            // Open analysis directly
            bubble.onclick = () => window.location.href = `match-analysis.html?id=${m.id}`;
            formContainer.appendChild(bubble);
        });

        const winRate = Math.round((wins / chronologicalForm.length) * 100);
        document.getElementById('formWinRate').innerText = `Win Rate: ${winRate}%`;
    }

    // 6. Build History Table
    const tableBody = document.getElementById('formHistoryTableBody');
    tableBody.innerHTML = '';

    // Using sortedPast (descending) so newest is top of the table
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
            <td style="padding: 16px 24px; font-weight: 500; color: #1e293b;">${m.date}</td>
            <td style="color: #64748b; font-size: 0.9rem;">${m.competition || '-'}</td>
            <td style="font-weight: 600; color: #1e293b;">${oppName}</td>
            <td style="text-align: center;"><span class="badge ${badgeClass}" style="min-width: 28px;">${res}</span></td>
            <td style="text-align: center; font-weight: 800; color: #0f172a; font-size: 1.1rem;">${m.homeScore} - ${m.awayScore}</td>
            <td style="padding: 16px 24px; text-align: right;">
                <a href="match-analysis.html?id=${m.id}" class="dash-btn outline sm" style="font-size: 0.8rem; padding: 6px 14px; border-radius: 8px;">
                    <i class="fas fa-chart-pie"></i> View Analysis
                </a>
            </td>
        `;

        tableBody.appendChild(tr);
    });
}
