## Purpose

Introduce new users to TourenBuddy's core features via a guided spotlight tour. On first arrival at the map after profile onboarding, a welcome screen offers to start the tour, which glides a single spotlight through planning a tour, map switching, offline maps, phone verification, notifications, calendar sync, contacts, friend requests, tours, and the calendar. On completion, the tour hands off to the calendar with its own one-time welcome and spotlight sequence. Tour progress and the auto-show gate persist on `user_profile` so state follows the user across devices, and the tour is reopenable from the profile sheet.

## Requirements

### Requirement: Localized tour copy

All tour titles and descriptions SHALL be provided through `vue-i18n` keys with values for every supported locale.

#### Scenario: Locale coverage

- **WHEN** a new tour string is introduced
- **THEN** a corresponding key exists in both `en.json` and `de-CH.json` and the tour renders the active locale's text

### Requirement: Native welcome sheet
On iOS and Android the system SHALL present a welcome sheet once per launch after sign-in while `onboarding_tour_show_at_sign_in` is true or the profile has no first name and the name step was not skipped this launch. A profile without a name SHALL first be asked for first and last name (both required, or skip for this launch). The sheet SHALL then list what the app does in the PWA's step order, each row with the step's title, description and icon.

#### Scenario: Feature index order
- **WHEN** the feature list shows
- **THEN** its rows are, in order: plan a tour, map layers, offline maps, my tours, contacts, friend requests, the inbox, phone verification, notification settings, calendar sync, the calendar

#### Scenario: New account
- **WHEN** a new user signs in for the first time
- **THEN** the sheet asks for their name, then lists what the app does

#### Scenario: Name required
- **WHEN** the user taps Continue with an empty last name
- **THEN** the sheet says the last name is required and saves nothing

### Requirement: Welcome rows open their place
Tapping a welcome row SHALL close the sheet and open that place: its tab, its sheet over the map, or its page in the Profile or Contacts tab.

#### Scenario: Friend requests
- **WHEN** the user taps "Friend requests"
- **THEN** the sheet closes and the Contacts tab opens its friend requests

### Requirement: Welcome gate
Done SHALL set `onboarding_tour_show_at_sign_in` to false. Swiping the sheet away SHALL only skip it for this launch. The gate SHALL live on `user_profile`, so it follows the user across devices.

#### Scenario: Skip for now
- **WHEN** the user swipes the welcome sheet away
- **THEN** it shows again after the next launch

### Requirement: Reopen from the Profile tab
The Profile tab SHALL offer "Show app tour", which opens the welcome sheet's list without the name step, regardless of the gate.

#### Scenario: Reopen
- **WHEN** the user taps "Show app tour"
- **THEN** the welcome list shows and Done hides it again
