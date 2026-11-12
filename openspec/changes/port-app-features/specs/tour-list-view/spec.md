## REMOVED Requirements

### Requirement: Add-tour affordance inside the tour list sheet
**Reason**: The native sheet carries Add in its navigation bar.
**Migration**: "Tours list sheet on native".

### Requirement: Calendar entry point in the tour list
**Reason**: The calendar is a tab of its own in the native app (D19), one tap from anywhere.
**Migration**: app-navigation "Map, Calendar, Contacts and Profile tabs".

### Requirement: Stable list sheet height while searching
**Reason**: The native tours list is a system sheet; searching moves it to its large detent, so results always stay above the keyboard.
**Migration**: "Tours list sheet on native" below.

### Requirement: Filters view
**Reason**: Native filters open as a pushed screen in the sheet's own navigation stack instead of replacing the rows in place.
**Migration**: "Filters as a pushed screen" below.

### Requirement: Filters footer actions
**Reason**: The pushed filters screen carries its actions in the toolbar.
**Migration**: "Filters as a pushed screen" below.

### Requirement: Filters view dismissal
**Reason**: The pushed filters screen closes with Back or "Show N tours" like any system screen.
**Migration**: "Filters as a pushed screen" below.

### Requirement: Filter panel accessibility
**Reason**: A system navigation screen announces itself and moves focus on its own.
**Migration**: "Filters as a pushed screen" below.

## ADDED Requirements

### Requirement: Tours list sheet on native
The tours list SHALL open as a sheet over the map with a segmented control (Mine, Friends), a system search field by tour name and partner, a Filters button with a badge counting active categories, and Add in its navigation bar; focusing the search SHALL raise the sheet to its large height. Rows SHALL show the PWA row's content: activity avatar, name, grade and subtitle, the owner and date line on friends' tours, a pending-suggestion count, no planned date on own tours.

#### Scenario: Search a partner
- **WHEN** the user types a partner's first name into the search field
- **THEN** only tours with that partner remain and the sheet stands at its large height

#### Scenario: Swipe to complete
- **WHEN** the user swipes an own tour row from the leading edge and taps Complete
- **THEN** the tour is marked completed, as from its detail

### Requirement: Filters as a pushed screen
The Filters button SHALL push a filters screen in the sheet with the PWA's filter categories; its toolbar SHALL hold "Reset" (disabled while no filter is active) and a primary "Show N tours", N counting the rows the list shows on return. Back and "Show N tours" SHALL return to the list with the filters applied. Selecting a filter SHALL never move another control.

#### Scenario: Show N tours
- **WHEN** the user selects the grade "WS" and taps "Show 3 tours"
- **THEN** the list shows those three tours and the Filters badge shows 1
