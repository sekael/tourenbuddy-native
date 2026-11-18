## REMOVED Requirements

### Requirement: Persistent bottom-center tour action bar
**Reason**: The native app puts the same two actions into a glass capsule of real system glass in the Map tab's thumb zone, above the tab bar (D19).
**Migration**: "Glass tour capsule in the map's thumb zone" below.

## ADDED Requirements

### Requirement: Glass tour capsule in the map's thumb zone
The Map tab SHALL show, centred right above the tab bar, a capsule with "My tours" (opens the tours list) and an "Add tour" button (starts tour creation), in Liquid Glass on iOS and as Material floating controls on Android and web, level with the menu circle at the trailing edge and the legend button at the leading edge. The capsule SHALL hide while a tour or the tours list is open and while picking or drawing.

#### Scenario: Open my tours
- **WHEN** the user taps "My tours"
- **THEN** the tours list opens as a sheet over the map

#### Scenario: Hidden behind a tour
- **WHEN** a tour's detail sheet is open
- **THEN** the capsule is hidden and returns when the sheet closes
