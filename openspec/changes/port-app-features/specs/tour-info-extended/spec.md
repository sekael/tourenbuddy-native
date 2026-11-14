## ADDED Requirements

### Requirement: The tour sheet opens on a compact overview
A tour's sheet SHALL show its essentials close together, right under the bar's buttons: the name, height, date and route numbers with the activities (grade on the first) and seasons as chips, then the owner's switches "Completed" and "Private". As in the PWA, the switch SHALL make the tour private when on (off, the default: friends see it), with a note on who sees a private tour; sections SHALL sit closely, as in the system's Settings.

#### Scenario: Half-height sheet
- **WHEN** the user opens a tour on a 6.1-inch phone and the sheet stands at half height
- **THEN** the name, height, date, numbers, activities and both switches show without scrolling

#### Scenario: Making a tour private
- **WHEN** the owner turns "Private" on
- **THEN** the tour is hidden from friends and partners, the note says so, and reopening the tour shows the switch on
