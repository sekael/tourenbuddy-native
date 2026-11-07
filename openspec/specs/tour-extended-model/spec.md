## Purpose

Extended tour entity fields beyond the baseline (type, elevation, GPX reference, description, seasons, start/end points, equipment, notes, completion, multi-day span) and their persistence.

## Requirements

### Requirement: Tour type enum

A Zod enum (`tour-type.ts`) SHALL define the allowed tour activity types, mirrored by the `tours_tour_types_check` constraint: `skiing`, `snowboarding`, `skitour`, `splitboarding`, `ski-mountaineering`, `paragliding`, `hiking`, `mountaineering`, `climbing`, `mountain-biking`, `trailrunning`. Each type SHALL map to an i18n key, an icon, a marker colour, a darker track colour and a lighter preview colour. A tour SHALL carry a list of zero or more distinct types (`tour_types`, never null), kept in the enum's order; the first entry is the tour's primary type.

#### Scenario: Valid tour type parsed

- **WHEN** a tour row contains a `tour_types` list whose values all match enum values
- **THEN** the schema SHALL parse it into a `TourType[]` in the same order

#### Scenario: Null tour type

- **WHEN** a tour row has an empty `tour_types` list
- **THEN** the schema SHALL accept it and the tour SHALL have no primary type

#### Scenario: Unknown type rejected by the database

- **WHEN** a write stores a `tour_types` list containing a value outside the enum
- **THEN** the database SHALL reject the write

#### Scenario: Legacy single-type snapshot

- **WHEN** a tour cached or queued offline by a build before this change carries a single `tourType` and no `tourTypes`
- **THEN** the app SHALL read it as a one-element type list (or an empty list when the type was null)

### Requirement: Elevation field

The tour schema SHALL include an `elevation` field (number, nullable) representing meters above sea level at the tour goal point.

#### Scenario: Elevation present

- **WHEN** a tour row contains a numeric `elevation` value
- **THEN** the schema SHALL parse it as a number (meters)

#### Scenario: Elevation absent

- **WHEN** a tour row has `elevation` as null
- **THEN** the schema SHALL accept it as null

### Requirement: GPX track reference

The tour schema SHALL include a `gpxFilepath` field (string, nullable) holding the object key of the tour's GPX file in the private `tour-gpx` Storage bucket (`<owner uid>/<id>.gpx`, where `id` is the tour's id for a track added at creation and a fresh UUID for any later one — see `gpx-tracks`). The track itself is never stored in the row; it is fetched and parsed on demand (see `gpx-tracks`).

#### Scenario: Tour with GPX track

- **WHEN** a tour row contains a non-null `gpx_filepath`
- **THEN** the schema SHALL parse it as the string `gpxFilepath`

#### Scenario: Tour without GPX track

- **WHEN** a tour row has `gpx_filepath` as null
- **THEN** the schema SHALL accept it as null

### Requirement: Description field

The tour schema SHALL include a `description` field (string, nullable) for free-text tour guides and route descriptions.

#### Scenario: Description with URLs

- **WHEN** a tour has a description containing URLs
- **THEN** the schema SHALL store the raw text (URL rendering is a presentation concern)

### Requirement: Season multi-select

The tour schema SHALL include a `seasons` field (array of season enum values, nullable). Season values: `winter`, `spring`, `summer`, `autumn`.

#### Scenario: Multiple seasons selected

- **WHEN** a tour has seasons `['winter', 'spring']`
- **THEN** the schema SHALL validate both values against the season enum

#### Scenario: No seasons

- **WHEN** a tour has `seasons` as null or empty array
- **THEN** the schema SHALL accept it

### Requirement: Start and end points

The tour schema SHALL include `startPoint` and `endPoint` (each an object with lng/lat, nullable), each with an optional `…Name` (string) and `…Elevation` (integer metres) filled from the Swisstopo services when the point is set. Either point MAY be set without the other.

#### Scenario: Start point without end point

- **WHEN** a tour has `startPoint` set but `endPoint` is null
- **THEN** the tour SHALL be treated as one-way to the goal (it ends at the goal) at the presentation layer

#### Scenario: End point without start point

- **WHEN** a tour has `endPoint` set but `startPoint` is null (a flight from the goal to its landing, or a stage connected to the next one)
- **THEN** the end point SHALL be kept and presented on its own, and the missing start SHALL get nothing — no start marker, no start → goal leg, so nothing climbed or descended before the goal in the route numbers — never a position borrowed from the goal or the end

#### Scenario: Both points set

- **WHEN** a tour has both `startPoint` and `endPoint` set
- **THEN** both SHALL be parsed as `{ lng: number, lat: number }` objects

### Requirement: Equipment field

The tour schema SHALL include an `equipment` field (string, nullable) for free-text gear lists.

#### Scenario: Equipment present

- **WHEN** a tour row has an `equipment` text value
- **THEN** the schema SHALL parse it as a string

### Requirement: Notes field

The tour schema SHALL include a `notes` field (string, nullable) for miscellaneous free-text information.

#### Scenario: Notes present

- **WHEN** a tour row has a `notes` text value
- **THEN** the schema SHALL parse it as a string

### Requirement: Extended TourDraft

The `TourDraft` interface SHALL be expanded to include all new fields: `tourTypes`,
`elevation`, `gpxFilepath`, `description`, `seasons`, `startPoint`, `endPoint`,
`startPointName`, `startPointElevation`, `endPointName`, `endPointElevation`, `equipment`,
`notes`, `endDate`, and the optional `completed` and `visibility`.

#### Scenario: Draft with all fields

- **WHEN** a TourDraft is created with all new fields populated
- **THEN** it SHALL be a valid TourDraft object

#### Scenario: Draft with no new fields (backward compatible)

- **WHEN** a TourDraft is created with only name, plannedDate, and partnerIds
- **THEN** it SHALL be valid with all new fields defaulting to null/undefined, and the tour
  SHALL be persisted as a single-day tour with no activity type

### Requirement: Completed field

The tour schema SHALL include a `completed` field (boolean, non-nullable) indicating whether the user has marked the tour as done. The field SHALL default to `false` when absent from the source row.

#### Scenario: Tour explicitly completed

- **WHEN** a tour row has `completed = true`
- **THEN** the schema SHALL parse it as the boolean `true`

#### Scenario: Tour explicitly not completed

- **WHEN** a tour row has `completed = false`
- **THEN** the schema SHALL parse it as the boolean `false`

#### Scenario: Legacy row missing column

- **WHEN** a tour row lacks the `completed` column (pre-migration client-side cache)
- **THEN** the schema SHALL default the field to `false`

### Requirement: Extended TourDraft includes completion state

The `TourDraft` interface and tour update payload type SHALL accept an optional `completed` boolean so existing update paths can patch the field.

#### Scenario: Patch with completed true

- **WHEN** an update payload `{ completed: true }` is passed to the tour repository update method
- **THEN** the payload SHALL be valid and persisted to the `completed` column

### Requirement: End date field

The tour schema SHALL include an `endDate` field (date, nullable) representing the last day
of a multi-day tour, where `plannedDate` is the first day. A null `endDate` SHALL mean a
single-day tour and SHALL be indistinguishable in behaviour from the model before this
capability existed.

The persisted column SHALL be `tours.end_date date`, exposed as `end_date` by `tours_view`
and `friend_tours_view`, and SHALL be constrained such that `end_date >= planned_date`
whenever both are non-null.

The tour write RPCs `create_tour_full` and `update_tour_full` SHALL accept the span end as a
trailing `p_end_date date` argument defaulting to null, so a call that omits it persists a
single-day tour.

#### Scenario: Row without an end date

- **WHEN** a tour row is read whose `end_date` is null
- **THEN** the mapped tour SHALL have `endDate === null` and SHALL be treated as a single-day
  tour by every consumer

#### Scenario: Row with an end date

- **WHEN** a tour row is read with `planned_date = 2026-08-25` and `end_date = 2026-08-27`
- **THEN** the mapped tour SHALL have both dates set and SHALL be treated as spanning three
  days inclusive

#### Scenario: End date before start date is rejected

- **WHEN** a write is attempted with `end_date` earlier than `planned_date`
- **THEN** the database CHECK constraint SHALL reject the write

#### Scenario: Write RPC called without the end-date argument

- **WHEN** `create_tour_full` or `update_tour_full` is invoked without `p_end_date` (for
  example by an offline write queued before this capability shipped)
- **THEN** the call SHALL succeed and the tour SHALL be persisted with `end_date` null

### Requirement: Activities per leg

A tour SHALL optionally say which activities it uses from the start to the goal (way up) and
from the goal to the end (way down). Both legs SHALL be set together, each with at least one
activity, and the tour's activities SHALL be exactly their union. An unsplit tour SHALL use all
its activities both ways.

#### Scenario: Hike & fly

- **WHEN** a tour is saved with hiking up and paragliding down
- **THEN** its activities SHALL be hiking and paragliding, its way up hiking and its way down
  paragliding

#### Scenario: An older app changes the activities

- **WHEN** a client that does not know legs saves a split tour with different activities
- **THEN** the legs SHALL be cleared

#### Scenario: An older app saves the same activities

- **WHEN** a client that does not know legs saves a split tour with unchanged activities
- **THEN** the legs SHALL be kept

### Requirement: Grade and start time

A tour SHALL hold an optional grade (trimmed text, at most 20 characters) and an optional start
time (only together with a planned date); `TourDraft` SHALL carry `grade` and `startTime`
("HH:MM"). Friends who are not partners SHALL NOT see the start time, like the planned date.

#### Scenario: Created with both

- **WHEN** a tour is created with grade "ZS-" and start time 06:30 on 13 March
- **THEN** it SHALL read back with grade "ZS-" and start time "06:30"

### Requirement: Older clients never wipe grade or start time

On update, an omitted grade or start time (null) SHALL keep the stored value and an empty string
SHALL clear it, so an older client or a queued older draft never wipes what it doesn't know.

#### Scenario: An older client edits a graded tour

- **WHEN** a tour has grade "ZS-" and start time 06:30 and a client that doesn't know these fields saves an edit
- **THEN** the grade and start time SHALL stay

#### Scenario: Clearing the grade

- **WHEN** the owner empties the grade field and saves
- **THEN** the tour SHALL have no grade

#### Scenario: Grade too long

- **WHEN** a write carries a grade longer than 20 characters
- **THEN** the database SHALL reject it

#### Scenario: Friend without partnership

- **WHEN** a friend who is not a partner reads a friends-visible tour with a start time
- **THEN** the start time SHALL be null for them, like the planned date
