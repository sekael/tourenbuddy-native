## MODIFIED Requirements

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
