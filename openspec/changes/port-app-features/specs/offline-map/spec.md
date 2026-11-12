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

#### Scenario: Incomplete pack
- **WHEN** the system evicted part of a pack
- **THEN** the region shows as incomplete with a way to download it again
