## Purpose

Let users download a chosen region (or all of Switzerland) of the `ch.swisstopo.basemap.vt` vector base map — tiles plus the style/sprite/glyph assets — so the base map renders with labels offline, and let them manage (list, size, delete) those downloads under the browser storage quota.

## Requirements

### Requirement: Base-map footprint is measured before sizing-dependent UI

Before any download or estimation UI is built, the team SHALL measure and record
the base-map (`ch.swisstopo.basemap.vt`) offline footprint: tiles-per-zoom and
bytes for a sample region up to the source `maxzoom`, the extrapolated
whole-Switzerland figure, the source's real `maxzoom`, the browser storage quota
and eviction behaviour on target platforms (including iOS Safari), whether plain
browser vs installed PWA is required for durable offline storage, and whether the
service worker reads the hot tile path faster from the Cache API or IndexedDB. The
recorded findings SHALL be the basis for the estimate formula and the quota guard.

#### Scenario: Measurement recorded before download UI

- **WHEN** the offline-map download or estimate UI is implemented
- **THEN** the measured average tile bytes, source `maxzoom`, and quota figures it
  relies on have already been recorded in the change, not assumed

#### Scenario: Feasibility per platform captured

- **WHEN** the spike evaluates a target browser that offers too little quota or no
  durable (non-evictable) storage
- **THEN** that limitation is recorded so the UI can surface it to the user

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

### Requirement: Downloaded base-map assets are served offline-first

The service worker SHALL serve a base-map tile, style, sprite, or glyph asset, or a
ski-route tile, from the offline download cache whenever a copy is present, using
the network only when no offline copy exists. A downloaded copy SHALL take
precedence over the network and over the opportunistic runtime tile cache.
Requests with no offline copy SHALL behave exactly as before this change (existing
runtime caching for the respective asset).

#### Scenario: Downloaded tile preferred over network

- **WHEN** the map requests a base-map asset that exists in the offline download
  cache
- **THEN** the service worker returns the offline copy without a network request

#### Scenario: Downloaded ski-route tile preferred over network

- **WHEN** the map requests a ski-route tile that exists in the offline download
  cache
- **THEN** the service worker returns the offline copy without a network request

#### Scenario: Non-downloaded tile falls back to runtime behaviour

- **WHEN** the map requests a base-map asset not present in the offline download
  cache
- **THEN** the request is handled by the existing runtime tile caching (network
  with stale-while-revalidate), unchanged

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
