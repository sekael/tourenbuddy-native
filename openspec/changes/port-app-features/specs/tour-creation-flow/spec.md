## REMOVED Requirements

### Requirement: The route step's sheet folds on a phone
**Reason**: The native route step is a system sheet over the live map; it folds and unfolds through its detents, dragged by the system grabber.
**Migration**: "Route step in a sheet over the live map" below.

## ADDED Requirements

### Requirement: Route step in a sheet over the live map
On iOS and Android the route step, a point pick from the form, and track drawing SHALL run on the Map tab's live map with a sheet holding the step's controls, at a small and a medium height; the map above the sheet SHALL take taps and gestures. The form SHALL close while they run, keeping its draft, and SHALL return with every field as it was plus what the step set. The sheet's title SHALL name the point or the step.

#### Scenario: Fold for more map
- **WHEN** the user drags the route step's sheet down to its small height
- **THEN** only the summary (title, numbers, next step, buttons) shows and the rest of the screen is map

#### Scenario: Pick from the form keeps the draft
- **WHEN** the user has typed a name, taps Change on the end point, taps the map and taps Done
- **THEN** the form returns with the typed name and the new end
