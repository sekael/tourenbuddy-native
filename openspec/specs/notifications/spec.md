## Purpose

Push and email notifications for friend requests, tour updates, and tour collaboration signals, gated by user preferences.

## Requirements

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

### Requirement: Push delivery follows registered devices
Push SHALL be sent to a user iff they have at least one registered push subscription and the event's type is not muted; no account-level push flag SHALL gate delivery.

#### Scenario: No devices
- **WHEN** an event is emitted for a user with zero push subscriptions
- **THEN** no push is attempted

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

### Requirement: Native push opt-in per device
The notifications settings SHALL show a push switch for this device. Turning it on SHALL ask for the operating system's permission only then, register the device token with the server and keep it registered on each launch while permitted; turning it off SHALL delete this device's registration. When the permission is denied, the switch SHALL be replaced by a row explaining it with a link to the app's system settings. The app SHALL never ask for push permission unprompted.

#### Scenario: First enable
- **WHEN** the user turns push on for the first time
- **THEN** the system permission prompt appears, and after "Allow" the device receives the user's pushes

#### Scenario: Permission denied
- **WHEN** the operating system has push denied for the app
- **THEN** the settings show "Notifications are off in Settings" with a button opening the app's settings

#### Scenario: Sign-out
- **WHEN** the user signs out
- **THEN** this device's registration is deleted before the session ends

### Requirement: Push opens its target
Tapping a push SHALL open the app at the inbox entry's target and mark the entry read, from the background and from a cold start. Push handlers SHALL only show or navigate and SHALL never change app data.

#### Scenario: Friend request push from a killed app
- **WHEN** the user taps a friend-request push while the app is not running
- **THEN** the app starts, opens the friend requests and marks the entry read

### Requirement: Hint when nothing reaches the user outside the app
The notification settings SHALL show a hint when push is off or not permitted on this device and email is off, saying that updates still collect in the inbox.

#### Scenario: Both channels off
- **WHEN** push is off on this device and email is disabled
- **THEN** the settings show the hint pointing to the inbox
