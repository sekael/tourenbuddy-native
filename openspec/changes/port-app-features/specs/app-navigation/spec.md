## ADDED Requirements

### Requirement: Each tab keeps its own navigation stack
Calendar, Contacts and Profile SHALL each be a navigation stack: a large title that collapses on scroll, actions in the navigation bar, a system search field where the tab is searchable (Contacts), and detail screens pushed with the system transition and an edge-swipe back. Switching tabs SHALL keep each stack where the user left it.

#### Scenario: Contact detail and back
- **WHEN** the user opens a contact from the Contacts tab and swipes from the leading edge
- **THEN** the detail pops back to the list at the same scroll position

#### Scenario: Tab switch keeps place
- **WHEN** the user leaves a contact's detail for the Map tab and comes back
- **THEN** the contact's detail is still shown

### Requirement: The map's sheets leave the map live
The tours list and a tour's detail SHALL open as sheets over the Map tab with a medium and a large height; at the medium height the map beside the sheet SHALL stay pannable and tappable. Creating or editing a tour SHALL open full screen with Cancel and Save in the navigation bar; the route step, point picks and track drawing SHALL run on the live map with a sheet (tour-creation-flow).

#### Scenario: Pan while a tour is open
- **WHEN** a tour's detail sheet is at its medium height and the user pans the map
- **THEN** the map moves and the sheet stays open

#### Scenario: Cancel discards
- **WHEN** the user cancels a tour form with unsaved changes
- **THEN** the system asks to discard the changes before closing

### Requirement: Unread inbox entries badge the Profile tab
The Profile tab item SHALL carry the inbox's badge (unread, not stale entries, capped at "9+", hidden at zero), and the Inbox row in the Profile tab SHALL show the same count.

#### Scenario: New friend request
- **WHEN** a friend request arrives while the user is on the Map tab
- **THEN** the Profile tab shows a badge "1" and the Inbox row in Profile shows "1"
