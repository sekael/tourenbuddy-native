## REMOVED Requirements

### Requirement: Full-screen viewer with horizontal flip
**Reason**: Native apps open attachments in the system's previewer (Quick Look on iOS), which pages, zooms and renders PDFs itself.
**Migration**: "Attachments open in the system preview" below.

### Requirement: Attachments excluded from PWA runtime cache
**Reason**: There is no service worker in the native apps; signed URLs are never persisted in any cache (#346 section 6).
**Migration**: "Attachments from system pickers, out through the share sheet" below.

## ADDED Requirements

### Requirement: Attachments from system pickers, out through the share sheet
Adding an attachment SHALL offer the photo library, the camera and Files on iOS and Android (the file picker on the web), keeping the PWA's types, size and count limits. Sharing SHALL hand the file to the system share sheet. Signed URLs SHALL NOT be stored anywhere.

#### Scenario: Photo from the library
- **WHEN** the owner picks two photos from the library
- **THEN** both upload with progress and appear in the tour's attachments

#### Scenario: Too large
- **WHEN** a picked file exceeds 10 MB
- **THEN** it is rejected with the localized size message and the others continue

#### Scenario: Share an attachment
- **WHEN** the user taps share in the previewer
- **THEN** the system share sheet opens with that file

### Requirement: Attachments open in the system preview
Tapping an attachment SHALL open the system's previewer at that file: on iOS with every attachment of the tour, swiping between them, zooming images and paging PDFs, with the system's share and close controls; on Android the system viewer for that one file; on the web a new browser tab. The bytes SHALL come from the device's file cache when present.

#### Scenario: Swipe to the next file on iOS
- **WHEN** the user opens the first of three attachments and swipes left
- **THEN** the second attachment shows in the same previewer

#### Scenario: Offline with a cached file
- **WHEN** the device is offline and the attachment was opened before
- **THEN** it opens from the cache
