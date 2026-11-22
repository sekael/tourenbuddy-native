# terms-acceptance Specification

## Purpose

How the app gets and keeps the user's acceptance of the terms of use: the acceptance page before
any use, acceptance again after a change, apps that cannot accept, offline use, edits saved before
the acceptance, the line at sign-up, and wording that does not invite reliance.

## Requirements

### Requirement: The terms are accepted before the app is used
A signed-in user SHALL NOT reach any screen of the app until they have accepted the current version of the terms of use. The acceptance page SHALL say in plain words that TourenBuddy only stores and shares their plans, that every activity is their own risk and responsibility, that liability is excluded as far as the law allows including personal injury from slight or medium negligence, and that they indemnify the operator against claims by others they cause. It SHALL link to the full terms and privacy policy, readable without leaving the page for good, and offer to accept, to sign out and to delete the account.

#### Scenario: New account
- **WHEN** a new user confirms their email code
- **THEN** the acceptance page shows before anything else, and after accepting the app continues with the welcome

#### Scenario: Existing account, first time
- **WHEN** a user who never accepted the terms signs in or opens the app
- **THEN** the acceptance page shows, and after accepting the app opens where it would have

#### Scenario: Reading the terms first
- **WHEN** the user opens the terms or the privacy policy from the acceptance page
- **THEN** the full text shows, and going back returns to the acceptance page

#### Scenario: Not accepting
- **WHEN** the user signs out from the acceptance page
- **THEN** the sign-in screen shows and nothing of the app was reachable

#### Scenario: Deleting instead
- **WHEN** the user chooses to delete the account from the acceptance page and confirms
- **THEN** the account is deleted and the sign-in screen shows

### Requirement: Changed terms are accepted again
When the terms change in a way that affects users, every user SHALL accept the new version before using the app again. The page SHALL say what changed.

#### Scenario: Terms updated
- **WHEN** a user who accepted an earlier version opens the app after the terms changed
- **THEN** the page says the terms were updated and what changed, and the app opens once they accept

### Requirement: An app that cannot accept says so
An app too old to show the current terms SHALL say that it must be updated instead of offering to accept. An app newer than the terms in force SHALL say the terms are not available yet when the account has not accepted the version in force, and check again. Both SHALL offer sign out and account deletion.

#### Scenario: Outdated app
- **WHEN** the terms in force are newer than the app's own
- **THEN** the page asks to update the app and offers no accept button

### Requirement: Offline does not lock out an accepted user
Offline, a user who accepted the current terms on this device SHALL use the app as usual. A user without an earlier acceptance SHALL see the acceptance page with the note that accepting needs a connection.

#### Scenario: Accepted, then offline
- **WHEN** a user who accepted opens the app without a connection
- **THEN** the app opens normally

#### Scenario: Never accepted, offline
- **WHEN** a user who has not accepted opens the app without a connection
- **THEN** the acceptance page shows with the connection note, and accepting works once online

### Requirement: Edits are never lost to the acceptance
Edits saved offline SHALL wait until the terms are accepted and then be saved; a refusal because the terms are not yet accepted SHALL never discard them.

#### Scenario: Offline edit across a terms change
- **WHEN** a user edits a tour offline, the terms change meanwhile, and the user comes online and accepts
- **THEN** the edit is saved and shows on their other devices

### Requirement: Sign-up shows the terms before the account exists
The create-account screen SHALL link the terms of use and the privacy policy before the email address is sent, readable in the app.

#### Scenario: Creating an account
- **WHEN** someone opens "Create account"
- **THEN** a line under the button says they accept the terms before using TourenBuddy, with both documents as links

### Requirement: The app does not invite reliance
Wording about routes, trails, ski routes and difficulty SHALL present them as data from their sources to be checked, never as recommendations. The ski-route detail sheet SHALL name its source and remind to check current conditions.

#### Scenario: Ski-route details
- **WHEN** a user opens a ski route's details on the map
- **THEN** the sheet says the details come from swisstopo's ski-route data produced with the SAC and to check the current conditions before going
