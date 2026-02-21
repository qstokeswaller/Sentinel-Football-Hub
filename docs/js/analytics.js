// Chart Global Instances
let performanceChart = null;
let volumeChart = null;
let loadChart = null;

// Expose to window for analytics-logic.js
window.updateAnalyticsCharts = function (matches) {
    if (matches.length === 0) return;

    // 1. Performance Intelligence (Trend of xG or Goals over time)
    updatePerformanceChart(matches);

    // 2. Volume Tracker (Total Shots vs xG)
    updateVolumeTracker(matches);

    // 3. Load Distribution (Simulated from possession stats)
    updateLoadChart(matches);
};

function updatePerformanceChart(matches) {
    const ctx = document.getElementById('performanceIntelligenceChart').getContext('2d');

    // Sort matches by date
    const sorted = [...matches].sort((a, b) => new Date(a.date) - new Date(b.date));
    const labels = sorted.map(m => m.date.split('-').slice(1).join('/')); // MM/DD
    const data = sorted.map(m => (m.stats?.home?.xG || 0) * 10); // Scale for visual

    if (performanceChart) performanceChart.destroy();

    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');

    performanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Performance Index (xG Based)',
                data: data,
                borderColor: '#3b82f6',
                borderWidth: 3,
                fill: true,
                backgroundColor: gradient,
                tension: 0.4,
                pointBackgroundColor: '#3b82f6',
                pointBorderColor: '#fff',
                pointHoverRadius: 6
            }]
        },
        options: getCommonOptions()
    });
}

function updateVolumeTracker(matches) {
    const ctx = document.getElementById('volumeTrackerChart').getContext('2d');

    const labels = matches.map((m, i) => `Match ${i + 1}`);
    const data = matches.map(m => m.stats?.home?.shots || 0);

    if (volumeChart) volumeChart.destroy();

    volumeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Shots Volume',
                data: data,
                backgroundColor: '#8b5cf6',
                borderRadius: 8,
                barThickness: 20
            }]
        },
        options: getCommonOptions()
    });
}

function updateLoadChart(matches) {
    const ctx = document.getElementById('loadDistributionChart').getContext('2d');

    // Aggregate possession into ranges
    let low = 0, med = 0, high = 0, extreme = 0;
    matches.forEach(m => {
        const p = m.stats?.home?.possession || 50;
        if (p < 45) low++;
        else if (p < 55) med++;
        else if (p < 65) high++;
        else extreme++;
    });

    if (loadChart) loadChart.destroy();

    loadChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Low Control', 'Balanced', 'Dominant', 'Extreme Control'],
            datasets: [{
                data: [low, med, high, extreme],
                backgroundColor: ['#10b981', '#3b82f6', '#8b5cf6', '#ef4444'],
                borderWidth: 0,
                cutout: '75%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', usePointStyle: true, padding: 20 }
                }
            }
        }
    });
}

function getCommonOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#1e293b',
                titleColor: '#f8fafc',
                bodyColor: '#94a3b8',
                padding: 12,
                cornerRadius: 8,
                displayColors: false
            }
        },
        scales: {
            x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
            y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8' } }
        }
    };
}
