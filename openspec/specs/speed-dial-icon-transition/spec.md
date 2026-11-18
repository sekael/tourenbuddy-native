## Purpose

Animated icon-morph transition for the speed-dial action button as it opens and closes.

## Requirements

### Requirement: FAB menu trigger icon on Android and web
On Android and the web the map menu's floating button SHALL show a `menu` icon when closed and a `close` icon when open, changing with a quarter turn timed by the motion tokens and without travel under Reduce Motion. On iOS the glass circle SHALL keep its icon while the system menu opens from it.

#### Scenario: Open on Android
- **WHEN** the user opens the map menu on Android
- **THEN** the button's icon turns into a close icon
