# notification-inbox Specification

## Purpose
Gives every user a persistent, in-app record of the notification events addressed to them, independent of push/email preferences, with a surface to review, act on, and clear them.

## Requirements

### Requirement: Every notification event is recorded for its recipient
For every notification event the system emits, it SHALL persist one inbox entry per recipient, in the same transaction as the write that caused the event. An entry SHALL be recorded regardless of the recipient's push/email channel state and regardless of `notif_muted_types`. The actor SHALL never receive an entry for their own action.

#### Scenario: Recipient with all channels off
- **WHEN** A sends B a friend request and B has push and email disabled
- **THEN** B has a new inbox entry for the friend request

#### Scenario: Recipient muted the type
- **WHEN** A edits a meaningful field of a tour shared with B and B has muted `tour_updates`
- **THEN** B has a new inbox entry for the edit and receives no push or email

#### Scenario: Write rolls back
- **WHEN** the write that would emit an event fails and its transaction rolls back
- **THEN** no inbox entry exists for that event

#### Scenario: Actor not recorded
- **WHEN** A deletes a shared tour
- **THEN** A has no inbox entry for the deletion

### Requirement: Event recording never fails the originating write
A failure while recording an inbox entry SHALL NOT abort or roll back the user's write; the failure SHALL be logged server-side and the write SHALL succeed without the entry.

#### Scenario: Recording fails
- **WHEN** inserting an inbox entry raises an error during a tour save
- **THEN** the tour save commits and a warning is logged

### Requirement: Inbox event coverage
The inbox SHALL record the same event set that push/email notify about: friend request received and responded; shared tour created (incl. newly-added partner), meaningfully updated, deleted; same-tour collision detected; friendship-accept backfill digest; link request created and declined; group member joined (the accept event), evicted, dissolved; suggestion batch submitted, revised, and fully resolved; the weekly availability summary; the five-day tour reminder. The inbox SHALL additionally hold release-note entries, which have no push/email counterpart. Recipient rules SHALL match the corresponding push/email requirements.

#### Scenario: Suggestion batch recorded once
- **WHEN** a partner submits four field suggestions in one batch
- **THEN** the owner has exactly one inbox entry for the batch

#### Scenario: Non-meaningful edit not recorded
- **WHEN** the owner only changes the notes of a shared tour
- **THEN** no partner gets an inbox entry

#### Scenario: Withdrawal not recorded
- **WHEN** an initiator withdraws a pending link request
- **THEN** no inbox entry is created

#### Scenario: Weekly summary recorded
- **WHEN** the Monday job finds an eligible friend free on a day the user is free this week
- **THEN** the user has one availability summary entry

#### Scenario: Tour reminder recorded
- **WHEN** the user's tour is planned five days from today
- **THEN** the user has one tour reminder entry

#### Scenario: Release note recorded
- **WHEN** the user first runs a build carrying a release note
- **THEN** the user has one release-note entry

### Requirement: Entry content survives source deletion
Each entry SHALL store its event type, action, and references to the involved tour/friendship/group/batch, plus the actor's display name and the tour name as they were at event time, so the entry renders even after the tour is deleted or the friendship ends.

#### Scenario: Deleted tour still named
- **WHEN** B opens the inbox after A deleted the shared tour "Piz Palü"
- **THEN** the deletion entry names "Piz Palü" and A

#### Scenario: Former friend still named
- **WHEN** A and B unfriend after A shared a tour with B
- **THEN** B's older entry still shows A's display name from event time

### Requirement: Entries render in the current locale
The inbox SHALL render entry text client-side from the stored type, action and snapshots in the user's current app locale (`en`, `de-CH`), with a relative timestamp.

#### Scenario: Locale switch
- **WHEN** the user switches the app language from English to German
- **THEN** existing inbox entries re-render in German

### Requirement: Inbox entry point with attention badge
The map page SHALL NOT gain new permanent controls. The inbox SHALL be an item in the speed-dial menu. The menu item and the speed-dial trigger SHALL both show the same numeric badge (display capped at "9+"), hidden at zero. The count SHALL be the number of entries that are unread AND not stale. Activating the item SHALL open the inbox as a bottom sheet on mobile and a dialog on desktop, replacing any other open sheet.

#### Scenario: Unread entries
- **WHEN** the user has 3 unread, non-stale entries
- **THEN** the speed-dial trigger and the inbox menu item both show a "3" badge

#### Scenario: All read
- **WHEN** the user has no unread entries
- **THEN** neither the trigger nor the menu item shows a badge

#### Scenario: Stale entries are not counted
- **WHEN** the user has 2 unread entries, one being a friend request they already answered on another device
- **THEN** the badge shows "1"

#### Scenario: Many unread
- **WHEN** the user has 30 unread, non-stale entries
- **THEN** the badge shows "9+" even though only the newest 20 entries are listed

#### Scenario: Open on desktop
- **WHEN** a desktop user activates the inbox menu entry
- **THEN** the inbox opens as a dialog fitted to its content

### Requirement: Inbox list
The inbox SHALL list the user's entries newest first, showing the newest 20 initially and a "Load more" control that appends the next 20 while older entries exist. It SHALL show an empty state when there are no entries.

#### Scenario: Empty inbox
- **WHEN** a new user opens the inbox
- **THEN** an empty-state message is shown

#### Scenario: Ordering
- **WHEN** the inbox has entries from Monday and Wednesday
- **THEN** the Wednesday entry is listed first

#### Scenario: Load more
- **WHEN** the user has 45 entries and activates "Load more" once
- **THEN** 40 entries are listed and "Load more" is still offered

#### Scenario: End of history
- **WHEN** all entries are listed
- **THEN** no "Load more" control is shown

### Requirement: Entry states are visually distinct
Each entry SHALL render in exactly one of three states: unread, read, or stale, with stale taking precedence over unread. Unread SHALL look emphasized with an unread dot; read SHALL look plain; stale SHALL look muted (text and icon colors), with no unread dot and an outlined chip naming why the entry is no longer valid. State SHALL NOT be conveyed by color alone: chip text and the accessible label carry it.

#### Scenario: Unread live entry
- **WHEN** an entry is unread and its subject is still pending or present
- **THEN** it renders tinted, emphasized, with an unread dot

#### Scenario: Stale overrides unread
- **WHEN** an entry is unread but its friend request was already answered
- **THEN** it renders muted with an "Answered" chip and no unread dot

#### Scenario: Screen reader
- **WHEN** a screen reader focuses a stale entry
- **THEN** the announced label includes the stale reason

### Requirement: Staleness is derived from live state
An entry SHALL be stale when its subject is no longer actionable or no longer exists: an answered or cancelled friend request; a suggestion batch no longer pending; a link request no longer pending; a referenced tour that no longer exists or is no longer visible. Informational entries (tour updated, group events, digests, tour reminders) SHALL be stale only when their tour no longer exists or is no longer visible. Availability summaries and release-note entries SHALL never be stale; summaries are deleted once their week has passed. Staleness SHALL be computed client-side and SHALL NOT modify the stored entry.

#### Scenario: Request cancelled
- **WHEN** A cancels a friend request B has not opened
- **THEN** B's entry renders stale with a "No longer pending" chip

#### Scenario: Tour deleted
- **WHEN** a tour referenced by an "updated" entry is deleted
- **THEN** the entry renders stale with a "Tour deleted" chip

#### Scenario: Informational entry stays live
- **WHEN** a "tour updated" entry's tour still exists
- **THEN** the entry is not stale regardless of later edits

#### Scenario: Summary never stale
- **WHEN** some days listed in this week's availability summary are already past
- **THEN** the entry renders without a stale chip

### Requirement: Repeated unread events collapse
For shared-tour edits and same-tour collision events, when the recipient already has an unread entry with the same type, action, tour and actor, the system SHALL update that entry (move it to the top, increment its occurrence count) instead of creating a new one. A collapsed occurrence SHALL NOT send push or email. Once the entry is read, the next occurrence SHALL create a new entry.

#### Scenario: Burst of edits
- **WHEN** A edits a shared tour five times before B opens the inbox
- **THEN** B has one unread "updated" entry showing 5 changes and received at most one push

#### Scenario: After reading
- **WHEN** B reads that entry and A edits the tour again
- **THEN** B gets a new unread entry and a push

#### Scenario: Different actor
- **WHEN** A and C each edit the same shared tour
- **THEN** B has two separate entries

### Requirement: Opening an entry deep-links and marks it read
Activating an entry SHALL mark it read and navigate to its subject: the tour info sheet for tour, suggestion, interest, link and tour reminder events; the friend requests sheet for friend-request events; the backfill collisions list for digests; the calendar focused on the earliest listed day that is not in the past for availability summaries; the note itself for release-note entries. Entries SHALL NOT offer inline actions (accept, decline, review); acting happens on the target surface. If the subject no longer exists the entry SHALL still be marked read and the app SHALL show a "no longer available" message instead of navigating.

An entry SHALL open a tour only if the user may access it at the moment of activation: a tour they own, or a friend tour they are currently a partner on. A tour the user was removed from, or that went private, SHALL be treated as no longer available — even though the entry once named it. Access SHALL be decided against a fresh server read when online, never solely against cached data. A collision entry SHALL open the recipient's own colliding tour, not the other user's. The stale chip SHALL apply the same rule.

When a user loses access to a tour — removed as partner, the tour made private or deleted, or the friendship with its owner ended — the database SHALL delete the entries that user holds about that tour (a `deleted` notice is kept). Regaining access SHALL NOT restore them: the inbox continues from the next event, and a tour shared again SHALL notify its partners as newly shared.

The user SHALL be able to clear the inbox: after an inline confirmation, every entry they have seen is deleted (entries arriving later stay). Clearing SHALL work offline and sync on reconnect.

#### Scenario: Open a shared-tour entry
- **WHEN** the user taps an unread "tour updated" entry
- **THEN** the entry becomes read and the tour's info sheet opens

#### Scenario: Subject gone
- **WHEN** the user taps an entry whose tour was deleted
- **THEN** the entry becomes read and a "no longer available" snackbar is shown

#### Scenario: Removed partner
- **WHEN** a user taps an entry for a tour whose owner has since removed them as partner
- **THEN** the entry becomes read, the tour does not open, and a "no longer available" snackbar is shown

#### Scenario: Tour went private
- **WHEN** a user taps an entry for a friend's tour that has since been made private
- **THEN** the tour does not open, even if a cached copy is still on the device

#### Scenario: Re-shared tour starts over
- **WHEN** a tour the user is a partner on goes private and is later shared with friends again
- **THEN** the entries from before are gone and the user receives one new "shared with you" entry

#### Scenario: Clear inbox
- **WHEN** the user taps "Clear inbox" and confirms
- **THEN** every entry is deleted; tapping "Clear inbox" without confirming deletes nothing

#### Scenario: Opened via push
- **WHEN** the user opens the app by tapping a push notification
- **THEN** the corresponding inbox entry is marked read

#### Scenario: Open an availability summary
- **WHEN** on Wednesday 2030-01-09 the user taps a summary listing 2030-01-08 and 2030-01-11
- **THEN** the entry becomes read and the calendar opens focused on 2030-01-11

#### Scenario: Open a tour reminder
- **WHEN** the user taps a tour reminder for a tour they still may access
- **THEN** the entry becomes read and the tour's info sheet opens

#### Scenario: Open a release-note entry
- **WHEN** the user taps a release-note entry
- **THEN** the entry becomes read and the note is shown

### Requirement: Mark all read
The inbox SHALL offer a "mark all as read" action, enabled only while unread entries exist, that marks every entry read.

#### Scenario: Mark all
- **WHEN** the user has 5 unread entries and activates "mark all as read"
- **THEN** all entries are read and the badge disappears

### Requirement: Delete an entry
The user SHALL be able to delete a single entry by swiping it away on touch devices or via a delete control on pointer devices. Deletion SHALL be permanent.

#### Scenario: Swipe to delete
- **WHEN** the user swipes an entry past the threshold on mobile
- **THEN** the entry is removed from the list and from the server

#### Scenario: Partial swipe
- **WHEN** the user releases a swipe before the threshold
- **THEN** the entry snaps back and is not deleted

### Requirement: Inbox stays in sync across devices
The inbox SHALL update live when entries are added, read, or deleted, including from another device, scoped to the user's own entries only. On returning from a hidden tab it SHALL refetch.

#### Scenario: New event while open
- **WHEN** a friend shares a tour while the user has the app open
- **THEN** the badge increments without reload

#### Scenario: Read on other device
- **WHEN** the user marks an entry read on their phone
- **THEN** it shows as read on their open desktop session

### Requirement: Inbox works offline
The inbox SHALL show the last-synced entries while offline. Marking read and deleting offline SHALL apply immediately and sync on reconnect.

#### Scenario: Read offline
- **WHEN** the user marks an entry read while offline and later reconnects
- **THEN** the entry is read on the server

### Requirement: Users only access their own entries
A user SHALL only be able to read, mark read, and delete their own entries and SHALL NOT be able to create entries, except recording their own release-note entry through the dedicated release-note operation, which only accepts a note and only ever creates an entry for the caller.

#### Scenario: Forged insert
- **WHEN** an authenticated client attempts to insert an inbox entry
- **THEN** the insert is rejected

#### Scenario: Foreign entry
- **WHEN** a client requests another user's entries
- **THEN** none are returned

#### Scenario: Release-note recording is self-only
- **WHEN** a client records a release note
- **THEN** the entry is created for the caller only, with no actor and type `release_notes`

### Requirement: Blocking removes the blocked user's entries
When a user blocks another user, the system SHALL delete the blocker's inbox entries caused by the blocked user.

#### Scenario: Block a friend
- **WHEN** B blocks A
- **THEN** every entry in B's inbox whose actor is A is removed

### Requirement: Retention
Entries older than 90 days SHALL be deleted automatically.

#### Scenario: Old entry
- **WHEN** an entry's creation time is more than 90 days ago
- **THEN** it no longer appears in the inbox after the next daily purge
