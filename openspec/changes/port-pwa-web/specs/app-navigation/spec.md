## MODIFIED Requirements

### Requirement: Map, Calendar, Contacts and Profile tabs

On iOS and Android the app SHALL offer four top-level places, Map, Calendar, Contacts and Profile,
and SHALL open on the Map. They SHALL sit in the system tab bar: Liquid Glass on iOS, the Material
3 navigation bar on Android. The selected place SHALL be marked, also for assistive technology, and
the labels SHALL follow the app language. The web app has the PWA's navigation instead (`web-app`).

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
- **THEN** it shows the PWA's desktop layout (map page, side drawer, dialogs), with neither tabs nor
  a rail

#### Scenario: Labels follow the language

- **WHEN** the app language changes to German
- **THEN** the tabs read "Karte", "Kalender", "Kontakte" and "Profil"

### Requirement: Map menu within thumb reach

On iOS and Android the Map tab SHALL show a menu button in the bottom-trailing corner, within thumb
reach, right above the tab bar; the other tabs SHALL show none. It SHALL open a menu of Offline maps
and Map layers, the first nearest the button. Choosing an item SHALL close the menu and open its
destination as a sheet. On Android the button SHALL tell assistive technology whether the menu is
open. The web app keeps the PWA's speed-dial menu (`web-app`).

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

- **WHEN** the user opens the menu on Android
- **THEN** its items unfold upwards one after another and the button turns into a close button; on
  the web the PWA's speed dial opens instead, with all of its entries

#### Scenario: Choosing a destination

- **WHEN** the user chooses Map layers in the open menu
- **THEN** the menu closes and the map layers sheet opens

#### Scenario: Dismissing the menu

- **WHEN** the menu is open and the user taps outside it, presses Back (Android) or uses the
  VoiceOver escape gesture (iOS)
- **THEN** the menu closes without opening anything, and Back does not leave the screen

#### Scenario: Reopening while it closes

- **WHEN** the user taps the button on Android again while the menu's items are still folding away
- **THEN** the menu opens again instead of disappearing

#### Scenario: Leaving the tab closes the menu

- **WHEN** the menu is open and the user switches tabs, or a destination opens over the map
- **THEN** the menu is closed when the user comes back to the map

#### Scenario: Reduced motion

- **WHEN** the system asks for reduced motion and the user opens the menu on Android
- **THEN** the items appear without travel or scaling, and the pressed button does not shrink
