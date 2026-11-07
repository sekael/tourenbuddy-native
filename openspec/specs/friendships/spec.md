## Purpose

Mutual friend connections between users via request, accept, and cleanup flows that drive tour sharing visibility.

## Requirements

### Requirement: Friendship requires both parties to retain the linking verified phone

A `friendships(A, B)` row SHALL only exist while BOTH parties satisfy all of:
- each party has a verified phone in `auth.users` (`phone_confirmed_at IS NOT NULL`);
- each party has the other in their `contacts` via a `contact_methods` row of `method_type = 'phone'` whose value resolves to the other party's verified phone.

When any of these conditions ceases to hold due to an actor's action (deleting a contact, deleting the linking phone `contact_method`, editing the linking phone `contact_method` to a different value, or deleting their own verified phone), the system MUST remove the `friendships` row.

#### Scenario: Friendship deleted when contact removed
- **WHEN** user A deletes a contact whose phone resolves to user B, and a `friendships(A, B)` row exists
- **THEN** that `friendships` row is deleted in the same transaction as the contact delete

#### Scenario: Friendship deleted when linking phone removed
- **WHEN** user A deletes a phone `contact_method` whose value resolves to user B, and a `friendships(A, B)` row exists
- **THEN** that `friendships` row is deleted in the same transaction as the contact_method delete

#### Scenario: Friendship deleted when linking phone edited to a different value
- **WHEN** user A updates a phone `contact_method` whose OLD value resolves to user B, changing it to a different value, and a `friendships(A, B)` row exists
- **THEN** that `friendships` row is deleted in the same transaction as the contact_method update, resolved from the OLD value

#### Scenario: Editing a phone that resolves to nobody leaves friendships untouched
- **WHEN** user A updates a phone `contact_method` whose OLD value resolves to no registered user
- **THEN** no `friendships` rows are modified

#### Scenario: Friendships deleted when user removes own verified phone
- **WHEN** user A invokes `delete_own_phone()` and `friendships` rows exist with A as `request_user_id` or `response_user_id`
- **THEN** all such `friendships` rows are deleted in the same transaction

### Requirement: Pending friend_requests terminated at every break-point

For each break-point (contact delete, linking-phone delete, linking-phone value edit, own-phone delete), the system MUST terminate pending `friend_requests` between the actor and every affected peer:
- Row with `from_user_id = actor` → `status = 'cancelled'`, `responded_at = now()`.
- Row with `to_user_id = actor` → `status = 'denied'`, `responded_at = now()`.
- Rows with `status` other than `'pending'` MUST NOT be modified.

For the linking-phone value edit, the affected peer is resolved from the OLD value of the edited `contact_method`.

#### Scenario: Outgoing pending cancelled when contact deleted
- **WHEN** user A deletes a contact whose phone resolves to user B and a pending row exists with `from_user_id = A, to_user_id = B`
- **THEN** the row's status becomes `'cancelled'` with `responded_at` set, in the same transaction

#### Scenario: Incoming pending denied when contact deleted
- **WHEN** user A deletes a contact whose phone resolves to user B and a pending row exists with `from_user_id = B, to_user_id = A`
- **THEN** the row's status becomes `'denied'` with `responded_at` set, in the same transaction

#### Scenario: Pending request terminated when linking phone removed
- **WHEN** user A deletes a phone `contact_method` whose value resolves to user B and a pending row exists between A and B
- **THEN** the pending row is terminated using the cancelled/denied rule based on direction

#### Scenario: Pending request terminated when linking phone edited to a different value
- **WHEN** user A updates a phone `contact_method` whose OLD value resolves to user B, changing it to a different value, and a pending row exists between A and B
- **THEN** the pending row is terminated using the cancelled/denied rule based on direction, resolved from the OLD value, in the same transaction as the update

#### Scenario: All caller-side pending requests terminated on own-phone delete
- **WHEN** user A invokes `delete_own_phone()` and pending `friend_requests` rows exist with A as `from_user_id` or `to_user_id`
- **THEN** every such row is terminated (cancelled if A was sender, denied if A was recipient)

#### Scenario: Non-pending requests untouched
- **WHEN** any break-point fires and a `friend_requests` row between the actor and peer has `status` in `{accepted, denied, cancelled}`
- **THEN** that row is not modified by the cleanup logic

#### Scenario: Editing a phone that does not change value is a no-op
- **WHEN** user A updates a phone `contact_method` row without changing its `value`
- **THEN** no `friend_requests` rows are modified by the edit break-point

### Requirement: Re-establishing the link allows new friend requests

After automatic termination, the unordered partial unique index on pending pairs MUST NOT block re-sending a new friend request between the same two users once the actor restores the link (re-adds the contact, re-adds the phone, or re-verifies their own phone). Because the index is restricted to `status = 'pending'`, terminal-status rows (`cancelled`, `denied`, `accepted`) from the prior relationship never collide with a new pending row in either direction.

#### Scenario: Re-adding contact allows new pending request
- **WHEN** a pending row was auto-cancelled by contact deletion, then the actor re-adds the contact and triggers a new friend request to the same user
- **THEN** insertion of the new pending row succeeds (terminal-status rows do not collide with the pending-only unique index)

### Requirement: At most one pending friend request per unordered pair

The system SHALL permit at most one `friend_requests` row with `status = 'pending'` for any unordered pair of users `{A, B}`, regardless of direction. This MUST be enforced declaratively by a partial unique index on `(LEAST(from_user_id, to_user_id), GREATEST(from_user_id, to_user_id)) WHERE status = 'pending'`, replacing the prior directional `(from_user_id, to_user_id)` index. Pre-existing dual-pending pairs MUST be deduplicated by the same migration before the index is created: for each violating pair, the earliest row (`created_at`, tie-broken by `id`) is retained and every other pending row is set to `status = 'cancelled', responded_at = now()`.

#### Scenario: Reciprocal pending insert rejected

- **WHEN** a pending row `A→B` exists and an insert of `B→A` with `status = 'pending'` is attempted
- **THEN** the insert is rejected by the unordered partial unique index

#### Scenario: Existing dual-pending rows deduplicated on migration

- **WHEN** the migration runs and both `A→B` and `B→A` pending rows already exist
- **THEN** only the earliest of the two remains `pending` and the other becomes `status = 'cancelled'` with `responded_at` set, before the unordered index is created

#### Scenario: Terminal-status rows never collide

- **WHEN** a pair has any number of `friend_requests` rows in `status` `{accepted, denied, cancelled}` and a new `pending` row is inserted for that pair
- **THEN** the insert succeeds, because the unique index is restricted to `status = 'pending'`

### Requirement: Accepting a request resolves the opposite-direction pending row

`accept_friend_request(p_request_id)` MUST, in the same transaction as forming the friendship, terminate any opposite-direction pending row for the same pair by setting it to `status = 'cancelled', responded_at = now()`. This guarantees no dangling pending request survives an accept, including for legacy dual-pending data. The operation MUST be idempotent — a no-op when no opposite-direction pending row exists — and MUST NOT modify rows whose status is not `pending`.

#### Scenario: Opposite pending cancelled on accept

- **WHEN** user B accepts a pending request `A→B` while a pending row `B→A` also exists
- **THEN** the friendship `{A, B}` is created and the `B→A` row becomes `status = 'cancelled'` with `responded_at` set, in the same transaction

#### Scenario: No opposite row is a no-op

- **WHEN** user B accepts a pending request `A→B` and no `B→A` pending row exists
- **THEN** the friendship is created and no other `friend_requests` row is modified

### Requirement: Send affordance toward a pending requester resolves by accepting

When the current user is offered a connect affordance toward a matched user who already has a **pending incoming** request to the current user, the UI MUST present an "accept" action that resolves that existing request (calling the accept path) rather than a "send" action that would create a reciprocal pending row. Detection MUST be from client store state (the caller's incoming-request list). On success the UI MUST display an explicit inline disclaimer that the users are now friends, and the responded notification to the original requester MUST be recorded exactly as it is for an explicit accept. The contact-flow gating that selects a match for the connect prompt MUST surface incoming-pending matches (not only suppress outgoing-pending ones) so this affordance is reachable from the add-contact and contact-detail flows.

#### Scenario: Connect prompt switches to accept for an incoming pending request

- **WHEN** the current user views a connect affordance toward user B and a pending request `B→(current user)` exists in store state
- **THEN** the affordance is an "Accept friend request" action bound to that incoming request, not a "Send request" action

#### Scenario: Accepting via the prompt shows the now-friends disclaimer and notifies

- **WHEN** the current user activates the accept affordance toward user B
- **THEN** the friendship `{current user, B}` is formed, an inline "you are now friends" confirmation is shown in place, and the database records the friend-request `responded` notification for B

#### Scenario: Concurrent cross-send is rejected with a retry prompt

- **WHEN** `sendRequest` toward user B is rejected by the unordered pending unique index because B's request to the current user arrived concurrently
- **THEN** the optimistic outgoing row is rolled back and the user is shown a failure message prompting them to retry; no duplicate pending row persists, and reopening the affordance after the incoming request propagates presents the accept action

### Requirement: Realtime synchronization of friend request state

The system SHALL update the in-app state of `friend_requests` for the current user in real time, without requiring a page reload, by subscribing to Supabase Realtime `postgres_changes` on the `public.friend_requests` table filtered to the authenticated user.

#### Scenario: Incoming friend request appears live
- **WHEN** user A sends a friend request to user B and user B has the app open
- **THEN** the new request appears in user B's incoming list and any notification badge updates without a page reload

#### Scenario: Outgoing request status update appears live
- **WHEN** user B accepts, denies, or the request is cancelled, and user A has the app open
- **THEN** user A's outgoing-request UI reflects the new status without a page reload

#### Scenario: Subscription gated on auth + phone verification
- **WHEN** the user is not authenticated, or has no verified phone
- **THEN** no Realtime channel for friend requests is open

#### Scenario: Clean teardown on sign-out
- **WHEN** the user signs out, or their verified phone is removed
- **THEN** the Realtime channel is removed via `supabase.removeChannel` and no further events are processed

### Requirement: Realtime synchronization of friendships state

The system SHALL update the in-app `friendships` state for the current user in real time by subscribing to Supabase Realtime `postgres_changes` on `public.friendships` filtered to the authenticated user as either `request_user_id` or `response_user_id`.

#### Scenario: Friendship row insert appears live
- **WHEN** an `INSERT` on `friendships` arrives for the current user
- **THEN** the friendship is reflected in `friendUserIds` and dependent UI (e.g., contact friendship icon) within one debounce window

#### Scenario: Friendship icon disappears when other party breaks the link
- **WHEN** the other party deletes their contact (or linking phone) and the existing DB cleanup trigger deletes the corresponding `friendships` row
- **THEN** the current user receives the DELETE event and the friendship icon is removed from their contact list without a page reload

### Requirement: Realtime subscription uses the shared core primitive

Feature stores MUST NOT call `supabase.channel(...)` or `supabase.removeChannel(...)` directly. All Realtime subscriptions SHALL go through `src/core/realtime/use-realtime-subscription.ts`, which centralizes channel lifecycle, auth-gated enable/disable, debounced refetch, and per-key deduplication so additional features (e.g. `tours`) can adopt Realtime by supplying only bindings + a refetch callback.

#### Scenario: Friendships store consumes the primitive
- **WHEN** the friendships store wires Realtime
- **THEN** it invokes `useRealtimeSubscription` with bindings for `friend_requests` and `friendships`; no direct `supabase.channel` call exists in the store

#### Scenario: Primitive tears down channel when enabled flips false
- **WHEN** a consumer's `enabled` ref flips from true to false
- **THEN** the primitive calls `supabase.removeChannel` for the previously created channel and no further events are delivered to the consumer

#### Scenario: Baseline fetch runs only after channel is SUBSCRIBED
- **WHEN** a consumer provides `onSubscribed` and the channel reaches `SUBSCRIBED` status
- **THEN** the primitive invokes `onSubscribed` exactly once per subscribe cycle, after bindings are attached, so no DB write between baseline and stream is lost

#### Scenario: Primitive deduplicates by key
- **WHEN** two consumers request a subscription with the same `key` while both are enabled
- **THEN** only one channel is created and both observe the same lifecycle

#### Scenario: Channel torn down when caller's effect scope disposes
- **WHEN** the caller's owning effect scope ends (Pinia store `$dispose`, HMR module replacement, or parent component unmount) while the subscription is active
- **THEN** the primitive calls `supabase.removeChannel` and clears its registry entry, even if `enabled` never flipped to false

### Requirement: Sign-out is scoped to the current device

`authStore.signOut()` SHALL invoke Supabase auth with `scope: 'local'` so that signing out in any tab clears the session for that browser profile on that device only. Other devices and other PWA installs (each holding their own refresh token in their own storage) MUST remain signed in.

#### Scenario: Sign-out propagates across sibling tabs on the same device
- **WHEN** the user signs out in Tab A
- **THEN** Tab B (same browser profile, same device) receives a `SIGNED_OUT` event via storage-sync and its `isAuthenticated` flips to false, tearing down its Realtime channel

#### Scenario: Sign-out does not affect other devices
- **WHEN** the user signs out on Device A
- **THEN** Device B's refresh token is not revoked server-side, and Device B remains signed in until its own user-initiated sign-out or natural token expiry

### Requirement: Realtime channel auth tracks token refresh

The realtime primitive SHALL listen for `TOKEN_REFRESHED` events from `supabase.auth.onAuthStateChange` and explicitly call `supabase.realtime.setAuth(session.access_token)` so active channels do not drift onto a stale JWT.

#### Scenario: Token refresh updates active channel auth
- **WHEN** `onAuthStateChange` fires with event `TOKEN_REFRESHED`
- **THEN** the primitive calls `supabase.realtime.setAuth` with the new access token

### Requirement: Optimistic writes reconcile cleanly with Realtime echoes

When the store performs an optimistic write and a Realtime event for the same row arrives before or after the RPC response, the user MUST NOT see a duplicate row, nor a wiped optimistic placeholder while the RPC is still in flight.

#### Scenario: Realtime echo arrives before RPC return
- **WHEN** `sendRequest` is called and a Realtime INSERT for the resulting row triggers a refetch before the RPC promise resolves
- **THEN** the refetch's reconcile pass drops the temp placeholder whose `(fromUserId, toUserId)` matches the server row and renders only the server row; no duplicate appears

#### Scenario: RPC returns before Realtime echo
- **WHEN** `sendRequest`'s RPC resolves first and a Realtime INSERT then triggers a refetch
- **THEN** the success path's dedupe-by-id integration prevents the refetch from inserting a second copy of the same row

#### Scenario: In-flight optimistic placeholder survives a mid-flight refetch
- **WHEN** a refetch fires while an optimistic temp row exists whose `(fromUserId, toUserId)` is not yet present on the server
- **THEN** the reconcile pass preserves that optimistic temp row so the user does not see their just-clicked action disappear

### Requirement: Strict separation of push and Realtime concerns

The system MUST keep notifications and Realtime as two independent pathways:
- Friend-request notifications SHALL be recorded by the database in the transaction that
  changes the request (trigger `fn_notify_friend_request`: `received` to the recipient on a
  pending INSERT; `responded` to the sender when a pending row becomes `accepted` or
  `denied`; cancellation notifies nobody). No client code dispatches them (see
  `notification-inbox`).
- Realtime event handlers MUST NOT trigger any notification dispatch (push or email).
- The service worker `push` and `notificationclick` handlers MUST NOT mutate in-app store state nor trigger Realtime / store refetches; they MAY only display the OS notification and focus/navigate a client.

#### Scenario: Realtime event does not dispatch notifications
- **WHEN** a `friend_requests` INSERT event is received by any client
- **THEN** no notification dispatch is made from the Realtime handler

#### Scenario: Notification recorded once per transition
- **WHEN** a user sends, accepts, or denies a friend request
- **THEN** exactly one `friend_requests` notification row is recorded for the other party, regardless of whether Realtime is connected or which client performed the write

#### Scenario: Service worker never mutates store state
- **WHEN** the service worker receives a `push` event or handles a `notificationclick`
- **THEN** it calls only `showNotification` / `clients.matchAll` / `focus` / `navigate` / `openWindow`; it does not `postMessage` payloads that callers interpret as store mutations and does not perform any DB fetches

### Requirement: Direct friend_requests writes are limited to deny and cancel

Clients SHALL hold UPDATE privilege on `friend_requests` only for the `status` and
`responded_at` columns. RLS SHALL let the recipient move a pending row only to `denied` and
the sender only to `cancelled`; acceptance SHALL go exclusively through
`accept_friend_request`, which also forms the friendship. A directly inserted row SHALL start
`pending`.

#### Scenario: Recipient denies directly
- **WHEN** the recipient updates a pending request to `status = 'denied'`
- **THEN** the update succeeds and the sender is notified

#### Scenario: Direct accept is rejected
- **WHEN** the recipient updates a pending request to `status = 'accepted'` without the RPC
- **THEN** RLS rejects the update, so no accepted request can exist without its friendship

#### Scenario: Parties cannot be rewritten
- **WHEN** a party updates `from_user_id` or `to_user_id` on a request
- **THEN** the update is rejected for lack of column privilege

#### Scenario: Direct insert in a terminal status is rejected
- **WHEN** a client inserts a `friend_requests` row with any status other than `pending`
- **THEN** RLS rejects the insert

### Requirement: Realtime replication enabled for friendship tables

The database SHALL include `public.friend_requests` and `public.friendships` in the `supabase_realtime` publication so that authenticated clients can receive `postgres_changes` events, with RLS policies remaining the sole authorization gate (no policy widening). Both tables SHALL have `REPLICA IDENTITY FULL` so that DELETE and UPDATE event payloads carry every column, allowing server-side filters on non-PK columns (e.g. `friend_requests.to_user_id`) to match reliably under all event types.

#### Scenario: Tables are members of supabase_realtime
- **WHEN** the publication is inspected after migrations are applied
- **THEN** both `public.friend_requests` and `public.friendships` are members of `supabase_realtime`

#### Scenario: Replica identity is FULL on both tables
- **WHEN** `pg_class.relreplident` is inspected for either table
- **THEN** the value is `'f'` (FULL)

#### Scenario: RLS still gates visibility
- **WHEN** an authenticated client subscribes to `postgres_changes` on these tables
- **THEN** they receive only events for rows their existing SELECT RLS policies already permit

### Requirement: Friend request send path consults block state server-side

Sending a friend request SHALL go through the `send_friend_request(p_to_user_id uuid)` SECURITY INVOKER RPC. The RPC MUST raise `blocked_by_target` (`ERRCODE = 'P0001'`) when an active `user_blocks(p_to_user_id, auth.uid())` row exists; otherwise it inserts and returns the row. The `friend_requests` INSERT RLS policy MUST also carry the same block predicate as defense in depth, so any direct DML path (custom client, future code) is hard-rejected by Postgres. The client UI additionally hides the affordance based on `is_blocked_by(B)`.

#### Scenario: RPC raises typed error for blocked sender
- **WHEN** user A invokes `send_friend_request(B)` and an active `user_blocks(B, A)` row exists
- **THEN** the RPC raises `blocked_by_target` with `ERRCODE = 'P0001'` and no row is inserted

#### Scenario: Direct INSERT path also rejected by RLS
- **WHEN** any client bypasses the RPC and attempts to INSERT into `friend_requests` while a block exists
- **THEN** RLS denies the insert independently of the RPC

#### Scenario: Client hides affordance for blocked sender
- **WHEN** user A's client evaluates a send-request affordance toward user B and `is_blocked_by(B)` returns true
- **THEN** the affordance is not rendered

#### Scenario: Client hides affordance when caller has blocked target
- **WHEN** user A's client evaluates a send-request affordance toward user B and `B ∈ user-blocks-store.blockedUserIds`
- **THEN** the affordance is not rendered (sending a friend request to someone the caller has blocked is suppressed reactively, immediately after the block confirmation)

#### Scenario: Client invalidates cache on typed rejection
- **WHEN** the RPC raises `blocked_by_target` for target B
- **THEN** the client sets `isBlockedByCache[B] = true`, hides the affordance in the current view, and shows a generic failure snackbar (does not disclose the block reason)

### Requirement: Block on existing friend cascades unfriend + request termination

When user A blocks user B and a `friendships` row exists between them (in either column order) and/or pending `friend_requests` exist in either direction, the `block_user` RPC MUST in one transaction:
- delete the `friendships` row,
- terminate pending friend requests (cancelled if A was sender, denied if A was recipient),
- insert the `user_blocks(A, B)` row.

Partial application MUST NOT be possible.

#### Scenario: Block-while-friends cascade
- **WHEN** user A invokes `block_user(B)` while `friendships(A, B)` exists (and optionally pending requests)
- **THEN** the friendship is deleted, any pending requests are terminated per direction, and the block row is inserted — all in one transaction

#### Scenario: Pending-only cascade (no existing friendship)
- **WHEN** user A invokes `block_user(B)` while only a pending `friend_requests` exists
- **THEN** the pending request is terminated (denied if A is recipient, cancelled if A is sender) and the block row is inserted atomically

#### Scenario: Stranger-block (no prior relationship)
- **WHEN** user A invokes `block_user(B)` and neither friendship nor pending request exists
- **THEN** only the block row is inserted

#### Scenario: Failure rolls back all writes
- **WHEN** any step of the cascade fails
- **THEN** no friendship deletion, no request termination, and no block row is persisted

### Requirement: Friend-request cleanup paths preserve blocks

The existing friendship/request cleanup paths (`cleanup_on_contact_delete`, `cleanup_on_contact_method_delete`, `delete_own_phone`, `terminate_pending_and_friendship_between`) MUST NOT modify `user_blocks` rows in any direction. Block lifecycle is owned exclusively by `block_user` / `unblock_user`.

#### Scenario: Contact delete leaves block intact
- **WHEN** user A deletes a contact resolving to user B and `user_blocks(A, B)` exists
- **THEN** the `user_blocks` row is unchanged

#### Scenario: Own-phone delete leaves blocks in both directions intact
- **WHEN** user A invokes `delete_own_phone()` and `user_blocks(A, X)` and/or `user_blocks(Y, A)` rows exist
- **THEN** all such `user_blocks` rows are unchanged
