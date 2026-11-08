## MODIFIED Requirements

### Requirement: Pull request checks

Every pull request and every push to `main` SHALL run lint at zero warnings, the type check, all
tests (including the locale checks) and a production web export. Pull requests that change native
inputs (dependencies, app config, build config, patches or images) SHALL also build release apps
for iOS and Android and review their permissions. A failing step SHALL fail the check.

#### Scenario: Missing translation in a pull request

- **WHEN** a pull request adds a key to the English catalog only
- **THEN** the PR check fails at the test step

#### Scenario: Web build breaks

- **WHEN** a pull request introduces code that does not bundle for web
- **THEN** the PR check fails at the web export step

#### Scenario: Native build breaks

- **WHEN** a pull request adds a dependency whose native code does not compile for iOS or Android
- **THEN** the native build check fails

#### Scenario: A library adds a permission

- **WHEN** a pull request adds a library that declares a permission the app has not recorded
- **THEN** the native build check fails and names the permission and the file that records the
  reviewed permissions

#### Scenario: Native libraries not aligned for 16 KB pages

- **WHEN** a pull request adds an Android native library that is not aligned for 16 KB pages
- **THEN** the native build check fails

## ADDED Requirements

### Requirement: Releases

Merging the release pull request SHALL tag the version from the conventional commits, deploy the web
app and start store builds of the `prod` variant that are submitted to TestFlight and the Play
internal track. Build numbers SHALL increase with every store build without a commit. A release
step whose account is not set up yet SHALL skip with a notice instead of failing.

#### Scenario: Release merged

- **WHEN** the owner merges the release pull request
- **THEN** the web app is deployed and iOS and Android builds start, each with a build number higher
  than the last

#### Scenario: Accounts not set up yet

- **WHEN** a release runs before the Expo or Cloudflare secrets exist
- **THEN** the affected step skips with a notice naming the missing setup, and the release itself
  succeeds

### Requirement: Web previews

Every pull request from this repository SHALL get a preview of the web app, linked in a comment on
the pull request and updated on every push, and the preview SHALL be deleted when the pull request
closes.

#### Scenario: Pull request opened

- **WHEN** a pull request is opened from a branch of this repository
- **THEN** a comment links the preview of its latest commit

#### Scenario: Pull request closed

- **WHEN** the pull request is merged or closed
- **THEN** its preview deployments are deleted
