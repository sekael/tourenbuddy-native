## Purpose

Push and email notifications for friend requests, tour updates, and tour collaboration signals, gated by user preferences.

## Requirements

### Requirement: Disclaimer when notifications are effectively off
The system SHALL display a hint in the profile preferences UI when push is off on this device and email is disabled, informing the user they will not be alerted outside the app and that updates still collect in the in-app inbox.

#### Scenario: Both channels off
- **WHEN** push is off on this device and email is disabled
- **THEN** the preferences UI shows the hint pointing to the inbox

#### Scenario: At least one channel on
- **WHEN** push is on for this device or email is enabled
- **THEN** the hint is hidden

### Requirement: Web Push subscription registration
The system SHALL register a Web Push subscription per browser when the user enables push on that device and permission is granted, and SHALL support any number of devices per user, each receiving every push sent to that user.

#### Scenario: User grants permission
- **WHEN** the user enables push on this device and the browser grants permission
- **THEN** the client subscribes to Push using the VAPID public key and persists the resulting endpoint, p256dh, auth, and user agent in `push_subscriptions` for the current user

#### Scenario: Same browser already registered
- **WHEN** the same browser endpoint already exists for the user
- **THEN** the existing row is reused (unique on endpoint) and `last_seen_at` is refreshed

#### Scenario: Second device registers
- **WHEN** a user with push enabled on a desktop browser enables push on their phone
- **THEN** both subscriptions exist and a subsequent notification is pushed to both devices

#### Scenario: User disables push
- **WHEN** the user turns push off on their phone while it is on for their desktop
- **THEN** the client unsubscribes the phone's browser PushManager and deletes only the phone's row; the desktop keeps receiving push

#### Scenario: Endpoint previously owned by another account
- **WHEN** user B enables push in a browser whose endpoint is still registered to user A
- **THEN** the endpoint is reassigned to B and A no longer receives push on that browser

### Requirement: iOS PWA gating
The system SHALL hide the push toggle when the client is iOS Safari and the app is not running in standalone (installed PWA) mode, and SHALL replace the toggle with a compact "unavailable" indicator that exposes the install-to-home-screen guidance via an info-icon tooltip in desktop view and as inline text below the push label in mobile view (tooltips are desktop-only).

#### Scenario: iOS browser, not installed
- **WHEN** the user opens preferences in iOS Safari and `display-mode` is not `standalone`
- **THEN** the push toggle is hidden, a compact "Not available" badge is shown in its place and the install-to-home-screen guidance text is shown inline below the push label (mobile view) or in the info-icon tooltip (desktop view)

#### Scenario: iOS installed PWA
- **WHEN** the user opens preferences in an installed PWA on iOS 16.4+
- **THEN** the push toggle is shown and registration follows the standard Web Push flow

### Requirement: Compact unavailable indicator for push notifications
The notifications preferences UI SHALL present a single compact "unavailable" indicator in place of the push toggle whenever push notifications cannot be enabled on the current client — covering both the PWA-install-required case and the permission-denied case — and SHALL expose the full explanatory text through an info-icon tooltip in desktop view and as inline text below the push label in mobile view, where tooltips do not exist.

#### Scenario: Push permission denied
- **WHEN** the browser push permission state is `denied`
- **THEN** the push toggle is hidden and a compact "Not available" badge with an info-icon button is rendered in its place, in desktop view an info-icon button carries an accessible label equal to the full denial explanation and shows it in a tooltip on hover; in mobile view the explanation is shown inline below the push label and no info button is rendered

#### Scenario: PWA install required
- **WHEN** push is supported by the browser but the app is not yet installed as a PWA
- **THEN** the push toggle is hidden and the same compact "Not available" badge is rendered, with the install-to-home-screen guidance in the info-icon tooltip (desktop view) or inline below the push label (mobile view)

#### Scenario: Long-locale layout
- **WHEN** the active locale produces a long explanation string (e.g. German) in desktop view
- **THEN** the push row remains single-line because the long string lives inside the tooltip rather than inline in the row

### Requirement: Friend request received notification
The system SHALL notify the recipient of a new friend request through every enabled and non-muted channel they have configured. The event is internally classified under the `friend_requests` notification type.

#### Scenario: Recipient with push and email enabled
- **WHEN** a friend request is created
- **THEN** the recipient receives a Web Push to every active subscription AND an email via the locale-matching Brevo template, with body referencing the requester's display name

#### Scenario: Recipient muted friend_requests
- **WHEN** the recipient has muted the `friend_requests` type
- **THEN** no notification is dispatched for this event regardless of channel state

### Requirement: Friend request responded notification
The system SHALL notify the original requester when their friend request receives any response, without disclosing whether it was accepted or declined. The event is internally classified under the `friend_requests` notification type and is suppressed when that type is muted.

#### Scenario: Request accepted
- **WHEN** the recipient accepts the request
- **THEN** the requester receives notifications on enabled channels stating only that there was a response, never the outcome

#### Scenario: Request declined
- **WHEN** the recipient declines the request
- **THEN** the requester receives notifications on enabled channels stating only that there was a response, never the outcome

### Requirement: Localization of email content
The system SHALL select the Brevo template matching the recipient's `user_profile.locale`, mapped to a base language (`de-CH`/`de` → `de`, anything else → `en`), for each email notification. Push copy SHALL be localized the same way.

#### Scenario: User locale is en
- **WHEN** dispatching an email to a user with locale `en`
- **THEN** the Worker uses the `*_en` template ID

#### Scenario: User locale is de
- **WHEN** dispatching an email to a user with locale `de-CH`
- **THEN** the Worker uses the `*_de` template ID

#### Scenario: Unknown or missing locale
- **WHEN** the user locale is missing or not in the supported set
- **THEN** the Worker falls back to the `*_en` template

### Requirement: Stale push subscription cleanup
The system SHALL delete push subscription rows whose endpoint returns 404 or 410 from the Web Push service.

#### Scenario: Endpoint expired
- **WHEN** the Worker dispatches a push and the response is 410 Gone
- **THEN** the matching row in `push_subscriptions` is deleted

### Requirement: Notification click deep link
Every push and email SHALL link to `<APP_URL>/?notification=<entry id>`. Opening it SHALL focus an existing app window (or open a new one); the app then resolves that inbox entry's own deep link and marks it read, so routing lives in one place (see `notification-inbox`).

#### Scenario: User clicks a friend request notification
- **WHEN** the user taps a `friend_requests` push
- **THEN** an existing app window is focused (or a new one opened) at `/?notification=<id>`, and the app opens the friend requests sheet and marks the entry read

### Requirement: Event dispatch authentication
The notification Worker SHALL only accept event dispatch requests originating from the database, authenticated by a shared secret, and SHALL reject all others. Client applications SHALL NOT be able to trigger push or email dispatch.

#### Scenario: Missing or wrong secret
- **WHEN** the Worker receives an event dispatch request without the correct shared secret
- **THEN** it responds 401 and dispatches nothing

#### Scenario: Client attempts dispatch
- **WHEN** an authenticated end-user client posts to the event dispatch endpoint with its own JWT
- **THEN** the Worker responds 401 and dispatches nothing

#### Scenario: Worker unreachable
- **WHEN** the database cannot reach the Worker for an emitted event
- **THEN** the originating write and the inbox entry remain committed, the push/email for that event is not delivered, and the failure is observable in the database's request log

### Requirement: Per-device push toggle
The push toggle SHALL reflect whether the current browser holds an active push subscription registered to the current user, not an account-wide flag. A newly used device SHALL show push as off until enabled there.

#### Scenario: New device
- **WHEN** a user with push enabled on desktop opens preferences on a phone for the first time
- **THEN** the phone's push toggle is off

#### Scenario: Subscription lost
- **WHEN** the browser's push subscription was revoked or expired
- **THEN** the toggle shows off on next open

### Requirement: Push delivery follows registered devices
Push SHALL be sent to a user iff they have at least one registered push subscription and the event's type is not muted; no account-level push flag SHALL gate delivery.

#### Scenario: No devices
- **WHEN** an event is emitted for a user with zero push subscriptions
- **THEN** no push is attempted

### Requirement: Sign-out removes this device's push registration
Signing out SHALL delete the current browser's push subscription row and unsubscribe its PushManager, so a shared device stops receiving the signed-out user's pushes. Other devices SHALL be unaffected.

#### Scenario: Sign out on shared tablet
- **WHEN** A signs out on a tablet with push enabled
- **THEN** the tablet receives no further push for A and A's other devices still do

### Requirement: Push and email notification channels

The system SHALL allow each user to independently enable or disable push and email notification channels. The email channel is an account-wide setting; the push channel is a per-device setting (see "Per-device push toggle").

#### Scenario: Defaults on first profile creation
- **WHEN** a new user profile is created
- **THEN** the email channel is disabled (`notif_email_enabled = false`, opt-in required), push is off on every device until enabled there, and no notification types are muted

#### Scenario: User disables a channel
- **WHEN** the user toggles the email channel off in profile preferences
- **THEN** the system persists `notif_email_enabled = false` and no further email notifications are sent for any type to that user

### Requirement: Mutable notification types

The system SHALL allow each user to mute specific notification types from a defined, extensible set. The set defines six types, each scoped by its own requirement: `friend_requests`, `tour_updates`, `tour_interest`, `tour_suggestions`, `availability`, and `tour_reminders`.

#### Scenario: Type set is extensible without schema change
- **WHEN** a future notification type is introduced (e.g. `tour_invites`)
- **THEN** it is added to the TypeScript union and i18n keys only; `notif_muted_types` accepts the new value without DB migration

### Requirement: Channels and mutes govern push and email only

Channels and mutes SHALL govern push and email delivery only; they SHALL NOT affect the in-app notification inbox, which records every event.

#### Scenario: Mute copy states inbox still records
- **WHEN** the preferences UI renders the muted-types section
- **THEN** it states that muting silences push and email only and events still appear in the inbox

### Requirement: New notification types are delivered by default

New notification types SHALL be delivered by default; existing users are not muted for them.

#### Scenario: New types on by default
- **WHEN** an existing user with push enabled has never changed their mutes
- **THEN** they receive availability summaries and tour reminders by push

### Requirement: Release notes are not a mutable type

Release-note inbox entries SHALL NOT be a mutable type: they are never pushed or emailed.

#### Scenario: Release notes not listed
- **WHEN** the preferences UI renders the muted-types section
- **THEN** it lists the six mutable types and no release-notes row

### Requirement: `friend_requests` notification type

The `friend_requests` type SHALL cover friend-request received and responded events.

#### Scenario: User mutes friend_requests
- **WHEN** the user mutes `friend_requests`
- **THEN** that type is added to `notif_muted_types` and no friend-request-related push or email (received or responded) is sent, regardless of channel state, while inbox entries are still recorded

### Requirement: `tour_updates` notification type

The `tour_updates` type SHALL cover shared-tour created, edited, or deleted events.

#### Scenario: User mutes tour_updates
- **WHEN** the user mutes `tour_updates`
- **THEN** that type is added to `notif_muted_types` and no shared-tour change push or email is sent to that user, regardless of channel state, while inbox entries are still recorded

### Requirement: `tour_interest` notification type

The `tour_interest` type SHALL cover a friend having planned the same tour as one of yours, a link request between your tours being created, accepted, or declined, and the friendship-accept backfill digest. The enum value `'tour_interest'` SHALL be retained unchanged; only the user-facing label and description in the preferences UI SHALL be reworded to reflect the collaboration-suggestion semantics.

#### Scenario: User mutes tour_interest
- **WHEN** the user mutes `tour_interest`
- **THEN** that type is added to `notif_muted_types` and no collision-detected, link-request-lifecycle, or friendship-backfill digest push or email is sent to that user, regardless of channel state, while inbox entries are still recorded

#### Scenario: tour_interest label reflects collaboration-suggestion semantics
- **WHEN** the preferences UI renders the `tour_interest` row
- **THEN** the label and description describe same-tour collaboration suggestions (collision-detected pings, link-request events, friendship backfill) — not the legacy "decline duplicate" behavior

### Requirement: `tour_suggestions` notification type

The `tour_suggestions` type SHALL cover a partner proposing changes to your tour, or your own proposal being accepted or declined. It SHALL be a distinct mutable type rather than folded into `tour_updates`: a user who does not want to hear about every edit to a shared tour may still want to hear that someone is waiting on their decision.

#### Scenario: User mutes tour_suggestions
- **WHEN** the user mutes `tour_suggestions`
- **THEN** that type is added to `notif_muted_types` and neither suggestion-submitted nor suggestion-resolved push or email is sent to that user, regardless of channel state, while inbox entries are still recorded

#### Scenario: Muting tour_updates leaves suggestions audible
- **WHEN** the user has muted `tour_updates` but not `tour_suggestions`
- **THEN** a partner's submitted suggestion on their tour is still delivered by push/email

### Requirement: `availability` notification type

The `availability` type SHALL cover the weekly summary of friends you share a tour with who are free on days you are free.

#### Scenario: User mutes availability
- **WHEN** the user mutes `availability`
- **THEN** that type is added to `notif_muted_types` and no weekly availability summary push or email is sent to that user, regardless of channel state, while inbox entries are still recorded

### Requirement: `tour_reminders` notification type

The `tour_reminders` type SHALL cover one of your tours, or a friend's tour you are a partner on, being five days away.

#### Scenario: User mutes tour_reminders
- **WHEN** the user mutes `tour_reminders`
- **THEN** that type is added to `notif_muted_types` and no tour reminder push or email is sent to that user, regardless of channel state, while inbox entries are still recorded
