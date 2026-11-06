## Purpose

Inline action chips on contact rows for quick calling, messaging, emailing, and editing without entering the detail view.

## Requirements

### Requirement: Contact chip action mode

The contact chip SHALL support two interaction modes via a `mode` prop: `'select'` (default) and `'action'`. In `'select'` mode, clicking the chip SHALL emit `toggle` with the contact id and render the selected check glyph when `selected` is true — identical to prior behavior used by the tour form. In `'action'` mode, clicking the chip SHALL emit `open` with the contact id and MUST NOT emit `toggle`, and the selected check glyph SHALL NOT be rendered.

#### Scenario: Select mode toggles selection

- **WHEN** the chip is rendered with `mode="select"` and clicked
- **THEN** it SHALL emit `toggle` with the contact id
- **AND** it SHALL NOT open any action menu

#### Scenario: Action mode opens menu

- **WHEN** the chip is rendered with `mode="action"` and clicked
- **THEN** it SHALL emit `open` with the contact id
- **AND** it SHALL NOT emit `toggle`

### Requirement: Contact action menu

A `ContactActionMenu` component SHALL present contact actions anchored to the originating chip. On desktop (`useIsDesktop === true`) it SHALL render as a popover anchored to the chip's bounding rect; on mobile it SHALL render as a bottom action sheet via `bottom-sheet.vue` with tap targets of at least 44px in height. The menu SHALL list, in order:

1. One row per **valid** phone method returned by `orderedPhoneMethods(contact)` — primary first — where "valid" means `isValid === true` and the stored value is E.164 (equivalently, `whatsAppLink` is non-null). Each row SHALL be labelled by the method label (falling back to "Phone" when unlabelled) and SHALL contain a `Call` action and a `WhatsApp` action. `SMS` SHALL NOT be offered as a 1:1 action in this menu.
2. An `Edit contact` action at the bottom.

Phone methods that are invalid or legacy non-E.164 SHALL be omitted from the menu entirely — their call, SMS, and WhatsApp actions SHALL NOT appear. When the contact has no valid phone methods, only the `Edit contact` action SHALL be shown.

When the contact has more than one valid phone method, the menu SHALL render each method as its own row so the user can explicitly pick which number to call or message; the menu SHALL NOT auto-select the primary method.

#### Scenario: Menu for contact with one valid E.164 phone

- **WHEN** the action menu opens for a contact with one valid E.164 phone method
- **THEN** it SHALL display a single row with Call and WhatsApp actions for that method
- **AND** it SHALL NOT display an SMS action
- **AND** it SHALL display an Edit contact action

#### Scenario: Menu for contact with only invalid phones

- **WHEN** the action menu opens for a contact whose phone methods all have `isValid = false`
- **THEN** it SHALL NOT display any Call, SMS, or WhatsApp actions
- **AND** it SHALL display only the Edit contact action

#### Scenario: Menu for contact with no phone

- **WHEN** the action menu opens for a contact with no phone methods
- **THEN** it SHALL display only the Edit contact action

#### Scenario: Menu for contact with multiple valid phone methods

- **WHEN** the action menu opens for a contact with two or more valid E.164 phone methods
- **THEN** it SHALL render one labelled row per method with the primary method first
- **AND** each row SHALL expose its own Call and WhatsApp actions so the user picks which number to use

#### Scenario: Mixed valid and invalid methods

- **WHEN** the action menu opens for a contact with one valid E.164 method and one legacy invalid method
- **THEN** only the valid method row SHALL be rendered
- **AND** the invalid method SHALL be hidden from the menu

### Requirement: Method actions fire without confirmation

Tapping a Call or WhatsApp action in the contact action menu SHALL navigate to the corresponding link (`tel:<E.164>` or `https://wa.me/<digits>`) immediately and SHALL NOT display a confirmation dialog.

#### Scenario: Tap call action

- **WHEN** the user taps the Call action for a valid phone method
- **THEN** the browser SHALL navigate to `tel:<E.164>` immediately with no confirmation

#### Scenario: Tap WhatsApp action

- **WHEN** the user taps the WhatsApp action for a valid phone method
- **THEN** the browser SHALL open `whatsAppLink` in a new tab immediately with no confirmation

### Requirement: Edit contact entry reuses contacts flow

The Edit contact action SHALL navigate to the existing contacts edit flow (contacts list route with a deep-link identifying the contact) and SHALL NOT render a separate contact edit form inside the tour context. The tour info sheet SHALL close before navigation on mobile; on desktop the tour side-drawer MAY remain open.

#### Scenario: Edit from action menu on mobile

- **WHEN** the user taps Edit contact on mobile
- **THEN** the tour info sheet SHALL close
- **AND** the contacts route SHALL open with the contact's detail/edit view focused
