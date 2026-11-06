## Purpose

Content-sized modal dialog used on desktop for confirmations, forms, and destructive-action prompts; it hangs from a fixed top inset and glides to the height of what it shows.

## Requirements

### Requirement: DialogWindow renders as a content-sized modal on desktop

The `DialogWindow` component SHALL render as a horizontally centered modal card over a semi-transparent backdrop on viewports at or above 600px. The card SHALL hang from a fixed top inset (`clamp(24px, 12dvh, 7rem)`) and keep the same inset below. Its height SHALL follow its current content: exactly as tall as its header plus content, gliding to a new height whenever the content's height changes (growing or shrinking), and capped at the viewport height minus both insets, beyond which the content region scrolls. It SHALL NOT be used on viewports below 600px.

#### Scenario: Centered dialog appearance

- **WHEN** a `DialogWindow` is mounted on a viewport at or above 600px
- **THEN** the dialog card SHALL be centered horizontally with its top edge on the top inset
- **AND** the card SHALL have fully rounded corners (`border-radius: var(--radius-lg)` on all sides)
- **AND** the card SHALL apply `box-shadow: var(--shadow-lg)`
- **AND** the card SHALL cap its width at `560px`

#### Scenario: Backdrop scrim

- **WHEN** a `DialogWindow` is mounted on a viewport at or above 600px
- **THEN** a fullscreen backdrop SHALL be rendered behind the card with background `var(--color-backdrop)` (`rgba(15, 23, 42, 0.35)`) and `backdrop-filter: blur(var(--overlay-backdrop-blur))` (8px)

#### Scenario: Height follows the content

- **WHEN** the slotted content changes height (a view or tab swap, data loading)
- **THEN** the card SHALL glide to the new height over `--motion-duration-medium` with `--motion-ease-emphasized`
- **AND** the card's top edge, and with it the header, SHALL NOT move
- **AND** the first height after opening SHALL apply without a glide

#### Scenario: Content taller than the screen

- **WHEN** the content needs more height than the viewport minus both insets
- **THEN** the card SHALL stop at that height, with equal margins above and below it
- **AND** the content region SHALL scroll

#### Scenario: Collapsed header bar

- **WHEN** a `DialogWindow` is collapsed (e.g. while the user picks a location for a new tour)
- **THEN** it SHALL shrink to a header-only bar pinned to the top edge of the viewport
- **AND** when expanded again it SHALL return to its top inset and its content's height

### Requirement: DialogWindow API contract

The `DialogWindow` component SHALL accept `title?: string` and `ariaLabel?: string` props, emit a `close` event, provide a default slot for content, and render a header with the title and a close button.

#### Scenario: Props, emits, and slot

- **WHEN** a `DialogWindow` is instantiated with a `title`
- **THEN** the header SHALL display the title text
- **AND** the header SHALL include a close button with `aria-label="Close"`
- **AND** clicking the close button SHALL emit `close`
- **AND** the default slot SHALL render inside a scrollable content region

#### Scenario: Backdrop click dismisses

- **WHEN** a `DialogWindow` is open
- **AND** the user clicks the backdrop outside the card
- **THEN** the component SHALL emit `close`

#### Scenario: Content click does not dismiss

- **WHEN** a `DialogWindow` is open
- **AND** the user clicks inside the card
- **THEN** the component SHALL NOT emit `close`

### Requirement: DialogWindow a11y attributes

The `DialogWindow` SHALL expose appropriate ARIA attributes for a modal dialog.

#### Scenario: ARIA markup

- **WHEN** a `DialogWindow` is rendered
- **THEN** the card SHALL have `role="dialog"` and `aria-modal="true"`
- **AND** if `title` is provided, the card SHALL be labelled by the title element via `aria-labelledby`
- **AND** if `title` is absent but `ariaLabel` is provided, the card SHALL use `aria-label` with that value

### Requirement: Dialog content reserves scrollbar gutter

The scrollable content region of `DialogWindow` SHALL reserve space for the scrollbar so the scrollbar never overlaps content. Existing thin scrollbar styling SHALL be retained.

#### Scenario: Content overflows dialog
- **WHEN** the slotted content overflows the dialog's content region in a browser that honors `scrollbar-gutter`
- **THEN** a scrollbar gutter SHALL be reserved on the inline-end side
- **AND** content SHALL NOT shift horizontally when the scrollbar appears or disappears

#### Scenario: Mobile/overlay scrollbar fallback
- **WHEN** the dialog content overflows in a browser using overlay scrollbars
- **THEN** the overlay scrollbar SHALL sit over reserved right padding inside the content region and SHALL NOT overlap interactive controls

### Requirement: Dialog body scroll is contained

The scrollable body region of `DialogWindow` SHALL contain its scroll: when scrolled past
either end, the scroll SHALL NOT chain to any ancestor — not the page behind the dialog,
not the document, and not a map rendered beneath it. The region's own end-of-scroll
affordance (rubber-band on platforms that provide one) SHALL be preserved.

#### Scenario: Overscrolling a dialog does not move the page behind it

- **WHEN** the dialog body is scrolled to its top or bottom edge
- **AND** the user continues the scroll gesture in the same direction
- **THEN** no ancestor scroll container SHALL scroll
- **AND** the document scroll offset SHALL remain unchanged

### Requirement: Dialog body scrolls vertically only

The dialog body SHALL scroll on the vertical axis only, regardless of child content width.

#### Scenario: Horizontal swipe over the dialog body does nothing

- **WHEN** the user swipes or drags horizontally within the dialog body
- **THEN** the dialog body SHALL NOT scroll horizontally

### Requirement: DialogWindow enter animation

The `DialogWindow` SHALL animate in with a fade, a short drop onto its top line, and a subtle scale-up, taking its timing and travel from the motion tokens.

#### Scenario: Enter animation

- **WHEN** a `DialogWindow` enters the DOM
- **THEN** its card SHALL animate from `opacity: 0; transform: translateY(calc(-1 * var(--motion-offset))) scale(0.98)` to its resting state over `--motion-duration-medium` with `--motion-ease-emphasized`, scaling from its top edge

### Requirement: DialogWindow pins an optional footer

`DialogWindow` SHALL accept an optional `footer` slot rendered below the scrolling content region,
outside it, so its actions stay visible however long the content is. Content scrolling above the
footer SHALL fade out under it rather than end in a hard cut. A collapsed dialog SHALL NOT show
the footer.

#### Scenario: Footer stays put
- **WHEN** a dialog with a footer has more content than fits
- **THEN** the content scrolls and the footer stays visible below it, with the content fading out just above the footer

#### Scenario: No footer while collapsed
- **WHEN** the dialog is collapsed
- **THEN** the footer is not shown
