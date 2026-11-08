# Supabase Realtime & PWA energy

How TourenBuddy uses Supabase Realtime (`postgres_changes`) to keep the UI in
sync, and the visibility-aware pause we layered on top so the PWA does not burn
battery (or your laptop fans) while the tab is in the background.

## What we use Realtime for

Realtime is **UI-sync only.** It keeps a local Pinia store consistent with the
database when the same user mutates data in another tab or device, or when
something they have access to changes server-side (a friend accepting a
request, a tour being linked, a block being lifted).

It is **never** the trigger for user-facing notifications. Notifications are
recorded by the database in the writing transaction and delivered by the
`services/email-hook` Worker (see [notifications.md](./notifications.md)). If you
catch yourself thinking "I'll fire a notification from `onChange`", stop —
that path will double-fire, drop on missed events, and bypass the recipient's
mute settings.

### Channels in production

Five stores currently subscribe, each with a tightly scoped filter:

| Store                    | Table              | Filter             |
| ------------------------ | ------------------ | ------------------ |
| `tours-store`            | `tours`            | `user_id=eq.<uid>` |
| `tour-attachments-store` | `tour_attachments` | `user_id=eq.<uid>` |
| `friendships-store`      | `friendships` (+)  | viewer-scoped      |
| `user-blocks-store`      | `user_blocks`      | viewer-scoped      |
| `tour-links-store`       | `tour_link_*`      | viewer-scoped      |

Filters are always user-scoped so Realtime's fanout is bounded to rows the
caller actually owns or participates in. No store subscribes to an unfiltered
table — that would invite both a privacy footgun (you'd receive change events
about rows you can't read under RLS) and a fanout cost problem at scale.

## The composable: one entry point

All subscriptions go through `src/core/realtime/use-realtime-subscription.ts`.
Features should never call `supabase.channel(...)` directly.

```ts
useRealtimeSubscription({
  key: () => `tours:${userId.value}`,
  enabled: () => !!userId.value,
  bindings: () => [{ event: '*', table: 'tours', filter: `user_id=eq.${userId.value}` }],
  onChange: loadTours, // debounced 150 ms
  onSubscribed: () => loadTours(), // initial + every re-subscribe
})
```

What the composable gives you:

- **Channel deduping.** Channels are keyed and refcounted at the module level.
  Two stores using the same `key` share one underlying `RealtimeChannel`.
- **150 ms debounce on `onChange`.** Burst inserts coalesce into one refetch
  instead of N store invalidations.
- **`onSubscribed` is the recovery hook.** It fires after every successful
  `SUBSCRIBED` transition — initial subscribe, key change, and (see below) any
  resume from a paused state. Always provide it, and always make it do a full
  refetch. `onChange` alone cannot recover from missed events.
- **Auth-refresh aware.** A module-singleton `TOKEN_REFRESHED` listener calls
  `supabase.realtime.setAuth(...)`, so long-lived channels keep working across
  silent token rotations.

## PWA energy optimization: pause while hidden

Background tabs and a hidden PWA window are the dominant energy cost of
Realtime on mobile. A WebSocket that does "nothing" still consumes the radio
on a periodic keepalive cadence, and every fanned-out `postgres_changes`
payload wakes the JS engine, runs the debounce timer, and ultimately calls
back into a store that nobody is looking at. Across five channels and a
multi-hour session, that adds up.

The composable solves this with one rule: **if the document is hidden, all
Realtime channels are released. When it becomes visible again, they are
re-subscribed and the store refetches.**

Concretely:

1. A module-level `pageVisible` ref tracks `document.visibilityState`.
2. The same `watch` that already reacts to `key` and `enabled` now also
   reacts to `pageVisible`. Hidden ⇒ `releaseChannel(...)` ⇒ refcount drops
   to zero ⇒ `supabase.removeChannel(...)` ⇒ the WebSocket closes.
3. Visible again ⇒ the watch re-runs ⇒ the channel is re-created ⇒
   `onSubscribed` fires ⇒ the store refetches to close any event gap.
4. While hidden, `status` reports `'paused'` (vs `'idle'` when the
   subscription is explicitly disabled). Useful for debugging and for any
   future UI affordance that wants to indicate "live updates resume on focus".

### Implications you must respect

- **`onSubscribed` is mandatory in practice.** If a store only implements
  `onChange`, it will silently miss every `INSERT/UPDATE/DELETE` that
  happened while the tab was hidden. The refetch in `onSubscribed` is what
  makes the pause safe.
- **No grace period.** Pause is immediate on `visibilitychange`. Brief
  blur/focus thrashes will tear down and re-create the channel; that's
  cheaper than holding the socket open. If this ever becomes a hot path
  (e.g. quick alt-tabbing in dev), add a small delay before tearing down —
  not before resuming.
- **Token freshness on long pauses.** If a tab is hidden long enough for an
  access token to expire, the resume path picks up the refreshed token
  automatically — `setAuth` already ran via the auth listener while the tab
  was hidden, and the new channel created on resume uses the current
  session.
- **Tests.** Tests do not fire `visibilitychange`, so the pause path is
  inert under Vitest. `__resetRealtimeRegistry` clears channels between
  cases. If you need to assert pause behavior, drive
  `document.visibilityState` directly via a `Object.defineProperty` stub
  and dispatch the event.

## What this does _not_ solve

- **MapLibre GPU cost.** A visible map keeps a WebGL context busy
  regardless of Realtime. The `map.remove()` on route unmount is the only
  lever there; see `architecture.md` → Map.
- **Local-dev multi-tab heat.** N tabs × M channels still costs N×M while
  _all_ tabs are foregrounded. Visibility pause only helps the tabs you are
  not currently looking at. For multi-user manual testing, prefer
  background-tabbing the inactive users.
- **Server-side fanout cost.** Realtime broadcasts every matching row
  change to every subscriber. User-scoped filters keep this bounded today;
  if a future store needs a broader filter, weigh the fanout cost against
  doing a periodic refetch instead.

## Where it lives

- Composables: `src/core/realtime/use-realtime-subscription.ts` (`postgres_changes`),
  `src/core/realtime/use-realtime-broadcast.ts` (private `friend-tours:<uid>` /
  `availability:<uid>` topics)
- Subscribers: the stores under `src/features/{tours,contacts,user,friendships,tour-links,calendar,notifications}/presentation/stores/*`
- Architecture summary: `.claude/architecture.md` → Realtime
- Service Worker (separate concern, OS-level push only): `src/sw.ts`
