# friend-tour-visibility Specification

## Purpose
Per-tour `private` / `friends` visibility and the two-layer read model for friends: friends see friends-visible tours, and only marked partners see the gated details (dates, GPX, attachments, partner roster), delivered live via a per-viewer broadcast topic.
## Requirements

### Requirement: Per-tour visibility setting
Each tour SHALL carry a `visibility` value of either `private` or `friends`, defaulting to `friends` on creation. Only the tour owner SHALL be able to read or change a tour's visibility. The value SHALL be settable both at creation (tour form) and afterwards (tour info sheet).

#### Scenario: Default visibility on creation
- **WHEN** a tour is created without an explicit visibility
- **THEN** its `visibility` is persisted as `friends`

#### Scenario: Owner sets a tour private
- **WHEN** the owner toggles a tour to `private` in the form or info sheet
- **THEN** `visibility = 'private'` is persisted and the tour is no longer readable by any friend

#### Scenario: Non-owner cannot change visibility
- **WHEN** a user who is not the owner attempts to update a tour's visibility
- **THEN** the write is rejected (no direct UPDATE privilege; `update_tour_full` raises for a non-owner) and the value is unchanged

#### Scenario: Invalid visibility value rejected
- **WHEN** a write sets `visibility` to any value other than `private` or `friends`
- **THEN** the database check constraint rejects the write

### Requirement: Friend tour read authorization
A user SHALL be able to read a tour they do not own only when an accepted friendship exists between them and the owner AND the tour's `visibility` is `friends`. Owners SHALL always read their own tours regardless of visibility. Private tours SHALL be invisible to everyone except the owner, including marked partners.

#### Scenario: Friend reads a friends-visible tour
- **WHEN** user B, a friend of owner A, queries A's tour with `visibility = 'friends'`
- **THEN** the tour row is returned

#### Scenario: Private tour hidden from a partner friend
- **WHEN** user B is a marked partner on owner A's tour but the tour is `private`
- **THEN** the tour row is not returned to B

#### Scenario: Non-friend cannot read another user's tour
- **WHEN** user C, who has no friendship with owner A, queries A's `friends`-visible tour
- **THEN** no row is returned

#### Scenario: Friendship removed revokes access
- **WHEN** the friendship between A and B is removed
- **THEN** B can no longer read A's tours

### Requirement: Non-partner detail gating

The friend-read view SHALL never expose the owner's raw `partner_ids`. When a friend who is NOT a marked partner on a tour reads it, the system SHALL additionally withhold the partner **names**, `planned_date`, `end_date`, and `gpx_filepath` (returned as empty/null). Partner status SHALL be derived live by resolving the tour's partner contacts to registered users (tour_partners → contacts → contact_methods phone → registered user), without a materialized link table. Owners and partner-friends SHALL receive the full, ungated tour.

`end_date` SHALL be gated by exactly the same predicate as `planned_date`: a viewer who may not learn when a tour starts SHALL NOT learn how long it lasts.

Code that runs as the client (the friend-read view, the partner-friend RLS and storage policies) SHALL only learn whether the **caller** is a partner (`is_tour_partner`). The resolved partner user-id set (`tour_partner_user_ids`) SHALL NOT be client-callable; only server-side SECURITY DEFINER code (RPCs, notification jobs) uses it.

#### Scenario: Non-partner friend sees gated fields
- **WHEN** friend B reads owner A's `friends`-visible tour on which B is not a partner
- **THEN** the returned row has empty partner names, `planned_date` null, `end_date` null, and `gpx_filepath` null, while name/location/type remain visible

#### Scenario: Non-partner friend cannot read the roster directly
- **WHEN** friend B, not a partner on owner A's `friends`-visible tour, calls `tour_partner_user_ids` with that tour's id
- **THEN** the call is rejected with a permission error, and `is_tour_partner` for that tour returns false for B

#### Scenario: Partner friend sees full detail
- **WHEN** friend B reads a tour on which B is a marked partner (B's verified phone matches a partner contact)
- **THEN** the returned row includes the partner names, `planned_date`, `end_date`, and `gpx_filepath`

#### Scenario: Owner read is never gated
- **WHEN** owner A reads their own tour
- **THEN** all fields are returned regardless of partner resolution

#### Scenario: Partner contact phone removed downgrades detail
- **WHEN** the partner contact linking friend B to a tour loses its matching phone
- **THEN** B is no longer resolved as a partner and subsequent reads gate the partner names, `planned_date`, `end_date`, and `gpx_filepath`

### Requirement: Partner representation for friend viewers
For a friend viewer, partners on a tour SHALL be represented as registered-user profile names (resolved from each partner contact's verified phone), never as the owner's raw contact IDs. The owner's non-registered address-book contacts SHALL NOT be exposed to friends. The owner's own view SHALL continue to render partners from their address book unchanged.

The partner roster SHALL be resolved by a tour-scoped resolver that returns the **full** set of registered partners once the viewer is authorized as a partner-friend of the tour — it SHALL NOT be filtered by whether the viewer is individually friends with each co-partner (co-partners are friends of the owner, not necessarily of each other). The viewer's own entry in the roster SHALL be displayed as "Me" rather than their profile name.

#### Scenario: Friend sees registered partners by name
- **WHEN** a partner-friend reads a tour whose partners include registered users and non-registered address-book contacts
- **THEN** only the registered users are returned, by profile name, and the non-registered contacts are omitted

#### Scenario: Co-partner the viewer does not personally know is still shown
- **WHEN** a partner-friend reads a tour whose roster includes another registered partner they are not personally friends with
- **THEN** that co-partner is still returned by profile name (the roster is not gated by the viewer's own friendships)

#### Scenario: Viewer's own roster entry is labelled "Me"
- **WHEN** a partner-friend reads a tour they are themselves a partner on
- **THEN** their own entry in the partner roster is displayed as "Me" instead of their first and last name

#### Scenario: Owner view unchanged
- **WHEN** the owner views their own tour
- **THEN** partners render from the owner's address book exactly as before

### Requirement: GPX and attachment file access for partner friends
GPX track files **and tour attachments** SHALL be readable by a partner-friend of the owner when the tour is `friends`-visible, and SHALL remain blocked for non-partner friends and for private tours. Access SHALL be enforced at the storage layer (not only by gating the path in the read view); attachment **metadata rows** (`tour_attachments`) SHALL likewise be readable by partner-friends while writes stay owner-only.

Owner-only write isolation SHALL be preserved when a partner suggests a file: the partner writes only into their **own** uid prefix, and the tour owner gains SELECT solely on objects referenced by a suggestion on their own tour. No policy SHALL grant any user write access to another user's prefix.

Every cross-user read grant SHALL also pin the object's first path segment: partner-friend grants only match objects under the tour **owner's** uid prefix, and suggestion grants only match objects under the **suggester's** uid prefix. The paths these grants match on (`tours.gpx_filepath`, `tour_attachments.storage_path`, a suggestion's `storagePath`) are written by users, so without the pin a crafted path could expose a third user's private object.

#### Scenario: Partner friend downloads the GPX
- **WHEN** a partner-friend requests the GPX object of a friends-visible tour they are a partner on
- **THEN** the storage policy permits the download

#### Scenario: Partner friend reads attachments
- **WHEN** a partner-friend opens a friends-visible tour they are a partner on
- **THEN** the `tour_attachments` rows and their storage objects are readable, so attachments render

#### Scenario: Non-partner friend blocked from GPX and attachments
- **WHEN** a non-partner friend requests the GPX object or attachment rows/objects of a friends-visible tour
- **THEN** the storage policy and table RLS deny access

#### Scenario: Private tour files blocked
- **WHEN** any non-owner requests the GPX object or attachments of a private tour
- **THEN** the storage policy and table RLS deny access

#### Scenario: Crafted path to a third user's object is denied
- **WHEN** a tour's `gpx_filepath` or attachment `storage_path`, or a suggestion's `storagePath`, names an object under a third user's prefix
- **THEN** no partner-friend or suggestion grant permits reading that object

#### Scenario: Partner cannot write into the owner's prefix
- **WHEN** a marked partner attempts to upload directly into the tour owner's storage prefix
- **THEN** the storage policy denies the write, and staging under the partner's own prefix remains the only path

### Requirement: Friend tours on the map
The map SHALL display, in addition to the user's own tours, the friend tours the user is a **marked partner** on. Friend tours the user may read but is not a partner on SHALL NOT get a marker (they remain listed in the Friends tab). Friend markers SHALL carry a friendship indicator within the marker, participate in clustering, and otherwise behave like owned-tour markers. A partner friend tour colliding with an owned tour (see `tour-collision-handling`) SHALL be suppressed in favour of the owned marker, except while it is the selected tour, when it replaces the owned marker(s) it collides with.

#### Scenario: Partner friend tour rendered with indicator
- **WHEN** the map loads and the user is a partner on a friend's `friends`-visible tour
- **THEN** the tour appears as a marker with a friendship indicator and is included in clustering

#### Scenario: Non-partner friend tour has no marker
- **WHEN** a friend has a `friends`-visible tour on which the user is not a partner
- **THEN** the tour has no map marker but is listed in the Friends tab in gated form

### Requirement: Owned and friends list tabs
The tour list ("My Tours") SHALL default to owned tours and SHALL present two separate tabs — Owned and Friends — with no merged list. Search and filtering SHALL operate independently within each tab. The Friends tab SHALL list all friend tours the user is permitted to read, with non-partner tours shown in gated form.

#### Scenario: Default tab is owned
- **WHEN** the user opens the tour list
- **THEN** the Owned tab is active and shows only the user's own tours

#### Scenario: Friends tab lists gated and full friend tours
- **WHEN** the user switches to the Friends tab
- **THEN** partner friend tours show full detail and non-partner friend tours show gated fields, each labeled by owner

#### Scenario: Search scoped to active tab
- **WHEN** the user enters a search term while the Friends tab is active
- **THEN** only friend tours are filtered and owned tours are unaffected

#### Scenario: Active tab remembered across detail navigation
- **WHEN** the user opens a tour from the Friends tab, views its detail, then returns to the list
- **THEN** the Friends tab is restored (the last-viewed tab persists for the session), not reset to Owned

### Requirement: Unresolved partner count for partner viewers

The friend-read view SHALL expose, to partner-viewers only, an `unresolved_partner_count`: the number of distinct partner **contacts** on the tour that do NOT resolve to a confirmed-phone registered user (the same resolution chain used for partner names: `tour_partners → contact_methods phone → confirmed registered user`). The count SHALL be 0 for non-partner viewers and SHALL never reveal any identity (name, contact, or phone) of the unresolved partners. The count SHALL be computed by a tour-scoped resolver guarded identically to the partner-name resolver (the tour is `friends`-visible, the caller is a marked partner, and a friendship with the owner exists); the resolver SHALL return 0 when that guard fails.

The tour info sheet SHALL render a single generic pill reading "and X more" (pluralized, localized) alongside the named partner chips when, and only when, the count is at least 1. The pill SHALL appear for partner-viewers of a friend tour; it SHALL NOT appear on the owner's own view of a tour, nor for non-partner friends.

#### Scenario: Partner viewer sees count of unresolvable partners

- **WHEN** a partner-friend reads a friends-visible tour whose partners include 3 registered users and 2 contacts that resolve to no confirmed-phone user
- **THEN** the row returns the 3 names and `unresolved_partner_count = 2`

#### Scenario: Generic pill rendered for the unresolved count

- **WHEN** the partner-friend opens that tour's info sheet
- **THEN** the 3 partner names render as chips and a single pill "and 2 more" is shown

#### Scenario: No pill when all partners resolve

- **WHEN** a partner-friend reads a tour where every partner contact resolves to a confirmed-phone user
- **THEN** `unresolved_partner_count = 0` and no "and X more" pill is rendered

#### Scenario: Non-partner friend never receives the count

- **WHEN** a non-partner friend reads a friends-visible tour with unresolvable partner contacts
- **THEN** `unresolved_partner_count = 0` and no partner information (names or pill) is shown

#### Scenario: Owner view never shows the pill

- **WHEN** the owner views their own tour
- **THEN** partners render from the owner's address book and no "and X more" pill is shown

#### Scenario: Count is identity-free

- **WHEN** the unresolved count is exposed to a partner-viewer
- **THEN** the response contains only an integer count, never the name, contact id, or phone of any unresolved partner

### Requirement: Realtime delivery of friend tour changes

The system SHALL deliver friend-tour create / edit / delete / visibility-flip to authorized viewers in real time, so the Friends list, friend map markers, and the collision/tour-link disclaimer update without a page reload. Because friend visibility (accepted friendship AND `visibility='friends'`, with per-viewer partner detail gating) cannot be expressed as a `postgres_changes` row filter, delivery SHALL use a server-side trigger that routes a signal to a per-viewer private broadcast topic.

Friend-set changes (accept / remove) carry no `tours` write, so they SHALL refetch friend tours through two complementary paths: the **counterparty** (whose `friendUserIds` changes only via the realtime-driven `fetchAll`) reacts to a `tours-store` watch on `friendshipsStore.friendUserIds`; the **acting user** (who mutated the friendship locally) cannot rely on that watch — their optimistic `friendUserIds` update fires the watch BEFORE the row commits, so they SHALL additionally refetch from a `friendshipsStore.$onAction` `after` hook on `accept` / `removeFriendship` (post-commit). `loadFriendTours` SHALL be guarded by a monotonic request token so a slow premature fetch can never overwrite a later, post-commit result.

#### Scenario: Friend-visible tour created appears for authorized viewer
- **WHEN** owner A creates a tour with `visibility='friends'` and B is A's accepted friend
- **THEN** B's `friendTours` (and the Friends tab + friend map markers) update within one debounce window, without a reload

#### Scenario: Collision disclaimer appears in realtime
- **WHEN** A and B (accepted friends) add tours that collide (same goal + activity)
- **THEN** B's `collision-notice.vue` "request to link" disclaimer appears in realtime, driven by the broadcast-triggered `loadFriendTours()` + tour-links refetch (the #198 motivating bug)

#### Scenario: Friend-visible tour deleted disappears for viewer
- **WHEN** A deletes a `visibility='friends'` tour
- **THEN** B receives a broadcast (computed from the OLD row's audience) and the tour is removed from B's friend collections

#### Scenario: Friends→private flip removes the tour for viewers
- **WHEN** A changes a tour from `visibility='friends'` to a non-friends visibility
- **THEN** A's accepted friends (the OLD audience) are notified, refetch `friend_tours_view`, and the now-private tour drops out — closing the documented "friends→private UPDATE not delivered" gap

#### Scenario: Hidden-tab gap reconciled on resume
- **WHEN** a viewer's tab was hidden (broadcast channel paused) while a friend edited a shared tour
- **THEN** on resume the `onSubscribed` callback refetches friend tours, reconciling any missed broadcast

#### Scenario: Counterparty sees a newly accepted friend's tours immediately
- **WHEN** a friendship is accepted by the other party while the viewer (the counterparty, who did not perform the accept) is signed in (no `tours` write occurs)
- **THEN** the viewer's `friendUserIds` updates via the realtime-driven `fetchAll`, the `tours-store` watch on `friendshipsStore.friendUserIds` fires `loadFriendTours()`, and the new friend's `friends`-visible tours (and tours where the viewer is a partner) appear on the Friends tab + map without a reload

#### Scenario: Acting user sees the new friend's tours after their own accept
- **WHEN** the viewer themselves accepts (or removes) a friendship — their `friendUserIds` is mutated optimistically before the DB row commits, so the `friendUserIds` watch fires a premature `loadFriendTours()` against `friend_tours_view` before the friendship exists
- **THEN** a `friendshipsStore.$onAction` `after` hook on `accept` / `removeFriendship` runs `loadFriendTours()` post-commit, and the friend collections reflect the change without a reload

#### Scenario: Stale premature refetch cannot blank friend tours
- **WHEN** a premature (pre-commit) `loadFriendTours()` and a later post-commit `loadFriendTours()` are in flight concurrently and the premature one resolves last with an empty/stale result
- **THEN** the monotonic request-token guard discards the stale result and only the latest-initiated fetch assigns `friendTours`

#### Scenario: Unfriended user's tours drop immediately
- **WHEN** a friendship is removed
- **THEN** the counterparty's `friendUserIds` watch (and the acting user's `$onAction` post-commit refetch) re-run `loadFriendTours()` and the ex-friend's tours disappear from the viewer's friend collections

### Requirement: Friend-tour broadcast carries no unauthorized data

The friend-tour broadcast SHALL be signal-only: it MUST NOT carry tour detail fields. Viewers SHALL obtain tour data by refetching through `friend_tours_view` and the friend-tour RPCs, so Layer-1 row visibility and Layer-2 non-partner detail gating (`planned_date` / `end_date` / `gpx_filepath` / partner names) are enforced by RLS on every datum. The mechanism MUST NOT leak the existence or detail of a tour the viewer is not authorized to read.

#### Scenario: Non-partner detail stays gated after a broadcast
- **WHEN** a non-partner friend receives a broadcast and refetches
- **THEN** `planned_date`, `end_date`, `gpx_filepath`, and raw partner identities remain nulled/reduced exactly as `friend_tours_view` already enforces

#### Scenario: Private tour never broadcasts
- **WHEN** owner A writes a tour whose visibility is and was not `friends` (e.g. private→private)
- **THEN** no friend-tour broadcast is emitted, and no viewer learns the tour exists

#### Scenario: Harmless poke to an unauthorized recipient
- **WHEN** a viewer receives a broadcast but is (by a race) no longer authorized to read the tour
- **THEN** the refetch through `friend_tours_view` returns nothing for that tour and no unauthorized data is exposed

### Requirement: Friend-tour broadcast audience is the owner's accepted friends

The trigger on `public.tours` SHALL compute the broadcast audience as the owner's accepted friends (from `public.friendships`, both directions) and emit a `refetch` signal to topic `friend-tours:<friendUserId>` for each, whenever the tour is or was `visibility='friends'`. Partner gating SHALL NOT be applied to the audience (it affects detail, not row existence, and is enforced by the view on refetch).

#### Scenario: Each accepted friend is notified, non-friends are not
- **WHEN** A writes a `visibility='friends'` tour with accepted friends B and C and non-friend D
- **THEN** exactly B and C receive a poke on their own topics; D receives nothing

#### Scenario: Audience for delete/flip uses the OLD row
- **WHEN** the change is a DELETE or a friends→private UPDATE
- **THEN** the audience is derived from the OLD row so viewers who could previously see the tour are notified to drop it

### Requirement: Per-viewer topic authorization on realtime.messages

Friend-tour topics SHALL be private broadcast channels named `friend-tours:<userId>`. An RLS policy on `realtime.messages` SHALL permit a session to receive on `friend-tours:<userId>` only when `auth.uid()` equals that `<userId>`. No user may subscribe to another user's friend-tour topic.

#### Scenario: Foreign topic delivers nothing
- **WHEN** a session for user X subscribes to `friend-tours:<Y>` (Y ≠ X)
- **THEN** it receives no messages

#### Scenario: Own topic delivers the poke
- **WHEN** a session for user X subscribes to `friend-tours:<X>` and an authorized friend-tour change occurs
- **THEN** it receives the `refetch` broadcast

### Requirement: Friend-tour realtime uses a shared broadcast primitive

Friend-tour realtime MUST be wired through a shared `src/core/realtime/use-realtime-broadcast.ts` primitive — features MUST NOT call `supabase.channel(...)` directly. The primitive SHALL key channels by topic with module-level refcount dedupe, pause channels while the page is hidden (battery), reuse the singleton `TOKEN_REFRESHED` `setAuth` handler, debounce `onMessage`, and run `onSubscribed` after every (re-)subscribe so a full friend-tour refetch closes any missed-broadcast gap.

#### Scenario: Store consumes the primitive
- **WHEN** `tours-store` wires friend-tour realtime
- **THEN** it invokes `use-realtime-broadcast` on topic `friend-tours:${currentUserId}` and no direct `supabase.channel` call exists in the feature

#### Scenario: Handler drives only loadFriendTours
- **WHEN** the channel reaches `SUBSCRIBED`, or a `refetch` broadcast arrives
- **THEN** `loadFriendTours()` runs (debounced for the message path) and the handler does NOT call tour-links `fetchAll()` directly — tour-links reconciles via its existing `watch(friendTours)`

#### Scenario: Redundant tour-links piggyback removed
- **WHEN** a `tour_link_*` realtime event is handled in `tour-links-store`
- **THEN** it no longer calls `toursStore.loadFriendTours()` (that push now belongs to the friend-tour broadcast / friend-set watch)

### Requirement: Friend-tour broadcast handler MUST NOT dispatch notifications

The friend-tour broadcast handler MUST NOT trigger any notification dispatch (push or email). Realtime remains UI-sync only; `tour_updates` events are recorded by the database inside the tour write RPCs (see `notification-inbox`).

#### Scenario: No notification dispatch from the broadcast handler
- **WHEN** a friend-tour `refetch` broadcast is received
- **THEN** no notification dispatch function is invoked from the handler

### Requirement: Friend tour owner attribution

A friend tour SHALL name its owner on both the tour list row and the tour detail sheet,
using the same resolved name in both places. The name SHALL be the name under which the
viewer has saved that user in their own contacts, matched by the user's registered phone
number — every friendship resolves to a contact by construction, so no second naming
source is consulted. Where no contact resolves, a generic "a friend" fallback SHALL be
shown so the owner line always has content; a contact whose name resolves to an empty
string SHALL be treated as not resolving. Owner attribution SHALL apply to friend tours
only — a tour the viewer owns SHALL NOT display an owner.

#### Scenario: Owner named by the viewer's contact

- **WHEN** the viewer opens a friend tour whose owner is saved in the viewer's contacts
  under a different name than the owner's profile name
- **THEN** both the list row and the detail sheet show the contact name, and the owner's
  profile name is not used as a source anywhere in the tour list or detail sheet

#### Scenario: Contact match by non-normalized phone

- **WHEN** the owner's contact stores their phone in local format rather than E.164
- **THEN** the contact still matches the owner's registered number and its name is shown

#### Scenario: No contact resolves

- **WHEN** the owner's registered phone number matches no contact — the broken-link state
  where a user changed their verified number
- **THEN** the generic "a friend" fallback is shown, and the owner line is still present

#### Scenario: List and detail agree

- **WHEN** the viewer opens a friend tour from the friends list
- **THEN** the owner name in the detail sheet is identical to the one on the row it was
  opened from

#### Scenario: Own tour has no owner line

- **WHEN** the viewer opens one of their own tours
- **THEN** no owner attribution is rendered on the row or in the detail sheet

#### Scenario: Partner named by contact where obtainable

- **WHEN** a friend tour lists a partner who is also a friend of the viewer and saved in
  their contacts
- **THEN** that partner is named by the contact name rather than by their profile name

#### Scenario: Partner the viewer is not connected to

- **WHEN** a friend tour lists a partner the viewer has no friendship or pending request
  with, so no phone number is obtainable for them
- **THEN** the server-resolved profile name is shown, and the partner is not reduced to a
  generic fallback

#### Scenario: Gated non-partner tour still names its owner

- **WHEN** the viewer opens a friend tour they are not a partner on, shown in gated form
- **THEN** the owner is named exactly as on a partner-visible tour — owner identity is not
  part of what the gating withholds

#### Scenario: Owner name is searchable

- **WHEN** the viewer types the owner's contact name into the search field on the Friends
  tab
- **THEN** that owner's tours match, resolved from the same source the row displays

### Requirement: Owner name is rendered once, never replaced

The owner name SHALL be written to the screen exactly once per tour, in its final resolved
form. The system SHALL NOT render the fallback and then replace it with a resolved name.
Until the phone lookup has settled — resolved **or** failed — and the viewer's contacts
have loaded at least once, the owner slot SHALL hold a placeholder occupying the same line
box as the final text, so that its replacement causes no reflow. The placeholder SHALL be
exposed as decorative to assistive technology. A lookup failure SHALL count as settled, so
the placeholder SHALL NOT persist indefinitely when the lookups cannot complete.

#### Scenario: No name flip during resolution

- **WHEN** the phone lookup settles before the viewer's contacts have finished loading
- **THEN** the fallback is never displayed; the slot holds the placeholder until the
  contacts are loaded, and then shows the contact name

#### Scenario: Contacts not yet loaded on a cold start

- **WHEN** the owner slot renders before the contacts collection has begun loading, so no
  contact could match yet
- **THEN** the slot holds the placeholder rather than treating the empty collection as a
  settled "no contact" result

#### Scenario: Placeholder does not shift the layout

- **WHEN** the placeholder is replaced by the resolved owner name
- **THEN** the row's height and the surrounding content's position are unchanged

#### Scenario: All lookups fail

- **WHEN** every lookup needed to resolve the owner rejects
- **THEN** the placeholder is replaced by the generic "a friend" fallback rather than
  remaining on screen

#### Scenario: Warm lookups skip the placeholder

- **WHEN** the owner's phone is already known locally and the contacts are loaded
- **THEN** the final name renders on first paint without a visible placeholder step

#### Scenario: Concurrent rows do not multiply lookups

- **WHEN** several friend-tour rows owned by the same user render at the same time, before
  any lookup for that user has returned
- **THEN** a single lookup is issued for that user and every row resolves from it

### Requirement: Partner status gates the right to suggest

Marked-partner status, already the gate for reading a tour's detail, SHALL additionally
gate the right to create suggestions on that tour. The predicate SHALL be re-evaluated on
every suggestion mutation, and its loss SHALL void pending suggestions.

#### Scenario: Losing partner status revokes suggesting
- **WHEN** the contact linking a partner to a tour loses its matching phone
- **THEN** that user can no longer create suggestions on the tour and their pending suggestions are voided

#### Scenario: Friendship removal voids pending suggestions
- **WHEN** the friendship between the owner and a suggesting partner is removed
- **THEN** the partner's pending suggestions move to `withdrawn` and no longer appear in the owner's review sheet

#### Scenario: Tour going private voids pending suggestions
- **WHEN** the owner switches a tour with pending suggestions to `private`
- **THEN** those suggestions move to `withdrawn`
