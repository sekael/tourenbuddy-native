# map-trail-overlays Specification

## Purpose
Shows the official Swisstopo hiking-trail and ski-route networks as optional map overlays, so users can see
where marked trails and routes run while planning tours, on top of whichever base map they chose.

## Requirements

### Requirement: Swisstopo trail overlays

The map SHALL offer two overlays sourced from Swisstopo WMTS: "Hiking trails" (`ch.swisstopo.swisstlm3d-wanderwege`) and "Ski routes" (`ch.swisstopo-karto.skitouren`). Each overlay SHALL be independently on or off; any combination SHALL be valid. Both overlays SHALL be off by default.

#### Scenario: Turn on one overlay

- **WHEN** the user turns on "Hiking trails"
- **THEN** the hiking-trail network SHALL render on the map and the ski routes SHALL NOT

#### Scenario: Both overlays on

- **WHEN** both overlays are on
- **THEN** both networks SHALL render at the same time

#### Scenario: Turn an overlay off

- **WHEN** the user turns off an overlay that is on
- **THEN** that network SHALL disappear from the map without reloading the base map

### Requirement: Overlay draw order

Overlays SHALL render above the base map and below all app content: GPX tracks, the trail highlight, clickable-route markers, and every tour marker (goal, cluster, preview, start/end). When both overlays are on, ski routes SHALL render above hiking trails.

#### Scenario: Markers stay on top

- **WHEN** an overlay is on and a tour marker sits on a trail
- **THEN** the tour marker SHALL render above the trail

#### Scenario: GPX track stays on top

- **WHEN** an overlay is on and a selected tour's GPX track follows a trail
- **THEN** the GPX track SHALL render above the trail

### Requirement: Overlays survive a base-map switch

Switching the base map SHALL NOT change which overlays are on. After the new base map loads, every overlay that was on SHALL render again in its normal draw order.

#### Scenario: Switch to Classic with overlays on

- **WHEN** both overlays are on and the user switches from "Base" to "Classic"
- **THEN** after the Classic map loads both overlays SHALL render above it and below the tour markers

### Requirement: Map layers panel

The speed-dial menu SHALL offer a "Map layers" entry that opens a panel in the menu's place, right above the menu trigger, with a "Base map" section (single choice) and an "Overlays" section (one toggle per overlay). Every option SHALL show a bundled preview image and its name. Chosen options SHALL show an accent outline and check badge. Toggling an overlay SHALL keep the panel open; choosing a base map SHALL close it.

#### Scenario: Open the layers panel

- **WHEN** the user taps "Map layers" in the speed-dial menu
- **THEN** the layers panel SHALL replace the menu above the trigger, showing the "Base map" and "Overlays" sections with the current base map and active overlays marked as selected

#### Scenario: Reachable on a phone

- **WHEN** the panel opens on a 390 px wide screen
- **THEN** every option SHALL be fully on screen in the lower right, within reach of the right thumb

#### Scenario: Toggle overlays in one visit

- **WHEN** the user turns on "Hiking trails" and then "Ski routes" in the open panel
- **THEN** the panel SHALL stay open after each toggle and both overlays SHALL be on

#### Scenario: Accessible state

- **WHEN** a screen reader focuses an overlay option
- **THEN** it SHALL be announced as a toggle with its name and on/off state; base-map options SHALL be announced as a single-choice group

#### Scenario: Offline

- **WHEN** the device is offline
- **THEN** the "Map layers" entry SHALL stay enabled, the "Base map" section SHALL be disabled with a "Needs a connection" hint, and overlay toggles SHALL keep working, rendering whatever tiles are cached

#### Scenario: Previews need no network

- **WHEN** the panel opens, online or offline
- **THEN** every option's preview image SHALL show immediately from bundled assets, with no network request

### Requirement: Overlay selection persists on the device

The set of active overlays SHALL persist on the device across reloads and app restarts. The persisted value SHALL be validated on read; an unreadable or unknown value SHALL fall back to all overlays off. The base-map choice SHALL NOT be persisted.

#### Scenario: Reload keeps overlays

- **WHEN** the user turns on "Ski routes" and reloads the app
- **THEN** "Ski routes" SHALL be on when the map loads

#### Scenario: Corrupt stored value

- **WHEN** the stored overlay value is malformed or names an unknown overlay
- **THEN** the map SHALL load with no unknown overlay on and SHALL NOT error
