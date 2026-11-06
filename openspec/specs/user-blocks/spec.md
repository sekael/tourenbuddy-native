## Purpose

Block another user to prevent friend requests, messages, and discovery between the two accounts.

## Requirements

### Requirement: Users can block any other user persistently

The system SHALL allow an authenticated user (the blocker) to record a block against any other user (the blocked) via the `block_user(target uuid)` RPC, regardless of current relationship state (stranger, pending request, or existing friend). Blocks SHALL be persisted in `public.user_blocks` and propagate across the blocker's devices. Each `(blocker, blocked)` pair has at most one row whose PK never changes. The row carries three timestamps: `first_blocked_at` (immutable, set on first block), `last_blocked_at` (refreshed on each re-block), and `unblocked_at` (set on unblock, NULL while active).

#### Scenario: First block recorded server-side
- **WHEN** user A invokes `block_user(B)` and no prior row exists for `(A, B)`
- **THEN** a row `(blocker_user_id = A, blocked_user_id = B, first_blocked_at = now(), last_blocked_at = now(), unblocked_at = NULL)` exists in `public.user_blocks`

#### Scenario: block_user requires phone-verified caller
- **WHEN** an unverified user invokes `block_user(B)`
- **THEN** the RPC raises an error (consistent with friend-request gating); nothing is inserted

#### Scenario: unblock_user does NOT require phone-verified
- **WHEN** a user whose phone is no longer verified (e.g. invoked `delete_own_phone()` after blocking) invokes `unblock_user(B)` and cooldown has elapsed
- **THEN** the unblock succeeds — phone verification is not a precondition for clearing existing blocks

#### Scenario: Block visible on another device
- **WHEN** user A has the app open on device 1 after blocking user B on device 2
- **THEN** A's Blocked tab on device 1 lists user B without a manual reload

#### Scenario: Blocking self rejected
- **WHEN** any client attempts `block_user(auth.uid())` or any insert where `blocker_user_id = blocked_user_id`
- **THEN** the operation is rejected (CHECK constraint at table level)

#### Scenario: Re-block of previously unblocked target updates same row
- **WHEN** user A blocks user B, unblocks, then blocks again (after cooldown elapsed)
- **THEN** the same row is UPDATEd in place: `unblocked_at = NULL`, `last_blocked_at = now()`, `first_blocked_at` preserved unchanged; no new row is inserted

### Requirement: Block enforces full social cut across all server-mediated surfaces

`block_user(target)` MUST in a single transaction perform every step of the social cut, and the database MUST reject server-mediated user-to-user operations between blocker and blocked while the block is active. The block surfaces affected are: friend requests, friendships, phone-based discovery, name lookup, and any future user-to-user RPC.

#### Scenario: Atomic cascade on block
- **WHEN** user A invokes `block_user(B)` while a `friendships(A, B)` row exists and pending `friend_requests` exist in either direction
- **THEN** in one transaction: the `friendships` row is deleted, pending `friend_requests` with `from_user_id = A` become `'cancelled'`, pending `friend_requests` with `from_user_id = B` become `'denied'`, and `user_blocks(A, B)` is inserted

#### Scenario: Friend request INSERT from blocked sender rejected
- **WHEN** user A attempts to insert `friend_requests(from_user_id = A, to_user_id = B)` and `user_blocks(B, A)` is active
- **THEN** the database rejects the insert via RLS

#### Scenario: Discovery RPCs filter blocked-by rows
- **WHEN** user A calls any of `find_user_by_phone`, `find_users_by_phones`, `find_phones_by_user_ids`, `is_phone_registered`, `get_user_names_by_ids` with arguments that would otherwise return data identifying user B, and `user_blocks(B, A)` is active
- **THEN** the result set MUST NOT contain any row identifying B; for `is_phone_registered` specifically, the function returns `false` for B's phone

#### Scenario: Rollback on partial failure
- **WHEN** any step of the `block_user` cascade fails
- **THEN** no changes are persisted (neither the block row, nor the friendship deletion, nor the request termination)

### Requirement: Send-friend-request affordance hidden in both block directions

The system SHALL expose `is_blocked_by(target uuid) returns boolean` as a SECURITY DEFINER function returning true iff `(target, auth.uid())` is an active block. The function MUST NOT leak any other information. Clients SHALL hide the "send friend request" affordance toward target B whenever EITHER condition holds:
1. `is_blocked_by(B)` returns true (B blocked A — server-side cannot deliver the request anyway).
2. `B ∈ user-blocks-store.blockedUserIds` for caller A (A blocked B — sending to someone A blocked is nonsensical, and the discovery RPCs already hide B from A's lookups).

Condition 2 MUST be reactive: when A confirms a block from contact detail or any other surface, the affordance MUST disappear immediately on the current view without a remount or re-fetch.

#### Scenario: Affordance hidden when caller is blocked by target
- **WHEN** user A's UI evaluates a send-request affordance toward user B and `is_blocked_by(B)` returns true
- **THEN** the affordance is not rendered

#### Scenario: Affordance hidden when caller has blocked target
- **WHEN** user A's UI evaluates a send-request affordance toward user B and `B ∈ user-blocks-store.blockedUserIds`
- **THEN** the affordance is not rendered

#### Scenario: Affordance disappears immediately after caller blocks target
- **WHEN** user A confirms Block on user B from any surface (pending request, contact detail) and the `block_user(B)` RPC succeeds
- **THEN** any visible send-friend-request affordance toward B on the same view is removed reactively (no remount, no manual refresh)

#### Scenario: Affordance returns after unblock
- **WHEN** user A successfully invokes `unblock_user(B)` (cooldown elapsed) and `is_blocked_by(B)` returns false
- **THEN** the affordance renders again subject to existing friend-request rules

#### Scenario: Affordance visible when not blocked
- **WHEN** `is_blocked_by(B)` returns false and `B ∉ blockedUserIds`
- **THEN** the affordance renders subject to existing friend-request rules

#### Scenario: RPC leaks nothing beyond the queried pair
- **WHEN** user A calls `is_blocked_by(X)` for any X
- **THEN** the function returns only a boolean about the `(X, A)` pair and exposes no other rows or metadata

### Requirement: Unblock cooldown of 48 hours

The system SHALL enforce a 48-hour cooldown on unblock after every block: user A MUST NOT be able to unblock user B until 48 hours after the latest `last_blocked_at`. Re-block has NO cooldown — A may block B again immediately after any prior unblock.

Enforcement of the unblock cooldown lives in the `unblock_user` RPC (raise on violation). The row retains its timestamps through unblock so cooldown is queryable.

#### Scenario: Unblock allowed after 48h since latest block
- **WHEN** user A invokes `unblock_user(B)` and the active `user_blocks(A, B)` row has `last_blocked_at` more than 48 hours ago
- **THEN** the RPC sets `unblocked_at = now()`; the row is retained; B no longer appears as blocked

#### Scenario: Unblock rejected within 48h of latest block
- **WHEN** user A invokes `unblock_user(B)` and the active `user_blocks(A, B)` row has `last_blocked_at` less than 48 hours ago
- **THEN** the RPC raises an error including the remaining wait time (the client surfaces this as a localized notice)

#### Scenario: Re-block has no cooldown
- **WHEN** user A invokes `block_user(B)` and any prior unblocked `user_blocks(A, B)` row exists with any `unblocked_at`
- **THEN** the block succeeds (cascade as in the full-social-cut requirement); no wait time enforced on the re-block direction

### Requirement: Block confirmation dialog discloses unblock cooldown

Every Block confirmation dialog MUST display a localized notice that unblocking the user will only be possible after a 48-hour cooldown. The notice MUST be present on every Block entry point (pending request, existing friend, contact detail) so the user knows the consequence before confirming.

#### Scenario: First-time block confirmation includes cooldown notice
- **WHEN** user A opens the Block confirmation dialog for any target B
- **THEN** the dialog renders a localized notice such as "You will only be able to unblock this user after 48 hours"

#### Scenario: Re-block confirmation also includes cooldown notice
- **WHEN** user A opens the Block confirmation dialog for a target B who was previously unblocked
- **THEN** the same 48-hour unblock-cooldown notice is rendered

### Requirement: UI surfaces unblock cooldown remaining time

The client SHALL display a localized notice with the remaining unblock cooldown time whenever the Unblock action is unavailable due to the 48-hour cooldown. The notice MUST use an i18n key that interpolates remaining hours (rounded up).

#### Scenario: Disabled Unblock button shows remaining hours
- **WHEN** the Blocked tab renders a row whose `last_blocked_at` is less than 48 hours ago
- **THEN** the Unblock button is disabled and accompanied by text like "Unblock available in {hours} h"

#### Scenario: Unblock RPC cooldown error surfaces remaining hours
- **WHEN** the client invokes `unblock_user(B)` defensively and the RPC raises `cooldown_active`
- **THEN** the error is surfaced as a localized snackbar including the remaining hours derived from the returned seconds

### Requirement: Unblock removes block effects but retains row for cooldown

`unblock_user(target)` SHALL set `unblocked_at = now()` on the active row (it does NOT delete the row). All enforcement (RLS predicates, discovery filters, `is_blocked_by`) MUST treat the row as inactive when `unblocked_at IS NOT NULL`. The row remains queryable for cooldown calculation.

#### Scenario: Unblock makes block inactive
- **WHEN** user A invokes `unblock_user(B)` and the RPC succeeds (cooldown elapsed)
- **THEN** `is_blocked_by(A)` for user B returns false, discovery RPCs no longer filter B from A's results, and A may send a friend request to B subject to existing rules

#### Scenario: Owner can hard-delete inactive row only after cooldown
- **WHEN** user A invokes `unblock_user(B)` after cooldown elapsed and the row is already inactive
- **THEN** the RPC raises an error indicating the user is not currently blocked

### Requirement: Block entry points include pending request, existing friend, and contact detail

The client SHALL expose Block actions from:
- A pending incoming friend request row in `friend-requests-sheet.vue`.
- An existing friend in friend / contact detail.
- Contact detail for any contact that has resolved to a registered user via contact-account-linking.

The Block affordance MUST be hidden when:
- the contact has no resolved registered user (no target user id available), OR
- the contact is already actively blocked by the caller (resolved either via `linkedFriendUserId ∈ blockedUserIds` or via any contact phone ∈ `blockedPhones`).

Block from an existing friend MUST present a confirmation dialog warning the user that the friendship will be removed. The confirmation dialog SHALL be rendered **inline** within the surface that triggered it (mirroring the existing delete-confirmation pattern used for contact removal) — never as a modal overlay — and the same component / placement SHALL be used on mobile and desktop.

#### Scenario: Block hidden for unlinked contact
- **WHEN** the contact detail renders for a contact whose phone has not resolved to a registered user
- **THEN** the Block action is not rendered

#### Scenario: Block hidden when target is already blocked
- **WHEN** any Block entry point (pending request row, contact detail) renders for a target that the caller is currently actively blocking
- **THEN** the Block button and any inline block-confirm panel are not rendered

#### Scenario: Block visible once contact linkage exists and target not yet blocked
- **WHEN** the contact detail renders for a contact whose phone has resolved to a registered user (linkage present) and the contact is not actively blocked
- **THEN** the Block action is rendered

#### Scenario: Block from pending incoming request
- **WHEN** user B taps Block on a pending `friend_requests(A → B)` row
- **THEN** `block_user(A)` is invoked, which denies the row and inserts the block atomically

#### Scenario: Block from existing friend prompts confirmation
- **WHEN** user A taps Block on user B's friend / contact detail and `friendships(A, B)` exists
- **THEN** a localized confirmation panel renders inline (not as a modal) warning that the friendship will be removed and offering Cancel + Confirm

#### Scenario: Confirm runs atomic cascade
- **WHEN** user A confirms the dialog
- **THEN** `block_user(B)` runs: friendship row removed, any pending request terminated, block inserted — all in one transaction

### Requirement: Blocked tab in friend requests sheet

The friend requests sheet SHALL include a "Blocked" tab alongside the pending requests tab. The tab SHALL list each user the current user has actively blocked (active = `unblocked_at IS NULL`), with a display label, blocked-since timestamp, and an Unblock button. The button SHALL be disabled with a localized cooldown notice while within 48 hours of `last_blocked_at`.

The display label MUST resolve via the following fallback chain (first non-empty wins):
1. The locally saved contact name (first + last) whose phone matches the blocked user's phone.
2. The blocked user's profile name (`first_name` + `last_name`) from `list_blocked_users()`.
3. The blocked user's phone formatted for display.
4. A neutral placeholder (e.g. `—`) — but only if no phone is available.

User IDs (UUIDs) MUST NEVER be shown as the display label.

#### Scenario: Active blocks shown, inactive omitted
- **WHEN** the Blocked tab renders for user A
- **THEN** only rows with `blocker_user_id = A` AND `unblocked_at IS NULL` are listed

#### Scenario: Empty state
- **WHEN** user A has no active blocks
- **THEN** the Blocked tab shows a localized empty-state message

#### Scenario: Display label uses local contact name when available
- **WHEN** the Blocked tab renders a row for user B whose phone matches a locally saved contact with a name
- **THEN** the row's label is the saved contact's first + last name

#### Scenario: Display label falls back to profile name then phone
- **WHEN** no local contact matches user B's phone but `list_blocked_users()` returned a profile name for B
- **THEN** the row's label is the profile name; if no profile name is available, the row's label is the formatted phone number

#### Scenario: UUID never displayed
- **WHEN** the Blocked tab renders any row
- **THEN** the user UUID is never used as the display label, regardless of fallback chain state

#### Scenario: Unblock removes entry live
- **WHEN** the user clicks Unblock for entry B (cooldown elapsed) and the RPC succeeds
- **THEN** the row disappears from the Blocked tab without manual reload

### Requirement: Identity resolution for blocker's own blocks

The system SHALL expose `list_blocked_users() returns table (user_id uuid, phone text, first_name text, last_name text)` as a SECURITY DEFINER RPC returning one row per user the caller is currently actively blocking. The RPC is the single sanctioned path for the blocker to resolve identity of their own blocked users, since `find_users_by_phones`, `find_phones_by_user_ids`, and `get_user_names_by_ids` filter blocked users out bidirectionally.

The RPC MUST be scoped strictly to the caller: it MUST NOT return rows for blocks where `blocker_user_id <> auth.uid()`, and it MUST NOT return rows where `unblocked_at IS NOT NULL`. The store MUST call this RPC alongside `listActive()` on every fetch (initial load, post-block, post-unblock, realtime change) and MUST expose the results as `blockedUserInfo: Map<userId, { phone, firstName, lastName }>` and a derived `blockedPhones: Set<string>` for UI consumers.

#### Scenario: RPC returns the caller's own active blocks
- **WHEN** user A invokes `list_blocked_users()` and has active blocks against users B and C (but C was unblocked)
- **THEN** the result contains exactly one row identifying B with their phone (formatted as E.164 with leading `+`) and profile names if present; C is omitted

#### Scenario: RPC scoped strictly to caller
- **WHEN** user A invokes `list_blocked_users()`
- **THEN** no rows are returned for blocks whose `blocker_user_id` is anyone other than A

#### Scenario: Store exposes derived blockedPhones set
- **WHEN** `fetchBlocks` completes successfully
- **THEN** `blockedPhones` contains the E.164 phone for every active block whose `phone` is non-null

### Requirement: Blocked-status badge on every contact reference

The system SHALL display a visual blocked-status indicator (red `block` material symbol) anywhere a blocked contact is referenced in the UI. The indicator MUST appear:
- next to the contact name in the contact list, in place of (or alongside) the friend badge, with a localized tooltip in desktop view,
- in the contact detail hero's status line, with the visible label "Blocked", in place of the friend status.

Membership is derived from `blockedPhones` (any contact phone normalized to E.164 that matches an entry) OR from `blockedUserIds` (when a `linkedFriendUserId` is known). The indicator MUST update reactively as the user-blocks-store state changes (block, unblock, realtime sync) — no remount or manual refresh.

#### Scenario: Blocked badge appears on contact list row
- **WHEN** the contact list renders a contact whose primary or any other phone matches a row in `blockedPhones`
- **THEN** a red `block` icon with the localized tooltip is rendered next to the contact name

#### Scenario: Blocked badge appears on contact detail
- **WHEN** the contact detail renders for a contact resolved to a blocked user
- **THEN** the red `block` icon with the label "Blocked" is rendered in the hero's status line

#### Scenario: Badge appears live after blocking
- **WHEN** the user successfully blocks a contact and remains on the same view
- **THEN** the badge appears on the contact's row / detail without a manual refresh

#### Scenario: Badge disappears live after unblocking
- **WHEN** the user successfully unblocks a contact and remains on the same view
- **THEN** the badge disappears without a manual refresh

### Requirement: Pending request and friendship state refreshed synchronously after block

After `block_user(B)` succeeds, the client MUST refresh the friendships-store (`fetchAll`) explicitly, in addition to relying on Supabase Realtime events for `friendships` DELETE and `friend_requests` UPDATE. The explicit refresh guarantees the UI removes any pending request rows and ends any friendship affordances synchronously with the block confirmation, even if a realtime event is delayed or dropped (reconnect, missed message).

#### Scenario: Pending incoming request removed without realtime
- **WHEN** user A blocks user B (whose pending friend request was incoming to A) and the realtime event for the `friend_requests` UPDATE has not yet arrived
- **THEN** the pending request row is removed from the friend-requests sheet immediately upon block success, driven by the explicit `fetchAll` call

#### Scenario: Friendship removed without realtime
- **WHEN** user A blocks user B while a friendship exists and the realtime event for the `friendships` DELETE has not yet arrived
- **THEN** any friendship-derived UI (e.g. friend badge, friend lists) reflects the removal immediately upon block success

### Requirement: Realtime synchronization of own block list

The system SHALL keep the current user's block list in sync via Supabase Realtime `postgres_changes` on `public.user_blocks` filtered to `blocker_user_id = auth.uid()`. Subscription lifecycle mirrors the friendships realtime subscription (gated on auth, torn down on sign-out).

#### Scenario: New block from another device appears live
- **WHEN** user A blocks user B on device 2 and device 1 has the app open
- **THEN** device 1's Blocked tab gains the entry without manual reload

#### Scenario: Unblock on another device removes live
- **WHEN** user A unblocks user B on device 2
- **THEN** device 1's Blocked tab loses the entry without manual reload (the inactive row is filtered client-side)

#### Scenario: Clean teardown on sign-out
- **WHEN** the user signs out
- **THEN** the Realtime channel is removed via `supabase.removeChannel`

### Requirement: Blocks persist independently of friendship lifecycle

Active `user_blocks` rows MUST NOT be auto-deleted or set inactive by contact deletion, phone deletion, own-phone deletion, or any friendship cleanup path. Only an explicit successful `unblock_user` RPC (after cooldown) sets `unblocked_at`. User deletion cascades the row via FK.

#### Scenario: Block survives contact deletion
- **WHEN** user A blocks user B, then user A deletes the contact resolving to B
- **THEN** `user_blocks(A, B)` remains active

#### Scenario: Block survives own-phone deletion
- **WHEN** user A blocks user B, then user A invokes `delete_own_phone()`
- **THEN** `user_blocks(A, B)` remains active

### Requirement: Abuse reporting captured but no moderation pipeline

The system SHALL provide a `report_user(target_user_id uuid, reason text)` SECURITY DEFINER RPC that inserts a row into `public.abuse_reports(reporter_user_id, reported_user_id, reason, created_at)`. The Block UI SHALL offer an optional "Also report this user" toggle / paired action. The RPC explicitly sets `reporter_user_id = auth.uid()` to preserve authorization (writes go only through this RPC; no INSERT policy is granted on `abuse_reports`). There is **no admin tool, no automated action, no notification to moderators** — the table is a capture-only audit log for future moderation work, tracked by a separate GitHub issue.

#### Scenario: Report inserted
- **WHEN** user A invokes `report_user(B, "spam")` for the first time
- **THEN** a row `(reporter_user_id = A, reported_user_id = B, reason = 'spam', created_at = now())` is inserted in `abuse_reports`

#### Scenario: Repeat report upserts reason and timestamp
- **WHEN** user A invokes `report_user(B, <new reason>)` and a prior row `(A, B)` already exists
- **THEN** the existing row is UPDATEd with the new reason and `created_at = now()`; no duplicate row is inserted (UNIQUE on `(reporter_user_id, reported_user_id)`)

#### Scenario: Block-and-report runs both
- **WHEN** user A confirms Block with the "Also report" option checked
- **THEN** `block_user(B)` runs followed by `report_user(B, <reason>)` in the same UI flow (separate RPCs acceptable)

#### Scenario: No automated action taken on report
- **WHEN** any `abuse_reports` row is inserted
- **THEN** no notification is sent, no flag is raised on the reported user, no automated moderation runs

#### Scenario: Reporter sees confirmation
- **WHEN** the report RPC succeeds
- **THEN** the client shows a localized confirmation snackbar
