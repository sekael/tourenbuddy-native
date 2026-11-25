## Purpose

Let users download a chosen region (or all of Switzerland) of the `ch.swisstopo.basemap.vt` vector base map — tiles plus the style/sprite/glyph assets — so the base map renders with labels offline, and let them manage (list, size, delete) those downloads under the browser storage quota.

## Requirements

### Requirement: User selects an offline region by drawing a rectangle

The system SHALL let a user draw an axis-aligned rectangle on the map to define
the geographic extent of an offline base-map download. The selection SHALL be
performed without adding a new mapping/drawing dependency.

#### Scenario: Draw a region

- **WHEN** the user activates offline-region selection and drags on the map
- **THEN** a rectangle is drawn following the drag, and on release its two corners
  define the download bounding box

#### Scenario: Adjust before confirming

- **WHEN** the user redraws or resizes the rectangle before confirming
- **THEN** the defined bounding box updates to the latest rectangle

#### Scenario: Download the entire Swiss extent

- **WHEN** the user chooses the "whole map" option instead of drawing
- **THEN** the download region is set to the base-map source `bounds` (all of
  Switzerland) and proceeds through the same estimate + quota-guard + download
  path, blocked only if quota/durable storage is insufficient

### Requirement: Estimated download size is shown before confirming

The system SHALL display an estimated download size for the selected region and
zoom range **before** the user confirms the download. The estimate SHALL be
derived from the enumerated tile count and measured average tile size plus an
allowance for style, sprite, and glyph assets, and SHALL update when the selection
changes.

#### Scenario: Estimate shown pre-confirm

- **WHEN** the user has drawn a region and has not yet confirmed
- **THEN** an estimated size is displayed and reflects the current region extent

#### Scenario: Estimate updates with selection

- **WHEN** the user enlarges or shrinks the selected region
- **THEN** the displayed estimate increases or decreases accordingly

#### Scenario: Estimate approaches quota

- **WHEN** the estimated size approaches or exceeds the available storage quota
  headroom
- **THEN** the user is warned before starting and the download does not silently
  proceed to failure

### Requirement: Region download includes tiles and style rendering assets

A confirmed download SHALL fetch, for the selected bounding box across every zoom
level up to the source `maxzoom`, the base-map vector tiles **and** the
style.json, sprite (json + png), and glyph range PBFs the style references, and
store them in a dedicated offline tile cache. A region downloaded this way SHALL
render offline with labels and symbols, not a blank/unlabelled base map. The
download SHALL also fetch the app's ski-route tiles for the same bounding box up
to their `maxzoom`, so marked ski routes render offline; per-route detail files
SHALL NOT be downloaded.

#### Scenario: Labels render offline

- **WHEN** a region has been downloaded and the device is offline within that
  region and zoom range
- **THEN** the base map renders with its labels and symbols, not empty tiles

#### Scenario: Ski routes render offline

- **WHEN** a region has been downloaded, the device is offline within it and the
  ski-route overlay is on at zoom 11 or closer
- **THEN** the routes with route information in that region SHALL be marked

#### Scenario: Ski-route dataset refreshed after the download

- **WHEN** a newer ski-route dataset was published after the region was
  downloaded and the device is offline within that region
- **THEN** the downloaded ski-route tiles SHALL still render

#### Scenario: Download is bounded and cancelable

- **WHEN** a region download is in progress
- **THEN** progress is reported, the download uses a bounded number of concurrent
  requests, and the user can cancel it

#### Scenario: Canceled or failed download leaves no partial region

- **WHEN** a download is canceled or fails partway
- **THEN** no "downloaded" region record is presented for it and its partial cache
  writes are rolled back

#### Scenario: Quota exhausted mid-download

- **WHEN** available storage is exhausted while a download is running
- **THEN** the download aborts, reports the failure, and does not leave a region
  presented as complete

### Requirement: User can manage downloaded regions

The system SHALL provide a UI listing each downloaded region with its label,
extent, zoom range, and size, showing total storage used against the browser
storage quota, and allowing the user to delete a region to reclaim space.
Deleting a region SHALL purge that region's offline assets except assets still
referenced by another downloaded region.

#### Scenario: List and total usage

- **WHEN** the user opens the manage-downloads view
- **THEN** each downloaded region is listed with its size, and total storage used
  is shown relative to the available quota

#### Scenario: Delete reclaims space

- **WHEN** the user deletes a downloaded region
- **THEN** that region's offline assets are removed and its size is no longer
  counted in storage used

#### Scenario: Overlapping region assets are preserved on delete

- **WHEN** the user deletes a region whose tiles overlap another still-downloaded
  region
- **THEN** tiles shared with the surviving region remain cached and the surviving
  region still renders offline

### Requirement: Offline regions as native packs
On iOS and Android a downloaded region SHALL be an offline pack of the vector base map with its labels and the ski-route source, zoom levels 0 to 14, created from a rectangle the user draws, with an estimate before and progress during the download. The list of regions SHALL show each region's size and whether it is complete, read from the pack rather than assumed; a region can be deleted.

#### Scenario: Airplane mode
- **WHEN** a region finished downloading and the device is in airplane mode after a restart
- **THEN** the base map, labels and ski routes render inside the region

#### Scenario: Download under way
- **WHEN** the user starts downloading a region
- **THEN** its row shows a progress bar filling with the percentage, and once done the row says the region is available offline with its size

#### Scenario: Cancel a download
- **WHEN** the user taps the stop button at the end of a download's row (or swipes it) and confirms
- **THEN** the download stops, the region and what it fetched are gone, and the app keeps running

#### Scenario: Delete after a restart
- **WHEN** the user restarts the app, opens the offline maps and deletes a saved region
- **THEN** the region is gone from the list and the map, and the app keeps running

#### Scenario: Offline regions on the web
- **WHEN** a web user opens the offline maps
- **THEN** they work as in the PWA: tiles and assets in the browser's cache, listed against the browser's storage quota (`web-app`)

#### Scenario: Incomplete pack
- **WHEN** the system evicted part of a pack
- **THEN** the region shows as incomplete with a way to download it again

### Requirement: Saved regions and the new one show on the map
Opening the offline maps SHALL show the saved regions outlined on the map, framed above the sheet, and list each with its name and size, also after the app restarts; with none saved, the list SHALL say so. Framing a new region SHALL show a fixed frame over the map, as the PWA does, marking exactly the area that downloads, with its estimated size updating as the map moves under it; the estimate SHALL err high, never promising less storage than the region takes.

#### Scenario: After a restart
- **WHEN** the user saved a region, restarts the app and opens the offline maps
- **THEN** the region is listed with its size and outlined on the map

#### Scenario: A name from the place
- **WHEN** the user frames a region
- **THEN** its name is prefilled from Swisstopo's names at the frame's centre: the town, valley or named area the centre lies in ("Zermatt"), else one within a kilometre ("Gadmertal"), official names before local variants, else the name a tour pinned there would get, else its coordinates; it follows the frame until the user types a name of their own

#### Scenario: Framing a valley
- **WHEN** the user taps "Region herunterladen" and moves the map until the frame covers the Lauterbrunnen valley
- **THEN** the sheet shows the estimated size for the framed area, and after the download the region's outline matches the frame
