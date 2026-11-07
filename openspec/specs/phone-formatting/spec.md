## Purpose

Format phone numbers for display using libphonenumber-js with Swiss default region.

## Requirements

### Requirement: Canonical phone validation and normalization utility

A shared utility `normalizePhone(input, defaultRegion?)` SHALL parse a phone string using `libphonenumber-js` against the given default region (default `CH`) and return either `{ ok: true, e164 }` with the E.164 form (e.g. `+41791234567`) or `{ ok: false, raw }` when the input is empty, unparseable, or fails `isValid()` for any region. This utility is the single source of truth for phone validation across the app.

#### Scenario: Valid Swiss national number normalized to E.164

- **WHEN** `normalizePhone('079 123 45 67')` is called with default region `CH`
- **THEN** the result SHALL be `{ ok: true, e164: '+41791234567' }`

#### Scenario: Valid international number with + prefix

- **WHEN** `normalizePhone('+49 30 1234567')` is called
- **THEN** the result SHALL be `{ ok: true, e164: '+49301234567' }` regardless of default region

#### Scenario: Invalid number rejected

- **WHEN** `normalizePhone('123')` is called
- **THEN** the result SHALL be `{ ok: false, raw: '123' }`

#### Scenario: Empty input rejected

- **WHEN** `normalizePhone('')` or `normalizePhone(null)` is called
- **THEN** the result SHALL be `{ ok: false, raw: '' }`

#### Scenario: Whitespace-only input rejected

- **WHEN** `normalizePhone('   ')` is called
- **THEN** the result SHALL be `{ ok: false, raw: '' }`

#### Scenario: 00-prefixed international form

- **WHEN** `normalizePhone('0041 79 123 45 67')` is called
- **THEN** the result SHALL be `{ ok: true, e164: '+41791234567' }`

### Requirement: Display formatter for E.164 phones

A `formatPhoneForDisplay(e164)` utility SHALL return the international human-readable form (e.g. `+41 79 123 45 67`) using `libphonenumber-js` `formatInternational()`. If the input is not parseable as E.164, the utility SHALL return the input unchanged.

#### Scenario: Format E.164 to spaced international

- **WHEN** `formatPhoneForDisplay('+41791234567')` is called
- **THEN** the result SHALL be `+41 79 123 45 67`

#### Scenario: Pass through unparseable input

- **WHEN** `formatPhoneForDisplay('not a phone')` is called
- **THEN** the result SHALL be `'not a phone'`

### Requirement: E.164 storage form

All phone numbers persisted to `contact_methods.value` (where `method_type = 'phone'`) SHALL be in E.164 format: leading `+`, country code, subscriber digits, no spaces or punctuation. Any code path writing a phone number SHALL call `normalizePhone` first and persist the `e164` field.

#### Scenario: E.164 shape requirement

- **WHEN** any phone value is written to `contact_methods.value`
- **THEN** the value SHALL match the regex `^\+[1-9]\d{1,14}$` (E.164)
