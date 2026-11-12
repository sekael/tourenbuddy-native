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
