## ADDED Requirements

### Requirement: Phone actions open the system apps
Call, message, WhatsApp and email actions SHALL open the phone, Messages, WhatsApp and Mail apps through the operating system; when WhatsApp is not installed the action SHALL open WhatsApp's web link instead.

#### Scenario: WhatsApp missing
- **WHEN** the user taps WhatsApp on a device without WhatsApp
- **THEN** the system browser opens the contact's WhatsApp web link
