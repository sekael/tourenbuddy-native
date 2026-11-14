## REMOVED Requirements

### Requirement: First-arrival welcome trigger
**Reason**: The native welcome sheet has its own trigger, which also covers the name step.
**Migration**: "Native welcome sheet" and the requirements below.

### Requirement: Pre-tour welcome screen
**Reason**: Natively the welcome is an Apple-style sheet listing what the app does; there is no spotlight tour to start.
**Migration**: "Native welcome sheet" and the requirements below.

### Requirement: Reopen from profile sheet
**Reason**: The profile is a tab natively.
**Migration**: "Native welcome sheet" and the requirements below.

### Requirement: Bidirectional step navigation and resume persistence
**Reason**: No stepped tour natively; the welcome lists every step at once.
**Migration**: "Native welcome sheet" and the requirements below.

### Requirement: Control banner and non-blocking behavior
**Reason**: No coach-mark overlay natively.
**Migration**: "Native welcome sheet" and the requirements below.

### Requirement: Cross-device state persistence
**Reason**: Only the sign-in gate is kept; the last step has no use without steps.
**Migration**: "Native welcome sheet" and the requirements below.

### Requirement: Stable spotlight popover placement
**Reason**: No spotlight natively.
**Migration**: "Native welcome sheet" and the requirements below.

### Requirement: Hand-off to the calendar route on completion
**Reason**: The calendar explains itself with an inline tip on first open.
**Migration**: "Native welcome sheet" and the requirements below.

### Requirement: Continuous tour motion
**Reason**: No spotlight natively; the sheet animates as the system presents it.
**Migration**: "Native welcome sheet" and the requirements below.

### Requirement: Guided step order
**Reason**: The order lives on as the welcome list.
**Migration**: "Native welcome sheet" and the requirements below.

### Requirement: Guided step targets
**Reason**: Each welcome row opens its place instead of spotlighting it.
**Migration**: "Native welcome sheet" and the requirements below.

### Requirement: Steps sharing a surface stay adjacent
**Reason**: No stepped tour natively.
**Migration**: "Native welcome sheet" and the requirements below.

### Requirement: Overlay steps open the real sheet
**Reason**: Each welcome row opens the real sheet or tab itself.
**Migration**: "Native welcome sheet" and the requirements below.

### Requirement: Inbox step spotlights the menu entry
**Reason**: No spotlight natively.
**Migration**: "Native welcome sheet" and the requirements below.

### Requirement: Final step spotlights the calendar control
**Reason**: No spotlight natively.
**Migration**: "Native welcome sheet" and the requirements below.

### Requirement: Intermediate navigation controls are spotlighted
**Reason**: No spotlight natively.
**Migration**: "Native welcome sheet" and the requirements below.

## ADDED Requirements

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
