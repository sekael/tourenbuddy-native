## MODIFIED Requirements

### Requirement: Pull request checks

Every pull request and every push to `main` SHALL run lint at zero warnings, the type check, all
tests (including the locale checks) and the production web build with its service worker. Pull
requests that change native inputs (dependencies, app config, build config, patches or images)
SHALL also build a release app for iOS and review its permissions. A failing step SHALL fail the
check.

#### Scenario: Missing translation in a pull request

- **WHEN** a pull request adds a key to the English catalog only
- **THEN** the PR check fails at the test step

#### Scenario: Web build breaks

- **WHEN** a pull request introduces code that does not bundle for web, or a service worker that
  does not build
- **THEN** the PR check fails at the web build step

#### Scenario: Native build breaks

- **WHEN** a pull request adds a dependency whose native code does not compile for iOS
- **THEN** the native build check fails

#### Scenario: A library adds a permission

- **WHEN** a pull request adds a library that declares a permission the app has not recorded
- **THEN** the native build check fails and names the permission and the file that records the
  reviewed permissions

### Requirement: Releases

Merging the release pull request SHALL tag the version from the conventional commits, deploy the
public pages (`public/`), with the web app once the repository variable `WEB_DEPLOY` is `true`,
and start store builds of the `prod` variant, submitted to TestFlight (and to the Play internal
track once Google Play is set up). Build numbers SHALL increase with every store build without a
commit. A release step whose account is not set up yet SHALL skip with a notice.

#### Scenario: Release merged

- **WHEN** the owner merges the release pull request
- **THEN** the public pages are deployed and the iOS build starts with a build number higher than the
  last (Android joins once Google Play is set up)

#### Scenario: Accounts not set up yet

- **WHEN** a release runs before the Expo or Cloudflare secrets exist
- **THEN** the affected step skips with a notice naming the missing setup, and the release itself
  succeeds

#### Scenario: Web deploy switched on

- **WHEN** a release runs with `WEB_DEPLOY` set to `true`
- **THEN** the web app is deployed with the public pages, which still answer at their addresses

#### Scenario: Web deploy without its backend

- **WHEN** a release runs with `WEB_DEPLOY` set to `true` but without the Supabase secrets
- **THEN** the site deploy fails rather than deploy an app that cannot start, and the previous web
  app stays live

## ADDED Requirements

### Requirement: Web previews on pull requests

Every pull request from this repository SHALL deploy its web build to its own preview address on the
Pages project `tourenbuddy-native`, link it in a pull request comment that follows each push, and
delete the preview's deployments once the pull request closes. Without its secrets the preview SHALL
skip with a notice; pull requests from forks SHALL get none.

#### Scenario: Push to a pull request

- **WHEN** a commit is pushed to an open pull request
- **THEN** its web build is deployed to the branch's preview address and the comment names that
  address and the commit

#### Scenario: Pull request closed

- **WHEN** the pull request is merged or closed
- **THEN** the branch's preview deployments are deleted and the comment says so
