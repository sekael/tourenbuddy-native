## ADDED Requirements

### Requirement: One resolver for every way into the app
Universal Links and App Links on `tourenbuddy.ch`, the app's own scheme and tapped pushes SHALL all be routed by one resolver. A link carrying `?notification=<id>` SHALL open that inbox entry's target and mark it read; a link to a known screen SHALL open it; any other link SHALL open the map. A link arriving before sign-in SHALL be followed after sign-in.

#### Scenario: Email link with the app installed (after cutover)
- **WHEN** the Worker's `APP_URL` is `https://tourenbuddy.ch` (Phase 7) and the user taps a `https://tourenbuddy.ch/?notification=<id>` link on an iPhone with the app
- **THEN** the app opens, shows the entry's target and marks the entry read

#### Scenario: Unknown path
- **WHEN** the app is opened with `https://tourenbuddy.ch/something-else`
- **THEN** it shows the map

#### Scenario: Signed out
- **WHEN** a notification link opens the app while signed out
- **THEN** sign-in shows first and the entry's target follows the sign-in
