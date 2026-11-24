## MODIFIED Requirements

### Requirement: Legal pages in both languages
`tourenbuddy.ch` SHALL serve a privacy policy, terms of use and an imprint in English and German as static pages that load without the app, are readable on a phone, and link to their other language. An English page SHALL forward a visitor whose app language (else browser language) is German to the German page, unless they chose English. The app's Profile and the store listings SHALL link to them.

#### Scenario: German privacy policy
- **WHEN** someone opens `https://tourenbuddy.ch/de/privacy`
- **THEN** the German privacy policy shows, with a link to the English one

#### Scenario: German reader at the English address
- **WHEN** a user whose app language is German opens `https://tourenbuddy.ch/terms`
- **THEN** the German terms show, and their "English" link shows the English text for the rest of the visit
