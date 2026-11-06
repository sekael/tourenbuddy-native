## Purpose

In-app feedback channel for users to report bugs and request features, delivered to maintainers.

## Requirements

### Requirement: Feedback entry point on the map screen

The map screen SHALL expose a Feedback item in the speed-dial menu that opens a sheet offering ways to send feedback to the team. The sheet SHALL render as a bottom sheet on mobile and a dialog on desktop.

#### Scenario: Feedback item in the speed dial

- **WHEN** the user opens the map speed-dial menu
- **THEN** a Feedback item SHALL be listed with its label and tooltip

#### Scenario: Selecting the item opens the sheet

- **WHEN** the user selects the Feedback item
- **THEN** the menu SHALL close and the application SHALL display the Feedback sheet, containing a primary "report a bug" action, a secondary "share feedback" action, and a hint pointing to the feedback email

### Requirement: GitHub issue template links

The Feedback sheet SHALL offer two actions that open GitHub issue forms in a new browser tab: the primary action opens the `bug_report.yml` form, the secondary action opens the `beta_feedback.yml` form.

#### Scenario: Open bug report

- **WHEN** the user activates the bug report action
- **THEN** the application SHALL open `https://github.com/sekael/tourenbuddy_frontend_vue/issues/new?template=bug_report.yml` in a new tab
- **AND** the Feedback sheet SHALL close

#### Scenario: Open feedback form

- **WHEN** the user activates the feedback action
- **THEN** the application SHALL open `https://github.com/sekael/tourenbuddy_frontend_vue/issues/new?template=beta_feedback.yml` in a new tab
- **AND** the Feedback sheet SHALL close

#### Scenario: New tab blocked

- **WHEN** the user activates either action
- **AND** the browser blocks the new tab (e.g. popup blocker)
- **THEN** the application SHALL display an error snackbar instructing the user to use the email fallback, and the sheet SHALL stay open

### Requirement: Email fallback always visible

The Feedback sheet SHALL always display the support email address `feedback@tourenbuddy.ch` as a fallback for users without a GitHub account.

#### Scenario: Email fallback rendered

- **WHEN** the Feedback sheet is open
- **THEN** the sheet SHALL render a `mailto:feedback@tourenbuddy.ch` link below the GitHub actions

### Requirement: Centralized feedback configuration

The GitHub issue URLs and feedback email used by the Feedback sheet SHALL be defined as constants in `src/core/constants/feedback.ts` and SHALL NOT be hardcoded inside Vue components.

#### Scenario: Constants module exposes values

- **WHEN** any component or test imports feedback configuration
- **THEN** it SHALL import `BUG_REPORT_GITHUB_ISSUE_URL`, `FEEDBACK_GITHUB_ISSUE_URL` and `FEEDBACK_EMAIL` from `@/core/constants/feedback`
