import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { offlineFallback } from 'workbox-recipes';

// Precache all build assets injected by vite-plugin-pwa at build time
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Skip waiting when prompted by the app (for manual update flow)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Push notification handler (Phase 2 — wired but inactive until push server is set up)
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const {
    title = 'Football Hub',
    body = '',
    url = '/src/pages/dashboard.html',
    icon = '/pwa-192x192.png',
  } = data;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: '/pwa-64x64.png',
      data: { url },
      vibrate: [100, 50, 100],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/src/pages/dashboard.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((c) => c.url.includes(url));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});

// Supabase REST GET — NetworkFirst (fresh data preferred, cache as read-only fallback)
registerRoute(
  ({ url, request }) =>
    url.hostname.endsWith('.supabase.co') && request.method === 'GET',
  new NetworkFirst({
    cacheName: 'supabase-api-cache',
    networkTimeoutSeconds: 4,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  })
);

// Supabase POST/PATCH/DELETE + auth — never cache, always network
registerRoute(
  ({ url }) => url.hostname.endsWith('.supabase.co'),
  new NetworkOnly()
);

// Google Fonts — CacheFirst (versioned, safe long-term)
registerRoute(
  ({ url }) =>
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
);

// FontAwesome CDN — CacheFirst
registerRoute(
  ({ url }) => url.hostname === 'cdnjs.cloudflare.com',
  new CacheFirst({
    cacheName: 'cdn-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  })
);

// Offline fallback for navigations not in precache
offlineFallback({ pageFallback: '/offline.html' });
