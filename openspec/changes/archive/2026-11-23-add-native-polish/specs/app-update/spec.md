## REMOVED Requirements

### Requirement: Pending update detection
**Reason**: Native apps update through the stores; the web app has no service worker (#346 section 7).
**Migration**: "Forced update below the minimum version" below.

### Requirement: Persistent update action in the profile
**Reason**: Store updates are offered by the stores; the gate covers versions that must not run.
**Migration**: "Forced update below the minimum version" below.

### Requirement: Update attention dots
**Reason**: No pending-update state exists in a store app.
**Migration**: None.

### Requirement: Every open window moves to the new version
**Reason**: A service-worker concern; native apps run one version per install.
**Migration**: None.

## ADDED Requirements

### Requirement: Forced update below the minimum version
On iOS and Android the app SHALL read the minimum supported version for its platform from the published app configuration on start and when it returns to the foreground (at most every 15 minutes), and when its own version is lower SHALL show a full-screen update screen that cannot be dismissed, with a button to the store page. A failed or missing answer SHALL fall back to the last good answer, else to no gate: being offline SHALL never block the app.

#### Scenario: Below the minimum
- **WHEN** the app is version 0.2.0 and the minimum for its platform is 0.3.0
- **THEN** the update screen shows and the app cannot be used until updated

#### Scenario: Offline start
- **WHEN** the app starts offline and has never read the configuration
- **THEN** it starts normally

#### Scenario: Offline below the minimum
- **WHEN** the last good answer requires an update and the device is offline
- **THEN** the app stays usable, and the update screen shows once it is back online

#### Scenario: Malformed configuration
- **WHEN** the configuration cannot be parsed
- **THEN** the last good answer applies
