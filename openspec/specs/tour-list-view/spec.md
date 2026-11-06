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

### Requirement: Add-tour affordance inside the tour list sheet

`TourListSheet` SHALL render an icon-only Add-tour button in the sheet header (Material Symbols `add_location_alt`, accessible name from `tours.list.addTourAriaLabel`), positioned adjacent to the close button. Activating the button SHALL emit an `add-tour` event with no payload. The component SHALL NOT mutate any store directly — the consuming page is responsible for closing the list and entering the location-pick flow.

#### Scenario: Add-tour icon rendered in sheet header

- **WHEN** `TourListSheet` is mounted for an authenticated user
- **THEN** an icon-only Add-tour button SHALL be visible in the sheet header, adjacent to the close button
- **AND** SHALL NOT appear inside the scrollable list region

#### Scenario: Activating add-tour emits event

- **WHEN** the user activates the Add-tour button
- **THEN** `TourListSheet` SHALL emit an `add-tour` event
- **AND** SHALL NOT mutate `useToursStore` or `useMapStore`

#### Scenario: Add-tour disabled when unauthenticated

- **WHEN** the user is not authenticated
- **THEN** the Add-tour button SHALL render disabled with the existing `signInToAddToursTooltip` tooltip text (desktop view only)

#### Scenario: Add-tour visible in both mobile and desktop layouts

- **WHEN** `TourListSheet` is rendered on a viewport below 600px AND on a viewport at or above 600px
- **THEN** the header Add-tour icon SHALL be present in both layouts

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

### Requirement: Calendar entry point in the tour list

The tour-list overview SHALL provide a calendar icon button in its header that
navigates the user to the `/calendar` calendar view.

#### Scenario: Opening the calendar from the tour list

- **WHEN** the user taps the calendar icon button in the tour-list header
- **THEN** the app navigates to the `/calendar` route and displays the calendar
  view

#### Scenario: Calendar button available regardless of active list tab

- **WHEN** the tour list is on either the Owned or the Friends tab
- **THEN** the calendar icon button remains visible and functional in the header

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

### Requirement: Filter panel accessibility

The filters SHALL expose their expanded state and accessible name to assistive technology, and SHALL manage focus on open and close. They SHALL be announced as a non-modal region, since content outside them remains operable.

#### Scenario: Trigger exposes panel state

- **WHEN** the filters are open or closed
- **THEN** the trigger SHALL reflect the state via `aria-expanded`
- **AND** SHALL reference the filters via `aria-controls`

#### Scenario: Focus moves into the panel on open

- **WHEN** the user opens the filters
- **THEN** focus SHALL move to the filters region without scrolling the tabs and search row out of view

#### Scenario: Focus returns to the trigger on close

- **WHEN** the filters are closed by the trigger, "Show N tours" or Escape
- **THEN** focus SHALL return to the trigger

#### Scenario: Panel has an accessible name

- **WHEN** the filters are rendered
- **THEN** they SHALL expose an accessible name sourced from a localized string present in every locale file

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

### Requirement: Stable list sheet height while searching

On mobile, the tour list sheet SHALL NOT shrink while a search query or any filter is active, so results stay above the on-screen keyboard. Clearing search and filters SHALL let the sheet fit its content again.

#### Scenario: Typing a narrowing query

- **WHEN** the user types a search query that reduces the number of visible tours
- **THEN** the tour list sheet height SHALL NOT decrease

#### Scenario: Applying a narrowing filter

- **WHEN** the user activates a filter that reduces the number of visible tours
- **THEN** the tour list sheet height SHALL NOT decrease

### Requirement: Search and filters reset when the list is left

Leaving the tour list SHALL clear the search query and every filter on both tabs. Opening a tour from the list and returning to the list SHALL keep them. The last-viewed tab SHALL still be remembered.

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

### Requirement: Filters view

Filter controls SHALL be collapsed behind a "Filters" trigger in the search row, with a badge counting active filter categories (search does not count). Opened, the filters SHALL replace the tour rows in the sheet's or drawer's normal flow, below the tabs and the search row, as the only scrolling region. Their layout SHALL depend on the tab's tours only, never on how many match, so selecting or clearing a filter SHALL NOT resize the filters or move any control.

#### Scenario: Filters hidden by default

- **WHEN** the list opens
- **THEN** the search input and tour rows SHALL be visible and the filters hidden behind the trigger

#### Scenario: Badge reflects active filter count

- **WHEN** the user has selected two partners and a completion status of `done`
- **THEN** the trigger SHALL display a badge with the value `2`

#### Scenario: Opening the filters

- **WHEN** the user activates the trigger
- **THEN** the filters SHALL take the rows' place, with the tabs and the search row still above them
- **AND** the sheet SHALL scroll them as its one scrolling region

#### Scenario: A selection that thins the list

- **WHEN** the filters are open and the user taps a chip that leaves one matching tour
- **THEN** no filter group, chip or footer action SHALL move or change size

#### Scenario: Sheet size on a phone

- **WHEN** the filters open in the bottom sheet
- **THEN** the sheet SHALL open them at their content height, at most 70% of the visible viewport, and SHALL be draggable up to 90%
- **AND** dragging the sheet SHALL NOT close the filters

#### Scenario: Glove-sized targets

- **WHEN** the filters are shown
- **THEN** every chip, date field and status option SHALL be at least 44px tall

#### Scenario: Same presentation in both shells

- **WHEN** the list is rendered in the desktop side drawer
- **THEN** the filters SHALL take the rows' place there too, scrolling within the drawer below the search row

### Requirement: Filters footer actions

While the filters are open, the sheet or drawer footer SHALL hold a "Reset" action and a primary "Show N tours" action, visible at every scroll position. N SHALL be the number of rows the list shows on close (search and filters together, an outing counted once). "Show N tours" SHALL close the filters. "Reset" SHALL stay in place, disabled, while no filter is active.

#### Scenario: Count reflects search and filters together

- **WHEN** a search query and one or more filters are both active
- **THEN** N SHALL equal the number of rows displayed once the filters close

#### Scenario: Count updates as facets change

- **WHEN** the user toggles a filter facet
- **THEN** N SHALL update without closing the filters

#### Scenario: No active filters

- **WHEN** no filter is active
- **THEN** "Reset" SHALL be shown disabled

### Requirement: Filters view dismissal

The filters SHALL close via the trigger, the "Show N tours" action and the Escape key. Pointers elsewhere, including dragging the sheet, SHALL NOT close them. Closing SHALL show the filtered rows and preserve the selection.

#### Scenario: Escape while typing in search

- **WHEN** focus is in the search input and the user presses Escape
- **THEN** the filters SHALL close and the sheet SHALL stay open

#### Scenario: Switching tabs keeps the filters open

- **WHEN** the filters are open and the user activates the other tab
- **THEN** the filters SHALL stay open and present the selection stored for that tab

#### Scenario: Filters are closed after remount

- **WHEN** the user opens a tour detail view and returns to the list
- **THEN** the filters SHALL be closed and the previously selected filters SHALL still be active

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
