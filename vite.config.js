import { defineConfig } from 'vite';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Post-cutover: single React SPA. Root index.html boots app/main.tsx; React Router
// owns every route (marketing `/`, legal, app behind auth, public share pages).
// `appType: 'spa'` gives dev/preview history-fallback to index.html for client routes.
export default defineConfig({
    root: '.',
    appType: 'spa',
    define: {
        __APP_VERSION__: JSON.stringify(Date.now()),
    },
    plugins: [
        react(),
        tailwindcss(),
        VitePWA({
            registerType: 'prompt',
            injectRegister: null,       // the React useRegisterSW() hook registers the SW
            manifest: {
                name: 'Sentinel Football Hub',
                short_name: 'Football Hub',
                description: 'Club management platform for football coaches',
                start_url: '/dashboard',
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
                shortcuts: [
                    { name: 'Dashboard', short_name: 'Dashboard', url: '/dashboard' },
                    { name: 'Session Planner', short_name: 'Planner', url: '/planner' },
                    { name: 'Squad Management', short_name: 'Squad', url: '/squad' },
                    { name: 'Matches', short_name: 'Matches', url: '/matches' },
                ],
            },
            workbox: {
                // Precache the whole app shell so it loads instantly + works offline.
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                // SPA: serve the app shell for any client-side route offline; never for /api.
                navigateFallback: '/index.html',
                navigateFallbackDenylist: [/^\/api\//],
                cleanupOutdatedCaches: true,
                clientsClaim: true,
                runtimeCaching: [
                    {
                        // Supabase REST + Storage GETs: fresh-first, fall back to cache when
                        // offline. /auth/* is intentionally NOT matched — never cache auth.
                        urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/(rest|storage)\/v1\//i,
                        handler: 'NetworkFirst',
                        method: 'GET',
                        options: {
                            cacheName: 'supabase-data',
                            networkTimeoutSeconds: 4,
                            expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                    {
                        urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//i,
                        handler: 'CacheFirst',
                        options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
                    },
                    {
                        urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\//i,
                        handler: 'CacheFirst',
                        options: { cacheName: 'cdn', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 }, cacheableResponse: { statuses: [0, 200] } },
                    },
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
            output: {
                // Split heavy/shared vendors into their own cacheable chunks. Combined
                // with the per-route React.lazy() splitting, the initial load is small.
                manualChunks(id) {
                    if (!id.includes('node_modules')) return;
                    if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('canvg') || id.includes('dompurify') || id.includes('fflate')) return 'pdf';
                    if (id.includes('konva')) return 'konva';
                    if (id.includes('driver.js')) return 'tour';
                    if (id.includes('@supabase')) return 'supabase';
                    if (id.includes('@tanstack')) return 'query';
                    if (id.includes('react-router') || id.includes('/react-dom/') || id.includes('/react/') || id.includes('scheduler')) return 'react-vendor';
                },
            },
        },
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
            '@app': resolve(__dirname, 'app'),
        }
    }
});
