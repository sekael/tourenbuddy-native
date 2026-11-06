## Purpose

Shared visual language: design tokens (spacing, radius, shadows, colors), typography, iconography, and base component styling.

## Requirements

### Requirement: Blueish-grey color palette tokens

The system SHALL define CSS custom properties for a blueish-grey (slate) color palette in `tokens.css`. The palette SHALL include primary (#475569), primary-light (#64748b), primary-dark (#334155), surface (#f8fafc), on-surface (#0f172a), surface-variant (#e2e8f0), background (#ffffff), outline (#94a3b8), outline-variant (#cbd5e1), error (#dc2626), error-container (#fef2f2), and corresponding on-\* text colors. An accent color (#3b82f6) SHALL be added for interactive highlights.

#### Scenario: Color tokens are available

- **WHEN** any component references `var(--color-primary)`
- **THEN** it resolves to the slate blue value `#475569`

#### Scenario: Accent color is available

- **WHEN** a component references `var(--color-accent)`
- **THEN** it resolves to `#3b82f6`

### Requirement: Inter font typography

The system SHALL bundle the Inter font (weights 400, 500, 600) as self-hosted assets, precached by the service worker, with no dependency on an external font CDN. The `--font-family-base` token SHALL use `'Inter'` as the primary font with system fonts as fallback. Heading weights SHALL use `--font-weight-medium` (500) instead of bold (700) for a sleeker appearance.

#### Scenario: Inter font loads from bundle

- **WHEN** the app loads
- **THEN** text renders in the Inter font family served from the app's own bundle, without any request to a third-party font origin

#### Scenario: Inter available offline

- **WHEN** the app is opened offline
- **THEN** text still renders in Inter from the precached font assets

#### Scenario: Font fallback

- **WHEN** the bundled Inter font fails to load for any reason
- **THEN** text falls back to the system font stack

### Requirement: Material Symbols icon font

The system SHALL render icons as bundled SVGs (using the Material Symbols Outlined glyph set), tree-shaken at build time, with no dependency on an external font CDN. Where the Material set has no glyph for a needed subject, the app SHALL use its own SVG glyph instead of a loosely related Material one, drawn to the same grid and stroke weight and bundled the same way. Icons SHALL be rendered through a shared `Icon` component that exposes the glyph name and token-driven sizing, backed by a central icon registry that maps each icon name to its SVG. An icon's rendered box SHALL be independent of any text content, so that font-load state, network conditions, or a missing asset can never let icon markup affect the layout of a containing element.

#### Scenario: Icon renders via the component

- **WHEN** a component renders `<Icon name="map" />`
- **THEN** the map icon renders as an inline SVG vector with the standard size

#### Scenario: Icon sizing is token-driven

- **WHEN** an `Icon` is rendered at a given size
- **THEN** its dimensions derive from design tokens rather than per-instance literal font sizes

#### Scenario: Dynamically named icon resolves

- **WHEN** a component passes an icon name chosen at runtime (e.g. from the tour-type lookup or a prop)
- **THEN** the shared component resolves it through the icon registry and renders the corresponding SVG

#### Scenario: Fixed-position icon bar keeps its intrinsic width at app start

- **WHEN** the tour action-bar pill mounts at app start under any network condition (slow, offline, cold PWA)
- **THEN** the pill sizes to its content (label + fixed-size icon boxes) and does not span the full viewport width, because the SVG icons have no text content that could widen it

#### Scenario: Ski-touring types have their own glyphs

- **WHEN** a ski tour or a splitboard tour is shown anywhere the tour type icon appears (type picker, tour list, tour detail, calendar)
- **THEN** a ski tour SHALL show an uphill skier on skins and a splitboard tour a matching uphill splitboarder
- **AND** neither SHALL show the walking/hiking glyph
- **AND** both SHALL render offline, without any network request

#### Scenario: Equipment reads as gear by its icon

- **WHEN** a tour with equipment is shown in the detail view
- **THEN** the equipment row SHALL lead with an ice axe glyph, a subject the Material set lacks
- **AND** it SHALL NOT use a generic backpack, box or tools glyph

#### Scenario: Climbing and mountaineering types have their own glyphs

- **WHEN** a climbing, a mountaineering or a ski-mountaineering tour is shown anywhere the tour type icon appears
- **THEN** a climbing tour SHALL show a climber on a rock overhang, a mountaineering tour a figure scrambling up a rock step, and a ski-mountaineering tour that figure with skis strapped to its pack
- **AND** the three SHALL differ from each other and from the hiking and ski-touring glyphs, and none SHALL show a generic landscape or mountains glyph

### Requirement: Layered shadow tokens

The system SHALL define CSS custom properties for layered soft shadows: `--shadow-sm`, `--shadow-md`, and `--shadow-lg`. Shadows SHALL use multiple layers for a natural depth effect.

#### Scenario: Shadow tokens are available

- **WHEN** a component references `var(--shadow-md)`
- **THEN** it resolves to a multi-layer shadow value

### Requirement: Glassmorphism utility styles

The system SHALL define one shared glass surface for map overlays — a semi-transparent brand fill with `backdrop-filter: blur()`, a hairline border, and a medium shadow — applied through a single shared class. Every control floating over the map SHALL use it, and it SHALL only be applied to map overlay components.

#### Scenario: Glass effect on map controls

- **WHEN** a map overlay component uses the glass style
- **THEN** the background is semi-transparent with a blur effect behind it, identical to every other map control

### Requirement: Button styling conventions

The system SHALL provide a shared `Button` component as the standard way to render interactive action buttons (those with a text label). The component SHALL support **variants** (primary, primary-outline, secondary, danger, danger-outline, and text) and **sizes** (at minimum: small, medium, large), all driven by design tokens. Primary and danger buttons SHALL be filled (white text) with pill corners and a soft glow in their own hue. Secondary and primary-outline buttons SHALL be tonal (the control-container fill, no border); danger-outline SHALL be tonal red. Text buttons SHALL be borderless and transparent for low-emphasis actions. Every variant SHALL scale by the press-scale token while pressed. Button dimensions, padding, radius, and interaction feedback SHALL come from tokens, not per-instance literals. Full width is a layout concern handled at the call site (no `fullWidth` prop). Icon-only buttons are handled by `IconButton`; tabs and segmented switches share one global segmented-control rule.

#### Scenario: Primary button styling

- **WHEN** a primary `Button` is rendered
- **THEN** it has the primary background color, white text, pill corners, and a soft primary-tinted glow

#### Scenario: Variant and size are selectable

- **WHEN** a consumer renders `Button` with a chosen variant and size prop
- **THEN** the rendered button reflects the corresponding token-driven styling

#### Scenario: Ghost button styling

- **WHEN** a secondary (formerly ghost), primary-outline, or danger-outline `Button` is rendered
- **THEN** it is tonal: a tinted container fill, no outline border, and a label of at least 4.5:1 on the fill and on its hover fill

#### Scenario: Text button styling

- **WHEN** a `text` `Button` is rendered
- **THEN** it has a transparent background and no border (borderless, low-emphasis)

#### Scenario: Press feedback

- **WHEN** an enabled `Button` is pressed
- **THEN** it scales by the press-scale token

### Requirement: Input field styling conventions

Input fields SHALL have a clean border style with `--color-outline-variant` border, 8px border-radius, and a smooth focus transition that highlights the border in `--color-primary`.

#### Scenario: Input focus transition

- **WHEN** an input field receives focus
- **THEN** the border color transitions smoothly to `--color-primary`

### Requirement: Consistent modal bottom sheet contract

Overlay components (for example `FeedbackSheet`, `UserProfileSheet`, `ContactsListSheet`, `TourListSheet`, `TourInfoSheet`, the inbox) SHALL NOT own their visibility and SHALL NOT take an `open` prop: the parent page mounts at most one of them at a time through its single-active overlay state and unmounts it when the component emits `close`. Each SHALL render through a shared container — `AdaptiveOverlay` (bottom sheet below 600px, dialog window from 600px, optionally a full-screen page for data entry on mobile) or `SideDrawer` — so dismissal affordances behave the same everywhere.

#### Scenario: Sheet emits close on dismiss

- **WHEN** the user triggers a dismiss action (close button, backdrop or map-background click, or Escape)
- **THEN** the overlay component SHALL emit `close`
- **AND** the parent SHALL clear its active-overlay state, unmounting the component

#### Scenario: Opening one overlay closes the other

- **WHEN** an overlay is open and the parent activates a different one
- **THEN** the first overlay SHALL unmount before the second mounts

#### Scenario: Container follows the viewport

- **WHEN** the same overlay opens below 600px and from 600px
- **THEN** it SHALL render as a bottom sheet and as a dialog window respectively, with the same content and `close` contract

### Requirement: Full-viewport page root contract

Every routed page's root element SHALL size to the largest viewport (`min-height: 100lvh`, with `min-height: -webkit-fill-available` as a fallback for older iOS; fixed full-screen pages MAY use `height` instead of `min-height`) and SHALL own its visible background, so its `background-color` or full-bleed canvas/image fills the safe-area zones (box reaches the physical viewport edges, padding insets the content). The `body` element SHALL have `background: transparent` so the page root's background is what fills the safe-area zones. Safe-area insets on page roots and their inner content SHALL be sourced via the `var(--safe-*)` tokens, not inline `env(safe-area-inset-*)`. Inner content containers (headings, primary actions) SHALL be offset from the notch via `var(--safe-top)`; pages with a full-bleed hero/image/canvas SHALL let the full-bleed layer reach the physical edges and apply `var(--safe-*)` only to interactive/content chrome.

#### Scenario: Page root fills the viewport

- **WHEN** any routed page mounts
- **THEN** its root element occupies at least the full large-viewport height and its background paints the full viewport width including under safe-area insets

#### Scenario: Inner content respects the notch

- **WHEN** a page's content contains a primary heading or CTA near the top
- **THEN** that element is offset by at least `var(--safe-top)` from the physical top edge

#### Scenario: Full-bleed layer draws under safe areas

- **WHEN** a page with a full-bleed hero image or map canvas mounts in standalone PWA
- **THEN** the full-bleed layer reaches the physical edges while text/content/interactive chrome is offset by `var(--safe-*)` as needed

#### Scenario: Body is transparent

- **WHEN** any page is mounted
- **THEN** computed `background-color` on `body` resolves to `transparent` (or `rgba(0,0,0,0)`)

### Requirement: Safe-area handling lives on interactive overlays

The design system SHALL prescribe that the bottom safe-area inset is applied — via `var(--safe-bottom)` — to interactive overlay components (action bars, FABs, sheet handles, bottom navigation), NOT to full-bleed background layers (page roots, map canvas, hero images).

#### Scenario: Map canvas reaches the edge

- **WHEN** the map view renders
- **THEN** the MapLibre canvas extends to the bottom edge of the viewport with no padding for the home indicator

#### Scenario: Map action overlay is inset

- **WHEN** the map action bar renders on a device with a non-zero bottom safe-area inset
- **THEN** the action bar's bottom edge is offset from the viewport bottom by at least `var(--safe-bottom)`

### Requirement: Safe-area insets are consumed via tokens

Application code SHALL reference safe-area insets through the semantic tokens `var(--safe-top)`, `var(--safe-right)`, `var(--safe-bottom)`, and `var(--safe-left)`. Raw `env(safe-area-inset-*)` SHALL appear in exactly one place — `src/app/theme/safe-area.css`, where the tokens are defined — so a future floor (e.g. `max(env(...), 8px)`) can be introduced in one location. No component, page, or other theme file SHALL call `env(safe-area-inset-*)` inline.

#### Scenario: Component sources a bottom inset

- **WHEN** an overlay component needs to clear the bottom safe-area
- **THEN** its CSS references `var(--safe-bottom)`, not `env(safe-area-inset-bottom)`

#### Scenario: Tokens are the only env() site

- **WHEN** the codebase is grepped for `env(safe-area-inset` under `src/`
- **THEN** the only matches are the four token definitions in `src/app/theme/safe-area.css`

### Requirement: Two-tier token structure with overridable semantic layer

Design tokens SHALL be authored directly in CSS (`tokens.css`/`typography.css`) and organized in two tiers: a **primitive** tier (raw palette ramps, spacing scale, radius scale, font sizes/weights/line-heights, raw shadows — context-free values) and a **semantic** tier (e.g. `--color-surface`, `--color-on-surface`, `--color-primary`) whose values reference primitive tokens via `var()`. Application code SHALL reference semantic tokens; primitive palette colors SHALL be referenced only by semantic tokens. An alternate theme (e.g. dark mode) SHALL be expressible by overriding the semantic tier alone.

#### Scenario: Semantic token resolves through a primitive

- **WHEN** a component uses `var(--color-surface)`
- **THEN** the semantic token resolves to a value defined by a primitive palette token, not a raw literal in the component

#### Scenario: Alternate theme overrides only the semantic tier

- **WHEN** a theme is added
- **THEN** it can be expressed by reassigning semantic tokens to different primitives
- **AND** no component or palette primitive needs to change

#### Scenario: Restructuring preserves values

- **WHEN** the tokens are restructured into two tiers
- **THEN** the resolved value of each existing semantic token is unchanged from before

### Requirement: Runtime CSS functions are not design tokens

Runtime/contextual CSS functions such as `env(safe-area-inset-*)` SHALL NOT live in the token files (`tokens.css`/`typography.css`). They SHALL be defined as hand-written custom properties in a dedicated global-scope theme file (`safe-area.css`), imported by `global.css`. The token files SHALL contain only static design values.

#### Scenario: Safe-area vars live in a global-scope theme file

- **WHEN** the theme files are inspected
- **THEN** `--safe-top`/`--safe-bottom`/`--safe-left`/`--safe-right` are defined in `safe-area.css` (imported by `global.css`), not in `tokens.css`
- **AND** `tokens.css` contains only static value tokens

### Requirement: Documented design-language source of truth

The repository SHALL contain a root `DESIGN.md` documenting the design language: palette, spacing/radius/font scales, shadows, typography, component anatomy, and usage rules. `DESIGN.md` SHALL describe structure, rules, and rationale and reference `tokens.css` as canonical for exact values rather than maintaining a second copy of every value. `DESIGN.md` SHALL state that any design work based on it must be supplemented with up-to-date screenshots captured at time of use (no screenshots are stored in the repo by this change).

#### Scenario: Design language is documented

- **WHEN** a contributor or design session needs the app's design language
- **THEN** `DESIGN.md` provides the palette, scales, typography, component anatomy, and usage rules
- **AND** it directs the reader to capture current screenshots at time of use

#### Scenario: No duplicated value source

- **WHEN** an exact token value is needed
- **THEN** `DESIGN.md` points to `tokens.css` as canonical rather than restating every value

### Requirement: Application components consume tokens and shared components

Application components SHALL reference design tokens (`var(--*)`) and shared base components instead of hardcoded values. Hardcoded color hex literals, literal `font-size` values, and literal `border-radius` values SHALL NOT appear in feature/page component styles where a corresponding token exists. Interactive action buttons SHALL use the shared `Button` component, icon-only buttons SHALL use the shared `IconButton` component, and icon glyphs SHALL use the shared `Icon` component. Tabs and segmented toggles, which are single-usage today, SHALL be styled from design tokens in place (not componentized in this change) and flagged in `DESIGN.md` for extraction at second usage.

#### Scenario: No hardcoded color in a migrated component

- **WHEN** a migrated component's styles are inspected
- **THEN** colors, font sizes, and radii are expressed via `var(--*)` tokens, not raw literals

#### Scenario: Buttons use the shared component

- **WHEN** a migrated component renders an interactive action button
- **THEN** it uses the `Button` component rather than a bespoke styled `<button>` element

#### Scenario: Icon-only buttons use the shared component

- **WHEN** a migrated component renders an icon-only button (e.g. close, back, dismiss)
- **THEN** it uses the `IconButton` component rather than a bespoke styled `<button>` element

### Requirement: Shared icon-only button component

The system SHALL provide a shared `IconButton` component for inline icon-only buttons (close, back, dismiss, inline icon actions). It SHALL render a single `Icon`, expose token-driven sizing, and forward native button attributes including `disabled` and an accessible label (`aria-label` on every viewport; `title` in desktop view only). Its corner shape SHALL be prop/token-driven (default round; a square option available). It SHALL offer a **tonal** variant on the control container, which every close and back button in sheets, dialogs, drawers, and pages SHALL use; other inline icon actions stay transparent.

#### Scenario: Icon-only button renders accessibly

- **WHEN** an `IconButton` is rendered with an icon name and an accessible label
- **THEN** it shows the icon glyph at a token-driven size, with a prop/token-driven corner shape (default round), and exposes the label to assistive tech

#### Scenario: Disabled icon-only button blocks interaction

- **WHEN** an `IconButton` is `disabled`
- **THEN** it does not emit a click

#### Scenario: Tonal navigation chrome

- **WHEN** a sheet, dialog, drawer, or page shows a close or back button
- **THEN** it is a tonal `IconButton` that darkens on hover

### Requirement: Documented exceptions to shared button components

The shared `Button` and `IconButton` components are the default for interactive controls. The system SHALL nonetheless permit the following controls to remain bespoke because they fill a **role** the shared components do not model. Each exception below is intentional and SHALL be treated as conformant; controls NOT listed here SHALL use the shared components.

- **Map overlay controls** — the speed-dial trigger and its entries (`speed-dial-trigger`, `speed-dial-item`, used by `map-speed-dial-menu`), the map layers panel's preview tiles (`layer-tile`, in `map-layers-panel`), and the compass-reset FAB (`map-action-overlay`). These are floating map overlays wearing the shared glass surface rather than the on-surface `Button`/`IconButton` palette so they stay legible over busy map tiles. They differ by role, not by accident. (The location picker's and region drawing's Cancel and Continue actions read fine as shared `Button`s, so they are **not** exempt.)
- **Persistent tour action bar** — `tour-action-bar` is a segmented pill overlay defined by its own capability spec (see `tour-action-bar`); it is not a `Button`/`IconButton` consumer.
- **Media tiles & viewer controls** — the icon controls and white-on-scrim colors in `tour-attachment-viewer` sit over arbitrary dark media and require overlay-specific contrast; the attachment thumbnail tiles (`tour-attachments-strip`) are image/PDF previews, not labelled actions. Both are media affordances, not `Button`/`IconButton` consumers.
- **Selector / toggle controls** — controls whose role is selection state rather than a discrete action MAY remain bespoke; they are not action buttons. Examples: the primary-phone star (`contact-form`, `contact-detail-view`), the add-method phone/email type selector (`contact-detail-view`), the language selector (`profile-overview`, a segmented control), the tour completion / visibility toggles (`tour-info-sheet`), and the multi-select filter chips (`tour-form`, `tour-filters-panel`).
- **Chips & compact pills** — pill-shaped labels (`contact-chip`, the linked-tour pills and `full-row` navigation list in `linked-with-section`, the friend-partner chips in `tour-info-sheet`) are a distinct compact affordance the design system does not yet model as a base component. They are styled from the shared chip tokens in place and SHALL be extracted into a shared `Chip` component at the next demand rather than forced into `Button` (which would make them read as rectangular buttons).
- **Settings rows** — the identity card and the setting rows in `profile-overview` are full-width navigation list items (icon, label over current value, chevron) on the card tint, not labelled actions; making them `Button`s would turn a list into a stack of buttons.
- **Snackbar inline dismiss** — `error-snackbar`'s dismiss is rendered against the snackbar's own colored surface and stays bespoke.

#### Scenario: Map overlay control stays bespoke

- **WHEN** a floating map overlay control (speed dial, base-map options, compass) is rendered
- **THEN** it uses the shared glass surface and is exempt from the `Button`/`IconButton` requirement

#### Scenario: New control defaults to a shared component

- **WHEN** a new interactive control is added that is not a documented exception above
- **THEN** it uses `Button` (with a text label) or `IconButton` (icon-only)

### Requirement: Modern visual design language

The app SHALL use one visual design: a blue brand primary with brand-tinted surface variants, generous corner radii, pill-shaped action buttons, soft brand-tinted shadows, calm motion, and press-down feedback on every shared button, FAB, and map control. There SHALL be no runtime switch between designs. Text on the primary color SHALL meet WCAG AA contrast (≥ 4.5:1).

#### Scenario: Brand primary

- **WHEN** a primary `Button` is rendered
- **THEN** it has a blue background, white text with at least 4.5:1 contrast, and fully rounded (pill) corners

#### Scenario: Tactile press feedback

- **WHEN** the user presses a shared button, FAB, or map control
- **THEN** the control scales down slightly while pressed and returns when released

#### Scenario: No design switcher

- **WHEN** the profile sheet is opened
- **THEN** it offers no design or theme choice

### Requirement: Element styling is consistent across the app

Each recurring UI element SHALL have exactly one treatment wherever it appears: action buttons (by variant), overlay chrome (sheet, dialog, drawer, full-screen page), section headings, field labels, text inputs, selectable chips/options, tabs and segmented switches, and dividers. The treatment SHALL come from shared component tokens or a shared global rule used by every instance of that element.

#### Scenario: One selected-chip style

- **WHEN** a tour-type chip, a tour filter chip, and a contact chip are each selected
- **THEN** all three show the same pill shape, tinted fill, border, and text color

#### Scenario: One section-heading style

- **WHEN** the profile sheet, contact detail view, tour form, and friend requests sheet render section headings and field labels
- **THEN** all headings share the same size, weight, sentence case, letter-spacing, and color

#### Scenario: Overlay chrome matches across overlay types

- **WHEN** a bottom sheet, a dialog, a side drawer, a full-screen page, and the calendar page are opened
- **THEN** their titles share one size and tracking, their close/back buttons share one tonal style, and none shows a header divider line

#### Scenario: One tab style

- **WHEN** the tours tabs, the friend-request tabs, a help tab row, the tour-filter status switch, and the profile language switch are shown
- **THEN** all render as the same segmented control: tonal track, equal-width options, and a white pill under the selected option

#### Scenario: Input focus is visible

- **WHEN** a text input receives focus
- **THEN** it shows a primary-colored border and a surrounding focus ring

### Requirement: Tonal controls stand out from their surface

Secondary actions and navigation chrome SHALL be tonal: a filled control container one step stronger than the tinted surface used for cards and hovered rows, with a label of at least 4.5:1 on the fill and on its hover fill. Secondary and primary-outline `Button`s, close/back `IconButton`s, tab tracks, and navigation indicators SHALL use it, so they separate visibly from a white sheet, from a tinted card, and — with an added shadow — from the map. Danger-outline `Button`s SHALL take the same tonal treatment in red (the error container with the error-text label).

#### Scenario: Secondary button on a sheet

- **WHEN** a secondary `Button` is rendered on a white sheet or inside a tinted card
- **THEN** its fill is visibly distinct from the surface behind it and its label reads at ≥ 4.5:1

#### Scenario: Secondary button over the map

- **WHEN** the location picker or region drawing shows its Cancel action over the map
- **THEN** it is the shared tonal `Button` with a shadow that lifts it off the terrain

#### Scenario: Toggle at rest

- **WHEN** a tour's completion and visibility toggles are in their default state (not completed, visible to friends)
- **THEN** both use the tonal container; only a completed or private state takes its own tint

### Requirement: Expanding map menus are consistent

Every menu that expands from a map control (the speed-dial menu and the base-map options) SHALL render each entry as the same glass pill holding its label and icon. Speed-dial entries SHALL rise from the trigger one after another, nearest first, with their icons aligned on the trigger's axis. Opening the base-map options SHALL keep the speed-dial menu open but inert and dimmed, with "Change base map" highlighted, and the options SHALL slide out beside that item. A tap outside the options (including on a dimmed item) or choosing an option SHALL close the whole menu with a single fade. In landscape on short screens the speed-dial entries SHALL become icon-only circles on a quarter-circle arc around the trigger that never overlap each other or the trigger, and the base-map options SHALL keep their labels and clear the arc.

#### Scenario: Opening the speed dial

- **WHEN** the user taps the menu trigger
- **THEN** each entry appears as a glass pill (label, then icon) and the entries rise into place one after another, nearest the trigger first

#### Scenario: Base-map options unfold beside their item

- **WHEN** the user taps "Change base map" in the open menu
- **THEN** the menu stays in place with its other items dimmed and unresponsive, and the options (same pill as a menu entry, current base map checked with a darker fill and a check icon) slide out beside "Change base map" with focus on the checked one

#### Scenario: Leaving the base-map options

- **WHEN** the base-map options are open and the user taps a dimmed menu item, taps the map, or chooses a base map
- **THEN** the options and the whole menu close together in one fade, and the dimmed item's action is not triggered

#### Scenario: Landscape arc

- **WHEN** the speed dial opens in landscape on a short screen
- **THEN** all entries sit on an arc around the trigger without overlapping each other or the trigger, and base-map options opened from the arc do not overlap any arc entry

### Requirement: Navigation and tab changes animate smoothly

Switching tabs SHALL glide the selected-tab pill to the chosen tab and move the tab content in the same direction; replacing one sheet with another SHALL cross-fade with a short lift instead of sliding the first sheet off-screen and the second back up; moving between views inside a sheet SHALL slide forward or back.

#### Scenario: Switching own and friend tours

- **WHEN** the user switches from My Tours to Friends
- **THEN** the selected-tab pill glides to Friends and the list slides out toward the left while the friend list slides in from the right

#### Scenario: Opening a tour from the tour list

- **WHEN** the user taps a tour in the tour list
- **THEN** the list sheet fades out and the tour sheet fades in with a short lift, without either sheet leaving the screen

#### Scenario: Reduced motion

- **WHEN** the operating system requests reduced motion
- **THEN** nothing overshoots and swaps become plain fades without travel

### Requirement: Views carry no redundant chrome or dead space

Every overlay view SHALL have exactly one header row holding its title, back, actions, and close. List rows SHALL show the information users scan for: tour rows SHALL show the planned date when one is set. Equivalent primary actions in page headers SHALL share one size. Scrolling content above a sheet footer SHALL fade out under it rather than being cut off at its edge.

#### Scenario: Contact detail has one header

- **WHEN** the user opens a contact from the contacts list
- **THEN** a single header shows back, the contact's name, and close, with no second header row inside the view (Edit sits in the footer)

#### Scenario: Tour rows show the date

- **WHEN** a tour with a planned date is listed
- **THEN** its row shows the date (with the year only when it is not the current year) next to any partner names

#### Scenario: Undated tours stay compact

- **WHEN** a tour has neither a planned date nor partners
- **THEN** its row is a single line

#### Scenario: Content under a footer

- **WHEN** a sheet with footer actions has more content than fits
- **THEN** the content fades out just above the footer instead of ending in a hard cut

### Requirement: Settings are readable at a glance

The profile SHALL open on an overview that fits a phone screen without scrolling and shows, without further taps, the user's name, email and phone status, the current language, a summary of each settings section's state, and the sign-out action. Each section SHALL be reachable with one tap and SHALL open as its own view with a way back. The profile and its sections SHALL use only primary and secondary buttons.

#### Scenario: Overview on a phone

- **WHEN** the user opens the profile on a 360×780 phone in German
- **THEN** identity, language, notification and calendar-sync state and Sign out are all visible without scrolling, and no label overlaps its value

#### Scenario: State that needs attention

- **WHEN** the phone number is unverified, or a connected calendar failed to sync
- **THEN** the overview says so ("Not verified", "Sync problem") in error colors that meet AA contrast

#### Scenario: Changing a setting

- **WHEN** the user taps Notifications or Calendar sync
- **THEN** that section opens as its own view (a full-screen page on mobile, the same dialog on desktop) with a back control that returns to the overview

#### Scenario: No text buttons

- **WHEN** any profile view is shown, including calendar sync and phone verification
- **THEN** every labelled button is a primary or secondary button

### Requirement: Map controls are legible and stand out from the map

Floating map controls (menu trigger and items, compass, action bar, base-map options) SHALL share one glass surface and render their labels and icons with at least 4.5:1 contrast against it, including the surface's translucency over a white map, and SHALL remain visually separated from the map background. The guided-tour banner SHALL use the same map-control blue as an opaque surface. Indicators on a control (notification dot, count badge) SHALL contrast with the control.

#### Scenario: Labels over a bright map

- **WHEN** the speed-dial menu is open over a white map area
- **THEN** every item label reads at ≥ 4.5:1 and the controls are distinct from the map

#### Scenario: Guided-tour finish button

- **WHEN** the guided tour banner is shown
- **THEN** the "finish tour" label reads at ≥ 4.5:1 against the button behind it

### Requirement: Text meets WCAG AA contrast

All text SHALL meet WCAG 2.2 AA contrast (4.5:1, or 3:1 for large text), including text on tinted fills and their hover fills, success, warning, and error messages, hints, and status badges. Form controls — toggle switches included — SHALL have accessible names, and links SHALL be distinguishable from surrounding text by more than color.

#### Scenario: Status text on a tint

- **WHEN** a completed tour's completion toggle is shown (success text on a success tint or hover fill)
- **THEN** its label reads at ≥ 4.5:1

#### Scenario: Toggle switches are named

- **WHEN** the notification preferences are shown
- **THEN** every switch exposes the name of the setting it controls

#### Scenario: Automated audit

- **WHEN** an axe-core WCAG 2.2 A/AA audit runs on the main screens
- **THEN** it reports no violations

### Requirement: No unnecessary motion

Interface changes SHALL move only what the user acted on. A desktop dialog SHALL always be as tall as its current content (up to the screen, beyond which the content scrolls), SHALL keep its header in place, and SHALL glide to the new height whenever its content changes — growing or shrinking. Options opened from a menu item SHALL appear at that item rather than after the menu collapses into its trigger. Controls SHALL NOT lift or scale on hover.

#### Scenario: Friend requests and blocked users on desktop

- **WHEN** the user switches between the friend-requests and blocked tabs in the desktop dialog
- **THEN** the dialog glides to the new tab's height while its title and close button stay where they are

#### Scenario: Dialog fits its content on desktop

- **WHEN** the user opens the profile on desktop
- **THEN** the dialog is as tall as the overview needs, with no empty band below it

#### Scenario: Fully extended dialog is balanced

- **WHEN** a desktop dialog's content is taller than the screen allows
- **THEN** the dialog stops with the same margin below it as above it, and its content scrolls

#### Scenario: Views of different size

- **WHEN** the user opens Calendar sync from the profile on desktop and then goes back
- **THEN** the dialog glides taller (capped at the screen, content scrolling beyond) and glides back to the overview's height, its header never moving

#### Scenario: Changing the base map

- **WHEN** the user taps "Change base map" in the open menu
- **THEN** the base-map options appear beside that item while the other items dim in place, without the menu collapsing first

### Requirement: Motion and interaction tokens

The system SHALL define motion tokens (durations, easing curves, a glide offset, and a stagger delay) and a press-scale token in the semantic tier. Every state transition and entrance animation in the app — shared buttons, FABs, map controls, menus, sheets, dialogs, drawers, snackbars, tabs, and view swaps — SHALL take its duration, easing, travel, stagger, and press scale from these tokens rather than literals. Continuous loading indicators (spinners, skeleton pulses) are exempt. When the user prefers reduced motion, overshooting easing, press scaling, and glide travel SHALL be disabled.

#### Scenario: Motion is retuned in one place

- **WHEN** an easing or duration token changes
- **THEN** sheet, dialog, menu, and snackbar animations use the new value without component changes

#### Scenario: Reduced motion

- **WHEN** the operating system requests reduced motion
- **THEN** no overshooting ("spring") easing is used, pressed controls do not scale, and swaps and menus fade without travel

### Requirement: Design tokens are always defined

Every custom property referenced without a fallback SHALL be defined — in a theme file, a component's own styles, or an inline style binding — so no element silently loses a style to an undefined token. An automated test SHALL enforce this.

#### Scenario: Typo in a token name

- **WHEN** a component references a custom property that nothing defines
- **THEN** the token test fails and names the file and property

### Requirement: PWA theme color matches the app background

The browser/PWA theme color declared in the HTML document and in the web app manifest SHALL equal the app background color, so the browser chrome and task switcher never show a color absent from the app.

#### Scenario: Installed PWA chrome

- **WHEN** the installed PWA is shown in the OS task switcher or with a colored title bar
- **THEN** the chrome color is the app background color, not a legacy brand color

### Requirement: Touch feedback without sticky hover

Hover fills SHALL apply only on devices whose primary pointer can hover (`@media (hover: hover)`); the same fill SHALL show while the control is pressed (`:active`). The platform tap highlight SHALL be disabled and controls SHALL not wait for double-tap zoom.

#### Scenario: Tapping a list row on a phone

- **WHEN** the user taps a tour row on a touch device and lifts the finger
- **THEN** the row shows its tint while pressed and returns to rest after release, with no grey tap flash

### Requirement: Tooltips exist only in desktop view

Tooltips — the shared `BaseTooltip` bubble and native `title` hints on controls — SHALL render only in desktop view (viewport ≥600px, `useIsDesktop()`). In mobile view no tooltip bubble SHALL render, no `title` attribute SHALL be set, and the anchor SHALL carry no `aria-describedby` to a tooltip. Information a mobile user needs SHALL NOT live only in a tooltip; it SHALL be shown inline in mobile view. Accessible names (`aria-label`) SHALL be kept on every viewport.

#### Scenario: Touching a tooltip anchor on a phone

- **WHEN** the user taps or long-presses a control that has a tooltip in mobile view
- **THEN** no tooltip bubble or native title hint appears

#### Scenario: Hovering a tooltip anchor on desktop

- **WHEN** the user hovers a control that has a tooltip in desktop view
- **THEN** the tooltip appears as before

### Requirement: Floating toasts clear open sheets

Bottom-anchored toasts and status chips SHALL sit above the tallest open bottom sheet or, on a phone, the track-drawing panel (`--sheet-inset`), above the location picker's hint, search field and buttons (`--dock-inset`), and above the map's bottom control row while it shows (`--bar-inset`). They SHALL keep their usual position when none is up, glide along as a sheet rises or leaves, and share one spot: a new message replaces the one showing.

#### Scenario: Error while a sheet is open

- **WHEN** an error snackbar appears while the tour sheet is open on mobile
- **THEN** the snackbar sits above the sheet and none of the sheet's actions are covered

#### Scenario: Error while picking a point

- **WHEN** a ski route's details fail to load while the user picks a new tour's goal on a phone
- **THEN** the error sits above the picker's hint and buttons, legible and covering none of them

#### Scenario: Sync message on the plain map

- **WHEN** "1 change synced" appears on the map with nothing open
- **THEN** it sits just above the bottom bar, and "My tours", add-tour, the info and the menu button stay visible and tappable

#### Scenario: Sync message while drawing a track

- **WHEN** the connection returns while the user draws a track on a phone
- **THEN** the synced message sits just above the drawing panel, covering none of undo, redo, back to start or Done

### Requirement: Quitting the guided tour returns to the starting point

Finishing the guided tour early SHALL NOT open any further surface, even when it is finished while the tour is navigating to a step; the user SHALL be returned to the overlay that was open when the tour started (or the plain map).

#### Scenario: Finish while the tour opens the menu

- **WHEN** the user taps "Finish tour" while the tour is spotlighting the speed-dial on its way to the contacts step
- **THEN** neither the speed-dial menu nor the contacts sheet opens

#### Scenario: Tour started from the profile

- **WHEN** the user starts "Show app tour" from the profile sheet and finishes it early
- **THEN** the profile sheet is open again

### Requirement: Tour detail reads at a glance

The tour detail view SHALL open with a compact hero line led by the tour's goal: the activity badge, the goal elevation as the headline number, the planned date with the route numbers (climb, descent or flight, distance) beside it, the owner for friend tours, and the goal coordinates beneath; the tour name stays the sheet title. For the owner, the completion and visibility toggles SHALL stay a row of labelled buttons directly below the hero. Below the hero, facts SHALL render as dense icon-led rows without section headings and without per-fact cards, grouped by what belongs together and in this order: activity (type, seasons), route (start, end, GPX download), partners, free texts (description, equipment, notes), attachments, suggestions. A thin divider SHALL separate each group from the one above it, the hero and owner toggles counting as the first group; a group with nothing to show SHALL be omitted together with its divider. Start and end SHALL carry a short visible inline label ("Start", "End" — "Landing" when the way down is flown) because their icons alone are ambiguous; type, partners, seasons and the free texts SHALL be identified by their icon, and every row SHALL expose an accessible label. Rows for empty fields SHALL be omitted. The view SHALL be tinted with the tour's activity colour (the map marker colour): badge, row icons, season chips and partner avatars. A completed tour SHALL show a check stamp on the badge (and a "Completed" pill for friends viewing it); a private tour SHALL show a lock stamp. Partners SHALL render as avatar pills.

#### Scenario: Reading a tour on a phone

- **WHEN** the user opens a tour with an elevation, start point and description
- **THEN** the goal elevation is the most prominent number in the hero line, the start point is a single row labelled "Start" with its name and elevation, and the description is a row led by the description icon without a heading above it

#### Scenario: Activity type is a fact, not the headline

- **WHEN** the user opens a ski tour
- **THEN** the hero headline SHALL show the goal elevation, not the activity type
- **AND** "Ski Tour" SHALL appear as the first fact row with the ski-tour icon

#### Scenario: Owner toggles below the hero

- **WHEN** the owner opens their tour
- **THEN** completion and visibility SHALL be labelled toggle buttons in one row directly below the hero, each exposing a pressed state
- **AND** the hero line SHALL hold only the headline

#### Scenario: Long date range on a narrow phone

- **WHEN** a multi-day tour spanning two months is opened on a 360 px wide screen by its owner
- **THEN** the hero SHALL keep the badge and goal elevation on its first line
- **AND** the date range SHALL appear on the second line with abbreviated month names, together with the goal coordinates, wrapping there if needed

#### Scenario: Friend tour hero

- **WHEN** a user opens a friend's tour
- **THEN** no owner toggles SHALL be shown and the hero SHALL show the owner on a line beneath the date and coordinates

#### Scenario: Goal without elevation

- **WHEN** a tour's goal has no elevation
- **THEN** the hero line SHALL show no elevation number and no placeholder; the planned date SHALL move up to the first line, with the coordinates on the second line
- **AND** when there is no planned date either, the hero SHALL show the badge and the coordinates only

#### Scenario: Minimal tour stays short

- **WHEN** a tour has only a goal and an activity type
- **THEN** the view SHALL show the hero line, one divider and the type row only, with no empty headings, groups or gaps

#### Scenario: Related facts are grouped

- **WHEN** the user opens a tour with seasons, a start point, a GPX track, partners and notes
- **THEN** the seasons SHALL sit with the activity type, the GPX download with start and end, and the notes with the other free texts
- **AND** a divider SHALL separate each of these groups, and the partners, from the one above

#### Scenario: Route numbers in the opening height

- **WHEN** the user opens a hike & fly tour on a phone and the sheet rests at its opening height
- **THEN** the climb and the flight SHALL read in the hero beside the date, not in a fact row further down
