# web-app Specification

## Purpose
TBD - created by archiving change port-pwa-web. Update Purpose after archive.

## Requirements

### Requirement: The web app is the PWA

On the web the app SHALL look and behave as the TourenBuddy PWA release 0.54.0: the same pages and
overlays, the same layout at every window width, the same colors, type, icons, copy in English and
Swiss German, motion, and the same flows with the same steps. Features of the iOS and Android apps
that the PWA lacks SHALL NOT appear on the web. iOS and Android SHALL be unaffected.

#### Scenario: Side by side on a phone

- **WHEN** a long-time user opens the PWA and the web app at 390 px, signed in as the same user
- **THEN** every page and overlay they open looks the same and offers the same actions in the same
  places

#### Scenario: Side by side on a desktop

- **WHEN** both run in a 1280 px window
- **THEN** the web app shows the PWA's desktop layout (side drawer, dialogs), not a stretched phone

#### Scenario: Copy unchanged

- **WHEN** the language is Swiss German
- **THEN** every label, message and empty state reads exactly as in the PWA

#### Scenario: Native additions stay native

- **WHEN** a user signs in on the web
- **THEN** sign-in is by email code only, as in the PWA, without passwords or passkeys

### Requirement: The PWA's addresses

The web app SHALL answer the PWA's addresses: `/` (sign-in), `/auth/verify-otp`, `/onboarding`,
`/map`, `/calendar` and `/friends/<friendship id>/backfill-collisions`, and `/?notification=<id>`
SHALL open the inbox entry's target and mark it read. The terms gate SHALL be at `/accept-terms`.
Any other address SHALL lead to `/map` when signed in and `/` otherwise.

#### Scenario: Bookmark of the calendar

- **WHEN** a signed-in user opens `/calendar`
- **THEN** the calendar page shows

#### Scenario: Notification link

- **WHEN** a signed-in user opens `/?notification=<id>` from a push or an email
- **THEN** the entry's target opens and the entry is marked read

### Requirement: The PWA's gates

A signed-out user SHALL be sent to `/`; a signed-in user whose accepted terms are not in force to
`/accept-terms`, before any other page; a signed-in user on `/` to `/map`; a user without first and
last name to `/onboarding`, unless they skipped it this session or the profile is unknown because
the app is offline or the session unverified.

#### Scenario: Signed out

- **WHEN** a signed-out user opens `/map`
- **THEN** the sign-in page shows at `/`

#### Scenario: New terms

- **WHEN** a signed-in user whose accepted version is no longer in force opens `/map`
- **THEN** the terms page shows at `/accept-terms`, and accepting opens the map

#### Scenario: Offline with nothing cached

- **WHEN** a signed-in user starts the web app offline with no cached profile
- **THEN** the map shows instead of onboarding

### Requirement: A service worker as in the PWA

The web app SHALL ship a service worker that precaches the app shell, serves it for every in-app
navigation so each page cold-starts offline, caches map tiles, GPX files and the ski-route data as
the PWA does, and serves downloaded offline regions offline-first. Navigation to the public pages
(legal pages, account deletion, the association file, the app configuration) SHALL never be
answered by the app shell.

#### Scenario: Cold start offline

- **WHEN** an installed user opens the app in airplane mode
- **THEN** the map page loads with cached tiles and data

#### Scenario: Legal page under the worker

- **WHEN** an installed user opens `/privacy`
- **THEN** the public privacy page shows, not the app

### Requirement: Installable, with an update prompt

The web app SHALL ship a web manifest (`TourenBuddy`, standalone, start URL `/`, 192 and 512 px
icons). A new service worker SHALL take over only after the user accepts the update prompt.
Unlike the PWA, the web app SHALL show no install banner, neither its own nor the browser's:
installing stays in the browser's menu.

#### Scenario: New release

- **WHEN** a new version is deployed while the app is open
- **THEN** the update prompt appears, and the new version loads only after the user accepts it

#### Scenario: Browser offers installation

- **WHEN** Chrome on Android finds the app installable during the guided tour
- **THEN** no install banner covers the app; the browser's menu still offers to install it

### Requirement: Web Push as in the PWA

The web app SHALL subscribe the browser to Web Push with the VAPID public key when the user enables
push and the browser grants permission, show each push as a system notification, and on a click
focus an open app window or open one at the notification's address.

#### Scenario: Click with the app open

- **WHEN** the user clicks a friend-request push while the app is open in a tab
- **THEN** that tab comes to the front at the entry's target

### Requirement: Offline data on the web

On the web the system SHALL keep the same per-user offline copy as on iOS and Android in the
browser's storage, hydrate loads from it, queue writes made offline and replay them when reachable,
and delete a user's data on sign-out.

#### Scenario: Edit offline

- **WHEN** a user edits a tour while offline and the connection returns
- **THEN** the edit is saved once, and the pending indicator clears

#### Scenario: Another user signs in

- **WHEN** user A signs out and user B signs in in the same browser
- **THEN** none of A's data or queued writes appear for or are sent as B

### Requirement: Switching from the PWA is invisible

Served on the PWA's origin, the web app SHALL keep what the PWA stored in that browser: the session,
the language, the pace and other settings, the installed app, the push subscription and downloaded
offline regions.

#### Scenario: First open after the switch

- **WHEN** a user who used the installed PWA opens the app after the web app replaced it on the
  same origin and accepts the update prompt
- **THEN** they are still signed in, in their language, with their offline regions and push working
