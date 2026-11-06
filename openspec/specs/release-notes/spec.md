## Purpose

Announce new features to existing users inside the app, once per user, at the moment they actually run the build that contains them.

## Requirements

### Requirement: Release notes ship with the app
Release notes SHALL be part of the app bundle, each identified by a unique id chosen when the note is written (not the app version) and carrying the date it was written and a localized (`en`, `de-CH`) title and body. The note copy SHALL NOT name a version. The current note SHALL be the most recently added one. Not every release needs a note.

#### Scenario: Release without a new note
- **WHEN** the user runs a build whose current note they already have
- **THEN** no release-note entry is recorded

### Requirement: One entry per note per user
When a signed-in user runs a build, the app SHALL record an inbox entry for the build's current note, unless that note was already recorded for the user. A note SHALL be recorded at most once per user — across devices, reloads, and after the entry is deleted. Recording requires a connection and SHALL be retried on the next online start when it fails.

#### Scenario: First run of a new build
- **WHEN** an existing user opens the app on a build that carries a new note
- **THEN** one unread release-note entry appears in their inbox

#### Scenario: Second device
- **WHEN** the same user opens the new build on a second device
- **THEN** no second entry is recorded

#### Scenario: Deleted entry stays deleted
- **WHEN** the user deletes the release-note entry and reloads the app
- **THEN** the entry is not recorded again

#### Scenario: Offline start
- **WHEN** the new build first starts offline
- **THEN** no entry is recorded until the next online start

### Requirement: Release-note eligibility
Users whose account was created after a note's date SHALL NOT receive it. Only the current note is recorded; intermediate notes the user skipped SHALL NOT be backfilled.

#### Scenario: New account
- **WHEN** a user who signed up after the note's date opens the app
- **THEN** no entry is recorded for that note

#### Scenario: Skipped notes
- **WHEN** a user jumps from a build before note 1 straight to a build whose current note is note 2
- **THEN** only note 2 is recorded

### Requirement: Release notes are inbox-only
Release-note entries SHALL NOT be sent by push or email and SHALL NOT appear as a mutable type in notification preferences. They SHALL have no actor.

#### Scenario: No push
- **WHEN** a release-note entry is recorded
- **THEN** no push or email is sent

### Requirement: Reading a release note
Activating a release-note entry SHALL mark it read and show the note in the current app locale: its date, title, introduction and a list of highlights, plus a shortcut to the notification settings when the note announces notification changes. A release-note entry SHALL never be stale. If the running build no longer contains the note, the app SHALL show the "no longer available" message.

#### Scenario: Open note
- **WHEN** the user taps a release-note entry
- **THEN** the entry becomes read and the note is shown with its highlights

#### Scenario: Unknown note
- **WHEN** the user taps a release-note entry whose id the running build does not contain
- **THEN** the entry becomes read and a "no longer available" snackbar is shown
