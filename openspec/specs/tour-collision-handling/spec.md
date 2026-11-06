# tour-collision-handling Specification

## Purpose
Collision detection and visualization for same-objective tour planning among friends. Replaces the legacy duplicate-save prompt with a non-blocking save flow and post-save notifications.

## Requirements

### Requirement: Goal collision detection
Two tours SHALL be treated as the same objective when ALL of the following hold: their goal points lie within a 200 m radius of each other; they share at least one activity type; both have `visibility = 'friends'`; and their owners are mutual accepted friends. Collision distance SHALL be computed with the existing tour distance utility. The same predicate SHALL be applied by the client (`domain/collision.ts`, `COLLISION_RADIUS_M = 200`: info-sheet collision notice, map precedence, link suggestions) and by the database (`fn_collision_predicate` and the `fn_scan_*` helpers: post-save scan in the tour RPCs, friendship-accept backfill scan, link-request checks); the two radii SHALL be kept in sync.

#### Scenario: All conditions met
- **WHEN** A's tour and B's tour are within 200 m, share at least one activity type, are both friends-visible, and A and B are accepted friends
- **THEN** the two are treated as a collision for notices, map precedence, and link suggestions

#### Scenario: Different tour type
- **WHEN** A's and B's tours are within 200 m and friends-visible but have no activity type in common
- **THEN** no collision is triggered

#### Scenario: Null tour type
- **WHEN** A's or B's tour has no activity type
- **THEN** no collision is triggered (an untyped tour matches nothing, including another untyped tour)

#### Scenario: Overlapping activities
- **WHEN** A's tour has types `skitour` and `hiking`, B's tour has only `hiking`, and all other conditions hold
- **THEN** the two are treated as a collision

#### Scenario: One side private
- **WHEN** A's tour is friends-visible but B's tour is private (or vice versa)
- **THEN** no collision is triggered

#### Scenario: Owners not friends
- **WHEN** A's and B's tours satisfy the geometric and visibility conditions but A and B are not accepted friends
- **THEN** no collision is triggered

#### Scenario: Goals outside radius
- **WHEN** a new tour's goal is more than 200 m from every otherwise-matching tour's goal
- **THEN** no collision is triggered and the tour saves normally

### Requirement: Owned-over-friend map precedence
On the map, when an owned tour and a friend tour collide (within 200m), the owned tour SHALL take precedence and the colliding friend marker SHALL be suppressed. The colliding friend tour SHALL still appear in the Friends list tab.

#### Scenario: Owned marker wins on the map
- **WHEN** an owned tour and a friend tour collide with matching tour types
- **THEN** only the owned marker renders on the map and the friend marker is suppressed

#### Scenario: Suppressed friend tour still listed
- **WHEN** a friend tour is suppressed on the map due to collision with an owned tour
- **THEN** that friend tour still appears in the Friends list tab
