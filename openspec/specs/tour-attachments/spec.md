## Purpose

Attach images and PDFs to tours, stored in Supabase Storage with signed-URL retrieval and per-tour access control.

## Requirements

### Requirement: Per-tour attachment storage

The system SHALL persist file attachments associated with a tour in a dedicated `tour_attachments` table and a private Supabase Storage bucket `tour-attachments` (10 MiB per object). Attachment rows and objects SHALL be readable by the tour's owner and, for a friends-visible tour, by its partner-friends (see `friend-tour-visibility`); everyone else SHALL be denied. Rows SHALL be writable and deletable only by the owner, and an inserted or updated row SHALL reference a tour the caller owns.

#### Scenario: Owner reads own attachments

- **WHEN** an authenticated user queries attachments for a tour they own
- **THEN** the rows for that tour SHALL be returned

#### Scenario: Unrelated user cannot read attachments

- **WHEN** an authenticated user who is neither the owner nor a partner-friend queries attachments for another user's tour
- **THEN** the query SHALL return zero rows

#### Scenario: Unrelated user cannot read storage object

- **WHEN** an authenticated user who is neither the owner nor a partner-friend attempts to generate a signed URL for an attachment
- **THEN** the Storage API SHALL deny the request

#### Scenario: Attachment row on someone else's tour is rejected

- **WHEN** a user inserts a `tour_attachments` row whose `tour_id` belongs to another user, even with their own `user_id`
- **THEN** RLS SHALL reject the insert

### Requirement: Attachment count limit per tour

A tour SHALL hold at most 5 attachments, enforced client-side at selection and by a database
`BEFORE INSERT` trigger as the backstop. The client-side count SHALL include attachments that
are currently uploading, so a second selection made while a batch is still in flight cannot
exceed the cap.

A cap rejection SHALL always be reported from freshly read data: when either the client check
or the database trigger rejects an insert, the system SHALL refetch the tour's attachments and
render a localized message stating the remaining capacity derived from that refreshed count.

Raw database error text SHALL NEVER be shown to the user. A repository failure that is not a
cap violation SHALL surface a localized generic upload-failure message, with the underlying
error logged only.

#### Scenario: Sixth attachment rejected client-side

- **WHEN** the tour already holds 5 attachments
- **THEN** the picker's add control SHALL be replaced by a limit-reached message and no upload SHALL start

#### Scenario: Second selection while a batch is uploading

- **WHEN** three files are uploading for a tour that holds none
- **AND** the user selects three more files
- **THEN** the selection SHALL be rejected against the cap before any upload starts

#### Scenario: Database trigger rejects the insert

- **WHEN** an insert is rejected by the `tour_attachment_limit_exceeded` trigger
- **THEN** the tour's attachments SHALL be refetched
- **AND** the message shown SHALL be the localized remaining-capacity message computed from the refetched list
- **AND** the trigger's exception text SHALL NOT appear in the UI

#### Scenario: Non-cap upload failure

- **WHEN** a storage upload fails with a network or permission error
- **THEN** a localized generic upload-failure message SHALL be shown
- **AND** the underlying error message SHALL be written to the log only

### Requirement: Allowed file types and size

Attachments SHALL be restricted to MIME types `image/png`, `image/jpeg`, and `application/pdf`, with file size at most 10 MB (10,485,760 bytes). The constraints SHALL be enforced client-side at selection and at the database via CHECK constraints. HEIC files SHALL be rejected with a dedicated, user-visible error explaining the format is unsupported.

#### Scenario: Disallowed mime rejected

- **WHEN** the user selects a file with mime type `image/gif`
- **THEN** the picker SHALL reject the file with a user-visible error

#### Scenario: HEIC rejected with dedicated message

- **WHEN** the user selects a file with mime type `image/heic` or `image/heif`
- **THEN** the picker SHALL reject the file AND the error message SHALL specifically name HEIC and guide the user to share as JPEG

#### Scenario: Oversize file rejected

- **WHEN** the user selects a file larger than 10 MB
- **THEN** the picker SHALL reject the file with a user-visible error

#### Scenario: Allowed file accepted

- **WHEN** the user selects a 4 MB `image/jpeg` file
- **THEN** the file SHALL upload successfully

### Requirement: Multi-file selection with batch cap enforcement

The file picker SHALL allow selecting multiple files in a single OS picker invocation (`<input multiple>`). When a selection batch would push the total above 5 attachments for the tour, the ENTIRE batch SHALL be rejected with an error stating the remaining capacity.

#### Scenario: Batch fits

- **WHEN** the tour has 2 attachments and the user selects 3 valid files in one batch
- **THEN** all 3 SHALL be queued for upload

#### Scenario: Batch exceeds remaining cap

- **WHEN** the tour has 3 attachments and the user selects 4 files in one batch
- **THEN** zero files SHALL be queued AND the error SHALL state that only 2 more files may be added

### Requirement: EXIF metadata retained

The system SHALL NOT strip EXIF metadata from uploaded images. The bytes uploaded equal the bytes stored.

#### Scenario: EXIF preserved

- **WHEN** the user uploads a JPEG containing GPS EXIF
- **THEN** the stored object SHALL retain the GPS EXIF tags unchanged

### Requirement: Create-flow staging

During tour creation the user SHALL be able to select attachments before the tour row exists.
Selected files SHALL be uploaded immediately to a client-minted storage path under a pre-minted
tour id, mirroring the GPX pre-upload flow, and the form's Save SHALL be blocked until those
uploads settle. Attachment ROWS SHALL be inserted only AFTER the parent `tours` row is
successfully inserted.

If the tour insert fails, or the user cancels the form, no attachment rows SHALL exist and any
pre-uploaded storage objects SHALL be removed best-effort together with their cached bytes.

#### Scenario: Successful create with attachments

- **WHEN** the user picks 3 valid files during tour create and submits the form
- **THEN** the 3 files SHALL already be uploaded at submit time
- **AND** the tour row SHALL be inserted first, then 3 attachment rows referencing the new `tour_id`

#### Scenario: Save blocked during create-flow pre-upload

- **WHEN** a picked file is still uploading in the create form
- **THEN** Save SHALL be disabled until it completes, is cancelled, or fails

#### Scenario: User cancels create with files pre-uploaded

- **WHEN** the user has pre-uploaded files in the create form and closes it without submitting
- **THEN** no attachment rows SHALL exist for that aborted draft
- **AND** the pre-uploaded storage objects SHALL be removed best-effort

### Requirement: Add attachment workflow

Adding an attachment SHALL upload the file to storage at path
`<owner_id>/<tour_id>/<attachment_uuid>.<ext>` first, then insert a `tour_attachments` row. If
the row insert fails, the system SHALL best-effort delete the orphan storage object.

The `attachment_uuid` — and therefore the full storage path — SHALL be generated by the client
before the upload starts, so the path is known while the transfer is in flight. Every attachment
upload path (edit flow, create flow, and suggestion staging) SHALL use a single transport that
reports transferred bytes and can be aborted.

#### Scenario: Successful upload

- **WHEN** an allowed file is selected and the tour has fewer than 5 existing attachments
- **THEN** the file SHALL be uploaded and a corresponding `tour_attachments` row SHALL be inserted with `sort_order` placing it at the end of the list
- **AND** the inserted row's id SHALL be the id minted before the upload

#### Scenario: Row insert failure cleanup

- **WHEN** the storage upload succeeds but the row insert fails
- **THEN** the system SHALL attempt to delete the uploaded storage object

### Requirement: Delete attachment

The user SHALL be able to delete any of their attachments. Deletion SHALL be hard (no soft-delete) and require an explicit confirm dialog. Deletion SHALL remove both the database row and the storage object.

#### Scenario: User confirms deletion

- **WHEN** the user taps delete and confirms in the dialog
- **THEN** the `tour_attachments` row SHALL be deleted AND the corresponding storage object SHALL be removed

#### Scenario: User cancels deletion

- **WHEN** the user taps delete and cancels in the dialog
- **THEN** no row and no storage object SHALL be removed

#### Scenario: Tour deletion cascades

- **WHEN** the parent tour is deleted
- **THEN** all `tour_attachments` rows for that tour SHALL be removed via FK cascade

### Requirement: Reorder attachments

The user SHALL be able to reorder attachments by dragging a row's handle with a mouse, a pen or a finger, or by the arrow keys on a focused handle. The new order SHALL be persisted atomically via a single RPC `update_attachment_order(tour_id uuid, ordered_ids uuid[])`.

#### Scenario: Reorder via drag

- **WHEN** the user moves attachment B above attachment A
- **THEN** the RPC SHALL be invoked with the new ordered id list AND the persisted `sort_order` values SHALL reflect the new order

#### Scenario: Reorder by finger on a phone

- **WHEN** the user drags attachment B's handle above attachment A on an Android phone
- **THEN** the attachments SHALL reorder as with a mouse (no reliance on native HTML drag-and-drop)

#### Scenario: Reorder is atomic

- **WHEN** the RPC fails partway
- **THEN** no `sort_order` change SHALL be visible (transactional)

### Requirement: Signed URL access for download and view

The system SHALL grant read access to an attachment only via short-lived signed URLs (TTL ≤ 5 minutes). View URLs and download URLs SHALL be generated separately, with the download URL setting a `content-disposition: attachment` hint using the `original_filename`.

#### Scenario: View URL generation

- **WHEN** the viewer activates a given attachment
- **THEN** a signed URL with TTL ≤ 5 minutes SHALL be generated and used to load the asset

#### Scenario: Download

- **WHEN** the user taps download on an attachment
- **THEN** a separate signed URL SHALL be generated with download disposition AND the browser SHALL save the file using `original_filename`

#### Scenario: Expired URL recovery

- **WHEN** an in-progress view fails to load due to expired/403 signed URL
- **THEN** the viewer SHALL regenerate a fresh signed URL and retry once

### Requirement: Full-screen viewer with horizontal flip

The system SHALL provide a full-screen viewer that displays the selected attachment and SHALL allow the user to flip between all attachments of the tour via horizontal swipe and on-screen left/right controls. Images SHALL be rendered with a native `<img>`; PDFs SHALL be rendered using `pdfjs-dist` with page-by-page navigation. The viewer's top chrome (filename, download button, close button) SHALL clear the device status bar in standalone PWA mode on both iOS and Android by honoring `env(safe-area-inset-top)`. The viewer's bottom chrome (dots indicator, PDF page navigation) SHALL clear the home indicator / gesture navigation bar by honoring `env(safe-area-inset-bottom)`. Side navigation controls SHALL honor `env(safe-area-inset-left)` / `env(safe-area-inset-right)`. The viewer SHALL also close on a downward swipe gesture past a distance threshold; gesture classification SHALL choose the dominant axis so a clearly horizontal swipe still navigates between attachments, and an upward swipe SHALL NOT close the viewer.

#### Scenario: Flip between files

- **WHEN** the viewer is open on attachment 1 of N
- **THEN** the user SHALL be able to swipe horizontally or press a control to move to attachment 2, and the new attachment SHALL render full-screen

#### Scenario: Image rendering

- **WHEN** the active attachment is an image
- **THEN** it SHALL be rendered using `<img>` fitted to the viewport

#### Scenario: PDF rendering

- **WHEN** the active attachment is a PDF
- **THEN** the viewer SHALL render it using `pdfjs-dist` and SHALL provide page navigation when the PDF has more than one page

#### Scenario: PDF dependency loaded lazily

- **WHEN** a tour view renders without opening the viewer for a PDF
- **THEN** `pdfjs-dist` SHALL NOT be loaded into the main bundle

#### Scenario: Close button clears status bar on iOS and Android PWA

- **WHEN** the viewer is opened in a standalone PWA on iOS or Android where `env(safe-area-inset-top)` is non-zero
- **THEN** the header (including the close button) SHALL be offset by at least the safe-area top inset so the close button is fully tappable and not occluded by the system status bar

#### Scenario: Bottom chrome clears home indicator / gesture bar

- **WHEN** the viewer is opened on a device where `env(safe-area-inset-bottom)` is non-zero
- **THEN** the dots indicator (and PDF page navigation, when shown) SHALL be offset by at least the safe-area bottom inset

#### Scenario: Swipe down closes viewer

- **WHEN** the user performs a touch gesture whose downward vertical displacement (`dy > 0`) exceeds the close threshold AND exceeds the absolute horizontal displacement
- **THEN** the viewer SHALL emit `close` and be dismissed

#### Scenario: Swipe up does not close

- **WHEN** the user performs a touch gesture whose upward vertical displacement (`dy < 0`) exceeds the close threshold
- **THEN** the viewer SHALL NOT close

#### Scenario: Horizontal swipe still navigates

- **WHEN** the user performs a touch gesture whose absolute horizontal displacement exceeds the navigation threshold AND exceeds the absolute vertical displacement
- **THEN** the viewer SHALL navigate to the previous or next attachment and SHALL NOT close

### Requirement: Attachments excluded from PWA runtime cache

The PWA runtime cache SHALL NOT cache responses from the `tour-attachments` storage path/origin, to avoid serving expired or stale signed URLs.

#### Scenario: Service worker bypass

- **WHEN** the service worker intercepts a fetch for a `tour-attachments` signed URL
- **THEN** the response SHALL bypass the runtime cache (network-only)

### Requirement: Tour attachments list reacts to Realtime changes

When the user has a tour-attachments view open and an attachment for that tour is inserted, updated, or deleted on another device, the local view SHALL reflect the change within one debounce window without a manual reload.

The subscription MAY be served by the same per-user Realtime channel that the tours store uses (binding for `tour_attachments` filtered by `user_id=eq.${uid}`), with the attachments store reacting to the same `onChange` debounced trigger via a refetch of the currently displayed tour's attachments.

#### Scenario: New attachment on device A appears on device B
- **WHEN** device A uploads an attachment for tour T and device B has tour T's attachment view open
- **THEN** the attachment appears on device B without a manual reload

#### Scenario: Attachment deletion on device A removes it on device B
- **WHEN** device A deletes an attachment for tour T
- **THEN** device B removes it from its open view of tour T

#### Scenario: Attachments for other tours don't trigger refetch
- **WHEN** an event arrives for an attachment whose `tour_id` is not the currently viewed tour
- **THEN** the attachments store does not perform a per-tour refetch (cost-bounded)

### Requirement: Partner staging area for suggested files

A partner suggesting a GPX track or an attachment SHALL upload the file to a staging path
under their **own** uid prefix (`<suggester_uid>/suggestions/<tour_id>/<uuid>`) in the
existing bucket, so that no policy granting a non-owner write access to another user's
prefix is required. The tour owner SHALL be granted SELECT on objects referenced by a
pending suggestion on their own tour — and only when the object lies under that
suggestion's author's prefix — so the review sheet can render the proposed file. No other
user SHALL gain access to a staged object.

#### Scenario: Suggestion naming another user's object grants nothing
- **WHEN** a suggestion's `storagePath` names an object outside its author's prefix
- **THEN** the tour owner's suggestion read grant does not cover that object

#### Scenario: Partner uploads a staged file
- **WHEN** a marked partner uploads a suggested photo for a friend's tour
- **THEN** the object is written under the partner's own uid prefix and the upload succeeds under the existing owner-insert policy

#### Scenario: Owner reads a staged file for review
- **WHEN** the tour owner opens the review sheet on a suggestion carrying a staged file
- **THEN** a signed URL for the staged object resolves

#### Scenario: Third party cannot read a staged file
- **WHEN** another partner on the same tour requests a signed URL for the staged object
- **THEN** the Storage API denies the request

#### Scenario: Staged file for a resolved suggestion is swept
- **WHEN** the author's client loads suggestions and finds staged objects belonging to their own resolved suggestions
- **THEN** those objects are deleted

### Requirement: Accepted file is copied into the owner's prefix

On accepting a `gpx` or `attachment_add` suggestion, the system SHALL copy the staged
object into the owner's own prefix before recording the change, and the persisted
`gpx_filepath` / `storage_path` SHALL reference the owner's copy. The tour SHALL never
reference an object whose lifetime is controlled by a non-owner. A GPX copy SHALL land at a
fresh key, never at the tour's current `gpx_filepath`. A failed accept SHALL remove its
copies only when the server answered.

#### Scenario: Accepted attachment references the owner's copy
- **WHEN** the owner accepts an `attachment_add` suggestion
- **THEN** a copy is created under the owner's prefix and the new `tour_attachments` row references that path

#### Scenario: Author deleting their staged file does not break an accepted attachment
- **WHEN** the author later deletes their staged object
- **THEN** the accepted attachment still resolves, because it references the owner's copy

#### Scenario: Accepted GPX replaces the tour's own track
- **WHEN** the owner accepts a `gpx` suggestion on a tour created with a GPX at `<owner uid>/<tour id>.gpx`
- **THEN** the copy lands at a fresh key, `gpx_filepath` references it, and the previous object is removed while the accepted track stays readable

#### Scenario: Rejected accept removes its copy
- **WHEN** the accept RPC returns a server error
- **THEN** the client removes the copy it made, and a failed removal is logged

#### Scenario: Accept with unknown outcome keeps its copy
- **WHEN** the accept call fails without a server answer (no response, network error)
- **THEN** the copy is kept, since the accept may have committed and the tour may already reference it

#### Scenario: Batch copy fails part-way
- **WHEN** copying one file of a batch accept fails after earlier copies succeeded
- **THEN** the earlier copies are removed and the accept RPC is not called

### Requirement: The cap is enforced while a suggestion is composed

Suggest mode SHALL measure the remaining attachment slots against the tour's END state —
the owner's existing attachments, minus the ones this batch proposes to remove, plus the
files staged so far — rather than against the staged files alone. When no slot remains the
picker SHALL refuse further files and SHALL tell the partner that proposing a removal makes
room. A batch that would still breach the cap SHALL NOT be submittable.

#### Scenario: Partner cannot propose past the cap

- **WHEN** a partner opens suggest mode on a tour already holding four attachments and picks four files
- **THEN** the selection is refused with the remaining count, and only files fitting the cap can be staged

#### Scenario: Proposing a removal frees a slot immediately

- **WHEN** the partner marks one of the owner's attachments for removal on a full tour
- **THEN** the picker offers to add a file again

#### Scenario: Un-marking a removal blocks the submission

- **WHEN** the partner un-marks a removal after staging the file that removal made room for
- **THEN** the form reports that the proposal is over the limit and refuses to submit it

### Requirement: An accepted attachment reaches the author's view without a reload

The suggestion author SHALL see an accepted `attachment_add` appear on the tour without
reloading the page. The attachment row is written under the OWNER's user id, so the author's
own user-scoped attachment subscription never observes it; the author's own suggestion row
changing status SHALL therefore also refresh the open tour's attachments. The attachment
list SHALL likewise be refreshed when a surface that adjudicates or composes against it is
opened, since the list is what its cap decisions are computed from.

#### Scenario: Author sees the accepted photo appear

- **WHEN** the owner accepts a partner's `attachment_add` while that partner has the tour open
- **THEN** the attachment appears in the partner's view without a manual reload

#### Scenario: Returning to a tour resyncs its attachments

- **WHEN** the tour detail view is reopened after an attachment changed while it was closed
- **THEN** the list reflects the change, rather than serving whatever was loaded the first time

### Requirement: A completed write is never overwritten by a slower read

A successfully completed attachment write (add, delete, reorder) SHALL take precedence over
any list read that was issued before that write completed. A read result that becomes stale
while in flight SHALL be discarded rather than applied to the loaded list. Discarding a read
SHALL NOT discard a cached snapshot already painted for a cold load.

#### Scenario: List read resolves after an upload it could not see

- **WHEN** a list read is in flight
- **AND** an attachment upload and row insert complete before that read resolves
- **THEN** the read result SHALL be discarded
- **AND** the loaded list SHALL still contain the newly inserted attachment

#### Scenario: List read resolves after a deletion it could not see

- **WHEN** a list read is in flight
- **AND** the user deletes an attachment before that read resolves
- **THEN** the deleted attachment SHALL NOT reappear in the loaded list

#### Scenario: Uncontended read applies normally

- **WHEN** a list read completes with no attachment write having occurred while it was in flight
- **THEN** the result SHALL be applied to the loaded list

### Requirement: Attachment bytes are read cache-first

Reading an attachment's bytes SHALL serve locally cached bytes when present, without issuing
any network request. A cache miss SHALL fetch through a signed URL and cache the result, as
today.

This is sound because an attachment's storage path is owned by exactly one attachment: each
picked file mints a new `attachment_uuid` path, and the only write that may target an existing
object is a retry of that same attachment's own upload, which re-sends the identical bytes the
cache already holds. A cache hit therefore cannot be stale. Any change that writes DIFFERENT
bytes to an existing attachment path — an edit-in-place, a path reused across attachments —
SHALL be treated as breaking this requirement.

#### Scenario: A retried upload does not invalidate the cached bytes

- **WHEN** an attachment upload is retried after a failure and overwrites the object it had already partially written
- **THEN** the bytes sent SHALL be the same cached bytes the picker is rendering
- **AND** the cache-first read SHALL continue to serve them without a network request

The cache-first behaviour SHALL be opt-in per call site and SHALL NOT apply to GPX tracks,
whose storage key is upserted on replace.

#### Scenario: Re-opening a tour costs no bandwidth

- **WHEN** the user opens a tour whose attachment bytes are already cached
- **THEN** the attachments SHALL render from the cache
- **AND** no signed-URL request and no byte download SHALL be issued

#### Scenario: Flaky connection does not stall rendering

- **WHEN** the device is nominally online but the connection is failing
- **AND** the attachment's bytes are cached
- **THEN** rendering SHALL NOT wait on a network attempt before using the cached bytes

#### Scenario: Never-viewed attachment while offline

- **WHEN** an attachment's bytes have never been cached and the device is offline
- **THEN** the existing "unavailable offline" fallback SHALL be shown

### Requirement: Per-file upload progress, cancellation and retry

While attachment uploads are running the system SHALL show, per file, its filename, a
determinate progress indicator reflecting bytes transferred, and a Cancel control. Files SHALL
upload and settle independently: one file's failure or cancellation SHALL NOT abort the others.

Cancelling SHALL abort that file's transfer, leave no attachment row, best-effort remove any
storage object and locally cached bytes for it, and surface no error message. No other unsaved
form input SHALL be discarded and already-persisted attachments SHALL remain.

A file whose upload fails SHALL keep its row in a failed state offering Retry and Dismiss.
Retry SHALL re-upload from the locally cached bytes without requiring the user to pick the file
again. Dismiss SHALL evict those bytes and remove the row. While the device is offline, Retry
SHALL be disabled rather than queued — attachment upload remains online-only.

#### Scenario: Progress reflects transfer

- **WHEN** a 6 MB image is uploading
- **THEN** the progress indicator SHALL advance as bytes are transferred rather than showing an indeterminate spinner

#### Scenario: Cancel one of several uploads

- **WHEN** three files are uploading and the user cancels the second
- **THEN** the second file's transfer SHALL be aborted and produce no attachment row
- **AND** the first and third SHALL continue and complete

#### Scenario: Cancel does not discard tour edits

- **WHEN** the user has edited the tour name and cancels an in-flight upload
- **THEN** the edited tour name SHALL be retained in the form
- **AND** previously completed attachment uploads SHALL remain attached to the tour

#### Scenario: One file fails, the rest succeed

- **WHEN** one file of a four-file batch fails to upload
- **THEN** the other three SHALL be persisted
- **AND** the failed file SHALL remain listed in a failed state with Retry and Dismiss

#### Scenario: Retry after a failure

- **WHEN** the user retries a failed upload
- **THEN** the upload SHALL resume from the locally cached bytes with no file re-selection

#### Scenario: Retry is idempotent

- **WHEN** a first attempt wrote the storage object, or inserted the row, before failing
- **THEN** the retry SHALL overwrite that object and reconcile that row rather than failing on an already-exists or duplicate-key error
- **AND** the attachment SHALL appear exactly once in the list, never twice

#### Scenario: Connection lost mid-upload

- **WHEN** the device goes offline while a file is uploading
- **THEN** that file SHALL enter the failed state with Retry disabled
- **AND** Retry SHALL become available again once the device is back online
- **AND** the upload SHALL NOT be enqueued for automatic replay

#### Scenario: Sheet closed during upload

- **WHEN** the user closes the form while an attachment upload is running
- **THEN** the upload SHALL continue to completion and its attachment row SHALL be inserted

### Requirement: Save is blocked while attachment uploads are in flight

The tour form's Save action SHALL be disabled while any attachment upload for that form is in
flight, and SHALL become enabled again once every upload has completed, been cancelled, or
entered the failed state. The guard SHALL also be enforced in the submit handler, so a Save
control rendered outside the form element cannot bypass it.

A failed upload SHALL NOT block Save, so a hard failure cannot dead-end the form.

A Save control that is blocked SHALL be presented as unavailable, not merely inert on
activation — every Save control for the form, including one rendered outside the form element,
SHALL reflect that state.

#### Scenario: A blocked Save looks blocked

- **WHEN** an attachment upload is in flight
- **THEN** every Save control for that form SHALL appear disabled rather than accepting a tap that silently does nothing

### Requirement: Attachment deletion is unavailable offline

Attachments are online-only: deleting one offline can remove neither the row nor the storage
object. The delete control SHALL therefore be absent while the device is offline, rather than
present and failing on activation. An inline delete confirmation SHALL likewise be withdrawn if
the connection is lost while it is open. Reading already-cached attachments SHALL be unaffected.

#### Scenario: Delete control while offline

- **WHEN** a user opens a tour's attachments while offline
- **THEN** no delete control SHALL be offered for any attachment
- **AND** the attachments SHALL still render from cached bytes

#### Scenario: Connection lost during a delete confirmation

- **WHEN** the device goes offline while a delete confirmation is showing
- **THEN** the confirmation SHALL be withdrawn rather than offering a delete that cannot run

#### Scenario: Save disabled during upload

- **WHEN** an attachment upload is in flight
- **THEN** the Save button SHALL be disabled

#### Scenario: Cancelling the last upload re-enables Save

- **WHEN** the only in-flight upload is hanging on a slow connection
- **AND** the user cancels it
- **THEN** Save SHALL be enabled immediately
- **AND** submitting SHALL persist the tour's other changes and its already-uploaded attachments

#### Scenario: Failed upload leaves the form savable

- **WHEN** an upload has failed and is showing Retry
- **THEN** Save SHALL be enabled

#### Scenario: External Save control during upload

- **WHEN** an attachment upload is in flight
- **AND** the submit handler is invoked from a Save control outside the `<form>`
- **THEN** the submission SHALL be ignored

### Requirement: Picked files render from local bytes

An attachment's storage path SHALL be minted client-side before its upload begins, and the
picked bytes SHALL be written to the local blob cache under that path. Rendering the attachment
SHALL then serve those local bytes, without requesting a signed URL or downloading the file.

#### Scenario: Thumbnail visible before upload completes

- **WHEN** the user picks an image on a slow connection
- **THEN** its thumbnail SHALL render from the locally cached bytes while the upload is still running

#### Scenario: No download after upload

- **WHEN** an upload has just completed
- **THEN** displaying that attachment SHALL NOT issue a signed-URL request or download its bytes

#### Scenario: Cancelled upload leaves no cached bytes

- **WHEN** an upload is cancelled or dismissed after failing
- **THEN** the locally cached bytes for its storage path SHALL be evicted

### Requirement: Filenames are de-duplicated with numbering

When a picked file's name is already taken by an attachment the tour holds, has staged, or is
uploading, the stored `original_filename` SHALL be made unique by appending an incrementing
number to the base name, preserving the extension. A name that does not collide SHALL be kept
unchanged. The name shown while uploading SHALL be the name that is persisted.

#### Scenario: Repeated camera captures

- **WHEN** the user takes three photos in succession and the device names each one `image.jpg`
- **THEN** the stored filenames SHALL be `image.jpg`, `image1.jpg`, and `image2.jpg`

#### Scenario: Collision against an already-persisted attachment

- **WHEN** the tour already holds `image.jpg` and the user picks another file named `image.jpg`
- **THEN** the new attachment SHALL be stored as `image1.jpg`

#### Scenario: Distinct names preserved

- **WHEN** the user picks `Hoernli-summit.jpg` from the photo library
- **THEN** the stored filename SHALL be `Hoernli-summit.jpg` unchanged
