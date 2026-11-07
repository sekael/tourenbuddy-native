# shared-tour-notifications Specification

## Purpose
Notifications for shared-tour changes and post-save collision scanning among friends.

## Requirements

### Requirement: Notify friend partners on shared-tour changes
When a tour involving a friend partner is created, meaningfully edited, or deleted, the system SHALL notify each friend partner on that tour except the actor. The event SHALL be emitted by the database in the same transaction as the tour write — never by a separate client call — so it is recorded whenever the write commits, including writes replayed from the offline queue. Push/email delivery is derived from the emitted event and SHALL NOT block or roll back the tour write.

When an edit adds one or more new partners to an existing shared tour, the newly-added friend partners (partners present after the edit but not before, intersected with the owner's friends) SHALL receive the new-shared-tour (`created`, "shared with you") notification rather than the generic edit (`updated`) notification. Pre-existing friend partners SHALL continue to receive the `updated` notification. A partner that is **removed** during an edit SHALL receive no notification.

#### Scenario: Friend partner notified of a new shared tour
- **WHEN** owner A creates a tour with friend B as a marked partner
- **THEN** B is notified of the new shared tour and A (the actor) is not

#### Scenario: Friend partner notified of an edit
- **WHEN** owner A edits a meaningful field of a tour on which B is a partner
- **THEN** B is notified of the change

#### Scenario: Newly-added partner greeted as a new shared tour
- **WHEN** owner A edits an existing shared tour and adds friend C as a new partner
- **THEN** C receives the new-shared-tour ("shared with you") notification, not the generic "updated" notification
- **AND** any pre-existing friend partner on that tour receives the "updated" notification

#### Scenario: Removed partner is not notified
- **WHEN** owner A edits a tour and removes friend D from the partner set
- **THEN** D receives no notification about the change

#### Scenario: Friend partner notified of a deletion
- **WHEN** owner A deletes a tour on which B is a partner
- **THEN** B is notified the shared tour was removed, naming the tour as it was before deletion

#### Scenario: Non-friend partners are not notified
- **WHEN** a tour has partner contacts that do not resolve to friends
- **THEN** those contacts receive no platform notification

#### Scenario: Notification failure does not fail the write
- **WHEN** recording the event or delivering push/email fails
- **THEN** the tour create/edit/delete still succeeds and the error is logged server-side, not surfaced as a write failure

#### Scenario: Offline edit replayed
- **WHEN** A edits a shared tour offline and the queued write replays on reconnect
- **THEN** B is notified exactly once, when the replayed write commits

### Requirement: Shared-tour notification preference and channels
Shared-tour notifications SHALL be dispatched under the `tour_updates` notification type and SHALL honor each recipient's `notif_email_enabled` and `notif_muted_types`, and SHALL push only to the recipient's registered devices (per-device push). Email SHALL use a single generic Brevo template, localized per recipient locale.

#### Scenario: Recipient muted the type
- **WHEN** a recipient has `tour_updates` in `notif_muted_types`
- **THEN** no push or email is sent to that recipient regardless of channel state

#### Scenario: Channel preference respected
- **WHEN** a recipient has email enabled and no registered push device
- **THEN** only the email notification is dispatched

#### Scenario: Single template for all actions
- **WHEN** any shared-tour change (created, edited, deleted) is emailed
- **THEN** the same generic Brevo template is used, parameterized by action and actor

### Requirement: Collision scan after tour save
When a tour save qualifies for the collision scan, the system SHALL find friend-owned tours satisfying the shared collision predicate (within 200 m, at least one activity type in common, both friends-visible, mutual accepted friendship) and emit a `tour_interest` notification to each colliding owner, in the same transaction as the save. The scan SHALL only run for saves by the tour's owner. Failures SHALL NOT block or roll back the tour write.

#### Scenario: Save with friend-owned colliding tour
- **WHEN** A saves a tour and a friend B owns a tour that matches the collision predicate
- **THEN** a `tour_interest` notification naming A and identifying the colliding tour is emitted for B

#### Scenario: Save with no collisions
- **WHEN** A saves a tour and no friend-owned tour matches the predicate
- **THEN** no `tour_interest` notification is emitted

#### Scenario: Invalid caller
- **WHEN** a user who does not own the tour attempts to save it
- **THEN** the write is rejected and no scan runs

### Requirement: Friendship-accept backfill digest
When a friendship transitions to accepted, the system SHALL, in the same transaction, scan for collisions between the two users' tours under the shared collision predicate, excluding pairs already in the same `tour_link_group` or with a pending `tour_link_request`, and emit a single `tour_interest` digest notification per side that has at least one collision. The digest SHALL carry the friendship and collision count and SHALL deep-link to the backfill collisions list; tour names and pair lists SHALL be fetched by that page on open. A failure of the digest SHALL NOT block the accept or the friend-request-responded notification.

#### Scenario: Accept produces collisions on both sides
- **WHEN** friendship X↔Y transitions to accepted and the scan finds at least one not-yet-linked, no-pending-request collision
- **THEN** exactly one digest notification is emitted for X and exactly one for Y

#### Scenario: Accept produces no collisions
- **WHEN** the scan finds no eligible collisions
- **THEN** no digest notification is emitted

#### Scenario: Recipient muted tour_interest
- **WHEN** X has `tour_interest` in `notif_muted_types`
- **THEN** no digest push or email is sent to X even if collisions exist, while X's inbox still records the digest

### Requirement: Link-request lifecycle notifications
The system SHALL emit `tour_interest` notifications for link-request lifecycle events in the same transaction as the request write: created (`link_created`, notify the target owner), declined (`link_declined`, notify the initiator owner), withdrawn (no notification). An accept SHALL NOT emit a separate `link_accepted`: it emits `group_joined` to every owner of a tour in the resulting group except the acceptor — in a two-tour link that is exactly the initiator, who would otherwise be told twice. Only the legitimate actor can perform each transition (initiator for create/withdraw, target for accept/decline), so a notification can only result from that actor's write. Failures SHALL NOT block or roll back the underlying DB write.

#### Scenario: Link request created
- **WHEN** A creates a request from A's tour to B's tour
- **THEN** B receives a `tour_interest` notification naming A and the colliding tour

#### Scenario: Link request accepted
- **WHEN** B accepts a request from A's tour to B's tour
- **THEN** A (and any other owner already in the group) receives one `tour_interest` `group_joined` notification naming their own tour in the group, and B receives none

#### Scenario: Link request declined
- **WHEN** B declines a request from A's tour to B's tour
- **THEN** A receives a `tour_interest` notification stating the request was declined

#### Scenario: Caller does not match the event actor
- **WHEN** a user who does not own the target tour attempts to accept the request
- **THEN** the write is rejected and no notification is emitted

### Requirement: Notify the owner when suggestions are submitted

When a partner submits a batch of suggestions, the system SHALL notify the tour owner
once for the whole batch — not once per field — under the `tour_suggestions` notification
type. The event SHALL be emitted by the database in the same transaction as the suggestion
write. Notification failure SHALL NOT fail or roll back the suggestion write. No other
partner on the tour SHALL be notified.

Revising a pending batch SHALL notify the owner once per submitted revision as a distinct
`suggestion_revised` event (not a fresh submission): a revision can arrive hours or days
later and changes what the owner is asked to review. A change made after a batch was fully
resolved forms a new batch and SHALL notify as a fresh submission.

#### Scenario: Owner notified once per batch
- **WHEN** a partner submits four field suggestions in one batch
- **THEN** the owner receives exactly one notification naming the tour and the suggester

#### Scenario: Other partners are not notified of a suggestion
- **WHEN** a partner submits suggestions on a tour with three other marked partners
- **THEN** none of the other partners receives a notification

#### Scenario: Revision notifies as revised
- **WHEN** the author revises and resubmits their still-pending batch
- **THEN** the owner receives one `suggestion_revised` notification and no second `suggestion_submitted`

#### Scenario: Post-resolution change notifies as a new submission
- **WHEN** the author proposes a change after their previous batch was fully resolved
- **THEN** a new batch is created and the owner is notified once for it

#### Scenario: Dispatch failure does not fail the write
- **WHEN** recording the event or delivering push/email fails after the suggestions were created
- **THEN** the suggestions still exist and the error is logged server-side, not surfaced as a write failure

### Requirement: Notify the author when their batch is fully resolved

The system SHALL notify a suggestion's author under the `tour_suggestions` type when their
batch transitions to having no `pending` rows left. The notification SHALL name the tour
and the deciding owner and SHALL NOT carry an accepted/declined tally: a bare "3 / 1" reads
as a score rather than an outcome, and the per-field verdicts are one tap away in the
tour's suggestion history. A partially-resolved batch SHALL dispatch nothing. Suggestions
auto-declined as a side effect of accepting a competing suggestion on the same field SHALL
run the same completion check. A batch emptied by its own author's withdrawals SHALL
dispatch nothing, and suggestions voided by a broken partner predicate SHALL dispatch
nothing.

#### Scenario: Author notified once when the batch completes
- **WHEN** the owner resolves the last pending row of a four-row batch, having accepted three and declined one
- **THEN** the author receives exactly one notification naming the owner and the tour, with no accepted/declined counts in its text

#### Scenario: Partial resolution stays silent
- **WHEN** the owner accepts two rows of a four-row batch and stops
- **THEN** no notification is dispatched and the author sees the partial state in-app

#### Scenario: Auto-decline completing a batch notifies its author
- **WHEN** accepting one partner's suggestion auto-declines another partner's last pending row
- **THEN** that other partner is notified that their batch was declined

#### Scenario: Withdrawal is silent
- **WHEN** an author withdraws their own pending suggestions
- **THEN** no notification is dispatched to anyone

#### Scenario: Predicate-break void is silent
- **WHEN** pending suggestions are voided because the friendship was removed
- **THEN** no notification is dispatched

### Requirement: Accepted suggestions notify the other partners as a tour change

When an accepted suggestion changes a field in the meaningful-edit set, the system SHALL
dispatch the existing `tour_updates` notification to the tour's friend partners, excluding
the acting owner and excluding the suggestion's author, who receives the
`tour_suggestions` resolution notification instead. A batch acceptance SHALL dispatch at
most one such notification.

#### Scenario: Partners hear that the meeting point moved
- **WHEN** the owner accepts a suggestion that changes the goal location
- **THEN** the tour's other friend partners receive the shared-tour `updated` notification

#### Scenario: The author is not double-notified
- **WHEN** the owner accepts a partner's suggestion
- **THEN** that partner receives only the `tour_suggestions` resolution notification, not also the `tour_updates` one

#### Scenario: Cosmetic accepted field notifies nobody
- **WHEN** the owner accepts a suggestion changing only a field outside the meaningful-edit set
- **THEN** no `tour_updates` notification is dispatched

#### Scenario: Batch acceptance notifies once
- **WHEN** the owner accepts a batch changing three meaningful fields
- **THEN** the other partners receive one `tour_updates` notification, not three

### Requirement: Edit notifications only for partner-facing changes

The system SHALL emit edit notifications only when a partner-facing field changes. The partner-facing set is: name, planned date **span**, goal location, tour type, partners, completion flip, GPX track added/changed, description, equipment, seasons, and the start / end point (location or name). An accepted suggestion on any of these fields SHALL count the same way. This filter SHALL be evaluated by the database against the tour's state before and after the write.

#### Scenario: Meaningful field changed
- **WHEN** the planned date, equipment, or description of a shared tour changes
- **THEN** an edit notification is emitted for friend partners

#### Scenario: Completion or GPX change notifies
- **WHEN** a shared tour is marked completed or a GPX track is added
- **THEN** an edit notification is emitted for friend partners

### Requirement: Planned date span counts at either endpoint

A change to either endpoint of the planned date **span** — the planned start date or the end date — SHALL count as a partner-facing change.

#### Scenario: Span length changed
- **WHEN** a shared tour's end date is added, removed, or moved while its planned start date is unchanged
- **THEN** an edit notification is emitted for friend partners

### Requirement: Non-partner-facing changes do not notify

Changes confined to fields outside the partner-facing set (notes, tour elevation, start/end-point elevation) SHALL NOT trigger an edit notification.

#### Scenario: Non-meaningful change suppressed
- **WHEN** only notes, the tour elevation, or start/end-point elevations change and no partner-facing field differs
- **THEN** no edit notification is emitted

### Requirement: Going private does not emit an edit notification

Toggling visibility to `private` SHALL NOT emit an edit notification (the tour simply stops being visible to friends).

#### Scenario: Going private does not notify
- **WHEN** the owner switches a tour from friends to private
- **THEN** no `tour_updates` edit notification is emitted and the tour ceases to be visible to friends

### Requirement: Collision scan runs on create or meaningful update

Independently of `tour_updates`, a create or a meaningful update of a friends-visible tour SHALL run the collision scan defined in "Collision scan after tour save"; that scan emits under the separate `tour_interest` type. A completion or visibility flip alone SHALL NOT run the scan.

#### Scenario: Collision scan runs regardless of meaningful-edit filter
- **WHEN** a friends-visible tour is created or meaningfully updated
- **THEN** the collision scan runs and may emit `tour_interest` notifications independently of whether `tour_updates` is emitted

#### Scenario: Completion flip does not rescan
- **WHEN** the only change is marking the tour completed
- **THEN** no collision scan runs
