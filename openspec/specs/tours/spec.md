## Purpose

Core tour entity (location, planned date, owner) with CRUD, persistence, and realtime sync via Supabase.

## Requirements

### Requirement: Realtime synchronization of tour list state

The system SHALL keep the in-app tours list of the authenticated user in sync across the user's devices in real time, without requiring a page reload, by subscribing to Supabase Realtime `postgres_changes` on `public.tours`, `public.tour_partners` and `public.tour_attachments`, each filtered to the authenticated user via `user_id=eq.${currentUserId}`. `tour_partners` is bound because a contact-delete cascade changes the partner set without touching the parent `tours` row (see "Tour partner set reconciles across devices on contact delete").

#### Scenario: Tour created on device A appears on device B
- **WHEN** user creates a tour on device A while device B has the app open and is signed in as the same user
- **THEN** device B's tours list reflects the new tour within one debounce window, without a page reload

#### Scenario: Tour updated on device A reflects on device B
- **WHEN** user edits any field of a tour on device A (including planned date, partner ids, attachments)
- **THEN** device B's tours list and any open tour info sheet reflect the change within one debounce window

#### Scenario: Tour deleted on device A disappears on device B
- **WHEN** user deletes a tour on device A
- **THEN** device B receives the DELETE event and removes the tour from its local list

#### Scenario: Map cluster tree recomputes on remote add / delete / goal change
- **WHEN** a remote create, delete, or goal-location update arrives via realtime and the debounced `loadTours()` reassigns the `tours` ref
- **THEN** the map marker layer's cluster tree is rebuilt (the `[tours, selectedTourId]` watcher in `tourenbuddy-map.vue` fires and calls `markerLayer.updateTours(...)`) within one debounce window

#### Scenario: Tour list reassignment is the contract
- **WHEN** any tour-mutation code path (action or realtime refetch) updates the in-memory tour list
- **THEN** it SHALL replace `tours.value` with a new array reference rather than mutating items in place, so the cluster watcher fires reliably

#### Scenario: Subscription gated on auth
- **WHEN** the user is not authenticated
- **THEN** no Realtime channel for tours is open

#### Scenario: Clean teardown on sign-out
- **WHEN** the user signs out
- **THEN** the tours Realtime channel is removed and the local tours list is cleared

### Requirement: Tours store uses the shared realtime primitive

The `tours-store` MUST NOT call `supabase.channel(...)` or `supabase.removeChannel(...)` directly. It SHALL wire Realtime via `src/core/realtime/use-realtime-subscription.ts`, supplying:
- a channel key of the form `tours-${currentUserId}` so per-user channels deduplicate,
- two bindings, on `tours` and on `tour_partners`, each with `event: '*'` and filter `user_id=eq.${currentUserId}`,
- an `onChange` callback that debounces a full `loadTours()` refetch,
- an `onSubscribed` callback that runs `loadTours()` once after `SUBSCRIBED`, so no write between baseline and stream is lost.

The `tour-attachments-store` SHALL wire a separate subscription via the same primitive with channel key `tour-attachments-${currentUserId}`, a single binding on `tour_attachments` with `event: '*'` and filter `user_id=eq.${currentUserId}`. The `onChange` handler SHALL refetch attachments only for the currently loaded tour and short-circuit if none is active.

#### Scenario: Store consumes the primitive
- **WHEN** the tours store wires Realtime
- **THEN** it invokes `useRealtimeSubscription` and no direct `supabase.channel` or `supabase.removeChannel` call exists in the store

#### Scenario: Per-user channel key dedupes within a session
- **WHEN** the store is reinstantiated (HMR, navigation between pages that both consume it) while the user is signed in
- **THEN** only one tours channel exists per `currentUserId` at any time

#### Scenario: Baseline fetch runs after SUBSCRIBED
- **WHEN** the channel reaches `SUBSCRIBED`
- **THEN** the primitive invokes `loadTours()` exactly once per subscribe cycle, after bindings are attached

### Requirement: Realtime echoes do not produce duplicates with optimistic writes

The tours store's local writes (create / update / delete) MAY arrive at the Realtime stream as echoes after the corresponding mutation already updated local state. The refetch path MUST converge to a single row per tour id regardless of arrival order of the RPC response and the Realtime echo.

#### Scenario: Echo arrives before RPC returns
- **WHEN** a create/update RPC is in flight and a Realtime event for the same tour triggers a debounced refetch first
- **THEN** the refetch result replaces the local list deterministically and the user sees exactly one row for the tour

#### Scenario: RPC returns before echo
- **WHEN** the RPC returns first and applies local state, then a Realtime echo triggers a refetch
- **THEN** the refetch result still yields exactly one row per tour id (no duplicate)

### Requirement: Realtime handler MUST NOT dispatch notifications

Tour Realtime event handlers MUST NOT trigger any notification dispatch (push or email). Realtime remains a UI-sync pathway only; tour notifications are recorded by the database inside the tour write RPCs and the delete trigger (see `shared-tour-notifications`).

#### Scenario: No notification dispatch from Realtime
- **WHEN** any `postgres_changes` event for `tours` / `tour_attachments` is received
- **THEN** no notification dispatch function is invoked from the `onChange` handler

### Requirement: Realtime replication enabled for tour-related tables

The database SHALL include `public.tours`, `public.tour_partners` and `public.tour_attachments` in the `supabase_realtime` publication, with RLS remaining the sole authorization gate (no policy widening). All three tables SHALL have `REPLICA IDENTITY FULL` so DELETE and UPDATE payloads carry every column, allowing server-side filters on `user_id` to match reliably under all event types.

#### Scenario: Tables are members of supabase_realtime
- **WHEN** the publication is inspected after migrations are applied
- **THEN** `public.tours`, `public.tour_partners` and `public.tour_attachments` are members of `supabase_realtime`

#### Scenario: Replica identity is FULL on both tables
- **WHEN** `pg_class.relreplident` is inspected for any of these tables
- **THEN** the value is `'f'` (FULL)

#### Scenario: RLS still gates visibility
- **WHEN** an authenticated client subscribes to `postgres_changes` on either table
- **THEN** the client receives only events for rows its existing SELECT RLS policies already permit

### Requirement: Tour partner set reconciles across devices on contact delete

When a partnered contact is deleted, the DB cascade removes the corresponding `tour_partners` rows. The system SHALL reconcile the affected tours' partner ids on **every** signed-in device of the owner in real time — not only the device that performed the delete. This SHALL be achieved by including `public.tour_partners` in the `supabase_realtime` publication and binding it in `tours-store` so a `tour_partners` change triggers a debounced `loadTours()`.

The existing local `tours-store.$onAction(deleteContact)` reconciler MAY remain for optimistic update latency on the editing device, but MUST NOT be the sole reconciliation path (it does not fire on remote devices, which receive a `loadContacts()` refetch rather than the `deleteContact` action).

#### Scenario: Remote device reconciles partner ids
- **WHEN** device A deletes a contact that is a partner on a tour, and device B (same user) has never run the `deleteContact` action
- **THEN** device B receives the `tour_partners` DELETE event and the tour drops the partner id within one debounce window

#### Scenario: Partner change coalesces with tour change
- **WHEN** a partner-set edit on device A touches both `tours` (via `update_tour_full`) and `tour_partners`
- **THEN** device B coalesces both events into a single debounced `loadTours()` (one channel, two bindings)

### Requirement: tour_partners carries a consistent denormalised user_id

`public.tour_partners` SHALL have a `user_id` column always equal to the `user_id` of the tour referenced by its `tour_id`, derived server-side by a `BEFORE INSERT OR UPDATE` trigger and never trusted from client input. The invariant SHALL be enforced declaratively by a composite foreign key `(tour_id, user_id) → tours(id, user_id) ON DELETE CASCADE`, which REPLACES the single-column `tour_id` FK. The `contact_id → contacts(id) ON DELETE CASCADE` FK SHALL be KEPT (different parent — it is the contact-delete cascade that drives cross-device reconciliation). The column enables a user-scoped Realtime filter and does NOT replace or widen RLS — `tour_partners_select_own` remains the sole authorization gate.

#### Scenario: Insert derives user_id from the parent tour
- **WHEN** a `tour_partners` row is inserted (with any or no client-supplied `user_id`)
- **THEN** its stored `user_id` equals the `user_id` of the tour identified by `tour_id`

#### Scenario: Mismatched pair is structurally rejected
- **WHEN** a write attempts to set `(tour_id, user_id)` to a pair that does not match a real tour
- **THEN** the composite foreign key rejects the write

#### Scenario: Contact-delete cascade still fires
- **WHEN** a contact partnered on a tour is deleted
- **THEN** the `tour_partners` rows referencing it are cascade-deleted via the retained `contact_id` FK

#### Scenario: No row ever drifts
- **WHEN** the consistency check `count(*) from tour_partners tp join tours t on t.id = tp.tour_id where tp.user_id <> t.user_id` is run after any sequence of writes
- **THEN** the count is `0`

### Requirement: Realtime replication enabled for tour_partners

The database SHALL include `public.tour_partners` in the `supabase_realtime` publication with `REPLICA IDENTITY FULL`, RLS remaining the sole authorization gate. The binding SHALL be filtered `user_id=eq.${currentUserId}` and wired as a second binding on the existing `tours-${currentUserId}` channel.

#### Scenario: Table is a member of supabase_realtime
- **WHEN** the publication is inspected after migrations are applied
- **THEN** `public.tour_partners` is a member of `supabase_realtime` and its `relreplident` is `'f'`

#### Scenario: DELETE event carries user_id for filter matching
- **WHEN** a `tour_partners` row is deleted (including via contact-delete cascade)
- **THEN** `REPLICA IDENTITY FULL` ships the row's `user_id` so the `user_id=eq` filter delivers the DELETE to the owner

### Requirement: Tour creation is a single atomic idempotent call

Creating a tour SHALL be performed as a single atomic backend call that writes the
tour row and its partners, sets its visibility, and records its GPX filepath
together. The call SHALL be idempotent by tour id: replaying the same create for an
id that already exists SHALL be a safe no-op that does not duplicate or alter the
existing tour or its partners. The GPX upload SHALL remain best-effort — a failed
upload SHALL NOT prevent the tour from being created.

#### Scenario: Create sets visibility and GPX in one call

- **WHEN** a tour is created with a non-default visibility and a GPX file
- **THEN** the tour row, its partners, its visibility, and its GPX filepath are all
  persisted by a single atomic call, with no follow-up visibility or filepath write

#### Scenario: Replayed create is a no-op

- **WHEN** the create for a tour id that already exists is issued again
- **THEN** the existing tour and its partners are left unchanged and no duplicate is
  created

#### Scenario: GPX upload failure still creates the tour

- **WHEN** the GPX upload fails during creation
- **THEN** the tour is still created with a null GPX filepath

### Requirement: Tour update is a single atomic update-only call

Updating a tour SHALL be performed as a single atomic backend call that updates the
tour row and its partners and MAY set its visibility and GPX filepath in the same
call. Visibility SHALL be changed only when explicitly provided, leaving the existing
value untouched otherwise. The call SHALL be update-only: if the tour no longer
exists it SHALL make no change and SHALL NOT recreate the row.

#### Scenario: Update sets visibility atomically when provided

- **WHEN** a tour edit includes a visibility change
- **THEN** the row, partners, and visibility are updated by a single atomic call
  with no separate visibility write

#### Scenario: Update without visibility leaves it untouched

- **WHEN** a tour edit does not include a visibility value
- **THEN** the tour's existing visibility is unchanged

#### Scenario: Update of a deleted tour does not resurrect it

- **WHEN** an update is issued for a tour id that no longer exists on the server
- **THEN** no row is created and the caller can observe that no row was updated

### Requirement: Standalone visibility and completion toggles ride the update call

The standalone visibility toggle and the completion toggle (outside the create/edit form)
SHALL remain available, and SHALL be applied as an ordinary `update_tour_full` call carrying
the tour's whole current draft plus the changed `visibility` / `completed` value. They SHALL
therefore queue offline like any other tour edit, and their side effects (tour-link eviction,
suggestion voiding, notification cleanup) SHALL come from the database triggers that react to
the row change. There SHALL be no direct column write to `tours` from the client.

#### Scenario: Visibility toggled outside create/edit

- **WHEN** the user toggles a tour's visibility directly (not through the create or
  edit form)
- **THEN** one `update_tour_full` call persists it, and the database applies the eviction
  and notification side effects

#### Scenario: Toggled offline

- **WHEN** the user marks a tour completed while offline
- **THEN** the change is queued as the tour's single coalesced update entry and replays on reconnect

### Requirement: Owner read surface is tours_view, caller-scoped

The owner SHALL read their tours through `tours_view`, which SHALL run with the caller's
privileges (`security_invoker`), SHALL only ever return rows owned by the caller, and SHALL be
granted `SELECT` only, to `authenticated` only. Friends read other users' tours through
`friend_tours_view` (see `friend-tour-visibility`). All tour writes go through the tour RPCs;
the client holds no direct INSERT/UPDATE on `tours` or `tour_partners`.

#### Scenario: Signed-out caller
- **WHEN** a request with only the public anon key selects, updates or deletes through `tours_view`
- **THEN** it is rejected for lack of privilege

#### Scenario: Friend's tours never appear on the owner surface
- **WHEN** a user who has friends with friends-visible tours selects from `tours_view`
- **THEN** only the caller's own tours are returned

### Requirement: An exact copy of an own tour is not saved twice

Saving a new tour (not a new segment, without attachments) that matches one of the owner's tours
in every field they set, with a track through the same points or neither with a track, SHALL NOT
create a second tour: the existing tour SHALL open with a notice saying the user already has it,
and the copy's uploaded track SHALL be removed. A track that can't be loaded counts as different.

#### Scenario: A ski route planned twice

- **WHEN** the user plans the same ski route as a tour twice and saves both times without changing anything
- **THEN** only one tour SHALL exist, and the second save SHALL open it with the notice

#### Scenario: Something changed

- **WHEN** the second plan gets a planned date before it is saved
- **THEN** it SHALL be saved as a tour of its own

#### Scenario: The track can't be compared

- **WHEN** the existing tour's track can't be loaded (offline, never cached)
- **THEN** the new tour SHALL be saved as usual
