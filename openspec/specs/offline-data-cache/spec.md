## Purpose

Last-known-good IndexedDB copy of every store-loaded collection, namespaced per user, so the app renders offline: loads hydrate from cache, then refetch when the backend is reachable, gated by one shared online/offline signal.

## Requirements

### Requirement: Reconnect reconciles the cache via the existing realtime refetch

On regaining connectivity, the system SHALL refresh cached collections through the
existing Realtime re-subscription refetch path (the `onSubscribed` full refetch)
rather than a separate sync mechanism, overwriting the cache with fresh backend
state. That refetch SHALL wait for the write-queue drain first (`flushThenRefetch`, see
`offline-write-sync`), so a replayed write is never clobbered by the snapshot.

#### Scenario: Cache refreshed after reconnect

- **WHEN** the device comes back online and the realtime channels re-subscribe
- **THEN** the affected stores refetch and overwrite their cached snapshots with
  current backend data

### Requirement: Offline cache in the app's database on native
On iOS and Android the system SHALL keep a last-known-good copy of owned tours, friend tours, contacts, the profile, availability, friendships, the inbox and the user id to phone lookup in the app's own database, per user, hydrate each load from it and refetch when reachable, and delete a user's rows on sign-out. The web keeps the same copy in the browser (`web-app`, "Offline data on the web").

#### Scenario: Cold start offline
- **WHEN** a signed-in user starts the app in airplane mode
- **THEN** tours, friend tours, contacts, profile, availability, friendships and the inbox show from the cache

#### Scenario: Another user signs in
- **WHEN** user A signs out and user B signs in on the same device
- **THEN** none of A's cached data appears for B

### Requirement: Reachability from the operating system
One shared reachability signal SHALL derive from the operating system's network state, counting the backend unreachable when the system reports no internet or the session is unverified; stores SHALL consult it before any request and the UI SHALL show it.

#### Scenario: Wi-Fi without internet
- **WHEN** the device is on a Wi-Fi without internet access
- **THEN** stores skip their requests and the offline banner shows

### Requirement: Offline banner on every screen
While offline, on an unverified session, or while changes wait to sync, a one-line banner SHALL show at the top of the current screen's content (below its navigation bar, or at the top of the map) saying which: offline with saved data, the number of changes waiting, or the number still syncing. It SHALL never cover a control and SHALL appear and leave smoothly.

#### Scenario: Waiting changes
- **WHEN** the user edits two tours offline
- **THEN** the banner says two changes are waiting to sync

### Requirement: Loads hydrate, then refetch when reachable
Each store load SHALL show the cached snapshot first, then refetch only when the backend is reachable (the reachability signal reports internet and the session is verified) and overwrite the cache; otherwise no request SHALL be made. When an unverified session becomes verified, the affected stores SHALL refetch. This holds on the web too, with the browser's copy.

#### Scenario: Unverified session
- **WHEN** the app starts offline on an adopted session and the connection returns
- **THEN** no request is sent until the session is verified, and then every store refetches
