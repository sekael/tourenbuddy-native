# Design

## Context

The PWA has two near-identical composables, `use-realtime-subscription.ts` (Postgres changes) and
`use-realtime-broadcast.ts` (private broadcast), each with a module registry keyed by channel name,
a refcount, a 150 ms debounce, a `visibilitychange` pause and a module-level `TOKEN_REFRESHED`
listener. They run inside Vue effect scopes owned by Pinia stores. The native app's stores are
Zustand (D4), which have no effect scope, and the app's lifecycle is `AppState`.

## Goals / Non-Goals

**Goals:**

- The PWA's invariants, with tests that a port can rely on.
- Callable from a store action (`subscribe` on sign-in or when a key changes, the returned function
  on sign-out).

**Non-Goals:**

- A React hook: no component consumes Realtime directly in the PWA; add one with a first consumer.
- Presence, or channels that send.
- Connectivity detection and the outbox flush trigger on `SUBSCRIBED` (offline port).

## Decisions

### One primitive for both transports

`subscribeRealtime({ topic, postgres | broadcast, onChange, onSubscribed })`. A topic carries either
Postgres bindings (`event`, `table`, optional `filter`, always schema `public`) or one broadcast
event on a private channel (`{ config: { private: true } }`). One registry, one lifecycle, one set
of tests instead of two copies. The first consumer's bindings define a shared channel; topics are
user-scoped names (`friendships:<uid>`), so consumers of one topic want the same bindings.

### Each consumer keeps its own callbacks

The registry entry holds the channel and a set of listeners. Channel events fan out to every
listener's debounced `onChange`; `SUBSCRIBED` calls every listener's `onSubscribed`. A listener that
joins a subscribed channel gets `onSubscribed` at once, so its first fetch never waits for an event
that already happened. The PWA bound only the first consumer's callbacks, which worked because
Pinia stores are singletons; the native primitive should not depend on that.

### Lifecycle: `AppState`, not effect scopes

- A module-level `AppState` listener closes every channel on `background` (listeners stay
  registered) and recreates them on `active`; their `SUBSCRIBED` refetches. After an hour in the
  background the access token has expired, and realtime-js puts its cached token in the join
  message, so the listener first awaits `realtime.setAuth()`, which asks supabase-js for the
  session and so refreshes an expired token, and reopens the channels after it. Offline, that
  refresh retries for up to 30 s, so the wait is bounded at 4 s, as session restore is. The refetches go
  through supabase-js's fetch, which gets a fresh token the same way. `inactive` is ignored:
  iOS reports it for Control Center and the app switcher, where closing would only cost a refetch.
  React Native Web maps `AppState` to page visibility, which is what the PWA used.
- The unsubscribe function cancels the listener's pending debounce and removes the channel when it
  was the last listener. Calling it twice is harmless.
- A removed channel keeps its topic in realtime-js until the server confirms the leave, and
  `channel(topic)` returns that closing channel. A topic therefore reopens only after its old
  channel's removal has settled.

### Token refresh

supabase-js 2.119 calls `realtime.setAuth` on `SIGNED_IN`, `TOKEN_REFRESHED` and
`INITIAL_SESSION` (`_handleTokenChanged`), so the PWA's own listener is dropped. A test keeps this
honest: a real client, a `TOKEN_REFRESHED` event, and `realtime.setAuth` called with the new
token.

### Unverified session

The primitive subscribes to `sessionTrust` (`core/auth/session-trust.ts`): on unverified → verified,
listeners whose channel is `SUBSCRIBED` refetch. Paused channels refetch on resume anyway.

### Errors

`CHANNEL_ERROR`, `TIMED_OUT` and `CLOSED` are logged at `warn`; realtime-js rejoins on its own and
the rejoin's `SUBSCRIBED` refetches.

## Risks / Trade-offs

- [A store forgets to unsubscribe on sign-out and keeps the previous user's channel] → Topics are
  user-scoped and RLS-filtered server-side; ports call the unsubscribe function in their `clear()`,
  as the PWA's stores do.
- [Two consumers pass different bindings for one topic] → The first wins; documented on the
  function. Topics are per feature in practice.
- [supabase-js stops forwarding tokens to Realtime] → The handler check fails.
