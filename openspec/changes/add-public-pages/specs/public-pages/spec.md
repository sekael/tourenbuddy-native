## ADDED Requirements

### Requirement: Legal pages in both languages
`tourenbuddy.ch` SHALL serve a privacy policy, terms of use and an imprint in English and German as static pages that load without the app, are readable on a phone, and link to their other language. The app's Profile and the store listings SHALL link to them.

#### Scenario: German privacy policy
- **WHEN** someone opens `https://tourenbuddy.ch/de/privacy`
- **THEN** the German privacy policy shows, with a link to the English one

### Requirement: Account deletion is explained on the web
`tourenbuddy.ch/account-deletion` (and its German page) SHALL explain how to delete an account in the app, what is deleted and kept (reports, anonymized), and how to request deletion by email without the app.

#### Scenario: No app installed
- **WHEN** a user without the app opens the deletion page
- **THEN** it names the email address to write to and what to include

### Requirement: Published app configuration
`tourenbuddy.ch/app-config.json` SHALL publish the minimum supported app version per platform as JSON, cacheable for at most five minutes.

#### Scenario: Gate reads it
- **WHEN** the app fetches the configuration
- **THEN** it receives `min_supported_ios` and `min_supported_android` as version strings

### Requirement: The app's links open the app
The association file on `tourenbuddy.ch` SHALL list both iOS apps for Universal Links on every app path, keep the passkey entry, and exclude the legal and deletion pages so they open in the browser.

#### Scenario: Legal page with the app installed
- **WHEN** a user with the app taps a link to the privacy policy
- **THEN** it opens in the browser, not the app
