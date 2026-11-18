## REMOVED Requirements

### Requirement: Loads hydrate from cache then refetch when online
**Reason**: Restated for the native cache and an online-only web.
**Migration**: "Loads hydrate, then refetch when reachable" below.

### Requirement: Store-loaded collections are cached locally for offline read
**Reason**: Restated for the native apps' database and for an online-only web (#346 D8).
**Migration**: "Offline cache in the app's database on native" below.

### Requirement: A single online/offline signal drives stores and UI
**Reason**: The native signal comes from the operating system's reachability, not browser events.
**Migration**: "Reachability from the operating system" below.

### Requirement: Offline data mutation handling
**Reason**: Restated: queueing is native only; the web fails writes clearly while offline.
**Migration**: offline-write-sync "The outbox survives the app on native".

### Requirement: The offline status takes its own band at the top
**Reason**: Native sheets and navigation bars belong to the system and cannot be pushed down by an app band.
**Migration**: "Offline banner on every screen" below.

## ADDED Requirements

### Requirement: Offline cache in the app's database on native
On iOS and Android the system SHALL keep a last-known-good copy of owned tours, friend tours, contacts, the profile, availability, friendships, the inbox and the user id to phone lookup in the app's own database, per user, hydrate each load from it and refetch when reachable, and delete a user's rows on sign-out. On the web nothing SHALL be cached for offline use.

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
On iOS and Android each store load SHALL show the cached snapshot first, then refetch only when the backend is reachable (the reachability signal reports internet and the session is verified) and overwrite the cache; otherwise no request SHALL be made. When an unverified session becomes verified, the affected stores SHALL refetch. On the web a load SHALL fetch directly and show an offline message when it cannot.

#### Scenario: Unverified session
- **WHEN** the app starts offline on an adopted session and the connection returns
- **THEN** no request is sent until the session is verified, and then every store refetches
