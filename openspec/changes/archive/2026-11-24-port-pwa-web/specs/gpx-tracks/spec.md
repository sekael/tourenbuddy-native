## ADDED Requirements

### Requirement: A way flown whole runs straight

A way flown whole (the glider alone, as the tour's numbers count it) SHALL be drawn as a straight
connector leg between its points, never along a trail or the tour's track (owner, 2026-11-24). A
single-line track SHALL be drawn only for the other way, cut at its point nearest the goal. A way
flown only in part keeps the track.

#### Scenario: Hike & fly out and back

- **WHEN** a hiking tour with an out-and-back track gets paragliding as its way down, landing at the
  start
- **THEN** the map draws the track from the start up to the goal and a straight leg from the goal to
  the landing, not the walk back down

#### Scenario: Flight after a run

- **WHEN** the way down is a ski run to a lower launch and the flight
- **THEN** the whole track is drawn, the way down in its colours from the goal on

#### Scenario: No landing

- **WHEN** the way down is flown whole but the tour has no end
- **THEN** the track ends at the goal and no flight is drawn
