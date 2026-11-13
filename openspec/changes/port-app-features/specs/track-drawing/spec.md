## ADDED Requirements

### Requirement: The user picks what the line follows
The route step and the drawing SHALL offer a choice of what the line follows: the hiking trails, the ski routes, or a straight line. It SHALL start from the tour's activity (ski routes for an activity on skis, hiking trails for any other), else from the overlays shown. Choosing trails or ski routes SHALL show that overlay on the map; legs already set SHALL follow the new choice.

#### Scenario: A ski tour follows the ski routes
- **WHEN** the user plans a tour whose activity is ski touring, with only the hiking overlay shown
- **THEN** the line follows the ski routes and the ski route overlay turns on

### Requirement: The route step's line can be shaped
In the route step, the user SHALL be able to hold and drag start, goal and end to move them (each is named and measured anew), drag the dot halfway along a leg to send the route through another point, and tap such a point to remove it. Points pulled out SHALL stay with the route when the user comes back to it from the form.

#### Scenario: Send the route over another path
- **WHEN** the route from start to goal follows one valley and the user drags the leg's middle dot onto a path in the next one
- **THEN** the route goes through that point along the ways, and climb, distance and time update
