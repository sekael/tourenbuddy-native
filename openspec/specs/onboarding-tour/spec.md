## Purpose

Introduce new users to TourenBuddy's core features via a guided spotlight tour. On first arrival at the map after profile onboarding, a welcome screen offers to start the tour, which glides a single spotlight through planning a tour, map switching, offline maps, phone verification, notifications, calendar sync, contacts, friend requests, tours, and the calendar. On completion, the tour hands off to the calendar with its own one-time welcome and spotlight sequence. Tour progress and the auto-show gate persist on `user_profile` so state follows the user across devices, and the tour is reopenable from the profile sheet.

## Requirements

### Requirement: First-arrival welcome trigger

The system SHALL present the pre-tour welcome screen (not the spotlight tour itself) the first time an authenticated user arrives at the map after their profile onboarding has completed or been skipped, gated on `onboarding_tour_show_at_sign_in = true`. Presenting the welcome screen SHALL NOT by itself change `onboarding_tour_show_at_sign_in`; the gate flag is only updated by the welcome actions (see "Pre-tour welcome screen").

#### Scenario: New user reaches map for the first time

- **WHEN** an authenticated user with `onboarding_tour_show_at_sign_in = true` arrives at the `/map` route and the profile/map data has loaded
- **THEN** the welcome screen is shown, the spotlight tour does NOT start yet, and `onboarding_tour_show_at_sign_in` is left unchanged until the user picks a welcome action

#### Scenario: Returning user who already saw the tour at sign-in

- **WHEN** an authenticated user with `onboarding_tour_show_at_sign_in = false` arrives at the map
- **THEN** the welcome screen does NOT appear (the tour remains reopenable from the profile sheet)

#### Scenario: Profile not yet loaded

- **WHEN** the map mounts but the user profile has not finished loading
- **THEN** the welcome screen does NOT appear until the profile (and thus the gate flag) is known, avoiding a flash for users who already saw it

#### Scenario: User skipped the profile form

- **WHEN** a user skipped the profile onboarding form (name/phone unset) and arrives at the map with `onboarding_tour_show_at_sign_in = true`
- **THEN** the welcome screen still appears — feature discovery does not depend on profile completeness

### Requirement: Pre-tour welcome screen

When the tour is triggered at sign-in, the system SHALL present a welcome screen introducing the app — rendered as a full-screen page on mobile and as a centered dialog over a dimmed backdrop on larger screens — offering three actions: start the tour, skip for now, and don't show again. The welcome screen SHALL appear only on the sign-in auto-trigger; reopening the tour from the profile sheet SHALL bypass it. The welcome screen SHALL NOT be dismissible except via one of the three actions.

#### Scenario: User starts the tour from the welcome screen

- **WHEN** the user activates "Start tour" on the welcome screen
- **THEN** the welcome screen closes, `onboarding_tour_show_at_sign_in` is persisted as `false`, and the spotlight tour starts at step `onboarding_tour_last_step`

#### Scenario: User skips for now

- **WHEN** the user activates "Skip for now" on the welcome screen
- **THEN** the welcome screen closes, the tour does NOT start, and `onboarding_tour_show_at_sign_in` is left unchanged so the welcome screen appears again at the next sign-in

#### Scenario: User chooses don't show again

- **WHEN** the user activates "Don't show again" on the welcome screen
- **THEN** the welcome screen closes, the tour does NOT start, and `onboarding_tour_show_at_sign_in` is persisted as `false` so it never auto-appears again

#### Scenario: Reopen bypasses the welcome screen

- **WHEN** the user activates "Show app tour" from the profile sheet
- **THEN** the spotlight tour starts directly at `onboarding_tour_last_step` without showing the welcome screen

### Requirement: Reopen from profile sheet

The system SHALL provide a "Show app tour" action in the user profile sheet that starts the tour regardless of `onboarding_tour_show_at_sign_in`, resuming at `onboarding_tour_last_step`.

#### Scenario: User reopens after closing mid-tour

- **WHEN** the user closed the tour at step N and later activates "Show app tour"
- **THEN** the tour starts at step N

#### Scenario: User reopens after finishing the whole tour

- **WHEN** the user previously advanced past the final step (so `onboarding_tour_last_step` was reset to 0) and activates "Show app tour"
- **THEN** the tour starts again at the first step

### Requirement: Bidirectional step navigation and resume persistence

The tour SHALL allow navigating steps both forward and backward. The system SHALL persist the current step index to `onboarding_tour_last_step` on close/finish so a later reopen resumes there. On finishing the final step, the system SHALL reset `onboarding_tour_last_step` to `0`.

#### Scenario: Navigating backward

- **WHEN** the user is on step N (N > 0) and activates the back control
- **THEN** the tour returns to step N-1, re-staging that step's overlay/target

#### Scenario: Closing mid-tour persists the step

- **WHEN** the user closes or skips the tour while on step N (not the final step)
- **THEN** `onboarding_tour_last_step` is persisted as N

#### Scenario: Finishing resets resume point

- **WHEN** the user advances past the final step
- **THEN** the tour ends and `onboarding_tour_last_step` is persisted as 0

#### Scenario: Out-of-range resume index

- **WHEN** the persisted `onboarding_tour_last_step` is greater than the last available step index (e.g. after a future step-list change)
- **THEN** the tour clamps the start index into the valid range rather than erroring

### Requirement: Control banner and non-blocking behavior

While the tour is active, the system SHALL display a control banner fixed at the top of the screen (above the spotlight overlay/popover) showing a "Finish tour" control, the current step's short title, a progress indicator (a progress line filled to `X / Y` and the text `X / Y`), and back/forward arrow controls, with the forward control visually emphasized as the primary action. When the step changes, the title SHALL cross-fade and the progress line SHALL animate to its new length. The tour's popover SHALL contain only the step title and description (no footer buttons). The tour SHALL be dismissible at any step via the banner's "Finish tour" control, and SHALL never force the user to complete an action (e.g. it must not require actually verifying a phone number to proceed). Tapping the dimmed backdrop SHALL advance to the next step rather than dismiss the tour. The highlighted control SHALL be inert (non-interactive) while the tour is active.

#### Scenario: Banner shows title, progress and navigation

- **WHEN** the tour is on step N of M
- **THEN** the banner shows the current step's short title, a progress line filled to N/M, and `N / M`; the back arrow is disabled on the first step, the forward arrow advances (and completes the tour past the last step), and the back arrow returns to the previous step

#### Scenario: User finishes the tour mid-sequence

- **WHEN** the user clicks the "Finish tour" control during any step
- **THEN** the tour ends immediately, the current step is persisted to `onboarding_tour_last_step`, and it does not auto-start again at sign-in (it remains reopenable from the profile sheet)

#### Scenario: User taps the backdrop

- **WHEN** the user taps the dimmed overlay outside the highlighted target
- **THEN** the tour advances to the next step (it does NOT dismiss); tapping past the final step finishes the tour

#### Scenario: Backdrop tap and Escape do not dismiss

- **WHEN** the user taps the backdrop or presses Escape
- **THEN** the tour is NOT dismissed; only the "Finish tour" control ends it

#### Scenario: Highlighted control is not operable

- **WHEN** the tour is active and a control (e.g. "Add phone") is highlighted
- **THEN** the user cannot activate that control through the overlay; it is explained, not operated

### Requirement: Cross-device state persistence

The system SHALL persist tour state in the `onboarding_tour_show_at_sign_in` and `onboarding_tour_last_step` columns on `user_profile` so the auto-show gate and resume point follow the user across devices and sessions.

#### Scenario: State persisted via the profile store

- **WHEN** the user starts the tour or chooses "don't show again" on the welcome screen, or the tour ends (finished/skipped)
- **THEN** the system persists the updated `onboarding_tour_show_at_sign_in` and/or `onboarding_tour_last_step` for the user via the profile store

#### Scenario: Persistence failure does not break the app

- **WHEN** persisting tour state fails (network/DB error)
- **THEN** the tour still opens/closes for the current session and the error is logged via the logger composable without surfacing a blocking error to the user

#### Scenario: Synced across devices

- **WHEN** the state is updated on one device
- **THEN** the existing `user_profile` realtime subscription propagates the change so other open sessions reflect it

### Requirement: Localized tour copy

All tour titles and descriptions SHALL be provided through `vue-i18n` keys with values for every supported locale.

#### Scenario: Locale coverage

- **WHEN** a new tour string is introduced
- **THEN** a corresponding key exists in both `en.json` and `de-CH.json` and the tour renders the active locale's text

### Requirement: Stable spotlight popover placement

For each step the system SHALL position the popover so that it does not visibly jump after first appearing, does not overlap its own spotlight cutout, and is not clipped by the viewport edges on either mobile or desktop. The system SHALL move the spotlight onto the target before the popover appears and attach the popover only once the spotlight has arrived and the target's layout has settled. A step MAY declare a per-step popover side so a target sitting low in a tall surface does not overflow the screen bottom (where it would otherwise be flipped up into the top control banner). A spotlit target SHALL stay fully visible inside its cutout, including parts that extend beyond its parent element.

#### Scenario: Surface whose layout settles after opening

- **WHEN** a step targets a surface whose content changes after it opens (e.g. the profile overview's notification summary filling in once the notification preferences load)
- **THEN** the popover is positioned against the settled layout and does not jump to a corrected position after appearing

#### Scenario: Spotlight precedes the popover

- **WHEN** a step is staged and its target has settled
- **THEN** the spotlight cutout arrives on the target first and the popover is attached afterwards, against the final target rect

#### Scenario: Target sits low in a tall surface

- **WHEN** a step's target is near the bottom of a tall surface such that a below-target popover would overflow the viewport
- **THEN** the step's declared side keeps the popover within the viewport and clear of the top control banner

#### Scenario: Target overflows its parent

- **WHEN** a step spotlights the base-map options, which unfold outside the box of the menu entry that holds them
- **THEN** the options remain fully visible inside the spotlight cutout

### Requirement: Hand-off to the calendar route on completion

When the onboarding (map) tour is completed by advancing past its final step, the system SHALL set a one-shot "start calendar tour" hand-off intent and navigate to the calendar route. Whether the calendar tour then actually starts is decided by the calendar tour's own gate (see the `calendar-tour` capability): it starts on a fresh gate and is suppressed once the gate is spent. This hand-off SHALL apply on both the first-run completion and the profile-sheet "Show app tour" reopen (which replays the map tour to completion). Dismissing the tour early via "Finish tour" SHALL NOT set the hand-off intent.

#### Scenario: Completing the map tour navigates to the calendar with the hand-off intent

- **WHEN** the user advances past the final map-tour step
- **THEN** the map tour ends, a one-shot "start calendar tour" intent is set, and the app navigates to the calendar route

#### Scenario: Reopened map tour completion also hands off

- **WHEN** the user reopens the tour via "Show app tour", replays it to the end, and advances past the final step
- **THEN** the same hand-off intent is set and the app navigates to the calendar route

#### Scenario: Early dismissal does not hand off

- **WHEN** the user ends the map tour early via "Finish tour" before the final step
- **THEN** no hand-off intent is set and the app is NOT navigated to the calendar

### Requirement: Continuous tour motion

While a tour runs, the dimmed overlay SHALL stay up continuously from the first spotlight until the tour ends: moving between waypoints and steps SHALL glide the spotlight cutout from its current position to the next target rather than removing and re-raising the overlay. While the app switches surfaces, the cutout SHALL collapse in place and then grow onto the next control, never tracking an element that is being removed. A visible popover SHALL fade out before the spotlight moves, and each new popover SHALL fade in. Ending the tour by any path SHALL fade the overlay and popover out. The pre-tour welcome screen SHALL fade in and out. When the user prefers reduced motion, the spotlight SHALL jump without gliding and the fades SHALL be skipped. A tour started while a previous tour is still fading out SHALL NOT be affected by that fade-out.

#### Scenario: Advancing between two steps

- **WHEN** the user advances from one step to the next
- **THEN** the current popover fades out, the spotlight glides (or collapses and regrows across a surface change) onto the next target without the overlay disappearing, and the new popover fades in

#### Scenario: Waypoint before a surface opens

- **WHEN** the tour spotlights an intermediate control and then actuates it (e.g. a menu entry that opens a sheet)
- **THEN** the hint fades out and the spotlight holds still while the control is actuated, and it does not jump to the screen corner when the control disappears

#### Scenario: Finishing the tour

- **WHEN** the tour ends (finish, completion, navigation away)
- **THEN** the overlay and popover fade out instead of disappearing in a single frame

#### Scenario: Reduced motion

- **WHEN** the operating system requests reduced motion
- **THEN** the spotlight moves to each target without gliding and no fade animations run

#### Scenario: Tour restarted during the fade-out

- **WHEN** a tour (the same or the calendar tour after the hand-off) starts while the previous one is still fading out
- **THEN** the previous overlay is removed immediately and the new tour runs unaffected

### Requirement: Guided step order

The tour SHALL present steps in this order, each opening/driving the real surface and highlighting the corresponding feature with a spotlight and an explanatory popover: (1) plan a tour, (2) map layers, (3) offline maps, (4) the notification inbox, (5) phone verification, (6) notification settings, (7) calendar sync, (8) contacts, (9) friend requests, (10) my tours, (11) open the calendar. Each step SHALL target the feature named in "Guided step targets".

#### Scenario: Advancing through all steps

- **WHEN** the user advances past the final step
- **THEN** the tour ends and is marked completed

### Requirement: Guided step targets

The guided steps SHALL target: plan a tour — the add-tour control in the bottom action bar; map layers — the map layers panel, covering base-map choice and trail overlays; offline maps — the offline-maps entry in the speed-dial menu; the notification inbox — the inbox entry in the speed-dial menu; calendar sync — the calendar-sync row of the profile; contacts — the add-contact control, covering the contacts list; my tours — own/friends tabs.

#### Scenario: Map layers step

- **WHEN** the tour reaches the map layers step
- **THEN** the speed-dial menu is open, the "Map layers" entry is spotlighted with its hint label, the layers panel unfolds, and the spotlight covers the whole panel with a popover explaining base maps and trail overlays and that ski routes can be tapped for details, without changing the user's base map or overlays

### Requirement: Steps sharing a surface stay adjacent

Steps sharing a surface SHALL be adjacent, and moving between them SHALL NOT replay the navigation path.

#### Scenario: Next step on the same surface

- **WHEN** the user advances from a step to one on the same surface (e.g. phone verification → notifications in the profile sheet)
- **THEN** the surface stays open, no intermediate controls are re-spotlighted, and the spotlight moves directly to the new target

### Requirement: Overlay steps open the real sheet

Steps whose surface is a page-level overlay (contacts, friend-requests, tours, profile) SHALL open the actual sheet and target a stable anchor that exists even for a new user with empty lists.

#### Scenario: Target requires an overlay to be open

- **WHEN** a step targets an element that lives inside an overlay that is currently closed (e.g. the phone-verification or notification section inside the profile sheet)
- **THEN** the tour opens that overlay before highlighting the element, and closes/leaves it in a clean state when moving to a step in a different overlay

#### Scenario: Target element is missing

- **WHEN** a step's target element cannot be found in the DOM after its overlay is opened
- **THEN** the tour skips that step rather than highlighting an empty region or erroring

### Requirement: Inbox step spotlights the menu entry

The inbox step SHALL spotlight the inbox menu entry without opening the inbox.

#### Scenario: Inbox step points at the menu entry

- **WHEN** the tour advances from the offline-maps step to the notification inbox step
- **THEN** the speed-dial menu stays open and the inbox entry is spotlighted with a popover explaining that all updates collect there even with push and email off, and the inbox is not opened

### Requirement: Final step spotlights the calendar control

The final "open the calendar" step SHALL spotlight the calendar-open control in the My Tours sheet header (teaching the user where the calendar lives) without navigating away.

#### Scenario: Final step points at the calendar

- **WHEN** the tour reaches the "open the calendar" step
- **THEN** the My Tours sheet is open and the calendar-open control in its header is spotlighted with an explanatory popover, and the map page is NOT navigated away from by the spotlight itself

### Requirement: Intermediate navigation controls are spotlighted

When driving the app to a step's surface, the tour SHALL spotlight each intermediate navigation control it actuates (e.g. the menu FAB, a menu item) with a short hint label naming that control (e.g. "Open menu", "Open contacts"), starting from the surface already on screen when that surface lies on the path (e.g. an open speed-dial menu, an open contacts sheet).

#### Scenario: Intermediate navigation controls are labelled

- **WHEN** reaching a step requires actuating intermediate controls (e.g. opening the menu FAB then a menu item)
- **THEN** each such control is spotlighted in turn with a short hint label naming it before the next surface opens

#### Scenario: Path starts from the open surface

- **WHEN** the next step's path passes through the surface already on screen (e.g. contacts → friend requests, or the open speed-dial menu → a menu entry)
- **THEN** the tour continues from that surface instead of closing it and replaying the path from the map
