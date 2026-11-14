## ADDED Requirements

### Requirement: The user picks what the line follows
The route step and the drawing SHALL offer a choice of what the line follows: the hiking trails, the ski routes, or a straight line. It SHALL start from the tour's activity (ski routes for an activity on skis, hiking trails for any other), else from the overlays shown. The choice SHALL leave the map's overlays as the user set them (the line follows a network whether it shows or not); legs already set SHALL follow the new choice.

#### Scenario: A ski tour follows the ski routes
- **WHEN** the user plans a tour whose activity is ski touring, with only the hiking overlay shown
- **THEN** the line follows the ski routes, and the overlays stay as they were (only hiking shown)

#### Scenario: Ski routes make a ski tour
- **WHEN** a user whose tours are hikes adds a tour and switches the line to follow the ski routes before picking an activity
- **THEN** the new tour's activity becomes ski touring; once the user picks an activity in the form, the line's choice no longer changes it

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
While drawing, tapping a point SHALL remove it (the goal excepted), its neighbours joined along the ways; undo brings it back.

#### Scenario: Remove a point by tapping it
- **WHEN** the user taps a point of the drawn line (start, end or a point between)
- **THEN** the point goes, the line joins its neighbours, and the numbers update
