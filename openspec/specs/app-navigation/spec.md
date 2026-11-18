# app-navigation Specification

## Purpose

How the user moves between the app's places: the Map, Calendar, Contacts and Profile tabs, the
map's menu within thumb reach, and how the destinations beyond the tabs open and close.

## Requirements

### Requirement: Map, Calendar, Contacts and Profile tabs

The app SHALL offer four top-level places, Map, Calendar, Contacts and Profile, and SHALL open on
the Map. On iOS and Android they SHALL sit in the system tab bar: Liquid Glass on iOS, the Material
3 navigation bar on Android. On web, windows narrower than 600 px SHALL show a navigation bar at the
bottom, wider ones a navigation rail at the leading edge. The selected place SHALL be marked, also
for assistive technology, and the labels SHALL follow the app language.

#### Scenario: App opens on the map

- **WHEN** the user opens the app
- **THEN** the Map tab is shown and marked as selected

#### Scenario: Switching to the calendar

- **WHEN** the user selects Calendar
- **THEN** the calendar is shown and Calendar is marked as selected, Map no longer

#### Scenario: Opening on the calendar from a link

- **WHEN** the app is opened at the calendar's address
- **THEN** the calendar is shown and Calendar, not Map, is marked as selected

#### Scenario: Selecting the current place again

- **WHEN** the user selects the place that is already shown
- **THEN** it stays shown and selected

#### Scenario: Contacts and profile are places

- **WHEN** the user selects Profile
- **THEN** the profile is shown as a tab, with the tab bar still visible, not as a sheet

#### Scenario: Desktop window

- **WHEN** the web app runs in a window 600 px or wider
- **THEN** the places are listed in a rail at the leading edge instead of a bar at the bottom

#### Scenario: Labels follow the language

- **WHEN** the app language changes to German
- **THEN** the tabs read "Karte", "Kalender", "Kontakte" and "Profil"

### Requirement: Map menu within thumb reach

The Map tab SHALL show a menu button in the bottom-trailing corner, within thumb reach, right above
the tab bar; the other tabs SHALL show none. It SHALL open a menu of Offline maps and Map layers,
the first nearest the button. Choosing an item SHALL close the menu and open its destination as a
sheet. On Android and web the button SHALL tell assistive technology whether the menu is open.

#### Scenario: Opening the menu one-handed

- **WHEN** the user taps the menu button on the Map tab
- **THEN** the menu opens above the button with Offline maps nearest to it, then Map layers

#### Scenario: Only the map has a menu

- **WHEN** the Calendar, Contacts or Profile tab is shown
- **THEN** there is no menu button

#### Scenario: Liquid Glass on iOS

- **WHEN** the menu button is shown on iOS
- **THEN** it is a Liquid Glass circle as tall as the tab bar, and it opens the system menu out of
  its glass, with icons in the text color

#### Scenario: FAB menu on Android and web

- **WHEN** the user opens the menu on Android or web
- **THEN** its items unfold upwards one after another and the button turns into a close button

#### Scenario: Choosing a destination

- **WHEN** the user chooses Map layers in the open menu
- **THEN** the menu closes and the map layers sheet opens

#### Scenario: Dismissing the menu

- **WHEN** the menu is open and the user taps outside it, presses Back (Android), presses Escape
  (web) or uses the VoiceOver escape gesture (iOS)
- **THEN** the menu closes without opening anything, and Back does not leave the screen

#### Scenario: Reopening while it closes

- **WHEN** the user taps the button on Android or web again while the menu's items are still
  folding away
- **THEN** the menu opens again instead of disappearing

#### Scenario: Leaving the tab closes the menu

- **WHEN** the menu is open and the user switches tabs, or a destination opens over the map
- **THEN** the menu is closed when the user comes back to the map

#### Scenario: Reduced motion

- **WHEN** the system asks for reduced motion and the user opens the menu on Android or web
- **THEN** the items appear without travel or scaling, and the pressed button does not shrink

### Requirement: Destinations open as sheets above the tabs

Inbox, Feedback, Offline maps and Map layers SHALL each open as a sheet above the current tab and
its bottom bar. Closing one SHALL return to the tab it was opened from. Each SHALL have its own
address; opened from a link, it SHALL have the map beneath it, and closing it SHALL show the map.

#### Scenario: Closing returns to the tab

- **WHEN** the user opens Map layers from the menu and closes it
- **THEN** the map is shown again

#### Scenario: Opening from a link

- **WHEN** the app is opened at the inbox's address and the user closes the inbox
- **THEN** the map is shown

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

### Requirement: A tap beside the sheets closes them
A tap on the map where there is no tour, cluster or ski route SHALL close the sheets over the map, as Apple Maps lets go of a place; while a step runs on the map (route, drawing, framing a region) the map's taps SHALL belong to the step.

#### Scenario: Tap beside a tour
- **WHEN** a tour's detail sheet is at its medium height and the user taps an empty spot on the map
- **THEN** the sheet closes; a tap on another tour's marker opens that tour instead

### Requirement: Unread inbox entries badge the Profile tab
The Profile tab item SHALL carry the inbox's badge (unread, not stale entries, capped at "9+", hidden at zero), and the Inbox row in the Profile tab SHALL show the same count.

#### Scenario: New friend request
- **WHEN** a friend request arrives while the user is on the Map tab
- **THEN** the Profile tab shows a badge "1" and the Inbox row in Profile shows "1"
