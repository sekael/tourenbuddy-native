## REMOVED Requirements

### Requirement: Offline mutations are queued durably, coalesced per entity
**Reason**: Restated for the native apps' database; the web does not queue (#346 D8).
**Migration**: "Durable coalesced outbox on native" below and "The outbox survives the app on native".

## ADDED Requirements

### Requirement: Durable coalesced outbox on native
On iOS and Android offline mutations SHALL be stored in the app's database with at most one entry per entity, holding the entity's final desired state (or a delete) and any staged file, with an ordering key that honours foreign-key dependencies; the optimistic state, the entry and the cache SHALL be written in one transaction.

#### Scenario: Three edits, one write
- **WHEN** the user edits the same tour three times offline
- **THEN** one entry holds the last state and one write replays

### Requirement: The outbox survives the app on native
The outbox SHALL survive the app being killed and drain when the device becomes reachable, when the app returns to the foreground and when Realtime subscribes. Writes on the web SHALL never queue: they fail with a clear message while offline. A queue left by a signed-out user SHALL never replay under another user.

#### Scenario: Kill during drain
- **WHEN** the app is killed while replaying queued writes and started again online
- **THEN** each remaining write replays exactly once, in order

#### Scenario: Switch user with a queue
- **WHEN** user A signs out with queued writes and user B signs in
- **THEN** A's writes are not sent with B's session
