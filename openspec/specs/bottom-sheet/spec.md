## Purpose

Mobile-optimized modal surface that slides up from the bottom edge, supporting drag-to-dismiss and snap heights.

## Requirements

### Requirement: Bottom sheet renders header, content, optional footer

The `BottomSheet` component SHALL render a drag handle, a header (title + close button, optional back button), a scrollable content slot, and an optional footer slot. Width SHALL be capped at `--bottom-sheet-max-width` (default 480px). The sheet SHALL be anchored to the bottom edge of its container.

#### Scenario: Renders title and close

- **WHEN** the component is mounted with a `title` prop
- **THEN** the title SHALL be visible in the header
- **AND** a close button SHALL be visible
- **AND** clicking the close button SHALL emit `close`

#### Scenario: Renders footer slot when provided

- **WHEN** a `footer` slot is provided
- **THEN** the footer region SHALL render below the content with a top border separator

### Requirement: Bottom sheet height is user-adjustable via drag handle

The drag handle SHALL act as a resize control. The user SHALL be able to drag the handle vertically (touch or pointer) to change the sheet height. Sheet height SHALL be clamped between a peek height (header-only) and a maximum of 70% of the visible viewport (`window.innerHeight * 0.7`). Dragging up SHALL grow the sheet; dragging down SHALL shrink it. The maximum height SHALL never exceed that 70% ceiling so the underlying map remains at least 30% visible.

#### Scenario: Drag up grows the sheet

- **WHEN** the sheet is at its default height
- **AND** the user presses the drag handle and moves the pointer up by 100px
- **THEN** the sheet height SHALL increase by approximately 100px
- **AND** the sheet height SHALL NOT exceed 70% of the visible viewport

#### Scenario: Drag down shrinks the sheet

- **WHEN** the sheet is at its default height
- **AND** the user presses the drag handle and moves the pointer down by 100px
- **THEN** the sheet height SHALL decrease by approximately 100px
- **AND** the sheet height SHALL NOT shrink below the peek height (header only)

#### Scenario: Hard 70% ceiling

- **WHEN** the user drags the handle further up after the sheet has already reached the 70% ceiling
- **THEN** the sheet height SHALL remain at 70% of the visible viewport

### Requirement: Sheet snaps to nearest snap point on release

On pointer release after a drag, the sheet SHALL animate to the nearest of three snap points: `peek` (header only), `default` (≈40% of the viewport), `expanded` (70% of the visible viewport, `innerHeight * 0.7`). Snap selection SHALL be biased by drag direction at release (releasing while moving up prefers the next-larger snap; releasing while moving down prefers the next-smaller snap). Movements smaller than 4px SHALL be treated as a tap and SHALL NOT trigger a snap change.

#### Scenario: Release after upward drag past midpoint

- **WHEN** the user starts at default and drags up past the midpoint between default and expanded
- **AND** releases the pointer
- **THEN** the sheet SHALL animate to the expanded snap (70% of the visible viewport)

#### Scenario: Tap on drag handle has no effect

- **WHEN** the user presses and releases the drag handle without moving more than 4px
- **THEN** the sheet height SHALL remain unchanged
- **AND** no snap animation SHALL occur

### Requirement: Drag is disabled when sheet is programmatically collapsed

When the `collapsed` prop is true, the drag handle SHALL be hidden and drag interactions SHALL be ignored. When `collapsed` transitions from true to false, the sheet SHALL restore the user's last snap point, or `default` if none has been set.

#### Scenario: Collapsed prop true hides handle

- **WHEN** `collapsed` is true
- **THEN** the drag handle SHALL NOT be rendered
- **AND** pointer events on the header area SHALL NOT initiate a resize drag

#### Scenario: Collapsed prop flips during active drag

- **WHEN** the user is mid-drag
- **AND** the parent sets `collapsed` to true
- **THEN** the active drag SHALL be cancelled
- **AND** pointer capture SHALL be released

### Requirement: Drag handle is keyboard accessible

The drag handle SHALL be focusable and operable via keyboard. It SHALL expose `role="separator"`, `aria-orientation="horizontal"`, and `aria-valuemin`, `aria-valuemax`, `aria-valuenow` reflecting the current snap point index. Arrow keys SHALL cycle between snap points.

#### Scenario: Arrow up cycles to larger snap

- **WHEN** the drag handle is focused at the `default` snap
- **AND** the user presses ArrowUp
- **THEN** the sheet SHALL animate to the `expanded` snap

#### Scenario: Arrow down cycles to smaller snap

- **WHEN** the drag handle is focused at the `default` snap
- **AND** the user presses ArrowDown
- **THEN** the sheet SHALL animate to the `peek` snap

### Requirement: Sheet content scrolls independently of drag

Inner content overflow SHALL scroll independently. Scrolling within the content area SHALL NOT initiate a resize drag, and resize dragging the handle SHALL NOT scroll the content area.

Content scroll SHALL be contained: when the content area is scrolled past either end, the
scroll SHALL NOT chain to any ancestor — not the page, not the document, and not the map
behind it. The content area's own end-of-scroll affordance (rubber-band on platforms that
provide one) SHALL be preserved.

#### Scenario: Scrolling content does not resize

- **WHEN** the content area overflows
- **AND** the user scrolls within the content area
- **THEN** the sheet height SHALL remain unchanged

#### Scenario: Overscrolling content does not scroll anything behind it

- **WHEN** the content area is scrolled to its top or bottom edge
- **AND** the user continues the scroll gesture in the same direction
- **THEN** no ancestor scroll container SHALL scroll
- **AND** the document scroll offset SHALL remain unchanged

### Requirement: Content scroll region reserves scrollbar gutter

The scrollable content region of `BottomSheet` SHALL reserve space for the scrollbar so that the scrollbar never overlaps text, buttons, or interactive controls. The scrollbar SHALL render with a thin, app-consistent style.

#### Scenario: Desktop / Chromium browsers with reservable gutter
- **WHEN** content overflows the sheet's content region in a browser that honors `scrollbar-gutter`
- **THEN** a scrollbar gutter SHALL be reserved on the inline-end side
- **AND** content SHALL NOT shift horizontally when the scrollbar appears or disappears

#### Scenario: Mobile browsers with overlay scrollbars
- **WHEN** content overflows the sheet's content region on iOS Safari or Android Chrome
- **THEN** the overlay scrollbar SHALL sit over reserved right padding inside the content region
- **AND** the scrollbar SHALL NOT overlap text, buttons, or toggles

### Requirement: Sheet supports a fit-content sizing mode

When the `fitContent` prop is true, the sheet SHALL size itself to `min(natural content height, window.innerHeight * 0.7)` instead of opening at a snap point, so the entire content is visible without dragging. The cap SHALL be enforced in JS against the **visible** viewport (`innerHeight * 0.7`), not via a CSS `vh` ceiling — `vh` is the large viewport (behind the mobile URL bar) and would let the sheet overshoot 70% of the visible screen; the CSS `max-height: 70dvh` is only a secondary safety net. In this mode the sheet SHALL refit when the viewport resizes (e.g. rotation) and SHALL NOT snap to `peek` / `default` / `expanded`. The drag handle remains operable, but the sheet's resting height is content-driven, not snap-driven. When `fitContent` is absent or false, the sheet SHALL retain the default snap behavior.

#### Scenario: Short content opens fully visible

- **WHEN** a sheet with `fitContent` is opened and its content is shorter than the 70% cap
- **THEN** the sheet height SHALL equal the natural content height
- **AND** no part of the content SHALL be clipped or require a drag-up to reveal

#### Scenario: Tall content is capped at the 70% ceiling

- **WHEN** a sheet with `fitContent` is opened and its content is taller than `innerHeight * 0.7`
- **THEN** the sheet height SHALL be capped at `innerHeight * 0.7` (70% of the visible viewport)
- **AND** the content region SHALL scroll within that ceiling

#### Scenario: Refit on viewport resize

- **WHEN** a `fitContent` sheet is open and the viewport height changes
- **THEN** the sheet SHALL re-measure and re-apply `min(content, innerHeight * 0.7)`
- **AND** SHALL NOT jump to a snap point

### Requirement: Close control stays accessible regardless of sheet height

While the sheet is interactive (not `collapsed`), the close control SHALL be rendered in the pinned header region — outside the scrolling content area — so it remains visible and tappable even when the content overflows or the sheet covers most of the viewport (e.g. a fit-content sheet at the 70% ceiling). Consumers SHALL NOT hide or override the close control, and SHALL NOT rely on backdrop-tap as the only way to dismiss.

#### Scenario: Close button visible when content overflows

- **WHEN** an interactive sheet's content is taller than the sheet and the content region is scrolled
- **THEN** the close button SHALL remain visible and tappable in the header
- **AND** SHALL NOT scroll out of view with the content

#### Scenario: Close button hidden only when collapsed

- **WHEN** the `collapsed` prop is true
- **THEN** the close button MAY be hidden along with the rest of the interactive chrome
- **AND** it SHALL reappear when `collapsed` returns to false

### Requirement: Data entry uses a full-screen page on mobile

On mobile, the bottom sheet SHALL be used for **view mode only**. Whenever the user enters or edits data — editing an existing entity, creating a new one, or any other text-entry form — the surface SHALL switch from the bottom sheet to a full-screen page that occupies the entire screen, with no map (or other content) visible behind it, so all real estate serves the form. When the edit/creation is saved or cancelled, the surface SHALL return to the bottom sheet view (map visible again, sheet capped at its normal height).

The full-screen page SHALL render an opaque surface covering the viewport (`position: fixed; inset: 0`), a fixed top app bar holding the cancel control (top-left) and the primary action / Save button (top-right), and a scrolling body for the form. Because the primary action lives in the fixed top bar, the on-screen keyboard SHALL NOT hide it; the form body scrolls beneath. The page SHALL NOT be draggable and SHALL NOT show a drag handle or snap points.

This replaces any keyboard-inset / visual-viewport height math on the bottom sheet: with edit forms on their own page, the bottom sheet no longer needs to resize around the keyboard.

#### Scenario: Entering edit mode on mobile

- **WHEN** the user enters edit or create mode for a tour, contact, or profile on a mobile viewport
- **THEN** the surface SHALL switch from the bottom sheet to a full-screen page
- **AND** the map SHALL NOT be visible behind the page
- **AND** the primary Save action SHALL be reachable in the top app bar regardless of keyboard state

#### Scenario: Leaving edit mode

- **WHEN** the user saves or cancels the edit/creation
- **THEN** the surface SHALL return to the bottom sheet (or close), revealing the map again

#### Scenario: A pick that needs the map collapses instead of paging

- **WHEN** an edit/create flow needs the map (e.g. picking a location)
- **THEN** the full-screen page SHALL collapse in place to a title-only bar anchored at the bottom of the screen, like a collapsed bottom sheet, so the map stays visible
- **AND** the page SHALL NOT be replaced by a bottom sheet, so the form and every unsaved value in it survive the pick
- **AND** the collapsed bar SHALL hide the cancel control and the primary action
- **AND** when the pick ends the page SHALL expand back to full screen with the form as the user left it

#### Scenario: Desktop is unaffected

- **WHEN** the user edits on a desktop viewport
- **THEN** the edit form SHALL continue to use the side drawer / dialog, not the full-screen page

### Requirement: Sheet uses its limited space efficiently

The sheet SHALL keep non-content chrome — content padding, header padding, footer padding, and the margins/gaps around the drag handle and footer action bar — compact so the maximum area is available for information, while interactive controls remain comfortably usable and visually separated. The comfortable size of each control is a per-control design decision judged by visual inspection; this requirement does NOT mandate a fixed numeric touch-target floor. A control's visible size SHALL equal its hit area — no invisible hit extensions, which produce confusing behavior. Visual grouping (dividers, borders, and inter-element `gap`) SHALL remain perceptible so the layout stays readable, not cramped.

The sheet's maximum height SHALL be 70% of the **visible** viewport height (`window.innerHeight * 0.7`). The expanded snap uses this value, and fit-content SHALL clamp its measured natural height to it (`min(content, innerHeight * 0.7)`) rather than relying on a CSS `vh` ceiling — `vh` is the large viewport (behind the mobile URL bar) and would let the sheet overshoot. The map SHALL always retain at least 30% of the screen.

#### Scenario: Sheet caps at 70% so the map keeps 30%

- **WHEN** the sheet is at its tallest (expanded snap, or fit-content with content taller than the cap)
- **THEN** the sheet SHALL occupy at most 70% of the visible viewport height
- **AND** at least 30% of the viewport SHALL remain for the map
- **AND** fit-content content taller than the cap SHALL snap to the 70% ceiling, not exceed it

#### Scenario: Content uses the available width

- **WHEN** the sheet renders content on a narrow mobile viewport
- **THEN** the content horizontal padding SHALL be compact (not the widest spacing token)
- **AND** more content width SHALL be available than with the previous padding

#### Scenario: Compact without becoming cramped

- **WHEN** non-content padding, margins, and gaps are trimmed
- **THEN** interactive controls SHALL remain comfortably tappable with hit area equal to their visible size
- **AND** grouping separation between elements SHALL remain visible

### Requirement: Sheet content scrolls vertically only

The content area SHALL scroll on the vertical axis only. It SHALL NOT expose a horizontal
scrollbar or respond to a horizontal scroll/swipe gesture, regardless of child content
width. Row-level content that could otherwise force horizontal overflow (a value next to a
leading icon, a wrapped chip list) SHALL be laid out to shrink and wrap within the sheet's
width instead.

#### Scenario: Wide row content wraps instead of scrolling sideways

- **WHEN** a row's value content (e.g. coordinates, a place name, a list of chips) is wider than the sheet
- **THEN** that content SHALL wrap onto additional lines
- **AND** the content area SHALL NOT scroll horizontally to reveal it

#### Scenario: Horizontal swipe over the content area does nothing

- **WHEN** the user swipes or drags horizontally within the content area
- **THEN** the content area SHALL NOT scroll horizontally

### Requirement: Fit-content sheet can hold its height

A `fitContent` sheet SHALL accept an option to hold its height. While held, the sheet SHALL NOT shrink when its content gets shorter; it SHALL still grow with its content, follow user drags and snap normally, and drags and snap keys SHALL reach each snap's full height however short the content is. When the hold is released, the sheet SHALL refit to its content.

#### Scenario: Content shrinks while held

- **WHEN** a held fit-content sheet's content becomes shorter
- **THEN** the sheet height SHALL stay unchanged

#### Scenario: Content grows while held

- **WHEN** a held fit-content sheet's content becomes taller
- **THEN** the sheet SHALL grow as without the hold, up to its cap

#### Scenario: Hold released

- **WHEN** the hold is released while the sheet is taller than its content
- **THEN** the sheet SHALL refit to its content height

#### Scenario: Dragging a held sheet with short content

- **WHEN** a held resizable sheet shows content shorter than its opening height and the user drags it up
- **THEN** the sheet SHALL settle at the full snap height (70% of the visible viewport) rather than springing back to the content height

### Requirement: Fit-content sheet follows its footer

A fit-content sheet SHALL count its footer in its fitted height and refit when the footer's
height changes, as it does for its content, within the same caps. Content above the footer then
scrolls under the footer's fade.

#### Scenario: A confirmation opens in the footer
- **WHEN** a fit-content sheet's footer grows (a confirmation replacing a button row)
- **THEN** the sheet grows by as much, up to its cap, and every control in the footer stays on screen
