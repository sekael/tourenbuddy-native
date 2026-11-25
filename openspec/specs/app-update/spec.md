# app-update Specification

## Purpose
Let users see which app version they run and make a pending update hard to miss, so nobody stays on an outdated build without noticing.

## Requirements

### Requirement: App version is visible
The profile overview SHALL show the version of the running app build as secondary, light gray text at its bottom. Production builds SHALL show the version only; PR preview builds SHALL append the short commit they were built from, and local development builds SHALL append "dev".

#### Scenario: Version shown
- **WHEN** the user opens the profile overview on production build 0.44.0
- **THEN** the overview shows "Version 0.44.0" in light gray text

#### Scenario: Preview build
- **WHEN** a tester opens the profile overview on a PR preview built from commit 1a2b3c4
- **THEN** the overview shows "Version 0.44.0 · 1a2b3c4"

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
