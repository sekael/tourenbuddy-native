# Proposal

## Why

Phase 1 left an empty shell: sign-in, four tabs with placeholders, the map menu, Realtime and the
release pipeline. Phase 3 (sekael/tourenbuddy_frontend_vue#370) ports the product itself: every
capability in #346 section 6, so the native app can replace the PWA (M3). The owner asked
(2026-11-09) to propose and implement Phases 2 to 4 in one pull request, with an independent
reviewer, a long-time iOS user who knew the PWA, standing in for per-proposal approval until
satisfied, as in Phase 1. This change is Phase 3; `add-native-polish` is Phase 4 and
`add-public-pages` carries the web side of Phase 2.

## What Changes

The PWA's behavior moves over slice by slice, in #370's dependency order. Plain TypeScript (domain,
data, Zod schemas and their tests) is copied and adapted; every screen is rebuilt from the adaptive
layer, so iOS gets system components and Android and web get Material 3.

- **Foundation for the slices:** a data layer per feature (`data/`, `domain/`) ported from the PWA;
  Zustand stores with the PWA stores' shape that subscribe through `subscribeRealtime` and clear on
  sign-out; adaptive grouped lists and forms (SwiftUI `List` and `Form` on iOS); a stack with large
  titles inside each tab; sheets with detents over the map.
- **Map core:** the Swisstopo map (four base maps, hiking and ski overlays, legend, layers sheet),
  tour markers with clusters, pie markers and stacks, tour labels, start and end markers, calm
  camera flights; the map's thumb zone holds a glass "My tours | Add tour" capsule, the legend and
  the menu circle.
- **Tours and GPX:** tours list sheet (Mine and Friends, search, filters), tour detail sheet, tour
  form as a full-screen system form (types, grade, dates, start time, points with location pick,
  elevation and name lookups, seasons, description, equipment, notes, visibility, partners), outings
  and segments, completion, GPX import, display and share, elevation profile.
- **Track drawing and lookup:** draw a track on the map with snapping to Swisstopo's hiking and ski
  networks, undo, drag, pace; ski route lookup by tap with a trail card and "plan a tour".
- **Attachments:** photos and PDFs per tour from the photo library, camera or Files, upload
  progress, reorder, delete, a full-screen viewer and share.
- **Contacts:** the Contacts tab (search, sections), contact detail with quick actions, the contact
  form with methods and a primary phone, import from the system contact picker and `.vcf` files,
  account linking and the connect prompt.
- **Friendships and blocks:** friend requests (received, sent, blocked), accept, deny, cancel,
  unfriend, block with report, the 48-hour unblock cooldown.
- **Tour links and suggestions:** collision notices, link requests, linked tours, suggestions with
  review and history, the backfill screen.
- **Calendar:** the Calendar tab (planned month view with day preview, seasons view), availability,
  inbound calendar feeds and the outbound `.ics` feed.
- **Inbox and push:** the inbox sheet from Profile, push opt-in per device through the OS, token
  registration (Phase 2's `register_device_push_token`), opening a notification at its target.
- **Profile and account:** the Profile tab as a system settings list: profile and phone
  verification, notifications, calendar sync, language, pace, password and passkeys (Phase 1),
  feedback, privacy policy, terms and imprint, sign out, account deletion (Phase 2's route).
- **Onboarding and release notes:** profile completion on first sign-in, a welcome sheet listing what
  the app does (each row opens its place) instead of the spotlight tour, an inline calendar tip,
  release notes in the inbox.
- **Offline data and writes:** a SQLite cache that hydrates every store, the single `mutate()` seam
  with a durable outbox (coalescing, FIFO replay, last-write-wins, dead letters), an offline bar.
  Native only; web stays online-only with a clear message (#346 D8).
- **Offline maps:** regions downloaded as native offline packs, with progress, list and delete.

Where the native app deliberately differs from the PWA (a system sheet instead of a bottom sheet,
the OS contact picker, the share sheet instead of a download, OS push instead of Web Push, SQLite
instead of IndexedDB), the affected requirements are removed and restated; everything else holds as
specified. The specs in this repository describe the native and web apps; the PWA keeps its own
specs in the Vue repository until it is retired (Phase 7). Once this change is archived, this
repository's `openspec/specs` no longer equal the PWA parity baseline (`tourenbuddy-frontend-v0.52.0`):
the baseline stays readable at that tag in the Vue repository.

## Capabilities

### New Capabilities

- `adaptive-lists-forms`: grouped lists and forms built from system components.

### Modified Capabilities

- `app-navigation`: per-tab stacks, the map's sheets and full-screen forms, the inbox badge.
- `map-integration`: the native map, its controls and gestures.
- `tour-action-bar`: the glass capsule in the map's thumb zone.
- `tour-list-view`: the list sheet with system search and segments, filters as a pushed screen.
- `tour-creation-flow`: the route step's sheet over the live map.
- `tour-form-extended`: picks without a collapsed form header.
- `contacts`: the contact detail as a pushed screen.
- `speed-dial-icon-transition`: the trigger icon on Android and web only.
- `bottom-sheet`: system sheets with detents replace the custom sheet.
- `gpx-tracks`: GPX leaves the app through the share sheet.
- `tour-attachments`: system pickers, viewer and share sheet.
- `contact-device-import`: the OS contact picker on iOS and Android.
- `contact-phone`: phone actions open the system apps.
- `notifications`: native push opt-in, settings link and token registration.
- `notification-inbox`: the inbox sheet entered from Profile, opened from a push.
- `offline-data-cache`: SQLite storage, native only.
- `offline-write-sync`: the outbox on SQLite with OS connectivity and lifecycle triggers.
- `offline-map`: native offline packs per region.
- `user-profile`: the Profile tab and account deletion.
- `onboarding-tour`: a native welcome sheet replaces the spotlight tour (owner-approved revision, design D12).
- `calendar-tour`: an inline tip replaces the calendar's spotlight tour.

## Impact

- Code: `src/features/{tours,map,contacts,friendships,tour-links,calendar,notifications,user,
  onboarding}`, `src/core/{offline,adaptive}`, routes under `src/app`. Ported tests under `test/`.
- Dependencies (each added with `npx expo install`): MapLibre (native and GL JS), Skia, SQLite,
  NetInfo, notifications, application, document and image pickers, sharing, contacts, clipboard,
  haptics, crypto, web browser, glass effect, `libphonenumber-js`, `@tmcw/togeojson`,
  `@xmldom/xmldom`, `@mapbox/vector-tile`, `pbf`; `patch-package` for the MapLibre iOS drag fix
  from S3.
- Native config: the plugins above in `app.config.ts`, usage strings for photos and camera in both
  languages, the APNs entitlement. The owner runs `npm install`, `npx expo prebuild --clean` and a
  pod install before the next Simulator build.
- Backend: Phase 2 (`add-native-backend` in the Vue repo) must be on the local stack for push
  registration, account deletion and abuse alerts.
- Exception to AGENTS.md "each change reaches main through its own pull request": owner's request
  (2026-11-09) to bundle Phases 2 to 4 in one pull request, as for Phase 1.
