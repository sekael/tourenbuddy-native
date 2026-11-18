## Purpose

Tour list page with filtering, sorting, and quick navigation to tour detail or map view.

## Requirements

### Requirement: Tours list overlay

A `TourListSheet` component SHALL render inside `AdaptiveOverlay` with the title "Tours" and display every tour returned by `useToursStore.tours` for the authenticated user. The component SHALL emit a `close` event when the user dismisses the overlay.

Tour rows SHALL NOT display a planned date, in any form, for single-day or multi-day tours: the activity-type avatar is the row's identity at a glance.

The tour list SHALL own its own scroll container rather than scrolling within the shell's. The header block (tabs, search, filters trigger) SHALL sit outside that scroll container, and SHALL therefore remain visible without `position: sticky`.

#### Scenario: List scrolls within its own region

- **WHEN** the list holds more rows than fit
- **THEN** the rows SHALL scroll within the list's own scroll container
- **AND** the header block SHALL remain visible without moving

#### Scenario: No content bleeds through the header

- **WHEN** the user scrolls the rows to any offset, at any sheet snap point
- **THEN** no row content SHALL be visible above or through the header block

#### Scenario: Add-tour icon rendered in sheet header

- **WHEN** `TourListSheet` is mounted for an authenticated user
- **THEN** an icon-only Add-tour button SHALL be visible in the sheet header, adjacent to the close button
- **AND** SHALL NOT appear inside the scrollable list region

### Requirement: Tour search by name and partner

The overlay SHALL include a text search input. A tour SHALL be considered a match when the trimmed, case-insensitive query is a substring of either the tour's `name` or of any of the tour's partner names resolved via `useContactsStore`.

The search input SHALL share a single row with the filters trigger. That row SHALL NOT wrap at narrow widths — the input SHALL shrink instead. The search input SHALL remain visible and operable while the filter panel is open.

#### Scenario: Search shares a row with the filters trigger

- **WHEN** the overlay is rendered
- **THEN** the search input and the filters trigger SHALL occupy one row
- **AND** the input SHALL flex to fill the remaining width

#### Scenario: Narrow viewport does not wrap the row

- **WHEN** the overlay is rendered at a narrow width
- **THEN** the row SHALL NOT wrap to a second line
- **AND** the search input SHALL shrink instead

#### Scenario: Search matches tour name

- **WHEN** the user types a query that is a substring of a tour's `name` (case-insensitive)
- **THEN** that tour SHALL appear in the filtered list

#### Scenario: Search matches partner name

- **WHEN** the user types a query that is a substring of any resolved partner full name or display name of a tour
- **THEN** that tour SHALL appear in the filtered list

#### Scenario: Unnamed tour never matches name search

- **WHEN** a tour has `name === null` and the query is non-empty
- **THEN** the tour SHALL NOT match based on name (but MAY still match via partners)

#### Scenario: Empty query is neutral

- **WHEN** the search query is empty or whitespace only
- **THEN** the search SHALL NOT filter out any tour

#### Scenario: Partner with no contact record

- **WHEN** a tour's `partnerIds` contains an ID that has no matching entry in `useContactsStore.contacts`
- **THEN** that ID SHALL contribute an empty string to the partner name set and SHALL NOT cause an error

### Requirement: No-results state and clear filters

The list SHALL provide two distinct reset controls, with deliberately different scope:

- The **filtered empty state**, shown when the tour list is non-empty but search + filters yield zero matches, SHALL offer a "Clear filters" action that resets every filter **and** the search query — nothing matched, so the query is the likely culprit.
- The filters' **"Reset"** footer action SHALL reset the filters but SHALL preserve the search query, because the search input remains visible above the open filters.

Neither control SHALL close the overlay. Clearing on one tab SHALL NOT affect the other tab's filters.

#### Scenario: Filtered empty state

- **WHEN** `useToursStore.tours` is non-empty but the filtered result is empty
- **THEN** the component SHALL render "No tours match your filters." with a "Clear filters" button

#### Scenario: Empty-state clear resets search too

- **WHEN** the user activates "Clear filters" in the filtered empty state
- **THEN** the search query SHALL be cleared, every filter SHALL return to its inactive default, the overlay SHALL remain open, and the list SHALL re-render with all tours

#### Scenario: Panel clear preserves the search query

- **WHEN** the user has both a search query and active filters, and activates "Reset" in the filters footer
- **THEN** the filters SHALL be reset
- **AND** the search query SHALL be preserved

#### Scenario: Clearing applies to the active tab only

- **WHEN** the user clears filters on one tab
- **THEN** the other tab's filters SHALL be unaffected

### Requirement: Selecting a tour opens its info sheet

Tapping a tour row SHALL call `mapStore.selectTour(tour.id)` and emit `close` so that the map page opens `TourInfoSheet` for the selected tour and flies the map to its goal.

#### Scenario: Row tap selects and closes

- **WHEN** the user taps a tour row in the list
- **THEN** `mapStore.selectTour` SHALL be called with that tour's `id`
- **AND** the component SHALL emit `close`
- **AND** the existing map-page machinery SHALL open `TourInfoSheet` and fly to the tour goal

### Requirement: Tour rows are identified by activity type

Each tour row in the tour list SHALL lead with an avatar showing the tour's primary
activity type (its first type) — the type's icon, tinted with the type's color from the
same shared maps used by the calendar and the map markers — instead of a letter derived
from the tour's name. A
tour with no activity type SHALL render a generic tour icon on the list's neutral accent,
and SHALL NOT fall back to a letter or to a placeholder character. The avatar SHALL keep
its existing size, shape, and friend-tour badge overlay.

#### Scenario: Typed tour shows its activity icon

- **WHEN** a tour row renders for a tour whose activity type is set
- **THEN** the avatar shows that type's icon in that type's color, and no letter is rendered

#### Scenario: Untyped tour

- **WHEN** a tour row renders for a tour whose activity type is null
- **THEN** the avatar shows the generic tour icon on the neutral accent, and SHALL NOT
  render `?` or any character from the tour name

#### Scenario: Unnamed, untyped tour

- **WHEN** a tour row renders for a tour with neither a name nor an activity type
- **THEN** the row shows the "Unnamed tour" title beside the generic tour avatar, with no
  literal `?` anywhere in the row

#### Scenario: Friend badge remains legible over a tinted avatar

- **WHEN** a friend tour's row renders with a strongly tinted activity avatar
- **THEN** the friend badge remains visible against it, in the same corner position it
  occupies today

### Requirement: Pending-suggestion indicator on owned tour rows

A tour row in the list view SHALL show an indicator when the viewer owns that tour and it
carries pending suggestions, so the owner finds waiting proposals without opening each
tour. The count SHALL derive from the suggestion store's single user-scoped load, not from
a per-row query. Friend tours SHALL show no such indicator, and a tour with no pending
suggestions SHALL show none.

#### Scenario: Owned tour with pending suggestions
- **WHEN** the owner views the list and one of their tours has two pending suggestions
- **THEN** that row shows a pending indicator

#### Scenario: Resolved suggestions clear the indicator
- **WHEN** the owner resolves the last pending suggestion on a tour
- **THEN** the indicator disappears from that row without a manual reload

#### Scenario: Friend tour rows carry no indicator
- **WHEN** the list renders a friend's tour on which the viewer has authored a pending suggestion
- **THEN** no owner-facing pending indicator is shown on that row

### Requirement: Backfill entry point in the sheet header

The backfill collisions entry point SHALL be an icon button in the sheet header alongside the other header actions, shown only on the Friends tab when the user has at least one friendship. It SHALL expose a localized accessible name, and on desktop SHALL additionally surface that name as a tooltip. It SHALL NOT occupy a row in the list header, so that the header keeps the same height on both tabs.

#### Scenario: Hidden on the owned tab

- **WHEN** the My Tours tab is active
- **THEN** the backfill icon button SHALL NOT be rendered

#### Scenario: Hidden without friendships

- **WHEN** the Friends tab is active and the user has no friendships
- **THEN** the backfill icon button SHALL NOT be rendered

#### Scenario: Header height is stable across tabs

- **WHEN** the user switches between My Tours and Friends
- **THEN** the list header SHALL keep the same height
- **AND** the list region SHALL NOT change height as a result of the switch

#### Scenario: Opens the embedded backfill view

- **WHEN** the user activates the backfill icon button
- **THEN** the sheet body SHALL be replaced by the backfill view
- **AND** returning from it SHALL restore the prior tab, search, and filter state

### Requirement: Search and filters reset when the list is left

Leaving the tour list SHALL clear the search query and every filter on both tabs. Opening a tour from the list and returning to the list SHALL keep them. The tab SHALL follow how the list is opened: "Meine Touren" SHALL open the user's own tours, and a friend's Touren SHALL open the Friends tab narrowed to that friend (native: a list reopened on Friends hid the user's own tours behind a button labelled "Meine Touren").

#### Scenario: Closing the list

- **WHEN** the user has a search query or active filters and closes the tour list sheet or side drawer
- **THEN** reopening the list SHALL show an empty search input, no active filters, and all tours

#### Scenario: Switching to another overlay

- **WHEN** the user opens another overlay (e.g. contacts) from the menu while the tour list is open
- **THEN** the tour list's search query and filters SHALL be cleared

#### Scenario: Round-trip through a tour detail

- **WHEN** the user opens a tour from a searched/filtered list and returns to the list
- **THEN** the search query and filters SHALL be unchanged

#### Scenario: Closing a tour opened from the list

- **WHEN** the user opens a tour from a searched/filtered list and closes the tour detail instead of returning
- **THEN** the search query and filters SHALL be cleared

#### Scenario: Reopening after viewing Friends

- **WHEN** the user viewed the Friends tab, closed the list and opens it again from "Meine Touren"
- **THEN** the list SHALL show the user's own tours

#### Scenario: A friend's tours from the contact

- **WHEN** the user taps Touren on a friend's contact
- **THEN** the list SHALL open on Friends, showing only that friend's tours

### Requirement: A narrowed Friends list says what the map marks

While search or filters narrow the Friends tab and the map marks fewer of the listed tours than the list holds — the map marks only friend tours the viewer is a partner on — the list SHALL state above its rows how many of them the map shows, and why.

#### Scenario: Fewer marked than listed

- **WHEN** the Friends tab is narrowed to a friend's 43 tours and the viewer is a partner on 5 of them
- **THEN** the list SHALL say that only 5 of these are on the map, the ones the viewer is a partner on

#### Scenario: Nothing to explain

- **WHEN** every listed friend tour is marked on the map, or nothing narrows the list, or the My Tours tab is active
- **THEN** no such note SHALL be shown

### Requirement: Tour filter categories

The list SHALL filter by activity type, grade, season, planned-date range and completion status, plus partner on the My Tours tab and the friend who recorded the tour on the Friends tab. A tour SHALL appear only when it satisfies every active filter (logical AND across categories). When no filters are active, all tours SHALL pass.

#### Scenario: Partner filter

- **WHEN** on the My Tours tab the partner filter holds a set of one or more contact IDs
- **THEN** a tour SHALL match only when `tour.partnerIds` intersects the selected set (at least one partner in common)

#### Scenario: No partner filter on the Friends tab

- **WHEN** the Friends tab is active
- **THEN** the filters SHALL NOT offer a partner filter

#### Scenario: Recorded-by filter

- **WHEN** on the Friends tab the recorded-by filter holds one or more friends
- **THEN** a tour SHALL match only when one of them recorded (owns) it

#### Scenario: Recorded-by filter absent on My Tours

- **WHEN** the My Tours tab is active
- **THEN** the filters SHALL NOT offer the recorded-by filter

#### Scenario: Activity-type filter

- **WHEN** the activity-type filter holds one or more `TourType` values
- **THEN** a tour SHALL match only when at least one of its activity types is among the selected values; a tour with no type SHALL NOT match

#### Scenario: Multi-activity tour matches any of its types

- **WHEN** the activity-type filter holds only `hiking` and a tour has types `skitour` and `hiking`
- **THEN** the tour SHALL match

#### Scenario: Grade filter

- **WHEN** the grade filter holds T2 and T4
- **THEN** tours graded T2 or T4 SHALL match
- **AND** tours graded T3, tours graded only on another scale, and ungraded tours SHALL NOT match

#### Scenario: Season filter

- **WHEN** the season filter holds one or more `Season` values
- **THEN** a tour SHALL match only when `tour.seasons` is non-null and intersects the selected set

#### Scenario: Planned-date range filter uses span overlap

- **WHEN** the user sets a `from` date, a `to` date, or both
- **THEN** a tour SHALL match only when `tour.plannedDate` is non-null and the tour's span —
  `plannedDate` through `endDate`, or `plannedDate` alone when `endDate` is null — intersects
  the inclusive filter range; tours with `plannedDate === null` SHALL be excluded

#### Scenario: Multi-day tour straddling the filter boundary

- **WHEN** a tour runs 25–27 August and the filter range is 26–30 August
- **THEN** the tour SHALL match, even though its planned (start) date lies before `from`

#### Scenario: Multi-day tour entirely outside the range

- **WHEN** a tour runs 1–3 August and the filter range is 26–30 August
- **THEN** the tour SHALL NOT match

#### Scenario: Planned-date filter inactive

- **WHEN** both `from` and `to` are empty
- **THEN** the planned-date filter SHALL NOT exclude any tour, including tours with `plannedDate === null`

#### Scenario: Completion-status filter tri-state

- **WHEN** the completion filter is `all`
- **THEN** no tour SHALL be excluded by this filter
- **WHEN** the filter is `done`
- **THEN** only tours with `completed === true` SHALL match
- **WHEN** the filter is `open`
- **THEN** only tours with `completed === false` SHALL match

#### Scenario: Filters combine with search

- **WHEN** a search query and one or more filters are active
- **THEN** a tour SHALL appear only when it satisfies both the search predicate and every active filter

### Requirement: Additive grade filter

The grade filter SHALL offer one chip row per closed scale in use on the tab's tours — SAC hiking T1–T6, SAC alpine L–EX, singletrail S0–S5 — in aligned columns, each scale on one row. Each chip SHALL toggle its grade on its own. A tour SHALL match when any part of its grade leads with a selected grade, so a modifier keeps its base grade.

#### Scenario: Modifier keeps its base grade

- **WHEN** the grade filter holds WS and ZS
- **THEN** tours graded "WS-", "ZS+" or "ZS+ (III)" SHALL match
- **AND** a tour graded "S-" SHALL NOT match

#### Scenario: Free-text grade never matches

- **WHEN** any grade is selected
- **THEN** a tour graded only in free text outside the closed scales (e.g. "5c", "6a+") SHALL NOT match

#### Scenario: Any selected part passes

- **WHEN** the grade filter holds T4 only and a tour is graded "S2, T4"
- **THEN** the tour SHALL match
- **WHEN** the grade filter holds T3 and S1 and a tour is graded "S2, T4"
- **THEN** the tour SHALL NOT match

#### Scenario: Toggling a grade

- **WHEN** T2 is selected and the user taps T4, then taps T2
- **THEN** T4 alone SHALL be selected, and no grade between them SHALL be

#### Scenario: Only scales in use are offered

- **WHEN** the active tab's tours carry grades on the hiking scale only
- **THEN** the grade filter SHALL offer the hiking row alone
- **AND** a scale holding a selected grade SHALL stay offered even when no tour uses it
- **AND** when no tour carries a closed-scale grade and no grade is selected, the grade filter SHALL NOT be shown

#### Scenario: Grade counts as one filter

- **WHEN** grades on two scales are selected
- **THEN** the filters badge SHALL count the grade filter once

### Requirement: Recorded-by filter on the Friends tab

On the Friends tab the recorded-by chips SHALL be the friends who recorded at least one of the tab's tours, named as the viewer saved them in their contacts and ordered by label. A friend selected SHALL stay offered while selected. Chip labels SHALL render once in final form; until they settle, the group SHALL hold its place.

#### Scenario: Friend without tours stays clearable

- **WHEN** the recorded-by filter holds a friend who recorded none of the tab's tours
- **THEN** that friend's chip SHALL still be shown, selected, so it can be cleared

#### Scenario: Names still settling

- **WHEN** the filters open before the friends' names have resolved
- **THEN** the recorded-by group SHALL hold one chip row of space and show no chip until every label is final

### Requirement: Tours list sheet on native
The tours list SHALL open as a sheet over the map with a segmented control (Mine, Friends), a system search field by tour name and partner, a Filters button with a badge counting active categories, and Add in its navigation bar; focusing the search SHALL raise the sheet to its large height. Rows SHALL show the PWA row's content: activity avatar, name, grade and subtitle, the owner and date line on friends' tours, a pending-suggestion count, no planned date on own tours.

#### Scenario: Search a partner
- **WHEN** the user types a partner's first name into the search field
- **THEN** only tours with that partner remain and the sheet stands at its large height

#### Scenario: An uncrowded bar
- **WHEN** the user opens the tours list on an iPhone
- **THEN** Filters stands at the bar's leading edge and Add at its trailing edge, the Mine | Friends switch between them, and there is no close button: the sheet closes with a swipe down

#### Scenario: Swipe to complete
- **WHEN** the user swipes an own tour row from the leading edge and taps Complete
- **THEN** the tour is marked completed, as from its detail

### Requirement: Filters as a pushed screen
The Filters button SHALL push a filters screen in the sheet with the PWA's filter categories; its toolbar SHALL hold "Reset" (disabled while no filter is active) and a primary "Show N tours", N counting the rows the list shows on return. Back and "Show N tours" SHALL return to the list with the filters applied. Selecting a filter SHALL never move another control.

#### Scenario: Show N tours
- **WHEN** the user selects the grade "WS" and taps "Show 3 tours"
- **THEN** the list shows those three tours and the Filters badge shows 1
