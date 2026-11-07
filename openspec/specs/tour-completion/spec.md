## Purpose

Mark a tour as completed, record completion metadata, and surface a completed state in lists and detail views.

## Requirements

### Requirement: Tour completion persistence

The tour entity, Zod schema, and Supabase-backed repository SHALL persist a `completed` boolean field per tour. Default value SHALL be `false` for tours without an explicit value.

#### Scenario: Existing tour defaults to not completed

- **WHEN** a tour row is fetched from Supabase with no `completed` column value
- **THEN** the parsed tour domain entity SHALL have `completed === false`

#### Scenario: Completed tour round-trips

- **WHEN** a tour row has `completed = true` in Supabase
- **THEN** the parsed tour domain entity SHALL have `completed === true`

### Requirement: Owner-only completion updates

Only the owner of a tour SHALL be able to change its `completed` field. Enforcement SHALL be server-side: clients hold no UPDATE privilege on `tours`, and the only write path, `update_tour_full`, raises for a caller who is not the owner. The UI SHALL also hide or disable the toggle control for non-owners.

#### Scenario: Non-owner update rejected by RLS

- **WHEN** a non-owner client attempts to update the `completed` field of a tour, directly or through `update_tour_full`
- **THEN** the write SHALL be rejected (no privilege for a direct UPDATE; the RPC raises "access denied")

#### Scenario: Owner can mark and unmark

- **WHEN** the authenticated user owns the tour
- **THEN** they SHALL be permitted to set `completed` to either `true` or `false` any number of times

### Requirement: Debug-only logging of completion toggles

Completion toggle actions SHALL be logged at debug level via the `useLogger` composable. No `info`, `warn`, or user-visible console output SHALL be emitted for successful toggles.

#### Scenario: Debug log on toggle

- **WHEN** `setCompleted` is invoked
- **THEN** a debug-level log entry SHALL be emitted including the tour id and new value
- **AND** no higher-severity log SHALL be emitted on success

### Requirement: Tour completion toggle action

The tours Pinia store SHALL expose an action that toggles the `completed` field of a given tour and persists the new value via the tour repository.

#### Scenario: Mark tour completed

- **WHEN** `setCompleted(tourId, true)` is invoked on the tours store for a tour currently not completed
- **THEN** the store's local tour record SHALL immediately reflect `completed === true`
- **AND** the repository update SHALL be called with the new value
- **AND** on success the local state SHALL remain set to `true`

#### Scenario: Unmark completed tour

- **WHEN** `setCompleted(tourId, false)` is invoked on a tour currently marked completed
- **THEN** the store's local tour record SHALL immediately reflect `completed === false`
- **AND** the repository update SHALL be called with `false`

#### Scenario: Repository failure rolls back

- **WHEN** the repository update rejects with an error
- **THEN** the store SHALL revert the tour's `completed` field to its previous value
- **AND** the store's `error` ref SHALL be populated with the failure

### Requirement: Completed tour marker visual distinction

The map SHALL render completed tours with a visually distinct marker compared to not-completed tours of the same type. The encoding SHALL be a completion badge, a small green disc with a white check on the lower right edge of the tour's colored circle, leaving the activity glyph in the circle visible. If the badge layer is not feasible in the current MapLibre setup, completed tours SHALL instead render the circle color as a grayscale mix of the tour-type color. The circle radius and stroke SHALL remain identical to not-completed markers, and clicking a completed marker SHALL behave identically to clicking a not-completed one. A completed tour's name label SHALL read "done" in place of its date.

#### Scenario: Completed tour shows check marker

- **WHEN** a tour has `completed === true` and the badge layer is active
- **THEN** the map SHALL render the completion badge on the lower right edge of the tour's circle marker
- **AND** the circle color SHALL remain the tour-type color

#### Scenario: Completed tour grayscale fallback

- **WHEN** a tour has `completed === true` and the badge layer is not available
- **THEN** the circle marker SHALL render with a grayscale mix of the tour-type color

#### Scenario: Selected completed tour retains highlight and glyph

- **WHEN** a completed tour is the currently selected tour
- **THEN** the selected-state styling (larger radius, white stroke) SHALL apply identically to not-completed selected tours
- **AND** the completion badge SHALL still be rendered on top

#### Scenario: Completed tour click behavior unchanged

- **WHEN** a user clicks a completed tour's marker
- **THEN** the map SHALL fly to the tour location and show the tour info component, identical to a not-completed tour click

#### Scenario: Not-completed tour unaffected

- **WHEN** a tour has `completed === false`
- **THEN** the circle marker SHALL render in the normal tour-type color with no completion badge

#### Scenario: GPX track rendering unchanged

- **WHEN** a completed tour has a GPX track
- **THEN** the track SHALL render with the same style as a not-completed tour's track

### Requirement: Reactive marker update on completion change

The map marker layer SHALL reflect any change to a tour's `completed` field within the same tick as the store update, without requiring a page reload or manual refresh.

#### Scenario: Toggle updates marker immediately

- **WHEN** a user toggles completion on a visible tour via the info sheet
- **THEN** the corresponding map marker SHALL update its visual (check glyph shown/hidden or color desaturation applied/removed) before the user takes any further action
