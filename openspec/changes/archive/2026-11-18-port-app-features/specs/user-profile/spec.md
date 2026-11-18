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

### Requirement: Pace in the profile

Profil SHALL offer the user's pace as a stepper from 0.5× to 1.5× in steps of 0.1, explained in a line below it; every estimated time SHALL follow it, on every device of the account.

#### Scenario: Faster

- **WHEN** the user raises the pace from 1.0× to 1.2×
- **THEN** a tour's estimated time SHALL be five sixths of the rule of thumb's
