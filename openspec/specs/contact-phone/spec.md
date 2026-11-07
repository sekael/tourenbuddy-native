## Purpose

Phone-number handling on contacts: parsing, formatting, and normalization to E.164 with Swiss default region.

## Requirements

### Requirement: Phone action links

A `usePhoneActions` composable SHALL generate click-to-call and WhatsApp deep links from a phone number string. Because all persisted phone values are E.164 (see `phone-formatting`), `usePhoneActions` SHALL produce both a `tel:` link and a `https://wa.me/<digits>` link whenever the input is non-null. When the input is `null`, both links SHALL be `null`. Legacy non-E.164 inputs (which may still appear for `isValid=false` rows) SHALL fall back to: `tel:` link with non-digits stripped (preserving leading `+` if present), `whatsAppLink = null`.

#### Scenario: Generate tel and WhatsApp links from E.164 input

- **WHEN** `usePhoneActions` is called with `'+41791234567'`
- **THEN** `telLink` SHALL be `'tel:+41791234567'`
- **AND** `whatsAppLink` SHALL be `'https://wa.me/41791234567'`

#### Scenario: Legacy non-E.164 input falls back

- **WHEN** `usePhoneActions` is called with a non-E.164 legacy value such as `'079 123 45 67'`
- **THEN** `telLink` SHALL be `'tel:0791234567'`
- **AND** `whatsAppLink` SHALL be `null`

#### Scenario: No phone number

- **WHEN** `usePhoneActions` is called with `null`
- **THEN** both `telLink` and `whatsAppLink` SHALL be `null`

### Requirement: Phone number display on contact chip

In read-only tour info contexts, the contact chip SHALL NOT render inline phone action icons. Phone actions SHALL be exposed via the contact action menu opened by clicking the chip (see `contact-chip-actions`). In selection contexts (tour creation / edit form) the chip SHALL continue to render without any phone action icons. A shared helper `formatPhoneForDisplay` SHALL still be used wherever a phone number is rendered (e.g., inside the action menu rows).

#### Scenario: Contact chip in tour info hides inline icons

- **WHEN** a contact chip renders in tour info for a contact with a primary phone method
- **THEN** the chip SHALL NOT display inline call or WhatsApp icons
- **AND** clicking the chip SHALL open the contact action menu

#### Scenario: Contact chip in selection context hides action icons

- **WHEN** a contact chip renders in tour creation or tour edit selection mode
- **THEN** no phone action icons SHALL be displayed
- **AND** clicking the chip SHALL toggle selection (not open the action menu)

#### Scenario: Displayed phone numbers remain formatted

- **WHEN** a phone number is rendered anywhere the chip interaction surfaces (for example, inside an action menu row)
- **THEN** the displayed value SHALL be produced via `formatPhoneForDisplay`
