## Purpose

Overlay component that renders as a bottom sheet on mobile and a centered dialog on desktop based on viewport size.

## Requirements

### Requirement: Single active overlay at any time

At most one modal overlay SHALL be visible on the map page at any time. The overlay set includes: every `AdaptiveOverlay` consumer (feedback, user profile, contacts list), the tour-creation dialog, and the tour-info side drawer. Opening a new overlay SHALL automatically close the previously open overlay before the new overlay becomes visible.

#### Scenario: Opening a new bottom sheet closes the currently open bottom sheet

- **WHEN** the feedback overlay is open on a mobile viewport
- **AND** the user opens the contacts list overlay
- **THEN** the feedback overlay SHALL be removed from the DOM
- **AND** only the contacts list overlay SHALL be visible

#### Scenario: Opening a new dialog closes the currently open dialog on desktop

- **WHEN** the feedback overlay is open on a viewport at or above 600px
- **AND** the user opens the contacts list overlay
- **THEN** the feedback dialog SHALL be removed from the DOM
- **AND** only the contacts list dialog SHALL be visible

#### Scenario: Selecting a tour marker closes any open overlay

- **WHEN** any overlay (feedback, profile, contacts list, or tour-creation) is open
- **AND** the user clicks a tour marker on the map
- **THEN** the open overlay SHALL be removed from the DOM
- **AND** the tour info overlay SHALL be the only visible overlay

#### Scenario: Opening an overlay while a tour is selected deselects the tour

- **WHEN** the tour info overlay is visible (mobile bottom sheet or desktop side drawer)
- **AND** the user opens any other overlay (feedback, profile, contacts list, or tour-creation)
- **THEN** the tour info overlay SHALL be removed from the DOM
- **AND** the selected tour SHALL be cleared from application state
- **AND** only the newly opened overlay SHALL be visible

#### Scenario: Opening tour-creation closes any open overlay on desktop

- **WHEN** the feedback, profile, contacts list, or tour-info overlay is visible on a viewport at or above 600px
- **AND** the user initiates a new tour creation (picks a goal location)
- **THEN** the previously open overlay SHALL be removed from the DOM
- **AND** only the tour-creation dialog SHALL be visible

### Requirement: Adaptive overlay renders as a content-sized dialog on desktop

Overlays used for feedback, user profile, contacts list, friend requests, offline maps, and tour creation SHALL render as a `DialogWindow` on viewports at or above 600px and as a `BottomSheet` (or, in data-entry mode, a full-screen page) on viewports below 600px. On desktop the dialog SHALL be sized by its current content and hang from a fixed top inset (see `dialog-window`). The `TourInfoSheet` does not use this adaptive overlay — it continues to use the `SideDrawer` component which itself adapts between a `BottomSheet` (<600px) and a right-edge drawer (≥600px).

#### Scenario: Desktop dialog appearance

- **WHEN** the viewport width is at or above 600px
- **AND** one of the listed overlays is rendered
- **THEN** the overlay SHALL render as a `DialogWindow`, centered horizontally and hanging from the top inset, as tall as its content
- **AND** the overlay SHALL NOT be anchored to the bottom of the viewport
- **AND** no drag handle SHALL be displayed

#### Scenario: Desktop views of different height

- **WHEN** the user moves between views or tabs inside one of the listed overlays on desktop
- **THEN** the dialog SHALL glide to the new view's height while its header stays in place

#### Scenario: Desktop backdrop scrim

- **WHEN** the viewport width is at or above 600px
- **AND** one of the listed overlays is rendered
- **THEN** a full-screen semi-transparent backdrop (`var(--color-backdrop)`) with `backdrop-filter: blur(var(--overlay-backdrop-blur))` SHALL be displayed behind the dialog

#### Scenario: Desktop fade-scale animation

- **WHEN** one of the listed overlays enters the DOM on a viewport at or above 600px
- **THEN** its dialog card SHALL fade in with a short drop onto its top line and a subtle scale-up

#### Scenario: Mobile bottom sheet unchanged

- **WHEN** the viewport width is below 600px
- **AND** one of the listed overlays is rendered outside data-entry mode
- **THEN** the overlay SHALL render as a `BottomSheet` anchored to the bottom edge, with drag handle, using the existing slide-up animation

#### Scenario: TourInfoSheet uses SideDrawer on desktop

- **WHEN** the viewport width is at or above 600px
- **AND** a tour is selected
- **THEN** the `TourInfoSheet` SHALL render inside a `SideDrawer` instead of a `DialogWindow` or `BottomSheet`

### Requirement: Adaptive overlay defaults its mobile arm to fit-content

`AdaptiveOverlay` SHALL accept a `fitContent` prop that defaults to true and SHALL forward it to the `BottomSheet` it renders on viewports below 600px. This makes fit-content the default sizing for every overlay routed through `AdaptiveOverlay`, so their content is fully visible without a drag-up. A consumer MAY pass `:fit-content="false"` to opt back into snap behavior. On viewports at or above 600px (the `DialogWindow` arm) the prop SHALL have no effect, since the centered dialog already sizes to its content.

#### Scenario: Mobile arm defaults to fit-content

- **WHEN** an `AdaptiveOverlay` with no `fitContent` prop is rendered on a viewport below 600px
- **THEN** the underlying `BottomSheet` SHALL receive `fitContent: true`
- **AND** the sheet SHALL size to `min(content, 60vh)` rather than a snap point

#### Scenario: Consumer opts back into snap

- **WHEN** an `AdaptiveOverlay` is rendered on a viewport below 600px with `:fit-content="false"`
- **THEN** the underlying `BottomSheet` SHALL use the default snap behavior

#### Scenario: Desktop arm ignores fit-content

- **WHEN** an `AdaptiveOverlay` is rendered on a viewport at or above 600px
- **THEN** it SHALL render as a `DialogWindow` as before
- **AND** the `fitContent` prop SHALL not alter the dialog's appearance or sizing

### Requirement: Mobile sheets follow their content

On viewports below 600px a fit-content `BottomSheet` SHALL open at its content height, capped at 70% of the visible viewport, and SHALL glide to the new height whenever the content changes (view, tab or loaded data) in both directions. When the content needs more than the opening height the sheet SHALL show a drag handle and let the user expand it to the full content (capped at 90%) or drop it to peek; when the content fits, the sheet SHALL show no drag handle. A sheet the user dragged to peek SHALL stay at peek when content changes. Snap heights SHALL follow viewport changes (rotation, browser chrome). A fast flick SHALL move the sheet one snap in the flick direction.

#### Scenario: Content shrinks

- **WHEN** the user moves from a long view to a shorter one inside a mobile sheet
- **THEN** the sheet glides down to the shorter content's height, leaving no empty band

#### Scenario: Long list

- **WHEN** the contacts list is taller than 70% of the visible viewport
- **THEN** the sheet opens at 70% with a drag handle, and dragging up expands it to the full list (at most 90%), its content scrolling beyond

#### Scenario: Content fits

- **WHEN** a sheet's content fits within the opening height
- **THEN** no drag handle is shown

#### Scenario: Parked at peek

- **WHEN** the user dragged the sheet down to peek and the content then changes
- **THEN** the sheet stays at peek

#### Scenario: Rotation

- **WHEN** the device rotates while a snap sheet is open
- **THEN** its snap heights are recomputed for the new viewport

### Requirement: Mobile sheet and page swap without a hard cut

On viewports below 600px, switching an overlay between its bottom sheet and its full-screen page (data entry, profile sections) SHALL fade through: the outgoing surface fades out while the incoming one fades in (the page with a short rise). Closing an overlay from its full-screen page SHALL fade the page out. Modal bottom sheets SHALL fade in their scrim and rise in on open and fade out on close; sheets on the calendar SHALL slide in and out like those on the map.

#### Scenario: Opening a profile section on mobile

- **WHEN** the user taps a settings row in the profile sheet
- **THEN** the sheet fades out while the section page rises in, with no frame where either pops

#### Scenario: Saving a full-screen form

- **WHEN** the user saves the tour edit page and returns to the tour sheet
- **THEN** the page fades out over the tour sheet

### Requirement: Browse sheets are always resizable

On viewports below 600px the tour list and tour detail sheets SHALL always show a drag handle and SHALL snap to peek, the opening height (content height, at most 40% of the visible viewport) and the full content height (at most 70%). While the tour list shows its filters, it SHALL instead open at their content height, at most 70%, and expand to at most 90%.

#### Scenario: Short tour detail

- **WHEN** a tour's details fit within 40% of the viewport
- **THEN** the sheet still shows a drag handle and can be dropped to peek to reveal the map

#### Scenario: Dragging up a sheet already at its full content

- **WHEN** the user drags the handle or the header (outside its buttons) above the top snap
- **THEN** the sheet follows with growing resistance (at most 48px) and settles back on release

#### Scenario: Tour list filters open

- **WHEN** the user opens the filters of the tour list on a phone
- **THEN** the sheet SHALL grow to show them at up to 70% of the visible viewport and SHALL be draggable to 90%
- **AND** closing the filters SHALL return the sheet to the browse snaps

### Requirement: Opening a tour frames its points in the visible map

Opening a tour's detail (from a marker or the tour list) SHALL move the camera so the tour's points fill the map area not covered by the bottom sheet (mobile, at its resting height) or the side drawer (desktop): a lone goal is centred there at zoom 12; otherwise the goal and whichever of the start and end points the tour has are all shown. Framing several points SHALL NOT zoom in beyond zoom 12, and SHALL keep the map's bearing.

#### Scenario: Round trip

- **WHEN** a tour's end point is the same place as its start point (within 10 m)
- **THEN** the camera frames its start and goal

#### Scenario: Goal only on a phone

- **WHEN** a tour with only a goal opens in the bottom sheet
- **THEN** the goal sits centred in the map area above the sheet

#### Scenario: End without a start

- **WHEN** a stage connected to the next one, with a goal and an end but no start, opens
- **THEN** the camera frames its goal and its end

### Requirement: Tabs in a mobile sheet do not resize it

Switching tabs inside a mobile bottom sheet (friend requests: Requests / Blocked) SHALL NOT change the sheet's height; the sheet SHALL be as tall as the taller tab.

#### Scenario: Switching to Blocked

- **WHEN** the user switches from Requests to Blocked in the friend requests sheet on mobile
- **THEN** the sheet keeps its height and only the tab content changes
