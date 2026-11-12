# Design

## Context

The PWA is ~50k lines: ~7k of plain TypeScript in `domain`/`data`, ~5.5k of Pinia stores, ~40k of
Vue presentation. The native shell (Phase 1) has the adaptive layer (`src/core/adaptive`: button,
sheet, floating menu, icon, text, text field), auth, Realtime and four tabs. The owner's UI rules
(D19, rounds 1 to 4 of `add-adaptive-ui`): real system components and native transitions on iOS,
no look-alikes; primary controls in the thumb zone; calm motion that honors Reduce Motion.

## Goals / Non-Goals

**Goals:** every capability of #346 section 6 on iOS, with Android and web correct and building
(Android is deprioritized, #346 "Important Context"; web is online-only, D8); iOS screens built from
system components; the PWA's invariants (#346 section 6) ported exactly.

**Non-goals:** pixel parity with the PWA; Android device polish; web offline; new features (#346
"Out of scope"). Deep links, update gate, permissions polish, accessibility audit and icons are
Phase 4 (`add-native-polish`).

## Decisions

### D1: One change, slices as task groups

The slices share one foundation (D2 to D6) and land in one pull request, so one change carries them;
`tasks.md` groups the work by #370's slices in dependency order, and each group ends with its tests.
Specs are rewritten only where the native app differs (proposal, "Modified Capabilities"); every
other requirement stays the acceptance source as written.

### D2: Data layer ported, not rewritten

`features/<f>/domain` and `features/<f>/data` are copied from the PWA with four mechanical edits:
`@/core/utils/supabase` → `@/core/supabase`, `useLogger(tag)` → `createLogger(tag)`, `env` →
`@/core/env` (which gains `EXPO_PUBLIC_NOTIFY_HOOK_URL`, the Worker), and browser APIs replaced:
`DOMParser` → `@xmldom/xmldom`, `File`/`Blob` uploads → a local file URI read with
`expo-file-system` and sent as an `ArrayBuffer`, IndexedDB → SQLite (D9). Their Vitest suites move
with `vi.` → `jest.`. Domain keeps zero React imports; features import each other only through
their stores' public actions, never internals (as in the PWA).

### D3: Stores

One Zustand store per Pinia store, same state (`data`, `isLoading`, `error`) and action names, so a
spec's "the tours store refetches" reads the same. A store subscribes through `subscribeRealtime`
inside an action (`start()`) and keeps the returned functions; `clear()` ends them and empties
state. The root layout, which as part of `src/app` may compose features, starts every store once a
user is known and clears them all when the user signs out or changes (a different id), before the
next user's data loads; the PWA's `setupAuthRedirect` did the same from `main.ts`. `core` and the
auth feature import no feature.

### D4: Navigation and presentation

Routes (Expo Router), all inside the signed-in `Stack.Protected` group of `src/app/_layout.tsx`:

| Route | Presentation | iOS | Android / web |
|---|---|---|---|
| `(tabs)/index` | Map tab | map, glass chrome | map, FABs |
| `(tabs)/calendar/…`, `(tabs)/contacts/…`, `(tabs)/profile/…` | a stack per tab | large title, system search in the bar, push transitions | top app bar |
| `tours` | sheet, detents medium/large, undimmed at medium | the map stays live beside it | bottom sheet / side dialog |
| `tour/[id]` | sheet, detents medium/large, undimmed at medium | same | same |
| `tour/edit` (new or `?id=`) | full-screen modal with Cancel / Save | system form | full-screen dialog |
| `plan` | sheet over the live map, detents small/medium, undimmed | route step and point picks | same; web: side panel |
| `draw` | sheet over the live map, detents small/medium, undimmed | track drawing | same; web: side panel |
| `inbox`, `friend-requests`, `contact/edit`, … | sheets / modals | system sheets | Material |

A tour detail sheet at its medium detent leaves the map interactive (`sheetLargestUndimmedDetent`),
which is how Apple Maps shows a place; opening it frames the marker in the space above the sheet
and never re-flies when the sheet is dragged (map-integration "Calm camera flights").

The route step (Add tour), a point pick from the form and track drawing run on the Map tab's live
map, as in the PWA (tour-creation-flow): the map store switches its mode (`browse`, `route`,
`pick`, `draw`, `region`) and the step's controls open as a sheet (`plan`, `draw`) with a small and
a medium detent, undimmed, so the map above takes taps, drags and the step's markers. The form is a
full-screen modal; opening a step from it dismisses the form, its draft kept in the `tour-draft`
store, and Done or Cancel presents it again with every field as it was (tour-form-extended
"Location pick preserves unsaved form edits"). On the web the form sits in the side panel beside the
map, which keeps the PWA's desktop flow.

### D5: Adaptive lists and forms

New adaptive components in `src/core/adaptive/list*`: `GroupedList`, `ListSection`, `ListRow`
(title, subtitle, value, leading icon or avatar, chevron, destructive, swipe actions, context
menu), `ToggleRow`, `TextRow`, `PickerRow`, `DateRow`, `StepperRow`, `EmptyState`.

- **iOS:** one `Host` per screen holding a SwiftUI `List` (inset grouped) or `Form` from
  `@expo/ui`; rows are SwiftUI `Button`/`LabeledContent`/`Toggle`/`TextField`/`Picker`/
  `DatePicker`/`Stepper` with `swipeActions`, `contextMenu` and `badge`. Separators, row heights,
  Dynamic Type, haptics and VoiceOver come from the system. Content that SwiftUI rows cannot show
  (the elevation profile, the attachment strip) sits in a section through `RNHostView`.
- **Android and web:** a `ScrollView` of Material 3 list items with the same props.

Rows that act get the system's feedback: context menus (long press) on tour rows (open, complete,
share GPX, delete), contact rows (call, message, WhatsApp, copy, delete) and inbox rows (mark read,
delete); swipe actions where the PWA had a destructive or toggle action; selection and success
haptics on toggles, saves and completed tours (`expo-haptics`; haptics are not motion, so Reduce
Motion does not turn them off — the system's own haptics setting does).

Feature screens compose these and never branch on the platform. Screens whose content is not a list
(the map, the month grid, the seasons chart, the onboarding coach marks) are React Native views on
all platforms: they are content, not chrome, and have no system counterpart.

### D6: Map

`@maplibre/maplibre-react-native` 11.5 on iOS and Android, `maplibre-gl` on web (`*.web.tsx`),
both behind `TourMap` (props: style, overlays, tours, selection, padding; ref: `flyTo`, `fitBounds`,
`queryAt`). From S3 (#367): every marker image (pin per type colour, pie wedges, cluster face,
ski badges) is drawn with Skia once at start, because a native map asks for a missing image once;
cluster pies sum per-colour weights in `clusterProperties` with the full reduce form; the iOS drag
patch for `onDrag` ships through `patch-package`. Base maps: vector Base, Aerial, Light and the
raster Classic. Overlays: hiking and ski WMTS rasters plus the self-hosted ski-route vector halo
and badges, toggled by `visibility` so the order never changes.

Map chrome on iOS uses real glass: a SwiftUI `GlassEffectContainer` capsule for "My tours | Add
tour" at the bottom centre, a glass circle for the legend at the bottom leading edge, and Phase 1's
menu circle at the bottom trailing edge, all right above the tab bar. The PWA's map-store
(camera, style, overlays, selection) becomes a Zustand store; overlay choice persists on the device
(SQLite key-value, D9).

### D7: Files

- **GPX in:** `expo-document-picker` (GPX UTI registered in Phase 4), parsed with
  `@tmcw/togeojson` on `@xmldom/xmldom`, uploaded from bytes.
- **Attachments in:** photo library and camera (`expo-image-picker`, `exif: true` kept, the
  limits of the PWA: PNG, JPEG, PDF, 10 MB, cap per tour), Files (`expo-document-picker`).
- **Out:** GPX and attachments go to a temporary file and the share sheet (`expo-sharing`):
  "Save to Files", AirDrop, Mail.
- **Viewing:** attachments open in the system's Quick Look (expo-file-system's static `File.preview`,
  which calls the module's `preview(files, initialIndex)`; the viewer Files and Mail use): swipe
  between a tour's attachments, zoom images, read PDFs, share and mark up from its toolbar. The bytes come from the app's file cache first (tour-attachments
  "Attachment bytes are read cache-first"), downloaded through a short-lived signed URL when
  missing; signed URLs are never persisted (#346 section 6). Android previews one file at a time
  with the system viewer; the web opens the file in a new tab.
- **Photos:** `expo-image-picker` with `preferredAssetRepresentationMode: 'compatible'` on iOS, so
  HEIC photos arrive as JPEG within the PWA's allowed types; EXIF kept (`exif: true`).

### D8: Contacts from the device

`presentContactPickerAsync` from `expo-contacts/legacy` shows the system picker without the Contacts
permission (iOS: `CNContactPickerViewController` runs out of process; Android: the contact pick
intent, whose result carries a one-time read grant). The legacy entry point, not SDK 58's
`Contact.presentPicker()`: checked in the module's Swift source, the new picker resolves only the
picked contact's id (`contactFactory.create(id:)`), and reading its phones from there goes through
the contact store, which needs the permission; the legacy one serializes the picked `CNContact`
itself (`ContactsModule.didPickContact`), names and phones included. It returns one contact per pick, so "Import from Contacts" can be repeated and the results screen
collects what was imported; several contacts at once come as a `.vcf` exported from the Contacts
app (iOS share sheet: "Export vCard"), through the document picker and the PWA's vCard parser.
The legacy module may go in a later SDK: re-check this import slice on each SDK upgrade.
Phone actions (`tel:`, `sms:`, `https://wa.me/`, `mailto:`) go through `Linking.openURL`;
WhatsApp falls back to the browser when the app is missing (`LSApplicationQueriesSchemes` in
Phase 4).

### D9: Offline

Native only (D8): `expo-sqlite` replaces IndexedDB. One database `tourenbuddy.db`:

- `cache(store, user_id, json, updated_at)`: each store's last good snapshot per user; stores
  hydrate from it, then refetch (`cachedLoad`).
- `outbox(seq, kind, entity_id, user_id, payload, base_updated_at, blobs, attempts, state)`: the
  PWA's write queue. `mutate()` online runs the write; offline, or with an unverified session, it
  applies the optimistic state, writes the entry and the cache snapshot in one
  `withExclusiveTransactionAsync` (DC2), one coalesced entry per entity, FIFO by `seq`. A write
  that fails while online is not queued, as in the PWA (offline-write-sync queues offline and
  unverified writes only): the request may have reached the server, and replaying it would risk a
  duplicate create or a false conflict. The caller keeps the edit on screen and says the save
  failed (the tour form stays open with its draft), and once reachability drops the next attempt
  queues.
- `kv(key, value)`: small device preferences (overlay choice, last tab, push opt-in).

Online status from `@react-native-community/netinfo` (`isInternetReachable`, never interface-up
alone); drains run on reconnect, on `AppState` active and on Realtime `SUBSCRIBED`; refetch waits for
the drain (DC4); last-write-wins on `updated_at` vs `baseUpdatedAt` (DC5); a GPX picked offline is
staged as a file and uploaded on replay (`pending-upload:<key>`); attachments are online-only (DC10);
entries the server rejects move to `dead` and are listed for review (DC7). The PWA's 10
`core/offline` test files are ported first. On sign-out the database's rows of that user are
deleted and a pending queue never replays under another user (AUTH-4). Web: `mutate()` runs
writes directly and fails clearly offline.

### D10: Offline maps

`OfflineManager.createPack` per region (bounds drawn on a map, z0 to 14, the vector base map style
including the ski-route source), with the tile limit raised. Progress, list, delete; completeness is
read from the pack's status, not assumed (iOS can evict tiles). Whole-Switzerland is offered as
regions, not one pack (S3: ~2.7 GB). Hidden on web.

### D11: Push

`expo-notifications`: the Notifications section shows the OS permission state per device. Turning
push on asks for permission (only then), gets the device token (`getDevicePushTokenAsync`: APNs on
iOS, FCM on Android), and calls `register_device_push_token` with the bundle id, the APNs
environment from `expo-application` and the app version. Denied: a row linking to the app's
Settings. Turning it off and signing out delete this device's row. A tapped notification carries
`url`; its `notification` id goes through the inbox's resolver (marks it read, opens the target).
Foreground notifications show as banners. Handlers only show or navigate, never write app state
(#346 section 6).

### D12: Welcome sheet instead of a guided tour (revised during implementation)

**Approved by the owner on 2026-11-12**, over the coach-mark tour of the reviewed proposal; the
alternatives offered were coach marks as approved, and the sheet plus app-drawn inline tips.

driver.js does not exist natively, and a coach-mark overlay cannot sit above UIKit sheets and system
menus without fighting their presentation: the reviewer's first walk would hit it on step 2. The
native form is Apple's own: a welcome sheet (as Notes, Freeform or Journal show on first launch)
listing what the app does, the PWA's steps in their order with their copy, each row opening its
place. A new account names itself on the sheet's first page (the PWA's profile setup). The calendar
explains itself with an inline tip, TipKit's shape, until dismissed. The gates stay on `user_profile`
(`onboarding_tour_show_at_sign_in`, `calendar_tour_show_on_first_open`); `onboarding_tour_last_step`
is unused natively. The release note and Phase 2 web pages are unaffected.

### D13: Phase 2 dependencies

Push registration, account deletion and the abuse-report alert call the Phase 2 backend
(`add-native-backend`, Vue repo). Until it is deployed, the push toggle shows an error on enable and
account deletion answers "could not delete": both fail closed.

## Risks / Trade-offs

- **SwiftUI rows through `@expo/ui`:** the container cannot build iOS; Jest renders SwiftUI as inert
  views. Mitigation: the owner's Simulator checks (manual test plan) cover every list and form; any
  row SwiftUI cannot express falls back to `RNHostView` inside the list, not to a look-alike list.
- **Scale:** the largest change of the migration. Mitigation: slices in dependency order with tests
  per slice; the reviewer checks parity slice by slice against the PWA.
- **Map performance (R4, R15):** unchanged from S3; measured by the owner on the iPhone 15.
- **Outbox correctness (R5):** ported tests first, kill-and-replay cases in the manual plan.
