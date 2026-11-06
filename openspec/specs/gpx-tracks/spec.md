# gpx-tracks Specification

## Purpose

Optional GPX track per tour: stored in the private `tour-gpx` Storage bucket under the owner's prefix, rendered on the map in a darker tour-type colour, fetched lazily and cached, and downloadable as the original file.

## Requirements

### Requirement: GPX file storage in Supabase Storage

The system SHALL persist user-uploaded GPX files in a private Supabase Storage bucket named `tour-gpx` under the uploader's prefix, `${userId}/${id}.gpx`, where `userId` is `auth.uid()` of the uploader. `id` SHALL be the tour's UUID (also used as `tours.id`) for a file picked while creating the tour, and a fresh random UUID for every later file — a replacement picked in edit, or an accepted GPX suggestion. The system SHALL store this full key on the `tours` row in column `gpx_filepath`. Each key SHALL be written once: a file is never overwritten in place by another file, so a different track always means a different `gpx_filepath` (an interrupted upload MAY be retried to the same key). The path's first segment encodes the **uploader**, not the readers — read access remains independently controllable so future visibility models (private / shared / public) can be implemented by editing only the SELECT policy, without re-keying objects or migrating existing data.

#### Scenario: Upload during tour creation (pre-upload)

- **WHEN** a user creates a tour and selects a valid `.gpx` file in the form
- **THEN** the client generates `tourId = crypto.randomUUID()`, parses the file client-side, and uploads it to `tour-gpx/${userId}/${tourId}.gpx` immediately, before the tour row is inserted
- **AND** on form submit the same `tourId` is passed to `create_tour_full` and `tours.gpx_filepath` is set to `${userId}/${tourId}.gpx`

#### Scenario: Upload during tour edit (replace)

- **WHEN** a user edits a tour that already has a track and uploads a different `.gpx` file
- **THEN** the new file is uploaded to a fresh key `${userId}/${uuid}.gpx`, saving sets `gpx_filepath` to that key, and the previous object is removed (see Cascade deletion)

#### Scenario: File exceeds size limit

- **WHEN** the selected file is larger than 5 MB
- **THEN** the upload is rejected client-side, an i18n error message is displayed, and no Storage object is created

#### Scenario: File fails to parse

- **WHEN** the selected file cannot be parsed as GPX
- **THEN** the form shows an i18n parse error and no Storage object is created

### Requirement: Bucket access control

The system SHALL enforce access on `tour-gpx` via RLS policies on `storage.objects`. INSERT, UPDATE, DELETE and the owner's SELECT SHALL require the object's first path segment to equal `auth.uid()::text` and SHALL NOT depend on the existence of a `tours` row, so pre-upload during tour creation is permitted. Additional SELECT grants SHALL be additive (`OR`): a partner-friend of a friends-visible tour may read the object named by that tour's `gpx_filepath` when it lies in the tour owner's prefix (see `friend-tour-visibility`), and a tour owner may read a pending GPX suggestion's staged object in the suggester's prefix (see `tour-suggestions`). The bucket SHALL cap objects at 10 MiB.

#### Scenario: Authenticated user uploads under their prefix

- **WHEN** an authenticated user uploads to `tour-gpx/${auth.uid()}/${anyTourId}.gpx`
- **THEN** Supabase Storage accepts the upload regardless of whether a `tours` row with that id exists yet

#### Scenario: User attempts to upload outside their prefix

- **WHEN** an authenticated user attempts to upload to `tour-gpx/${otherUserId}/${tourId}.gpx`
- **THEN** the INSERT policy denies the request

#### Scenario: Owner reads own track

- **WHEN** an authenticated user requests a signed URL for an object under their own prefix
- **THEN** Supabase returns a valid time-limited URL

#### Scenario: Unrelated user read denied

- **WHEN** an authenticated user who is neither the owner nor a partner-friend requests `${otherUserId}/${tourId}.gpx`
- **THEN** Supabase responds with an RLS denial

### Requirement: Cascade deletion

The client SHALL delete the GPX Storage object when its tour is deleted (online, or on replay of a queued delete), when the user removes the track from the tour, and when a replace leaves the previous object behind. Removal is best-effort: a failed removal SHALL be logged and SHALL NOT fail the tour write. There is no database-side cleanup, so a crash between the row delete and the object removal can orphan the object.

#### Scenario: Tour deleted

- **WHEN** a user deletes a tour with `gpx_filepath` set
- **THEN** the client removes the corresponding Storage object after the row is deleted

#### Scenario: Track removed in edit

- **WHEN** a user clicks the remove-track action and saves the tour
- **THEN** `gpx_filepath` is set to null and the previous Storage object is removed

#### Scenario: Removal fails

- **WHEN** the Storage removal fails after the tour row was deleted
- **THEN** the tour stays deleted and a warning is logged

### Requirement: Track rendering with darker tour-type color

The system SHALL render the selected tour's GPX track on the map as a polyline coloured with darker variants of the tour types' marker colours, defined by a sibling map `TOUR_TYPE_TRACK_COLORS`. The track color MUST be visually darker than the corresponding tour marker so the marker remains distinguishable when stacked over its track. A defined fallback color SHALL be used when the tour has no type. When the tour's types map to more than one distinct track colour, the track SHALL cycle through those colours in bands along its length, fading smoothly from one band into the next.

#### Scenario: Selecting a hiking tour

- **WHEN** a user selects a tour of type `hiking` that has a track
- **THEN** the gpx-track layer renders the polyline using `TOUR_TYPE_TRACK_COLORS.hiking`, which is darker than `TOUR_TYPE_COLORS.hiking`

#### Scenario: Switching selection

- **WHEN** the selected tour changes from a skiing tour to a paragliding tour
- **THEN** the rendered track updates to the paragliding track color without reloading the map style

#### Scenario: Unknown tour type

- **WHEN** a tour has no activity type
- **THEN** the track renders in the defined fallback color

#### Scenario: Activity type changed on selected tour

- **WHEN** the selected tour's types are updated (e.g. from `splitboarding` to `mountaineering`, or from none to a defined type)
- **THEN** the rendered track colours update immediately to the new types' `TOUR_TYPE_TRACK_COLORS` entries without a page refresh, even when the parsed GeoJSON is served from the in-memory cache

#### Scenario: Ski tour and hike track fades between colours

- **WHEN** a user selects a tour of types `skitour` and `hiking` that has a track
- **THEN** the track alternates between the winter and summer track colours in bands along its length, each band fading smoothly into the next

#### Scenario: Same-colour types render one colour

- **WHEN** a tour's types all share one track colour (e.g. `skitour` and `splitboarding`)
- **THEN** the track renders in that single colour with no bands

### Requirement: Lazy fetch and caching of GPX data

The system SHALL fetch and parse a tour's GPX file on demand when the tour is selected on the map, and SHALL keep the most recently parsed tracks in memory, keyed by `gpx_filepath`, to avoid duplicate work. Because a key is written once, a write that leaves `gpx_filepath` unchanged (completion, visibility or any other field) SHALL reuse the parsed track: the map SHALL keep the track drawn throughout, never emptying it while the tour reloads.

#### Scenario: First selection

- **WHEN** a tour with `gpx_filepath` is selected for the first time in a session
- **THEN** the client requests a signed URL, downloads the file, parses it, caches the result, and renders the track

#### Scenario: Re-selection

- **WHEN** the same tour is re-selected later in the session
- **THEN** the cached GeoJSON is reused without re-downloading, and the track colouring is recomputed from the tour's current types before the track is shown, so colour always reflects the latest activity types

#### Scenario: Tour without track

- **WHEN** a tour with `gpx_filepath = null` is selected
- **THEN** the gpx-track layer renders no polyline and no network request is made

#### Scenario: Completion or visibility toggled

- **WHEN** the owner marks the selected tour completed or incomplete, or toggles its visibility, and the refetched row carries a new `updated_at`
- **THEN** the track stays drawn in every frame, and the file is neither downloaded nor parsed again

#### Scenario: Track replaced

- **WHEN** the selected tour's track is replaced
- **THEN** the track is loaded from its new `gpx_filepath`, never served from the old one's parse

### Requirement: Responsive upload UX

The system SHALL present GPX upload, replace, and remove controls inside the existing tour
form, adapting layout for mobile (bottom-sheet) and desktop (dialog/drawer) without functional
divergence. In create mode the system SHALL begin uploading the file to Storage immediately
upon successful client-side parse, SHALL show an in-progress indicator while the upload is
running, SHALL block the form's Save button until the upload completes successfully, and SHALL
clean up any uploaded or in-flight object if the user cancels the dialog or replaces the file
before submission.

The in-progress indicator SHALL be determinate, reflecting bytes transferred, whenever the
upload transport reports progress. Where the transport cannot report progress for a given
upload, an indeterminate indicator SHALL remain acceptable.

#### Scenario: Mobile upload

- **WHEN** a mobile user opens the tour create bottom-sheet and taps the GPX upload control
- **THEN** the native file picker opens and after selection the form shows the filename, replace, and remove actions

#### Scenario: Desktop upload

- **WHEN** a desktop user opens the tour edit dialog and uploads a new track
- **THEN** the same controls and states appear, laid out for the wider viewport

#### Scenario: Pre-upload in progress (create mode)

- **WHEN** a user selects a valid `.gpx` file in the create form
- **THEN** the upload to `${userId}/${tourId}.gpx` begins immediately, a progress indicator is shown next to the filename, and the Save button is disabled until the upload resolves

#### Scenario: Progress advances during a slow upload

- **WHEN** a GPX upload is running and the transport reports transferred bytes
- **THEN** the indicator SHALL advance with the transfer rather than showing an indeterminate spinner

#### Scenario: Pre-upload completes before submit

- **WHEN** the pre-upload has resolved successfully
- **THEN** the indicator is removed, the Save button is enabled, and submitting the form inserts the tour with `gpx_filepath = ${userId}/${tourId}.gpx` without re-uploading

#### Scenario: User cancels during in-flight upload

- **WHEN** a user cancels the create dialog while a pre-upload is still running
- **THEN** the in-flight upload SHALL be aborted, any object the interrupted transfer left behind SHALL be deleted (best-effort), and no `tours` row is created
- **AND** if the upload had already resolved when the cancel arrived, the completed object SHALL be deleted instead (best-effort)

#### Scenario: User cancels the upload from the file tile

- **WHEN** a GPX upload is in flight
- **THEN** the tile's replace control SHALL be presented as a cancel control for the duration of the upload, reverting to replace once the upload settles
- **AND** activating it SHALL abort the transfer, discard the picked file, delete any partial object (best-effort), and SHALL NOT surface an upload-failure message — a cancel is not a failure

#### Scenario: A cancelled replacement leaves the existing track in place

- **WHEN** a user replaces an existing track and cancels the replacement upload
- **THEN** the tour's previously saved track SHALL remain selected and displayed, and the tile SHALL stop naming the file that was never uploaded

#### Scenario: Removing a track mid-upload

- **WHEN** a user activates remove while an upload is still running
- **THEN** the upload SHALL be aborted before the removal proceeds, so no object is left behind unreferenced

#### Scenario: A track staged offline reports no progress

- **WHEN** a user picks a GPX file while offline
- **THEN** the file SHALL be staged for upload on reconnect, no progress indicator SHALL be shown, and the replace control SHALL NOT be presented as a cancel control — nothing is being transferred
- **AND** the queued upload SHALL proceed in the background on reconnect without altering the form's controls

#### Scenario: User replaces the file before submit

- **WHEN** a user picks a new `.gpx` file while a previous pre-upload has already completed
- **THEN** the prior object at `${userId}/${oldTourId}.gpx` is deleted (best-effort), a fresh `tourId` is generated, and the new file is pre-uploaded

#### Scenario: Upload failure with retry

- **WHEN** the Storage upload returns an error
- **THEN** the form shows an i18n error message and offers retry without losing other unsaved form data

### Requirement: Download original GPX from tour info sheet

The system SHALL expose a download action in the tour info sheet whenever the selected tour has `gpx_filepath` set, allowing the user to download the original `.gpx` file via a signed URL.

#### Scenario: Tour with track

- **WHEN** a user opens the info sheet for a tour with a track
- **THEN** a "Download GPX" button is visible and clicking it downloads the original `.gpx` file

#### Scenario: Tour without track

- **WHEN** a user opens the info sheet for a tour with `gpx_filepath = null`
- **THEN** the download button is not shown

### Requirement: Internationalisation

The system SHALL provide all GPX-related user-facing text in both `en` and `de-CH` locales, accessed via `vue-i18n` keys.

#### Scenario: New keys present in both locales

- **WHEN** the locale switcher toggles between English and Swiss German
- **THEN** every GPX-related label, button, and error message renders translated text in the active locale

### Requirement: Direction connector for tours without a track

The system SHALL draw, for every shown tour WITHOUT a GPX track (the selected tour, or each segment of a focused outing), a thin, light straight line start → goal → end in the tour's activity marker colours (banded when several), with small arrows evenly spaced on screen along each leg pointing that way. A tour with an end but no start (a stage connected to the next one) SHALL get the single leg goal → end, with one-way arrows. A tour with neither a start nor an end SHALL get no connector.

#### Scenario: Start, goal and distinct end

- **WHEN** a tour without a GPX track and with start, goal and a distinct end is shown
- **THEN** two thin legs start → goal and goal → end appear, each with evenly spaced one-way arrows, and a leg shorter than the spacing has one arrow in its middle

#### Scenario: Round trip

- **WHEN** the tour's end is the same place as its start (within 10 m)
- **THEN** one leg start ↔ goal appears with a two-way arrow (an unsplit tour; a split one draws both legs, each one-way in its own way's colours)

#### Scenario: Coinciding points

- **WHEN** two consecutive points of the tour coincide
- **THEN** the leg between them is dropped

#### Scenario: End without a start

- **WHEN** a stage that had only a goal is connected to the next stage, so it has a goal and an end but no start
- **THEN** one thin leg goal → end appears with one-way arrows, in the tour's activity colours (a split tour's: its way down's)

#### Scenario: Goal only

- **WHEN** a tour without a GPX track has neither a start nor an end
- **THEN** no connector appears

#### Scenario: Outing overview with a hike and a flight

- **WHEN** the overview of an outing with a hiking segment followed by a paragliding segment is open
- **THEN** the first connector is in the hiking colour and the second in the paragliding colour, matching each segment's markers

### Requirement: Outing overview start and end markers

While an outing's overview is open (no segment selected), the system SHALL show a start or end marker, in its segment's colours, at every segment start and end that is a loose end of the chain: the first start, the last end, and both sides of a gap. A point SHALL get no marker where the chain hands over (a start on the previous segment's finish, an end on the next segment's start), on any goal, or where a marker already stands.

#### Scenario: Overview of a hut-to-summit outing

- **WHEN** the overview of an outing starting in the valley and ending at a different village is open
- **THEN** a start marker shows in the valley and an end marker at the village

#### Scenario: Reordered into a gap

- **WHEN** the segments are ordered so that segment 1 ends in one village and segment 2 starts in another
- **THEN** an end marker shows at the first village and a start marker at the second, with no line ending unmarked

### Requirement: Outing handover points

While an outing's overview is open, a point where one segment ends and the next starts away from every goal SHALL show a small ring in the next segment's colour, so no line meets in empty map.

#### Scenario: Handover in the valley

- **WHEN** segment 2 ends in a village where segment 3 (a hike-and-fly) starts, and no goal is there
- **THEN** a small handover ring SHALL show at the village, and no start or end marker

### Requirement: Track section offers drawing

The form's route section SHALL be titled "Route", sit after the activities and open with the track.
Without a track it SHALL offer "Draw on map" as its main action beside "Upload GPX track"; with one
it SHALL keep replace and remove and add "Edit on map". While a drawing's heights load, the section
SHALL say so and Save SHALL wait.

#### Scenario: Empty track section

- **WHEN** the user opens a new tour's form
- **THEN** the track section SHALL offer "Draw on map" as its main action and "Upload GPX track"

### Requirement: Unsaved track on the map

While the open form holds a drawn or picked track not saved yet, the map SHALL draw it in the
drawing's style in place of the tour's saved track; a removed track SHALL hide the saved one. Saving
or leaving the form SHALL restore the saved display.

#### Scenario: After Done

- **WHEN** the user finishes a drawing while editing a tour that has a saved track
- **THEN** the map SHALL show the new line and not the saved one until the edit is saved or cancelled
