## ADDED Requirements

### Requirement: Overlays while picking a route

While the user picks a new tour's start, goal and end in the route step, where the speed-dial menu
and its layers panel are hidden, the route step SHALL offer one toggle per trail overlay ("Hiking
trails", "Ski routes"), as the drawing panel does, with the same effect and persistence as the
layers panel's toggles (owner, 2026-11-26).

#### Scenario: Ski routes on while picking

- **WHEN** a desktop user creating a tour turns on "Ski routes" in the route step before setting
  the goal
- **THEN** the ski routes SHALL show on the map at once, and stay on after the tour is created
