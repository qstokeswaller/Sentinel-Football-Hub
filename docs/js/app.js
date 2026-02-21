// App Logic & Interactivity
document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    initSearch();
    initModals();
    initActiveLinks();
});

function initCharts() {
    // Only if on analytics page
    if (document.getElementById('performanceIntelligenceChart')) {
        // Shared chart initialization (already in analytics.js, but let's centralize)
        // Note: For now, keeping separate but would merge in a real build
    }
}

function initSearch() {
    const searchInputs = document.querySelectorAll('input[placeholder*="Search"]');
    searchInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();

            // Filter players if on Squad page
            const playerCards = document.querySelectorAll('.player-card');
            playerCards.forEach(card => {
                const name = card.querySelector('h3').textContent.toLowerCase();
                card.style.display = name.includes(term) ? 'block' : 'none';
            });

            // Filter table rows if on Analytics page
            const tableRows = document.querySelectorAll('.data-table tbody tr');
            tableRows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(term) ? 'table-row' : 'none';
            });
        });
    });
}

function initModals() {
    const drilldownButtons = document.querySelectorAll('.btn-outline-sm');
    drilldownButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const name = e.target.closest('.player-card, tr')?.querySelector('h3, span')?.textContent || "Athlete";
            alert(`Opening detailed drill-down for: ${name}\n\nThis feature would load real-time longitudinal data and predictive insights.`);
        });
    });
}

function initActiveLinks() {
    const currentPath = window.location.pathname.split('/').pop();
    const navLinks = document.querySelectorAll('.sidebar-nav li');

    navLinks.forEach(li => {
        const link = li.querySelector('a');
        if (link && link.getAttribute('href') === currentPath) {
            li.classList.add('active');
        } else {
            li.classList.remove('active');
        }
    });

    // Special case for dashboard.html if it's the root
    if (!currentPath || currentPath === 'index.html') {
        // Keep initial active state or point to dashboard
    }
}

// Chart Interaction simulation
function updateDateRange(range) {
    const charts = Chart.getChart('performanceIntelligenceChart');
    if (charts) {
        // Randomize data to simulate refresh
        charts.data.datasets[0].data = charts.data.datasets[0].data.map(() => Math.floor(Math.random() * 40) + 60);
        charts.update();
    }
}
