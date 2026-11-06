## Purpose

CRUD for personal contacts the user manages locally and links to tours and friend requests.

## Requirements

### Requirement: A contact method value is unique to one contact per user

A `contact_methods` value SHALL belong to at most one contact per user. The system
MUST enforce this at the database with a unique index over
`(user_id, method_type, value)` on `public.contact_methods`, covering both
`phone` and `email` method types. Phone values are compared in their stored
normalised E.164 form. This is in addition to the existing per-contact uniqueness
constraint.

#### Scenario: Second contact with the same phone is rejected by the DB
- **WHEN** a user inserts a `phone` `contact_method` whose normalised value already exists on another of that user's contacts
- **THEN** the insert fails with a unique-violation (`23505`) on the per-user index

#### Scenario: Same number across different users is allowed
- **WHEN** two different users each add a contact holding the same phone number
- **THEN** both inserts succeed (uniqueness is scoped per user, not globally)

#### Scenario: Pre-existing duplicates are collapsed before the index is built
- **WHEN** the migration runs and a `(user_id, method_type, value)` group has more than one row
- **THEN** the row with `is_primary = true` is kept if present, otherwise the lowest `id`, and the remaining duplicate rows are deleted
- **AND** any contact left with phone methods but no primary has its lowest-`id` phone set `is_primary = true`

### Requirement: Creating a contact with its methods is atomic

Creating a new contact together with its contact methods MUST be atomic: if any
method insert fails (including a per-user duplicate violation), the contact row MUST
NOT be persisted. No partial contact is ever created.

#### Scenario: Duplicate that slips past the pre-check leaves no orphan contact
- **WHEN** a new contact is created and one of its phones violates the per-user unique index at insert time
- **THEN** neither the contact row nor any of its methods are persisted, and the duplicate disclaimer is surfaced

### Requirement: A contact method's type is immutable

The system MUST reject any update that changes an existing `contact_methods` row's
`method_type`. Changing type in place would break a phone link (and its friend
relationship) without tripping the value-change break-point.

#### Scenario: Changing a method's type is rejected
- **WHEN** an update sets a `contact_methods` row's `method_type` to a different value
- **THEN** the update is rejected by the database

### Requirement: Adding a duplicate contact method surfaces an edit-instead disclaimer

The UI MUST show a disclaimer when a user attempts to add a contact or a contact
method whose value already exists on another of their contacts, stating the contact
could not be added because a contact with that value already exists, and offering
two actions: open the existing contact in edit mode, or discard. The value MUST NOT
be silently inserted onto a second contact.

#### Scenario: New contact blocked when any phone duplicates another contact
- **WHEN** the user submits the new-contact form and any one of its phones already belongs to another of their contacts
- **THEN** the whole save is blocked (no partial creation), and a disclaimer states the contact could not be added because a contact with that number already exists

#### Scenario: Edit-existing opens the conflicting contact in edit mode
- **WHEN** the user chooses "edit existing" on the disclaimer
- **THEN** the conflicting contact opens in edit mode and the in-progress draft is abandoned

#### Scenario: Discard abandons the whole draft
- **WHEN** the user chooses "discard" on the disclaimer
- **THEN** the entire in-progress contact draft is abandoned

#### Scenario: Duplicate detected when adding a method to an existing contact
- **WHEN** the user adds a phone/email to contact X that already exists on contact Y
- **THEN** the disclaimer is shown and the method is not added to contact X

#### Scenario: DB unique violation degrades to a generic disclaimer
- **WHEN** a duplicate slips past the client pre-check (e.g. stale local cache) and the insert returns a `23505` on the per-user index
- **THEN** the error is surfaced as a generic "already exists" disclaimer with a discard action only (the conflicting contact is not named), not a raw database error

### Requirement: Editing a phone method that links a friend/pending user warns before saving

The edit UI MUST show a warning, and MUST require explicit confirmation before
persisting the new value, when the user edits a phone `contact_method` whose current
(old) value resolves to a friend or to a user with a pending friend request — the
warning stating that saving will remove that friendship / cancel that pending request.

#### Scenario: Warning shown when the edited phone links a friend
- **WHEN** the user changes the value of a phone method whose old value resolves to a confirmed friend
- **THEN** a warning is shown and the update is not sent until the user confirms

#### Scenario: Warning shown when the edited phone links a pending request
- **WHEN** the user changes the value of a phone method whose old value resolves to a user with a pending request
- **THEN** a warning is shown and the update is not sent until the user confirms

#### Scenario: No warning when the edited phone links no relationship
- **WHEN** the user changes a phone value whose old value resolves to no friend and no pending request
- **THEN** the update is saved without a warning

#### Scenario: Duplicate check precedes the eviction warning
- **WHEN** the user edits a phone to a NEW value that duplicates another of their contacts, and the OLD value links a friend/pending user
- **THEN** the duplicate disclaimer is shown and the edit is stopped, and the friend-eviction warning is NOT shown (the edit cannot commit)

#### Scenario: Edit never auto-creates a relationship toward the new value
- **WHEN** the user edits a phone to a NEW value that resolves to a registered user who is not yet a friend
- **THEN** no friend request or friendship is created toward that user by the edit

### Requirement: A cancelled or blank add-method draft never blocks saving the contact

The form-level "save all" on the contact detail view MUST NOT fail because of an
add-method draft that was cancelled or left blank. A stale add-method error MUST be
cleared when the add-method form is cancelled, and the save's failure check MUST
only consider the add-method error while the add-method form is open.

#### Scenario: Cancel a blank add-method draft then save succeeds
- **WHEN** the user opens the add-method form, leaves it blank or triggers its required-value error, cancels it, then presses save on the contact
- **THEN** the contact saves successfully (no stale error), and the network responses being `200 OK` are reflected as success

#### Scenario: Blank add-method form is discarded on save
- **WHEN** the user presses "save all" with the add-method form open but its value empty
- **THEN** the empty draft is discarded and the rest of the contact saves without error

#### Scenario: An open add-method form with an invalid value still blocks save
- **WHEN** the user presses "save all" with the add-method form open and a non-empty but invalid value
- **THEN** the save is blocked and the add-method error is shown

### Requirement: Delete-contact confirmation warns about friendship and pending-request side effects

When the user initiates contact deletion, the confirmation UI MUST detect whether deleting that contact will (a) cancel any pending `friend_requests` and/or (b) remove any existing `friendships` row between the current user and any registered user linked through the contact's phone `contact_methods`. If either applies, the confirmation dialog MUST display a localized warning identifying the side effect (pending request cancellation, friendship removal, or both).

#### Scenario: Warning shown when pending request exists
- **WHEN** the user opens the delete-contact confirmation for a contact whose phone resolves to a registered user with a pending friend request between the parties (and no friendship)
- **THEN** the confirmation dialog displays the localized "pending friend request will be cancelled" warning in addition to the standard delete message

#### Scenario: Warning shown when friendship exists
- **WHEN** the user opens the delete-contact confirmation for a contact whose phone resolves to a registered user with an existing friendship (and no pending request)
- **THEN** the confirmation dialog displays the localized "existing friendship will be removed" warning in addition to the standard delete message

#### Scenario: Warning shown when both exist
- **WHEN** both a pending request and a friendship exist for the contact's linked user
- **THEN** the confirmation dialog displays the localized combined warning

#### Scenario: No warning when no relationship
- **WHEN** the contact's phones do not resolve to a registered user, or resolve but no pending request and no friendship exist
- **THEN** the confirmation dialog shows only the standard delete message, with no relationship warning

#### Scenario: Confirming the delete performs cleanup
- **WHEN** the user confirms deletion of a contact for which the warning was displayed
- **THEN** the contact is deleted and the database removes the corresponding `friendships` row(s) and/or terminates pending `friend_requests` (per the `friendships` capability)

### Requirement: Contacts store

A Pinia store (`useContactsStore`) SHALL manage the list of contacts (including their contact methods) with reactive `contacts`, `isLoading`, and `error` state. The `addContact` action SHALL accept multiple phone entries, enforce the single-primary invariant, and write the contact and its methods as one aggregate (`create_contact_full`, client-minted ids) through the `mutate()` seam, so it also queues offline.

#### Scenario: Auto-load on authentication

- **WHEN** the auth store transitions to authenticated
- **THEN** the contacts store SHALL automatically fetch all contacts with their contact methods

#### Scenario: Add contact with multiple phones

- **WHEN** `addContact(firstName, lastName?, displayName?, phones?)` is called with `phones = [{ value: v1, isPrimary: true }, { value: v2, isPrimary: false }]`
- **THEN** the store SHALL write the contact and both phone methods in one `create_contact_full` call — the first with `is_primary = true`, the second with `is_primary = false` — add the returned contact to the local list, and re-sort by firstName

#### Scenario: Add contact with one phone

- **WHEN** `addContact` is called with `phones = [{ value, isPrimary: true }]`
- **THEN** the store SHALL create the contact and a single phone method with `isPrimary: true`

#### Scenario: Add contact without phone

- **WHEN** `addContact` is called with no `phones` or with an empty array
- **THEN** the store SHALL create the contact with empty `contactMethods` array

#### Scenario: Add contact with multiple phones but none primary

- **WHEN** `addContact` is called with `source: 'manual'` and two or more phones of which not exactly one is marked `isPrimary: true`
- **THEN** the store SHALL throw a validation error and SHALL NOT create the contact (with `source: 'import'` the primary is resolved from the phone labels instead)

#### Scenario: Store update reflects in list

- **WHEN** `updateContact` action completes successfully
- **THEN** the local contacts array is updated with the new data and re-sorted by first name

#### Scenario: Store delete reflects in list

- **WHEN** `deleteContact` action completes successfully
- **THEN** the contact is removed from the local contacts array immediately

#### Scenario: Clear on sign-out

- **WHEN** the auth store signs out
- **THEN** the contacts store SHALL clear its cached contacts list

### Requirement: Contact list item display

Each contact in the list SHALL display the resolved contact name (using existing `resolveContactName()` logic) and the primary phone number if available. Each row SHALL be tappable to navigate to the contact detail/edit view within the sheet.

#### Scenario: Contact with one phone number

- **WHEN** a contact has exactly one phone method
- **THEN** the list item shows the contact name and that phone number below it

#### Scenario: Contact with multiple phones

- **WHEN** a contact has multiple phone methods
- **THEN** the list item subtitle SHALL show the phone method marked `isPrimary: true`

#### Scenario: Contact without contact methods

- **WHEN** a contact has no contact methods (name only)
- **THEN** the list item shows the contact name with no secondary text

#### Scenario: Tap contact to open detail

- **WHEN** user taps a contact row in the list
- **THEN** the sheet navigates to the detail/edit view for that contact

### Requirement: Contacts list shows friendship icon

The contacts list row SHALL render a friendship icon next to the contact name when the contact is linked to an accepted friend, per the rule defined in the `contact-account-linking` capability. Implementation SHALL consume `useFriendshipsStore().friendUserIds` and SHALL NOT introduce a separate source of truth for friendship status.

#### Scenario: Linked contact shows icon

- **WHEN** a contact's normalized phone matches a friend user_id in the friendships store
- **THEN** the list row SHALL render the friendship icon

#### Scenario: Unlinked contact has no icon

- **WHEN** none of a contact's phones match any friend user_id
- **THEN** the list row SHALL NOT render the friendship icon

### Requirement: Delete disclaimer for linked contacts

When a user initiates deletion of a contact that is linked to an accepted friendship (i.e. one of the contact's phones matches a friend user ID), the delete confirmation UI SHALL display a warning that the friendship connection will also be removed. Upon confirming deletion, the system SHALL remove the friendship via the `removeFriendship` store action before deleting the contact. The friend icon SHALL no longer appear for that contact once the friendship is removed.

#### Scenario: Linked contact — disclaimer shown

- **WHEN** a user taps delete on a contact whose phone is linked to a TourenBuddy friendship
- **THEN** the confirmation state SHALL display a warning message explaining the friendship will be removed

#### Scenario: Linked contact — friendship removed on delete

- **WHEN** the user confirms deletion of a linked contact
- **THEN** the system SHALL call `removeFriendship(linkedFriendUserId)` and then delete the contact, and the friend icon SHALL no longer appear in the contacts list

#### Scenario: Unlinked contact — no disclaimer

- **WHEN** a user taps delete on a contact with no linked friendship
- **THEN** the confirmation state SHALL NOT show any friendship-related warning

### Requirement: Contacts store unaffected by friendship state

The contacts store SHALL NOT store, fetch, or cache friendship state. Friendship lookups SHALL remain in the `useFriendshipsStore`. The contacts list component SHALL combine the two stores reactively at the presentation layer.

#### Scenario: No friendship fields on contact entity

- **WHEN** a contact entity is read from the store
- **THEN** the entity SHALL contain no friendship-status fields

### Requirement: Realtime synchronization of contacts and contact methods

The system SHALL keep the authenticated user's contacts list — including phone/email `contact_methods` — in sync across the user's devices in real time, without a page reload, by subscribing to Supabase Realtime `postgres_changes` on `public.contacts` and `public.contact_methods`, each filtered to the authenticated user via `user_id=eq.${currentUserId}`.

#### Scenario: Contact created on device A appears on device B
- **WHEN** the user creates a contact on device A while device B is signed in as the same user
- **THEN** device B's contacts list reflects the new contact within one debounce window, without a page reload

#### Scenario: Contact field edit reflects on device B
- **WHEN** the user edits a contact's name / display name on device A
- **THEN** device B reflects the change within one debounce window

#### Scenario: Phone/email-only edit reflects on device B
- **WHEN** the user adds, edits, removes, or re-prioritises a phone/email on device A without otherwise touching the `contacts` row
- **THEN** device B receives the `contact_methods` event and refetches, so the method change is reflected within one debounce window

#### Scenario: Contact deleted on device A disappears on device B
- **WHEN** the user deletes a contact on device A
- **THEN** device B receives the DELETE event and removes the contact, and any tour partnered with that contact drops the partner id locally via the existing `tours-store.$onAction(deleteContact)` reconciler

#### Scenario: Subscription gated on auth
- **WHEN** the user is not authenticated
- **THEN** no Realtime channel for contacts is open

#### Scenario: Clean teardown on sign-out
- **WHEN** the user signs out
- **THEN** the contacts Realtime channel is removed and the local contacts list is cleared

### Requirement: Contacts store uses the shared realtime primitive

The `contacts-store` MUST NOT call `supabase.channel(...)` or `supabase.removeChannel(...)` directly. It SHALL wire Realtime via `src/core/realtime/use-realtime-subscription.ts`, supplying:
- a channel key of the form `contacts-${currentUserId}`,
- two bindings — `contacts` and `contact_methods` — each with `event: '*'` and filter `user_id=eq.${currentUserId}`,
- an `onChange` callback that debounces a full `loadContacts()` refetch,
- an `onSubscribed` callback that runs `loadContacts()` once after `SUBSCRIBED`.

#### Scenario: Store consumes the primitive
- **WHEN** the contacts store wires Realtime
- **THEN** it invokes `useRealtimeSubscription` and no direct `supabase.channel` / `supabase.removeChannel` call exists in the store

#### Scenario: Baseline fetch runs after SUBSCRIBED
- **WHEN** the channel reaches `SUBSCRIBED`
- **THEN** the primitive invokes `loadContacts()` exactly once per subscribe cycle

### Requirement: contact_methods carries a consistent denormalised user_id

`public.contact_methods` SHALL have a `user_id` column that is always equal to the `user_id` of the contact referenced by its `contact_id`. The value SHALL be derived server-side (a `BEFORE INSERT OR UPDATE` trigger reading the parent `contacts` row) and MUST NOT be trusted from client input. The invariant SHALL additionally be enforced declaratively by a composite foreign key `(contact_id, user_id) → contacts(id, user_id) ON DELETE CASCADE`, so it holds by construction independent of write path. To keep the PostgREST `contacts → contact_methods(*)` embed unambiguous, this composite FK SHALL REPLACE the single-column `contact_id` FK (exactly one relationship between the table pair). The column exists to enable a user-scoped Realtime filter; it does NOT replace or widen RLS — `contact_methods_select_own` remains the sole authorization gate.

#### Scenario: Insert derives user_id from the parent contact
- **WHEN** a `contact_methods` row is inserted (with any or no client-supplied `user_id`)
- **THEN** its stored `user_id` equals the `user_id` of the contact identified by `contact_id`

#### Scenario: Reparenting update keeps user_id consistent
- **WHEN** a `contact_methods` row's `contact_id` is updated to a contact owned by a different user
- **THEN** the trigger re-derives `user_id` to match the new parent contact's owner

#### Scenario: Mismatched pair is structurally rejected
- **WHEN** a write attempts (e.g. bypassing the trigger) to set `(contact_id, user_id)` to a pair that does not match a real contact
- **THEN** the composite foreign key rejects the write

#### Scenario: Embed stays unambiguous
- **WHEN** the client issues `from('contacts').select('*, contact_methods(*)')`
- **THEN** PostgREST resolves exactly one `contacts ↔ contact_methods` relationship and the embed succeeds

#### Scenario: No row ever drifts
- **WHEN** the consistency check `count(*) from contact_methods cm join contacts c on c.id = cm.contact_id where cm.user_id <> c.user_id` is run after any sequence of writes
- **THEN** the count is `0`

### Requirement: Realtime replication enabled for contacts tables

The database SHALL include `public.contacts` and `public.contact_methods` in the `supabase_realtime` publication, both with `REPLICA IDENTITY FULL`, RLS remaining the sole authorization gate (no policy widening).

#### Scenario: Tables are members of supabase_realtime
- **WHEN** the publication is inspected after migrations are applied
- **THEN** `public.contacts` and `public.contact_methods` are members of `supabase_realtime`

#### Scenario: Replica identity is FULL
- **WHEN** `pg_class.relreplident` is inspected for either table
- **THEN** the value is `'f'` (FULL), so DELETE/UPDATE payloads carry `user_id` for filter matching

#### Scenario: RLS still gates visibility
- **WHEN** an authenticated client subscribes on either table
- **THEN** it receives only events for rows its existing SELECT RLS policies already permit

### Requirement: Realtime handler MUST NOT dispatch notifications

Contacts Realtime event handlers MUST NOT trigger any notification dispatch (push or email). Realtime remains a UI-sync pathway only.

#### Scenario: No notification dispatch from Realtime
- **WHEN** any `postgres_changes` event for `contacts` / `contact_methods` is received
- **THEN** no notification dispatch function is invoked from the `onChange` handler

### Requirement: Contact detail header is titled and pinned

The contact detail view header — back control, title, close — SHALL be titled with the contact's
resolved name (the display name, else first and last name). It SHALL hold no Edit action: Edit
sits in the detail footer.

The header row SHALL remain pinned to the top of the overlay while the detail content below it is
scrolled, and SHALL occlude the content passing underneath it. It SHALL move with the surface
itself — dragging the bottom sheet up or down on mobile moves the header with the sheet.

#### Scenario: Title reflects read mode
- **WHEN** a contact is opened from the contacts list
- **THEN** the header title reads the contact's resolved name
- **AND** the header holds back and close only, no Edit

#### Scenario: Header stays put while content scrolls
- **WHEN** the user scrolls the detail content past the header's resting position
- **THEN** the back control, title, and close remain visible at the top
- **AND** the content scrolling past SHALL NOT show through the header

#### Scenario: Header travels with a dragged sheet
- **WHEN** the bottom sheet holding the detail view is dragged to another snap point
- **THEN** the header moves with the sheet rather than staying fixed to the viewport

### Requirement: A friend's tours from the contact detail

The detail view of a contact linked to an accepted friend, and not blocked, SHALL offer a "Tours" quick action in its hero, marked with the route icon (a path between two points) — not a location pin, which reads as a place. It SHALL open the tour list on the Friends tab with the search cleared and only the recorded-by filter set, to that friend. Other contacts SHALL NOT offer the action.

#### Scenario: Opening a friend's tours

- **WHEN** the user opens a friend's contact detail and activates "Tours"
- **THEN** the contacts overlay SHALL be replaced by the tour list on the Friends tab
- **AND** the list SHALL show only tours that friend recorded, with the recorded-by filter holding that friend and the filters badge showing 1

#### Scenario: Earlier list state does not leak in

- **WHEN** the Friends tab had a search query or other filters before
- **THEN** opening a friend's tours from the contact detail SHALL clear them first

#### Scenario: Not offered for other contacts

- **WHEN** the contact is not linked to a friend, or is blocked
- **THEN** the "Tours" action SHALL NOT be shown

#### Scenario: Not offered while editing

- **WHEN** the contact detail is in edit mode
- **THEN** the "Tours" action SHALL NOT be shown

#### Scenario: Action reads as tours

- **WHEN** the "Tours" action is shown
- **THEN** it SHALL carry the route icon, not a location pin

### Requirement: Contact detail opens with a hero

In view mode the contact detail SHALL open with a hero: the full name as a subtitle only when a
display name is set that differs from it, and the relationship status as an icon with a visible
label. The hero SHALL show no avatar (the contact list keeps its initials). View mode SHALL NOT
show a "Name" heading or First / Last / Display name rows; edit mode keeps its name fields.

#### Scenario: Name shown once
- **WHEN** a contact without a display name is opened
- **THEN** the name appears only as the header title, with no name rows and no subtitle

#### Scenario: Full name under a display name
- **WHEN** a contact with display name "Köbi", first name "Jakob" and last name "Tester" is opened
- **THEN** the header title reads "Köbi" and the hero subtitle reads "Jakob Tester"

#### Scenario: Friend status in words
- **WHEN** the contact is linked to an accepted friend and not blocked
- **THEN** the hero shows the friends icon with "Friend on TourenBuddy"

#### Scenario: No status for a plain contact
- **WHEN** the contact is neither a friend nor blocked, and has no differing display name
- **THEN** the hero shows no status line; the quick actions follow the header

### Requirement: Contact detail quick actions

Below the hero, view mode SHALL offer up to three labelled quick actions in one row of
equal-width targets at least 56px tall: Tours, Call and WhatsApp. Call and WhatsApp SHALL target
the first valid E.164 phone in primary-first order; the row SHALL be omitted when no action
applies.

#### Scenario: Calling from the hero
- **WHEN** the contact's primary phone is "+41790000002"
- **THEN** Call links to `tel:+41790000002` and WhatsApp opens `https://wa.me/41790000002` in a new tab

#### Scenario: No valid phone
- **WHEN** the contact has no valid E.164 phone
- **THEN** neither Call nor WhatsApp is shown

#### Scenario: Nothing to offer
- **WHEN** the contact has no valid phone and is not an unblocked friend
- **THEN** no quick-action row is rendered

#### Scenario: Hidden while editing
- **WHEN** the contact detail is in edit mode
- **THEN** no quick action is shown

### Requirement: Contact detail actions sit in the footer

In view mode the contact detail SHALL show Delete, Block and Edit as one row of equal-width,
text-labelled buttons at least 44px tall in the overlay's footer, in that order, on mobile and
desktop. Block SHALL follow the Block entry-point rules. A Delete or Block confirmation SHALL
replace the row in place. Edit mode SHALL show no such footer.

#### Scenario: Order and placement
- **WHEN** the detail of an unblocked friend is shown in view mode
- **THEN** the footer row reads Delete, Block, Edit from left to right, pinned below the scrolling content

#### Scenario: Edit from the footer
- **WHEN** the user activates Edit in the footer
- **THEN** the detail enters edit mode and the footer row is no longer shown

#### Scenario: Delete confirms in place
- **WHEN** the user activates Delete
- **THEN** the row is replaced by the delete confirmation with any friendship or pending-request warning
- **AND** Cancel restores the row

#### Scenario: One row on a phone
- **WHEN** a friend's detail is shown on a 360px-wide phone in `de-CH`
- **THEN** Delete, Block and Edit fit one row
