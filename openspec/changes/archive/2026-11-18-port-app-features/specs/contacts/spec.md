## REMOVED Requirements

### Requirement: Contact detail header is titled and pinned
**Reason**: The native contact detail is a pushed screen of the Contacts tab with a system navigation bar, which stays pinned by itself and carries Edit, as in the system Contacts app.
**Migration**: "Contact detail as a pushed screen" below.

### Requirement: Contact detail actions sit in the footer
**Reason**: Native apps put destructive actions at the end of the list (as the system Contacts app does) and Edit in the navigation bar.
**Migration**: "Contact detail as a pushed screen" below.

## ADDED Requirements

### Requirement: Contact detail as a pushed screen
Tapping a contact SHALL push its detail onto the Contacts tab's stack: the navigation bar shows Edit; the screen opens with the hero and quick actions, then the methods (each with its own call, message, WhatsApp or mail action and a context menu to copy), the friend's tours, and at the end Block and Delete as destructive rows. Delete and Block SHALL confirm in a system dialog that carries the friendship and pending-request warnings.

#### Scenario: Delete a linked contact
- **WHEN** the user taps Delete on a contact linked to a friend
- **THEN** a system dialog warns that the friendship ends and asks to confirm

#### Scenario: Edit
- **WHEN** the user taps Edit in the navigation bar
- **THEN** the contact form opens with the contact's values
