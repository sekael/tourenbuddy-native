## REMOVED Requirements

### Requirement: MapLibre GL JS map with Swisstopo tiles
**Reason**: iOS and Android render the map natively; only the web keeps the browser map library (#346 D1).
**Migration**: "Native map with Swisstopo tiles" below.

### Requirement: Map route never scrolls the document
**Reason**: A browser layout concern; native screens have no document.
**Migration**: None.

## ADDED Requirements

### Requirement: Native map with Swisstopo tiles
The Map tab SHALL show a full-screen Swisstopo map, rendered natively on iOS and Android and in the browser on the web, extending under the system bars, with Swisstopo's attribution visible. It SHALL offer the base maps Base, Aerial, Light and Classic, keep pan, pinch, rotate and tilt gestures, and show the compass when rotated.

#### Scenario: Map under the tab bar
- **WHEN** the Map tab is shown on iOS
- **THEN** the map continues under the Liquid Glass tab bar and the glass controls sample it

#### Scenario: Base map switch keeps overlays
- **WHEN** the user switches from Base to Aerial with the ski overlay on
- **THEN** the ski overlay stays on, in the same order

### Requirement: Place search on the map

The map's bar SHALL hold a search for places, huts and stops, the route step's search; picking a result SHALL close the search and fly the map to it.

#### Scenario: A village

- **WHEN** the user searches "Lauterbrunnen" and picks the village
- **THEN** the map SHALL show Lauterbrunnen close up

### Requirement: Map controls in one compact row
The Map tab SHALL show its controls in one row right above the tab bar, none overlapping at phone width: a search button, a "My Tours | Add tour" capsule in the app's blue, and a map button opening the map sheet. The map sheet SHALL hold the base maps and overlays as previews, the legend and the offline maps. On iOS the controls SHALL be compact Liquid Glass (44 pt), the round ones tinted with the app's blue.

#### Scenario: Legend from the map button
- **WHEN** the user taps the map button and then "Legend"
- **THEN** the legend opens inside the same sheet, with a back button to the map layers

#### Scenario: Nothing clashes
- **WHEN** the Map tab shows on a 375 pt wide phone in German
- **THEN** search, the capsule and the map button sit side by side without overlapping
