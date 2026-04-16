/**
 * Analytics Dynamic Logic
 */
import squadManager from '../managers/squad-manager.js';
import matchManager from '../managers/match-manager.js';

export function initAnalyticsLogic() {
    populateTeamSelector();
    updateAnalytics();

    document.getElementById('analyticsTeamSelector').addEventListener('change', updateAnalytics);
}

function populateTeamSelector() {
    const selector = document.getElementById('analyticsTeamSelector');
    if (!selector) return;

    const squads = squadManager.getSquads();
    selector.innerHTML = '<option value="all">All Teams</option>';

    squads.forEach(s => {
        const option = document.createElement('option');
        option.value = s.id;
        option.textContent = s.name;
        selector.appendChild(option);
    });
}

function updateAnalytics() {
    const teamId = document.getElementById('analyticsTeamSelector').value;
    const allMatches = matchManager.matches.filter(m => m.isPast);

    let filteredMatches = allMatches;
    if (teamId !== 'all') {
        filteredMatches = allMatches.filter(m => m.squadId === teamId);
    }

    renderKPICards(filteredMatches);

    // Call the chart update function (defined in analytics.js)
    if (window.updateAnalyticsCharts) {
        window.updateAnalyticsCharts(filteredMatches);
    }
}

function renderKPICards(matches) {
    const totalGoals = matches.reduce((sum, m) => sum + (m.homeScore || 0), 0);
    const goalsConceded = matches.reduce((sum, m) => sum + (m.awayScore || 0), 0);
    const avgPossession = matches.length > 0
        ? Math.round(matches.reduce((sum, m) => sum + (m.stats?.home?.possession || 0), 0) / matches.length)
        : 0;

    const xG = matches.reduce((sum, m) => sum + (m.stats?.home?.xG || 0), 0);
    const xGA = matches.reduce((sum, m) => sum + (m.stats?.away?.xG || 0), 0);
    const xGDiff = (xG - xGA).toFixed(1);

    const cards = document.querySelectorAll('.stat-card');
    if (cards.length < 4) return;

    // Goals Scored
    cards[0].querySelector('.value').textContent = totalGoals;
    cards[0].querySelector('.sub-label').textContent = `${(totalGoals / (matches.length || 1)).toFixed(1)} per game`;

    // Goals Conceded
    cards[1].querySelector('.value').textContent = goalsConceded;
    cards[1].querySelector('.sub-label').textContent = `${(goalsConceded / (matches.length || 1)).toFixed(1)} per game`;

    // xG Difference
    const xGVal = cards[2].querySelector('.value');
    xGVal.textContent = (xGDiff >= 0 ? '+' : '') + xGDiff;
    xGVal.className = `value ${xGDiff >= 0 ? 'text-positive' : 'text-red'}`;
    cards[2].querySelector('.sub-label').textContent = `xG: ${xG.toFixed(1)} | xGA: ${xGA.toFixed(1)}`;

    // Avg Possession
    cards[3].querySelector('.value').textContent = `${avgPossession}%`;
    cards[3].querySelector('.sub-label').textContent = `${matches.length} matches tracked`;
}
