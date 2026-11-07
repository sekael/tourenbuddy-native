## Purpose

Introduce the calendar feature with a guided spotlight tour on first open. Users see a welcome screen offering to start the tour, which walks through day-chip interactions, availability editing, the jump-to-today tab, and the seasonal overview. Calendar tour auto-shows once per user, can be replayed on demand, and hands off from the onboarding (map) tour on completion.

## Requirements

### Requirement: Calendar tour automatic triggers

The system SHALL decide whether to auto-start the calendar spotlight tour on calendar mount using a single rule keyed on `user_profile.calendar_tour_show_on_first_open`: (a) when a one-shot "start calendar tour" hand-off intent is present (the map tour just completed), a fresh gate starts the tour directly with no welcome and a spent gate suppresses it; (b) with no hand-off intent, a fresh gate shows the welcome screen (standalone first-open) and a spent gate does nothing. The hand-off intent SHALL be consumed on mount regardless of the gate so it never re-fires. Starting the tour on either automatic path SHALL persist `calendar_tour_show_on_first_open = false`.

#### Scenario: Hand-off with a fresh gate starts the tour directly

- **WHEN** the calendar route mounts with a pending hand-off intent and `calendar_tour_show_on_first_open = true`
- **THEN** the calendar tour starts directly (no welcome screen), `calendar_tour_show_on_first_open` is persisted as `false`, and the hand-off intent is consumed

#### Scenario: Hand-off with a spent gate is suppressed

- **WHEN** the calendar route mounts with a pending hand-off intent but `calendar_tour_show_on_first_open = false` (the user already saw the calendar tour and merely replayed the map tour)
- **THEN** the calendar tour does NOT start, no welcome is shown, and the hand-off intent is still consumed

#### Scenario: Standalone first calendar open

- **WHEN** an authenticated user with `calendar_tour_show_on_first_open = true` opens the calendar with no hand-off intent
- **THEN** the calendar-tour welcome screen is shown

#### Scenario: Returning user who already saw the calendar tour

- **WHEN** a user with `calendar_tour_show_on_first_open = false` opens the calendar with no hand-off intent
- **THEN** neither the welcome screen nor the tour appears

### Requirement: Manual calendar-tour replay

The system SHALL provide a replay control on the calendar page that starts the calendar tour on demand regardless of `calendar_tour_show_on_first_open`, mirroring the profile sheet's "Show app tour" reopen. The control SHALL start the tour at its first step and SHALL NOT depend on any cross-route signal.

#### Scenario: Returning user replays the calendar tour

- **WHEN** a user with `calendar_tour_show_on_first_open = false` activates the calendar-page replay control
- **THEN** the calendar tour starts at its first step

#### Scenario: Replay does not require a fresh gate

- **WHEN** the replay control is activated
- **THEN** the tour starts irrespective of the gate value, and the gate is not required to be reset for replay to work

### Requirement: Calendar-tour welcome screen (standalone open)

On the standalone first-open path, the system SHALL present a welcome screen offering three actions — start the tour, skip for now, and don't show again — matching the onboarding tour's welcome pattern. The welcome screen SHALL appear only on the standalone first-open path; the auto-chain hand-off SHALL bypass it.

#### Scenario: User starts the tour from the welcome screen

- **WHEN** the user activates "Start tour"
- **THEN** the welcome closes, `calendar_tour_show_on_first_open` is persisted as `false`, and the calendar tour starts

#### Scenario: User skips for now

- **WHEN** the user activates "Skip for now"
- **THEN** the welcome closes, the tour does NOT start, and `calendar_tour_show_on_first_open` is left unchanged so the welcome appears again on the next calendar open

#### Scenario: User chooses don't show again

- **WHEN** the user activates "Don't show again"
- **THEN** the welcome closes, the tour does NOT start, and `calendar_tour_show_on_first_open` is persisted as `false`

### Requirement: Guided calendar step sequence

The calendar tour SHALL present four steps in order, each spotlighting the real control with an explanatory popover: (1) day-chip meaning — a demo cell showing a fake tour chip and a fake friend chip, then the opened day-detail overview for that same date showing the tour and friend entries; (2) edit availability — the availability edit entry control, whose copy also points to calendar sync in the profile; (3) jump to today — the planned/calendar navigation tab, explaining that tapping it again scrolls back to today; (4) seasonal overview — navigating to and displaying the seasons view. The day-chip step SHALL spotlight the demo calendar cell as an intermediate waypoint, open that day's detail overview, and then spotlight the detail overview with the explanatory popover. Leaving the day-chip step SHALL close the day-detail overview. The seasonal-overview step SHALL actuate the seasons navigation control (spotlighting it with a short hint) and switch the calendar to the seasons view before spotlighting the seasonal overview content. The calendar tour SHALL use the same continuous motion as the onboarding tour.

#### Scenario: Day-chip step opens detail overview

- **WHEN** the calendar tour reaches the day-chip step
- **THEN** the demo calendar cell is spotlighted with a hint, that day's detail overview opens, and the detail overview showing the demo tour and friend entries is spotlighted with the explanatory popover

#### Scenario: Availability edit step

- **WHEN** the calendar tour reaches the availability step
- **THEN** the day-detail overview is closed and the availability edit control is spotlighted with an explanatory popover

#### Scenario: Jump-to-today step

- **WHEN** the calendar tour reaches the jump-to-today step
- **THEN** the calendar is on the planned view and its navigation tab is spotlighted with an explanatory popover

#### Scenario: Seasonal overview step switches the view

- **WHEN** the calendar tour reaches the seasonal-overview step
- **THEN** the seasons navigation control is spotlighted with a hint, the calendar switches to the seasons view, a demo season bar is rendered so the seasonal axis is populated (rather than the zero-tour "no tours" disclaimer), and the seasonal overview content is spotlighted with an explanatory popover

#### Scenario: Cleanup returns to the planned view

- **WHEN** the calendar tour ends by any exit path (finish, dismiss, advancing past the last step, navigation away)
- **THEN** the calendar is left on the planned view and the demo season bar is no longer rendered

#### Scenario: Advancing past the final calendar step

- **WHEN** the user advances past the final calendar step
- **THEN** the calendar tour ends and is marked completed

#### Scenario: Target element is missing

- **WHEN** a calendar step's target element cannot be found in the DOM
- **THEN** the tour skips that step rather than highlighting an empty region or erroring

### Requirement: Demo content renders only during the tour

For the day-chip step the system SHALL render demo chips (one fake tour chip and one fake friend chip) on a single designated demo cell (today) and in that day's opened detail overview, and for the seasonal-overview step it SHALL render a demo season bar on the seasons view. Both use hardcoded demo data that is never written to the tours or availability stores and never persisted. All demo content SHALL render only while the calendar tour is active, and SHALL disappear whenever the tour ends by any exit path (finish, dismiss, navigation away, unmount).

#### Scenario: Demo chips visible during the tour

- **WHEN** the calendar tour is running and the planned view is shown
- **THEN** the today cell renders the fake tour chip and fake friend chip with a stable spotlight anchor

#### Scenario: Demo season bar visible during the tour

- **WHEN** the calendar tour is running and the seasons view is shown
- **THEN** the seasonal axis renders with a demo season bar (not the zero-tour disclaimer) carrying a stable spotlight anchor

#### Scenario: Demo content absent when the tour is not running

- **WHEN** the calendar tour is not running (before start, after finish/dismiss, or on a fresh visit)
- **THEN** no demo chips and no demo season bar are rendered anywhere in the calendar, and no demo data appears in the tours or availability stores

#### Scenario: Demo data never persists

- **WHEN** the calendar tour runs to completion or is dismissed
- **THEN** no demo tour, availability row, or friend record is written to the stores or the database

### Requirement: Calendar-tour banner and non-blocking behavior

While the calendar tour is active, the system SHALL display a control banner (fixed at the top, above the spotlight overlay) with a "Finish tour" control, the current step's short title, the position as `X / Y`, and back/forward controls — consistent with the onboarding tour. The tour SHALL be dismissible at any step via "Finish tour", SHALL never force an action, the highlighted control SHALL be inert, and tapping the backdrop SHALL advance rather than dismiss.

#### Scenario: Banner shows title, progress and navigation

- **WHEN** the calendar tour is on step N of M
- **THEN** the banner shows the step's short title and `N / M`, the back control is disabled on the first step, and the forward control advances (completing the tour past the last step)

#### Scenario: User finishes the calendar tour mid-sequence

- **WHEN** the user activates "Finish tour" during any calendar step
- **THEN** the tour ends immediately, the demo content is removed, and the calendar returns to the planned view

### Requirement: Cross-device persistence of the calendar-tour gate

The `calendar_tour_show_on_first_open` gate SHALL persist on `user_profile` so the once-only auto-show follows the user across devices. It SHALL default to `true` for all users (including existing users at migration time) so each gets exactly one auto-show.

#### Scenario: Gate follows the user across devices

- **WHEN** the calendar tour is shown and the gate flips to `false` on one device
- **THEN** opening the calendar on another device does NOT auto-show the tour again

#### Scenario: Existing users get one auto-show

- **WHEN** the migration adds the column with `default true`
- **THEN** every existing user's first calendar open after deploy auto-shows the calendar tour once

### Requirement: One-time calendar feature sign-in notice

The system SHALL persist a separate one-time `calendar_feature_notice_show_at_sign_in` notice gate on `user_profile`. The migration SHALL default this gate to `false` for future users, and SHALL backfill it to `true` only for users whose existing onboarding tour is already spent (`onboarding_tour_show_at_sign_in = false`) and reset to the beginning (`onboarding_tour_last_step = 0`) while `calendar_tour_show_on_first_open = true`. On map startup, when the notice gate is `true`, the system SHALL show a dismissible notice explaining that the calendar is available via My Tours -> Calendar. Dismissing or closing this notice SHALL persist only `calendar_feature_notice_show_at_sign_in = false` and SHALL NOT change `calendar_tour_show_on_first_open`.

#### Scenario: Existing completed-onboarding user sees the notice once

- **WHEN** a user has `calendar_feature_notice_show_at_sign_in = true` and arrives on the map
- **THEN** the calendar feature notice is shown

#### Scenario: Notice dismissal does not disable the calendar tour

- **WHEN** the user dismisses the calendar feature notice
- **THEN** `calendar_feature_notice_show_at_sign_in` is persisted as `false` and `calendar_tour_show_on_first_open` remains unchanged

#### Scenario: Future users do not get the legacy notice

- **WHEN** a newly created user profile uses database defaults
- **THEN** `calendar_feature_notice_show_at_sign_in` is `false`
