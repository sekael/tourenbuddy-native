## ADDED Requirements

### Requirement: Brand color roles

The app SHALL define its colors as semantic roles (such as primary, surface, on-surface, secondary
container and floating control) over a palette of primitive colors taken from the Vue app. Screens
and components SHALL use the roles only. The app SHALL appear in its light colors only. Every text
or icon role SHALL reach a contrast of at least 4.5:1 on the surface it is drawn on.

#### Scenario: Brand primary

- **WHEN** a control uses the primary role
- **THEN** it is drawn in the brand blue `#2563eb`

#### Scenario: Text roles meet WCAG AA

- **WHEN** secondary text is drawn on the tinted map placeholder, or a label on a tonal control
- **THEN** it reads at 4.5:1 or more

#### Scenario: Device in dark mode

- **WHEN** the device is set to dark mode
- **THEN** the app keeps its light colors

### Requirement: Platform typography

iOS SHALL use the system font. Android and web SHALL use Inter in weights 400, 500 and 600, bundled
with the app and served from its own origin, never from a third-party font service. Headings SHALL
use weight 500. On Android the first frame SHALL already be in Inter. On web, text SHALL show in the
system font while Inter loads and SHALL NOT switch font after a long wait or if it fails to load.

#### Scenario: iOS

- **WHEN** the app runs on iOS
- **THEN** text renders in the system font

#### Scenario: Android first frame

- **WHEN** the app starts on Android
- **THEN** the first frame's text is already in Inter

#### Scenario: Web font from the app's origin

- **WHEN** the web app loads
- **THEN** Inter is requested from the app's own origin only

#### Scenario: Web font fails

- **WHEN** Inter cannot be loaded on web
- **THEN** text stays in the system font

### Requirement: Platform icons

Icons SHALL come from one registry that names each icon once and maps it to an SF Symbol on iOS and
a Material Symbols Outlined glyph on Android and web. Icons SHALL render in the first frame without
loading a font, so an icon's box never depends on network or font state. Icons inside a control
SHALL be hidden from assistive technology; the control carries the name.

#### Scenario: Same icon on each platform

- **WHEN** the menu shows its Inbox item
- **THEN** iOS shows the `bell` SF Symbol and Android and web the Material `notifications` glyph

#### Scenario: No icon pops in

- **WHEN** a screen with icons opens for the first time, offline or on a slow network
- **THEN** its icons are drawn in the first frame

#### Scenario: Decorative icons stay silent

- **WHEN** a screen reader focuses the menu button
- **THEN** it announces the button's name only, not its icon

### Requirement: Activity types have their own glyphs

Where the icon set has no glyph for a needed subject, the app SHALL use its own glyph, drawn to the
same grid and weight and registered like any other icon, on every platform and offline.

#### Scenario: Ski-touring types have their own glyphs

- **WHEN** a ski tour or a splitboard tour is shown anywhere the tour type icon appears (type picker,
  tour list, tour detail, calendar)
- **THEN** a ski tour SHALL show an uphill skier on skins and a splitboard tour a matching uphill
  splitboarder
- **AND** neither SHALL show the walking/hiking glyph
- **AND** both SHALL render offline, without any network request

#### Scenario: Equipment reads as gear by its icon

- **WHEN** a tour with equipment is shown in the detail view
- **THEN** the equipment row SHALL lead with an ice axe glyph, a subject the Material set lacks
- **AND** it SHALL NOT use a generic backpack, box or tools glyph

#### Scenario: Climbing and mountaineering types have their own glyphs

- **WHEN** a climbing, a mountaineering or a ski-mountaineering tour is shown anywhere the tour type
  icon appears
- **THEN** a climbing tour SHALL show a climber on a rock overhang, a mountaineering tour a figure
  scrambling up a rock step, and a ski-mountaineering tour that figure with skis strapped to its pack
- **AND** the three SHALL differ from each other and from the hiking and ski-touring glyphs, and none
  SHALL show a generic landscape or mountains glyph

### Requirement: Floating controls use the platform material

Controls that float over content SHALL use Liquid Glass on iOS, the system's own material and never
a blur imitation, and on Android and web a brand-colored surface with a shadow. Glass SHALL stay on
the control layer: content stays opaque and glass never sits on glass. The system's Reduce
Transparency and Increase Contrast settings SHALL apply to the glass.

#### Scenario: Menu button on iOS

- **WHEN** the menu button floats over a tab on iOS
- **THEN** it is Liquid Glass and the content beneath shows through it

#### Scenario: Menu button on Android and web

- **WHEN** the menu button floats over a tab on Android or web
- **THEN** it is a brand blue button with a white glyph and a soft shadow

#### Scenario: Reduce Transparency

- **WHEN** Reduce Transparency is on in iOS settings
- **THEN** the glass controls turn opaque and stay readable

## MODIFIED Requirements

### Requirement: Two-tier token structure with overridable semantic layer

Design tokens SHALL be typed values in the app's theme module, in two tiers: a **primitive** tier
(the raw palette) and a **semantic** tier (color roles such as surface and primary) whose values
reference primitives. Spacing, radius, type, motion and sizes are scales used directly. App code
SHALL use semantic roles and scales; only the semantic tier SHALL read the palette. A theme (such as
dark mode) SHALL be expressible by reassigning the semantic tier alone.

#### Scenario: Semantic token resolves through a primitive

- **WHEN** a component uses the surface role
- **THEN** its value comes from a primitive palette color, not a literal in the component

#### Scenario: Alternate theme overrides only the semantic tier

- **WHEN** a theme is added
- **THEN** it can be expressed by reassigning semantic roles to different primitives
- **AND** no component or palette primitive needs to change

#### Scenario: Restructuring preserves values

- **WHEN** the tokens moved from the Vue app's CSS into the app's theme module
- **THEN** every semantic role the app defines kept the value it had in the Vue app

## REMOVED Requirements

### Requirement: Blueish-grey color palette tokens

**Reason**: Described CSS custom properties and an outdated primary color (`#475569`; the Vue app
had already moved to blue `#2563eb`). **Migration**: "Brand color roles" defines the roles and
their contrast; the values stay those of the Vue app's `tokens.css`.

### Requirement: Inter font typography

**Reason**: Native apps follow each platform's type (D11): iOS uses the system font, so Inter
everywhere no longer holds. **Migration**: "Platform typography".

### Requirement: Material Symbols icon font

**Reason**: iOS uses SF Symbols (D11); the Vue requirement assumed one SVG set for every target.
**Migration**: "Platform icons" covers the registry and first-frame rendering; "Activity types have
their own glyphs" keeps the custom glyph scenarios unchanged.

### Requirement: Glassmorphism utility styles

**Reason**: Described a CSS blur imitation. iOS now uses the system's Liquid Glass (M2 in #346).
**Migration**: "Floating controls use the platform material".
