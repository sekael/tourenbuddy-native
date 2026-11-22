## REMOVED Requirements

### Requirement: MapLibre GL JS map with Swisstopo tiles
**Reason**: iOS and Android render the map natively; only the web keeps the browser map library (#346 D1).
**Migration**: "Native map with Swisstopo tiles" below.

### Requirement: Map route never scrolls the document
**Reason**: A browser layout concern; native screens have no document.
**Migration**: None.

## ADDED Requirements

### Requirement: Native map with Swisstopo tiles
The Map tab SHALL show a full-screen Swisstopo map, rendered natively on iOS and Android and in the browser on the web, extending under the system bars, with Swisstopo's attribution visible (native: a small "© swisstopo" at the left edge right above the map controls, where Apple Maps puts "Legal", listing every source's credit when tapped). It SHALL offer the base maps Base, Aerial, Light and Classic, keep pan, pinch, rotate and tilt gestures, and show the compass when rotated.

#### Scenario: Cluster counts in the app's font
- **WHEN** tours close together show as one cluster circle
- **THEN** its count stands centred in the circle, in the app's own font (iOS: the system font), "99+" beyond 99

#### Scenario: Map under the tab bar
- **WHEN** the Map tab is shown on iOS
- **THEN** the map continues under the Liquid Glass tab bar and the glass controls sample it

#### Scenario: Base map switch keeps overlays
- **WHEN** the user switches from Base to Aerial with the ski overlay on
- **THEN** the ski overlay stays on, in the same order

### Requirement: Place search on the map

The map's bar SHALL hold a search for places, huts and stops, the route step's search; picking a result SHALL close the search and fly the map to it, without placing a marker there. Only the route step's search (creating or editing a tour) SHALL set a marker on the place it finds, as the tour's start, goal or end.

#### Scenario: A village

- **WHEN** the user searches "Lauterbrunnen" and picks the village
- **THEN** the map SHALL show Lauterbrunnen close up
- **AND** no marker SHALL appear at the village

#### Scenario: A goal searched in the route step

- **WHEN** the user creates or edits a tour and picks "Tödi" in the route step's search for the goal
- **THEN** the goal's marker SHALL be set on Tödi

### Requirement: Map controls in one compact row
The Map tab SHALL show its controls in one row right above the tab bar, none overlapping at phone width: a search button, a "My Tours | Add tour" capsule in the app's blue (on iOS frosted glass tinted blue, white glyphs legible over snow), and a map button opening the map sheet. The map sheet SHALL hold the base maps and overlays as previews, the legend and the offline maps. On iOS the controls SHALL be compact Liquid Glass (44 pt), the round ones tinted with the app's blue.

#### Scenario: Legend from the map button
- **WHEN** the user taps the map button and then "Legend"
- **THEN** the legend opens as its own sheet over the map layers, at full height from the start
- **AND** closing it returns to the map layers

#### Scenario: Offline maps from the map button

- **WHEN** the user taps the map button and then "Offline maps"
- **THEN** the offline maps open inside the same sheet, with a back button to the map layers
- **AND** framing a region is a page pushed in the same sheet: its back button or a started download slides back to those offline maps, without the sheet closing in between

#### Scenario: Nothing clashes
- **WHEN** the Map tab shows on a 375 pt wide phone in German
- **THEN** search, the capsule and the map button sit side by side without overlapping

### Requirement: A tour always shows whole on the map
The map SHALL frame a tour so its goal, start, end and track all show above the sheet: when its sheet opens, again when its track has loaded, and in the route step whenever a point is set or moved or the route is rerouted. A drawing or a lone point SHALL move the map only once out of view. A short tour SHALL be framed no closer than about a kilometre across.

#### Scenario: Goal set far away
- **WHEN** in the route step the user sets the start, then searches a goal 20 km away
- **THEN** the map zooms out until start, goal and the route between them all show above the sheet

### Requirement: Tours open on the Map tab
Opening a tour from another tab or sheet (the calendar, the inbox) SHALL close the sheets above the tabs and show the tour on the Map tab, framed above its sheet.

#### Scenario: From the inbox
- **WHEN** the user opens a shared tour's entry in the inbox under Profile
- **THEN** the Map tab shows with the tour framed above its sheet, and closing the sheet shows the map
