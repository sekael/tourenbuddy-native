## Purpose

Introduce the calendar feature with a guided spotlight tour on first open. Users see a welcome screen offering to start the tour, which walks through day-chip interactions, availability editing, the jump-to-today tab, and the seasonal overview. Calendar tour auto-shows once per user, can be replayed on demand, and hands off from the onboarding (map) tour on completion.

## Requirements

### Requirement: Cross-device persistence of the calendar-tour gate

The `calendar_tour_show_on_first_open` gate SHALL persist on `user_profile` so the once-only auto-show follows the user across devices. It SHALL default to `true` for all users (including existing users at migration time) so each gets exactly one auto-show.

#### Scenario: Gate follows the user across devices

- **WHEN** the calendar tour is shown and the gate flips to `false` on one device
- **THEN** opening the calendar on another device does NOT auto-show the tour again

#### Scenario: Existing users get one auto-show

- **WHEN** the migration adds the column with `default true`
- **THEN** every existing user's first calendar open after deploy auto-shows the calendar tour once

### Requirement: Calendar tip
On iOS and Android, while `calendar_tour_show_on_first_open` is true, the Calendar tab SHALL show an inline tip under the month: what the days show, sharing availability (tapping it starts marking free days), and the seasonal overview. Its Done row SHALL set the gate to false, so it never shows again on any device.

#### Scenario: Dismiss the tip
- **WHEN** the user taps Done in the calendar tip
- **THEN** the tip goes and does not return after a relaunch
