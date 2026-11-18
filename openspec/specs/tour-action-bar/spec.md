## Purpose

Always-visible action bar inside the tour detail view exposing primary tour actions.

## Requirements

### Requirement: Tour action bar visibility rules

The bar SHALL be hidden entirely while any of the following are true: `mapStore.isPickingLocation === true`, the tour info overlay is active, the tours list overlay is active, or the tour-creation overlay is active. The bar SHALL remain visible (with disabled segments) while any other top-level interaction is active — feedback / profile / contacts / friend-requests overlays, or the speed-dial menu / base-map sub-panel.

#### Scenario: Hidden during location picking

- **WHEN** `mapStore.isPickingLocation` becomes `true`
- **THEN** the bottom-center action bar SHALL be removed from the visible layout

#### Scenario: Hidden while tour info sheet is open

- **WHEN** the tour info overlay is mounted (mobile bottom sheet or desktop side drawer)
- **THEN** the bottom-center action bar SHALL be hidden

#### Scenario: Hidden while tour list sheet is open

- **WHEN** the tours list overlay is mounted
- **THEN** the bottom-center action bar SHALL be hidden

#### Scenario: Hidden while tour-creation dialog is open

- **WHEN** the tour-creation overlay is mounted
- **THEN** the bottom-center action bar SHALL be hidden

#### Scenario: Visible-but-disabled while a non-tour overlay is open

- **WHEN** the feedback, profile, contacts, or friend-requests overlay is open
- **THEN** the bottom-center action bar SHALL remain visible
- **AND** both pill segments SHALL render with a disabled visual state

#### Scenario: Tapping the disabled bar dismisses the active overlay first

- **WHEN** a modal overlay (bottom sheet on mobile, dialog or side drawer on desktop) is open
- **AND** the user taps either pill segment
- **THEN** the open overlay SHALL close
- **AND** the pill segment SHALL NOT additionally invoke its own action (no tours list opens, no pick flow starts)
- **AND** a subsequent tap with no overlay open SHALL invoke the segment's action normally

#### Scenario: Open speed-dial menu counts as an active interaction

- **WHEN** the speed-dial menu or its base-map sub-panel is open (no other overlay)
- **THEN** both pill segments SHALL render disabled
- **AND** tapping either segment SHALL close the speed-dial menu without invoking the segment's action
- **AND** the next tap (with the menu closed) SHALL invoke the segment's action normally

### Requirement: Tour action bar wires into existing flows

Activating the My Tours segment SHALL open the tours list overlay via the same code path used previously by the speed-dial entry (`activeOverlay === 'tours'`). Activating the Add-tour segment SHALL invoke `mapStore.setPickingLocation(true)` to enter the existing goal-pick → tour-creation-dialog flow; if the user is not authenticated the Add-tour segment SHALL render disabled with an explanatory tooltip (desktop view only).

#### Scenario: My Tours segment opens tour list

- **WHEN** the user activates the My Tours segment while the bar is enabled
- **THEN** the page SHALL open the tour list overlay (`activeOverlay = 'tours'`)
- **AND** any previously active overlay SHALL close per the single-active-overlay policy

#### Scenario: Add-tour segment starts pick flow

- **WHEN** the user activates the Add-tour segment while authenticated and the bar is enabled
- **THEN** `mapStore.setPickingLocation(true)` SHALL be called
- **AND** the existing location picker SHALL appear over the map

#### Scenario: Add tour disabled when unauthenticated

- **WHEN** the user is not authenticated
- **THEN** the Add-tour segment SHALL render disabled with the existing `signInToAddToursTooltip` text

### Requirement: Single active top-level interaction

While any overlay is active, all FABs not part of that overlay SHALL be disabled or hidden so that only one top-level interaction is reachable at a time. This SHALL apply to: the bottom-center tour action bar, the speed-dial trigger, and the speed-dial menu entries.

#### Scenario: Speed-dial disabled when overlay open

- **WHEN** any overlay (`feedback`, `profile`, `contacts`, `friend-requests`, `tours`, `tour`, `tour-creation`) is active
- **THEN** the speed-dial trigger SHALL render in a disabled state
- **AND** tapping the trigger SHALL close the active overlay without opening the speed-dial menu

#### Scenario: Compass FAB unaffected

- **WHEN** any overlay is active
- **THEN** the compass FAB SHALL retain its existing behaviour (visible when bearing is non-zero, click resets bearing) and SHALL NOT be disabled

### Requirement: Glass tour capsule in the map's thumb zone
The Map tab SHALL show, centred right above the tab bar, a capsule with "My tours" (opens the tours list) and an "Add tour" button (starts tour creation), in Liquid Glass on iOS and as Material floating controls on Android and web, level with the menu circle at the trailing edge and the legend button at the leading edge. The capsule SHALL hide while a tour or the tours list is open and while picking or drawing.

#### Scenario: Open my tours
- **WHEN** the user taps "My tours"
- **THEN** the tours list opens as a sheet over the map

#### Scenario: Hidden behind a tour
- **WHEN** a tour's detail sheet is open
- **THEN** the capsule is hidden and returns when the sheet closes
