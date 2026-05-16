import { defineConfig } from 'vite';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';

// Sidebar HTML skeleton injected into every app page at serve/build time.
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

// Pages that should NOT receive the sidebar shell injection
const NO_SIDEBAR_PAGES = [
    'login.html', 'platform-admin.html', 'session-share.html',
    'player-dossier.html', 'squad-dossier.html',
    'privacy-policy.html', 'terms-of-service.html',
    'cookie-policy.html', 'data-processing.html',
    'clubs.html', 'players.html',
];

function buildSidebarShellBody() {
    return '<div class="sidebar-shell" aria-hidden="true"></div>';
}

function sidebarPlugin() {
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
            const isNoSidebar = NO_SIDEBAR_PAGES.some(p => ctx.path?.includes(p));
            if (isNoSidebar || ctx.path === '/index.html' || ctx.path === '/') {
                return html;
            }
            const filename = ctx.path?.split('/').pop() || '';
            const activePage = pageMap[filename] || '';

            html = html.replace('</head>', sidebarShellHTML + '</head>');
            html = html.replace('<div class="app-container">', '<div class="app-container">' + buildSidebarShellBody());
            return html;
        }
    };
}

// Injects Apple PWA meta tags + pwa-register.js into every processed HTML page
function pwaMetaPlugin() {
    const tags = `
  <meta name="theme-color" content="#00C49A">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Football Hub">
  <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png">
  <script type="module" src="/pwa-register.js"></script>`;

    return {
        name: 'inject-pwa-meta',
        transformIndexHtml(html) {
            return html.replace('</head>', tags + '\n</head>');
        }
    };
}

export default defineConfig({
    root: '.',
    define: {
        __APP_VERSION__: JSON.stringify(Date.now()),
    },
    plugins: [
        sidebarPlugin(),
        pwaMetaPlugin(),
        VitePWA({
            registerType: 'prompt',
            injectRegister: null,       // pwa-register.js handles unregistration
            selfDestroying: true,       // generated SW unregisters itself — no caching
            manifest: {
                name: 'Sentinel Football Hub',
                short_name: 'Football Hub',
                description: 'Club management platform for football coaches',
                start_url: '/src/pages/dashboard.html',
                scope: '/',
                display: 'standalone',
                orientation: 'any',
                background_color: '#080B0F',
                theme_color: '#00C49A',
                lang: 'en-ZA',
                categories: ['sports', 'productivity'],
                icons: [
                    { src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
                    { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                    { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                    { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
            },
            devOptions: {
                enabled: false,
            },
        }),
    ],
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
                playerDossier: resolve(__dirname, 'src/pages/player-dossier.html'),
                squadDossier: resolve(__dirname, 'src/pages/squad-dossier.html'),
                privacyPolicy: resolve(__dirname, 'src/pages/privacy-policy.html'),
                termsOfService: resolve(__dirname, 'src/pages/terms-of-service.html'),
                cookiePolicy: resolve(__dirname, 'src/pages/cookie-policy.html'),
                dataProcessing: resolve(__dirname, 'src/pages/data-processing.html'),
                clubsLanding: resolve(__dirname, 'landing/clubs.html'),
                playersLanding: resolve(__dirname, 'landing/players.html'),
            }
        }
    },
    server: {
        port: 3001,
        open: '/'
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
