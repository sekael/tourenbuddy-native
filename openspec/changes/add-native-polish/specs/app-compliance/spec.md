## ADDED Requirements

### Requirement: The build declares what the stores check
The iOS build SHALL ship a privacy manifest declaring no tracking, the data the app collects (linked to the user, for app functionality only) and the reasons for every required-reason API; SHALL declare no non-exempt encryption; and SHALL carry photo and camera usage strings in English and German. The Android build SHALL target API 36 or higher, SHALL not request Contacts, location or microphone permissions, and SHALL declare the apps it opens.

#### Scenario: App Store upload
- **WHEN** the owner uploads a production build
- **THEN** App Store Connect reports no missing privacy manifest reason or encryption question

#### Scenario: German usage string
- **WHEN** a German-language iPhone asks for photo library access
- **THEN** the prompt explains in German that photos become tour attachments

### Requirement: Accessible on every surface
Every control SHALL have an accessible label; text SHALL grow with the system text size up to the largest accessibility size in both locales without clipping or losing actions; custom views SHALL follow Reduce Motion, Reduce Transparency and Bold Text.

#### Scenario: Largest text in German
- **WHEN** the system text size is the largest accessibility size and the app is in German
- **THEN** every screen of the core flow shows all text and actions, scrolling where needed
