## MODIFIED Requirements

### Requirement: Pull request checks

Every pull request and every push to `main` SHALL run lint at zero warnings, the type check, all
tests (including the locale checks) and a production web export. Pull requests that change native
inputs (dependencies, app config, build config, patches or images) SHALL also build a release app
for iOS and review its permissions. A failing step SHALL fail the check.

#### Scenario: Missing translation in a pull request

- **WHEN** a pull request adds a key to the English catalog only
- **THEN** the PR check fails at the test step

#### Scenario: Web build breaks

- **WHEN** a pull request introduces code that does not bundle for web
- **THEN** the PR check fails at the web export step

#### Scenario: Native build breaks

- **WHEN** a pull request adds a dependency whose native code does not compile for iOS
- **THEN** the native build check fails

#### Scenario: A library adds a permission

- **WHEN** a pull request adds a library that declares a permission the app has not recorded
- **THEN** the native build check fails and names the permission and the file that records the
  reviewed permissions

## ADDED Requirements

### Requirement: Releases

Merging the release pull request SHALL tag the version from the conventional commits, deploy the
public pages (`public/`, never a web app: the web app is the Vue PWA) and start store builds of the `prod` variant that are submitted to TestFlight (and to the Play
internal track once Google Play is set up). Build numbers SHALL increase with every store build without a commit. A release
step whose account is not set up yet SHALL skip with a notice instead of failing.

#### Scenario: Release merged

- **WHEN** the owner merges the release pull request
- **THEN** the public pages are deployed and the iOS build starts with a build number higher than the
  last (Android joins once Google Play is set up)

#### Scenario: Accounts not set up yet

- **WHEN** a release runs before the Expo or Cloudflare secrets exist
- **THEN** the affected step skips with a notice naming the missing setup, and the release itself
  succeeds
