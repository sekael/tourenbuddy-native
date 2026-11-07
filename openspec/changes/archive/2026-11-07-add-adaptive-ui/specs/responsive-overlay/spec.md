## ADDED Requirements

### Requirement: Overlays use the platform's sheet

On iOS and Android an overlay SHALL be the system sheet, sized to its content: Liquid Glass at
partial height on iOS, the Material bottom sheet on Android. On web it SHALL be a bottom sheet in
windows narrower than 600 px, and from 600 px a dialog up to 560 px wide that hangs from a fixed
top inset. Every overlay SHALL show its title and a close button. On web it SHALL be a modal
dialog named by its title that takes focus when it opens.

#### Scenario: iOS

- **WHEN** an overlay opens on iOS
- **THEN** it is the system sheet in Liquid Glass, as tall as its content, with the system close
  button

#### Scenario: Android

- **WHEN** an overlay opens on Android
- **THEN** it is the Material bottom sheet, as tall as its content

#### Scenario: Web on a phone

- **WHEN** an overlay opens in a window narrower than 600 px
- **THEN** it slides up from the bottom edge over a dimmed backdrop

#### Scenario: Web on a desktop

- **WHEN** an overlay opens in a window 600 px or wider
- **THEN** it fades in as a dialog, centered horizontally with its top edge on the top inset

#### Scenario: Closing on web

- **WHEN** the user presses Escape, clicks the backdrop or presses the close button, even several
  of them in quick succession
- **THEN** the overlay glides out and closes once, back to where it was opened from

#### Scenario: Screen readers on web

- **WHEN** an overlay opens on web
- **THEN** focus moves into it and it is announced as a dialog with its title
