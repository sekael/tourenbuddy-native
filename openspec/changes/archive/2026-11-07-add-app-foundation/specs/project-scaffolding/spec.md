## ADDED Requirements

### Requirement: Project initializes as a universal app

The project SHALL be one TypeScript codebase that builds the iOS, Android and web clients. Native
modules SHALL run in development builds, not in a generic client app. A single check command SHALL
run lint, type check and tests, and each of them SHALL also run on its own.

#### Scenario: Fresh install and dev server start

- **WHEN** a developer runs `npm install` and then `npm start`
- **THEN** the dev server starts without errors and serves the app to a development build and to a
  browser

#### Scenario: Lint passes on clean project

- **WHEN** a developer runs `npm run lint`
- **THEN** the linter reports zero warnings and zero errors, formatting included

#### Scenario: Type check passes without a running dev server

- **WHEN** a developer or CI runs `npm run typecheck` on a fresh clone
- **THEN** the generated route types are created first and the type check completes with no errors

#### Scenario: Tests pass

- **WHEN** a developer runs `npm test`
- **THEN** all unit and component tests pass without a device or simulator

### Requirement: Native projects are generated from config

The iOS and Android projects SHALL be generated from the app config and config plugins and SHALL
NOT be committed. The generated apps SHALL require iOS 26 or later, declare that they use only
exempt encryption (HTTPS), use the light appearance only, support tablets, and opt in to Android
predictive back.

#### Scenario: Native folders stay out of version control

- **WHEN** a developer generates or builds the native projects
- **THEN** `git status` shows no `ios/` or `android/` changes

#### Scenario: Old iPhone cannot install

- **WHEN** the iOS app is installed on a device running iOS 18
- **THEN** the install is refused because the minimum version is iOS 26

#### Scenario: Dark mode device

- **WHEN** the device is set to dark appearance
- **THEN** the app and its system bars still render in the light appearance

### Requirement: App variants

The app SHALL have a `dev` and a `prod` variant with distinct bundle identifiers, display names and
URL schemes, so both can be installed on one device. The `dev` variant SHALL be the default; the
`prod` identity SHALL be produced only when the build selects it explicitly.

#### Scenario: Default build is dev

- **WHEN** a developer builds the app without selecting a variant
- **THEN** the app installs as "TourenBuddy Dev" with identifier `ch.tourenbuddy.app.dev` and URL
  scheme `tourenbuddy-dev`

#### Scenario: Prod build

- **WHEN** a build selects the `prod` variant
- **THEN** the app installs as "TourenBuddy" with identifier `ch.tourenbuddy.app` and URL scheme
  `tourenbuddy`

#### Scenario: Both installed

- **WHEN** a dev and a prod build are installed on the same device
- **THEN** both appear on the home screen and neither replaces the other

### Requirement: Launch screen and app icon

The app SHALL show a launch screen on the same white background as its first screen, so launch
fades into the app without a color flash, and SHALL use the TourenBuddy icon on every platform
(home screen, Android adaptive icon, browser tab).

#### Scenario: Cold start

- **WHEN** the user cold-starts the app
- **THEN** the launch screen shows the TourenBuddy icon on white and hands over to the first screen
  without a flash of another color

#### Scenario: Android launcher mask

- **WHEN** the Android launcher masks the icon as a circle or squircle
- **THEN** the icon fills the mask with no white border around it

### Requirement: Logger wraps the console

A shared logger SHALL provide `debug`, `info`, `warn` and `error`, each prefixed with a tag naming
its module. Release builds SHALL drop `debug` and `info`. No other production code SHALL call the
console directly; lint SHALL reject it.

#### Scenario: Debug message in a release build

- **WHEN** code logs at `debug` or `info` in a release build
- **THEN** nothing is written to the console

#### Scenario: Error in a release build

- **WHEN** code logs at `error` in a release build
- **THEN** the message is written to the console with its tag

#### Scenario: Direct console call

- **WHEN** production code outside the logger calls `console.log`
- **THEN** `npm run lint` fails

### Requirement: Pull request checks

Every pull request and every push to `main` SHALL run lint at zero warnings, the type check, all
tests (including the locale checks) and a production web export. A failing step SHALL fail the
check.

#### Scenario: Missing translation in a pull request

- **WHEN** a pull request adds a key to the English catalog only
- **THEN** the PR check fails at the test step

#### Scenario: Web build breaks

- **WHEN** a pull request introduces code that does not bundle for web
- **THEN** the PR check fails at the web export step

## MODIFIED Requirements

### Requirement: Directory structure follows AGENTS.md convention

The `src/` directory SHALL be organized as: `app/` (file-based routes and layouts only), `core/`
(shared infrastructure such as i18n and logging, never importing from features), `features/`
(feature modules with domain/data/presentation layers) and `locales/` (translation catalogs). Tests
SHALL live in `test/`, mirroring `src/`. Web-only implementations SHALL use the `.web.tsx` or
`.web.ts` suffix next to their native counterpart.

#### Scenario: Feature module structure

- **WHEN** a new feature module is created
- **THEN** it SHALL contain `data/` (services, models, repositories), `domain/` (entities, repository
  interfaces), and `presentation/` (stores, screens, components) subdirectories

#### Scenario: Test location

- **WHEN** a test covers `src/core/i18n/detect.ts`
- **THEN** it SHALL live at `test/core/i18n/detect.test.ts`

## REMOVED Requirements

### Requirement: Project initializes with Vite and TypeScript

**Reason**: The native repository builds iOS, Android and web with Expo, not Vite and Vue.
**Migration**: See "Project initializes as a universal app".

### Requirement: Logger composable wraps consola

**Reason**: React has no composables, and a few lines over the console cover it without a
dependency.
**Migration**: See "Logger wraps the console".
