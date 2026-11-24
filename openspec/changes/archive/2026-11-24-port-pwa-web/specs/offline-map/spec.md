## MODIFIED Requirements

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
