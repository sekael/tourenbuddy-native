## MODIFIED Requirements

### Requirement: Floating controls use the platform material

Controls that float over content SHALL use Liquid Glass on iOS, the system's own material and never
a blur imitation, and on Android a brand-colored surface with a shadow. The web app keeps the PWA's
map-control surface (`web-app`). Glass SHALL stay on the control layer: content stays opaque and
glass never sits on glass. The system's Reduce Transparency and Increase Contrast settings SHALL
apply to the glass.

#### Scenario: Bottom row on iOS

- **WHEN** the places' capsule and the menu button float over a tab on iOS
- **THEN** both are Liquid Glass and the content beneath shows through them

#### Scenario: Menu button on Android and web

- **WHEN** the menu button floats over a tab on Android, or the speed-dial trigger over the web map
- **THEN** on Android it is a brand blue button with a white glyph and a soft shadow; on the web it
  wears the PWA's map-control surface

#### Scenario: Reduce Transparency

- **WHEN** Reduce Transparency is switched on or off in iOS settings while the app runs
- **THEN** the glass controls turn opaque or clear again and stay readable, without ghost copies
  of their icons or labels
