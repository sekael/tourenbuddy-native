## MODIFIED Requirements

### Requirement: Lists and forms use system components on iOS
On iOS, every screen that is a list or a form (settings, contacts, inbox, tour lists, the tour form, sheets with fields) SHALL be built from the system's grouped list and form, so rows, separators, row heights, swipe actions, context menus, Dynamic Type, haptics and VoiceOver behave as in the system apps. Android SHALL render the same screens with Material 3 list items. Feature screens SHALL use the shared adaptive components and SHALL NOT branch on the platform.

#### Scenario: A settings row on iOS
- **WHEN** the Profile tab shows its Language row on an iPhone
- **THEN** it is a system grouped-list row with the current language as its value and a disclosure chevron

#### Scenario: Rows read in the label colour
- **WHEN** a list shows rows that open something (a tour, a contact, a setting) or offer a choice
- **THEN** their titles are in the label colour (black in light mode) with secondary-grey subtitles and chevrons, as in Settings; only a plain action row ("Round trip", "Reset") is in the app's tint

#### Scenario: Swipe to delete
- **WHEN** a user swipes an inbox entry or a contact row from the trailing edge on iOS
- **THEN** the system swipe action appears and a full swipe runs the destructive action

#### Scenario: Same screen on Android
- **WHEN** the same screen renders on Android
- **THEN** it shows Material 3 list items with the same rows, values and actions

#### Scenario: Web keeps the PWA's lists
- **WHEN** the same screen renders in the web app
- **THEN** it shows the PWA's lists and forms (`web-app`), not Material 3 list items
