# Architecture

## Layers

```
Presentation (Pages, Components, Pinia Stores)
    → Domain (Entities, Repository Interfaces)
        → Data (Repository Impls, Zod Schemas, Services)
            → External (Supabase, MapLibre GL JS)
```

Deps point inward. Domain = zero framework deps.

## Module Boundaries

- Features never import another feature's internals
- Cross-feature via shared composables or Pinia store subscriptions
- `core/` shared utils, never depends on features

## Auth

Supabase email/OTP (no passwords). `onAuthStateChange` at bootstrap updates auth store. Router guard reads auth store — no direct Supabase in guards. Token refresh automatic.

## Map

- `shallowRef` for map instance — prevents Vue deep-proxy of WebGL
- Tour markers as MapLibre source + layer with GeoJSON metadata
- `map.remove()` on unmount to release WebGL context
- Bidirectional camera sync between map events and Pinia store

## PWA

- `vite-plugin-pwa` + `registerType: 'prompt'`
- Precache: app shell + static assets
- Runtime cache: Swisstopo tiles (`StaleWhileRevalidate`, 500 entries, 30-day expiry)
- Explicit offline base map: users download a chosen region (or all of Switzerland) of the `ch.swisstopo.basemap.vt` vector base map — tiles **plus** the style.json / sprite / glyph PBFs so labels render offline. Stored in a dedicated `offline-map-tiles` Cache (URL-keyed on the canonical bare host; tile shards `vectortiles0-4` normalized to one key), indexed by an `offline-regions` IndexedDB ledger. The SW serves these **offline-first** (route registered before the runtime SWR route); a miss falls through to the runtime cache unchanged. See `features/map/data/services/` + `openspec/specs/offline-map`.
- Asset + tile caching (GPX objects stale-while-revalidate; attachment signed URLs network-only), plus an **offline data cache** (change: offline-app-cache-sync): the store-loaded collections (tours, friend tours, contacts, profile, calendar availability, friendships, inbox) are cached in IndexedDB (`core/offline/`) and hydrate offline via a `cachedLoad` hydrate-then-refetch path; a module-level `isOnline` signal gates the network and drives the offline UI.
- Offline data **write sync** (change: offline-write-sync): mutations go through the single `mutate()` seam — online they run directly; offline they are enqueued to a durable IndexedDB **outbox** (`core/offline/write-queue.ts`), applied optimistically, and cache-write-through in ONE transaction (DC2). One coalesced entry per entity; replayed FIFO by `seq` on reconnect via a `kind→handler` registry (`replay.ts`). The reconnect refetch waits for the drain first (`reconnect.ts` `flushThenRefetch`, DC4) so a replayed write is never clobbered by the server snapshot; drains are kickstarted by the realtime `SUBSCRIBED` event + foreground/online nudges (`flush-triggers.ts`). Conflicts are last-write-wins on server `updated_at` vs the entry's `baseUpdatedAt` (DC5). Notifications and link evictions happen in the database inside the write RPCs/triggers, so a replayed write notifies exactly once with no client involvement. A GPX picked offline is staged in the blob cache (rendering offline via the same `loadCachedBlob` path) and rides the queue entry's `blobs` (marked `pending-upload:<key>`), uploaded to Storage on replay before the row write; tour attachments stay online-only (DC10). Replay kinds: `tour`, `contact`, `profile`, `notif-prefs`, `availability`, `friendship` (unfriend), `inbox` (read/delete/clear). Friend-request actions, attachments and push registration stay online-only. Contacts are an aggregate (contact + methods): every field/method action builds the whole desired `Contact` and replays as ONE idempotent `create_contact_full`/`update_contact_full` call that reconciles the method set (client-minted ids for contact AND methods) — no multi-write replay.

## Realtime (Supabase `postgres_changes`)

- UI-sync only — **never** dispatch notifications from `onChange`. Notifications are recorded by the database (see Notifications below).
- All `postgres_changes` subscriptions go through `core/realtime/use-realtime-subscription.ts`; private broadcast topics (`friend-tours:<uid>`, `availability:<uid>`, authorized per viewer by `realtime.messages` policies) go through `use-realtime-broadcast.ts`. Do not call `supabase.channel(...)` directly from features.
- Channels are keyed and refcounted at the module level: multiple consumers of the same `key` share one channel.
- Subscriptions live in stores (`tours-store`, `tour-attachments-store`, `tour-suggestions-store`, `contacts-store`, `user-profile-store`, `friendships-store`, `user-blocks-store`, `tour-links-store`, `availability-store`, `notifications-store`, `inbox-store`). Filters MUST be user-scoped (`user_id=eq.<uid>`) — never subscribe to unfiltered tables.
- `onChange` is debounced 150 ms to coalesce burst updates into a single refetch.
- `onSubscribed` fires after every (re-)subscribe — use it to refetch state so the store is consistent even if events were missed.
- Auth refresh: a module-singleton `TOKEN_REFRESHED` listener calls `realtime.setAuth(...)` so long-lived channels keep working across token rotations.

### Energy / battery optimization

Background tabs and hidden PWA windows pause Realtime to avoid sustained WebSocket + fanout work on mobile.

- A module-level `pageVisible` ref tracks `document.visibilityState`.
- When the document becomes hidden, every active subscription tears down its channel (refcount → 0 → `removeChannel`), closing the WS.
- When it becomes visible again, the watch re-runs, the channel is re-created, and `onSubscribed` refetches — closing any gap from missed `postgres_changes` events.
- Status surfaces `'paused'` while hidden (vs. `'idle'` when explicitly disabled).
- Implication for new stores: always provide an `onSubscribed` callback that does a full refetch. Relying solely on `onChange` will silently drop events that occurred while the tab was hidden.

## Notifications

- `public.notifications` is the single event log and the in-app inbox. Rows are inserted **by the database** in the same transaction as the write that caused them — tour RPCs, friend-request trigger, link/suggestion RPCs, group-eviction sites — through `fn_emit_notification` (actor never notified, never raises). Clients can read, mark read and delete their own rows, never insert.
- `pg_cron` jobs: 90-day retention, Monday weekly availability summary, daily 5-day tour reminder. Release-note entries are recorded per user by `record_release_note` and never pushed.
- An AFTER INSERT trigger hands each row to the Worker (`POST /notify/event`, `pg_net`, after commit, shared secret from Vault `notify_hook_url` / `notify_webhook_secret`). The Worker only decides delivery: mutes, email flag, push to every registered device (`push_subscriptions` row = push on for that browser), localized copy, deep link `/?notification=<id>`.

## Database security

- RLS on every `public` table; cross-user reads go through SECURITY DEFINER functions that re-check the caller (`auth.uid()`) themselves. Views run `security_invoker` and are granted SELECT only.
- Writes the client must not do directly (tours, tour partners, friendships, blocks, suggestions, notifications) have no INSERT/UPDATE privilege or policy; the RPCs are the door.
- Functions get no implicit EXECUTE (default privileges revoked in `20261012144059_security_hardening.sql`): grant `authenticated` (and/or `service_role`) explicitly in the migration that creates the function; internal helpers get no client grant at all.
- Storage objects live under `<owner uid>/…`; every cross-user read grant also pins the object's first path segment to the owning user.
- How a client call passes the gates (JWT → role → EXECUTE → definer body), definer semantics and `search_path`: `docs/supabase-rpc-authorization.md`.
- Known gap: the `tours_select_friend` policy exposes a friends-visible tour's full row (incl. `planned_date`/`end_date`/`gpx_filepath`) to any accepted friend who queries `tours` directly — the partner gating of `friend_tours_view` is presentation-level until that policy is replaced by a definer read path.

## Error Handling

- Stores expose `loading`, `error`, `data` refs
- Custom exceptions in `core/exceptions/`
- Vue global error handler logs via logger composable

## Data Flow

```
Component → Store → Repository Interface → Impl (Supabase) → DB
```

Zod schemas validate API responses, map to domain entities.
