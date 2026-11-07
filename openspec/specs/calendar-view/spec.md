# calendar-view Specification

## Purpose
Full-screen `/calendar` page with a **Planned** month view (owned tours by date, plus the user's own availability) and a **Seasons** view (owned tours by season), with tour detail opening from and returning to the originating view.
## Requirements

### Requirement: Calendar route and full-screen shell

The system SHALL provide a `/calendar` route that renders a full-screen calendar
page on both mobile and desktop with no map chrome. The route SHALL require
authentication and a complete profile, consistent with the map page. The page
SHALL present two views, **Planned** and **Seasons**, and SHALL open on the
**Planned** view by default unless a `view` query parameter selects otherwise.
The selected view SHALL NOT be persisted across visits.

#### Scenario: Unauthenticated access is redirected

- **WHEN** an unauthenticated user navigates to `/calendar`
- **THEN** the router redirects them away from the calendar, as it does for the
  map page

#### Scenario: Deep link selects a view

- **WHEN** the user navigates to `/calendar?view=seasons`
- **THEN** the page opens with the Seasons view active

#### Scenario: Default view

- **WHEN** the user opens `/calendar` with no `view` parameter
- **THEN** the Planned view is active

### Requirement: View navigation shell

The page SHALL provide navigation between the Planned and Seasons views via a
persistent left sidebar on desktop that collapses to a bottom navigation bar on
mobile, and a top app bar carrying the back control and per-view context (the
current month with previous/next controls on the Planned view; a static title on
the Seasons view).

#### Scenario: Switching views via the navigation

- **WHEN** the user selects the other view in the sidebar or bottom navigation
- **THEN** the page shows that view and reflects it in the `view` query parameter

#### Scenario: Navigation adapts to viewport

- **WHEN** the page is viewed on a narrow (mobile) viewport
- **THEN** the view navigation renders as a bottom navigation bar rather than a
  left sidebar

### Requirement: Back navigation to the tour list

The calendar page SHALL provide a back control in the top app bar that returns
the user to the tour-list view on the map page.

#### Scenario: Back control opens the tour list on the map

- **WHEN** the user taps the calendar page's back control
- **THEN** the app navigates to the map page **and** the tour-list overlay is
  opened

### Requirement: Seasons view shows owned tours by season

The Seasons view SHALL display a Gantt-style chart with a fixed horizontal axis
of four season columns ordered `Winter → Spring → Summer → Fall`, each labelled
with its month range, and a scrollable list of the user's **own** tours. Each
tour row SHALL draw one bar per contiguous run of the seasons the tour is tagged
with: adjacent tagged seasons SHALL merge into a single bar spanning their
columns, non-contiguous runs SHALL render as separate bars, and untagged season
columns SHALL never be bridged. The view SHALL draw a thin vertical marker line
at the position of the current month along the season axis, indicating the
current season. Friend tours SHALL NOT appear on the Seasons view. On narrow
(mobile) viewports the four season columns MAY exceed the viewport width; the
chart SHALL then scroll horizontally with the header row pinned, and SHALL show
an affordance indicating more columns are available by scrolling.

#### Scenario: Narrow viewport scrolls the season columns

- **WHEN** the Seasons view is shown on a viewport too narrow for all four season
  columns
- **THEN** the chart scrolls horizontally to reveal the remaining columns and
  displays a hint that scrolling reveals the full year

#### Scenario: Contiguous seasons merge into one bar

- **WHEN** a tour is tagged with `spring` and `summer`
- **THEN** its row draws a single bar spanning the spring and summer columns

#### Scenario: Non-contiguous seasons render as separate bars

- **WHEN** a tour is tagged with `winter` and `summer` but not `spring`
- **THEN** its row draws a bar in the winter column and a separate bar in the
  summer column, leaving spring and fall empty

#### Scenario: Tour without seasons

- **WHEN** a tour has no seasons tagged
- **THEN** its row appears with no bars and an empty-state label instead

#### Scenario: Current season is marked

- **WHEN** the Seasons view is displayed
- **THEN** a thin vertical marker line is drawn over the season column that
  contains the current month, indicating the current season

#### Scenario: Friend tours excluded

- **WHEN** the user has friend tours where they are a marked partner
- **THEN** those tours do NOT appear on the Seasons view

### Requirement: Planned view shows a month calendar

The Planned view SHALL render a monthly calendar, plotting each displayed tour on
**every day of its planned span** — from its planned (start) date through its end date
inclusive, or on its planned date alone when it has no end date — as a pill carrying the
tour's type icon and name. When a tour spans more than one day, each of its pills SHALL
additionally carry a day counter identifying that day's position in the span and the span's
total length (for example `2/3`); a single-day tour's pill SHALL carry no counter. On
desktop it SHALL render a Monday-start grid with days from adjacent months de-emphasised. On
narrow (mobile) viewports it SHALL instead render a month-bounded vertical list
with one tile per day of the visible month — **including days without tours**, so
free dates stay visible for planning — each day's tours shown as full-width pills.
Both layouts are driven by the same month cursor and header navigation. Month
navigation SHALL be unbounded, presenting previous/next month controls flanking
a centered month-and-year label, plus a "Today" control that returns the calendar
to the month containing the current date. The cell for the current date SHALL be
visually distinguished from other days (a darker tile border and a light
background tint). The calendar SHALL display the user's own tours that have a
planned date **and** friend tours where the user is a marked partner that have a
planned date. Tours without a planned date SHALL NOT be displayed.

Day keys for a span SHALL be derived by walking local calendar date parts, so a span
crossing a daylight-saving transition yields exactly one key per calendar day, and SHALL be
produced by the single shared span helper rather than computed at each call site.

#### Scenario: Multi-day tour appears on every day of its span

- **WHEN** a displayed tour has a planned date of 25 August and an end date of 27 August, and
  the Planned view shows August
- **THEN** a pill for that tour SHALL be rendered on 25, 26 and 27 August, labelled `1/3`,
  `2/3` and `3/3` respectively

#### Scenario: Running multi-day tour is visible on today

- **WHEN** today falls strictly between a displayed tour's planned date and its end date
- **THEN** the current-date cell SHALL show that tour's pill

#### Scenario: Single-day tour carries no counter

- **WHEN** a displayed tour has no end date
- **THEN** it SHALL appear only on its planned date and its pill SHALL show no day counter

#### Scenario: Span crossing a month boundary

- **WHEN** a tour spans 30 September to 2 October and the Planned view shows October
- **THEN** pills SHALL be rendered on 1 and 2 October, labelled `2/3` and `3/3`, i.e. the
  counter reflects the position within the whole span and not within the visible month

#### Scenario: Mobile renders a day-tile list

- **WHEN** the Planned view is shown on a narrow (mobile) viewport
- **THEN** it renders one tile per day of the visible month, including days with
  no tours, rather than the desktop grid

#### Scenario: Tour without a planned date is hidden

- **WHEN** a tour has no planned date
- **THEN** it SHALL NOT be plotted on the calendar in either layout

#### Scenario: Partner friend tour appears

- **WHEN** a friend tour has a planned date and the user is a marked partner on
  it
- **THEN** that tour appears on the calendar on its planned date

#### Scenario: Non-partner friend tour is hidden

- **WHEN** a friend tour has a planned date but the user is NOT a marked partner
- **THEN** that tour does not appear on the calendar

#### Scenario: The current day is highlighted

- **WHEN** the visible month contains the current date
- **THEN** that day's cell is rendered with a darker border and a light
  background tint distinguishing it from the other days

#### Scenario: The Today control returns to the current month

- **WHEN** the user has paged to a different month and taps the "Today" control
- **THEN** the calendar returns to the month containing the current date

#### Scenario: Clicking an empty day does nothing

- **WHEN** the user clicks a day cell that has no tour
- **THEN** nothing happens (no navigation, no selection)

### Requirement: Selecting a tour opens its detail with calendar origin

Selecting a tour from either calendar view SHALL navigate to the map page, select
that tour, and open its detail view (map + info sheet), while recording the
originating view so that detail back-navigation can return to it. On the Seasons
view the whole tour row SHALL be the selection target; on the Planned view the
tour's pill SHALL be the selection target.

#### Scenario: Selecting a tour from the Seasons view

- **WHEN** the user taps a tour row on the Seasons view
- **THEN** the app navigates to the map page, selects the tour, opens its detail
  view, and records `seasons` as the detail origin

#### Scenario: Selecting a tour from the Planned view

- **WHEN** the user taps a tour pill on the Planned calendar
- **THEN** the app navigates to the map page, selects the tour, opens its detail
  view, and records `planned` as the detail origin

### Requirement: Detail back returns to the originating calendar view

When a tour detail view was opened from the calendar, its back control SHALL
return the user to the `/calendar` page on the view it was opened from. For a
Planned-originated detail it SHALL additionally return to the **day the detail was
opened from**, not to the tour's first day, whenever that day still falls within the
tour's current span. If the tour's span was edited in the detail such that the
originating day is no longer covered, the back control SHALL fall back to the tour's
planned (start) date.

#### Scenario: Back from a Seasons-originated detail

- **WHEN** a tour detail was opened from the Seasons view and the user taps the
  detail back control
- **THEN** the app navigates to `/calendar` with the Seasons view active

#### Scenario: Back from a Planned-originated detail

- **WHEN** a tour detail was opened from the Planned view and the user taps the
  detail back control
- **THEN** the app navigates to `/calendar` with the Planned view active

#### Scenario: Back from a detail opened on a middle day of a span

- **WHEN** a detail was opened from the second day of a three-day tour and the user
  taps the detail back control without editing the dates
- **THEN** the calendar re-opens the **second** day's detail list, not the first day's

#### Scenario: Span edited so the originating day is no longer covered

- **WHEN** a detail was opened from the third day of a span, the span is shortened in
  the detail so it no longer covers that day, and the user taps back
- **THEN** the calendar re-opens the day of the tour's planned (start) date

### Requirement: Dismissing detail does not return to the calendar

The system SHALL clear the calendar origin and keep the user on the plain map
page when a calendar-originated tour detail view is dismissed by the close button
or by clicking the map.

#### Scenario: Dismiss via close button

- **WHEN** a calendar-originated tour detail is dismissed with its close button
- **THEN** the detail closes, the user stays on the map page, and the back
  control no longer offers a return to the calendar

#### Scenario: Dismiss via map click

- **WHEN** a calendar-originated tour detail is dismissed by clicking the map
- **THEN** the detail closes, the user stays on the map page, and no return to
  the calendar occurs

### Requirement: Calendar view follows the existing design system

The calendar page SHALL use the application's existing design tokens, custom
properties, and shared components (buttons, icon buttons) rather than introducing
bespoke styling, and all user-facing text SHALL be provided through the i18n
layer for every supported locale.

#### Scenario: Localized strings

- **WHEN** the calendar page renders in a supported locale
- **THEN** all its labels come from the locale files with no hard-coded
  user-facing strings

#### Scenario: A calendar library, if introduced, is themed to the design system

- **WHEN** a third-party calendar library is used for the Planned grid instead of
  the hand-rolled grid
- **THEN** it is styled with the application's design tokens rather than the
  library's default theme

### Requirement: Edit availability entry point on the Planned view

The Planned view SHALL provide an **Edit availability** extended floating action
button in the bottom-right corner, showing an icon and the visible localized text
label (English "Edit availability", German "Verfügbarkeit angeben"). The FAB SHALL
be positioned so it does not overlap the mobile bottom navigation bar. Activating
it SHALL switch the Planned view into edit-availability mode (defined by the
`calendar-availability` capability). While in edit mode the FAB SHALL be hidden and
the availability Save/Cancel controls SHALL be shown as a bottom action bar.

#### Scenario: FAB visible only on the Planned view in view mode

- **WHEN** the user is on the Planned view and not in edit mode
- **THEN** the Edit availability FAB is shown in the bottom-right corner

#### Scenario: Entry point absent on the Seasons view

- **WHEN** the user switches to the Seasons view
- **THEN** the Edit availability FAB is not shown

#### Scenario: FAB gives way to Save/Cancel in edit mode

- **WHEN** the user activates the FAB and enters edit mode
- **THEN** the FAB is hidden and a bottom action bar with Save and Cancel is shown

#### Scenario: FAB does not overlap the mobile bottom nav

- **WHEN** the Planned view is shown on a mobile viewport with the bottom
  navigation bar present
- **THEN** the Edit availability FAB is offset above the bottom nav bar and does
  not overlap it

### Requirement: Own-availability overlay in Planned day cells

The Planned view's day cells (desktop grid) and day rows (mobile list) SHALL
render the user's own-availability overlay without displacing existing tour
rendering. The overlay SHALL be present in both view mode and edit mode; in edit
mode the overlay reflects the in-progress selection.

#### Scenario: Tours and availability coexist in a cell

- **WHEN** a day has both a planned tour and the user's availability
- **THEN** the cell shows the tour pill(s) and the availability overlay together,
  with neither hidden by the other

#### Scenario: Overlay reflects the live selection in edit mode

- **WHEN** the user toggles a day in edit mode
- **THEN** that day's overlay appears or disappears immediately, before saving
