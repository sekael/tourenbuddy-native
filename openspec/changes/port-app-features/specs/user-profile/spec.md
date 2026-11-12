## ADDED Requirements

### Requirement: Profile tab as a settings list
The Profile tab SHALL be a system settings list: the user's name, email and phone with its verification state at the top; then Edit profile, Inbox, Notifications, Calendar sync, Language, Pace, Password, Passkeys (iOS), Show app tour, Feedback, Privacy policy, Terms, Imprint, the app version, Sign out and Delete account.

#### Scenario: Language
- **WHEN** the user picks German in the Language row
- **THEN** the app switches to de-CH at once and the choice is stored for the account

### Requirement: Delete account from the app
Delete account SHALL ask for confirmation in a system alert that names what is deleted and that it cannot be undone, then delete the account through the server, clear every local copy and show sign-in. It SHALL need a connection and SHALL leave the user signed in with an error if the server does not confirm.

#### Scenario: Offline
- **WHEN** the user confirms deletion while offline
- **THEN** nothing is deleted and the app says a connection is needed

#### Scenario: Success
- **WHEN** the server confirms the deletion
- **THEN** the app shows sign-in and no data of the account remains on the device
