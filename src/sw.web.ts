/// <reference lib="webworker" />
// The web app's service worker (the PWA's `src/sw.ts`), bundled by `scripts/build-sw.mjs` after
// `expo export`: that script fills `self.__WB_MANIFEST` with the exported files.
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';

import { OFFLINE_MAP_CACHE } from '@/features/map/data/services/offline-map-cache.web';
import { pickTileResponse } from '@/features/map/data/services/pick-tile-response.web';
import { SKI_ROUTES_TILEJSON, TRAIL_OVERLAYS } from '@/features/map/data/trail-overlays';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (PrecacheEntry | string)[] };

// The map's and the PDF viewer's workers load as `<file>.mjs?v=<library version>`.
precacheAndRoute(self.__WB_MANIFEST, {
  ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^v$/],
});
cleanupOutdatedCaches();

// SPA navigation fallback: the precached shell for ANY in-app navigation, so a hard reload of
// /calendar or a cold offline launch boots; the offline data cache hydrates on top. The public
// pages in `public/` (legal pages, association file, update gate config) come from the network.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [
      /^\/(de\/)?(privacy|terms|imprint|account-deletion)(\/|$)/,
      /^\/\.well-known\//,
      /^\/app-config\.json$/,
    ],
  }),
);

// The user applies updates (the update prompt).
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING')
    void self.skipWaiting();
});

// Control already-open clients at once, so the offline tile route serves the very first visit.
// clients.claim, not skipWaiting: the user still approves updates.
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Welcome screen background images
registerRoute(
  ({ url }) => /\/app\/background-.*\.webp$/i.test(url.pathname),
  new CacheFirst({
    cacheName: 'welcome-backgrounds',
    plugins: [new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
);

// Swisstopo vector tiles: runtime (opportunistic) cache.
const vectorTilesSwr = new StaleWhileRevalidate({
  cacheName: 'swisstopo-tiles',
  plugins: [new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 })],
});

// Offline-first base map: a downloaded tile from the offline cache, else the runtime handler.
// Before the runtime route (Workbox matches in registration order); all shards and the bare host.
registerRoute(
  ({ url }) => /^vectortiles\d?\.geo\.admin\.ch$/.test(url.host),
  (options) =>
    pickTileResponse(options.request as Request, {
      // ignoreVary: stored tiles keep Swisstopo's `Vary` header.
      cacheMatch: async (url) =>
        (await caches.open(OFFLINE_MAP_CACHE)).match(url, { ignoreVary: true }),
      swrHandler: () => vectorTilesSwr.handle(options) as Promise<Response>,
    }),
);

// Trail overlays change about yearly: cache-first, own cache, before the generic WMTS route.
const TRAIL_LAYER_IDS = new Set(TRAIL_OVERLAYS.map((o) => o.layerBodId));
registerRoute(
  // Path: /1.0.0/<layerBodId>/default/current/3857/{z}/{x}/{y}.png
  ({ url }) =>
    url.origin === 'https://wmts.geo.admin.ch' &&
    TRAIL_LAYER_IDS.has(url.pathname.split('/')[2] ?? ''),
  new CacheFirst({
    cacheName: 'swisstopo-trail-overlays',
    plugins: [new ExpirationPlugin({ maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
);

// Self-hosted ski routes: the manifest network-first; versioned tiles and routes cache-first.
const SKI_DATA_ORIGIN = new URL(SKI_ROUTES_TILEJSON).origin;
const skiRouteData = new CacheFirst({
  cacheName: 'ski-route-data',
  plugins: [new ExpirationPlugin({ maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 30 })],
});
registerRoute(
  ({ url }) => url.href === SKI_ROUTES_TILEJSON,
  new NetworkFirst({ cacheName: 'ski-route-manifest', networkTimeoutSeconds: 3 }),
);
registerRoute(
  ({ url }) => url.origin === SKI_DATA_ORIGIN && url.pathname.endsWith('.pbf'),
  (options) =>
    pickTileResponse(options.request as Request, {
      cacheMatch: async (url) =>
        (await caches.open(OFFLINE_MAP_CACHE)).match(url, { ignoreVary: true }),
      swrHandler: () => skiRouteData.handle(options) as Promise<Response>,
    }),
);
registerRoute(
  ({ url }) => url.origin === SKI_DATA_ORIGIN && /\/routes\/[^/]+\.json$/.test(url.pathname),
  skiRouteData,
);

// Swisstopo WMTS raster tiles (Classic base map)
registerRoute(
  ({ url }) => url.origin === 'https://wmts.geo.admin.ch',
  new StaleWhileRevalidate({
    cacheName: 'swisstopo-wmts',
    plugins: [new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
);

// GPX files in Supabase storage
registerRoute(
  ({ url }) => /\/storage\/v1\/object\/(?:sign\/)?tour-gpx\//i.test(url.pathname),
  new StaleWhileRevalidate({
    cacheName: 'tour-gpx-files',
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
);

// Tour attachments: signed URLs are short-lived and MUST NOT be cached.
registerRoute(
  ({ url }) => /\/storage\/v1\/object\/(?:sign\/)?tour-attachments\//i.test(url.pathname),
  new NetworkOnly(),
);

// Push: ONLY shows the notification. No postMessage, no fetch, no store state; Realtime keeps
// the open app current, push is for the OS.
self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string } = {};
  try {
    data = (event.data?.json() as typeof data) ?? {};
  } catch {
    // Malformed payload: the generic fallback.
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'TourenBuddy', {
      body: data.body ?? 'You have a new notification.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url ?? '/' },
    }),
  );
});

// Notification click: ONLY focus/navigate/openWindow.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data as { url?: string } | null)?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find((c) => new URL(c.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        await existing.navigate(targetUrl);
        return;
      }
      await self.clients.openWindow(targetUrl);
    }),
  );
});
