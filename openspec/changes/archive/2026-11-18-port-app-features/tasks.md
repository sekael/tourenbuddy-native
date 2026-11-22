# Tasks

## 1. Git and dependencies

- [x] 1.1 Branch `feat/370-feature-port` from `feat/368-auth-realtime-release` (stacked on PR #3, not merged yet)
- [x] 1.2 Add dependencies with `npx expo install` in the container's sandbox; copy `package.json` and `package-lock.json`; config plugins in `app.config.ts`; `patches/` with the S3 MapLibre drag patch and `postinstall: patch-package`
- [x] 1.3 `EXPO_PUBLIC_NOTIFY_HOOK_URL` in `env.ts`, README and CI env

## 2. Foundation

- [x] 2.1 `core/session.ts` (start/reset registry), auth store calls it; root layout starts it
- [x] 2.2 Adaptive lists and forms (`list.ios.tsx` SwiftUI, `list.tsx` Material): GroupedList, ListSection, ListRow, ToggleRow, TextRow, PickerRow, DateRow, StepperRow, EmptyState; tests per platform
- [x] 2.3 Per-tab stacks for Calendar, Contacts, Profile with large titles; sheet and modal route options
- [x] 2.4 Shared helpers ported: phone normalization, formatter, pace, color, haversine, wgs84-to-lv95, format-bytes, app version, storage upload from file URIs

## 3. Map core

- [x] 3.1 Map data: Swisstopo styles, trail overlays, ski-route dataset, search service (ported with tests)
- [x] 3.2 `TourMap` native (MapLibre RN) and web (`maplibre-gl`), map store (camera, style, overlays persisted, selection)
- [x] 3.3 Marker images drawn with Skia up front: pins per colour, pie wedges, cluster faces, ski badges
- [x] 3.4 Tour markers: clusters with pies, stacks for the same spot, labels, completed state, start/end markers for the open tour, calm flights and framing above a sheet
- [x] 3.5 Thumb-zone chrome: glass capsule (My tours | Add tour), legend circle and legend sheet, menu circle; map layers sheet
- [x] 3.6 Location search in picks (ported service, debounced, offline-aware)

## 4. Tours and GPX

- [x] 4.1 Tours domain and data ported with tests (entities, route metrics, same-tour, outings, grades, seasons, repositories, GPX parser and storage, elevation, name and profile services)
- [x] 4.2 Tours store and friend tours (broadcast), tour suggestions store
- [x] 4.3 Tours list sheet: segments, search, filters, rows, swipe actions
- [x] 4.4 Tour detail sheet: facts, legs and route numbers, points, seasons, description with links, equipment, notes, partners, completion, visibility, share GPX, edit, delete, outing navigator
- [x] 4.5 Tour form (system form): types, grade, dates, start time, points with location pick, elevation and name auto-fill, seasons, description, equipment, notes, visibility, partners, GPX import; draft store; discard confirmation
- [x] 4.6 Route step and point picks on the live map: map store modes, `plan` sheet (small/medium, undimmed), start/goal/end by tap or search, legs along the ways, climb/descent, handles, round trip, suggestions; form draft kept across
- [x] 4.7 GPX on the map (lines per leg, darker type colour, direction connector), elevation profile while drawing (static, as the PWA)
- [x] 4.8 Outings: segments, overview, add segment, navigator on the map

## 5. Track drawing and lookup

- [x] 5.1 Trail network and routing ported with tests (track-routing, snap-network, drawn-track, leg router)
- [x] 5.2 Track drawing on the live map with the `draw` sheet: tap to add, drag points, undo, back to start, live numbers, pace, save as GPX
- [x] 5.3 Ski route lookup by tap, candidate list, trail card, plan a tour from a route

## 6. Attachments

- [x] 6.1 Attachment repository and store ported (caps, types, dedupe names, progress, cancel, reorder)
- [x] 6.2 Pickers (library, camera, Files), strip in the detail and form, Quick Look viewer (cache-first bytes), share

## 7. Contacts

- [x] 7.1 Contacts domain, data, vCard parser, import rules ported with tests
- [x] 7.2 Contacts tab: search, sections, friendship icons, blocked badges, empty state
- [x] 7.3 Contact detail: hero, quick actions, methods, primary switch, friend's tours, edit, delete with warnings, block
- [x] 7.4 Contact form (methods, duplicates, linked-phone warnings), import (system picker, vCard), results, connect prompt

## 8. Friendships and blocks

- [x] 8.1 Friendships and user-blocks domain, data, stores ported with tests
- [x] 8.2 Friend requests sheet (received, sent, blocked), accept, deny, cancel, unfriend, block with report, cooldown

## 9. Tour links and suggestions

- [x] 9.1 Tour-links domain, data, store ported
- [x] 9.2 Collision notice, link request banner, linked-with section, edit warning, backfill screen
- [x] 9.3 Suggestions: compose from a partner's tour, review sheet, history

## 10. Calendar

- [x] 10.1 Calendar domain, data, availability and feed stores ported with tests
- [x] 10.2 Calendar tab: Planned month grid with own and friends' availability, day preview, Seasons view
- [x] 10.3 Edit availability (tap and drag), save as diff
- [x] 10.4 Calendar sync settings (feeds, window, outbound `.ics` copy and `webcal:`), from Profile

## 11. Inbox and push

- [x] 11.1 Notifications domain, data, inbox store, preferences ported with tests
- [x] 11.2 Inbox sheet (rows, staleness, collapse, mark read, delete, clear), release-note view
- [x] 11.3 Push: permission, token registration, opt-out, sign-out removal, tap handling, foreground banners

## 12. Profile and account

- [x] 12.1 User domain, data, profile store ported; onboarding (name) gate, skip
- [x] 12.2 Profile tab settings list; edit profile; phone verification with security notice; language; pace
- [x] 12.3 Notifications settings (mutes, email, push), feedback sheet, legal links, delete account

## 13. Onboarding and release notes

- [x] 13.1 Welcome sheet (name step, feature index opening each place), gate, Profile reopen, calendar tip
- [x] 13.2 Release notes bundled and recorded once per user

## 14. Offline data and writes

- [x] 14.1 Port the 10 `core/offline` test files first, then `core/offline` on SQLite and NetInfo
  - Mapping of the PWA's `test/core/offline` files to `test/core/offline`: `blob-cache` → `file-cache` (cache-first edges; keys never change, so the PWA's `preferCache` order is the only one) and `staged-files` (pending marks); `cached-load`, `entity-cache`, `replay`, `write-queue` → same names; `flush-triggers` → `triggers`; `mutate` and `mutate-offline` → `mutate` (unverified queueing, one entry per entity, atomic rollback; the Blob round-trip is `staged-files`, the Vue-reactive clone case has no native counterpart); `reconnect` → `replay` ("refetch only after the drain, and still refetch when the drain fails"); `use-online-status` → `online` (NetInfo replaces window events and the HEAD probe)
- [x] 14.2 Stores hydrate through `cachedLoad`; every mutation through `mutate()`; replay handlers per kind
- [x] 14.3 Offline bar, pending-sync indicator, dead-letter review

## 15. Offline maps

- [x] 15.1 Region drawing, estimate, pack download with progress, list, delete, completeness

## 16. Finish

- [x] 16.1 Locales in both catalogs; `npm run check`
- [x] 16.2 Independent review until satisfied (approved in round 5, 2026-11-12)
