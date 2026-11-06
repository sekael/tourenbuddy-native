## Purpose

User-facing strings are localized via vue-i18n with per-locale JSON catalogs (English and Swiss German).

## Requirements

### Requirement: Supported locales registry

The system SHALL maintain a registry of supported locales. Initial set MUST be `en` (English) and `de-CH` (Swiss German). English MUST be the fallback.

#### Scenario: Registry exposes supported codes

- **WHEN** any module imports the supported-locales registry
- **THEN** it SHALL receive an array containing at minimum `{ code: 'en', label: 'English' }` and `{ code: 'de-CH', label: 'Deutsch' }`

#### Scenario: Fallback locale is English

- **WHEN** a translation key is missing in the active locale
- **THEN** the system SHALL render the English value for that key

### Requirement: Locale auto-detection on first load

On first application load (no persisted user choice), the system SHALL select the locale by matching `navigator.languages` against supported codes. Region-tagged matches (e.g., `de-AT` → `de-CH`) SHALL fall back to the same base language. If no match, English SHALL be used.

#### Scenario: Browser language matches supported

- **WHEN** the user has no persisted locale and `navigator.languages[0]` is `de-CH`
- **THEN** the active locale on first paint SHALL be `de-CH`

#### Scenario: Browser language matches base only

- **WHEN** the user has no persisted locale and `navigator.languages[0]` is `de-AT`
- **THEN** the active locale SHALL be `de-CH`

#### Scenario: No supported match

- **WHEN** the user has no persisted locale and no `navigator.languages` entry matches a supported code or base
- **THEN** the active locale SHALL be `en`


### Requirement: Locale persistence per device

A user-chosen locale SHALL be persisted in `localStorage` under key `tb.locale` as a boot-time cache to prevent flashing the wrong language on cold reload. The persisted value SHALL be read synchronously before the Vue app mounts. The value SHALL survive sign-out. For authenticated users, `localStorage` is NOT the source of truth — the user's `user_profile.locale` (see `user-profile` spec) overrides it once the profile loads. For unauthenticated visitors, `localStorage` remains the only persistence.

#### Scenario: Persist on selection (cache)

- **WHEN** the user selects a locale via the profile language selector
- **THEN** the system SHALL write the selected code to `localStorage['tb.locale']` synchronously

#### Scenario: Restore on cold boot (cache)

- **WHEN** the application boots and `localStorage['tb.locale']` contains a supported code
- **THEN** the active locale on first paint SHALL be that code (overriding browser detection)

#### Scenario: Survives sign-out

- **WHEN** the user signs out
- **THEN** `localStorage['tb.locale']` SHALL remain unchanged

#### Scenario: Profile overrides cache after load

- **WHEN** an authenticated user's `user_profile.locale` is loaded and differs from the boot-time active locale
- **THEN** the system SHALL invoke `useLocaleStore.setLocale(profile.locale)` so the UI re-renders in the persisted preference

#### Scenario: Cross-device sync via profile

- **WHEN** the same authenticated user opens the app on a second device after selecting `de-CH` on the first
- **THEN** the second device SHALL render the UI in `de-CH` once `user_profile.locale` is loaded, regardless of its local `localStorage['tb.locale']` value

#### Scenario: Unauthenticated visitor remains per-device

- **WHEN** an unauthenticated visitor selects a locale
- **THEN** persistence SHALL be limited to `localStorage['tb.locale']` and SHALL NOT propagate across devices

### Requirement: Reactive locale switching

Changing the active locale at runtime SHALL update all rendered translations without a page reload, update `document.documentElement.lang`, and re-evaluate any Zod or validation error messages currently displayed.

#### Scenario: UI updates without reload

- **WHEN** the active locale changes from `en` to `de-CH`
- **THEN** all components using `t()` SHALL re-render with German strings within the next reactive tick

#### Scenario: HTML lang attribute syncs

- **WHEN** the active locale becomes `de-CH`
- **THEN** `document.documentElement.lang` SHALL equal `de-CH`

#### Scenario: Validation messages re-localize

- **WHEN** a form field shows a Zod validation error and the user switches locale
- **THEN** the error text SHALL update to the new locale on the next validation cycle

### Requirement: Type-safe message keys

Translation keys SHALL be type-checked at compile time using the English message catalog as the source of truth. Calls to `t()` with unknown keys SHALL produce a TypeScript error.

#### Scenario: Unknown key is a type error

- **WHEN** a developer writes `t('does.not.exist')`
- **THEN** `npm run type-check` SHALL fail

### Requirement: Locale parity check

CI SHALL fail if any non-English locale catalog is missing keys that exist in the English catalog.

#### Scenario: Missing German key fails CI

- **WHEN** `en.json` contains key `auth.signIn.title` and `de-CH.json` does not
- **THEN** the parity check script SHALL exit non-zero

### Requirement: Locale store

A Pinia store `useLocaleStore` SHALL expose the current locale code as a reactive ref and a `setLocale(code)` action. The action SHALL update vue-i18n, write to `localStorage`, update `<html lang>`, write through to the user's profile (if authenticated and profile loaded), and update `user_metadata.locale` (for email templating).

#### Scenario: setLocale rejects unsupported code

- **WHEN** `setLocale('xx-YY')` is called with an unsupported code
- **THEN** the store SHALL not update state and SHALL emit a warning via the logger composable

#### Scenario: setLocale updates all sinks (authenticated)

- **WHEN** `setLocale('de-CH')` is called and the user is authenticated with a loaded profile
- **THEN** the store SHALL update its ref, set `i18n.global.locale.value`, write `localStorage['tb.locale']`, set `document.documentElement.lang`, persist to `user_profile.locale`, and update `user_metadata.locale`

#### Scenario: setLocale skips profile write when profile not loaded

- **WHEN** `setLocale('de-CH')` is called before `useUserProfileStore.profile` is populated
- **THEN** the store SHALL update i18n, localStorage, and `<html lang>`, SHALL NOT throw, and SHALL NOT attempt the profile upsert; the next change after profile load SHALL persist

#### Scenario: Profile write failure does not break UI

- **WHEN** the profile upsert call fails
- **THEN** the active UI locale SHALL remain changed and the failure SHALL be logged via the logger composable

### Requirement: Localized formatting helpers

The system SHALL provide a `useFormatter` composable returning locale-aware date and number formatters backed by `Intl.DateTimeFormat` and `Intl.NumberFormat`.

#### Scenario: Date format follows locale

- **WHEN** `useFormatter().formatDate(date)` is called with active locale `de-CH`
- **THEN** the result SHALL use Swiss German conventions (e.g., `20.04.2026`)

### Requirement: Locale-to-email-locale normalization

The system SHALL provide a pure function that maps a supported i18n locale code to a base email locale code in the set `{en, de}`. This function MUST be used by every call site that writes `user_metadata.locale`.

#### Scenario: Swiss German maps to base German

- **WHEN** the function is called with `de-CH`
- **THEN** it SHALL return `de`

#### Scenario: English maps to itself

- **WHEN** the function is called with `en`
- **THEN** it SHALL return `en`

#### Scenario: Unknown input falls back to English

- **WHEN** the function is called with an unsupported code
- **THEN** it SHALL return `en`
