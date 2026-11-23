# Tasks

## 0. Specs and scaffolding

- [x] 0.1 Spec deltas: scope the web clauses listed in the proposal to iOS and Android (REMOVED +
      ADDED where a web scenario goes), `web-app` added; `openspec validate --strict`
- [x] 0.2 Verify Expo Router platform routes and CSS Modules on SDK 58 with one route (docs + export)
- [x] 0.3 `src/core/web/`: theme CSS, transition hook, icon component, snackbar, logger use
- [x] 0.4 Catalog conversion script and `src/locales/web/{en,de-CH}.json`, `web` namespace, typed
- [x] 0.5 Jest: CSS Module stub for `*.test.web.tsx`

## 1. Shell, auth, gates

- [x] 1.1 `_layout.web.tsx` with the PWA guards; native redirect stubs for web-only paths
- [x] 1.2 Home (sign-in), verify OTP, accept terms, onboarding page
- [x] 1.3 Core overlays: adaptive overlay, bottom sheet, dialog window, side drawer, full-screen page,
      buttons, icon button, tooltip, extended FAB, search input, offline indicator and sync status

## 2. Map

- [x] 2.1 Map page, TourenBuddy map, markers and clusters, action overlay and speed dial
- [x] 2.2 Layers, legend, trail lookup, location search and picker, crosshair
- [x] 2.3 Route planner, track drawing, offline regions (draw, download, list)

## 3. Tours

- [x] 3.1 Tour list sheet, filters, suggestion rows
- [x] 3.2 Tour info sheet, fact rows, outings, linked-with section, collisions, backfill page
- [x] 3.3 Tour form and creation dialog, attachments picker and viewer (PDF)

## 4. People and profile

- [x] 4.1 Contacts list, detail, form, action menu, vCard and Contact Picker import
- [x] 4.2 Friend requests, friendships, blocks
- [x] 4.3 Profile sheet and overview, phone verification, notification preferences, inbox, feedback

## 5. Calendar

- [x] 5.1 Calendar page, planned calendar, seasons Gantt, availability, calendar sync settings

## 6. PWA platform

- [x] 6.1 `tables.web.ts` (IndexedDB), file cache (Cache Storage), reachability
- [x] 6.2 Service worker, `build-sw.mjs`, manifest, icons, `_headers`, update prompt, install banner
- [x] 6.3 Web Push subscription; push and notification click
- [x] 6.4 Guided product tour
- [x] 6.5 Same-origin carry-over checked against a PWA profile (session, settings, regions, push)

## 7. Release

- [x] 7.1 Preview deploy and cleanup workflows; `release.yml` web deploy behind `WEB_DEPLOY`
- [x] 7.2 `docs/publishing.md`, AGENTS.md (web is the PWA port), `docs/vue-repo-migration.md`
- [x] 7.3 Diff PWA releases after 0.54.0 into the port
- [x] 7.4 `npm run check`, web export, first-load size measured
- [ ] 7.5 Persona review side by side with the PWA until PASS; owner handoff
