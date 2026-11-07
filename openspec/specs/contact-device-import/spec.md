## Purpose

Import contacts from the device address book via the Contact Picker API or vCard upload, mapping fields to the app's contact schema.

## Requirements

### Requirement: Dedupe identical phones during import

Both import parsers (`parseVCardText` in `use-vcard-import.ts` and `useContactPicker().pickContacts`) SHALL, per contact, collapse multiple `phones` entries that share the same `value` into a single entry before returning. The merge SHALL OR the `isPrimary` flags (any `true` among collapsed entries wins) and SHALL keep the first non-null `label` in input order. Both parsers SHALL ALSO deduplicate `rawPhoneNumbers` per contact by `trim()` + lowercase comparison, preserving first-seen casing.

#### Scenario: vCard with two identical TEL lines

- **WHEN** a vCard contains two `TEL;TYPE=CELL:+41 79 123 45 67` lines for the same contact
- **THEN** `phones` SHALL contain exactly one entry with `value: '+41791234567'`, `label: 'Mobile'`, and `isPrimary: true`

#### Scenario: vCard with two TEL lines normalizing to the same E.164

- **WHEN** a vCard contains `TEL;TYPE=CELL:+41791234567` and `TEL;TYPE=HOME:079 123 45 67` (both normalize to `+41791234567`)
- **THEN** `phones` SHALL contain exactly one entry with `value: '+41791234567'`, `label: 'Mobile'` (first non-null label kept), and `isPrimary: true` (CELL wins under existing primary-selection rules over a deduped set)

#### Scenario: vCard duplicate where second copy carries PREF

- **WHEN** a vCard contains `TEL;TYPE=CELL:+41 79 123 45 67` then `TEL;TYPE=HOME,PREF:+41 79 123 45 67`
- **THEN** `phones` SHALL contain exactly one entry with `value: '+41791234567'`, `label: 'Mobile'` (first non-null label), and `isPrimary: true` (PREF preserved via primary-selection running on the deduped set)

#### Scenario: Contact Picker returns duplicate tel values

- **WHEN** the Contact Picker yields a contact with `tel: ['+41 79 123 45 67', '+41 79 123 45 67']`
- **THEN** `phones` SHALL contain exactly one `PickedPhone` with `value: '+41791234567'`, `label: null`, and `isPrimary: true`

#### Scenario: Duplicate unparseable raw values collapse

- **WHEN** an imported contact yields raw unparseable values `['ext. 1234', 'ext. 1234', 'EXT. 1234']` (mixed case, leading/trailing whitespace stripped)
- **THEN** `rawPhoneNumbers` SHALL contain exactly one entry equal to the first-seen casing (`'ext. 1234'`)

#### Scenario: Distinct numbers are not collapsed

- **WHEN** an imported contact yields two phones with different normalized values
- **THEN** `phones` SHALL contain two entries and no merge SHALL occur

### Requirement: Per-contact handling of invalid-only and mixed phone sets

`useContactImport().importContacts` SHALL decide each parsed contact's disposition, in this
order, and SHALL return one result row per contact (`status` `'imported'` or `'skipped'`
with a `skipReason`). Outcomes are reported in the import-results view, not by snackbars.

1. A contact whose first AND last name match an existing contact (case-insensitive) SHALL
   be skipped with `skipReason: 'nameDuplicate'`.
2. A contact with `phones.length === 0` AND `rawPhoneNumbers.length > 0` SHALL be skipped
   (no row inserted) with `skipReason: 'unparseable'`.
3. A contact whose every valid phone already belongs to another existing contact SHALL be
   skipped with `skipReason: 'phoneDuplicate'`.
4. Otherwise the contact SHALL be created with its valid, non-duplicate phones; any
   `rawPhoneNumbers` stay on the result row as discarded numbers. A contact with no phone
   data at all SHALL be created with its name only.

#### Scenario: Contact with TEL entries but none parseable

- **WHEN** the parser returns a contact with `phones: []` and `rawPhoneNumbers: ['ext. 1234']`
- **THEN** no TourenBuddy contact SHALL be created for that entry AND its result row SHALL have `status: 'skipped'`, `skipReason: 'unparseable'`

#### Scenario: Contact with mixed valid + invalid phones

- **WHEN** the parser returns a contact with `phones: [{ value: '+41791234567', ... }]` and `rawPhoneNumbers: ['ext. 1234', 'pbx 100']`
- **THEN** the contact SHALL be created with one phone method (`+41791234567`) AND its result row SHALL have `status: 'imported'` and carry both discarded values in `rawPhoneNumbers`

#### Scenario: Contact without phone data

- **WHEN** the parser returns a contact with `phones: []` and `rawPhoneNumbers: []`
- **THEN** the contact SHALL be created with name only and its result row SHALL have `status: 'imported'`

#### Scenario: Skipped contacts counted in the summary

- **WHEN** the user imports 5 contacts where 1 is skipped under the unparseable rule
- **THEN** the results summary SHALL report `4` imported and `1` unparseable

### Requirement: Import skips phones already held by another contact

Import persists phones only (emails are not persisted on import). The importer MUST
NOT insert, onto an imported contact, a phone value that already belongs to another
of the user's existing contacts. It SHALL skip the cross-contact duplicate phone
(rather than letting the per-user unique index reject the insert) and continue
importing the contact's remaining, non-duplicate phones.

#### Scenario: Imported contact reuses a number already on another contact
- **WHEN** an imported contact carries a phone that already exists on a different existing contact of the user
- **THEN** that phone is skipped for the imported contact and the import does not fail with a unique-violation

#### Scenario: Imported contact whose phones are all duplicates is skipped entirely
- **WHEN** every phone of an imported contact already exists on other contacts of the user
- **THEN** the contact is not created (no name-only orphan) and it is reported as skipped in the results

#### Scenario: Non-duplicate methods on the same imported contact still import
- **WHEN** an imported contact has one phone that duplicates another contact and one phone that is new
- **THEN** the duplicate is skipped and the new phone is imported onto the contact

### Requirement: Import results are presented as a grouped summary box

The import-results view MUST present outcomes as a summary box with distinct grouped
categories — imported, skipped as already on another contact, skipped as a name
duplicate, and unparseable — rather than a single bare "X skipped" label. Each non-empty category
SHALL show its count and enough context to identify what it refers to.

#### Scenario: Skipped cross-contact duplicates are reported in the summary
- **WHEN** an import skips one or more contacts because all their phones already exist on other contacts
- **THEN** the results summary box shows a "already on another contact" category with the skipped count, distinct from the unparseable category

#### Scenario: Empty categories are omitted
- **WHEN** an import produces no unparseable and no skipped-duplicate entries
- **THEN** those categories are not rendered in the summary box

### Requirement: Importing via Contact Picker

The contact creation dialog SHALL display import options based on platform capabilities (the
"Import from contacts" button only where the Contact Picker API exists), run every parsed
contact through `useContactImport().importContacts`, and then switch to the import-results
view.

#### Scenario: Importing via Contact Picker

- **WHEN** the user taps "Import from contacts" and selects device contacts
- **THEN** the app SHALL create a TourenBuddy contact for each importable selected contact, with one `contact_methods` phone row per non-duplicate entry in its `phones` array, and SHALL show the import-results view

#### Scenario: Importing via vCard file

- **WHEN** the user taps "Import from file" and selects a `.vcf` file
- **THEN** the app SHALL parse the file, create a TourenBuddy contact for each importable vCard entry with one `contact_methods` phone row per non-duplicate phone, and SHALL show the import-results view

#### Scenario: Import with duplicate prevention

- **WHEN** an imported contact (from either method) matches an existing TourenBuddy contact by first name AND last name (case-insensitive)
- **THEN** the import SHALL skip that contact and the results summary SHALL count it as a name duplicate

### Requirement: Import results surface unparseable phones

Only valid phones are ever stored, so the import-results row SHALL surface the numbers that
could not be normalized (`rawPhoneNumbers`) so the user knows which entries to fix. The row
SHALL show the primary phone inline, formatted for display, with the remaining valid phones
collapsed behind a "+N more" indicator.

#### Scenario: Import-results row with discarded numbers

- **WHEN** the import-results view renders a row whose `rawPhoneNumbers` is non-empty and whose skip reason is not a duplicate
- **THEN** the row SHALL display a warning marker with the first discarded value (and a count of further ones), and a tooltip listing all of them

#### Scenario: Import-results row without discarded numbers

- **WHEN** the import-results view renders a row whose `rawPhoneNumbers` is empty
- **THEN** no discarded-number indicator SHALL be shown

#### Scenario: Import-results row collapses secondary phones

- **WHEN** an imported contact has more than one phone
- **THEN** the import-results row SHALL display only the primary phone inline and a "+N more" indicator where N is the count of remaining phones

### Requirement: Import results integrate connect prompt

The import-results component SHALL, after parsing vCard or device-picker contacts, batch-call `useFriendshipsStore().findUsersByPhones(uniquePhones)` once for the union of unique normalized phone values across all parsed rows. The call SHALL only be made when the caller's own phone is verified. Each result row whose primary phone matches a verified user who is not the caller and not already a friend SHALL render the inline connect prompt defined by the `contact-account-linking` capability. Importing the contact and sending the friend request SHALL be independent operations — neither blocks the other.

#### Scenario: Import-results renders prompts

- **WHEN** the import results render and a parsed row's phone matches a verified user other than the caller
- **THEN** the row SHALL render the connect prompt with "Send request" and "Just save contact" actions

#### Scenario: Import succeeds when request fails

- **WHEN** the user taps "Send request" and the friend-request RPC fails
- **THEN** the contact import SHALL still complete on user confirmation AND a snackbar SHALL surface the request failure

#### Scenario: Discovery suppressed when caller unverified

- **WHEN** the calling user does not have `phone_confirmed_at` set
- **THEN** no batch discovery call SHALL be made and no prompts SHALL render in import results

### Requirement: Import entry point states the accepted file format

The add-contact view SHALL render, adjacent to the import buttons and without requiring
any interaction, a statement of the accepted import format: vCard files with extension
`.vcf` or `.vcard`, one file per import, where a single file MAY contain multiple
contacts.

#### Scenario: User opens the add-contact view

- **WHEN** the add-contact view is rendered in its form state
- **THEN** the accepted-format statement SHALL be visible without expanding any disclosure and SHALL name both the `.vcf` and `.vcard` extensions

#### Scenario: File chooser offers vCard MIME types

- **WHEN** the hidden file input is rendered
- **THEN** its `accept` attribute SHALL include the extensions `.vcf` and `.vcard` AND the MIME types `text/vcard` and `text/x-vcard`, and it SHALL NOT carry the `multiple` attribute

### Requirement: Platform-specific export instructions behind a disclosure

The add-contact view SHALL provide collapsed-by-default export instructions, expandable
without navigating away from the view. The expanded content SHALL present three platform
tabs — iOS, Android and Desktop — implemented with `role="tablist"` / `role="tab"` and
`aria-selected` reflecting the active tab. Selecting a tab SHALL replace the displayed step
list with that platform's steps.

The iOS tab SHALL be active on first render for every user. The component SHALL NOT
inspect the user agent, touch-point count, or any platform capability to choose the active
tab.

#### Scenario: Disclosure is collapsed on first render

- **WHEN** the add-contact view is rendered
- **THEN** the export instructions SHALL NOT be visible and a labelled control to expand them SHALL be

#### Scenario: Active tab on first render

- **WHEN** the disclosure is expanded, on any platform
- **THEN** the iOS tab SHALL be active, the iOS steps SHALL be displayed, and the Android and Desktop tabs SHALL both be present and selectable

#### Scenario: User selects another platform

- **WHEN** a user selects a tab other than the active one
- **THEN** that tab SHALL become active, its `aria-selected` SHALL become `true`, the previous tab's SHALL become `false`, and the displayed steps SHALL be replaced with the selected platform's steps

#### Scenario: Android steps name both import paths

- **WHEN** the Android tab is displayed
- **THEN** the steps SHALL name the "Import from contacts" button as the one-tap path AND SHALL also give the `.vcf` export steps as a fallback, in both cases independently of whether the Contact Picker API is supported in the current browser

#### Scenario: Guidance is not duplicated outside the add view

- **WHEN** the contacts list is rendered, including its empty state
- **THEN** the export instructions and the accepted-format statement SHALL NOT be rendered there

### Requirement: File import failures are reported distinctly

`useVCardImport.parseVCardFile` SHALL validate its input and SHALL throw a
`VCardImportError` carrying a `reason` field of `'emptyFile'`, `'notVCard'` or
`'noContacts'` instead of returning an unusable result. The checks SHALL be evaluated in
that order.

- `emptyFile`: the file has zero bytes, or its text content is empty after trimming.
- `notVCard`: the text content contains no case-insensitive `BEGIN:VCARD` marker. This
  check SHALL be made against file *content*; a file SHALL NOT be rejected on the basis of
  its filename or extension.
- `noContacts`: the content parsed, but every contact produced is junk — carrying the
  `'Unknown'` name fallback with no `phones` and no `rawPhoneNumbers`.

`parseVCardText` SHALL remain pure and SHALL continue to return an empty array for input
containing no vCard blocks; it SHALL NOT throw.

The add-contact view SHALL map each `reason` to its own localized message, SHALL display it
on the add form, and SHALL NOT switch to the import-results view when a file import fails.
Each message SHALL state the corrective action, not only the failure.

#### Scenario: Empty file selected

- **WHEN** a user selects a file of zero bytes, or one whose content is only whitespace
- **THEN** `parseVCardFile` SHALL throw a `VCardImportError` with `reason: 'emptyFile'` AND the view SHALL remain on the add form displaying the empty-file message

#### Scenario: Non-vCard file selected

- **WHEN** a user selects a file whose content contains no `BEGIN:VCARD` marker (for example a CSV export or an image)
- **THEN** `parseVCardFile` SHALL throw a `VCardImportError` with `reason: 'notVCard'` AND the view SHALL remain on the add form displaying the not-a-vCard message

#### Scenario: vCard content in a file with an unexpected extension

- **WHEN** a user selects a file named without a `.vcf`/`.vcard` extension whose content does contain `BEGIN:VCARD`
- **THEN** the file SHALL be parsed normally and no `VCardImportError` SHALL be thrown

#### Scenario: vCard containing only nameless, phoneless cards

- **WHEN** a user selects a file whose every vCard block lacks `N`, `FN` and `TEL` (for example `ORG:`- or `NOTE:`-only cards)
- **THEN** `parseVCardFile` SHALL throw a `VCardImportError` with `reason: 'noContacts'` AND no contact named `'Unknown'` SHALL be created

#### Scenario: Mixed file with one usable contact

- **WHEN** a user selects a file containing one block with a name or phone and one nameless, phoneless block
- **THEN** no error SHALL be thrown and the import SHALL proceed with the parsed contacts

#### Scenario: Read failure is still reported generically

- **WHEN** reading the selected file rejects for a reason other than the three validated cases
- **THEN** the view SHALL display the existing generic `contacts.addDialog.fileImportError` message and SHALL remain on the add form

#### Scenario: Failed import does not advance the view

- **WHEN** any file import failure occurs
- **THEN** `addViewState` SHALL remain `'form'` AND no empty import-results summary SHALL be rendered

### Requirement: Import results screen is fully localized

Every user-facing string on the import-results view SHALL resolve through `vue-i18n` in
both `en` and `de-CH`. No literal English SHALL be embedded in the template or in a bound
expression.

#### Scenario: Extra phone count on a result row

- **WHEN** an imported contact carries more than one phone number
- **THEN** the additional-count indicator SHALL resolve from a localized, parameterized key rather than a literal `+N more`

#### Scenario: Unparseable-phone tooltip

- **WHEN** a result row carries `rawPhoneNumbers`
- **THEN** the tooltip listing them SHALL resolve from a localized, parameterized key rather than a literal `Couldn't parse: …`

### Requirement: Discarded phone numbers read differently on imported and skipped rows

A result row carrying `rawPhoneNumbers` SHALL phrase and colour that notice according to the
row's `status`. A skipped row SHALL keep the error wording and the error colour, because no
contact was created. An imported row SHALL use separate, milder wording and the warning
colour, because the contact exists and only the listed numbers were dropped.

#### Scenario: Contact skipped because no phone was usable

- **WHEN** a result row has `status: 'skipped'` and a non-empty `rawPhoneNumbers`
- **THEN** the notice SHALL resolve `contacts.list.invalidPhoneWarning` and SHALL render in the error colour

#### Scenario: Contact imported with some numbers discarded

- **WHEN** a result row has `status: 'imported'` and a non-empty `rawPhoneNumbers`
- **THEN** the notice SHALL resolve `contacts.addDialog.discardedPhones` and SHALL render in the warning colour, not the error colour

#### Scenario: Contact skipped as a duplicate

- **WHEN** a result row has `skipReason` of `'nameDuplicate'` or `'phoneDuplicate'`
- **THEN** no phone notice SHALL be rendered at all, regardless of `rawPhoneNumbers`, because the duplicate skip is the whole reason the row was not imported

#### Scenario: Re-importing the same file

- **WHEN** a file is imported a second time and every contact in it is skipped as a duplicate
- **THEN** the results list SHALL show only the skipped badges and the summary counts, with no error or warning notices on any row

### Requirement: vCard file parsing

A `useVCardImport` composable SHALL provide a method to parse `.vcf` (vCard) files and extract contact information. This SHALL work on all browsers including iOS Safari.

#### Scenario: Parse single-contact vCard file

- **WHEN** a `.vcf` file containing one `BEGIN:VCARD`/`END:VCARD` block is parsed
- **THEN** the parser SHALL extract the contact's name (from `FN` or `N` field) and return one parsed contact with its `phones` array

#### Scenario: Parse multi-contact vCard file

- **WHEN** a `.vcf` file containing multiple `BEGIN:VCARD`/`END:VCARD` blocks is parsed
- **THEN** the parser SHALL return an array with one parsed contact per vCard block

#### Scenario: Parse structured name field (N)

- **WHEN** a vCard contains `N:Muster;Max;;;` (structured name: last;first;middle;prefix;suffix)
- **THEN** the parser SHALL extract `firstName: "Max"` and `lastName: "Muster"`

#### Scenario: Parse formatted name field (FN)

- **WHEN** a vCard contains `FN:Max Muster` but no `N` field
- **THEN** the parser SHALL split into `firstName: "Max"` and `lastName: "Muster"`

#### Scenario: Single name token

- **WHEN** a contact has only one name token (e.g., `FN:Max`)
- **THEN** `firstName` SHALL be "Max" and `lastName` SHALL be `null`

### Requirement: vCard phone normalization

Every `TEL` line in a vCard block SHALL be processed; entries whose value normalizes successfully via the shared `normalizePhone` utility (see `phone-formatting` spec) SHALL be included in the contact's `phones` array with `value` set to its E.164 form. Entries whose value cannot be normalized SHALL NOT appear in `phones`; their trimmed raw value SHALL instead be appended to the contact's `rawPhoneNumbers` array.

#### Scenario: Normalize national phone number per entry

- **WHEN** a vCard contains `TEL;TYPE=CELL:0791234567`
- **THEN** that entry's `value` SHALL equal `+41791234567` (normalized using default region `CH`)

#### Scenario: Unparseable phone goes to rawPhoneNumbers, not phones

- **WHEN** a vCard contains a `TEL` field whose value cannot be parsed (e.g. `TEL:ext. 1234`)
- **THEN** that value SHALL NOT appear in `phones` AND the trimmed raw value (`ext. 1234`) SHALL be appended to `rawPhoneNumbers`

#### Scenario: vCard without phone

- **WHEN** a vCard block contains no `TEL` field
- **THEN** `phones` SHALL be an empty array

### Requirement: vCard phone labels

Each `phones` entry's `label` SHALL be derived from the `TEL` parameter types (e.g. `TYPE=CELL` → "Mobile", `TYPE=HOME` → "Home", `TYPE=WORK` → "Work"); when no recognised type is present, `label` SHALL be `null`.

#### Scenario: Extract multiple phones with labels

- **WHEN** a vCard contains `TEL;TYPE=CELL:+41 79 123 45 67` and `TEL;TYPE=HOME:+41 44 222 33 44`
- **THEN** `phones` SHALL be `[{ value: '+41791234567', label: 'Mobile', isPrimary: true }, { value: '+41442223344', label: 'Home', isPrimary: false }]`

#### Scenario: Unrecognised TYPE parameter yields null label

- **WHEN** a vCard contains `TEL;TYPE=FAX:+41 44 222 33 44`
- **THEN** the entry's `label` SHALL be `null`

### Requirement: vCard primary phone selection

Primary selection SHALL use the following precedence, stopping at the first rule that selects an entry:

1. A `TEL` entry carrying a preference marker (see "vCard preference marker").
2. The first `TEL` entry whose `TYPE` parameter includes `CELL`; failing that, `HOME`; failing that, `WORK`.
3. The first `TEL` entry in document order.

Primary selection SHALL operate on the deduplicated `phones` set (see "Dedupe identical phones during import"), not on the raw `TEL` line sequence.

#### Scenario: No PREF — CELL wins over HOME and WORK

- **WHEN** a vCard contains `TEL;TYPE=HOME:+41 44 222 33 44`, `TEL;TYPE=WORK:+41 44 555 66 77`, then `TEL;TYPE=CELL:+41 79 123 45 67` (in that order) and no entry carries PREF
- **THEN** the `CELL` entry SHALL have `isPrimary: true` regardless of document order

#### Scenario: No PREF and no CELL — HOME wins over WORK

- **WHEN** a vCard contains `TEL;TYPE=WORK:+41 44 555 66 77` followed by `TEL;TYPE=HOME:+41 44 222 33 44` and no PREF or CELL entries
- **THEN** the `HOME` entry SHALL have `isPrimary: true`

#### Scenario: No PREF, CELL, HOME, or WORK — first TEL is primary

- **WHEN** a vCard contains two `TEL` entries and neither carries PREF and no entry's `TYPE` includes `CELL`, `HOME`, or `WORK`
- **THEN** the first entry in document order SHALL have `isPrimary: true`

### Requirement: vCard preference marker

A `TEL` entry carrying a preference marker (vCard 3.0 `TYPE=PREF` or vCard 4.0 `PREF=` parameter) SHALL be selected as primary. When multiple entries carry `PREF=`, the lowest numeric value wins.

#### Scenario: vCard 3.0 PREF marker selects primary

- **WHEN** a vCard contains `TEL;TYPE=CELL:+41 79 123 45 67` followed by `TEL;TYPE=HOME,PREF:+41 44 222 33 44`
- **THEN** the second entry SHALL have `isPrimary: true` and the first `isPrimary: false`

#### Scenario: vCard 4.0 PREF parameter selects primary

- **WHEN** a vCard contains `TEL;TYPE=CELL:+41 79 123 45 67` followed by `TEL;TYPE=HOME;PREF=1:+41 44 222 33 44`
- **THEN** the second entry SHALL have `isPrimary: true`

### Requirement: Contact Picker opens the native picker

The `useContactPicker` composable SHALL provide a `pickContacts()` method that opens the native contact picker requesting the `name` and `tel` properties with multi-select enabled.

#### Scenario: User cancels picker

- **WHEN** the user dismisses the native contact picker without selecting, or the API is unsupported
- **THEN** the composable SHALL return an empty array

### Requirement: Contact Picker phone normalization

Each `tel` entry returned by the platform whose value normalizes successfully via `normalizePhone` SHALL be included in the contact's `phones` array with `value` set to its E.164 form. Entries whose value cannot be normalized SHALL NOT appear in `phones`; their trimmed raw value SHALL instead be appended to `rawPhoneNumbers`. `label` SHALL be `null` for every entry.

#### Scenario: User selects a contact with one parseable phone

- **WHEN** the user selects a contact with a single parseable phone
- **THEN** `phones` SHALL contain one entry with the E.164 value and `isPrimary: true`

#### Scenario: User selects a contact with an unparseable phone

- **WHEN** the user selects a contact whose `tel` value cannot be parsed by `normalizePhone`
- **THEN** `phones` SHALL be empty AND `rawPhoneNumbers` SHALL contain the trimmed raw `tel` value

#### Scenario: User selects a contact with no phone

- **WHEN** a selected contact has no `tel` entries
- **THEN** `phones` SHALL be an empty array

### Requirement: Contact Picker primary phone

The first parseable `tel` entry (in source order) SHALL be marked `isPrimary: true` in the deduplicated `phones` set (the Contact Picker API does not expose preference).

#### Scenario: User selects a contact with multiple phones

- **WHEN** the user selects a contact whose device record has two phone numbers
- **THEN** the composable SHALL return that contact with two `phones` entries, the first having `isPrimary: true` and the second `isPrimary: false`
