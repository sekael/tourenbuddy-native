## Purpose

Tour info sheet that surfaces extended tour fields, attachments, and participants in a read-friendly layout.

## Requirements

### Requirement: Start and end point metadata display

A start or end point row SHALL name the point by its name when it has one, else by its coordinates, and SHALL show the point's elevation beside its name. A point without a name SHALL show no elevation. The end row of a one-way tour or a round trip reads as such instead (see Start/end point display).

#### Scenario: Start point with name and elevation

- **WHEN** the tour has `startPoint`, `startPointName`, and `startPointElevation`
- **THEN** the start point row SHALL display the name and the elevation, without the coordinates

#### Scenario: End point with name only

- **WHEN** the tour has `endPoint` and `endPointName` but null `endPointElevation`
- **THEN** the end point row SHALL display the name, without coordinates or an elevation value

#### Scenario: Point with coordinates only

- **WHEN** a start or end point has null name and null elevation
- **THEN** the row SHALL display only the coordinates (existing behavior preserved)

#### Scenario: Elevation without a name

- **WHEN** a start or end point has an elevation but no name
- **THEN** the row SHALL display the coordinates without the elevation

### Requirement: Elevation display

The tour info sheet SHALL display the elevation with the `landscape` Material Symbol icon. Every height in the app (goal, start, end, segment cards, route numbers) SHALL be written as swisstopo and SAC write it: whole metres, no thousands separator, a no-break space before `m`.

#### Scenario: Elevation present

- **WHEN** the tour has an elevation of 3079.4
- **THEN** the info sheet SHALL display it as "3079 m"

#### Scenario: No elevation

- **WHEN** the tour has null elevation
- **THEN** no elevation row SHALL be displayed

### Requirement: Description display with auto-linked URLs

The tour info sheet SHALL display the description text with URLs automatically converted to clickable links.

#### Scenario: Description with URL

- **WHEN** the tour description contains "Check https://example.com for details"
- **THEN** the URL portion SHALL render as a clickable `<a>` tag with `target="_blank"` and `rel="noopener noreferrer"`

#### Scenario: Description without URLs

- **WHEN** the tour description contains only plain text
- **THEN** it SHALL render as plain text

#### Scenario: No description

- **WHEN** the tour has null description
- **THEN** no description section SHALL be displayed

### Requirement: Season tags display

The tour info sheet SHALL display seasons as colored chips/tags.

#### Scenario: Seasons present

- **WHEN** the tour has one or more seasons
- **THEN** they SHALL be displayed as small tag chips (e.g., "Winter", "Spring")

#### Scenario: No seasons

- **WHEN** the tour has null or empty seasons
- **THEN** no season row SHALL be displayed

### Requirement: Start/end point display

The tour info sheet SHALL display start and end points with route icons. When the start point is set without an end point, the sheet SHALL indicate a one-way tour to the goal rather than a round trip. When the end point is set without a start point (a stage connected to the next one), the sheet SHALL display the end row alone.

#### Scenario: Start and end points set

- **WHEN** the tour has both start and end points, more than 10 m apart
- **THEN** they SHALL be displayed as two point rows, each by its name (else its coordinates), with `trip_origin` and `sports_score` icons (see Point icons match the form)

#### Scenario: Only start point (one-way to goal)

- **WHEN** the tour has a start point but null end point
- **THEN** the start row SHALL be displayed, and the end row beside it SHALL read "One-way to goal" with the goal's flag icon — unless the way down is flown, when it SHALL read "not set yet" under the Landing label

#### Scenario: End at the start (round trip)

- **WHEN** the tour's end point is the same place as its start point (within 10 m, as on the map)
- **THEN** the start row SHALL be displayed, and the end row SHALL read "Round trip" without an elevation

#### Scenario: Only end point (connected stage)

- **WHEN** the tour has an end point but null start point
- **THEN** the end point row SHALL be displayed — its name, else its coordinates, with its elevation only alongside a name — and no start row SHALL be displayed

#### Scenario: No start/end points

- **WHEN** both start and end points are null
- **THEN** no start/end point rows SHALL be displayed

### Requirement: Equipment display

The tour info sheet SHALL display equipment text with the `backpack` Material Symbol icon.

#### Scenario: Equipment present

- **WHEN** the tour has equipment text
- **THEN** it SHALL be displayed as a text block

#### Scenario: No equipment

- **WHEN** equipment is null
- **THEN** no equipment row SHALL be displayed

### Requirement: Notes display

The tour info sheet SHALL display notes text with the `sticky_note_2` Material Symbol icon.

#### Scenario: Notes present

- **WHEN** the tour has notes text
- **THEN** it SHALL be displayed as a text block

#### Scenario: No notes

- **WHEN** notes is null
- **THEN** no notes row SHALL be displayed

### Requirement: GPX track indicator

The tour info sheet SHALL indicate when a GPX track is available.

#### Scenario: GPX track present

- **WHEN** the tour has a GPX track
- **THEN** the info sheet SHALL display a "Track available" indicator with the `route` icon
- **AND** the GPX track SHALL be visible on the map

#### Scenario: No GPX track

- **WHEN** the tour has no GPX track
- **THEN** no track indicator SHALL be displayed

### Requirement: Adaptive info layout

The info sheet SHALL only display sections for fields that have values, maintaining clean spacing.

#### Scenario: Tour with all fields

- **WHEN** all optional fields are populated
- **THEN** all sections SHALL be displayed in logical order with consistent spacing

#### Scenario: Tour with minimal fields

- **WHEN** only name and goal are set (legacy tour)
- **THEN** only name and coordinates SHALL be displayed, with no empty sections or gaps

### Requirement: Completion toggle control

The tour info sheet SHALL display the completion toggle as a labelled tonal button in the owner toggles row directly below the hero, beside the visibility toggle. Not completed, it SHALL show an empty circle and the action label "Complete Tour"; completed, a check-circle on a success tint and the label "Completed". It SHALL expose its state as a pressed state. Activation SHALL invoke the tours store `setCompleted` action instantly — no confirmation dialog — for both mark and unmark directions.

#### Scenario: Toggle shown for tour owner

- **WHEN** the info sheet is opened by the tour's owner
- **THEN** the completion toggle control SHALL be visible in the owner toggles row below the hero, beside the visibility toggle
- **AND** its visual state SHALL reflect the tour's current `completed` field (check-circle on a success tint if true, empty circle if false)

#### Scenario: Toggle hidden or disabled for non-owner

- **WHEN** the info sheet is opened by a user who does not own the tour
- **THEN** the completion toggle control SHALL be hidden or rendered as non-interactive (consistent with how edit and delete are gated for non-owners)

#### Scenario: Mark tour completed from info sheet

- **WHEN** the tour is not completed and the user activates the toggle
- **THEN** the store `setCompleted(tourId, true)` action SHALL be invoked immediately without a confirmation prompt
- **AND** the control SHALL immediately display the completed state

#### Scenario: Unmark tour from info sheet

- **WHEN** the tour is completed and the user activates the toggle
- **THEN** the store `setCompleted(tourId, false)` action SHALL be invoked immediately without a confirmation prompt
- **AND** the control SHALL immediately display the not-completed state

#### Scenario: Failure surfaced to user

- **WHEN** `setCompleted` fails and rolls back
- **THEN** the toggle control SHALL reflect the original state
- **AND** the error SHALL be surfaced via the existing snackbar/error presentation pattern

### Requirement: Attachments list in tour info

The tour info sheet SHALL display the tour's attachments as a horizontal scrollable strip of thumbnails (image preview for images, generic PDF icon for PDFs) with filename labels, ordered by `sort_order`.

#### Scenario: Tour with attachments

- **WHEN** the tour has one or more attachments
- **THEN** the info sheet SHALL render a thumbnail strip with one entry per attachment

#### Scenario: Tour without attachments

- **WHEN** the tour has zero attachments
- **THEN** no attachments section SHALL be rendered

### Requirement: Open attachment in full-screen viewer

Tapping an attachment thumbnail in the info sheet SHALL open the full-screen viewer focused on that attachment, allowing horizontal flip between all attachments of the tour.

#### Scenario: Open viewer from thumbnail

- **WHEN** the user taps an attachment thumbnail
- **THEN** the full-screen viewer SHALL open with that attachment active AND the user SHALL be able to flip to the other attachments

### Requirement: Download attachment from viewer

The full-screen viewer SHALL expose a download control that saves the original file using its `original_filename`.

#### Scenario: User downloads

- **WHEN** the user taps the download control in the viewer
- **THEN** the browser SHALL save the file to the user's device using the original filename

### Requirement: Planned date renders as a span

The tour info view SHALL render a tour's planned date as a locale-formatted date **range**
when the tour has an end date, and as a single locale-formatted date when it does not. The
range SHALL be produced by the locale's own range formatting (`Intl.DateTimeFormat`
`formatRange`), not by concatenating two formatted dates with a hard-coded separator.

#### Scenario: Multi-day tour

- **WHEN** a tour has a planned date of 25 August 2026 and an end date of 27 August 2026
- **THEN** the info view SHALL show a single range label covering both dates, formatted per
  the active locale

#### Scenario: Single-day tour

- **WHEN** a tour has a planned date and no end date
- **THEN** the info view SHALL show exactly the single formatted date it showed before this
  capability existed

#### Scenario: Undated tour

- **WHEN** a tour has no planned date
- **THEN** no date label SHALL be rendered, regardless of the end date value

### Requirement: Legs at a glance

A split tour SHALL show its way-up activities after an up arrow and its way-down activities after
a down arrow in the detail and on stage cards, and its activity disc SHALL lead with the way up.
When the way down is flown, the end point SHALL read as the landing.

#### Scenario: Climb & fly detail

- **WHEN** a tour climbs up and flies down
- **THEN** the detail SHALL read "↑ Climbing ↓ Paragliding" and the end row SHALL be named "Landing"

### Requirement: Route numbers per leg

A GPX track with heights SHALL count every rise and drop, a split tour's too, except on a way flown whole (a lone glider's way down included), which counts only its net change — a thermal is neither climb nor extra descent. The track's distance SHALL be the walked way's alone, with heights or without — none for a day flown both ways. A flown way SHALL show its arrow and its activities' icons, the glider last — the glider alone for a pure flight.

#### Scenario: Hike & fly with a thermal

- **WHEN** a hike & fly track climbs 1000 m on foot and the flight circles 300 m up in a thermal
  before landing 1000 m below the summit
- **THEN** the route SHALL read "↑ 1000 m", a glider with 1000 m, and the walk's distance

#### Scenario: A dip on the walk up

- **WHEN** a hike & fly walk drops 100 m into a col before climbing to the summit
- **THEN** its descent SHALL count those 100 m plus the flight's net drop

#### Scenario: Thermal flight from the valley

- **WHEN** a lone glider flies the way up too, circling in thermals with 100 m of sink to a goal
  1000 m above the start
- **THEN** its climb SHALL read 1000 m, the sink not counted as descent, and no distance SHALL show

#### Scenario: A split tour walked down

- **WHEN** a split tour skis up and hikes down over a 50 m counter-climb
- **THEN** its climb and descent SHALL be the whole track's, the counter-climb included

#### Scenario: One way to a hut

- **WHEN** a stage ends at its goal
- **THEN** its route numbers SHALL show the climb and no "↓ 0 m"

#### Scenario: Ski down to a lower launch, then fly

- **WHEN** a ski & fly tour skis and flies the way down
- **THEN** its descent SHALL read with the arrow, the ski-tour icon and the glider

#### Scenario: An outing with a flown stage

- **WHEN** a two-day outing climbs on foot both days and flies down on the second
- **THEN** its totals SHALL read the climb plain and the descent with the glider

### Requirement: Route numbers

The tour detail SHALL show the route's climb, descent and, when known, distance from the most
accurate data, never typed. A tour with a GPX track SHALL count the track: its distance, and climb
and descent from its heights (past a 5 m swing) or, without heights and online, the terrain's along
its line. Only without a usable track SHALL the point heights count over start → goal → end, every rise as climb and every drop as descent. While the
track loads no numbers SHALL show. A 0 SHALL NOT show.

#### Scenario: Hut to summit to valley without a track

- **WHEN** a tour starts at a hut at 2632 m, has its goal at 3079 m and ends in the valley at 1822 m
- **THEN** the detail SHALL show a climb of 447 m and a descent of 1257 m and no distance

#### Scenario: Track with heights

- **WHEN** the tour has a GPX track with heights
- **THEN** the detail SHALL show the track's distance, climb and descent instead of the point heights' numbers

#### Scenario: Start height missing

- **WHEN** the tour has a start point without a height, its goal at 3079 m, its end at 1822 m, and no track
- **THEN** the detail SHALL show a descent of 1257 m and no climb

#### Scenario: No start point (connected stage)

- **WHEN** a stage without a start has its goal at 3420 m and ends at a hut at 2795 m
- **THEN** the detail SHALL show a descent of 625 m and no climb, and an outing's totals SHALL include that descent

#### Scenario: Leg running the other way

- **WHEN** a tour starts at 2632 m, its goal lies at 1707 m, and it ends at a viewpoint at 1950 m
- **THEN** the detail SHALL show a descent of 925 m and a climb of 243 m

#### Scenario: Completion or visibility toggled on a tour with a track

- **WHEN** the owner marks a tour with a GPX track completed or toggles its visibility
- **THEN** the detail SHALL keep showing the track's numbers throughout, never falling back to the point heights' numbers while the tour reloads

#### Scenario: Track without heights

- **WHEN** a tour's track was drawn offline or uploaded without heights, and the app is online
- **THEN** the detail SHALL show climb and descent from the terrain's heights along the track, not from the point heights

#### Scenario: Track still loading

- **WHEN** the tour detail opens before its track has loaded
- **THEN** no route numbers SHALL show until the track's are known

### Requirement: Estimated time

A tour with a track distance SHALL show its estimated time at the user's pace by the drawing panel's
rule (track-drawing: Time estimate) — the time the drawing and the form's track showed — with a pace
off 1.0 as its factor badge. A tour on lifts, bike or climbing alone, or with a flown way, SHALL show
none; without a distance no time SHALL be estimated.

#### Scenario: Time at the user's pace

- **WHEN** a hiking tour's track is 4 km long with 600 m of climb and the user's pace is 1.2
- **THEN** the detail SHALL show 2:05 h beside the climb, descent and distance, with the badge "1.2×" and no tortoise or hare beside the time

### Requirement: Point icons match the form

The start, goal and end of a tour SHALL use the same icons wherever they show — form, detail rows and map markers: a ring for the start, a flag for the goal, a chequered flag for the end. No house glyph SHALL mark a start, since a house marks a hut on swisstopo maps.

#### Scenario: Start marker on the map

- **WHEN** a tour with a start point is open
- **THEN** its start marker SHALL carry the ring glyph and its detail row the ring icon

### Requirement: Grade and start time in the details

The tour details SHALL show the grade beside the activities and the start time after the planned
date. List rows and outing stage cards SHALL show the grade with the activities. Nothing SHALL be
shown for a missing grade or time.

#### Scenario: Graded tour with a start time

- **WHEN** a ski tour has grade "WS+", date 13 March 2027 and start time 06:30
- **THEN** the details SHALL read the activity with "WS+" and the date with "06:30"

#### Scenario: Stage card

- **WHEN** a stage has activity ski tour and grade "ZS"
- **THEN** its card SHALL read "Ski tour · ZS" before the date

### Requirement: Owner toggles keep one layout in every state

The owner toggles row SHALL lay out the same way whether the tour is completed, private, both or neither: each toggle SHALL be as wide as its longer label, so flipping a toggle never moves the row between one and two lines. The labels SHALL fit both toggles on one line on a 375 px wide phone in every supported locale.

#### Scenario: Flipping a toggle keeps the row

- **WHEN** the owner marks a tour completed or private, or reverses either
- **THEN** both toggles SHALL keep their width and the row its number of lines

#### Scenario: Phone width

- **WHEN** the owner opens a tour on a 375 px wide screen in any supported locale
- **THEN** both toggles SHALL share one line, in every state

#### Scenario: Too narrow for one line

- **WHEN** the row is too narrow for both toggles side by side
- **THEN** each toggle SHALL take a full line, in every state
