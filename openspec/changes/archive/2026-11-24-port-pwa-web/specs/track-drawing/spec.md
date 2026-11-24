## MODIFIED Requirements

### Requirement: The panel names what the line follows

The drawing panel SHALL show the two trail layer toggles, switching the map's layers, and say what
the line follows — and that the activity decided, when both layers are shown. While drawing, the
trail layers SHALL show faded so the drawn line stands out from the trails.

#### Scenario: Switching layers while drawing

- **WHEN** the user turns on ski routes in the panel while only hiking trails were shown
- **THEN** the map SHALL show both layers and the panel SHALL say which one the line follows

## ADDED Requirements

### Requirement: The web draws a route in no activity's colour

On the web a line being drawn, its points and an unsaved route behind the form SHALL wear a dark pen
colour that no activity and no trail layer wears. The PWA drew swisstopo's red, which read as a hike
(owner, 2026-11-24). The saved tour wears its activities' colours.

#### Scenario: Planning a ski tour from a route

- **WHEN** the user plans a ski tour from a ski route on the web map
- **THEN** the route behind the form is drawn in the dark pen, apart from the blue ski routes and
  from the hiking red

### Requirement: A picked route wears the pen

A trail or ski route picked on the map SHALL be highlighted in the same dark pen, faint while
listed and full when chosen, on every platform. The PWA's orange read as the glider's (owner,
2026-11-24).

#### Scenario: Tapping a ski route

- **WHEN** the user taps a ski route on the map
- **THEN** the route is highlighted in the dark pen, apart from the blue ski routes and from the
  glider's orange

### Requirement: The terrain profile wears the route's activities

A terrain profile SHALL wear the route's activity colours, as its saved track does, never a fixed
red (owner, 2026-11-24): each way in the activities picked for it (up, down or both), switching at
the goal where the ways differ, banded where a way has several. Without an activity it is grey.

#### Scenario: Hike & fly

- **WHEN** a route's activities are hiking up and paragliding down
- **THEN** the profile is hiking-coloured up to the goal and glider-coloured after it

#### Scenario: An activity both ways

- **WHEN** ski touring goes both ways and paragliding down only
- **THEN** the profile is ski-touring-coloured up to the goal and banded in both colours after it
