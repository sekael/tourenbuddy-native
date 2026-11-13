## REMOVED Requirements

### Requirement: The route step's sheet folds on a phone
**Reason**: The native route step is a system sheet over the live map; it folds and unfolds through its detents, dragged by the system grabber.
**Migration**: "Route step in a sheet over the live map" below.

## ADDED Requirements

### Requirement: Route step in a sheet over the live map
On iOS and Android the route step, a point pick from the form, and track drawing SHALL run on the Map tab's live map with a sheet holding the step's controls, at a small and a medium height; the map above the sheet SHALL take taps and gestures. The form SHALL close while they run, keeping its draft, and SHALL return with every field as it was plus what the step set. The sheet's title SHALL name the point or the step.

#### Scenario: Fold for more map
- **WHEN** the user drags the route step's sheet down to its small height
- **THEN** only the summary (title, numbers, next step, buttons) shows and the rest of the screen is map

#### Scenario: Pick from the form keeps the draft
- **WHEN** the user has typed a name, taps Change on the end point, taps the map and taps Done
- **THEN** the form returns with the typed name and the new end

### Requirement: A new tour comes filled in

The form for a new tour SHALL show what the tour most likely is, each value changed in a tap: the coming weekend day (today on a Saturday or Sunday) with its season, and the activity the user plans most in that season, else ski touring when the map shows the ski trails in winter or spring, else hiking when it shows the hiking trails.

#### Scenario: Planned on a Thursday in November

- **WHEN** a user whose tours are hikes adds a tour on Thursday, 12 November
- **THEN** the form SHALL show Saturday, 14 November, autumn and hiking

### Requirement: A new tour's details take few taps

One activity SHALL be one pick from a menu, several from a list; a grade on the activity's scale SHALL be one tap; up to five contacts, those most often along first, SHALL be one tap each, the others one row further. After saving, the new tour SHALL open over the map.

#### Scenario: A grade in one tap

- **WHEN** the activity is hiking
- **THEN** T1 to T6 SHALL show inline and one tap SHALL set the grade

#### Scenario: Saved

- **WHEN** the user saves a new tour
- **THEN** the tour's sheet SHALL open over the map, the map on the tour

### Requirement: The route step shows the route's numbers

The route step SHALL show the drawn route's climb, descent, distance and time at the user's pace above its points, measured along the terrain as the saved tour measures them, and SHALL show the climb and time only once measured (offline: the points' heights).

#### Scenario: Start and goal set

- **WHEN** the user taps a start and a goal and the line follows the trails
- **THEN** the sheet SHALL show "↑ climb ↓ descent distance time" at its half height, and the saved tour SHALL show the same numbers

### Requirement: Activities, grade, seasons and partners as pills
The tour form SHALL offer activities, grades, seasons and partners as pills that wrap, as the PWA's chips: a tap picks or drops one. Activities, seasons and partners SHALL allow several at once; a grade scale SHALL allow one per scale. With several activities, which way each goes SHALL be one row away.

#### Scenario: Two activities
- **WHEN** the user taps "Ski touring" and "Hiking" in the form and saves
- **THEN** the tour shows both activities
