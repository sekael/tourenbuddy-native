## MODIFIED Requirements

### Requirement: System sheets with detents
Sheets SHALL be the platform's sheets: on iOS the system sheet (Liquid Glass at partial height, grabber, swipe down to close), on Android the Material bottom sheet, on the web the PWA's sheet (`web-app`). A sheet SHALL fit its content or offer a medium and a large detent; its content SHALL scroll inside it; a sheet with unsaved input SHALL ask before closing on a swipe.

#### Scenario: Swipe down with a draft
- **WHEN** the user swipes down a sheet holding unsaved input
- **THEN** the system asks to discard the input or keep editing
