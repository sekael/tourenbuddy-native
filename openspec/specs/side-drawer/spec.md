## Purpose

Right-edge desktop panel (a bottom sheet on mobile) that hosts the tour list and tour detail beside the still-interactive map.

## Requirements

### Requirement: SideDrawer component renders as a right-edge panel

The `SideDrawer` component SHALL render as a panel anchored to the right edge of the viewport on desktop viewports (>=600px). On mobile viewports (<600px), the `SideDrawer` SHALL render as a bottom sheet using the existing `BottomSheet` component, preserving the mobile experience unchanged.

#### Scenario: Desktop drawer appearance

- **WHEN** the viewport width is at or above 600px
- **AND** a `SideDrawer` component is rendered
- **THEN** the drawer SHALL be anchored to the right edge of the viewport
- **AND** the drawer SHALL span the full viewport height
- **AND** the drawer SHALL have a fixed width of 400px
- **AND** the drawer SHALL have a left border for visual separation from the map

#### Scenario: Mobile fallback to bottom sheet

- **WHEN** the viewport width is below 600px
- **AND** a `SideDrawer` component is rendered
- **THEN** the component SHALL render using the `BottomSheet` component
- **AND** the mobile behavior SHALL be identical to a standard `BottomSheet`

### Requirement: SideDrawer slide-in animation

The `SideDrawer` SHALL animate in from the right edge on desktop with a horizontal slide transition.

#### Scenario: Desktop slide-in animation

- **WHEN** a `SideDrawer` enters the DOM on a viewport at or above 600px
- **THEN** it SHALL animate in with a `translateX(100%)` to `translateX(0)` slide-right-to-left transition
- **AND** when leaving, it SHALL animate out with a `translateX(0)` to `translateX(100%)` slide-left-to-right transition

#### Scenario: Mobile slide-up animation unchanged

- **WHEN** a `SideDrawer` enters the DOM on a viewport below 600px
- **THEN** it SHALL use the standard `BottomSheet` slide-up transition

### Requirement: SideDrawer API contract

The `SideDrawer` component SHALL accept `title?: string`, `ariaLabel?: string`, `collapsed?: boolean` and `backLabel?: string`, emit `close` and `back`, and provide a default slot for content plus optional `header-actions` and `footer` slots. When `backLabel` is set (desktop), the header SHALL show a back button labelled with it that emits `back`.

#### Scenario: Props and emits match BottomSheet

- **WHEN** a `SideDrawer` is instantiated
- **THEN** it SHALL accept `title?: string` and `ariaLabel?: string` props
- **AND** it SHALL emit `close` when the close button is clicked
- **AND** it SHALL provide a default slot for content

### Requirement: SideDrawer does not render a backdrop on desktop

On desktop, the `SideDrawer` SHALL NOT render a semi-transparent backdrop scrim because the drawer is designed to coexist with the visible map. The map background click mechanism in `map-page.vue` handles dismissal.

#### Scenario: No backdrop on desktop

- **WHEN** the viewport width is at or above 600px
- **AND** a `SideDrawer` is rendered
- **THEN** no backdrop or scrim element SHALL be displayed behind the drawer

#### Scenario: Dismiss via map background click

- **WHEN** a `SideDrawer` is open on desktop
- **AND** the user clicks on the map background outside the drawer
- **THEN** the parent page SHALL close the drawer via the existing map-background-click mechanism

### Requirement: SideDrawer supports a collapsed header-only mode

The `SideDrawer` component SHALL accept a `collapsed: boolean` prop. When `collapsed` is true, the drawer SHALL render only a compact header showing its `title` (for example, "Edit: Uri Rotstock") and SHALL hide its default slot, its close button, and any drag handle. Dismissal via map-background click, backdrop click, or the Escape key SHALL be suppressed while `collapsed` is true. When `collapsed` becomes false, the drawer SHALL restore its full body and dismissal affordances without losing any slot content state.

#### Scenario: Desktop collapsed header placement

- **WHEN** the viewport width is at or above 600px
- **AND** a `SideDrawer` is rendered with `collapsed: true` and `title: "Edit: Uri Rotstock"`
- **THEN** the drawer SHALL render as a compact header in the top-right corner showing the title
- **AND** the drawer SHALL NOT render its default slot content
- **AND** the drawer SHALL NOT render a close button
- **AND** clicking the map background SHALL NOT close the drawer

#### Scenario: Mobile collapsed bottom sheet

- **WHEN** the viewport width is below 600px
- **AND** a `SideDrawer` is rendered with `collapsed: true`
- **THEN** the underlying `BottomSheet` SHALL render only a title-only header
- **AND** the sheet SHALL NOT render a close button
- **AND** the sheet SHALL NOT render a drag handle
- **AND** clicking the backdrop or map background SHALL NOT close the sheet
- **AND** pressing Escape SHALL NOT close the sheet

#### Scenario: Slot state preserved across collapse toggle

- **WHEN** a `SideDrawer` is toggled from `collapsed: false` to `collapsed: true` and back to `collapsed: false`
- **THEN** the slot content SHALL remain mounted throughout
- **AND** any in-progress Vue state inside the slot (for example, form input values) SHALL be preserved

### Requirement: Drawer scroll region reserves scrollbar gutter

The scrollable content region of `SideDrawer` SHALL reserve space for the scrollbar so the scrollbar never overlaps content. Scrollbar SHALL render with a thin, app-consistent style.

#### Scenario: Drawer content overflows on desktop
- **WHEN** drawer content overflows in a browser that honors `scrollbar-gutter`
- **THEN** a scrollbar gutter SHALL be reserved on the inline-end side
- **AND** content SHALL NOT shift horizontally when the scrollbar appears or disappears

#### Scenario: Drawer content overflows on mobile
- **WHEN** drawer content overflows in a browser using overlay scrollbars
- **THEN** the overlay scrollbar SHALL sit over reserved right padding inside the content region and SHALL NOT overlap interactive controls

### Requirement: Drawer content scroll is contained

The scrollable content region of `SideDrawer` SHALL contain its scroll: when scrolled past
either end, the scroll SHALL NOT chain to any ancestor — not the page behind the drawer,
not the document, and not a map rendered beside or beneath it. The region's own
end-of-scroll affordance (rubber-band on platforms that provide one) SHALL be preserved.

Containment SHALL apply to the drawer's own scroll region only. It SHALL NOT affect input
directed at surfaces outside the drawer: while a drawer is open, the portion of the map
still visible SHALL remain fully interactive (see `map-integration`).

#### Scenario: Overscrolling the drawer does not move the page behind it

- **WHEN** the drawer content is scrolled to its top or bottom edge
- **AND** the user continues the scroll gesture in the same direction
- **THEN** no ancestor scroll container SHALL scroll
- **AND** the document scroll offset SHALL remain unchanged

#### Scenario: Map stays zoomable next to an open drawer

- **WHEN** a side drawer is open over part of the map
- **AND** the user scroll-wheels or pinches over the still-visible portion of the map
- **THEN** the map SHALL zoom
- **AND** the drawer's scroll position SHALL remain unchanged

### Requirement: Drawer content scrolls vertically only

The drawer's scrollable content region SHALL scroll on the vertical axis only, regardless
of child content width.

#### Scenario: Horizontal swipe over the drawer content does nothing

- **WHEN** the user swipes or drags horizontally within the drawer content region
- **THEN** the drawer content SHALL NOT scroll horizontally

### Requirement: Escape closes the drawer

On desktop, pressing Escape SHALL close an open, expanded side drawer exactly as its close button does, wherever keyboard focus is (a click on the map leaves focus on the map). Escape SHALL NOT close the drawer while focus is in a text field, select or editable region, while a dialog is open above the drawer, while the drawer is collapsed, or when a control inside (an open filter panel, menu, tooltip or stack list) has already used that keypress; the next Escape then closes the drawer.

#### Scenario: Escape after clicking the map

- **GIVEN** a tour's detail drawer is open and the user last clicked the map
- **WHEN** the user presses Escape
- **THEN** the drawer SHALL close

#### Scenario: Escape while typing

- **GIVEN** the tour list drawer is open with focus in its search field
- **WHEN** the user presses Escape
- **THEN** the drawer SHALL stay open

#### Scenario: Escape folds the filters first

- **GIVEN** the tour list drawer is open with its filters expanded and focus on a filter
- **WHEN** the user presses Escape twice
- **THEN** the first press SHALL fold the filters and the second SHALL close the drawer
