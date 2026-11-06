# tour-outings Specification

## Purpose
Multi-day tours as one outing: each night starts a new segment (stage), each segment is a tour
of its own, and the outing ties them together in order for the overview, the map and the list.

## Requirements

### Requirement: Outing membership on tours

A tour SHALL optionally belong to an outing through three fields on its row: `outing_id`
(uuid), `outing_name` (text, shorter than 100 characters) and `outing_position` (integer).
`outing_id` and `outing_position` SHALL be set together or not at all, and `outing_name` SHALL
be null when `outing_id` is null. The domain `Tour` SHALL carry `outing: { id, name, position }`
or null.

#### Scenario: Invalid membership rejected

- **WHEN** a write sets `outing_id` without `outing_position`, or a name without an id
- **THEN** the database SHALL reject it with a check violation

### Requirement: Outing identity and order

Segments of an outing SHALL be ordered by position, then by tour id. An outing SHALL be
identified by its owner and its id together, and SHALL be presented as an outing only while at
least two of its segments are visible to the viewer; otherwise each segment presents as a plain
tour. The outing's display name SHALL be its stored name, falling back to the first segment's
name.

#### Scenario: Segments sorted by position

- **WHEN** an outing's segments have positions 2, 0 and 5
- **THEN** they SHALL be listed and numbered 1, 2, 3 in the order 0, 2, 5

#### Scenario: Copied outing id stays separate

- **WHEN** a user's tour carries the same `outing_id` as a friend's outing
- **THEN** the user's tour SHALL NOT appear as a segment of the friend's outing

#### Scenario: Single visible segment

- **WHEN** a viewer can see only one segment of an outing
- **THEN** that segment SHALL present as a plain tour (no outing row, no navigator, no badge)

### Requirement: Outing writes ride the tour write

`create_tour_full` and `update_tour_full` SHALL accept a trailing `p_outing jsonb` argument:
null keeps the tour's current membership on update and creates a standalone tour on create;
`{}` makes the tour standalone; `{"id", "name", "position"}` makes it that outing's segment.
Outing membership, name and position changes SHALL NOT count as meaningful tour changes for
partner notifications. Offline, an outing edit SHALL queue, coalesce and replay as the tour's
own update.

#### Scenario: Stale client keeps membership

- **WHEN** a client that predates outings saves a segment (no `p_outing` argument)
- **THEN** the tour SHALL stay in its outing with its name and position unchanged

#### Scenario: Leaving an outing

- **WHEN** a client saves a segment with `p_outing = {}`
- **THEN** the tour's outing fields SHALL all be null

#### Scenario: Outing edit does not notify partners

- **WHEN** the owner renames an outing or reorders its segments
- **THEN** no partner notification SHALL be recorded for the touched tours

#### Scenario: Offline rename

- **WHEN** the owner renames an outing while offline
- **THEN** each segment's update SHALL be queued and the new name SHALL show immediately, and
  the writes SHALL replay on reconnect

### Requirement: Add a segment

The owner SHALL be able to add a segment from a tour's detail and from the outing overview.
Adding SHALL offer two paths in the same sheet: pick a new goal on the map, or choose one of the
owner's standalone tours. A segment SHALL be appended after the last position. When the anchor
tour is not yet in an outing, the outing SHALL be created only when the new segment is saved
(the anchor joins first as segment 1), so cancelling leaves no outing behind.

#### Scenario: First segment added to a standalone tour

- **WHEN** the owner adds a segment to a standalone tour "Cabane de Bertol" and saves the new tour
- **THEN** both tours SHALL form an outing, "Cabane de Bertol" as segment 1 and the new tour as segment 2

#### Scenario: Cancelled new segment

- **WHEN** the owner starts adding a segment to a standalone tour and cancels the form
- **THEN** the tour SHALL remain standalone

#### Scenario: Existing tour added

- **WHEN** the owner chooses an existing standalone tour in the add-segment view
- **THEN** that tour SHALL become the outing's last segment

### Requirement: New segment form is seeded from the previous segment

A new segment's form SHALL be seeded from the outing's last segment: same activity types,
partners, visibility and seasons; planned date = the day after that segment's last day (a new
stage starts after a night); start point = its end point, else its goal, with name and elevation.
An undated previous segment SHALL leave the date empty.

#### Scenario: Seeded from the previous segment

- **WHEN** the previous segment ends at "Cabane de Bertol" (2311 m) on 12 March with types ski tour
- **THEN** the new segment's form SHALL open with start "Cabane de Bertol", 2311 m, planned date
  13 March and type ski tour

#### Scenario: Previous segment spans days

- **WHEN** the previous segment runs from 12 to 14 March
- **THEN** the new segment SHALL be dated 15 March

### Requirement: Outing overview

Selecting an outing (a segment's map marker, or its list row) SHALL open an overview sheet
titled with the outing's display name, with a header and a numbered timeline of its segments.
Tapping a segment SHALL open that segment's tour detail; back from there SHALL return to the overview.

#### Scenario: Marker opens the overview

- **WHEN** a user taps the marker of a segment of a three-segment outing
- **THEN** the overview SHALL open and the map SHALL frame all three segments

#### Scenario: Segment from the overview

- **WHEN** the user taps segment 2 in the overview and then goes back
- **THEN** segment 2's detail SHALL open, and back SHALL return to the overview

### Requirement: Outing overview reads like a stage plan

The overview header SHALL give the days spanned and the segment count, the date span, the way
from the first start to the last finish when both are named, and the total climb and descent of
what the segments know. Each timeline card SHALL show the name with the goal height, activity,
date, and its climb and descent when known and not 0; between two segments the timeline SHALL mark the night where the next one starts on a
later day, at the previous segment's finish.

#### Scenario: Hut night in a two-day outing

- **WHEN** segment 1 (29 Nov) ends at a hut at 2632 m and segment 2 starts there on 30 Nov
- **THEN** the header SHALL read "2 days · 3 segments" with the totals, and the timeline SHALL mark the night at the hut with its height between segments 1 and 2

#### Scenario: Dates out of order

- **WHEN** segment 2 is dated a day before segment 1
- **THEN** the timeline SHALL say so between them, without blocking the order or changing a date

#### Scenario: First stage without a start

- **WHEN** the first stage has a goal and an end but no start
- **THEN** the header SHALL name no way, and the totals SHALL still show, that stage counting its goal → end leg only

#### Scenario: A segment's height missing

- **WHEN** one segment's start has no height
- **THEN** the totals SHALL still show, adding up the climb and descent the segments know

### Requirement: Manage an outing

The owner SHALL be able to rename the outing, reorder segments by dragging them by their handle
(mouse, pen or finger; arrow keys on a focused handle), remove a segment and
add a segment from the overview. Removing a segment that would leave a single one SHALL dissolve
the outing. A friend's outing SHALL be read-only.

#### Scenario: Reorder

- **WHEN** the owner drags segment 3 onto segment 1
- **THEN** it SHALL become segment 1, the former segments 1 and 2 SHALL become 2 and 3, and the map SHALL redraw the new order at once

#### Scenario: Segment starting away from the previous finish

- **WHEN** a segment's start is not where the previous segment ends (its end, else its goal)
- **THEN** the timeline SHALL say so on that segment and the overview map SHALL link the two points with a dashed dark line, without blocking the order

#### Scenario: Reorder on a phone

- **WHEN** the owner opens edit mode on a phone and drags a segment's handle with a finger
- **THEN** the sheet SHALL show the segment cards and the segment SHALL move as with a mouse

#### Scenario: Removing from a two-segment outing

- **WHEN** the owner removes one segment of a two-segment outing
- **THEN** both tours SHALL become standalone and the overview SHALL close

#### Scenario: Friend's outing is read-only

- **WHEN** a user opens the overview of a friend's outing
- **THEN** no rename, reorder, remove or add control SHALL show

### Requirement: Segment navigator in tour detail

The tour detail of a segment SHALL show a navigator with the outing's display name, "segment n
of m" and previous / next controls. The name SHALL open the overview; previous / next SHALL
select the neighbouring segment and SHALL be disabled at the ends.

#### Scenario: Next segment

- **WHEN** the detail of segment 2 of 3 is open and the user taps next
- **THEN** segment 3's detail SHALL open

#### Scenario: Last segment

- **WHEN** the detail of the last segment is open
- **THEN** the next control SHALL be disabled

### Requirement: Outing focus on the map

While an outing's overview is open, the map SHALL draw every visible segment's goal marker
unclustered, with a white ring and a badge carrying its number. An open segment SHALL show as a
plain selected tour: only its own markers, track or connector. Opening the overview SHALL frame
the goals, starts and ends of all segments beside the sheet.

#### Scenario: Segments stay apart when zoomed out

- **WHEN** two segments of the focused outing are close enough to cluster at the current zoom
- **THEN** both SHALL still render as individual numbered markers

### Requirement: Outing tracks on the map

While an outing's overview is open, the map SHALL draw the GPX track (or connector) of every
segment. A track that finishes loading after the selection moved on SHALL NOT be drawn.

#### Scenario: Tracks in segment view

- **WHEN** segment 2 of an outing whose segments all have tracks is open
- **THEN** only segment 2's track SHALL be drawn

#### Scenario: Stale track load

- **WHEN** a track is still loading and the user selects another tour
- **THEN** the late track SHALL NOT replace the new selection's tracks

### Requirement: Outing rows in the tour list

The tour list SHALL show one row per outing in place of its segments, on both tabs. The row
SHALL appear when any segment passes the search and the active filters, at the position of the
first passing segment, and SHALL show the outing's display name, its segment count and date
span, and an avatar split between the segments' colours. Search SHALL also match the outing's
name. Tapping the row SHALL open the overview.

#### Scenario: Filter hits one segment

- **WHEN** the activity filter holds `paragliding` and only the second segment of an outing is a
  paragliding tour
- **THEN** the outing's row SHALL be listed

#### Scenario: Search by outing name

- **WHEN** the user searches "haute" and an outing is named "Haute Route" while none of its
  segments' names contain it
- **THEN** the outing's row SHALL be listed

### Requirement: Close a gap between stages

Where a stage starts away from the previous stage's finish, the owner SHALL be offered
"Connect", which makes the previous stage end at the next stage's start point (name and height
included). The gap SHALL disappear once both are saved. Friends SHALL only see the gap.

#### Scenario: Sleeping at the hut

- **WHEN** stage 1 ends on the Sustenhorn summit and stage 2 starts at the Tierberglihütte, and the owner taps "Connect"
- **THEN** stage 1's end point SHALL become the Tierberglihütte and the timeline SHALL show the night there

### Requirement: When to add a stage

The add-stage view SHALL state the rule: one day with one party is one tour, however many
summits; a night starts a new stage. The tour form SHALL say the same below the end date when the
dates span more than one day.

#### Scenario: A multi-day span

- **WHEN** the user sets 12 March to 14 March in the form
- **THEN** a hint below the end date SHALL suggest planning each day as a stage after saving

### Requirement: Outing chains on the map

Whenever at least two segments of one of the user's outings are on the map and no tour or
outing is open (an open one has the map to itself), the map SHALL draw a dotted, visibly bowed arc from each segment's goal to the next segment's
goal, beneath the markers, so that the chain reads as one outing without opening it, and never as
the route itself (which a straight line between goals would suggest). The open
outing SHALL show its segment tracks and numbered markers instead of the chain line. Chain lines
SHALL NOT be interactive and SHALL NOT affect clustering.

#### Scenario: Unopened outing shows its chain

- **WHEN** the map shows the three segments of "Piz Bernina Hike & Fly" and no outing is open
- **THEN** dotted arcs SHALL run from segment 1's goal to segment 2's goal and on to segment 3's goal
- **AND** each segment's label SHALL name its stage ("Etappe 1/3", "Etappe 2/3", "Etappe 3/3")

#### Scenario: Open outing hides its chain

- **WHEN** the user opens that outing's overview
- **THEN** its chain line SHALL NOT be drawn while its tracks and numbered markers are shown

#### Scenario: Open tour hides every chain

- **WHEN** the user opens any tour's detail
- **THEN** no chain line SHALL be drawn until it closes

#### Scenario: Single standalone tour

- **WHEN** a tour is not part of an outing
- **THEN** no chain line SHALL touch it

### Requirement: Lay out stages before the first save

The creation form SHALL offer "+ Next day" after the end point. It SHALL add a stage seeded from the
current one (activities, legs, partners, visibility, seasons), starting at its end (else its goal) with
name and height, dated the day after its last day, and SHALL open the route step for the new stage's
goal. The form SHALL let the user switch between the stages and remove a later stage. One save SHALL
create every stage as a segment of one new outing in order; cancelling SHALL create nothing.

#### Scenario: Three-day trek in one flow

- **WHEN** the user lays out three stages with "+ Next day" and saves once
- **THEN** three tours SHALL be created as segments 1, 2 and 3 of one outing, dated on consecutive days

#### Scenario: Stage with an error

- **WHEN** the user saves while stage 2 has no name
- **THEN** nothing SHALL be saved and stage 2 SHALL show with its name error

#### Scenario: Cancelled layout

- **WHEN** the user cancels after laying out two stages
- **THEN** no tour and no outing SHALL be created

### Requirement: Days in the route step

The route step of a multi-day layout SHALL show the days and SHALL offer "Next day", which keeps the
current day and plans the next from its end without leaving the step. Activities, partners and
visibility set on a day SHALL carry to the later days that had the same value; moving a day's date
SHALL move the later days that followed it.

#### Scenario: Next day from the map

- **WHEN** the user sets day 1's goal and end and taps "Next day"
- **THEN** day 2 SHALL be planned in the same step, starting at day 1's end, dated the day after

#### Scenario: Partner added on day 1

- **WHEN** the user adds a partner on day 1 of three
- **THEN** days 2 and 3 SHALL have the partner too, unless their partners were changed on their own

### Requirement: Split into daily stages

A creation form whose dates span several days, and a saved standalone tour (or an outing's last segment)
of its owner that does, SHALL offer "Split into daily stages". The tour SHALL keep its first day (its
end date cleared on save) and the route step SHALL open for the next day's stage, titled with the day's
place in the span.

#### Scenario: Split while creating

- **WHEN** the user sets 12–14 March in a new tour and taps "Split into daily stages"
- **THEN** the tour SHALL be dated 12 March only and the route step SHALL open for day 2 of 3, dated 13 March

#### Scenario: Split a saved tour

- **WHEN** the owner splits a saved tour dated 12–13 March and saves the day-2 stage
- **THEN** the tour SHALL be dated 12 March as segment 1 and the new stage, dated 13 March, segment 2
