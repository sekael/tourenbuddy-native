# gpx-display Specification

## Purpose

Defines requirements for GPX file upload, track rendering on the map, and track storage.

## Requirements

### Requirement: GPX file upload

The tour creation and edit forms SHALL allow users to upload a GPX file (`.gpx` extension, max 2MB). Uploads SHALL begin eagerly when the file is picked.

#### Scenario: Valid GPX uploaded

- **WHEN** the user selects a valid GPX file under 2MB
- **THEN** the system SHALL parse it client-side and SHALL upload it to blob storage immediately, retaining the storage key for submit

#### Scenario: File too large

- **WHEN** the user selects a GPX file over 2MB
- **THEN** the system SHALL show an error message and reject the file without uploading

#### Scenario: Invalid GPX file

- **WHEN** the user selects a file that cannot be parsed as valid GPX
- **THEN** the system SHALL show an error message and reject the file without uploading

#### Scenario: Remove uploaded GPX

- **WHEN** the user has uploaded a GPX file and clicks remove
- **THEN** the GPX SHALL be cleared from the form and any pre-uploaded blob SHALL be deleted from storage

### Requirement: GPX track rendering on map

When a tour has a GPX track, it SHALL be rendered as a polyline on the MapLibre map.

#### Scenario: Tour with GPX track selected

- **WHEN** a tour with a GPX track is selected on the map
- **THEN** the track SHALL be rendered as a colored polyline layer on the map

#### Scenario: Tour without GPX track selected

- **WHEN** a tour without a GPX track is selected
- **THEN** no polyline layer SHALL be rendered

#### Scenario: Deselect tour hides track

- **WHEN** a tour with a visible GPX track is deselected
- **THEN** the polyline layer SHALL be removed from the map

### Requirement: GPX track storage

GPX tracks SHALL be stored as GeoJSON in a `jsonb` column on the tours table.

#### Scenario: Tour saved with GPX

- **WHEN** a tour is created with a GPX track
- **THEN** the GeoJSON representation SHALL be persisted in the `gpx_track` column

#### Scenario: Tour saved without GPX

- **WHEN** a tour is created without a GPX track
- **THEN** the `gpx_track` column SHALL be null

### Requirement: Eager GPX upload on file pick

When the user selects a GPX file in either the tour creation dialog or the tour edit form, the system SHALL begin uploading the file to blob storage immediately, before the user submits the form.

#### Scenario: Create mode pre-upload

- **WHEN** the user picks a valid GPX file in the tour creation dialog
- **THEN** the system SHALL upload it to storage right away and retain the resulting storage key for use on submit

#### Scenario: Edit mode pre-upload

- **WHEN** the user picks a valid GPX file while editing an existing tour
- **THEN** the system SHALL upload it to storage right away and retain the resulting storage key for use on submit, without waiting for Save to be pressed

#### Scenario: Replace existing track

- **WHEN** the user picks a new GPX file while a previous GPX file (existing or already pre-uploaded) is associated with the form
- **THEN** the system SHALL pre-upload the new file and SHALL delete the previously pre-uploaded blob if one exists

### Requirement: Upload progress and submit-button disabled state

While a GPX upload is in flight, the form SHALL indicate progress on the GPX row and SHALL render the Save/Submit button in a visually disabled state.

#### Scenario: Spinner shown during upload

- **WHEN** a GPX upload is in flight
- **THEN** the GPX filename row SHALL display a spinner and an "uploading…" indicator next to the filename

#### Scenario: Save button visually disabled

- **WHEN** a GPX upload is in flight
- **THEN** the Save/Submit button SHALL be rendered with a disabled visual treatment (reduced opacity, no hover effect, not-allowed cursor) and SHALL not submit the form when clicked

#### Scenario: Cancel button remains active

- **WHEN** a GPX upload is in flight
- **THEN** the Cancel button SHALL remain enabled and clickable

#### Scenario: Submit re-enabled on completion

- **WHEN** the GPX upload completes successfully
- **THEN** the spinner SHALL be hidden and the Save/Submit button SHALL be enabled

### Requirement: Cancel rolls back in-flight or completed pre-upload

If the user cancels tour creation or edit before submitting, the system SHALL roll back any GPX blob that was pre-uploaded for the form session.

#### Scenario: Cancel during in-flight upload

- **WHEN** the user clicks Cancel while a GPX upload is in flight
- **THEN** the system SHALL mark the upload as cancelled and, when the upload finishes, SHALL delete the resulting blob from storage

#### Scenario: Cancel after pre-upload completed

- **WHEN** the user clicks Cancel after a GPX upload has completed but before submitting the form
- **THEN** the system SHALL delete the pre-uploaded blob from storage

#### Scenario: Replace before submit

- **WHEN** the user replaces a pre-uploaded GPX file with another before submit
- **THEN** the system SHALL delete the superseded blob from storage

### Requirement: Icon-only replace and remove for existing GPX tracks

When the form displays a GPX file (either an existing track loaded from the tour or a freshly pre-uploaded one), the Replace and Remove controls SHALL be rendered as icon-only buttons with accessible labels and, in desktop view, tooltips.

#### Scenario: Existing track shown with icon controls

- **WHEN** the form is opened for a tour that already has a GPX track
- **THEN** the Replace and Remove controls SHALL appear as icon-only buttons with `title` and `aria-label` attributes describing their action

#### Scenario: Tooltip text on hover

- **WHEN** the user hovers the Replace or Remove icon button in desktop view
- **THEN** the browser SHALL display a tooltip with the localized action label

### Requirement: Lines per leg

A split tour's connector lines SHALL wear the colours of their own leg (start → goal the way-up
activities, goal → end the way-down ones). A single-line GPX track of a split tour SHALL change
from the way-up colours to the way-down colours at the track point nearest the goal.

#### Scenario: Hike & fly track

- **WHEN** a hike & fly tour has a GPX track walking to the summit and flying to the valley
- **THEN** the track SHALL be drawn in the hiking colour up to the summit and in the paragliding
  colour after it
