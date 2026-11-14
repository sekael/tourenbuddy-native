## REMOVED Requirements

### Requirement: Base-map footprint is measured before sizing-dependent UI
**Reason**: The native offline packs report their own size and progress.
**Migration**: "Offline regions as native packs" below.

### Requirement: Downloaded base-map assets are served offline-first
**Reason**: The native map serves its offline packs itself; there is no service worker.
**Migration**: "Offline regions as native packs" below.

## ADDED Requirements

### Requirement: Offline regions as native packs
On iOS and Android a downloaded region SHALL be an offline pack of the vector base map with its labels and the ski-route source, zoom levels 0 to 14, created from a rectangle the user draws, with an estimate before and progress during the download. The list of regions SHALL show each region's size and whether it is complete, read from the pack rather than assumed; a region can be deleted. Offline maps SHALL NOT be offered on the web.

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
