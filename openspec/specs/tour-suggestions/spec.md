## Purpose

Partners on a friend's tour propose field-scoped changes to it; the tour owner adjudicates
each field independently or accepts a whole batch, in the shape of a code review. The tour
itself is unchanged until the owner accepts.

## Requirements

### Requirement: Suggestion authorship restricted to live partners

A user SHALL be able to create suggestions on a tour only when they are not the owner AND
they resolve as a marked partner on that tour via `tour_partner_user_ids`, AND the tour's
`visibility` is `friends`, AND an accepted friendship exists with the owner. The predicate
SHALL be evaluated server-side inside the create RPC; direct `INSERT` on `tour_suggestion`
SHALL be blocked by RLS.

#### Scenario: Non-partner friend cannot suggest
- **WHEN** friend B, who is not a marked partner on owner A's tour, calls the create RPC
- **THEN** the function raises a named authorization error and no row is inserted

#### Scenario: Direct insert blocked
- **WHEN** any client issues an `INSERT` into `tour_suggestion` outside the RPC
- **THEN** RLS rejects the write

#### Scenario: Owner cannot suggest on their own tour
- **WHEN** owner A calls the create RPC against their own tour
- **THEN** the function raises a named error — the owner edits directly

#### Scenario: Private tour rejects suggestions
- **WHEN** a marked partner calls the create RPC against a tour whose `visibility` is `private`
- **THEN** the function raises a named error and no row is inserted

### Requirement: One row per logical field

Each suggestion SHALL occupy one row scoped to one logical field drawn from a fixed
enum: `name`, `dates`, `goal`, `tour_type`, `elevation`, `description`, `seasons`,
`equipment`, `notes`, `start_point`, `end_point`, `gpx`, `attachment_add`,
`attachment_remove`. Coupled columns SHALL be carried within a single logical field so
that accepting one suggestion can never produce a tour that violates a database
constraint or an internally inconsistent tour. `visibility` and `completed` SHALL NOT be
suggestable, and the partner set SHALL NOT be suggestable.

The binary fields are the exception to "one row per field": `attachment_add` and
`attachment_remove` are scoped per FILE, and each such row SHALL carry a distinct
`target_id` — the targeted attachment for a removal, a client-minted id for an addition.
Because at most one pending row may exist per (tour, author, field, target), an addition
without a target would collapse every add in a batch onto a single row.

A derived value SHALL travel with the value it is derived from: when suggested goal
coordinates differ from the current ones, the `goal` suggestion SHALL carry the elevation
looked up for the new point and no standalone `elevation` suggestion SHALL be emitted.
A standalone `elevation` suggestion SHALL be emitted only when the elevation was edited
without moving the goal.

#### Scenario: Date span suggested as one unit
- **WHEN** a partner suggests a new start and end date
- **THEN** one `dates` row is written carrying both values, and accepting it writes both

#### Scenario: Partial date accept cannot invalidate the span
- **WHEN** the owner accepts a `dates` suggestion
- **THEN** `planned_date` and `end_date` are written together and `end_date >= planned_date` holds

#### Scenario: Start point carries its derived metadata
- **WHEN** a partner suggests a different start point
- **THEN** the `start_point` row carries coordinates, place name and elevation, and accepting it writes all four columns

#### Scenario: Visibility is not suggestable
- **WHEN** a client attempts to create a suggestion with `field = 'visibility'` or `'completed'`
- **THEN** the database CHECK constraint rejects the write

#### Scenario: Clearing a field is a valid suggestion
- **WHEN** a partner suggests removing the description
- **THEN** a `description` row is written with a null `value`, and accepting it sets the column to null

#### Scenario: Moved goal carries its elevation
- **WHEN** a partner moves the goal point in suggest mode
- **THEN** one `goal` row is written carrying the coordinates and the elevation looked up for them, and no standalone `elevation` row is written

#### Scenario: Elevation edited alone stays its own field
- **WHEN** a partner corrects the elevation without moving the goal
- **THEN** one `elevation` row is written and no `goal` row is written

#### Scenario: Several files added in one submission stay separate
- **WHEN** a partner picks four photos and submits once
- **THEN** four `attachment_add` rows are created, each with its own target, and accepting them all attaches four files

#### Scenario: Partner set is not diffed
- **WHEN** a partner submits suggest mode on a friend tour, whose friend-read shape exposes no partner ids
- **THEN** no suggestion referencing the partner set is created

### Requirement: Batch grouping of one submission

All suggestions submitted together SHALL share one `batch_id`. The owner SHALL be able to
resolve any single row independently, and SHALL be able to accept an entire batch in one
action which applies within a single transaction.

#### Scenario: Multi-field submission forms one batch
- **WHEN** a partner edits four fields and submits once
- **THEN** four rows are written sharing one `batch_id` and one `created_at` transaction

#### Scenario: Single row resolved inside a batch
- **WHEN** the owner declines one row of a four-row batch
- **THEN** that row moves to `declined` and the other three remain `pending`

#### Scenario: Accept-all is atomic
- **WHEN** the owner accepts a whole batch and applying one of its rows fails
- **THEN** no row in the batch is resolved and the tour is unchanged

### Requirement: Base value captured for staleness

Each suggestion SHALL record the tour's value for that field at the time it was created or
last revised. When the current value differs from the recorded base at review time, the
suggestion SHALL be presented as stale, showing the current value, the base value, and the
suggested value. A stale suggestion SHALL remain acceptable — the system SHALL NOT
auto-void it.

Field values SHALL be serialized by a single server-side builder used both to write the
base value and to evaluate staleness, so that both sides of every comparison originate
from the same expression. Staleness SHALL be exposed to the client as a computed boolean;
the client SHALL NOT compare values itself.

#### Scenario: Owner edits a field with a pending suggestion on it
- **WHEN** the owner changes the description after a partner suggested a different one
- **THEN** that suggestion is marked stale and the review shows current, base and suggested values

#### Scenario: Stale suggestion can still be accepted
- **WHEN** the owner accepts a stale suggestion
- **THEN** the suggested value overwrites the owner's newer value and the row resolves `accepted`

#### Scenario: Revising a suggestion clears its staleness
- **WHEN** the author revises a suggestion that had gone stale
- **THEN** the base value is refreshed to the tour's current value and the suggestion is no longer presented as stale

#### Scenario: Equal values are not reported stale across representations
- **WHEN** a suggestion's field is a date, a coordinate pair, or an array-valued field whose current value is unchanged
- **THEN** staleness evaluates false, because the stored base and the compared current value were produced by the same serializer

### Requirement: Visibility of suggestions

A suggestion row SHALL be readable only by the tour owner and by its author. Other marked
partners on the same tour SHALL see the unmodified tour and no indication that a
suggestion exists.

#### Scenario: Another partner sees nothing
- **WHEN** partner C reads a tour on which partner B has a pending suggestion
- **THEN** C receives the original tour values and zero suggestion rows

#### Scenario: Author reads own pending suggestion
- **WHEN** partner B reads the tour they suggested on
- **THEN** B sees the original values alongside their own pending suggestions

### Requirement: Resolution authority and lifecycle

A suggestion SHALL have status `pending`, `accepted`, `declined` or `withdrawn`. Only the
tour owner MAY accept or decline; only the author MAY withdraw, and only while `pending`.
All transitions SHALL occur through SECURITY DEFINER RPCs which re-validate authorization
and partner status, and SHALL set `resolved_at`. A resolved suggestion SHALL NOT
transition again.

#### Scenario: Author cannot accept their own suggestion
- **WHEN** the author calls the accept RPC
- **THEN** the function raises a named authorization error and the row stays `pending`

#### Scenario: Owner cannot withdraw
- **WHEN** the owner calls the withdraw RPC
- **THEN** the function raises a named error — the owner declines instead

#### Scenario: Already-resolved suggestion is not re-resolved
- **WHEN** accept is called on a row already `declined`
- **THEN** the function raises a named error and `resolved_at` is unchanged

#### Scenario: Partner status lost before acceptance
- **WHEN** the friendship is removed, the partner contact loses its matching phone, or the tour goes private while a suggestion is pending
- **THEN** a trigger moves the pending row to `withdrawn` with `resolved_at` set, and a subsequent accept raises a named error

### Requirement: Author may revise a pending suggestion

The author SHALL be able to revise their pending suggestions on a tour until they are
resolved. Revision SHALL occur through a single idempotent RPC that reconciles the author's
pending set against the submitted set: a field still differing from the tour's current
value SHALL be updated in place with a refreshed base value, a newly-changed field SHALL be
inserted into the same batch, and a field returned to the tour's current value SHALL be
withdrawn. Accepted, declined and withdrawn rows SHALL be immutable; a later change SHALL
form a new batch. At most one `pending` suggestion SHALL exist per tour, author and field,
enforced by a database constraint.

#### Scenario: Revising updates in place rather than duplicating
- **WHEN** the author resubmits with a different description than their pending one
- **THEN** the existing `description` row is updated, its base value refreshed, and no second pending row exists

#### Scenario: Reverting a field withdraws its suggestion
- **WHEN** the author resubmits with a field restored to the tour's current value
- **THEN** that suggestion is resolved `withdrawn` and the remaining suggestions are untouched

#### Scenario: Adding a field joins the existing batch
- **WHEN** the author resubmits having also changed the equipment
- **THEN** an `equipment` row is inserted carrying the same `batch_id` as their pending rows

#### Scenario: Resolved suggestions cannot be revised
- **WHEN** the author resubmits a change to a field whose suggestion was already accepted
- **THEN** the accepted row is unchanged and the new proposal is created as a new batch

#### Scenario: Retried submit does not duplicate
- **WHEN** the same submission is sent twice because the first response was lost
- **THEN** the unique constraint makes the second call a no-op update and exactly one pending row per field remains

#### Scenario: Revision by a non-author rejected
- **WHEN** a user who is not the author calls the reconcile RPC against that author's batch
- **THEN** the function raises a named authorization error

### Requirement: An author has at most one open proposal per tour

While an author holds pending suggestions on a tour, the tour surface SHALL offer them the
route into their existing proposal and SHALL NOT offer a route that starts a fresh one:
starting a second batch reconciles against the same pending rows and would silently replace
every field they already proposed. The route to propose anew SHALL reappear once the owner
has resolved their proposal.

#### Scenario: Suggest entry hidden while a proposal is open
- **WHEN** a partner with pending suggestions opens the friend's tour
- **THEN** only the "your proposal" action is offered, and no action that would begin a new batch

#### Scenario: Proposing again is offered once resolved
- **WHEN** the owner has accepted or declined every row of the partner's batch
- **THEN** the partner is offered the suggest action again, and using it creates a new batch

### Requirement: Acceptance applies inside the definer RPC and stamps the tour

Accepting a suggestion SHALL apply the change with a targeted update to `tours` inside a
SECURITY DEFINER RPC (`accept_tour_suggestion` / `accept_tour_suggestion_batch`) that
carries its own explicit owner gate. The internal helper that performs the column write
(`fn_apply_tour_suggestion`) SHALL NOT be executable by clients — otherwise a partner could
apply their own suggestion without the owner. The tour's `updated_at` SHALL advance so the
offline last-write-wins baseline stays coherent, and friend viewers SHALL be signalled to
refetch. The tour SHALL be unchanged until acceptance. Accepting SHALL NOT alter the tour's
partner set, visibility or completion.

#### Scenario: Partner cannot self-apply
- **WHEN** a partner calls the apply helper directly for their own pending suggestion
- **THEN** the call is rejected for lack of privilege and the tour is unchanged

#### Scenario: Accept stamps updated_at
- **WHEN** the owner accepts a suggestion
- **THEN** the tour's `updated_at` advances

#### Scenario: Declined suggestion leaves the tour untouched
- **WHEN** the owner declines a suggestion
- **THEN** no column of the tour changes and `updated_at` does not advance

#### Scenario: A queued offline edit does not revert an accepted suggestion
- **WHEN** an offline edit queued before the acceptance replays afterwards
- **THEN** the last-write-wins comparison against the advanced `updated_at` prevents it from silently reverting the accepted value

#### Scenario: Friend viewers are signalled on acceptance
- **WHEN** the owner accepts a suggestion on a friends-visible tour
- **THEN** the owner's friends receive the friend-tour refetch broadcast, exactly as for a direct owner edit

#### Scenario: Acceptance leaves the partner set intact
- **WHEN** the owner accepts any suggestion
- **THEN** the tour's partner rows, visibility and completion are unchanged

#### Scenario: Batch acceptance stamps once
- **WHEN** the owner accepts a batch of four suggestions
- **THEN** the tour is updated in one transaction with a single `updated_at` advance

### Requirement: Accepting a field auto-declines competing suggestions

When a suggestion is accepted, every other `pending` suggestion on the same tour with the
same `(field, target_id)` SHALL be resolved `declined` in the same transaction, regardless
of author, and their authors SHALL be notified. Concurrent `attachment_add` suggestions
SHALL NOT cancel each other.

#### Scenario: Two partners suggest the same field
- **WHEN** the owner accepts partner B's `description` suggestion while partner C also has one pending
- **THEN** C's row is resolved `declined` in the same transaction and C is notified

#### Scenario: Two added attachments coexist
- **WHEN** two partners each suggest adding a different photo and the owner accepts one
- **THEN** the other remains `pending`

### Requirement: Suggestion writes are online-only; reads are cached

Creating, revising, accepting, declining and withdrawing suggestions SHALL require
connectivity and SHALL be gated on the online signal. These actions SHALL NOT be enqueued
to the offline write queue. Suggestion **reads** SHALL hydrate from the offline data cache
and refetch when online, so an offline viewer sees the last known state rather than an
empty one.

#### Scenario: Suggest attempted offline
- **WHEN** a partner submits suggestions while offline
- **THEN** the action is blocked with a user-visible offline message and nothing is queued

#### Scenario: Accept attempted offline
- **WHEN** the owner taps accept while offline
- **THEN** the action is blocked with a user-visible offline message and the row stays `pending`

#### Scenario: Offline owner still sees a pending count
- **WHEN** the owner opens a tour offline that had pending suggestions at last sync
- **THEN** the pending indicator reflects the cached rows rather than showing none

### Requirement: Suggester composes in the tour form

A partner SHALL compose suggestions in the existing tour form opened in suggest mode,
seeded with the tour's current values. On submit the system SHALL diff the edited state
against the seed and create one row per changed logical field, all sharing one `batch_id`.
Fields that were not changed SHALL produce no row. The visibility and completion controls
SHALL be hidden in suggest mode, and the submit action SHALL be labelled as suggesting
rather than saving.

#### Scenario: Unchanged fields produce no rows
- **WHEN** a partner opens suggest mode, changes only the equipment, and submits
- **THEN** exactly one `equipment` row is created

#### Scenario: Submitting an unchanged form is a no-op
- **WHEN** a partner submits suggest mode without editing anything
- **THEN** no rows are created and the user is told there is nothing to suggest

#### Scenario: Owner-only controls hidden
- **WHEN** the form is opened in suggest mode
- **THEN** the visibility and completion controls are not rendered

### Requirement: One review sheet, two modes

The system SHALL present pending suggestions for a tour in a dedicated review sheet,
grouped by batch and showing the author, with each row rendering the original value beside
the suggested value. For the tour **owner** the sheet SHALL offer accept and decline per
row plus an accept-all action per batch. For the **author** the same sheet SHALL offer
withdraw per row and a route back into suggest mode to revise, and SHALL NOT offer accept
or decline.

Pending suggestions on an owned tour SHALL be indicated both in the tour info surface and
on the tour's row in the tour list view. There SHALL be no map affordance and no
cross-tour suggestions inbox.

#### Scenario: Pending suggestions surfaced on the tour
- **WHEN** the owner opens a tour carrying pending suggestions
- **THEN** an indicator shows the pending count and opens the review sheet

#### Scenario: Pending suggestions surfaced in the list
- **WHEN** the owner views the tour list with a tour carrying pending suggestions
- **THEN** that row shows a pending indicator

#### Scenario: Author sheet offers withdraw, not accept
- **WHEN** the author opens the sheet on a tour they suggested on
- **THEN** their pending rows render against the current originals with withdraw and revise actions, and no accept or decline action is present

#### Scenario: Review sheet groups by batch
- **WHEN** two partners have each submitted a batch on the same tour
- **THEN** the sheet shows two groups, each labelled with its author, each with its own accept-all

#### Scenario: Values render as the user's own words, never as storage or enum tokens
- **WHEN** a row carries an enumerated field, a proposed GPX track, or an attachment removal
- **THEN** enumerated values render with their localized display names, a GPX renders as a generic description of the operation rather than any file name or storage key, and a removal names the targeted attachment by the filename its owner uploaded

#### Scenario: Resolved row leaves the pending list
- **WHEN** the owner resolves the last pending suggestion
- **THEN** the review sheet reports an empty state and the tour indicator disappears

### Requirement: Resolved suggestions are retained as history

Resolved suggestion rows SHALL be retained indefinitely with their status, `resolved_at`
and author. The system SHALL provide a per-tour history view listing resolved suggestions
with what was proposed, who proposed it, and how it was resolved. The history SHALL be
visible to the tour owner and, for their own suggestions, to each author.

#### Scenario: Declined suggestion remains inspectable
- **WHEN** the owner opens the history view after declining a suggestion
- **THEN** the declined entry is listed with its proposed value, author and resolution time

#### Scenario: Author sees the outcome of their own suggestion
- **WHEN** the author opens the history for a tour they suggested on
- **THEN** their resolved suggestions are listed and other authors' are not

### Requirement: Suggestion state reacts to Realtime changes

The suggestion store SHALL load all rows where the viewer is either the tour owner or the
author in a single query — the same predicate as the read policy — and derive per-tour
pending counts from it, rather than fetching per tour. It SHALL subscribe to
`tour_suggestion` through the shared realtime subscription primitive, with user-scoped
filters on `owner_id` and on `suggester_id`, and SHALL provide an `onSubscribed` callback
performing a full refetch so state is consistent after a channel is re-created following a
hidden tab.

#### Scenario: Owner sees an incoming suggestion without reloading
- **WHEN** a partner submits a batch while the owner has the tour open
- **THEN** the owner's pending indicator and review sheet update without a manual reload

#### Scenario: State reconciles after the tab was hidden
- **WHEN** suggestions are created and resolved while the owner's tab is hidden and it becomes visible again
- **THEN** the re-subscribe triggers a full refetch and the displayed state matches the server

### Requirement: Activity suggestions carry the legs

An activity suggestion on a split tour SHALL carry the legs, and accepting it SHALL set them. A
suggestion without legs SHALL keep the tour's legs only while they still match its activities.

#### Scenario: A friend suggests flying down

- **WHEN** a partner suggests hiking up and paragliding down for a hiking tour and the owner accepts
- **THEN** the tour SHALL have hiking up and paragliding down

### Requirement: Grade and start time are suggestable

A partner SHALL be able to suggest a grade (logical field `grade`) and a start time as part of
the `dates` field (`startTime`: the time, `null` to remove the owner's, absent when untouched).
Accepting SHALL write them; a `dates` value without `startTime` SHALL keep the tour's time. A
grade or start-time change SHALL notify partners like any meaningful change.

#### Scenario: Suggesting a grade

- **WHEN** a partner changes the grade from "WS" to "ZS" in the suggest form and sends it
- **THEN** one `grade` suggestion SHALL be created with the new value and the owner SHALL see it in the review sheet

#### Scenario: A pending date suggestion from before start times

- **WHEN** a `dates` suggestion created before start times existed is reviewed on a tour without a start time
- **THEN** it SHALL not be marked stale

#### Scenario: The owner set a time after the suggestion

- **WHEN** a `dates` suggestion without a start time is accepted on a tour that has one
- **THEN** the tour SHALL keep its start time
