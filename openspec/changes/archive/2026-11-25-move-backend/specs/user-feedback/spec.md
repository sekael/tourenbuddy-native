## MODIFIED Requirements

### Requirement: GitHub issue template links

The Feedback sheet SHALL offer two actions that open GitHub issue forms in a new browser tab: the primary action opens the `bug_report.yml` form, the secondary action opens the `beta_feedback.yml` form.

#### Scenario: Open bug report

- **WHEN** the user activates the bug report action
- **THEN** the application SHALL open `https://github.com/sekael/tourenbuddy-native/issues/new?template=bug_report.yml` in a new tab
- **AND** the Feedback sheet SHALL close

#### Scenario: Open feedback form

- **WHEN** the user activates the feedback action
- **THEN** the application SHALL open `https://github.com/sekael/tourenbuddy-native/issues/new?template=beta_feedback.yml` in a new tab
- **AND** the Feedback sheet SHALL close

#### Scenario: New tab blocked

- **WHEN** the user activates either action
- **AND** the browser blocks the new tab (e.g. popup blocker)
- **THEN** the application SHALL display an error snackbar instructing the user to use the email fallback, and the sheet SHALL stay open
