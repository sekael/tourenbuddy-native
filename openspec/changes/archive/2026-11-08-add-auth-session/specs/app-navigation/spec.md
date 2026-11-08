## ADDED Requirements

### Requirement: Places are for a signed-in user

Every place and destination in this capability SHALL be shown to a signed-in user only. Until the
user signs in, the sign-in screens (see `auth`) SHALL take their place: for a signed-out user this
requirement takes precedence over "App opens on the map" and "Opening on the calendar from a link"
(Map, Calendar, Contacts and Profile tabs) and over "Opening from a link" (Destinations open as
sheets above the tabs), which apply from the moment the user is signed in.

#### Scenario: Signed-out user opens the app

- **WHEN** a signed-out user opens the app
- **THEN** the email screen is shown instead of the Map, without the tab bar

#### Scenario: Signed-out user opens a link to a place

- **WHEN** a signed-out user opens the app at the calendar's or the inbox's address
- **THEN** the email screen is shown, and signing in opens the Map

#### Scenario: Signed-in user opens the app

- **WHEN** a signed-in user opens the app
- **THEN** the Map tab is shown and marked as selected, as for any other launch
