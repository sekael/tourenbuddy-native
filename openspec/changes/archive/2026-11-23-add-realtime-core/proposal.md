# Proposal

## Why

Eleven stores in the Vue app keep their data live through Supabase Realtime (#346 section 2), all
through two core primitives with rules every port depends on (#346 section 6, "Invariants to port
exactly"): user-scoped filters, shared refcounted channels, changes debounced by 150 ms, a refetch
whenever a channel (re)subscribes, channels closed while the app is in the background, and Realtime
never dispatching notifications. Phase 1 builds this core once, before the first store is ported
(sekael/tourenbuddy_frontend_vue#368, change 4).

## What Changes

- **One subscription primitive** in `src/core/realtime` for both transports the PWA uses: Postgres
  changes (table bindings with filters) and private broadcast topics. A consumer passes a topic, its
  bindings or broadcast event, `onChange` and `onSubscribed`, and gets an unsubscribe function. It
  is plain TypeScript, so Zustand stores call it directly; no component has to be mounted.
- **Shared channels:** consumers of the same topic share one channel; it closes when the last one
  leaves. Unlike the PWA, every consumer of a shared channel gets its own `onChange` and
  `onSubscribed` (the PWA wired only the first consumer's callbacks to a shared channel).
- **150 ms debounce** per consumer, cancelled when it unsubscribes.
- **Refetch on subscribe:** `onSubscribed` runs each time the channel reaches `SUBSCRIBED`
  (first join, rejoin after an error, resume from background), and at once for a consumer joining a
  channel that is already subscribed.
- **Background pause:** channels close when the app goes to the background (`AppState`; on web the
  page is hidden) and reopen when it is active again, which refetches. A brief `inactive` state
  (Control Center, the app switcher) does not close them.
- **Unverified to verified:** when an adopted session (`add-auth-session`) is confirmed, consumers on
  a subscribed channel refetch, as in the PWA, because reads were skipped while it was unverified.
- **Realtime is UI sync only:** documented in the module and in `AGENTS.md`; the primitive has no
  path to notifications.
- No `setAuth` listener: supabase-js 2.119 passes refreshed tokens to Realtime itself.

## Capabilities

### New Capabilities

- `realtime-sync`: how the app keeps data live: shared channels, debounce, refetch on subscribe,
  pausing in the background, and the separation from notifications. Feature specs keep their
  bindings and say which store refetches.

### Modified Capabilities

None. The feature specs that name the Vue primitives (`friendships`, `contacts`, `tours`, ...) are
rewritten by their ports.

## Impact

- Repository `sekael/tourenbuddy-native`, branch `feat/368-auth-realtime-release`. At the owner's
  request (2026-11-07) this change goes into one pull request with `add-auth-session` and the other
  Phase 1 change, approved by an independent reviewer before implementation and reviewed by the
  owner as a whole at the end: a recorded exception to one pull request per change.
- No new dependency (`@supabase/supabase-js` comes with `add-auth-session`). No consumer yet: the
  first stores arrive with the Phase 3 ports. No backend change.
