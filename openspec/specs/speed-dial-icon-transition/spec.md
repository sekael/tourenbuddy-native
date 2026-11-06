## Purpose

Animated icon-morph transition for the speed-dial action button as it opens and closes.

## Requirements

### Requirement: Speed dial trigger shows context-appropriate icon

The speed dial trigger SHALL display a `menu` icon when closed and a `close` icon when open. The change between icons SHALL be a cross-fade in which the outgoing icon turns a quarter and shrinks slightly while the incoming one turns back into place, timed by the motion tokens. No slide SHALL be applied to either icon.

#### Scenario: Closed state shows menu icon

- **WHEN** the speed dial is closed (`isOpen` is `false`)
- **THEN** the `menu` icon is fully visible (`opacity: 1`) and the `close` icon is hidden (`opacity: 0`)

#### Scenario: Open state shows close icon

- **WHEN** the speed dial is open (`isOpen` is `true`)
- **THEN** the `close` icon is fully visible (`opacity: 1`) and the `menu` icon is hidden (`opacity: 0`)

#### Scenario: Transition is a fade

- **WHEN** the open state toggles
- **THEN** the icons cross-fade while turning a quarter (hidden icon at `rotate(±90deg) scale(0.8)`), with no slide
