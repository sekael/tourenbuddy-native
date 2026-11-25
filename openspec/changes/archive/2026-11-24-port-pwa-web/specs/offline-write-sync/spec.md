## MODIFIED Requirements

### Requirement: The outbox survives the app on native
The outbox SHALL survive the app being killed and drain when the device becomes reachable, when the app returns to the foreground and when Realtime subscribes. On the web it SHALL survive a closed tab or browser the same way, kept in the browser's storage. A queue left by a signed-out user SHALL never replay under another user.

#### Scenario: Kill during drain
- **WHEN** the app is killed while replaying queued writes and started again online
- **THEN** each remaining write replays exactly once, in order

#### Scenario: Switch user with a queue
- **WHEN** user A signs out with queued writes and user B signs in
- **THEN** A's writes are not sent with B's session
