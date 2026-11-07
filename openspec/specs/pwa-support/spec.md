## Purpose

Installable Progressive Web App with offline-capable shell, manifest, service worker, and runtime tile caching.

## Requirements

### Requirement: Installable app with a prompt-driven service worker
The app SHALL ship a web manifest (`TourenBuddy`, `display: standalone`, `start_url: /`, 192/512 px icons) and a custom service worker built with `vite-plugin-pwa` (`strategies: 'injectManifest'`, `src/sw.ts`, `registerType: 'prompt'`). The service worker SHALL precache the app shell (js, css, html, icons, svg, woff2) and SHALL serve the precached `index.html` for every in-app navigation, so client routes cold-start offline. A new service worker SHALL only take over after the user accepts the update prompt (see `app-update`), but an activated worker SHALL claim already-open clients immediately.

#### Scenario: Offline cold start on a client route
- **WHEN** the installed app is reopened offline on `/calendar`
- **THEN** the precached app shell is served and the app boots

### Requirement: Runtime caching rules
The service worker SHALL apply these runtime strategies:
- Swisstopo vector tiles (`vectortiles*.geo.admin.ch`): explicitly downloaded offline-map entries first (see `offline-map`), otherwise stale-while-revalidate in `swisstopo-tiles` (500 entries, 30 days).
- Swisstopo trail-overlay WMTS tiles (`ch.swisstopo.swisstlm3d-wanderwege`, `ch.swisstopo-karto.skitouren`): cache-first in a dedicated `swisstopo-trail-overlays` cache (1500 entries, 30 days) — a cached tile SHALL be served without any network request until it expires.
- Ski-route dataset manifest (see `ski-route-dataset`): network-first, falling back to the last cached copy when offline.
- Ski-route dataset tiles and route files: explicitly downloaded offline-map entries first (tiles only), otherwise cache-first in a dedicated `ski-route-data` cache (3000 entries, 30 days) — versioned paths never change content, so a cached entry SHALL be served without any network request until it expires.
- Other Swisstopo WMTS raster tiles: stale-while-revalidate (500 entries, 30 days).
- GPX objects in Supabase Storage: stale-while-revalidate (100 entries, 30 days).
- Tour attachment objects: network-only — signed URLs are short-lived and SHALL NOT be cached by the service worker.
- Welcome-screen background images: cache-first (4 entries, 30 days).

#### Scenario: Attachment fetch is never cached
- **WHEN** an attachment is fetched through a signed URL
- **THEN** the response does not enter any service-worker cache

#### Scenario: Cached overlay tile is not refetched
- **WHEN** a trail-overlay tile already in `swisstopo-trail-overlays` and younger than 30 days is requested
- **THEN** it SHALL be served from the cache and no network request SHALL be made for it

#### Scenario: Overlay tiles do not evict Classic tiles
- **WHEN** the user pans with overlays on
- **THEN** overlay tiles SHALL be stored only in `swisstopo-trail-overlays` and SHALL NOT count toward the Classic WMTS cache's entry limit

#### Scenario: Ski-route manifest picks up a new version online
- **WHEN** a new ski-route dataset version is published and the app starts online
- **THEN** the service worker SHALL fetch the manifest from the network and the map SHALL request the new version's tiles

#### Scenario: Ski-route manifest offline
- **WHEN** the app starts offline after the manifest was fetched before
- **THEN** the cached manifest SHALL be served and the ski-route source SHALL load from cached tiles

### Requirement: Service worker push handler
The service worker SHALL handle `push` events by displaying a notification with the title and body provided by the Worker payload.

#### Scenario: Push event received
- **WHEN** the service worker receives a `push` event with a JSON payload `{ title, body, url }`
- **THEN** it shows a notification using `registration.showNotification(title, { body, data: { url } })`

#### Scenario: Empty or malformed payload
- **WHEN** the payload cannot be parsed as JSON, or lacks a field
- **THEN** a generic fallback is used for the missing part (title `TourenBuddy`, an English generic body, URL `/`) — the service worker has no access to the app's locale

### Requirement: Service worker notification click handler
The service worker SHALL focus an existing client window or open a new one at the notification's deep-link URL when the user taps a notification.

#### Scenario: App already open
- **WHEN** the user clicks the notification and a window for the app origin is already open
- **THEN** that window is focused and navigated to `event.notification.data.url`

#### Scenario: App not open
- **WHEN** no window is open for the origin
- **THEN** the service worker opens a new window at the deep-link URL

### Requirement: Web Push subscription on permission grant
The PWA SHALL subscribe the browser to Web Push using the VAPID public key whenever the user enables push and notification permission is granted.

#### Scenario: Permission granted
- **WHEN** the user toggles push on and `Notification.permission === 'granted'`
- **THEN** the app calls `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC })` and stores the subscription

#### Scenario: Permission denied
- **WHEN** the user denies permission
- **THEN** the push toggle reverts to off and a hint explains how to re-enable it in browser settings

### Requirement: PWA pages extend content into safe-area zones

When installed as a PWA, every routed page SHALL paint its own background (image, map canvas, or surface color) edge-to-edge of the area the system gives the app, including beneath the bottom home indicator / gesture bar. On iOS the status bar SHALL be the default, opaque one with the page below it (`black-translucent` gets a system blur since iOS 26.1), dark like the offline bar from launch on. The body element SHALL NOT paint a brand-colored band in the safe-area.

#### Scenario: iOS PWA home page

- **WHEN** the user installs the app on iOS and opens the home page
- **THEN** the status bar is opaque in the offline bar's dark color, the page starts below it with no blur over its top edge, and the background image extends to the physical bottom edge with no solid blue band

#### Scenario: iOS PWA map view

- **WHEN** the user opens the map view in the installed iOS PWA
- **THEN** Swisstopo map tiles render from directly below the status bar's thin dark edge down under the home indicator, with no blur or color band over the map

#### Scenario: Page mounted before content paints

- **WHEN** a route transition is in flight and a page root has not yet rendered its background
- **THEN** the visible fallback is the app's neutral surface color (not the legacy blue status-bar color)

#### Scenario: Tour form header on iOS

- **WHEN** the user opens the new-tour form in the installed iOS PWA
- **THEN** the close button, title and Save button sit fully visible and sharp below the status bar

#### Scenario: Status bar color through an offline spell

- **WHEN** the installed iOS app goes offline and comes back online
- **THEN** the status bar keeps the same dark color before, during and after, never switching to white

### Requirement: Interactive controls stay clear of bottom safe-area

Action bars, floating action buttons, bottom sheets, and any future bottom navigation SHALL apply the bottom safe-area inset via `var(--safe-bottom)` (on `padding-bottom` or `bottom`) so their touch targets sit fully above the Android gesture bar and the iOS home indicator. Non-interactive layers (map canvas, page background image) SHALL still extend behind the safe-area. The raw `env(safe-area-inset-bottom)` value SHALL be sourced only through the `--safe-bottom` token (defined in `safe-area.css`), not inline at the call site.

#### Scenario: Android PWA map action bar

- **WHEN** the user views the map on Android with gesture navigation enabled
- **THEN** the map action bar's buttons sit above the gesture bar and remain fully tappable

#### Scenario: iOS PWA bottom sheet

- **WHEN** a tour info bottom sheet is open on iOS PWA
- **THEN** its bottom-most interactive control is positioned above the home indicator

#### Scenario: Inset sourced from token

- **WHEN** an interactive control's CSS sets its bottom safe-area clearance
- **THEN** it references `var(--safe-bottom)` and contains no inline `env(safe-area-inset-bottom)`

### Requirement: Self-contained app shell (no external font origin)

The app shell SHALL be self-contained: all fonts and icons SHALL be bundled and precached by the service worker, with no runtime dependency on an external font CDN or any third-party origin for fonts or icons. Fonts and icons SHALL render on first paint and while offline.

#### Scenario: Icons and text render offline

- **WHEN** the app is opened offline (after installation)
- **THEN** Inter text and all icons render from precached bundle assets, with no failed third-party font requests

#### Scenario: No third-party font request on load

- **WHEN** the app loads with network access
- **THEN** no request is made to `fonts.googleapis.com` or `fonts.gstatic.com` (or any external font host)

#### Scenario: Icons present on first paint

- **WHEN** the first frame of the UI paints, before any deferred bootstrap work completes
- **THEN** icons already render at their correct size (bundled SVG), with no font-load race that could alter layout
