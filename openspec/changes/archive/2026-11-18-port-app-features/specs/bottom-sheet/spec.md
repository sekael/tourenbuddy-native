## REMOVED Requirements

### Requirement: Bottom sheet height is user-adjustable via drag handle
**Reason**: Native apps present system sheets, which bring their own grabber, detents and drag (#346 section 5).
**Migration**: "System sheets with detents" below.

### Requirement: Sheet snaps to nearest snap point on release
**Reason**: The system sheet snaps to its detents.
**Migration**: "System sheets with detents" below.

### Requirement: Drag is disabled when sheet is programmatically collapsed
**Reason**: No programmatic collapse state in system sheets; the PWA's collapsed state served location picks, which open full screen natively.
**Migration**: "System sheets with detents" below; app-navigation "The map's sheets leave the map live".

### Requirement: Drag handle is keyboard accessible
**Reason**: The system grabber is accessible by VoiceOver and TalkBack; the web sheet keeps Escape and its close button (Phase 1).
**Migration**: "System sheets with detents" below.

### Requirement: Content scroll region reserves scrollbar gutter
**Reason**: A browser layout concern; native scroll views overlay their indicators.
**Migration**: None.

## ADDED Requirements

### Requirement: System sheets with detents
Sheets SHALL be the platform's sheets: on iOS the system sheet (Liquid Glass at partial height, grabber, swipe down to close), on Android the Material bottom sheet, on the web the Phase 1 sheet. A sheet SHALL fit its content or offer a medium and a large detent; its content SHALL scroll inside it; a sheet with unsaved input SHALL ask before closing on a swipe.

#### Scenario: Swipe down with a draft
- **WHEN** the user swipes down a sheet holding unsaved input
- **THEN** the system asks to discard the input or keep editing
