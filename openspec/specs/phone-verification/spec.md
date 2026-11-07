## Purpose

Verify ownership of a phone number on the user profile via a one-time SMS code.

## Requirements

### Requirement: Phone number update via Supabase auth

When a user provides a phone number, the system SHALL call `supabase.auth.updateUser({ phone })` to associate the number with the auth user. This triggers Supabase to send an SMS OTP to the provided number.

#### Scenario: Phone number submitted for verification

- **WHEN** a user enters a phone number in the onboarding form or profile edit
- **THEN** `supabase.auth.updateUser({ phone })` SHALL be called with the E.164 formatted number

#### Scenario: SMS send fails

- **WHEN** `updateUser` returns an error (no SMS provider, invalid number, rate limit)
- **THEN** an error message SHALL be displayed to the user and the phone number SHALL NOT be marked as verified

### Requirement: Phone uniqueness pre-check before OTP send

Before dispatching an OTP, the system SHALL check whether the supplied E.164 number is already verified by a different user via the `is_phone_registered(p_phone)` RPC (`checkPhoneAvailability`). The RPC is callable by any authenticated user — not only phone-verified ones — so a user adding their first phone is told up front, and it SHALL return only a boolean, never the owning user's id. A `true` result SHALL raise `PhoneAlreadyRegisteredError` without calling `updateUser`.

As a backstop, when `supabase.auth.updateUser({ phone })` itself returns an error whose message matches `/already|exists|registered|in use/i`, the system SHALL translate it into the same `PhoneAlreadyRegisteredError`. Unmatched errors SHALL be propagated unchanged.

#### Scenario: Conflict detected by pre-check

- **WHEN** `is_phone_registered(p_phone)` returns `true`
- **THEN** `supabase.auth.updateUser` SHALL NOT be called
- **AND** a `PhoneAlreadyRegisteredError` SHALL be thrown

#### Scenario: Number belongs to caller (re-verify)

- **WHEN** the number is verified only on the caller's own account
- **THEN** the RPC returns `false` (the caller is excluded) and the OTP send proceeds normally

#### Scenario: Conflict surfaced by Supabase

- **WHEN** the pre-check passed but Supabase responds with an error matching `/already|exists|registered|in use/i`
- **THEN** the error SHALL be re-thrown as `PhoneAlreadyRegisteredError`

#### Scenario: Unrelated Supabase error preserved

- **WHEN** `supabase.auth.updateUser` returns a different error (e.g. invalid format, rate limit)
- **THEN** the original error SHALL be propagated unchanged

### Requirement: Localized conflict error message

When `PhoneAlreadyRegisteredError` propagates to the UI, the user-facing error SHALL be rendered inline beneath the phone input field using the i18n key `user.phoneVerification.alreadyRegisteredError`. The localized copy SHALL state that the phone number is already registered on TourenBuddy and direct the user to `feedback@tourenbuddy.ch` if they believe they have another account with the same number.

#### Scenario: Inline rendering

- **WHEN** `PhoneAlreadyRegisteredError` is thrown by the store
- **THEN** the profile edit form SHALL display the localized message beneath the phone input
- **AND** SHALL NOT navigate to the OTP entry step

#### Scenario: Localization coverage

- **WHEN** the UI is rendered in `en` or `de-CH`
- **THEN** the message SHALL be sourced from the locale file and include the literal string `feedback@tourenbuddy.ch`

### Requirement: Phone OTP verification flow

After submitting a phone number, a verification code input SHALL be presented. The system SHALL verify the code via `supabase.auth.verifyOtp({ phone, token, type: 'phone_change' })`.

#### Scenario: Correct OTP entered

- **WHEN** user enters the correct 6-digit OTP code
- **THEN** `supabase.auth.verifyOtp` SHALL succeed, `phone_confirmed_at` SHALL be set on the auth user, and the UI SHALL show a success state

#### Scenario: Incorrect OTP entered

- **WHEN** user enters an incorrect OTP code
- **THEN** an error message SHALL be displayed and the user SHALL be able to retry

#### Scenario: Resend OTP

- **WHEN** user clicks "Resend code"
- **THEN** `supabase.auth.updateUser({ phone })` SHALL be called again to trigger a new SMS, with a cooldown timer preventing rapid resends

### Requirement: Verified phone badge display

A blue checkmark icon SHALL be displayed next to phone numbers that are verified (`phone_confirmed_at` is not null on the auth user). The profile overview's identity card SHALL show the phone status and SHALL open the profile editor, where the number is added, changed, or verified.

#### Scenario: Verified phone shows badge

- **WHEN** the user's phone number is verified (auth user has `phone_confirmed_at` set)
- **THEN** a blue tick/checkmark icon SHALL be displayed next to the phone number in the profile view

#### Scenario: Unverified phone shows no badge

- **WHEN** the user has a phone number but it is not verified
- **THEN** no verification badge SHALL be displayed, a "Not verified" label SHALL be shown next to the number, and tapping the identity card SHALL open the editor from which the number is verified

#### Scenario: No phone number

- **WHEN** the user has no phone number set
- **THEN** an "Add phone number" prompt SHALL be displayed on the identity card in the profile view, and tapping the card SHALL open the editor

### Requirement: Twilio and Supabase SMS setup

Phone verification SHALL require manual configuration of Twilio (SMS provider) and Supabase Phone Auth provider before the feature can function.

#### Scenario: Twilio account setup

- **WHEN** setting up phone verification for the first time
- **THEN** a Twilio account (free tier) SHALL be created, a phone number with SMS capability obtained, and Account SID + Auth Token noted

#### Scenario: Supabase phone provider configuration

- **WHEN** Twilio credentials are available
- **THEN** Supabase Dashboard → Authentication → Providers → Phone SHALL be enabled with Twilio as SMS provider, configured with Account SID, Auth Token, and Twilio phone number

#### Scenario: SMS provider not configured

- **WHEN** phone verification is attempted but Twilio/Supabase SMS is not configured
- **THEN** the system SHALL display a graceful error message and allow the user to continue without verification

### Requirement: Verified phone is discoverable to other verified users

A user's phone number SHALL become discoverable to other verified users via the `find_user_by_phone` RPC if and only if `auth.users.phone_confirmed_at` is set for that user. Unverified phone numbers SHALL never appear in discovery results, regardless of whether a row exists in `auth.users.phone`.

#### Scenario: Phone marked verified

- **WHEN** a user successfully completes SMS OTP verification and `phone_confirmed_at` is set
- **THEN** subsequent verified-caller invocations of `find_user_by_phone` with that exact E.164 number SHALL return the user's id

#### Scenario: Phone unverified

- **WHEN** a user has a `phone` value but `phone_confirmed_at IS NULL`
- **THEN** `find_user_by_phone` invocations SHALL return `null` for that phone

### Requirement: Security notice before phone verification

The phone verification flow (onboarding form and profile edit) SHALL display a clear security notice to the user BEFORE the OTP is requested, explaining the discoverability and friendship-linking consequences of completing verification. The notice SHALL state that:

1. Once verified, other verified TouringBuddy users who add this phone number to their contacts will be informed that an account exists for that number and will be able to send a friend request.
2. No identity beyond the existence of an account is exposed by discovery.
3. Unverified phones are never discoverable.
4. The user has the unconditional right to deny any incoming friend request, and denial does not reveal that the recipient is the account behind the number beyond the act of declining.
5. Friendships can be revoked in the future (UI deferred but right is reserved).

The user SHALL explicitly acknowledge the notice (e.g. checkbox or "I understand, send code" button) before the OTP send action is dispatched. The acknowledgement SHALL block the verification submit when not given.

#### Scenario: Notice rendered before OTP send

- **WHEN** the user opens the phone-verification flow
- **THEN** the security notice SHALL be displayed before the SMS-send action is enabled

#### Scenario: Acknowledgement required

- **WHEN** the user attempts to send the OTP without acknowledging the notice
- **THEN** the send action SHALL remain disabled (or submit SHALL be blocked) and the notice SHALL be visually emphasized

#### Scenario: Notice copy translated

- **WHEN** the verification flow renders in `de-CH` or `en` locale
- **THEN** all notice text SHALL be sourced from the locale files via `t()` (no hard-coded strings)

#### Scenario: Re-verification re-shows notice

- **WHEN** a user replaces an already-verified phone with a new number
- **THEN** the notice SHALL be re-shown and re-acknowledged before the new OTP is sent

### Requirement: Verification status drives client UX gates

The frontend SHALL treat the calling user's `phone_confirmed_at` value as the single source of truth for whether to:

- invoke discovery RPCs (`find_user_by_phone`, `find_users_by_phones`)
- render connect prompts in contact forms or import results
- attempt to send friend requests

Unverified callers SHALL see no friendship discovery affordances anywhere in the app.

#### Scenario: Unverified caller sees no friendship UI

- **WHEN** the authenticated user has `phone_confirmed_at IS NULL`
- **THEN** discovery RPCs SHALL NOT be invoked AND connect prompts SHALL NOT be rendered AND the friend-requests inbox SHALL render only an empty state (or a "verify your phone to enable friends" hint)

#### Scenario: Caller becomes verified mid-session

- **WHEN** the user verifies their phone within a session and `phone_confirmed_at` transitions from null to a timestamp
- **THEN** the friendships store SHALL fetch lists and friendship UX SHALL be enabled without requiring a reload

### Requirement: Discovery RPCs filter bidirectionally on active blocks

The bulk and name-lookup discovery RPCs — `find_users_by_phones`, `find_phones_by_user_ids`, and `get_user_names_by_ids` — MUST exclude rows identifying user B from the result whenever an active `user_blocks` row exists between B and the calling user A in EITHER direction (i.e. `(B, A)` or `(A, B)` with `unblocked_at IS NULL`). Filtering is bidirectional: a blocker also no longer sees the blocked user in these results. Implementation lives server-side inside the SECURITY DEFINER function bodies so it cannot be bypassed by a custom client.

The self-conflict pre-check RPCs — `find_user_by_phone` and `is_phone_registered` — are EXEMPT from the block filter. Both are used by the phone-verification flow to detect whether a phone the caller is about to claim is already taken. `is_phone_registered` returns only a boolean and leaks no identity. `find_user_by_phone` returns a uid but the uid is inert under the other block enforcement points (friend-request INSERT denied, name lookup filtered, bulk discovery filtered, `is_blocked_by` hides send affordance). Bypass is required because the auth layer's own collision check will reject the OTP send anyway — pre-check existing to avoid that confusing UX.

#### Scenario: find_user_by_phone exempt from block filter
- **WHEN** user A calls `find_user_by_phone(<B's verified phone>)` and an active `user_blocks` row exists between A and B in either direction
- **THEN** the RPC still returns B's uid (the pre-check is exempt; other block mechanisms remain enforced)

#### Scenario: is_phone_registered exempt from block filter
- **WHEN** user A calls `is_phone_registered(<B's verified phone>)` and an active `user_blocks` row exists between A and B in either direction
- **THEN** the RPC still returns `true` (pre-check exemption)

#### Scenario: find_users_by_phones omits blockers
- **WHEN** user A calls `find_users_by_phones([<various phones>])` and one of the phones belongs to user B who has actively blocked A
- **THEN** the result set MUST NOT contain B's user id; other matches are returned normally

#### Scenario: find_phones_by_user_ids omits blockers
- **WHEN** user A calls `find_phones_by_user_ids([..., B, ...])` and an active `user_blocks` row exists between A and B in either direction
- **THEN** the result set MUST NOT contain B's row

#### Scenario: get_user_names_by_ids omits blockers
- **WHEN** user A calls `get_user_names_by_ids([..., B, ...])` and an active `user_blocks` row exists between A and B in either direction
- **THEN** the result set MUST NOT contain B's name row

#### Scenario: Phone-conflict pre-check unaffected for caller's own number
- **WHEN** user A invokes phone verification and `find_user_by_phone` is called for A's own number
- **THEN** the filter does not apply (a user cannot block themselves; the existing self-match path is preserved)
