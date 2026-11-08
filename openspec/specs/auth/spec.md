## Purpose

Email-based OTP authentication: users sign in by receiving a 6-digit code via email and verifying it, with no passwords stored.

## Requirements

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

#### Scenario: Confirming a new account

- **WHEN** the code screen was opened by account creation and the user enters the code from the
  confirmation email
- **THEN** the same verification SHALL confirm the address and sign the user in, and the account
  SHALL keep the password chosen at creation

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
- **THEN** the app SHALL show the screen that opened it (sign-in or account creation) with the
  address as entered and SHALL NOT call the auth server

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
input fields are opaque. On iOS and Android the fields and buttons SHALL be the platform's own
controls.

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

- **WHEN** a screen-reader user focuses a field on an auth screen, such as the email or the
  sign-in-code field, which show a placeholder and no visible label
- **THEN** the field is announced by an accessible name of its own, never by its placeholder alone,
  and the name remains available after the placeholder is replaced by typed input

#### Scenario: Keyboard on a small phone

- **WHEN** the keyboard opens on any phone, down to the size of an iPhone SE
- **THEN** the keyboard covers neither the focused field nor the screen's primary button, the card
  scrolling if it does not fit

### Requirement: Email entry page collects user email

The app SHALL collect the user's email address on the first signed-out screen. The form SHALL sit
in the shared hero layout and SHALL offer, besides the email code, sign-in with a password,
sign-in with a passkey on iOS, and account creation. The email field SHALL be marked as the account's user name, SHALL bring up the email
keyboard without capitalization or autocorrection, and SHALL move on from the keyboard's return
key. Leading and trailing whitespace SHALL be ignored.

#### Scenario: Signed-out user arrives at the app

- **WHEN** an unauthenticated user opens the app
- **THEN** the email field, the password field and the sign-in actions are visible without any
  further navigation, and no "Get Started" call-to-action step is presented

#### Scenario: Valid email submission

- **WHEN** a user enters a valid email address and asks for a code
- **THEN** the app SHALL request an email OTP for that address with the user's language in the user
  metadata and no redirect URL, SHALL ignore the password field, and SHALL show the code screen
  for that email

#### Scenario: Invalid email submission

- **WHEN** a user enters an invalid email address and asks for a code or signs in with a password
- **THEN** the app SHALL display a localized validation error and SHALL NOT call the auth server

#### Scenario: OTP dispatch fails

- **WHEN** the OTP request is rejected
- **THEN** the screen SHALL display a localized error — that the action is not available offline
  when the server is unreachable, how many seconds to wait when the server's rate limit applies,
  that the address is invalid when the server rejects it, otherwise a generic send error — SHALL
  remain on the email screen, and SHALL NOT show the code screen

#### Scenario: Password manager offers a stored or generated address

- **WHEN** a user focuses the email field with a password manager, an email-alias provider or the
  platform's credential provider active
- **THEN** the field is classified as the account name of a sign-in form, a stored email and
  password fill both fields, and a filled value is accepted by the form exactly as a typed one is

#### Scenario: `/auth/email` no longer resolves

- **WHEN** a stale link to `/auth/email` is opened
- **THEN** the route does not exist and the app does not serve an email entry page there

### Requirement: Locale captured in user metadata at sign-up

When the auth store requests an email OTP, also to create an account with a password, the request
SHALL include `locale` in the user metadata, set to the base language code (`en` or `de`) derived from
the active i18n locale, so that the auth server stores it when it creates the user.

#### Scenario: New user with German locale

- **WHEN** a new user with active i18n locale `de-CH` requests an OTP
- **THEN** the call SHALL pass `locale = 'de'` in the user metadata so Supabase persists it on user
  creation in `user_metadata`

#### Scenario: New user with English locale

- **WHEN** a new user with active i18n locale `en` requests an OTP
- **THEN** the call SHALL pass `locale = 'en'` in the user metadata

#### Scenario: Account created with a password

- **WHEN** a user with active i18n locale `de-CH` creates an account with a password
- **THEN** the code request SHALL pass `locale = 'de'` in the user metadata, so a new account's
  code email is written in German

### Requirement: Auth store exposes session state and OTP actions

A shared auth store SHALL manage the current user session: the signed-in user, whether the user is
authenticated and whether session restore is still loading. It SHALL offer `sendEmailOtp(email)`,
`resendEmailOtp(email)` for the code screen, `verifyOtp(email, token)`, the password and passkey
actions and `signOut()`, and SHALL be the screens' only way to the auth server and the passkey
module. The signed-in user SHALL still come only from session restore, the auth state listener and
sign-out.

#### Scenario: Password and passkey actions

- **WHEN** a screen signs in with a password or a passkey, creates an account, sets the password or
  manages passkeys
- **THEN** it SHALL call `signInWithPassword(email, password)`, `signInWithPasskey()`,
  `signUp(email, password)`, `setPassword(password)`, `listPasskeys()`, `addPasskey()` or
  `deletePasskey(id)`, and the passkey list SHALL stay with the screen, not in the store

#### Scenario: Password sign-in goes through the listener

- **WHEN** `signInWithPassword` succeeds
- **THEN** the user SHALL become authenticated through the auth state listener, not by the action
  setting the user

#### Scenario: Passkey sign-in goes through the listener

- **WHEN** `signInWithPasskey` succeeds
- **THEN** the user SHALL become authenticated through the auth state listener

#### Scenario: signUp sets the password after the code

- **WHEN** `signUp('user@example.com', password)` is followed by a successful
  `verifyOtp('user@example.com', code)`
- **THEN** the store SHALL have requested the code as `sendEmailOtp` does, and SHALL set the
  password once the session has arrived, never before

#### Scenario: Code verified for another address

- **WHEN** `signUp` was called for one address and a code for a different address is verified
- **THEN** the store SHALL NOT set the password

#### Scenario: Code sign-in after signUp

- **WHEN** `signUp('user@example.com', password)` is followed by `sendEmailOtp('user@example.com')`
  and then a successful `verifyOtp('user@example.com', code)`
- **THEN** the store SHALL NOT set the password

#### Scenario: Resend keeps signUp going

- **WHEN** `signUp('user@example.com', password)` is followed by `resendEmailOtp('user@example.com')`
  and then a successful `verifyOtp('user@example.com', code)`
- **THEN** the store SHALL set the password

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

### Requirement: Session restore survives retryable refresh failures

Session restore SHALL distinguish a **retryable** failure of the token refresh (no
network, fetch error, timeout) from a **permanent** authentication failure (invalid,
expired, or revoked refresh token). A retryable failure SHALL NOT sign the user out: the
store SHALL adopt the persisted session's user so the app boots authenticated and serves
its offline caches. A permanent failure SHALL leave the user signed out.

#### Scenario: Token refresh fails because the device is offline

- **WHEN** the app cold-starts with a persisted session whose access token is expired and
  the refresh request fails with a retryable network error
- **THEN** the store SHALL adopt the persisted session's user, `isAuthenticated` SHALL be
  true, and no sign-in screen SHALL be presented

#### Scenario: Refresh token is rejected by the server

- **WHEN** session restore fails with a permanent authentication error (invalid, expired,
  or revoked refresh token)
- **THEN** `isAuthenticated` SHALL remain false and the user SHALL be presented the
  sign-in screen

#### Scenario: Persisted session is absent or unreadable

- **WHEN** no persisted session exists, or the stored value is malformed or lacks a user
  id and refresh token
- **THEN** the store SHALL treat the user as signed out and SHALL NOT throw

### Requirement: Session adoption has no client-side age limit

Adoption of a persisted session SHALL NOT be limited by the age of the persisted session —
refresh-token lifetime is the server's to enforce.

#### Scenario: Long-dormant persisted session

- **WHEN** the persisted session's access token expired weeks ago and the refresh fails
  retryably
- **THEN** the store SHALL still adopt it — no client-side staleness cutoff — and the app
  SHALL present the unverified-session notice

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

### Requirement: Sign in with a password

The sign-in screen SHALL have a password field, marked as the current password of the account in
the email field so that the platform's password manager fills and saves the pair, and a primary
action that signs in with the email and the password. Every answer SHALL be localized.

#### Scenario: Correct password

- **WHEN** a user enters the email and the password of a confirmed account and signs in
- **THEN** the user becomes authenticated and the app shows the Map

#### Scenario: Missing password

- **WHEN** the user signs in with an empty password field
- **THEN** the screen asks for the password and SHALL NOT call the auth server

#### Scenario: Wrong password or no password set

- **WHEN** the auth server rejects the credentials, including for an account that has no password
- **THEN** the screen says the email or the password is wrong, points at signing in with an email
  code, keeps the email and stays on the sign-in screen

#### Scenario: Account never confirmed

- **WHEN** the auth server answers that the account's email address is not confirmed
- **THEN** the screen says the address is not confirmed yet and points at signing in with an email
  code, which confirms it

#### Scenario: Too many attempts or no connection

- **WHEN** the sign-in is rate limited or the device cannot reach the auth server
- **THEN** the screen shows that the user has to wait, or that the action is not available offline

#### Scenario: Password given to an address its owner had not confirmed

- **WHEN** someone created an account for an address with a password through the auth API, and the
  address's owner later confirms the address with an email code
- **THEN** that password never signs in, neither before nor after the confirmation (enforced by
  the backend in the Vue repository, not by the app)

#### Scenario: Requests do not overlap

- **WHEN** the user activates sign-in again while a sign-in request is in flight
- **THEN** no second request is sent

### Requirement: Account creation with a password

The sign-in screen SHALL lead to an account creation screen with an email field and a new-password
field of at least 8 characters, for which the platform suggests and saves a strong password.
Creating an account SHALL send the email code as the code sign-in does, SHALL set the chosen
password (kept in memory only) once that code is verified, and SHALL answer the same whether or
not the address has an account. Answers SHALL be localized.

#### Scenario: New address

- **WHEN** a user enters a valid email address without an account and a password of at least 8
  characters and creates the account
- **THEN** the app requests an email code for the address with the user's language and shows the
  code screen; verifying the code creates the account, signs the user in and sets the password

#### Scenario: Address that already has an account

- **WHEN** the address already belongs to an account, with or without a password
- **THEN** the screen answers exactly as for a new address; verifying the code signs into that
  account and sets the password just chosen, replacing an existing password, so a later password
  sign-in with it succeeds

#### Scenario: Password too short

- **WHEN** the password has fewer than 8 characters
- **THEN** the screen says the password needs at least 8 characters and SHALL NOT call the auth
  server

#### Scenario: Code cannot be sent

- **WHEN** the code request is rate limited, rejected or the device cannot reach the auth server
- **THEN** the screen shows the same answers as the code request on the sign-in screen and stays
  open

#### Scenario: Password cannot be set after the code

- **WHEN** the code is verified but setting the password fails
- **THEN** the user is signed in, and the app tells them that the password was not saved and that
  they can set it in Profile

#### Scenario: Abandoned account creation

- **WHEN** the user leaves the code screen without verifying, and then asks for a code on the
  sign-in screen (for that address or another), signs out, or creates an account for another
  address, even if that request fails
- **THEN** the chosen password is forgotten and never set

#### Scenario: Code resent during account creation

- **WHEN** the user resends the code on the code screen of an account creation and verifies the
  new code
- **THEN** the chosen password is set as without the resend

### Requirement: Sign in with a passkey

On iOS, where the system supports passkeys, the sign-in screen SHALL offer sign-in with a passkey
through the system's passkey sheet (Face ID or Touch ID), without an email address. The app SHALL
be associated with the relying party domain `tourenbuddy.ch`, which SHALL list the app. Android
and web SHALL NOT offer passkeys.

#### Scenario: Passkey sign-in

- **WHEN** a user with a passkey for TourenBuddy on the device chooses sign-in with a passkey and
  confirms with Face ID
- **THEN** the user becomes authenticated as the passkey's account and the app shows the Map

#### Scenario: User cancels the system sheet

- **WHEN** the user dismisses the passkey sheet
- **THEN** the screen shows no error and stays as it was

#### Scenario: No passkey on the device

- **WHEN** the device has no passkey for TourenBuddy
- **THEN** the screen says that no passkey was found and suggests another way to sign in

#### Scenario: Passkey deleted on the server

- **WHEN** the user picks a passkey that the auth server no longer knows
- **THEN** the screen says the passkey is no longer valid, and the app reports the credential to
  the system as unknown so that it is no longer offered where the system supports that

#### Scenario: Android and web

- **WHEN** the sign-in screen shows on Android or in a browser
- **THEN** it offers no passkey action

### Requirement: Password set from the Profile tab

The Profile tab SHALL let a signed-in user set a new password, also when the account had none, in
a sheet that opens over the Profile tab and returns to it when closed, with the account's email
as the account name and a new-password field with the rules of account creation. Every answer
SHALL be localized.

#### Scenario: Setting a password

- **WHEN** the user enters a password of at least 8 characters and saves
- **THEN** the account's password is set, the sheet closes, and later sign-ins with that password
  succeed

#### Scenario: Forgotten password

- **WHEN** a user who forgot the password signs in with an email code and sets a new password in
  the sheet
- **THEN** the new password works from then on

#### Scenario: Rejected password

- **WHEN** the password is too short, the same as the current one, or rejected as weak, or the
  device is offline
- **THEN** the sheet says which, keeps the entry and stays open

### Requirement: Passkeys managed from the Profile tab

On iOS, the Profile tab SHALL let a signed-in user see their passkeys, add a passkey through the
system's passkey sheet, and delete one after a confirmation, in a sheet that opens over the
Profile tab and returns to it when closed. Each passkey SHALL show its name, or a generic name
when it has none, and the date it was added. Every answer SHALL be localized.

#### Scenario: Adding a passkey

- **WHEN** the user adds a passkey and confirms with Face ID
- **THEN** the passkey is registered for the account, appears in the list, and signs the user in
  from then on

#### Scenario: Adding is cancelled

- **WHEN** the user dismisses the system sheet
- **THEN** nothing changes and no error shows

#### Scenario: Passkey already on this device

- **WHEN** the device already holds a passkey for the account
- **THEN** the sheet says so and the list stays as it was

#### Scenario: Deleting a passkey

- **WHEN** the user deletes a passkey and confirms
- **THEN** the passkey is removed from the account and the list, and signing in with it is
  answered as a passkey that is no longer valid

#### Scenario: Offline

- **WHEN** the list cannot be loaded, or adding or deleting fails, because the device is offline
- **THEN** the sheet says the action is not available offline
