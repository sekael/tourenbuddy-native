## MODIFIED Requirements

### Requirement: Offline cache in the app's database on native
On iOS and Android the system SHALL keep a last-known-good copy of owned tours, friend tours, contacts, the profile, availability, friendships, the inbox and the user id to phone lookup in the app's own database, per user, hydrate each load from it and refetch when reachable, and delete a user's rows on sign-out. The web keeps the same copy in the browser (`web-app`, "Offline data on the web").

#### Scenario: Cold start offline
- **WHEN** a signed-in user starts the app in airplane mode
- **THEN** tours, friend tours, contacts, profile, availability, friendships and the inbox show from the cache

#### Scenario: Another user signs in
- **WHEN** user A signs out and user B signs in on the same device
- **THEN** none of A's cached data appears for B

### Requirement: Loads hydrate, then refetch when reachable
Each store load SHALL show the cached snapshot first, then refetch only when the backend is reachable (the reachability signal reports internet and the session is verified) and overwrite the cache; otherwise no request SHALL be made. When an unverified session becomes verified, the affected stores SHALL refetch. This holds on the web too, with the browser's copy.

#### Scenario: Unverified session
- **WHEN** the app starts offline on an adopted session and the connection returns
- **THEN** no request is sent until the session is verified, and then every store refetches
