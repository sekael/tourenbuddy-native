## Purpose

Tour creation and edit form with the extended field set, validation, and Swiss-topo-aware coordinate input.

## Requirements

### Requirement: Pick-type label in collapsed overlay header

While the location picker is active, the surrounding tour creation dialog and tour info sheet collapse to a header-only surface (a bottom title bar on mobile, side-drawer compact header on desktop). That collapsed header SHALL display a label naming the location type currently being picked, so the user retains context once the form is hidden.

The label SHALL resolve from the active pick type:

- `goal` → "Tour Goal" / "Tourenziel"
- `start` → "Start Point" / "Startpunkt"
- `end` → "End Point" / "Endpunkt"

The `location-picker.vue` component itself SHALL NOT render an additional title bar over the map canvas.

#### Scenario: Goal pick on mobile

- **WHEN** the user is on a mobile viewport and enters location-pick mode with pick type `goal`
- **THEN** the overlay SHALL be collapsed to a bottom title bar and the title SHALL read "Tour Goal" (or its localized equivalent)

#### Scenario: Start pick on desktop

- **WHEN** the user is on a desktop viewport and enters location-pick mode with pick type `start`
- **THEN** the side drawer SHALL be in its collapsed top-right header state and the title SHALL read "Start Point" (or its localized equivalent)

#### Scenario: End pick label

- **WHEN** the user enters location-pick mode with pick type `end` on either viewport
- **THEN** the collapsed overlay header SHALL read "End Point" (or its localized equivalent)

#### Scenario: No standalone title bar on map canvas

- **WHEN** location-pick mode is active for any pick type
- **THEN** `location-picker.vue` SHALL NOT render a title bar over the map; the only label SHALL be the one in the collapsed overlay header

### Requirement: Start and end point metadata auto-fetch

When the user confirms a start or end point pick, the tour form SHALL set the point at once and look up its name and elevation from Swisstopo, each field on its own, with the same loading, failure and typed-value rules as the goal's name and elevation fields.

#### Scenario: Start point pick auto-fills metadata

- **WHEN** the user confirms a `start` location pick
- **THEN** the form SHALL call the elevation service and name-suggestion service for the picked coordinates and fill the start point's name and elevation fields as each answers

#### Scenario: End point pick auto-fills metadata

- **WHEN** the user confirms an `end` location pick
- **THEN** the form SHALL call the elevation service and name-suggestion service for the picked coordinates and fill the end point's name and elevation fields as each answers

#### Scenario: Service failure leaves metadata null

- **WHEN** elevation or name suggestion fails for a start or end pick
- **THEN** the corresponding field SHALL stay empty with the manual-entry placeholder, the draft value SHALL be null, and the coordinate SHALL still be stored

#### Scenario: Removing a point stops its lookups

- **WHEN** the user removes a start or end point while its lookups are running
- **THEN** the requests SHALL be aborted and no late answer SHALL be saved with the draft

### Requirement: Start and end point rows display metadata

When a start or end point has an associated name and/or elevation, the tour form row for that point SHALL display them alongside the coordinates.

#### Scenario: Start point with name and elevation

- **WHEN** the form renders a start point that has both `startPointName` and `startPointElevation`
- **THEN** the row SHALL show the name and elevation in addition to the coordinates

#### Scenario: Start point with coordinates only

- **WHEN** the form renders a start point with null name and null elevation
- **THEN** the row SHALL show only the coordinates

### Requirement: Elevation field with auto-fill indicator

The tour creation dialog SHALL display an elevation number input. When auto-filled from Swisstopo, it SHALL show a subtle indicator (e.g., icon or label) that the value was auto-retrieved.

#### Scenario: Auto-filled elevation displayed

- **WHEN** elevation was auto-retrieved
- **THEN** the field SHALL show the value with an auto-fill indicator
- **AND** the user SHALL be able to edit the value

#### Scenario: Manual elevation entry

- **WHEN** no auto-fill is available
- **THEN** the field SHALL be empty with placeholder "Elevation (m)"

### Requirement: Description textarea

The tour creation dialog SHALL include a multi-line textarea for description/guide text.

#### Scenario: User enters description

- **WHEN** the user types text into the description field
- **THEN** the value SHALL be stored in the draft as plain text

### Requirement: Season chip selector

The tour form SHALL include season chips (Winter, Spring, Summer, Autumn) supporting
multi-select. While the chips are automatic they SHALL follow the planned date and end date
(Dec–Feb winter, Mar–May spring, Jun–Aug summer, Sep–Nov autumn; a span selects every season it
touches). The chips SHALL be automatic when the form opens without seasons or with exactly the
dates' seasons, and SHALL stop following the dates once the user taps a chip.

#### Scenario: Multiple seasons selected

- **WHEN** the user taps Winter and Spring chips
- **THEN** both SHALL be highlighted and `seasons` SHALL contain `['winter', 'spring']`

#### Scenario: Toggle season off

- **WHEN** the user taps an already-selected season chip
- **THEN** it SHALL be deselected and removed from the seasons array

#### Scenario: Season from the date

- **WHEN** a new tour gets the planned date 13 March
- **THEN** Spring SHALL be selected without a tap

#### Scenario: A span across seasons

- **WHEN** the dates run from 26 February to 2 March
- **THEN** Winter and Spring SHALL be selected

#### Scenario: The user's choice wins

- **WHEN** the user has tapped a season chip and then changes the date
- **THEN** the seasons SHALL stay as the user set them

### Requirement: Round Trip Tour shortcut

When a start point is set and no end point is set, the form SHALL render a "Round Trip" button (`tours.form.roundTripBtn`) — not for a flown way down, which offers "Add landing" instead — that copies the start point's coordinates, name, and elevation into the end point fields in a single action, so the user does not have to re-pick the same location.

#### Scenario: User clicks Round Trip Tour

- **WHEN** the user has set a start point, has no end point, and clicks "Round Trip"
- **THEN** `endPoint` SHALL be set to a copy of `startPoint`'s coordinates, `endPointName` SHALL equal `startPointName`, and `endPointElevation` SHALL equal `startPointElevation`

#### Scenario: Round Trip button hidden without start point

- **WHEN** no start point is set
- **THEN** the "Round Trip" button SHALL NOT be rendered (an empty end point section offers only "Add end point" or "Add landing" and its suggestions)

#### Scenario: Round Trip button hidden when end point already set

- **WHEN** an end point is already set
- **THEN** the "Round Trip" button SHALL NOT be rendered (only the populated end point row is shown)

### Requirement: Visual grouping of point sections

The tour form SHALL render each of goal, start point, and end point inside a distinct visual container so that name and elevation inputs are unambiguously scoped to one point. Each container SHALL display a header consisting of an icon and the section title, and SHALL use a distinct accent color so the three sections are visually separable at a glance.

#### Scenario: Three sections visually distinct

- **WHEN** the form renders with all three of goal, start, and end populated
- **THEN** each of the three SHALL be wrapped in its own card-style container with a colored left-border accent and an icon-prefixed header reading the section's localized title (Goal / Start Point / End Point — Landing when the way down is flown)

#### Scenario: Goal elevation belongs to goal section

- **WHEN** the form renders the goal section
- **THEN** the goal elevation input SHALL be located inside the goal section's container (not floating between the goal coordinates and the start point section)

### Requirement: Point picker action rows stay within their bounded section

The action button row inside each `.point-section` (goal, start, end) SHALL remain visually contained within its bounded background across all supported viewport widths (down to ~320 CSS px). When the combined intrinsic width of the action buttons exceeds the available row width, the buttons SHALL wrap onto additional lines rather than overflowing the section background.

#### Scenario: End-point section on a narrow mobile viewport

- **WHEN** the user opens the tour form on a viewport ≤ 360 CSS px wide with a start point set and no end point set
- **THEN** the "Add end point" and "Round Trip" buttons SHALL both render fully inside the end-point section's bounded background, wrapping onto a second line if they do not fit side by side

#### Scenario: End-point section on a wide viewport

- **WHEN** the user opens the tour form on a viewport wide enough to fit both action buttons on one line
- **THEN** the buttons SHALL render side by side on a single line as today

### Requirement: Equipment textarea

The tour creation dialog SHALL include a multi-line textarea for equipment/gear lists.

#### Scenario: User enters equipment

- **WHEN** the user types equipment text
- **THEN** the value SHALL be stored in the draft

### Requirement: Notes textarea

The tour creation dialog SHALL include a multi-line textarea for miscellaneous notes.

#### Scenario: User enters notes

- **WHEN** the user types notes
- **THEN** the value SHALL be stored in the draft

### Requirement: GPX upload control

The tour creation dialog SHALL include a file upload button for GPX files.

#### Scenario: GPX file selected

- **WHEN** the user selects a GPX file
- **THEN** the filename SHALL be displayed with a remove button
- **AND** a preview indicator SHALL confirm successful parsing

### Requirement: Adaptive form layout

The form SHALL organize fields into logical sections and remain usable regardless of which optional fields the user fills.

#### Scenario: Mobile layout

- **WHEN** the dialog is displayed on mobile (viewport < 600px)
- **THEN** it SHALL render as a full-screen sheet with scrollable content

#### Scenario: Desktop layout

- **WHEN** the dialog is displayed on desktop (viewport >= 600px)
- **THEN** it SHALL render as a centered dialog with scrollable content and max-width 560px

#### Scenario: Minimal fields filled

- **WHEN** the user only fills the tour type and confirms
- **THEN** the form SHALL submit without validation errors on empty optional fields

### Requirement: Attachments section in tour form

The tour creation/edit form SHALL include an "Attachments" section allowing the user to add, delete, and reorder up to 5 attachments (png/jpeg/pdf, ≤10 MB each) for the tour.

#### Scenario: Add attachment from form

- **WHEN** the user taps the add-attachment control and selects a valid file
- **THEN** the file SHALL be uploaded and SHALL appear in the section as a thumbnail/row with filename

#### Scenario: Delete from form

- **WHEN** the user taps the delete control on an attachment row
- **THEN** the attachment SHALL be removed from the list and from storage

#### Scenario: Reorder from form

- **WHEN** the user drags an attachment row to a new position
- **THEN** the new order SHALL persist after the form is closed and reopened

#### Scenario: Limit reached in form

- **WHEN** the tour already has 5 attachments
- **THEN** the add control SHALL be disabled with a user-visible explanation

#### Scenario: Invalid file in form

- **WHEN** the user selects a file that is too large or of disallowed type
- **THEN** an inline error SHALL be shown AND no upload SHALL occur

#### Scenario: Available during create

- **WHEN** the user is creating a new tour (no `tour_id` yet)
- **THEN** the attachments section SHALL be available and uploads SHALL associate with the tour upon save (or be deferred until the tour row exists, per implementation)

### Requirement: End-date input for multi-day tours

The tour form SHALL render, adjacent to the planned-date input, a second optional date input
for the end of the tour, labelled distinctly from the planned (start) date. Leaving it empty
SHALL produce a single-day tour (`endDate === null`).

The end-date input SHALL carry a `min` attribute bound to the current planned-date value, and
the form SHALL additionally reject submission when the end date precedes the planned date,
surfacing a localized validation message and keeping the user on the form. The `min`
attribute alone SHALL NOT be relied upon, as a typed value can bypass it.

Clearing the planned date SHALL NOT silently strand an end date: when the planned date is
empty, the end date SHALL be cleared as well.

#### Scenario: End date left empty

- **WHEN** the user saves a tour with a planned date and no end date
- **THEN** the resulting draft SHALL carry `endDate === null` and the tour SHALL be persisted
  as a single-day tour

#### Scenario: End date before start date

- **WHEN** the user enters an end date earlier than the planned date and submits
- **THEN** the form SHALL NOT submit, SHALL display a localized validation message on the
  end-date field, and no write SHALL be dispatched

#### Scenario: Planned date cleared while an end date is set

- **WHEN** the user clears the planned date on a tour that has an end date
- **THEN** the end date SHALL be cleared too, so no tour is saved with an end but no start

#### Scenario: Editing an existing multi-day tour

- **WHEN** the form opens for a tour with a planned date and an end date
- **THEN** both inputs SHALL be pre-filled with those dates

### Requirement: Location pick preserves unsaved form edits

Starting, confirming or cancelling a location pick (goal, start or end) from the tour create, edit or suggest form SHALL NOT discard any value the user has entered but not yet saved. After the pick, every field SHALL show the value it had before the pick, except the field the pick itself sets. This SHALL hold on both mobile and desktop viewports.

#### Scenario: Start pick during creation keeps partners and activity type

- **WHEN** the user creates a tour on a mobile viewport, selects partners and an activity type, then picks and confirms a start point
- **THEN** the form SHALL show the selected partners and activity type unchanged
- **AND** the start point SHALL be set to the picked location

#### Scenario: Cancelled pick keeps edits

- **WHEN** the user edits any form field, starts a location pick and cancels it
- **THEN** the form SHALL show every edited field unchanged

#### Scenario: Pick during tour edit keeps edits

- **WHEN** the user edits an existing tour on a mobile viewport, changes the notes, then picks and confirms an end point
- **THEN** the changed notes SHALL still be in the form

### Requirement: Way up and way down in the form

With two or more activities selected, the form SHALL let the user set each activity to up, both
or down. Untouched activities SHALL default to both, except paragliding with others (paragliding
down, the others up) and, without paragliding, hiking with mountain biking (the bike down, the
others up). All activities on both legs SHALL save as an unsplit tour.

#### Scenario: Hike & fly in two taps

- **WHEN** the user selects hiking and paragliding
- **THEN** hiking SHALL be set to up and paragliding to down without further taps

#### Scenario: Hike & bike carried up

- **WHEN** the user selects hiking and mountain biking
- **THEN** hiking SHALL be set to up and mountain biking to down, and the tour SHALL save them so

#### Scenario: The landing

- **WHEN** the way down is paragliding only
- **THEN** the end point SHALL be labelled as the landing

### Requirement: The picker saves what it shows

The form SHALL NOT offer a way that leaves a leg without activity. An activity removed and added
back SHALL return to its way; a removal that leaves a leg empty SHALL show, and save, the defaults.

#### Scenario: No way without activity

- **WHEN** hiking goes up and mountain biking is the only activity on the way down
- **THEN** mountain biking's "up" SHALL be unavailable, and reopening the saved tour SHALL show the same ways

### Requirement: Distance from the goal

The form SHALL show how far the start and end points lie from the goal, as a warning past 20 km.

#### Scenario: A landing in the wrong valley

- **WHEN** the landing picked from the search is a commune centre 50 km from the goal
- **THEN** the landing row SHALL warn with that distance

### Requirement: A lone glider's climb

With paragliding as the only activity, the form SHALL offer "down" (on foot or by lift to the
launch at the goal, the default, saved unsplit) or "both" (flown from the start in thermals,
saved as paragliding on both legs).

#### Scenario: Thermal flight from the valley

- **WHEN** the user plans a flight from the valley, climbing in thermals to the goal and landing below
- **THEN** choosing "both" SHALL save the climb as flown, and the detail SHALL read "↑ [glider]" and "↓ [glider]"

### Requirement: Activity type chip selector

The tour form (create, edit and suggest) SHALL show one chip per activity type supporting multi-select: tapping an unselected chip adds that type, tapping a selected chip removes it. Zero, one or several types MAY be selected. The saved list SHALL follow the chips' display order, regardless of the order in which they were tapped.

#### Scenario: Select two activities

- **WHEN** the user taps Hiking and then Ski Tour and saves
- **THEN** the tour SHALL be saved with both types, Ski Tour first (display order)

#### Scenario: Deselect an activity

- **WHEN** the user taps an already-selected activity chip
- **THEN** that type SHALL be removed and the other selected types SHALL stay selected

#### Scenario: Clear every activity

- **WHEN** the user deselects every activity chip and saves
- **THEN** the tour SHALL be saved with no activity type

#### Scenario: Edit form shows saved activities

- **WHEN** the user opens the edit form of a tour with several types
- **THEN** every saved type's chip SHALL be shown selected

### Requirement: Form order

The tour form SHALL ask where, then what, then how, then when, then who: name, goal; activities;
the route — track, start, end and grade; planned date with start time, end date and seasons;
partners and visibility; then description, equipment, notes and attachments.

#### Scenario: Date near the top

- **WHEN** the creation form opens after a goal pick
- **THEN** the date SHALL come right after the route's grade, before partners and visibility

#### Scenario: Track before the points

- **WHEN** the creation form opens after a goal pick
- **THEN** the track SHALL come right after the activities, before start and end

### Requirement: Grade field

The form SHALL have an optional grade field (at most 20 characters). It SHALL offer the selected
activities' scales as chips — T1–T6 for hiking and trail running; L, WS, ZS, S, SS, AS, EX for
ski touring, splitboarding, ski mountaineering and mountaineering; S0–S5 for mountain biking —
and a tap SHALL set the grade to the chip. Climbing SHALL get an example placeholder instead of
chips. Without a scale the field SHALL stay free text.

#### Scenario: Hiking

- **WHEN** the user selects Hiking
- **THEN** chips T1 to T6 SHALL be offered and tapping T4 SHALL set the grade to "T4"

#### Scenario: Mixed activities

- **WHEN** the user selects Hiking and Mountain biking
- **THEN** both scales SHALL be offered

#### Scenario: Modifiers stay typable

- **WHEN** the user taps ZS and types "-"
- **THEN** the grade SHALL be "ZS-"

### Requirement: Start time

The form SHALL have an optional start time beside the planned date. It SHALL be disabled without
a planned date and cleared with it.

#### Scenario: Clearing the date

- **WHEN** the user clears the planned date
- **THEN** the start time SHALL be cleared too

### Requirement: Start and end suggestions

With the goal set, an empty start card SHALL offer up to three suggestions: the user's latest start for a goal within 300 m, then the public-transport stops nearest the goal, none within 500 m of it. An empty end card SHALL offer the user's latest end the same way, then the nearest stops, none within 100 m of the start; a landing only an earlier landing, no stops. A suggestion SHALL set the point with its name and look up its height; none SHALL block the form; a failed lookup SHALL show none.

#### Scenario: Stop near the Sustenhorn

- **WHEN** the goal is the Sustenhorn and the start is empty
- **THEN** "Steingletscher, Susten" SHALL be offered, and tapping it SHALL set the start there with that name and its height

#### Scenario: Been here before

- **WHEN** the user's earlier tour to the same summit started at "Tierberglihütte SAC"
- **THEN** that start SHALL be offered first

#### Scenario: Been here before, the way down

- **WHEN** the user's earlier tour to the same summit ended at "Steingletscher" and the end is empty
- **THEN** that end SHALL be offered first, before the nearest stops

#### Scenario: Been here before, the landing

- **WHEN** the user's latest tour to the same launch was a hike that ended at "Wiler, Bahnhof", an older one a flight that landed at "Landeplatz Wiler", and the way down is flown
- **THEN** the landing card SHALL offer "Landeplatz Wiler" and not "Wiler, Bahnhof"

### Requirement: GPX fills empty points

Picking a GPX SHALL set an empty start point to the track's first point and an empty end point to
its last point, or make it a round trip when first and last point lie within 200 m of each other
and the tour has a start (set before or by the same pick). A track end within 200 m of the goal
SHALL set nothing — it is the goal: a tour without an end ends at its goal, and a flight from the
goal has no start to show. Set points and the goal SHALL never
change.

#### Scenario: Loop track

- **WHEN** a GPX whose ends are 40 m apart is picked for a tour without start and end
- **THEN** the start SHALL be the first track point and the end SHALL equal the start

#### Scenario: Track from the goal

- **WHEN** a GPX of a flight that starts 80 m from the goal and ends in the valley is picked for a tour without start and end
- **THEN** the start SHALL stay empty and the end SHALL be the track's last point

#### Scenario: Track up to the goal

- **WHEN** a GPX that starts in the valley and ends 110 m from the goal is picked for a tour without start and end
- **THEN** the start SHALL be the track's first point and the end SHALL stay empty

#### Scenario: Track from the goal back to it

- **WHEN** a GPX of a flight that starts and lands within 200 m of the goal is picked for a tour without start and end
- **THEN** the start and the end SHALL both stay empty: the tour ends at its goal and has no start to show

### Requirement: Start and end points in any order

The tour form SHALL allow optional start and end point selection via map coordinate pickers, in create, edit and suggest alike. The start point section and the end point section SHALL both always be rendered, so either point can be set first or alone. Picking or removing one point SHALL NOT change the other.

#### Scenario: Initial form offers both points

- **WHEN** the form opens with no draft start or end point
- **THEN** the start point section SHALL offer its picker and the end point section SHALL offer "Add end point" (a flown way down: "Add landing") without "Round Trip"

#### Scenario: End point set without a start

- **WHEN** the user picks an end point while no start point is set
- **THEN** the end point SHALL be stored in the draft with its name and elevation, and `startPoint`, `startPointName`, and `startPointElevation` SHALL stay null

#### Scenario: Round Trip offered once a start is set

- **WHEN** the user confirms a start point pick (or the form opens with a draft that already has a start point) and no end point is set
- **THEN** the end point section SHALL show an "Add end point" button and a "Round Trip" button (a flown way down: "Add landing", and no "Round Trip")

#### Scenario: User sets start point

- **WHEN** the user activates the start point picker and confirms a location
- **THEN** the start point coordinates SHALL be stored in the draft and displayed; the end point SHALL remain unchanged

#### Scenario: User sets end point

- **WHEN** the user activates the end point picker and confirms a location
- **THEN** the end point coordinates SHALL be stored in the draft; the start point SHALL remain unchanged

#### Scenario: User removes end point

- **WHEN** the user clears a previously set end point
- **THEN** `endPoint`, `endPointName`, and `endPointElevation` SHALL be null in the draft and the end point section SHALL collapse back to "Add end point" — with "Round Trip" while a start is set — or "Add landing" for a flown way down

#### Scenario: User removes start point and the end stays

- **WHEN** the user clears a previously set start point while an end point is set
- **THEN** `startPoint`, `startPointName`, and `startPointElevation` SHALL be null in the draft, and `endPoint`, `endPointName`, and `endPointElevation` SHALL keep their values, with the end point section still showing the end

#### Scenario: Editing a tour without a start

- **WHEN** the form opens for a tour that has an end point but no start point
- **THEN** the start point section SHALL offer a picker and the end point section SHALL show the end point with its name and elevation

#### Scenario: No start/end points

- **WHEN** the user does not set start or end points
- **THEN** both SHALL be null in the draft, representing a one-way tour from an unspecified start to the goal

### Requirement: Start and end fold away until set

While a tour has neither start nor end, the form SHALL show them as one row with "Set by hand",
which opens both point sections with their suggestions. A pick, a track or a saved point SHALL show
the sections; removing both points SHALL fold them again.

#### Scenario: New tour

- **WHEN** the creation form opens after a goal pick
- **THEN** start and end SHALL show as one "Set by hand" row, with no pick buttons or suggestions

#### Scenario: Set by hand

- **WHEN** the user taps "Set by hand"
- **THEN** the start and end sections SHALL open as they were before this change

#### Scenario: Drawn track

- **WHEN** the user draws a track from the valley to the goal
- **THEN** the start section SHALL open with the track's first point, named and with its height

#### Scenario: Editing a tour with a start

- **WHEN** the user edits a tour that has a start point
- **THEN** the start and end sections SHALL show open

### Requirement: Points from the track follow it

A start or end the track set SHALL move with the track: a redrawn or replaced track SHALL set it
anew by the "GPX fills empty points" rules, and clear it when the new track ends at the goal. A
point picked, suggested, renamed or saved before SHALL never move. Removing the track SHALL leave
the points.

#### Scenario: Redrawn end

- **WHEN** a drawn track set the end and the user extends the drawing to another valley
- **THEN** the end SHALL move to the new track's last point, with its name and height looked up

#### Scenario: Hand-picked start

- **WHEN** the user picked the start by hand, then draws a track starting elsewhere
- **THEN** the start SHALL stay where it was picked

#### Scenario: Ski route planned as a tour

- **WHEN** the user plans a marked ski route as a tour
- **THEN** start and end SHALL both come from the route's track and show as such

#### Scenario: Redrawn in the middle

- **WHEN** a drawn track set start and end and the user redraws only its middle
- **THEN** start and end SHALL keep their names, with no lookup again

#### Scenario: New track ends at the goal

- **WHEN** a drawn track set the end and the user redraws it to end at the goal
- **THEN** the end SHALL be cleared
