## MODIFIED Requirements

### Requirement: Pull request checks

Every pull request and every push to `main` SHALL run lint at zero warnings, the type check, all
tests (including the locale checks) and the production web build with its service worker. Pull
requests that change native inputs (dependencies, app config, build config, patches or images)
SHALL also build a release app for iOS and review its permissions. Pull requests that change the
Worker SHALL also run the Worker's tests. A failing step SHALL fail the check.

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

#### Scenario: Worker test fails

- **WHEN** a pull request changes the Worker so that one of its tests fails
- **THEN** the PR check fails at the Worker test step

## ADDED Requirements

### Requirement: The backend lives in this repository

This repository SHALL be the only source of the backend: the database schema with its migrations,
seed data and database tests, the Worker with its tests, and the weekly ski-route data job. The
local backend SHALL start from here, keeping the data of the stack the Vue repository started.
Deploys of the database and the Worker SHALL stay manual.

#### Scenario: Local backend from this repository

- **WHEN** a developer who ran the local backend from the Vue repository stops it there and starts
  it here
- **THEN** the same local data, seeded users and auth settings are back

#### Scenario: Linked project in step

- **WHEN** the owner links the production project from this repository and lists its migrations
- **THEN** every migration shows the same version locally and remotely

### Requirement: App checks leave the backend alone

The app's lint and type check SHALL NOT include the backend's code, which keeps its own runners and
style. The app's tests SHALL NOT run the Worker's or the database's tests; only the ski-route
script's own test runs with them, and it type-checks the script it imports.

#### Scenario: App checks ignore the backend

- **WHEN** `npm run check` runs on a fresh clone
- **THEN** it lints none of the Worker, the migrations or the ski-route script, type-checks only
  the ski-route script through its test, runs neither the Worker's nor the database's tests, and
  passes as before
