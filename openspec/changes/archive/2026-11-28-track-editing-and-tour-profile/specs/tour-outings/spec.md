## ADDED Requirements

### Requirement: Stages in one go on every platform

The requirements "Lay out stages before the first save", "Days in the route step" and "Split into
daily stages" (while creating) SHALL hold in the iOS and Android apps as on the web (owner,
2026-11-26: "Must have feature parity on mobile"). On the phone the days SHALL show as pills above
the form and in the route step, "Next day" as a row after the end point (the form, on the last day)
and among the route's points (the route step), "Remove day n" as a row at the end of a later day's
form, and the save button SHALL name the days it saves.

#### Scenario: Three-day trek on the phone

- **WHEN** the user plans day 1 in the route step, taps "Next day" there, plans day 2, continues to
  the form, taps "Next day" after day 2's end, plans day 3 and saves once
- **THEN** three tours SHALL be created as segments 1, 2 and 3 of one outing on consecutive days,
  and the outing's overview SHALL open

#### Scenario: Cancelled on the phone

- **WHEN** the user cancels the form after laying out two days and confirms
- **THEN** no tour and no outing SHALL be created, and the days' uploads SHALL be discarded

#### Scenario: A day left without its goal

- **WHEN** the user taps "Next day" and then cancels the route step before setting the new day's goal
- **THEN** that day SHALL be dropped and the form SHALL show the day before
