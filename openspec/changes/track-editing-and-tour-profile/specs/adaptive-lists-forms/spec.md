## MODIFIED Requirements

### Requirement: Content that is not a list stays content
Views with no system counterpart (the map, the month grid, the seasons chart, the elevation profile, coach marks) SHALL be drawn by the app on every platform, using the design tokens, and SHALL sit inside system lists and sheets where they appear in one, never replacing the list with a look-alike.

#### Scenario: Elevation profile in the tour detail
- **WHEN** a tour with a track shows its elevation profile in the detail sheet
- **THEN** the profile is drawn by the app at the top of the sheet, under the tour's overview and above the system list
