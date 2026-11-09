## Purpose

Guided first-run flow to capture the minimum profile data required to use the app (first and last name, optionally a verified phone).

## Requirements

### Requirement: Onboarding page for first-time users

An onboarding page at `/onboarding` SHALL collect first name, last name, and phone number from authenticated users whose profile is incomplete. The page SHALL require authentication (redirect unauthenticated users to home).

#### Scenario: First login redirects to onboarding

- **WHEN** an authenticated user with an incomplete profile navigates to `/map`
- **THEN** the router guard SHALL redirect to `/onboarding`

#### Scenario: Returning user with complete profile skips onboarding

- **WHEN** an authenticated user with a complete profile navigates to `/map`
- **THEN** the router guard SHALL allow navigation to `/map` without redirect

#### Scenario: User who skipped onboarding in this session is not redirected

- **WHEN** an authenticated user with an incomplete profile who skipped onboarding earlier in the current app session navigates to `/map`
- **THEN** the router guard SHALL allow navigation to `/map`

### Requirement: Onboarding form with validation

The onboarding form SHALL validate that first name and last name are non-empty strings. Phone number SHALL be optional but validated as a valid phone format (E.164) when provided.

#### Scenario: Valid form submission

- **WHEN** user fills in first name and last name and submits
- **THEN** the profile store SHALL upsert the profile with provided values and navigate to `/map`

#### Scenario: Form submission with phone number

- **WHEN** user fills in all fields including a phone number and submits
- **THEN** the profile SHALL be saved, phone verification flow SHALL be triggered, and on successful verification the user SHALL be navigated to `/map`

#### Scenario: Invalid form shows errors

- **WHEN** user submits with empty first name or last name
- **THEN** inline validation errors SHALL be displayed for empty required fields

### Requirement: Skip onboarding option

Users SHALL be able to skip the onboarding flow. A skip action SHALL set the in-memory `sessionSkipped` flag on the user-profile store and navigate to `/map`. The flag is not persisted: it clears on sign-out and on a full reload, so an incomplete profile is offered onboarding again in the next session.

#### Scenario: User skips onboarding

- **WHEN** user clicks "Skip" on the onboarding page
- **THEN** `sessionSkipped` SHALL become `true` and the user SHALL be navigated to `/map`

#### Scenario: Reminder text displayed

- **WHEN** the onboarding page is displayed
- **THEN** a message SHALL inform users that completing their profile provides the best experience

### Requirement: Router guard for profile completeness

A router `beforeEach` guard SHALL check profile completeness for routes with `requiresCompleteProfile: true` meta. The check SHALL be skipped while the profile is unknown (offline or on an
unverified session with nothing cached), and leaving the sign-in screens after a session arrives
SHALL wait until the profile is loaded, from the offline cache when there is no network.

#### Scenario: Guard redirects incomplete profile

- **WHEN** navigation targets a route with `requiresCompleteProfile: true` AND the user's profile is loaded and incomplete AND `sessionSkipped` is false
- **THEN** the guard SHALL redirect to `/onboarding`

#### Scenario: Guard allows complete profile

- **WHEN** navigation targets a route with `requiresCompleteProfile: true` AND the user's profile is complete
- **THEN** the guard SHALL allow navigation

#### Scenario: Offline with no cached profile

- **WHEN** the app is offline, the profile cache holds no entry, and the user navigates
  to a route requiring a complete profile
- **THEN** the profile-completeness check SHALL be skipped rather than treating the
  unloaded profile as incomplete, so the user is not routed to `/onboarding` and no
  profile overwrite is queued on their behalf

#### Scenario: Unverified session with no cached profile

- **WHEN** the session is unverified, the profile cache holds no entry, and the user
  navigates to a route requiring a complete profile
- **THEN** the profile-completeness check SHALL be skipped for the same reason — the
  profile was never fetched, so it is unknown rather than incomplete

#### Scenario: Profile is not yet loaded when the session lands

- **WHEN** the redirect off a sign-in-only route is triggered and the profile has not
  been loaded yet
- **THEN** the app SHALL load the profile (cache-first when offline) before navigating,
  so a user with a complete profile is not sent to `/onboarding`
