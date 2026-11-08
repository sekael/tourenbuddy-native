## MODIFIED Requirements

### Requirement: OTP verification page verifies the code

The app SHALL display a code screen where users enter the 6-digit code received by email and submit
it for verification. The screen SHALL normalize the entered value to digits before verifying, SHALL
submit automatically once six digits are present, and SHALL NOT submit the same value twice or
overlap two verification requests. Every message the screen shows SHALL be in the app language.

#### Scenario: Successful OTP submission

- **WHEN** an unauthenticated user enters a valid 6-digit code on the code screen for an email and
  submits
- **THEN** the app SHALL verify the code as an email OTP for that address, the session SHALL arrive
  through the auth state listener, and the app SHALL leave the sign-in screens for the Map

#### Scenario: Invalid or expired code

- **WHEN** verification is rejected (wrong code, expired, used)
- **THEN** the screen SHALL show a localized message that the code is invalid or expired under the
  field, clear the field, and remain on the code screen

#### Scenario: Verification without a connection

- **WHEN** verification fails because the device cannot reach the auth server
- **THEN** the screen SHALL show the localized message that the action is not available offline and
  keep the entered code

#### Scenario: Rejected code is not resubmitted unchanged

- **WHEN** a code has been submitted and rejected, and the field is repopulated with that same value
  without the user editing it
- **THEN** the screen SHALL NOT issue a second verification request for that value, and the user
  SHALL still be able to retry it deliberately via the submit button

#### Scenario: Verification requests do not overlap

- **WHEN** the field reaches six digits while a verification request is already in flight
- **THEN** the screen SHALL NOT issue a second concurrent request

#### Scenario: Resend code

- **WHEN** the user activates the resend button after its cooldown has elapsed
- **THEN** the app SHALL request a new code for the same email, SHALL display a localized
  confirmation that a new code was sent, and SHALL restart the 60-second cooldown

#### Scenario: Resend is cooling down

- **WHEN** the screen opens (a code was just sent), or a code was resent less than 60 seconds ago
- **THEN** the resend button SHALL be disabled and SHALL show a localized countdown of the remaining
  seconds

#### Scenario: Resend hits the server's rate limit

- **WHEN** the resend request is rejected with HTTP 429 naming a wait in seconds
- **THEN** the screen SHALL restart the countdown with that wait instead of showing an error; any
  other failure SHALL show a localized resend error

#### Scenario: Back to email entry

- **WHEN** the user goes back from the code screen (back button or the platform's back gesture)
- **THEN** the app SHALL show the email screen with the address as entered and SHALL NOT call the
  auth server

#### Scenario: Code screen opened without an email

- **WHEN** the code screen is opened without an email address (a stale link or a reload on web)
- **THEN** the app SHALL show the email screen instead

### Requirement: OTP verification page layout

The code screen SHALL include a title, a subtitle naming the recipient email, a single field for
the 6-digit code, a verify button, a resend button, and a way back to the email screen. The field
SHALL remain a single field rather than one box per digit, SHALL bring up a numeric keypad, SHALL be
marked as a one-time code so the platform offers the code from the user's mail or messages, and
SHALL NOT be marked as a credential that password managers store.

#### Scenario: Numeric-only input on mobile

- **WHEN** the screen shows on a phone
- **THEN** the field SHALL surface a numeric keypad and SHALL accept the platform's one-time-code
  autofill where supported (on iOS, the code from Mail)

#### Scenario: Code arrives with surrounding whitespace or separators

- **WHEN** the field is populated with a value containing spaces, newlines, or other non-digit
  characters — by paste, by an autofill suggestion, or by typing
- **THEN** the screen SHALL reduce the value to its digits, truncate it to six, and treat the result
  as the code to verify

#### Scenario: Filled code submits without a further action

- **WHEN** the normalized value reaches six digits, no verification is in flight, and that value has
  not already been attempted
- **THEN** the screen SHALL start verification without requiring the user to activate the submit
  button

#### Scenario: Incomplete code never submits

- **WHEN** the normalized value holds fewer than six digits
- **THEN** the screen SHALL NOT start verification, and the submit button SHALL remain disabled

### Requirement: Auth screens share a hero background layout

Every signed-out auth screen SHALL render its content over the same hero background image with a
darkening gradient overlay, presented through a single shared layout. The layout SHALL carry the
product title as the screen's only top-level heading, SHALL extend the background edge-to-edge
including the device safe-area zones, and SHALL place screen content on a card whose surface and
input fields are opaque. Screen-specific titles on the card SHALL be headings below the product
title. Every input SHALL have an accessible name of its own; a placeholder alone SHALL NOT serve as
an input's accessible name. On iOS and Android the fields and buttons SHALL be the platform's own
controls, and the on-screen keyboard SHALL NOT cover the focused field or the screen's primary
button.

#### Scenario: Background is continuous across the sign-in flow

- **WHEN** a signed-out user submits their email and arrives at the code screen
- **THEN** the code screen shows the same hero background and overlay, with no change to a flat
  surface color between the two steps

#### Scenario: Only one top-level heading per auth page

- **WHEN** an auth screen renders both the hero product title and its own screen title
- **THEN** the hero title is the only top-level heading and the screen title a heading of a lower
  level

#### Scenario: Input legibility over the photographic backdrop

- **WHEN** the sign-in card renders over a light or a dark region of the background image
- **THEN** the card and its fields render on opaque surfaces, so text contrast never depends on the
  pixels behind the card

#### Scenario: Placeholder-only input is announced by assistive technology

- **WHEN** a screen-reader user focuses the email or the sign-in-code field, which show a
  placeholder and no visible label
- **THEN** the field is announced by its own accessible name, and the name remains available after
  the placeholder is replaced by typed input

#### Scenario: Keyboard on a small phone

- **WHEN** the keyboard opens on a phone the size of an iPhone SE
- **THEN** the focused field and the primary button stay visible above the keyboard, scrolling if
  the card does not fit

### Requirement: Email entry page collects user email

The app SHALL collect the user's email address on the first signed-out screen, presented
immediately on arrival with no intermediate call-to-action screen. The form SHALL sit in the shared
hero layout. The email field SHALL be marked as an email address, so that password managers,
email-alias providers and the platform's autofill can classify it and offer addresses, SHALL bring
up the email keyboard without capitalization or autocorrection, and SHALL submit from the
keyboard's return key. Leading and trailing whitespace SHALL be ignored.

#### Scenario: Signed-out user arrives at the app

- **WHEN** an unauthenticated user opens the app
- **THEN** the email field and submit button are visible without any further navigation, and no
  "Get Started" call-to-action step is presented

#### Scenario: Valid email submission

- **WHEN** a user enters a valid email address and submits the form
- **THEN** the app SHALL request an email OTP for that address with the user's language in the user
  metadata and no redirect URL, and SHALL show the code screen for that email

#### Scenario: Invalid email submission

- **WHEN** a user enters an invalid email address and submits the form
- **THEN** the app SHALL display a localized validation error and SHALL NOT call the auth server

#### Scenario: OTP dispatch fails

- **WHEN** the OTP request is rejected
- **THEN** the screen SHALL display a localized error — that the action is not available offline
  when the server is unreachable, how many seconds to wait when the server's rate limit applies,
  that the address is invalid when the server rejects it, otherwise a generic send error — SHALL
  remain on the email screen, and SHALL NOT show the code screen

#### Scenario: Password manager offers a stored or generated address

- **WHEN** a user focuses the email field with a password manager or the platform's credential
  provider active
- **THEN** the field is classified as an email field, and a filled value is accepted by the form
  exactly as a typed one is

#### Scenario: `/auth/email` no longer resolves

- **WHEN** a stale link to `/auth/email` is opened
- **THEN** the route does not exist and the app does not serve an email entry page there

### Requirement: Auth store exposes session state and OTP actions

A shared auth store SHALL manage the current user session, exposing the signed-in user, whether the
user is authenticated, and whether session restore is still loading; a `sendEmailOtp(email)` action
that issues the OTP request; a `verifyOtp(email, token)` action that redeems the 6-digit code; and a
`signOut()` action.

#### Scenario: Store initialization

- **WHEN** the app starts
- **THEN** the auth store SHALL check for an existing session and set the authenticated state
  accordingly

#### Scenario: Sign out

- **WHEN** `signOut()` is called on the auth store
- **THEN** the store SHALL end the session with the auth server, remove the locally persisted
  session, and the app SHALL show the email screen

#### Scenario: Sign out while the auth server is unreachable

- **WHEN** `signOut()` is called with no connectivity
- **THEN** the locally persisted session SHALL be removed and the user signed out without an error
  being raised, so that a subsequent cold start does NOT restore the session

#### Scenario: sendEmailOtp for new user

- **WHEN** `sendEmailOtp('user@example.com')` is called and the user does not yet exist
- **THEN** the store SHALL request the OTP with `locale` in the user metadata set to the active base
  language and SHALL NOT pass a redirect URL

#### Scenario: sendEmailOtp for existing user

- **WHEN** `sendEmailOtp('user@example.com')` is called and the user already exists
- **THEN** the store SHALL request the OTP with the same shape and the request SHALL succeed without
  overwriting the existing `locale` in the user metadata

#### Scenario: verifyOtp success

- **WHEN** `verifyOtp('user@example.com', '123456')` is called with a valid code
- **THEN** the store SHALL verify it as an email OTP and the user SHALL become authenticated through
  the auth state listener

#### Scenario: verifyOtp failure

- **WHEN** `verifyOtp` is called with an invalid or expired code
- **THEN** the store SHALL surface the error to the caller and the user SHALL remain
  unauthenticated

### Requirement: onAuthStateChange is the only session writer

The auth state listener SHALL remain the only writer of session state after initialization, and
SHALL write it only for an event that delivers a session or for an explicit sign-out. Any other
event carrying no session SHALL leave the current session untouched.

#### Scenario: Adopted session is later invalidated

- **WHEN** the app is running on an adopted (unrefreshed) session and the auth client reports a
  sign-out once connectivity returns
- **THEN** the store SHALL clear the user and the app SHALL show the email screen

#### Scenario: Session load is replayed to a new listener while the refresh is failing

- **WHEN** the app is running on an adopted session and the auth client re-runs the session load
  for a newly registered listener, which fails the same way and reports no session
- **THEN** the adopted session SHALL be retained and the user SHALL NOT be returned to the sign-in
  screen

### Requirement: Session restore is bounded

Session restore SHALL NOT delay the app's first screen indefinitely: it SHALL be bounded at 4
seconds, and a restore that does not settle within the bound SHALL be treated as a retryable
failure. The eventual outcome SHALL still be applied when it arrives. Until restore settles, the
app SHALL show its launch screen rather than the sign-in screens or the tabs.

#### Scenario: Session restore does not settle promptly

- **WHEN** the token refresh neither succeeds nor fails within the restore bound (the auth client
  retries an unreachable refresh with backoff for far longer)
- **THEN** the app SHALL proceed to render on the persisted session rather than waiting, and SHALL
  apply the refresh's eventual result when it arrives

#### Scenario: Secure storage fails at launch

- **WHEN** reading the stored session fails with an error at launch
- **THEN** the app treats the user as signed out and shows the email screen within the bound

#### Scenario: Launch while the session is unknown

- **WHEN** the app launches with a persisted session and restore has not settled yet
- **THEN** the launch screen stays, and neither the email screen nor the Map flashes before the
  outcome is known

### Requirement: Unverified session is surfaced

While the app runs on an adopted session the store SHALL expose that the session is
**unverified**, and the app SHALL tell the user their data may be out of date. The flag SHALL clear
as soon as any auth event delivers a verified session.

#### Scenario: Unverified session is surfaced to the user

- **WHEN** the app is running on an adopted session
- **THEN** the Profile tab SHALL state that the user is signed in offline and the data shown may be
  out of date, in the active locale

#### Scenario: Unverified flag clears on a real session

- **WHEN** a token refresh subsequently succeeds
- **THEN** the unverified state SHALL clear and the notice SHALL disappear

### Requirement: Session arrival redirects off sign-in-only routes

The app SHALL observe the authentication state: when a session becomes available while the user is
on a sign-in screen, the app SHALL show the Map without user interaction, replacing the sign-in
screens rather than stacking the Map on top of them.

#### Scenario: Session restore completes after the first navigation

- **WHEN** session restore resolves only after the app has rendered the email screen, and the user
  becomes authenticated while on it
- **THEN** the app SHALL show the Map on its own, with no tap and no OTP request

#### Scenario: Reopening an installed PWA with a valid session

- **WHEN** a user reopens the app and a valid or restorable session exists
- **THEN** the app SHALL land on the Map, and the email and code screens SHALL NOT be presented — in
  particular the app SHALL NOT request an OTP, so repeated launches SHALL NOT trip the OTP rate limit

#### Scenario: Back after signing in

- **WHEN** the user has just signed in and uses the platform's back gesture on the Map
- **THEN** the sign-in screens do not come back

### Requirement: Session arrival keeps in-app routes

A user standing on any screen other than the sign-in screens SHALL NOT be navigated away when the
session state changes to authenticated.

#### Scenario: Session lands while the user is on an in-app route

- **WHEN** the user becomes authenticated again (for example after a token refresh delivers a
  session) while on a tab or a sheet
- **THEN** the app SHALL stay on the current screen

## ADDED Requirements

### Requirement: Session is kept in secure storage

On iOS and Android the persisted session SHALL be kept in the platform's secure storage, readable
once the device has been unlocked after a restart, and SHALL NOT be restored to another device from
a backup. It SHALL NOT be read before the app has been in the foreground once. On web it SHALL stay
in the browser's storage under the PWA's key. The token SHALL be refreshed only in the foreground.

#### Scenario: Launch before the first unlock

- **WHEN** iOS launches the app in the background after a restart, before the user has unlocked the
  phone, and the user later opens it
- **THEN** the user is still signed in

#### Scenario: Update keeps the session

- **WHEN** the app is updated from one store build to the next
- **THEN** the user is still signed in

#### Scenario: Restoring a backup to a new phone

- **WHEN** the user restores a backup of their phone to a new phone and opens the app there
- **THEN** the app starts on the email screen

#### Scenario: Web storage key

- **WHEN** a user signs in on web
- **THEN** the session is stored under the key the PWA uses (`sb-<project-ref>-auth-token`), so a
  PWA session at the same origin is picked up at the cutover (Phase 7)

### Requirement: A reinstall starts signed out

A reinstalled app SHALL start signed out, even where the platform kept its secure storage across
the reinstall.

#### Scenario: Reinstall on iOS

- **WHEN** a signed-in user deletes the app and installs it again
- **THEN** the app starts on the email screen, and the previous session is deleted from the
  Keychain before anything reads it

### Requirement: Sign out from the Profile tab

The Profile tab SHALL show the signed-in email address and a sign-out button. Signing out SHALL
need no confirmation, as in the PWA.

#### Scenario: Signing out

- **WHEN** the user activates Sign out on the Profile tab
- **THEN** the app shows the email screen at once, with no way back to the tabs, and the user stays
  signed out after a relaunch, also when the phone was offline

### Requirement: Routes follow the session

The app's routes SHALL depend on the session in one place, for both directions: while signed out
only the sign-in screens are reachable, and while signed in the sign-in screens are not. A screen
that becomes unreachable because the session changed SHALL be left without user interaction, along
with its history.

#### Scenario: Unauthenticated user visits protected route

- **WHEN** an unauthenticated user opens the address of a tab or a sheet
- **THEN** the app SHALL show the email screen, and after signing in the Map (the address is not
  kept, as in the PWA)

#### Scenario: Authenticated user visits auth pages

- **WHEN** an authenticated user opens the address of the email or the code screen
- **THEN** the app SHALL show the Map

#### Scenario: Entry URL is resolved before the first screen shows

- **WHEN** an authenticated user opens the app directly at the email screen's address
- **THEN** the app SHALL show the Map, without the email screen appearing first

#### Scenario: Signed out on the server while using the app

- **WHEN** the auth client reports a sign-out while the user is on a sheet above the tabs
- **THEN** the app shows the email screen, and going back does not return to the sheet or the tabs

## REMOVED Requirements

### Requirement: Router guard redirects based on session state

**Reason**: Written for the Vue Router `beforeEach` guard. The session part is now "Routes follow
the session"; the profile-completeness scenarios (offline or unverified with no cached profile)
move unchanged to `profile-onboarding` ("Router guard for profile completeness"), which the profile
port (#370) implements.

**Migration**: None for users. The profile port ports the moved scenarios with the onboarding gate.

### Requirement: Sign-in redirect waits for the profile

**Reason**: There is no profile before the profile port (#370); the requirement moves unchanged to
`profile-onboarding` ("Router guard for profile completeness").

**Migration**: None for users. The profile port loads the profile before leaving sign-in.
