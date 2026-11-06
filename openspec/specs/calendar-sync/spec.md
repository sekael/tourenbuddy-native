# calendar-sync Specification

## Purpose
Lets a user connect secret ICS calendar feeds whose busy time seeds their per-day
availability (a seed, never the source of truth: a manual decision on the Planned
calendar always wins), synced on a schedule and on demand by the Worker without
persisting calendar content, and publishes the user's planned tours as an outbound
calendar feed. Introduced by #287.

## Requirements

### Requirement: Connect calendar feeds

The system SHALL let a signed-in user connect up to 5 calendar feeds by supplying a secret
iCalendar (ICS) URL and an optional label, and SHALL let them relabel or disconnect any feed.
A feed URL MUST be stored as `https` (a `webcal://` URL SHALL be accepted and normalized to
`https://`, since calendar apps commonly hand out that scheme), MUST be unique per user, and SHALL be stored in an owner-only
table that no other user can read. When displaying a saved feed the system SHALL mask the URL
beyond its host, because the URL is a bearer credential granting read access to the user's
calendar. Attempting to connect a sixth feed SHALL be rejected with a localized message.

#### Scenario: Sixth feed is rejected

- **WHEN** a user with 5 connected feeds attempts to connect another
- **THEN** the write is rejected and a localized limit message is shown

#### Scenario: Duplicate feed URL is rejected

- **WHEN** a user connects a URL they have already connected
- **THEN** the write is rejected and no second row is created

#### Scenario: A webcal URL is normalized

- **WHEN** a user submits a `webcal://` URL
- **THEN** it is stored with the `https://` scheme and otherwise unchanged

#### Scenario: A plain http feed URL is rejected

- **WHEN** a user submits an `http://` URL
- **THEN** the form rejects it before any request is made

#### Scenario: Another user cannot read a feed URL

- **WHEN** an authenticated user queries `user_calendar_feeds` for a row belonging to another
  user, including an accepted friend
- **THEN** RLS returns no rows

#### Scenario: Saved feed URL is masked in the UI

- **WHEN** a connected feed is listed
- **THEN** only its host and label are shown, never the full secret path

#### Scenario: Disconnecting the last feed returns to manual-only availability

- **WHEN** a user disconnects their only remaining feed, by any path (UI, account deletion
  cascade, or direct database delete)
- **THEN** all their `source = 'calendar'` rows and all their tombstones are removed, leaving
  exactly their manual available days

#### Scenario: Disconnecting one of several feeds triggers a resync

- **WHEN** a user disconnects one feed while at least one other remains
- **THEN** no availability is deleted and an on-demand sync runs, so days only the removed feed
  blocked become available without waiting for the schedule

### Requirement: Configure the availability window

The system SHALL let a user configure a core window (`core_start`, `core_end`) and a minimum
free block (`min_free_minutes`) used to derive availability, defaulting to 06:00, 18:00 and 360
minutes. The system SHALL reject a configuration whose minimum free block exceeds the length of
the core window, both in the UI and by a database constraint.

#### Scenario: Unsatisfiable configuration is rejected

- **WHEN** a user sets the window to 04:00–12:00 and the minimum free block to 8 hours 1 minute
- **THEN** the configuration is rejected with a localized message and the previous settings
  remain in effect

#### Scenario: Window end before window start is rejected

- **WHEN** a user sets `core_end` earlier than or equal to `core_start`
- **THEN** the configuration is rejected

#### Scenario: Changed settings take effect on the next sync

- **WHEN** a user narrows their core window and triggers a sync
- **THEN** availability is recomputed against the new window and previously derived days that no
  longer qualify are removed

### Requirement: Derive available days from calendar busy time

For each day within the horizon, the system SHALL collect timed events from all of the user's
connected feeds, evaluate them in the `Europe/Zurich` timezone, clip each event to the day's
core window, merge overlapping busy intervals across **all** feeds, and mark the day available
if and only if the largest contiguous free interval within the core window is at least
`min_free_minutes`. All-day events, cancelled events and events marked "show as free" SHALL be ignored entirely. Recurring events SHALL be expanded
across the horizon, honouring exceptions and cancellations. Events spanning more than one
calendar day SHALL contribute busy time to each day they overlap. Events whose `UID` identifies
them as originating from Tourenbuddy's own outbound feed SHALL be discarded before derivation.

#### Scenario: A short appointment does not consume the day

- **WHEN** the only event on a day is 08:00–09:00 and the window is 06:00–18:00 with a 6-hour
  minimum
- **THEN** the day is derived as available, because 09:00–18:00 is a 9-hour free block

#### Scenario: A full working day is busy

- **WHEN** a day holds a 09:00–17:00 event under the same settings
- **THEN** the day is derived as busy, because the largest free block is 06:00–09:00

#### Scenario: Busy time unions across feeds

- **WHEN** a work feed blocks 06:00–12:00 and a private feed blocks 12:00–18:00 on the same day
- **THEN** the day is derived as busy, even though each feed alone would leave a 6-hour block

#### Scenario: All-day events do not affect availability

- **WHEN** a day carries only an all-day event such as a birthday, a public holiday or a
  vacation entry
- **THEN** the day's derivation is identical to a day with no events at all

#### Scenario: A weekly recurrence blocks every occurrence

- **WHEN** a feed contains a weekly 09:00–17:00 recurring event
- **THEN** every occurrence within the horizon is derived as busy, and any occurrence removed
  by an exception is not

#### Scenario: An occurrence moved across the horizon edge does not drop the others

- **WHEN** one occurrence of a recurring event is moved to a date past the horizon, or an
  occurrence scheduled past the horizon is moved into it
- **THEN** every other occurrence within the horizon is still derived as busy, and the moved
  occurrence counts only on the day it now takes place

#### Scenario: A multi-day event blocks each day it spans

- **WHEN** an event runs from Friday 18:00 to Sunday 20:00
- **THEN** Saturday is derived as busy and Sunday's busy time is clipped to its local portion

#### Scenario: Events are evaluated in Swiss local time

- **WHEN** an event is published in UTC and overlaps the core window only after conversion to
  `Europe/Zurich`
- **THEN** derivation uses the converted local times

#### Scenario: Events the user marked free do not count as busy

- **WHEN** a timed event is marked "show as free" (`TRANSP:TRANSPARENT`) or cancelled
- **THEN** it contributes no busy time

#### Scenario: Tourenbuddy's own tour events are ignored

- **WHEN** the user subscribes their calendar to the Tourenbuddy outbound feed and lists that
  same calendar as an inbound feed
- **THEN** tour events originating from Tourenbuddy are discarded and tour days are not derived
  as busy by their own entries

### Requirement: Sync writes only within a rolling horizon

A sync SHALL derive and write availability only for dates from today through 60 days ahead, and
SHALL NOT create, modify or delete availability outside that range. Tombstones for dates in the
past MAY be removed as housekeeping within the same operation.

#### Scenario: Days beyond the horizon are untouched

- **WHEN** a sync runs and the user's calendar is empty six months out
- **THEN** no availability is written for those dates

#### Scenario: Availability manually set beyond the horizon is preserved

- **WHEN** a user has manually marked a day 90 days out and a sync runs
- **THEN** that day remains available

### Requirement: A failing feed never widens availability

If any of a user's connected feeds cannot be fetched or parsed during a sync, the system SHALL
abort the sync for that user without writing any availability, SHALL preserve the previously
stored availability, and SHALL record a per-feed error that the UI surfaces next to the failing
feed. The system MUST NOT derive availability from the subset of feeds that responded.

#### Scenario: A rotated secret URL does not free the calendar

- **WHEN** a user rotates their calendar's secret address and the stored feed URL now returns
  403
- **THEN** no availability is written, previously derived days are unchanged, and the feed shows
  an error in the UI

#### Scenario: One failing feed aborts the whole run for that user

- **WHEN** one of two connected feeds times out and the other returns valid data
- **THEN** no availability is written for that user

#### Scenario: An unparseable body is a failure, not an empty calendar

- **WHEN** a feed returns 200 with a body that is not valid iCalendar, or that contains an event
  which cannot be read (for example one without a start time)
- **THEN** the feed records an `unparseable` error and the sync fails for that user rather than
  deriving zero busy time

#### Scenario: An oversized feed is a failure

- **WHEN** a feed body exceeds 2 MB, whether announced by `Content-Length` or discovered while
  reading
- **THEN** the read is aborted, the feed records a `too_large` error, and no availability is
  written for that user

#### Scenario: A recurrence too large to expand is a failure

- **WHEN** a feed contains a recurring event whose expansion exceeds the processing cap
- **THEN** the feed records a `too_complex` error and no availability is written for that user

#### Scenario: A resolved error clears

- **WHEN** a previously failing feed succeeds on a later run
- **THEN** its recorded error is cleared and availability is written

### Requirement: Sync runs on a schedule and on demand

The system SHALL sync every user with at least one connected feed on a recurring schedule of at
most six hours, and SHALL additionally expose an authenticated on-demand sync that runs the
same routine for the calling user only. The UI SHALL show when the user's feeds last synced
successfully. Within the same local day, the scheduled sync MAY skip a feed that reports no
change since the last successful fetch; on the first run of a new local day the feed SHALL be
fetched unconditionally, because the horizon has rolled. The on-demand sync SHALL always fetch
every feed unconditionally, because it follows changes no feed can report (new settings, a
removed feed).

#### Scenario: On-demand sync is scoped to the caller

- **WHEN** an authenticated user triggers an on-demand sync
- **THEN** only their own feeds are fetched and only their own availability is written

#### Scenario: Unauthenticated on-demand sync is rejected

- **WHEN** the on-demand sync endpoint is called without a valid session token
- **THEN** it returns an authentication error and no sync runs

#### Scenario: Newly connected feed syncs without waiting for the schedule

- **WHEN** a user connects their first feed
- **THEN** a sync is triggered immediately and derived availability appears without waiting for
  the next scheduled run

#### Scenario: One unchanged feed next to a changed one is refetched

- **WHEN** within the same local day one feed reports no change and another has changed
- **THEN** the unchanged feed is fetched again unconditionally and availability is derived from
  all feeds, never from the changed feed alone

#### Scenario: A rolled horizon forces a fresh fetch

- **WHEN** the first sync of a new local day runs against a feed that has not changed
- **THEN** the feed is fetched unconditionally and the full horizon is recomputed

#### Scenario: On-demand sync recomputes even when no feed changed

- **WHEN** a user changes their settings or removes one of several feeds, and an on-demand sync
  runs on a day their feeds already synced and have not changed since
- **THEN** every feed is fetched unconditionally and availability is recomputed

### Requirement: Calendar content is never persisted

The system SHALL derive per-day booleans from feed content in memory and MUST NOT persist event
titles, descriptions, locations, organizers or attendees to any table, cache or log. Error
records SHALL identify a feed and a failure cause without including response bodies.

#### Scenario: A failure log carries no event data

- **WHEN** a feed fails mid-parse and the failure is recorded
- **THEN** the recorded error names the feed and the cause, and contains no calendar content

#### Scenario: Only dates are written

- **WHEN** a sync completes successfully
- **THEN** the only data written for the user is availability dates

### Requirement: Publish planned tours as a calendar feed

The system SHALL provide each user with a private iCalendar feed URL, containing a secret token,
that any calendar application can subscribe to. The feed SHALL contain only the user's **own**
tours that have a planned date, as all-day events spanning the planned date through the end date (or the planned date alone), rendered from the user's own tour
data at request time. A linked tour appears because it is the user's own tour; no other user's
tour data SHALL ever be read into the feed, since subscribing calendar providers store what they
fetch. The user SHALL be able to regenerate the feed URL, invalidating the previous token
immediately. Each event
SHALL carry a stable identifier marking it as Tourenbuddy-originated. An unknown token SHALL
return 404 and MUST NOT reveal whether the token ever existed.

#### Scenario: A linked tour is rendered from the user's own tour

- **WHEN** the user's tour is linked to a friend's tour with a different name and planned date
- **THEN** the event uses the user's own tour name and planned date, and the friend's tour
  produces no event

#### Scenario: A multi-day tour spans its whole range

- **WHEN** a tour has a planned date and an end date
- **THEN** its event covers every day from the planned date through the end date inclusive

#### Scenario: A regenerated URL revokes the old one

- **WHEN** the user regenerates their feed URL
- **THEN** the previous URL returns 404 and the new URL serves the feed

#### Scenario: A tour without a planned date is omitted

- **WHEN** the user has tours with no planned date
- **THEN** those tours produce no events

#### Scenario: An unknown token is not distinguishable

- **WHEN** the feed is requested with a token that does not resolve to a user
- **THEN** the response is 404 with no indication of whether the token was valid, revoked or
  never issued

#### Scenario: A deleted tour disappears on the next refresh

- **WHEN** a tour in the feed is deleted and the calendar application refreshes
- **THEN** its event is absent

### Requirement: Availability window save reflects pending changes

The availability-window form SHALL enable its save action only while the form differs from the saved settings. After a successful save it SHALL show a clear, accessible confirmation that the new settings were applied, kept until the user changes the form again.

#### Scenario: No pending changes

- **WHEN** the window form shows exactly the saved settings
- **THEN** the save button SHALL be disabled

#### Scenario: Pending changes

- **WHEN** the user changes the start, end or minimum free block
- **THEN** the save button SHALL be enabled

#### Scenario: Reverting an edit

- **WHEN** the user changes a value and then changes it back to the saved value
- **THEN** the save button SHALL be disabled again

#### Scenario: Successful save is confirmed

- **WHEN** the user saves changed settings and the save succeeds
- **THEN** the button SHALL show a "Saved" confirmation, be disabled, and the confirmation SHALL be announced to assistive technology

#### Scenario: Confirmation clears on the next edit

- **WHEN** the "Saved" confirmation is shown and the user changes a value
- **THEN** the button SHALL return to an enabled "Save"

#### Scenario: Failed save

- **WHEN** saving fails (invalid window or network error)
- **THEN** no "Saved" confirmation SHALL be shown and the button SHALL stay enabled
