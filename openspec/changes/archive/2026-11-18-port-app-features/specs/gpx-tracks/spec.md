## REMOVED Requirements

### Requirement: Download original GPX from tour info sheet
**Reason**: Native apps hand files to the share sheet instead of a browser download.
**Migration**: "Share the original GPX" below.

## ADDED Requirements

### Requirement: Share the original GPX
The tour detail SHALL offer "Share GPX" whenever the tour has a track the viewer may read, which downloads the original `.gpx` through a signed URL into a temporary file and opens the system share sheet (Save to Files, AirDrop, Mail, other apps) on iOS and Android, and a browser download on the web.

#### Scenario: Tour with track
- **WHEN** a user opens the detail of a tour with a track and taps "Share GPX"
- **THEN** the share sheet opens with the `.gpx` file named after the tour

#### Scenario: Tour without track
- **WHEN** the tour has no track
- **THEN** no share action is shown

#### Scenario: Offline
- **WHEN** the device is offline and the file is not cached
- **THEN** the action explains that the file needs a connection
