## Purpose

The user's own profile row (`user_profile`: first and last name, locale, notification preferences, onboarding gates) plus their verified phone on `auth.users`, with edit flows, validation, and cross-device realtime sync.

## Requirements

### Requirement: Own-phone deletion cascades to friendships and pending friend requests

`public.delete_own_phone()` MUST, in the same transaction in which it clears `auth.users.phone` / `phone_confirmed_at` for the caller, also:
- DELETE every `friendships` row where the caller is `request_user_id` or `response_user_id`;
- UPDATE every `friend_requests` row with `status = 'pending'` where the caller is `from_user_id` to `status = 'cancelled', responded_at = now()`;
- UPDATE every `friend_requests` row with `status = 'pending'` where the caller is `to_user_id` to `status = 'denied', responded_at = now()`.

Rows with `status` other than `'pending'` MUST NOT be modified.

#### Scenario: Own-phone delete removes all caller friendships
- **WHEN** the caller invokes `delete_own_phone()` while having one or more `friendships` rows
- **THEN** every such `friendships` row is deleted in the same transaction

#### Scenario: Own-phone delete terminates caller pending requests
- **WHEN** the caller invokes `delete_own_phone()` while having pending `friend_requests` rows in either direction
- **THEN** every such pending row is terminated using the cancelled (sender) / denied (recipient) rule

#### Scenario: Non-pending requests survive own-phone delete
- **WHEN** the caller has historical `friend_requests` rows with status `denied` or `cancelled`
- **THEN** those rows are not modified

### Requirement: Delete-own-phone confirmation warns about friendship and pending-request side effects

The user profile UI MUST extend the existing delete-own-phone confirmation (reverify disclaimer) with an additional localized warning when the caller has at least one existing `friendships` row and/or at least one pending `friend_requests` row at the time the dialog opens. The warning MUST identify the side effect (friendships will be removed, pending requests will be cancelled, or both).

#### Scenario: Warning shown when relationships exist
- **WHEN** the user opens the delete-own-phone confirmation while having any friendship or pending request
- **THEN** the confirmation dialog displays the localized side-effect warning in addition to the existing reverify disclaimer

#### Scenario: No relationship warning when none exist
- **WHEN** the user opens the delete-own-phone confirmation while having no friendships and no pending requests
- **THEN** only the existing reverify disclaimer is shown

#### Scenario: Confirming the delete performs cleanup
- **WHEN** the user confirms own-phone deletion for which the relationship warning was displayed
- **THEN** `delete_own_phone()` is invoked and the database performs friendship deletion and pending-request termination as specified

### Requirement: Notification preference fields on user profile
The user profile SHALL persist the email channel toggle and a list of muted notification types. Push enablement SHALL NOT be stored on the profile: it is per device, represented by the device's `push_subscriptions` row.

#### Scenario: New columns present
- **WHEN** a user profile is read
- **THEN** the result includes `notif_email_enabled: boolean` and `notif_muted_types: string[]`, and no account-wide push flag

#### Scenario: Defaults
- **WHEN** a profile row is created without explicit notification fields
- **THEN** email defaults to disabled and muted types defaults to empty

### Requirement: Profile preferences UI for notifications
The profile SHALL offer a Notifications view, reached from the Notifications row of the profile overview (which summarizes the active channels), exposing channel toggles, per-type mute switches, and the all-channels-off disclaimer.

#### Scenario: Renders toggles
- **WHEN** the user opens the Notifications view from the profile overview
- **THEN** it renders push channel, email channel, and per-type toggles for each supported notification type

#### Scenario: All channels off
- **WHEN** push and email are both disabled
- **THEN** the Notifications view shows the disclaimer warning the user may miss friend requests and other important updates, and the overview's Notifications row reads "Off"

#### Scenario: Overview summarizes channels
- **WHEN** the profile overview is shown
- **THEN** the Notifications row states which channels are on ("Push and email", "Push only", "Email only", or "Off")

### Requirement: Realtime synchronization of user profile state

The system SHALL keep the authenticated user's profile in sync across the user's devices in real time, without a page reload, by subscribing to Supabase Realtime `postgres_changes` on `public.user_profile`, filtered by `id=eq.${currentUserId}`. The filter MUST be on `id` (the primary key, equal to the auth user id) and NOT `user_id` — `user_profile` has no `user_id` column.

#### Scenario: Profile edit on device A reflects on device B
- **WHEN** the user changes a profile field (name, phone, locale, notification setting) on device A while device B is signed in as the same user
- **THEN** device B reflects the change within one debounce window, without a page reload

#### Scenario: Filter is on the id column
- **WHEN** the user-profile store wires its Realtime binding
- **THEN** the binding filter is `id=eq.${currentUserId}` (a `user_id`-based filter is a defect — it matches zero rows)

#### Scenario: Subscription gated on auth
- **WHEN** the user is not authenticated
- **THEN** no Realtime channel for the user profile is open

#### Scenario: Clean teardown on sign-out
- **WHEN** the user signs out
- **THEN** the user-profile Realtime channel is removed and local profile state is cleared

### Requirement: User-profile store uses the shared realtime primitive

The `user-profile-store` MUST NOT call `supabase.channel(...)` / `supabase.removeChannel(...)` directly. It SHALL wire Realtime via `src/core/realtime/use-realtime-subscription.ts`, supplying a channel key `user-profile-${currentUserId}`, a single binding on `user_profile` with `event: '*'` and filter `id=eq.${currentUserId}`, an `onChange` that debounces `loadProfile()`, and an `onSubscribed` that runs `loadProfile()` once after `SUBSCRIBED`.

#### Scenario: Store consumes the primitive
- **WHEN** the user-profile store wires Realtime
- **THEN** it invokes `useRealtimeSubscription` and no direct `supabase.channel` / `supabase.removeChannel` call exists in the store

#### Scenario: Baseline fetch runs after SUBSCRIBED
- **WHEN** the channel reaches `SUBSCRIBED`
- **THEN** the primitive invokes `loadProfile()` exactly once per subscribe cycle

### Requirement: Realtime replication enabled for user_profile

The database SHALL include `public.user_profile` in the `supabase_realtime` publication with `REPLICA IDENTITY FULL`, RLS remaining the sole authorization gate.

#### Scenario: Table is a member of supabase_realtime
- **WHEN** the publication is inspected after migrations are applied
- **THEN** `public.user_profile` is a member of `supabase_realtime` and its `relreplident` is `'f'`

#### Scenario: RLS still gates visibility
- **WHEN** an authenticated client subscribes on `user_profile`
- **THEN** it receives only events for its own profile row

### Requirement: Realtime handler MUST NOT dispatch notifications

User-profile Realtime event handlers MUST NOT trigger any notification dispatch. Realtime remains UI-sync only.

#### Scenario: No notification dispatch from Realtime
- **WHEN** any `postgres_changes` event for `user_profile` is received
- **THEN** no notification dispatch function is invoked from the `onChange` handler
