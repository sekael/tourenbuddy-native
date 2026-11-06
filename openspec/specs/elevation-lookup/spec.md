## Purpose

Resolve elevation in meters for a coordinate via the Swisstopo elevation API.

## Requirements

### Requirement: WGS84 to LV95 coordinate transformation

A utility function `wgs84ToLv95(lng: number, lat: number): { easting: number, northing: number }` SHALL convert WGS84 (EPSG:4326) longitude/latitude to Swiss LV95 (EPSG:2056) easting/northing using the swisstopo approximate polynomial formulas.

#### Scenario: Known reference point conversion

- **WHEN** `wgs84ToLv95(7.43863, 46.95108)` is called (Bern Federal Palace)
- **THEN** the result SHALL be approximately `{ easting: 2600000, northing: 1200000 }` within ±2m accuracy

#### Scenario: Coordinate at Swiss border

- **WHEN** `wgs84ToLv95` is called with coordinates at the edge of Swiss territory
- **THEN** it SHALL return valid LV95 coordinates (no bounds check — the elevation API handles out-of-bounds)

### Requirement: Elevation lookup service

A service SHALL convert WGS84 coordinates to LV95, then query the Swisstopo height API with EPSG:2056 parameters to retrieve elevation. The caller MAY pass an `AbortSignal` to stop waiting.

#### Scenario: Successful elevation retrieval

- **WHEN** `getElevation({ lng, lat })` is called with WGS84 coordinates within Switzerland
- **THEN** the service SHALL convert to LV95 via `wgs84ToLv95`, call `https://api3.geo.admin.ch/rest/services/height?easting={E}&northing={N}&sr=2056`, and return the elevation in meters as a number

#### Scenario: Coordinates outside Switzerland

- **WHEN** `getElevation({ lng, lat })` is called with coordinates outside Swiss territory
- **THEN** the service SHALL return `null` without throwing an error

#### Scenario: API timeout

- **WHEN** the Swisstopo API does not respond within 10 seconds
- **THEN** the service SHALL return `null` and log a warning via the logger composable

#### Scenario: API error

- **WHEN** the Swisstopo API returns an error response
- **THEN** the service SHALL return `null` and log the error

#### Scenario: Caller stops waiting

- **WHEN** the signal passed to `getElevation(coords, signal)` aborts before the API answers
- **THEN** the request SHALL be aborted and the service SHALL return `null` without logging

### Requirement: Elevation auto-fill on location confirm

After the user confirms a map location, the tour form SHALL open at once and look up the elevation for that point's elevation field on its own, independently of the name lookup. The point's name and elevation SHALL show together, once both lookups have answered or failed.

#### Scenario: Elevation loading

- **WHEN** the elevation or name lookup for a picked point is still running
- **THEN** the elevation field SHALL show a quiet pulsing bar in place of its text, with no spinner and no loading hint
- **AND** the name field SHALL hold its bar too until the elevation has answered or failed

#### Scenario: Elevation pre-filled

- **WHEN** the elevation lookup succeeds
- **THEN** the elevation field SHALL be filled with the retrieved value, shown together with the name once the name lookup has answered or failed
- **AND** the user SHALL be able to manually override the value

#### Scenario: Elevation lookup fails

- **WHEN** the elevation lookup returns null (timeout, API error, outside Switzerland)
- **THEN** the elevation field SHALL stay empty with the placeholder "Not available from Swisstopo – enter manually" (or its localized equivalent)

#### Scenario: User types while the lookup runs

- **WHEN** the user types in the elevation field before the lookup answers
- **THEN** the field SHALL show what is typed, the request SHALL be aborted, and no later answer SHALL replace the typed value

#### Scenario: Re-pick keeps a typed elevation

- **WHEN** the user has typed an elevation and then re-picks the point
- **THEN** no elevation lookup SHALL run for that field and the typed value SHALL stay
- **AND** an elevation the form filled itself or was opened with SHALL be replaced by the new point's lookup
