## MODIFIED Requirements

### Requirement: Attachments from system pickers, out through the share sheet
Adding an attachment SHALL offer the photo library, the camera and Files on iOS and Android (the file picker on the web), keeping the PWA's types, size and count limits. On iOS and Android sharing SHALL hand the file to the system share sheet; the web keeps the PWA's download. Signed URLs SHALL NOT be stored anywhere.

#### Scenario: Photo from the library
- **WHEN** the owner picks two photos from the library
- **THEN** both upload with progress and appear in the tour's attachments

#### Scenario: Too large
- **WHEN** a picked file exceeds 10 MB
- **THEN** it is rejected with the localized size message and the others continue

#### Scenario: Share an attachment
- **WHEN** the user taps share in the previewer on iOS or Android
- **THEN** the system share sheet opens with that file

### Requirement: Attachments open in the system preview
Tapping an attachment SHALL open the system's previewer at that file: on iOS with every attachment of the tour, swiping between them, zooming images and paging PDFs, with the system's share and close controls; on Android the system viewer for that one file. On the web it SHALL open the PWA's attachment viewer (images and PDFs in the app, with download). The bytes SHALL come from the device's file cache when present.

#### Scenario: Swipe to the next file on iOS
- **WHEN** the user opens the first of three attachments and swipes left
- **THEN** the second attachment shows in the same previewer

#### Scenario: Offline with a cached file
- **WHEN** the device is offline and the attachment was opened before
- **THEN** it opens from the cache
