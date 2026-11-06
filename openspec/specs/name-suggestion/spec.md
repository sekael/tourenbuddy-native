## Purpose

Suggest a tour name based on the selected map location using Swisstopo reverse-geocoding.

## Requirements

### Requirement: Name suggestion service

A service (`suggestTourName` in `swisstopo-name-service.ts`) SHALL query the Swisstopo GeoAdmin identify API on the `ch.swisstopo.swissnames3d` layer, in LV95 coordinates, for named features near the given point: first within 50 m, then within 500 m when nothing is found. Results SHALL be ranked by feature-type priority (`objektart`) and the best match's `name` (or HTML-stripped `label`) returned. The caller MAY pass an `AbortSignal` to stop waiting.

#### Scenario: Named feature found

- **WHEN** `suggestTourName({ lng, lat })` is called near a known peak, pass, or hut
- **THEN** the service SHALL return the name of the closest named feature as a string

#### Scenario: No named feature nearby

- **WHEN** `suggestTourName({ lng, lat })` is called in an area with no named feature within 500 m
- **THEN** the service SHALL return `null`

#### Scenario: API timeout or error

- **WHEN** the identify API does not respond within 10 seconds or returns an error
- **THEN** the service SHALL return `null` and log it

#### Scenario: Caller stops waiting

- **WHEN** the signal passed to `suggestTourName(coords, signal)` aborts before the API answers
- **THEN** the request SHALL be aborted and the service SHALL return `null` without logging

### Requirement: Name auto-suggestion on location confirm

After the user confirms a map location, the tour form SHALL open at once and look up a name for that point's name field on its own, independently of the elevation lookup. A name chosen in the picker's search SHALL be used instead of the lookup. The point's name and elevation SHALL show together, once both lookups have answered or failed.

#### Scenario: Name loading

- **WHEN** the name or elevation lookup for a picked point is still running
- **THEN** the name field SHALL show a quiet pulsing bar in place of its text, with no spinner and no loading hint
- **AND** a name already answered SHALL appear only together with the elevation

#### Scenario: Name suggested and accepted

- **WHEN** a name suggestion is available and the user does not modify it
- **THEN** the tour SHALL be created with the suggested name

#### Scenario: Name suggested but overridden

- **WHEN** a name suggestion is available and the user types a different name
- **THEN** the tour SHALL use the user-entered name

#### Scenario: No suggestion available

- **WHEN** no name suggestion is returned (nothing nearby, timeout, API error)
- **THEN** the name field SHALL stay empty with the placeholder "Not available from Swisstopo – enter manually" (or its localized equivalent)

#### Scenario: User types while the lookup runs

- **WHEN** the user types in the name field before the lookup answers
- **THEN** the field SHALL show what is typed, the request SHALL be aborted, and no later answer SHALL replace the typed name

#### Scenario: Re-pick keeps a typed name

- **WHEN** the user has typed a name and then re-picks the point
- **THEN** no name lookup SHALL run for that field and the typed name SHALL stay
- **AND** a name the form filled itself or was opened with SHALL be replaced by the new point's name
