/**
 * Vite Configuration — Football Performance Hub SaaS
 * Multi-page app with Supabase integration.
 *
 * Copy this to the project root when restructuring.
 */

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    root: '.',
    build: {
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
                analytics: resolve(__dirname, 'src/pages/analytics.html'),
            }
        }
    },
    server: {
        port: 5173,
        open: '/src/pages/login.html'
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        }
    }
});
