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

### Requirement: Pending update detection
An update SHALL be pending when a newer build has been deployed and downloaded but the running page still uses the old one. The app SHALL check for a newer build on start and when it returns to the foreground, at most once per 15 minutes, and SHALL NOT check while offline. The pending state SHALL last until the update is applied.

#### Scenario: Long-open session
- **WHEN** a new build is deployed while the installed app stays open in the background, and the user returns to it
- **THEN** the app detects the pending update without a reload

#### Scenario: Offline
- **WHEN** the device is offline
- **THEN** no update check is made

#### Scenario: Quick app switching
- **WHEN** the user returns to the app several times within 15 minutes of the last check
- **THEN** no further check is made until 15 minutes have passed

### Requirement: Persistent update action in the profile
While an update is pending, the profile overview SHALL show, as its first row, a notice that a new version is available with an update button that applies the update and reloads the app — the same action as the update banner. The button SHALL work offline. Dismissing the banner SHALL hide only the banner until the next app start and SHALL NOT hide the notice or the attention dots. Without a pending update no notice SHALL be shown.

#### Scenario: Banner dismissed
- **WHEN** an update is pending and the user dismisses the update banner
- **THEN** the banner disappears, and the profile overview still shows the update notice

#### Scenario: Next app start
- **WHEN** the user dismissed the banner and later starts the app again with the update still pending
- **THEN** the banner is shown again

#### Scenario: Apply from profile
- **WHEN** the user taps the update button in the profile overview
- **THEN** the update is applied and the app reloads on the new version

#### Scenario: Up to date
- **WHEN** no update is pending
- **THEN** the profile overview shows the version and no update button

### Requirement: Update attention dots
While an update is pending, the profile item in the speed-dial menu SHALL show an attention dot and its accessible name SHALL state that an update is available; the speed-dial trigger SHALL show an attention dot unless it already shows the inbox count. The dots SHALL disappear once the update is applied.

#### Scenario: Update pending, inbox read
- **WHEN** an update is pending and the user has no unread inbox entries
- **THEN** the speed-dial trigger and the profile menu item both show a dot

#### Scenario: Update pending with unread entries
- **WHEN** an update is pending and the user has 2 unread inbox entries
- **THEN** the trigger shows the "2" count, and the profile menu item shows a dot

#### Scenario: No update
- **WHEN** no update is pending
- **THEN** the profile menu item shows no dot

#### Scenario: Screen reader
- **WHEN** an update is pending and a screen reader focuses the profile menu item
- **THEN** it is announced as "Profile, update available"

### Requirement: Every open window moves to the new version
When an update is applied, every open app window SHALL reload onto the new version, including windows in the background, so no window keeps running code whose files are no longer deployed.

#### Scenario: Second tab
- **WHEN** the user applies the update in one tab while a second app tab is in the background
- **THEN** the second tab reloads onto the new version without waiting for the user to switch to it
