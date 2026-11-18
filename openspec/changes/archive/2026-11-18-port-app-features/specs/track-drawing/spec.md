## ADDED Requirements

### Requirement: Each way follows its activities
The route step and the drawing SHALL route each way (start → goal, goal → end) along the network of its own activities, by the PWA's priority: the ski routes on skis, else the hiking trails, the overlays shown while the tour has no activity. A way flown whole (the glider alone on it) SHALL go straight. The step SHALL say what each way follows, and leave the map's overlays as they were.

#### Scenario: Hike & fly
- **WHEN** the user plans a tour of hiking up and paragliding down from start over the summit to a landing in the valley
- **THEN** the way up follows the hiking trails, the way down runs straight from the summit to the landing, the step reads "Hinauf: Wanderwege · Hinunter: Luftlinie (geflogen)", and the saved track keeps both

#### Scenario: Activities picked after the route
- **WHEN** the user plans start, goal and landing before any activity, then picks hiking and paragliding in the form
- **THEN** the planned track's way down is flown straight before the tour can be saved, its way up keeps its trail; a file's or a saved tour's track stays as it is

#### Scenario: A ski tour follows the ski routes
- **WHEN** the user plans a tour whose activity is ski touring, with only the hiking overlay shown
- **THEN** the line follows the ski routes, and the overlays stay as they were (only hiking shown)

### Requirement: Following can be switched off
A switch "Den Wegen folgen" SHALL turn following off, every leg straight, and on again.

#### Scenario: Straight by choice
- **WHEN** the user switches "Den Wegen folgen" off
- **THEN** every leg runs straight between its points, and switched on again the ways are followed as before

#### Scenario: Overlays at hand
- **WHEN** the user is in the route step or drawing and taps the "Skitouren" chip at the top of the map
- **THEN** the ski overlay shows on the map, the step and its points stay as they were, and another tap hides it

### Requirement: The route step's line can be shaped
In the route step, the user SHALL be able to hold and drag start, goal and end to move them (each is named and measured anew), drag the dot halfway along a leg to send the route through another point, and tap such a point to remove it. Points pulled out SHALL stay with the route when the user comes back to it from the form, and a saved route SHALL open in the step with its shape (its track cut at its points) until a point moves.

#### Scenario: The line follows the finger
- **WHEN** the user holds a point (or a leg's dot) and drags it across the map
- **THEN** the line runs straight through the finger the whole way, and on the drop it is routed along the ways

#### Scenario: Send the route over another path
- **WHEN** the route from start to goal follows one valley and the user drags the leg's middle dot onto a path in the next one
- **THEN** the route goes through that point along the ways, and climb, distance and time update

### Requirement: A line has one start, one goal and one end
A tour's route and its track SHALL have exactly one start, one goal and one end: the start where the line begins, the end where it ends (none when it ends at the goal). Finishing a drawing or importing a GPX file SHALL set the tour's start and end to the line's ends, each named and measured anew when it moved.

#### Scenario: Drawing on past the end
- **WHEN** the user plans start, goal and end, then draws three more points beyond the end and saves
- **THEN** the tour's end is the last drawn point, named after its place, and the map shows one end flag where the track ends

### Requirement: A drawn point goes with a tap
While drawing and in the route step, a quick tap on a point SHALL remove it, its neighbours joined along the ways; holding a point and dragging it SHALL move it. A tap on the goal SHALL pick it for the next map tap instead. While drawing, undo brings a point back; in the route step, the next map tap sets a removed start or end anew.

#### Scenario: Remove a point by tapping it
- **WHEN** the user taps a point of the drawn line (start, end or a point between)
- **THEN** the point goes, the line joins its neighbours, and the numbers update

#### Scenario: Remove the start in the route step
- **WHEN** the user taps the start's marker in the route step
- **THEN** the start goes, the sheet's Start row is the active one, and the next map tap sets the start there
