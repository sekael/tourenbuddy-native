# ski-route-dataset Specification

## Purpose

Provides the app's own copy of the Swisstopo ski-route dataset, refreshed automatically from the official release and published independently of app releases, so ski routes can be marked and tapped at low zooms with little traffic.

## Requirements

### Requirement: Dataset contents

The published dataset SHALL contain exactly the Swisstopo ski routes that carry route information (a target), with their attributes in all four languages and their complete line geometry in WGS84. Routes without route information and lines from third-party sources SHALL NOT be published.

#### Scenario: Route without information

- **WHEN** the official release contains a ski-route line without a target
- **THEN** it SHALL NOT appear in the published tiles or route files

#### Scenario: Third-party line

- **WHEN** the official release contains a line whose source is not swisstopo/SAC
- **THEN** it SHALL NOT be published

### Requirement: Map tiles and route files

The dataset SHALL be published as map tiles for marking and hit-testing, carrying each route's id and difficulty, and as one file per route holding its attributes and complete, unclipped, unsimplified geometry. The tiles SHALL cover zoom 6 to 13 and keep sub-metre coordinate precision at their highest zoom.

#### Scenario: Route crossing tile edges

- **WHEN** a route spans several tiles
- **THEN** its route file SHALL still hold the whole route as continuous polylines

### Requirement: Automatic refresh from the official release

A scheduled job SHALL check the official Swisstopo release at least weekly and SHALL rebuild and republish the dataset when the release is newer than the published one, without any manual step. When nothing changed it SHALL publish nothing. It SHALL also be startable by hand.

#### Scenario: New yearly release

- **WHEN** Swisstopo publishes a new ski-route release
- **THEN** the next scheduled run SHALL publish a dataset built from it

#### Scenario: No new release

- **WHEN** the scheduled run finds the published dataset matches the official release
- **THEN** it SHALL finish without rebuilding or deploying

### Requirement: Refresh survives repository inactivity

The scheduled refresh SHALL keep running when the repository has no other activity for longer than GitHub's inactivity limit for scheduled workflows.

#### Scenario: Months without commits

- **WHEN** the repository has had no commits for 90 days
- **THEN** the scheduled refresh SHALL still run on schedule

### Requirement: Versioned publication

Each published dataset SHALL live under its own version path, announced by a manifest at a stable URL that also states zoom range, bounds and attribution. Switching to a new version SHALL be atomic for clients: a client SHALL never combine tiles or route files from two versions through the manifest. The publication SHALL be readable cross-origin by the app.

#### Scenario: Old-version request after a refresh

- **WHEN** a client still requests a tile or route file under the previous version path
- **THEN** it SHALL receive the current version's content for the same tile or route

#### Scenario: Client after a refresh

- **WHEN** a new version is published and the app loads the manifest
- **THEN** all tiles and route files it requests SHALL come from the new version

### Requirement: Attribution

Wherever the app shows published ski-route data, it SHALL credit swisstopo with exactly the text the base map uses, `© swisstopo`, so the map shows the credit once.

#### Scenario: Routes on the map

- **WHEN** ski routes from the dataset are shown on the map
- **THEN** the map attribution SHALL include `© swisstopo` exactly once
