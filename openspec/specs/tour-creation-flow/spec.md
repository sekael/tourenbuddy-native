# tour-creation-flow Specification

## Purpose
Creating a tour starts on the live map: start, goal and end are set by a tap or a search, the route
follows the ways and becomes the tour's track, and the details form (side drawer on desktop) opens
with the points, names and heights already filled.

## Requirements

### Requirement: Route step on the live map

Creating a tour SHALL start with a route step on the live map in which the start, the goal and the end
are set in that order, each by a tap on the map or by a search result, without a full-screen picker.
The start and the end MAY be skipped; the goal SHALL be required to continue. The end SHALL offer a
round trip back to the start once a start is set.

#### Scenario: Three points in one step

- **WHEN** the user taps "+", taps the map three times and continues
- **THEN** the form SHALL open with that start, goal and end, each named and with its height

#### Scenario: Search names the point

- **WHEN** the user chooses "Engstlenalp" in the search while the end is active
- **THEN** the end SHALL be set there with the name "Engstlenalp"

#### Scenario: Goal only

- **WHEN** the user skips the start and continues after setting the goal
- **THEN** the form SHALL open with the goal and no start or end

### Requirement: The route shows as points land

The route step SHALL draw the straight legs between the set points and SHALL show the climb and descent
of those legs from the points' heights as soon as two heights are known. A set point SHALL be movable
by dragging it.

#### Scenario: Climb and descent

- **WHEN** the start (1000 m) and the goal (2500 m) are set
- **THEN** the step SHALL show a climb of 1500 m and a descent of 0 m

#### Scenario: Dragging a point

- **WHEN** the user drags the goal to another place
- **THEN** the leg SHALL follow, and the goal's name and height SHALL be looked up again

### Requirement: Form changes go back to the map step

In the creation form, picking or changing the start, goal or end SHALL reopen the route step on that
point with all points of the stage shown; finishing SHALL hand only the moved points to the form, which
keeps every other field as it was.

#### Scenario: Moving the end from the form

- **WHEN** the user taps Change on the end point, taps the map elsewhere and taps Done
- **THEN** the form SHALL show the new end with its name and height and keep the typed tour name

### Requirement: Desktop creation form beside the map

On desktop the creation form SHALL open in the side drawer, like the tour details, and SHALL stay open
while points are set on the map beside it.

#### Scenario: Map visible while the form is open

- **WHEN** the creation form is open on a desktop screen
- **THEN** the map SHALL stay visible beside the drawer with the draft route on it

### Requirement: The route follows the ways

The route step SHALL join its points along the trails and ways (the shown trail layer, else the tour's
activities, else the base map's ways), keeping each point where it was set, and SHALL show the route's
length, climb, descent and time. A leg SHALL go straight where the ways don't lead to its points. It
SHALL offer to draw straight lines instead, and SHALL say so when the ways can't be loaded.

#### Scenario: Hut to pass

- **WHEN** the start is set at a hut and the goal at a pass with a hiking trail between them
- **THEN** the line SHALL follow the trail and both points SHALL stay where they were set

#### Scenario: Offline

- **WHEN** the ways can't be loaded
- **THEN** the legs SHALL go straight and the step SHALL say the ways aren't loaded

#### Scenario: Ridge to the summit

- **WHEN** two points are set on a ridge, off the ways, and the nearest ways run down in the valley
- **THEN** the leg between them SHALL go straight from one to the other, not down to the valley path

### Requirement: The route is the track

The routed line SHALL become the stage's track, anchored at its start, goal and end. Drawing the track
SHALL start from those points; changing points SHALL change the track, and changing the track's points
SHALL change the stage's points. An uploaded GPX SHALL stay as it is.

#### Scenario: Draw from the route

- **WHEN** the user has set a start and a goal and taps "Draw track"
- **THEN** the drawer SHALL open with the line from the start to the goal along the ways

#### Scenario: Track moves the start

- **WHEN** the user drags the track's first point 50 m and finishes
- **THEN** the start SHALL move there and keep its name

#### Scenario: Straight drops a drawn track

- **WHEN** the user turns off following the ways on a stage with a drawn track and continues
- **THEN** the stage SHALL have no track and show straight legs

#### Scenario: Uploaded track stays

- **WHEN** the user moves the end of a stage with an uploaded GPX
- **THEN** the GPX SHALL stay unchanged

### Requirement: The route's line is shaped in the route step

While following the ways, each leg of the route step SHALL show a handle halfway along it; dragging the
handle SHALL add a point between the stops there, landed on the way the leg reaches, and both legs on
either side SHALL follow the ways again. Points between SHALL be draggable and SHALL be removed by a
tap. The track handed on SHALL keep them, so the track drawer and a reopened route step show them as
the drawing's points. While a leg is on its way, the step SHALL say so.

#### Scenario: Pull the line over a pass

- **WHEN** the user drags the handle of the start–goal leg onto another path and lets go
- **THEN** the line SHALL run from the start along the ways through that point to the goal

#### Scenario: Edit on map after Continue

- **WHEN** the user has shaped the line with a point between, continues, and taps "Edit on map"
- **THEN** the drawer SHALL open with that point among the drawing's points

#### Scenario: Round trip back the same way

- **WHEN** the line runs from the start through a point between to the goal and the user taps Rundtour
- **THEN** the way back SHALL run the same line in reverse, through that point, until the user shapes it

#### Scenario: A point between off the ways

- **WHEN** the user drags a handle onto open ground with no way near and lets go
- **THEN** the point SHALL stay there and both its legs SHALL go straight to it

#### Scenario: Remove a point between

- **WHEN** the user taps a point between
- **THEN** it SHALL be removed and its two legs SHALL become one, along the ways

### Requirement: The route step's sheet folds on a phone

On a phone the route step's panel SHALL fold down — by dragging its grip or head, or tapping the grip —
to its summary (the day or title, the numbers and next step, the buttons), leaving the rest of the
screen to the map, and SHALL unfold the same way. The fold SHALL hold across the trip's days. Folded, the
summary SHALL say when a leg is on its way or found no way.

#### Scenario: More map while setting points

- **WHEN** the user drags the sheet's grip down
- **THEN** the points' rows and the follow switch SHALL fold away and the map SHALL show above the summary
