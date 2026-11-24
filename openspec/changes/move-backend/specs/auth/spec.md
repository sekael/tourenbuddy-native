## MODIFIED Requirements

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
  the backend, not by the app)

#### Scenario: Requests do not overlap

- **WHEN** the user activates sign-in again while a sign-in request is in flight
- **THEN** no second request is sent
