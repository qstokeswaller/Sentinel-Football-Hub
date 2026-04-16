import { defineConfig } from 'vite';
import { resolve } from 'path';

// Sidebar HTML skeleton injected into every page at serve/build time.
// Sidebar shell: just a dark background placeholder — no branding text or icons.
// The preload script renders the real branded sidebar within milliseconds.
// This shell prevents a white flash in the sidebar area during that gap.
const sidebarShellHTML = `
<style>
  .sidebar-shell {
    position: fixed; top: 0; left: 0; width: 260px; height: 100vh;
    background: #0D1B2A; z-index: 99;
  }
  /* Hide shell once real sidebar is loaded */
  .sidebar ~ .sidebar-shell,
  .sidebar-loaded .sidebar-shell { display: none; }
  .sidebar-loaded::before { display: none !important; }
  @media (max-width: 768px) { .sidebar-shell { display: none; } }
</style>
`;

// Nav items matching sidebar.js exactly
const shellNavItems = [
    { href: '/src/pages/dashboard.html', icon: 'fa-th-large', label: 'Dashboard', id: 'dashboard' },
    { href: '/src/pages/planner.html', icon: 'fa-clipboard-list', label: 'Session Planner', id: 'planner' },
    { href: '/src/pages/library.html', icon: 'fa-book', label: 'Library', id: 'library' },
    { href: '/src/pages/reports.html', icon: 'fa-file-alt', label: 'Reports', id: 'reports' },
    { href: '/src/pages/squad.html', icon: 'fa-user-friends', label: 'Squad & Players', id: 'squad' },
    { href: '/src/pages/matches.html', icon: 'fa-futbol', label: 'Matches', id: 'matches' },
    { href: '/src/pages/analytics.html', icon: 'fa-chart-line', label: 'Analytics', id: 'analytics' },
    { href: '/src/pages/scouting.html', icon: 'fa-binoculars', label: 'Scouting', id: 'scouting' },
    { href: '/src/pages/financials.html', icon: 'fa-file-invoice-dollar', label: 'Financials', id: 'financials' },
];

function buildSidebarShellBody() {
    // Just a dark background placeholder — no text, no icons, no branding.
    // Prevents white flash; preload script replaces this with the real sidebar.
    return '<div class="sidebar-shell" aria-hidden="true"></div>';
}

function sidebarPlugin() {
    // Map filenames to page IDs for active highlighting
    const pageMap = {
        'dashboard.html': 'dashboard',
        'planner.html': 'planner',
        'library.html': 'library',
        'reports.html': 'reports',
        'squad.html': 'squad',
        'players.html': 'players',
        'player-profile.html': 'players',
        'matches.html': 'matches',
        'match-plan.html': 'matches',
        'match-details.html': 'matches',
        'match-analysis.html': 'matches',
        'analytics.html': 'analytics',
        'settings.html': 'settings',
        'training-register.html': 'squad',
        'platform-admin.html': 'platform-admin',
        'scouting.html': 'scouting',
        'scouted-player.html': 'scouting',
        'financials.html': 'financials',
    };

    return {
        name: 'inject-sidebar-shell',
        transformIndexHtml(html, ctx) {
            // Don't inject on login, root redirect, or platform admin (standalone shell)
            if (ctx.path?.includes('login.html') || ctx.path?.includes('platform-admin.html') || ctx.path?.includes('session-share.html') || ctx.path === '/index.html' || ctx.path === '/') {
                return html;
            }
            // Detect active page from the file path
            const filename = ctx.path?.split('/').pop() || '';
            const activePage = pageMap[filename] || '';

            html = html.replace('</head>', sidebarShellHTML + '</head>');
            html = html.replace('<div class="app-container">', '<div class="app-container">' + buildSidebarShellBody());
            return html;
        }
    };
}

export default defineConfig({
    root: '.',
    plugins: [sidebarPlugin()],
    build: {
        target: 'esnext',
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                login: resolve(__dirname, 'src/pages/login.html'),
                dashboard: resolve(__dirname, 'src/pages/dashboard.html'),
                planner: resolve(__dirname, 'src/pages/planner.html'),
                library: resolve(__dirname, 'src/pages/library.html'),
                reports: resolve(__dirname, 'src/pages/reports.html'),
                squad: resolve(__dirname, 'src/pages/squad.html'),
                players: resolve(__dirname, 'src/pages/players.html'),
                playerProfile: resolve(__dirname, 'src/pages/player-profile.html'),
                matches: resolve(__dirname, 'src/pages/matches.html'),
                matchPlan: resolve(__dirname, 'src/pages/match-plan.html'),
                matchDetails: resolve(__dirname, 'src/pages/match-details.html'),
                matchAnalysis: resolve(__dirname, 'src/pages/match-analysis.html'),
                analytics: resolve(__dirname, 'src/pages/analytics.html'),
                settings: resolve(__dirname, 'src/pages/settings.html'),
                trainingRegister: resolve(__dirname, 'src/pages/training-register.html'),
                platformAdmin: resolve(__dirname, 'src/pages/platform-admin.html'),
                scouting: resolve(__dirname, 'src/pages/scouting.html'),
                scoutedPlayer: resolve(__dirname, 'src/pages/scouted-player.html'),
                sessionShare: resolve(__dirname, 'src/pages/session-share.html'),
                financials: resolve(__dirname, 'src/pages/financials.html'),
            }
        }
    },
    server: {
        port: 3001,
        open: '/src/pages/login.html'
    },
    preview: {
        port: 3001
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        }
    }
});
