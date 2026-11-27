## MODIFIED Requirements

### Requirement: Moving points, loops and undo

A point SHALL be draggable with a finger or the mouse, showing straight legs while held and
following the network again when let go. On the web, a tap on the start of a line with two or
more points SHALL close a loop back to it. Undo and redo SHALL step through every set, move,
split, removal, loop and way back.

#### Scenario: Drag a point

- **WHEN** the user selects a point, drags it and lets go
- **THEN** both its legs SHALL follow the network to its new place, and undo SHALL put it back

#### Scenario: Close a loop

- **WHEN** the line has three points on the web and the user taps its start
- **THEN** a last leg SHALL run back to the start

### Requirement: The route step's line can be shaped
In the route step, the user SHALL be able to select start, goal, end or a point between with a tap and then move it (each is named and measured anew), and select the dot halfway along a leg to send the route through another point. A selected point or dot SHALL move with a drag that starts as soon as the finger moves on it, with no hold first and without panning the map, or to the next map tap. Points pulled out SHALL stay with the route when the user comes back to it from the form, and a saved route SHALL open in the step with its shape (its track cut at its points) until a point moves.

#### Scenario: The line follows the finger
- **WHEN** the user selects a point (or a leg's dot) and drags it across the map
- **THEN** the point follows the finger from its first movement, the line runs straight through the finger the whole way, the map stays still, and on the drop it is routed along the ways

#### Scenario: Send the route over another path
- **WHEN** the route from start to goal follows one valley and the user drags the leg's middle dot onto a path in the next one
- **THEN** the route goes through that point along the ways, and climb, distance and time update

## REMOVED Requirements

### Requirement: A drawn point goes with a tap
**Reason**: A tap removed a point by accident, and a press held too long was neither a tap nor a move (owner, 2026-11-26). A tap now selects.
**Migration**: "A tap selects a drawn point" below; the delete button removes the selected point ("Undo, redo and delete in every drawing step").

## ADDED Requirements

### Requirement: A tap selects a drawn point
In the iOS and Android app, while drawing and in the route step, a tap on a point or a leg's dot SHALL select it, however long the finger rested; a tap on the selected one SHALL release it (in the route step a start, goal or end stays the active point, which map taps set). A tap never removes a point. While one is selected, the next map tap SHALL move the point there (a leg's dot: send the leg through there) and release it; without a selection a map tap sets a point as before.

#### Scenario: Select a point by tapping it
- **WHEN** the user taps a point of the drawn line
- **THEN** the point is marked clearly as selected on the map, the sheet's hint says what to do next, the line is unchanged, and no new point is set

#### Scenario: A slow tap
- **WHEN** the user rests a finger on a point for a second and lifts it without moving
- **THEN** the point is selected, as with a quick tap

#### Scenario: Move by tapping the map
- **WHEN** a point between start and goal is selected and the user taps elsewhere on the map
- **THEN** the point moves there, its legs follow the ways, and it is no longer selected

### Requirement: Undo, redo and delete in every drawing step
The route step and drawing SHALL show undo, redo and delete as three buttons side by side in the sheet, in reach at the sheet's lowest height on a 6.1-inch phone, as the swisstopo app does; the bar's "Back" SHALL keep leaving the step. Undo and redo SHALL step through every change to the line's points: set by a tap or a search, moved, pulled out of a leg, removed, and (in the route step) the round trip switched on or off; a point brought back SHALL keep its name and height, and a new change SHALL clear redo. Delete SHALL remove the selected point, its neighbours joined along the ways; in the route step a removed start or end is set anew by the next map tap. Delete SHALL be disabled without a selection, for a leg's dot and for the goal. All three SHALL be disabled while a change is still being routed.

#### Scenario: Delete a selected point
- **WHEN** the user taps a point between start and goal and then the delete button
- **THEN** the point goes, the line joins its neighbours, and the numbers update

#### Scenario: Undo a deletion
- **WHEN** the user deletes a selected point and taps undo
- **THEN** the point is back where it was and the line runs through it again; redo removes it again

#### Scenario: Undo a moved goal in the route step
- **WHEN** the user moves the goal to another summit and then taps undo
- **THEN** the goal is back on the first summit with its name and height

#### Scenario: Nothing selected
- **WHEN** no point is selected
- **THEN** the delete button is disabled
