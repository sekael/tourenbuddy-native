# calendar-availability Specification

## Purpose
Lets a user signal, edit, and persist their own per-day availability on the
Planned calendar. Availability is stored one row per available day and governed
by owner-only Row-Level Security. Friend read access and intersection display are
out of scope here and are introduced separately by #244; the data model is shaped
so that change is additive (no schema migration).
## Requirements
### Requirement: Availability data model

The system SHALL persist user availability in a `user_availability` table keyed by the
composite primary key `(user_id, date)`, where `date` is a calendar date (no time component).
A given user MUST NOT have more than one row for the same date. Each row SHALL additionally
carry an `available` boolean and a `source` of either `manual` or `calendar`. A day SHALL be
treated as available by every reader if and only if a row exists for it with
`available = true`; a row with `available = false` is a **tombstone** recording that the user
deliberately cleared that day. Rows SHALL be exposed via the Data API (explicit grants) and
governed by Row-Level Security. The table shape SHALL support group-intersection queries
(grouping availability by date across a set of users) without a schema change.

#### Scenario: Marking a day available creates exactly one row

- **WHEN** a user marks 2026-08-14 as available
- **THEN** exactly one `user_availability` row exists with that user's id, `date = 2026-08-14`,
  `available = true` and `source = 'manual'`

#### Scenario: The same day cannot be duplicated

- **WHEN** a write attempts to insert a second row for a `(user_id, date)` that already exists
- **THEN** the composite primary key rejects it and no duplicate is created

#### Scenario: A tombstone is not readable as availability

- **WHEN** a row exists with `available = false` for a given `(user_id, date)`
- **THEN** neither the user's own availability query nor a friend's availability query returns
  that date, and the Planned calendar shows no overlay for it

#### Scenario: A friend cannot read a tombstone even by querying directly

- **WHEN** an accepted friend queries `user_availability` for the user's rows with their own
  session, bypassing the app's filters
- **THEN** Row-Level Security returns no row with `available = false`

#### Scenario: Reading availability is unaffected for a user with no calendar feed

- **WHEN** a user who has never connected a calendar feed marks and clears days
- **THEN** their availability rows carry `source = 'manual'`, cleared days are deleted outright
  rather than tombstoned, and no tombstone rows accumulate

### Requirement: Owner controls own availability

The system SHALL allow an authenticated user to create, read, and delete only
their own availability rows, and SHALL additionally allow an authenticated user
to read the availability rows of any user with whom they have an accepted
friendship. A user MUST NOT be able to create, modify, or delete another user's
availability rows. A user MUST NOT be able to read the availability rows of a user
who is neither themselves nor an accepted friend.

#### Scenario: User reads own and friends' availability

- **WHEN** an authenticated user queries `user_availability`
- **THEN** they receive rows where `user_id` equals their own id **or** where
  `user_id` belongs to a user with whom they have an accepted friendship, and no
  other rows

#### Scenario: Non-friend availability is not readable

- **WHEN** an authenticated user queries `user_availability` for a `user_id` that
  is neither their own nor an accepted friend
- **THEN** RLS returns no rows for that user

#### Scenario: User cannot write another user's availability

- **WHEN** an authenticated user attempts to insert a `user_availability` row
  with a `user_id` other than their own
- **THEN** RLS rejects the write

#### Scenario: User cannot write a friend's availability

- **WHEN** an authenticated user attempts to insert or delete a
  `user_availability` row belonging to an accepted friend
- **THEN** RLS rejects the write and the friend's rows are unchanged

#### Scenario: User cannot delete another user's availability

- **WHEN** an authenticated user attempts to delete a `user_availability` row
  belonging to another user
- **THEN** RLS rejects the delete and the row remains

### Requirement: Enter and exit edit-availability mode

The Planned calendar SHALL provide an **Edit availability** extended floating action
button (bottom-right, with a visible localized text label) that enters an edit mode.
On entering edit mode the system SHALL display a disclaimer stating that
availability will be visible to the user's friends, hide the FAB, and present
**Save** and **Cancel** controls as a bottom action bar. **Cancel**, or leaving the
Planned view by any means (switching views, back navigation), SHALL discard all
unsaved changes without a confirmation prompt and return to view mode. Entering edit
mode SHALL load the user's entire availability set from today onward, so any
previously marked future day can be cleared in the same session.

#### Scenario: Disclaimer shown on entering edit mode

- **WHEN** the user taps Edit availability
- **THEN** the calendar enters edit mode, shows the friend-visibility disclaimer,
  and shows Save and Cancel controls

#### Scenario: Cancel discards changes

- **WHEN** the user has toggled some days in edit mode and taps Cancel
- **THEN** no availability write occurs and the calendar returns to view mode
  showing the previously saved availability

#### Scenario: Navigating away discards changes without a prompt

- **WHEN** the user has toggled some days in edit mode and switches to the Seasons
  view or presses back
- **THEN** the edit is discarded with no confirmation dialog and no availability
  write occurs

#### Scenario: Existing future availability is loaded for editing

- **WHEN** the user enters edit mode and had previously marked a future day that
  is not in the current month view
- **THEN** that day is part of the editable set and can be cleared and saved,
  even though it was not marked during this session

### Requirement: Toggle and drag day selection

In edit mode, tapping a selectable day SHALL toggle its availability: an unmarked
day becomes marked, a marked day becomes unmarked. On the desktop grid, dragging
across a run of consecutive days SHALL apply the first day's direction (mark or
clear) to all days in the run. On mobile the calendar list SHALL remain
scrollable in edit mode, so selection is by single tap only (no swipe-select).
Days before today SHALL NOT be selectable.

#### Scenario: Tap toggles a day on and off

- **WHEN** the user taps an unmarked future day, then taps it again
- **THEN** the first tap marks it available and the second tap clears it

#### Scenario: Drag marks a consecutive run (desktop)

- **WHEN** the user drags the mouse across three consecutive future days on the
  desktop grid
- **THEN** all three days take the first day's direction (marked available)

#### Scenario: Past days are not selectable

- **WHEN** the user taps a day before today in edit mode
- **THEN** the day's availability does not change

### Requirement: Save persists availability as a diff

On **Save**, the system SHALL persist the difference between the edited selection and the
availability set loaded when edit mode was entered: newly selected days SHALL be marked
available and cleared days SHALL cease to be available. The insert and the removal SHALL be
applied atomically (all-or-nothing) so a failure never leaves the availability half-applied.
Days that were unchanged SHALL NOT be rewritten. Every day written by this operation SHALL be
recorded with `source = 'manual'`. Where the user has at least one connected calendar feed, a
cleared day SHALL be recorded as a tombstone rather than deleted, so that a subsequent calendar
sync cannot re-add it; where the user has no connected feed, a cleared day SHALL be deleted.
An edit session whose selection nets to no change (e.g. a day toggled off and back on) is not a
decision and SHALL write nothing; in particular it does not convert a calendar-derived day into a
manual one.
After a successful save the calendar SHALL return to view mode reflecting the saved
availability.

#### Scenario: Added and removed days both persist

- **WHEN** the user marks one new day, clears one previously marked day, and taps Save
- **THEN** the new day becomes available and the cleared day ceases to be available, and no
  other availability rows change

#### Scenario: Unchanged days are not rewritten

- **WHEN** the user opens edit mode, changes nothing, and taps Save
- **THEN** no write is issued

#### Scenario: A failed save leaves availability unchanged

- **WHEN** the save operation fails partway
- **THEN** neither the additions nor the removals are applied and the stored availability is
  exactly as it was before the save

#### Scenario: Clearing a calendar-derived day survives the next sync

- **WHEN** a user with a connected feed clears a day that the feed had marked available, and a
  sync then runs while that day is still free in the source calendar
- **THEN** the day remains unavailable, because the manual tombstone takes precedence

#### Scenario: Manually marking a day the calendar calls busy survives the next sync

- **WHEN** a user marks a day available that the feed derives as busy, and a sync then runs
- **THEN** the day remains available

#### Scenario: Toggling a calendar-derived day off and on again is a no-op

- **WHEN** a user with a connected feed toggles a calendar-derived day off and back on in one edit
  session and saves
- **THEN** no write is issued and the day stays calendar-derived, so a later sync may still
  remove it

### Requirement: Render own availability overlay

The Planned calendar SHALL render the user's own available days with a
light-green overlay, in both view mode and edit mode. The overlay SHALL NOT
displace existing tour rendering on the same day.

#### Scenario: Saved availability is visible in view mode

- **WHEN** the user has saved availability for a day and is in view mode
- **THEN** that day shows the light-green availability overlay

#### Scenario: Overlay renders on a cold load without opening the editor

- **WHEN** the user opens the Planned view fresh (without entering edit mode) and
  has previously saved availability
- **THEN** their available days show the overlay, because own availability is
  loaded when the Planned view mounts

#### Scenario: Overlay coexists with a tour

- **WHEN** a day has both a planned tour and the user's availability
- **THEN** the cell shows the tour pill(s) and the availability overlay together,
  with neither hidden by the other

### Requirement: Friends' availability is shown on the Planned calendar

The Planned calendar SHALL display, for every future day on which an accepted
friend is available, that friend as a contact chip on that day — **independent of
whether the viewer is available on that day**. Own available days SHALL keep their
existing green overlay; friend chips are additive and MUST NOT depend on the
viewer's own availability. A day the viewer is available on but no friend is
available on SHALL show the green overlay with no friend chips. Past days SHALL
NOT show friend availability.

Each friend chip SHALL be labelled with the viewer's own contact name for that
friend (the name as stored in the viewer's contacts), because every friend is by
construction one of the viewer's contacts. When a friend's `userId` has not yet
been resolved to a contact, the chip SHALL fall back to the friend's registered
profile name (resolved by user id), never showing a blank chip or erroring. Friend
chips in the cell are display-only — contact actions are offered from the per-day
detail list (see "Friend rows expose call and message actions from a contact").

#### Scenario: Friend chip on a day the viewer is not available

- **WHEN** a friend is available on 2026-08-20 and the viewer is not
- **THEN** the calendar shows that friend as a chip on 2026-08-20 with no green
  overlay

#### Scenario: Friend chip on a day the viewer is also available

- **WHEN** both the viewer and a friend are available on 2026-08-21
- **THEN** the calendar shows the green overlay **and** the friend's chip on
  2026-08-21

#### Scenario: Past friend availability is not shown

- **WHEN** a friend has availability on a date before today
- **THEN** no friend chip is shown for that past date

#### Scenario: Friend chips coexist with planned tours on the same day

- **WHEN** a day has exactly one planned tour and exactly one available friend
- **THEN** the tour is shown as a tour pill and the friend as a separate neutral
  chip (each kind rendered independently, neither suppressing the other)

### Requirement: Crowded days collapse into a per-day detail list

For each kind (tours, friends) a day cell SHALL, when exactly one item is present,
show that item as its chip; when more than one is present, show instead a single
generic count chip (**"N tours"** / **"N friends"**) and no individual item; and
when none is present, show nothing. The cell MUST NOT overflow its bounds (content
is clipped). Tapping any non-empty day — outside availability edit mode — SHALL
open a per-day **detail list** containing that day's planned tours first, then its
available friends, ordered alphabetically by the viewer's contact name. The detail
list SHALL be presented as a bottom sheet on mobile and a dialog on desktop,
layered over the calendar; closing it SHALL return to the calendar at its prior
scroll position.

#### Scenario: Crowded cell collapses each kind to a count chip

- **WHEN** a day has two or more tours and two or more available friends
- **THEN** the cell shows a single "N tours" count chip and a single "N friends"
  count chip — no individual tour pill or friend chip — clipped to the cell bounds

#### Scenario: A lone item of a kind is shown as itself

- **WHEN** a day has exactly one tour and exactly one available friend
- **THEN** the cell shows that tour's pill and that friend's chip (no count chips)

#### Scenario: Returning from a tour re-opens its day

- **WHEN** the viewer opens a tour from a day's detail list and then navigates
  back to the calendar
- **THEN** the detail list re-opens for the day that tour was on

#### Scenario: Tapping a non-empty day opens its detail list

- **WHEN** the viewer taps a non-empty day in view mode
- **THEN** a per-day detail list opens, listing the day's planned tours first and
  its available friends second

#### Scenario: Empty day does not open a detail list

- **WHEN** the viewer taps a day with no tours and no available friends
- **THEN** no detail list opens

#### Scenario: Availability edit mode is unaffected

- **WHEN** the viewer taps a day while editing availability
- **THEN** the tap toggles that day's own availability and no detail list opens

### Requirement: Friend rows expose call and message actions from a contact

Friend availability rows SHALL resolve the friend's display name through the same shared
resolver used by every other tour-related surface — the viewer's saved contact name for
that user — rather than per-component resolution logic. Where no contact resolves, a
generic "a friend" fallback SHALL be shown. The call and message actions SHALL continue to
operate on the resolved contact, and SHALL be unavailable when no contact resolves.

#### Scenario: Availability chip names a friend by contact name

- **WHEN** a friend's availability chip renders for a friend saved under a different name
  than their profile name
- **THEN** the chip shows the contact name

#### Scenario: Unresolvable friend on an availability chip

- **WHEN** a friend's availability chip renders and no contact resolves for that user
- **THEN** the chip shows the generic "a friend" fallback, and the call and message actions
  are not offered for that row

### Requirement: Availability synchronizes in realtime

The system SHALL keep availability current without a manual refresh. A change to
the viewer's own availability (from any device) SHALL be reflected in the viewer's
Planned calendar. A change to an accepted friend's availability SHALL be reflected
in the viewer's Planned calendar. Realtime updates SHALL be scoped so that a user
only receives availability change signals for themselves and their accepted
friends, never for unrelated users.

#### Scenario: A friend's availability change appears live

- **WHEN** an accepted friend marks a new future day available while the viewer is
  on the Planned calendar
- **THEN** the viewer's calendar shows a chip for that friend on that day without a
  manual refresh

#### Scenario: A friend clearing availability is reflected live

- **WHEN** an accepted friend clears a previously available future day
- **THEN** the viewer's calendar removes that friend's chip from that day without a
  manual refresh

#### Scenario: Own availability syncs across devices

- **WHEN** the viewer marks a day available on one device
- **THEN** the viewer's Planned calendar on another signed-in device reflects it
  without a manual refresh

#### Scenario: Unrelated users receive no signal

- **WHEN** a user who is not an accepted friend of the viewer changes their
  availability
- **THEN** the viewer receives no availability change signal for that user

### Requirement: Calendar-derived availability never overwrites a manual decision

A calendar sync SHALL write, update and delete only rows with `source = 'calendar'`. It MUST
NOT insert, update or delete any row with `source = 'manual'`, whether that row is available or
a tombstone. This precedence SHALL be enforced by the database routine that applies a sync,
not only by the caller.

#### Scenario: Sync leaves a manual row untouched

- **WHEN** a sync runs for a day that already has a `source = 'manual'` row
- **THEN** that row is unchanged in both `available` and `source`

#### Scenario: Sync removes a day the calendar no longer frees

- **WHEN** a day previously written with `source = 'calendar'` becomes busy in the source
  calendar and a sync runs
- **THEN** that calendar-derived row is removed and the day shows no overlay

#### Scenario: A rogue caller cannot delete manual rows through the sync routine

- **WHEN** the sync routine is invoked with a day range that spans manually pinned days
- **THEN** the manual rows in that range survive the call

### Requirement: Friends are notified of every availability change

Every insert, update or delete of a user's `user_availability` rows that changes at least one row
SHALL notify that user's accepted friends to refetch, including a clear that turns a row into a
tombstone and a re-mark that turns a tombstone back into an available day. A write that changes
no row SHALL NOT notify anyone.

#### Scenario: Clearing a calendar-derived day reaches friends

- **WHEN** a user with a connected feed clears a calendar-derived day
- **THEN** their friends' overlays drop that day without a manual refresh

#### Scenario: An unchanged sync is silent

- **WHEN** a sync runs and derives exactly the availability already stored
- **THEN** no friend is notified

### Requirement: The Planned calendar explains calendar-derived availability

When the user has at least one connected calendar feed, availability edit mode SHALL state that
availability is pre-filled from their calendar and that days the user changes here override it
permanently.
Calendar-derived and manually marked days SHALL render identically, with no provenance styling.

#### Scenario: Edit mode explains the override

- **WHEN** a user with a connected feed enters availability edit mode
- **THEN** the existing friend-visibility disclaimer is accompanied by a note that days come
  from their calendar and that days changed here override the calendar

#### Scenario: No note without a feed

- **WHEN** a user with no connected feed enters availability edit mode
- **THEN** no calendar note is shown and edit mode is exactly as before
