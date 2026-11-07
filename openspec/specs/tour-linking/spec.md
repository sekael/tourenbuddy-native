# tour-linking Specification

## Purpose
Durable, two-sided link handshakes for same-objective tour collaboration among friends, with UI affordances to manage links and notifications for link-group lifecycle events.

## Requirements

### Requirement: Tour link group membership
The system SHALL allow two or more tours to belong to a shared `tour_link_group` representing a collaborative same-objective relationship. Each tour SHALL belong to at most one group at a time. Group membership SHALL be created only by an explicit link-request handshake initiated by one tour's owner and accepted by the counterparty, and SHALL NOT be inferred automatically from collision detection. A link request is valid only when at most one of the two referenced tours is already a member of a multi-tour group; merging two pre-existing multi-tour groups is forbidden.

#### Scenario: Two ungrouped tours linked
- **WHEN** A's ungrouped tour requests a link with B's ungrouped tour and B accepts
- **THEN** a new `tour_link_group` is created and both tours are added as members

#### Scenario: A third tour joins an existing group (one-member-accept)
- **WHEN** C's ungrouped tour requests a link with A's tour, which is already in a group containing A and B, and A accepts the request
- **THEN** C's tour is added to the existing group; B is not asked to re-confirm; B's tour and C's tour are now linked through the shared group

#### Scenario: Two pre-existing groups cannot merge
- **WHEN** a link request would join a tour from group G1 with a tour from a different group G2 (each group already has more than one member)
- **THEN** the request is rejected with a named error and both groups are preserved unchanged

#### Scenario: A tour cannot belong to two groups
- **WHEN** any operation would result in the same tour appearing in two different `tour_link_group` rows
- **THEN** the database `unique(tour_id)` constraint on `tour_link_member` rejects the operation

### Requirement: Link request handshake
The system SHALL implement a two-sided link handshake via a `tour_link_request` row with status in `{pending, accepted, declined, withdrawn}`. The initiator's tour and the target's tour SHALL both be referenced. Mutations on `tour_link_request` SHALL be performed exclusively through SECURITY DEFINER SQL functions — `create_link_request`, `accept_link_request`, `decline_link_request`, `withdraw_link_request` — each of which authorizes the caller per the rules below and re-validates the collision predicate and group-merge rule before applying writes. Direct `INSERT`/`UPDATE` on `tour_link_request` and `tour_link_member` from the client SHALL be blocked by RLS. Only the initiator MAY withdraw a pending request; only the target's owner MAY accept or decline it. A partial unique index SHALL prevent more than one pending request between the same ordered pair of tours.

#### Scenario: Initiator creates a pending request
- **WHEN** the initiator's owner posts a link request from their tour to a colliding friend tour
- **THEN** a `tour_link_request` row is inserted with status `pending`

#### Scenario: Target accepts the request
- **WHEN** the target's owner accepts the pending request
- **THEN** the row's status moves to `accepted`, `resolved_at` is set, and the two tours are added to the resolved group per the membership rules

#### Scenario: Target declines the request
- **WHEN** the target's owner declines the pending request
- **THEN** the row's status moves to `declined`, `resolved_at` is set, and no group membership change occurs

#### Scenario: Initiator withdraws the request
- **WHEN** the initiator's owner withdraws their still-pending request
- **THEN** the row's status moves to `withdrawn`, `resolved_at` is set, and no group membership change occurs

#### Scenario: Duplicate pending request rejected
- **WHEN** a second pending request is attempted with the same `(initiator_tour_id, target_tour_id)` while another is still pending
- **THEN** the database unique constraint rejects the insert

#### Scenario: Declined or withdrawn request can be re-created
- **WHEN** a previous request between the same pair was declined or withdrawn and the initiator posts a new request
- **THEN** the new pending row is accepted (the unique constraint is scoped to status `pending` only)

#### Scenario: Create rejected when collision does not currently hold
- **WHEN** the initiator calls `create_link_request` against a target tour that does not satisfy the collision predicate (distance, type, visibility, or friendship)
- **THEN** the function raises a named error and no row is inserted

#### Scenario: Pending request auto-resolved when collision evaporates
- **WHEN** a tour update or friendship deletion would invalidate the collision predicate for a still-pending request
- **THEN** an `AFTER` trigger moves that request to status `withdrawn` with `resolved_at = now()` so users do not see banners for unresolvable handshakes

### Requirement: Link group invariants enforced by triggers
The database SHALL maintain the invariant that all pairs of distinct owners in a `tour_link_group` are mutual accepted friends and that every member tour has `visibility = 'friends'`, shares at least one activity type with every other member, and has its goal within 200 m of every other member. The system SHALL evict any tour that violates the invariant from its group via DB triggers.

#### Scenario: Goal moved outside the radius
- **WHEN** a member tour's goal is updated such that it is more than 200 m from any other member tour's goal
- **THEN** the moved tour is removed from the group

#### Scenario: Tour type changed
- **WHEN** a member tour's activity types are updated so that it no longer shares a type with some other member
- **THEN** the changed tour is removed from the group

#### Scenario: Activity added to a linked tour
- **WHEN** a member tour of type `hiking` linked with another `hiking` tour gains `skitour` as a second type
- **THEN** the tour stays in the group

#### Scenario: Visibility flipped away from friends
- **WHEN** a member tour's `visibility` is changed from `friends` to `private`
- **THEN** the tour is removed from the group

#### Scenario: Friendship between two member owners ends
- **WHEN** the `friendships` row between owners X and Y is deleted (the table is binary; deletion is the only break path) and both have tours in the same group
- **THEN** both X's and Y's tours are removed from that group; tours owned by other still-friends members remain in place

#### Scenario: 3-way group dies on a single friendship break
- **WHEN** {A, B, C} are linked in one group and the A↔B friendship row is deleted
- **THEN** A's and B's tours are both evicted, leaving only C's tour in the group, which then dissolves (count drops below 2)

### Requirement: Group dissolution when member count drops below 2
The system SHALL delete a `tour_link_group` whenever, after any eviction or cascade, its membership count is less than 2.

#### Scenario: Eviction leaves only one tour
- **WHEN** an eviction or `ON DELETE` cascade leaves a group with exactly one remaining member tour
- **THEN** the group row and its remaining membership row are deleted

#### Scenario: Eviction leaves a still-valid pair
- **WHEN** an eviction in a 3-member group removes one tour and leaves two tours whose owners are still mutual friends and whose tours still satisfy the invariant
- **THEN** the group persists with those two members

### Requirement: Tour save fires collision-detected notification
After the owner creates or meaningfully updates a friends-visible tour — whether or not it has partners — the system SHALL, in the same transaction, scan for friend-owned tours satisfying the collision predicate and emit a `tour_interest` notification to each colliding owner. Push/email delivery SHALL be best-effort: failures SHALL NOT block or roll back the tour write.

#### Scenario: New tour collides with a friend tour
- **WHEN** owner A saves a tour whose goal is within 200 m, sharing at least one activity type, and with friends-visibility matching a friend B's tour also at friends-visibility
- **THEN** a `tour_interest` notification naming A as the friend who planned the same tour is emitted for B

#### Scenario: Solo tour without partners
- **WHEN** owner A creates a friends-visible tour with no partners that collides with friend B's tour
- **THEN** a `tour_interest` notification is emitted for B

#### Scenario: Owner muted the type
- **WHEN** B has `tour_interest` in `notif_muted_types`
- **THEN** no push or email is sent to B even though the scan finds the collision; B's inbox still records it

#### Scenario: No collision found
- **WHEN** the saved tour has no friend-owned collisions
- **THEN** no notification is emitted

#### Scenario: Worker dispatch failure does not fail the save
- **WHEN** push/email delivery for the emitted event fails
- **THEN** the tour write still succeeds and the failure is logged server-side

### Requirement: Friendship-accept backfill scan and digest
When a friendship transitions to accepted, the system SHALL scan the two users' tours for collisions matching the collision predicate and SHALL send one batched digest notification per side listing those collisions for review. The digest SHALL be dispatched under the `tour_interest` notification type, honor the recipient's preferences, and exclude any pair already in the same group or with a pending request between them.

#### Scenario: Multiple collisions on accept
- **WHEN** users X and Y become friends and X has 3 tours colliding with Y's tours
- **THEN** a single digest notification is dispatched to X (and a single one to Y) describing all relevant collisions, not 3 separate notifications

#### Scenario: No collisions on accept
- **WHEN** X and Y become friends and no collisions match the predicate
- **THEN** no digest notification is dispatched

#### Scenario: Already-linked pairs excluded
- **WHEN** a pair of X's and Y's tours is already in the same `tour_link_group`
- **THEN** that pair is excluded from the digest

#### Scenario: Pending request pairs excluded
- **WHEN** a pair of X's and Y's tours already has a pending `tour_link_request` in either direction
- **THEN** that pair is excluded from the digest

### Requirement: Group-membership-change notifications
When the membership of a `tour_link_group` changes, the system SHALL emit `tour_interest`-typed notifications in the same transaction as the membership change, including changes caused by cascades (tour edits, friendship removal), so participants stay informed. Push/email delivery SHALL honor each recipient's push registrations, `notif_email_enabled`, and `notif_muted_types`. Failures SHALL NOT block the underlying DB write.

#### Scenario: New member joins — other members notified
- **WHEN** a link request is accepted and a tour joins a group (new or existing)
- **THEN** every owner of a tour in the group except the acceptor receives one `tour_interest` `group_joined` notification naming their own tour in the group; the acceptor (the actor) is not notified

#### Scenario: External eviction — evicted user and remaining members notified
- **WHEN** A's tour is evicted from a group because of a sibling member's edit, a friendship deletion involving A, or another non-self event, and at least two tours remain
- **THEN** every member owner, the evicted one included and the actor excluded, receives one `group_evicted_external` notification naming their own tour in the group

#### Scenario: Self-eviction via own confirmed edit — only remaining members notified
- **WHEN** A confirms an edit-warning dialog that evicts A's own tour from a group
- **THEN** the remaining group members each receive a notification; A is not self-notified

#### Scenario: Dissolution — members notified
- **WHEN** an eviction or cascade drops a group's member count below 2
- **THEN** every member owner of the group before the change, except the actor, receives one `group_dissolved` notification (emitted before the member rows are deleted)

#### Scenario: Recipients resolved after cascade
- **WHEN** a friendship deletion cascades eviction and dissolution in one transaction
- **THEN** each affected member is notified once with the tour name as it was before the cascade

### Requirement: Link request notification
When a link request is created, the system SHALL notify the target tour's owner of the pending request under the `tour_interest` notification type (`link_created`). When a request is declined, the system SHALL notify the initiator's owner (`link_declined`). An accept is announced by the `group_joined` notification above rather than a separate `link_accepted`. Withdrawals SHALL NOT emit a notification. Failures SHALL NOT block the underlying DB write.

#### Scenario: Target notified of new request
- **WHEN** A creates a pending link request to B's tour
- **THEN** B receives a `tour_interest` notification naming A and identifying the colliding tour

#### Scenario: Initiator notified of acceptance
- **WHEN** B accepts the pending request
- **THEN** A receives the `group_joined` notification for the resulting group, and no separate acceptance notification

#### Scenario: Initiator notified of decline
- **WHEN** B declines the pending request
- **THEN** A receives a `tour_interest` notification stating the request was declined

### Requirement: Linked-with pills on tour info sheets
The tour info sheet SHALL render a "Linked with" section whose header carries the label and whose body contains one bare-name pill per other member tour in the same group. Each pill SHALL show only the linked owner's display name (the section header carries the "Linked with" framing). Tapping a pill SHALL open that friend tour's info sheet via the existing tour-detail navigation (no separate route). When the group has more than three other members, the section SHALL render the first two pills inline and collapse the rest into a "+N more" affordance; tapping "+N more" SHALL open a list of all linked friends — as a dialog on desktop and a bottom sheet on mobile — from which each entry navigates to the corresponding tour info sheet. Pills SHALL be visible to every owner whose tour is in the group, on both the owner's own sheet and any partner's sheet that can see the tour.

#### Scenario: Two-tour group
- **WHEN** A views their own tour linked with B's tour
- **THEN** the sheet shows a "Linked with" section containing a single pill labelled with B's display name; tapping it opens B's tour sheet

#### Scenario: Three-tour group
- **WHEN** A views their own tour linked with B's and C's tours
- **THEN** the sheet shows two name pills inline under the "Linked with" header, no "+N more" affordance

#### Scenario: Group with more than three other members
- **WHEN** A views their own tour linked with four or more friend tours
- **THEN** the sheet shows the first two name pills inline plus a "+N more" pill; tapping "+N more" opens a desktop dialog (or mobile bottom sheet) listing every linked friend with navigation to each tour

### Requirement: Collision notice and request action on tour info sheets
When a tour info sheet is opened and the underlying tour has at least one not-yet-linked colliding friend tour, the sheet SHALL display an information notice naming the colliding friend(s) and SHALL present a "Request to link" action per colliding tour visible to the viewing owner. The notice SHALL be suppressed for tours that are already in a group with every colliding counterpart.

#### Scenario: Colliding friend tour exists, no link yet
- **WHEN** A's tour collides with B's tour and no group includes both
- **THEN** A's info sheet shows a notice naming B and a "Request to link" button targeting B's tour

#### Scenario: Already linked with every collider
- **WHEN** every friend tour colliding with A's tour is already in the same group as A's tour
- **THEN** A's info sheet shows no collision notice (the linked-with pills cover the same surface)

### Requirement: Link request banner with accept / decline / withdraw
Tour info sheets SHALL display a link-request banner whenever there is a pending request involving the viewed tour. For requests targeting the viewed tour's owner the banner SHALL expose Accept and Decline actions; for requests initiated by the viewed tour's owner the banner SHALL expose a Withdraw action.

#### Scenario: Pending incoming request
- **WHEN** B opens their tour and there is a pending request from A's tour to B's tour
- **THEN** B sees a banner naming A with Accept and Decline buttons

#### Scenario: Pending outgoing request
- **WHEN** A opens their tour and there is a pending request from A's tour to B's tour
- **THEN** A sees a banner naming B with a Withdraw button

### Requirement: Edit-warning dialog before eviction-causing or pending-request-invalidating edits
The client SHALL display a confirmation dialog before saving an edit that would EITHER (a) cause eviction from a `tour_link_group` — changing the goal beyond the 200 m boundary from any sibling, changing the activity types so that the tour no longer shares one with some sibling, or changing visibility from `friends` to `private` — OR (b) invalidate the collision predicate for any `pending` `tour_link_request` involving the edited tour as initiator or target (goal moved >200 m from the counterpart tour's goal, no activity type left in common, visibility flips away from `friends`). The dialog SHALL follow the same design language as the existing friendship/contact delete dialog and SHALL adapt its title and body copy by mode: (1) `linked` when the tour is grouped → "this tour will be unlinked"; (2) `pending-outgoing` when only the user's own initiated pending request(s) are affected → "your pending link request(s) will be cancelled" (explicit ownership); (3) `pending-incoming` when only requests initiated by other users targeting this tour are affected → "there are outstanding link requests for this tour; applying these changes will withdraw them" (no implication the user sent any request); (4) `pending-mixed` when both directions are affected → reuse the `pending-incoming` copy with the combined count. Cancellation SHALL abort the edit; confirmation SHALL proceed with the edit, the DB trigger SHALL perform the eviction (if grouped), and the DB trigger SHALL set affected pending requests to `withdrawn` (regardless of grouping). Trigger-driven withdrawal SHALL NOT dispatch notifications, mirroring the manual-withdraw policy.

#### Scenario: Goal nudge across the boundary
- **WHEN** A edits a linked tour's goal to a location more than 200 m from a sibling member's goal
- **THEN** the client shows the eviction-warning dialog before submitting the edit

#### Scenario: Type change on a linked tour
- **WHEN** A changes the activity types of a linked tour so that it no longer shares a type with a sibling
- **THEN** the client shows the eviction-warning dialog before submitting

#### Scenario: Visibility flip to private on a linked tour
- **WHEN** A switches a linked tour to private
- **THEN** the client shows the eviction-warning dialog before submitting

#### Scenario: Edit that does not affect linking
- **WHEN** A edits the description of a linked tour
- **THEN** no eviction warning is shown and the edit proceeds normally

#### Scenario: Goal moved >200 m while a pending outgoing request exists (not yet grouped)
- **WHEN** A has an outgoing `pending` `tour_link_request` from A's tour to B's tour, A's tour is not in any group, and A edits the goal to a location more than 200 m from B's tour goal
- **THEN** the client shows the warning dialog with pending-request copy; on confirm, the edit saves and the DB trigger sets the pending request to `withdrawn`
- **AND** if B subsequently attempts to accept, the request is no longer `pending` and the accept UI no longer offers it (preventing `predicate_failed`)

#### Scenario: Tour-type change with pending incoming request
- **WHEN** A has an incoming `pending` request on A's tour from B's tour (A did not initiate any request), and A changes A's tour activity types so that none is left in common with B's tour
- **THEN** the client shows the warning dialog in `pending-incoming` mode with copy framed around "outstanding link requests for this tour" — explicitly NOT implying A sent any request — and on confirm, the edit saves and the DB trigger sets the pending request to `withdrawn`

#### Scenario: Outgoing pending request shows ownership in copy
- **WHEN** A has an outgoing `pending` request from A's tour to B's tour and A's edit would break the predicate
- **THEN** the warning dialog renders in `pending-outgoing` mode with copy that explicitly names the request as A's own ("your pending link request(s) you sent")

#### Scenario: Mixed incoming and outgoing pending
- **WHEN** A's tour is both initiator of one pending request and target of another, and A's edit would break both
- **THEN** the dialog renders in `pending-mixed` mode using the incoming-style copy with the combined count (avoids overclaiming ownership)

#### Scenario: Trigger-driven auto-withdrawal is silent
- **WHEN** the DB trigger sets a pending request to `withdrawn` because an edit broke the collision predicate
- **THEN** no notification is dispatched to either side (matching the manual-withdraw policy)

### Requirement: Friend-profile collisions entry-point
The friend profile page SHALL display a "Collisions ([N])" entry whenever the friendship has one or more not-yet-linked, no-pending-request collisions matching the predicate. Tapping the entry SHALL open the backfill-collisions list page filtered to that friendship. The entry SHALL be visible regardless of the user's `tour_interest` mute preference, so users who muted the digest still have an in-app discovery path.

#### Scenario: Friendship has eligible collisions
- **WHEN** the friend profile is opened and the scan returns N ≥ 1 eligible collisions for that friendship
- **THEN** a "Collisions ([N])" row is rendered on the profile and tapping it opens the backfill page filtered to this friendship

#### Scenario: No eligible collisions
- **WHEN** the scan returns zero eligible collisions
- **THEN** the entry is hidden

#### Scenario: Muted user retains discovery path
- **WHEN** the viewing user has `tour_interest` in `notif_muted_types`
- **THEN** the entry remains visible (the mute affects notifications only, not in-app surfaces)

### Requirement: Map-marker chain overlay for linked tours
A map marker rendered for a tour whose row appears in `tour_link_member` SHALL display a small chain/link icon overlay distinguishing it from non-linked markers. The existing owned-over-friend collision-suppression precedence SHALL be preserved unchanged — only the visual decoration is added; clustering, layering, and tap behavior are not modified.

#### Scenario: Linked owned tour
- **WHEN** the rendered marker corresponds to an owned tour that is in a link group
- **THEN** the marker is decorated with the chain/link overlay

#### Scenario: Linked friend tour rendered alone
- **WHEN** the rendered marker corresponds to a friend's tour that is in a link group and no owned tour collides with it at the same goal
- **THEN** the marker is decorated with the chain/link overlay

#### Scenario: Non-linked tour
- **WHEN** the rendered marker corresponds to a tour with no `tour_link_member` row
- **THEN** no chain/link overlay is rendered

### Requirement: Delete-tour confirmation copy for linked tours
The existing delete-tour confirmation dialog SHALL display an additional line of copy whenever the target tour belongs to a `tour_link_group`: "This tour is linked with [N] friend tour(s). Deleting will unlink them." The dialog flow is otherwise unchanged.

#### Scenario: Deleting a linked tour
- **WHEN** the user opens the delete-tour confirmation for a tour that is in a group with two other member tours
- **THEN** the dialog includes the line "This tour is linked with 2 friend tour(s). Deleting will unlink them."

#### Scenario: Deleting an unlinked tour
- **WHEN** the user opens the delete-tour confirmation for a tour with no `tour_link_member` row
- **THEN** the dialog shows the standard delete confirmation with no link-related copy

### Requirement: Backfill collisions list page
The application SHALL provide a list page reachable from the friendship-accept digest notification that enumerates colliding tour pairs for the friendship's two users, one row per pair, each with a "Request to link" action. The same page SHALL also be reachable from an in-app entry point on the My Tours Friends tab, in which case it enumerates pairs across ALL of the viewer's accepted friendships (each row labeled with the friend's name). Rows already linked or with a pending request SHALL be excluded in both modes.

#### Scenario: Digest opens the list
- **WHEN** the recipient taps the friendship-backfill digest notification
- **THEN** the app opens the backfill collisions page filtered to that friendship's pairs

#### Scenario: Per-row link request
- **WHEN** the user taps "Request to link" on a row
- **THEN** a `tour_link_request` is created with the user's tour as initiator and the friend's tour as target, the row disappears from the list, and the friend is notified

#### Scenario: In-app entry from the Friends tab opens all-friendships mode
- **WHEN** the user opens the My Tours list, switches to the Friends tab, and taps the "View backfill collisions" action
- **THEN** the backfill page opens in the same surface (bottom sheet on mobile, side drawer on desktop) in all-friendships mode, listing deduplicated pairs across every accepted friendship
- **AND** each row includes the friend's display name

#### Scenario: Back from in-app backfill restores Friends tab
- **WHEN** the user taps Back inside the in-app backfill view
- **THEN** the backfill view closes and the My Tours list is restored on the Friends tab with prior search/filter state preserved

### Requirement: My Tours active tab persisted across sessions
The application SHALL persist the active tab of the My Tours list (`owned` | `friends`) to client-side storage so that reopening the app restores the tab the user last used. Persistence SHALL be resilient to invalid stored values (falling back to `owned`) and to storage unavailable errors (no crash).

#### Scenario: Tab survives reload
- **WHEN** the user selects the Friends tab and reloads the app (or relaunches the PWA)
- **THEN** the My Tours list opens on the Friends tab

#### Scenario: Invalid stored value
- **WHEN** the stored tab value is missing or not a member of the `TourTab` union
- **THEN** the My Tours list opens on `owned`

#### Scenario: Storage unavailable
- **WHEN** localStorage access throws (e.g. Safari private mode)
- **THEN** the app does not crash; the tab behaves as in-memory-only with default `owned`

### Requirement: RLS scoping for link tables
The database SHALL enforce row-level security on `tour_link_group`, `tour_link_member`, and `tour_link_request` such that a user MAY read or write rows only when they own at least one tour referenced (directly or transitively via membership) on the row.

#### Scenario: Owner reads own group
- **WHEN** A queries `tour_link_member` for a group containing A's tour
- **THEN** the row is returned

#### Scenario: Non-member cannot read
- **WHEN** D, who owns no tour in a group, queries `tour_link_member` for that group
- **THEN** RLS returns no rows

#### Scenario: Initiator can withdraw, target can respond
- **WHEN** A updates a `tour_link_request` row whose `initiator_tour_id` is owned by A, setting status to `withdrawn`
- **THEN** the update is accepted; if A attempts to set status to `accepted` on a row where A is not the target owner, the update is rejected

### Requirement: Friends are named by the viewer's contact name

Every tour-linking surface that names another user SHALL use the name under which the
viewer has saved that user in their own contacts: the collision notice, the linked-with
pills, the link-request banner, and the backfill collisions page. Everyone named on these
surfaces is a confirmed friend of the viewer and therefore resolves to a contact. Where no
contact resolves, a generic "a friend" fallback SHALL be shown; a user's own profile name
SHALL NOT be used as a fallback on these surfaces, and a tour-related string SHALL NEVER be
used as a person's name.

#### Scenario: Collision notice names a friend by contact name

- **WHEN** a collision notice lists a candidate whom the viewer has saved under a different
  name than that user's profile name
- **THEN** the contact name is shown

#### Scenario: No "Unnamed tour" as a person's name

- **WHEN** a candidate's name cannot be resolved on the collision notice
- **THEN** the generic "a friend" fallback is shown, and the tour-naming string
  "Unnamed tour" is never rendered as that person's name

#### Scenario: List surfaces resolve in one batch

- **WHEN** a surface names several users at once — collision candidates, linked tours, or
  backfill pairs
- **THEN** their names are resolved with a single batched lookup rather than one per user
