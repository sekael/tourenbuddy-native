## ADDED Requirements

### Requirement: Per-app language in system settings

The iOS and Android apps SHALL declare English and German as supported languages, so the system
settings offer a per-app language choice. A choice made there SHALL apply to the app's text the
next time the app is shown, without reinstalling.

#### Scenario: German chosen for the app only

- **WHEN** the device language is English and the user sets the app's language to German in the
  system settings
- **THEN** the app renders in `de-CH`

#### Scenario: Android change while running

- **WHEN** the user changes the app's language in Android settings while the app is in the
  background and then returns to it
- **THEN** the app renders in the new language without a restart

### Requirement: Plural and placeholder rendering

Count-dependent texts SHALL pick their form from the count: the zero form for 0 when the catalog
defines one, the singular form for 1, and the plural form otherwise. Named placeholders SHALL be
replaced by their values. The catalogs SHALL use one storage format for both, and SHALL NOT
contain syntax of the previous i18n library.

#### Scenario: Zero form defined

- **WHEN** a text defines zero, singular and plural forms and is rendered with count 0
- **THEN** the zero form is shown

#### Scenario: Zero form not defined

- **WHEN** a text defines only singular and plural forms and is rendered with count 0
- **THEN** the plural form is shown with `0`

#### Scenario: Literal at sign

- **WHEN** a text contains an e-mail placeholder such as `you@example.com`
- **THEN** the `@` renders literally

### Requirement: Locale auto-detection from preferred languages

Without a persisted user choice, the system SHALL pick the first of the device's preferred
languages that matches a supported code, or failing that its base language (`de-AT` → `de-CH`),
and English otherwise. It SHALL re-run this when the preferred languages change while running.

#### Scenario: Device language matches supported

- **WHEN** the user has no persisted locale and the first preferred language is `de-CH`
- **THEN** the active locale on first paint SHALL be `de-CH`

#### Scenario: Device language matches base only

- **WHEN** the user has no persisted locale and the first preferred language is `de-AT`
- **THEN** the active locale SHALL be `de-CH`

#### Scenario: Later language matches

- **WHEN** the user has no persisted locale and the preferred languages are `ja`, then `de-CH`
- **THEN** the active locale SHALL be `de-CH`

#### Scenario: No supported match

- **WHEN** the user has no persisted locale and no preferred language matches a supported code or
  base
- **THEN** the active locale SHALL be `en`

#### Scenario: Preferred languages change while running

- **WHEN** the user has no persisted locale and the device's first preferred language changes from
  `en` to `de-DE` while the app runs
- **THEN** the active locale SHALL become `de-CH` without a restart

## MODIFIED Requirements

### Requirement: Type-safe message keys

Translation keys SHALL be type-checked at compile time using the English message catalog as the
source of truth. Calls to `t()` with unknown keys SHALL produce a TypeScript error. Plural keys
SHALL be called by their base key with a count.

#### Scenario: Unknown key is a type error

- **WHEN** a developer writes `t('does.not.exist')`
- **THEN** `npm run typecheck` SHALL fail

### Requirement: Locale parity check

The test suite, and with it CI, SHALL fail if the locale catalogs differ in their keys, in either
direction, if a translation uses placeholders different from the English text of the same key, or
if a catalog still contains syntax of the previous i18n library.

#### Scenario: Missing German key fails CI

- **WHEN** `en.json` contains key `auth.signIn.title` and `de-CH.json` does not
- **THEN** the locale check SHALL fail and name the key

#### Scenario: Extra German key fails CI

- **WHEN** `de-CH.json` contains a key that `en.json` does not
- **THEN** the locale check SHALL fail and name the key

#### Scenario: Placeholder mismatch

- **WHEN** the English text of a key uses `{{count}}` and the German text uses `{{anzahl}}`
- **THEN** the locale check SHALL fail and name the key

#### Scenario: Leftover pipe plural

- **WHEN** a catalog value contains `{count} day | {count} days`
- **THEN** the locale check SHALL fail and name the key

## REMOVED Requirements

### Requirement: Locale auto-detection on first load

**Reason**: Its scenarios are written against the browser's `navigator.languages`; the apps read
the device's preferred languages, including the per-app language.
**Migration**: See "Locale auto-detection from preferred languages", which keeps the same matching
rules for web.
