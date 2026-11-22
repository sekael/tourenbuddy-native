## REMOVED Requirements

### Requirement: Contact Picker opens the native picker
**Reason**: Native apps use the operating system's contact picker, not the browser's Contact Picker API.
**Migration**: "Import from the system contact picker" below.

### Requirement: Importing via Contact Picker
**Reason**: The import entry points are rewritten for the native apps.
**Migration**: "Import from the system contact picker" below; vCard import keeps its parsing requirements.

## ADDED Requirements

### Requirement: Import from the system contact picker
The Contacts tab SHALL offer "Import from Contacts" on iOS and Android, which opens the system contact picker without asking for the Contacts permission, and "Import vCard file" on every platform, which opens the file picker for `.vcf`. Every picked or parsed contact SHALL run through the same import rules (dedupe, invalid phones, existing holders, name duplicates) and end on the import-results screen.

#### Scenario: Pick from Contacts
- **WHEN** the user picks a contact in the system picker
- **THEN** no permission prompt appears, the contact is imported with its phones, and the results screen shows it

#### Scenario: Cancel the picker
- **WHEN** the user closes the picker without picking
- **THEN** nothing is imported and no results screen opens

#### Scenario: Name duplicate
- **WHEN** an imported contact matches an existing one by first and last name (case-insensitive)
- **THEN** it is skipped and counted as a name duplicate
