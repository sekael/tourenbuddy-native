## Purpose

How the user moves between the app's places: the Map and Calendar tabs, the main menu within thumb
reach, and how the menu's destinations open and close.

## ADDED Requirements

### Requirement: Map and Calendar tabs

The app SHALL offer two top-level places, Map and Calendar, in the platform's tab bar on iOS and
Android, and SHALL open on the Map. On web, windows narrower than 600 px SHALL show a navigation bar
at the bottom, and wider windows a navigation rail at the leading edge. The selected place SHALL be
marked, and the tab labels SHALL follow the app language.

#### Scenario: App opens on the map

- **WHEN** the user opens the app
- **THEN** the Map tab is shown and marked as selected

#### Scenario: Switching to the calendar

- **WHEN** the user selects Calendar
- **THEN** the calendar is shown and Calendar is marked as selected, Map no longer

#### Scenario: Desktop window

- **WHEN** the web app runs in a window 600 px or wider
- **THEN** the places are listed in a rail at the leading edge instead of a bar at the bottom

#### Scenario: Labels follow the language

- **WHEN** the app language changes to German
- **THEN** the tabs read "Karte" and "Kalender"

### Requirement: Main menu within thumb reach

Both tabs SHALL show a menu button in the bottom-trailing corner, above the tab bar, so it can be
reached with the thumb of the hand holding the phone. It SHALL open a menu of Inbox, Contacts,
Profile and Feedback, the first item nearest the button. Choosing an item SHALL close the menu and
open that destination. The button SHALL tell assistive technology whether the menu is open.

#### Scenario: Opening the menu one-handed

- **WHEN** the user taps the menu button on the Map or the Calendar tab
- **THEN** the menu opens above the button with Inbox nearest to it, then Contacts, Profile and
  Feedback

#### Scenario: Liquid Glass on iOS

- **WHEN** the menu button is shown on iOS
- **THEN** it is a Liquid Glass button and opens the system menu out of it

#### Scenario: FAB menu on Android and web

- **WHEN** the user opens the menu on Android or web
- **THEN** its items unfold upwards one after another and the button turns into a close button

#### Scenario: Choosing a destination

- **WHEN** the user chooses Profile in the open menu
- **THEN** the menu closes and the profile opens

#### Scenario: Dismissing the menu

- **WHEN** the menu is open on Android or web and the user taps outside it, presses Back
  (Android) or presses Escape (web)
- **THEN** the menu closes without opening anything, and Back does not leave the screen

#### Scenario: Reopening while it closes

- **WHEN** the user taps the button again while the menu's items are still folding away
- **THEN** the menu opens again instead of disappearing

#### Scenario: Leaving the tab closes the menu

- **WHEN** the menu is open and the user switches tabs, or a destination opens over the tab
- **THEN** the menu is closed when the user comes back to that tab

#### Scenario: Reduced motion

- **WHEN** the system asks for reduced motion and the user opens the menu on Android or web
- **THEN** the items appear without travel or scaling, and the pressed button does not shrink

### Requirement: Destinations open as sheets above the tabs

A menu destination SHALL open as a sheet above the current tab and its tab bar. Closing it SHALL
return to the tab it was opened from. Each destination SHALL have its own address; opened from a
link, it SHALL have the map beneath it, and closing it SHALL show the map.

#### Scenario: Closing returns to the tab

- **WHEN** the user opens Inbox from the menu on the Calendar tab and closes it
- **THEN** the Calendar tab is shown again

#### Scenario: Opening from a link

- **WHEN** the app is opened at the profile's address and the user closes the profile
- **THEN** the map is shown
