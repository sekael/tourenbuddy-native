## ADDED Requirements

### Requirement: Elevation profile in the tour sheet
A tour with a GPX track SHALL show the track's elevation profile in its sheet (the bottom sheet on phones, the side drawer on desktop web), right under the overview's name and numbers: height over distance along the whole track, every leg in its activity's colour, with the lowest and highest height and the length, drawn as while drawing. Heights SHALL come from the file, else from swisstopo's terrain profile along the track. Without a track, while it loads, offline without heights, or when the heights can't be had, the profile SHALL not show and SHALL leave no gap.

In the sheet the profile SHALL stand taller than while drawing (112 pt, the drawing's 72 pt), with room above its line for the cursor's label, so the label never covers the line.

While the user touches or drags along the profile (on the web: presses the mouse on it and drags; a mouse merely passing over does nothing), it SHALL show a cursor at that distance with the height and the distance from the start, and the map SHALL show a dot at that place on the track; the cursor's dot and the map's SHALL wear the colour of the track's activity there. Letting go SHALL remove both. The dot SHALL never leave the map's view: while it is in the middle half of the map beside the sheet (or the drawer), the map SHALL stay still; past that, the map SHALL move along with it at once, just far enough to keep it on that edge, without jumps or animation, at any zoom. Letting go SHALL leave the map where it is. Dragging along the profile SHALL not move the sheet.

#### Scenario: A tour with a track
- **WHEN** the user opens a tour whose GPX track has heights
- **THEN** the profile shows under the name and numbers, in the activities' colours, with lowest and highest height and length

#### Scenario: A tour without a track
- **WHEN** the user opens a tour without a GPX track
- **THEN** no profile and no empty space shows where it would be

#### Scenario: Offline, a drawn track
- **WHEN** the user opens a tour whose drawn track has no heights in the file while offline
- **THEN** no profile shows, and it appears once the tour is opened online

#### Scenario: Scrubbing along the profile
- **WHEN** the user drags a finger along the profile from the start towards the summit
- **THEN** a cursor follows the finger with height and distance, a dot moves along the track on the map to the same place, and both go when the finger lifts

#### Scenario: Following the dot when zoomed in
- **WHEN** the map is zoomed in on the first kilometre of a tour and the user drags along the profile towards the summit
- **THEN** the dot moves along the track, and once it nears the edge of the map above the sheet the map moves along with it, so the dot stays in view the whole way

#### Scenario: The whole tour in view
- **WHEN** the tour shows whole above the sheet and the user drags along the profile
- **THEN** only the dot moves; the map stays still

#### Scenario: The dot in the activity's colour
- **WHEN** the user drags along a hike & fly's profile past the goal
- **THEN** the dot on the profile and on the map changes from the hike's colour to the flight's, as the line does

#### Scenario: Dragging on desktop
- **WHEN** a desktop user presses the mouse on the profile in the side drawer and drags along it
- **THEN** the cursor and the map dot follow the mouse, the map keeps the dot in view beside the drawer, and both go when the button is released

#### Scenario: Passing over on desktop
- **WHEN** a desktop user moves the mouse over the profile without pressing
- **THEN** no cursor or map dot shows, and the map stays still

## MODIFIED Requirements

### Requirement: The tour sheet opens on a compact overview
A tour's sheet SHALL show its essentials close together, right under the bar's buttons: the name, height, date and route numbers with the activities (grade on the first) and seasons as chips, then the track's elevation profile when it has one, then the owner's switches "Completed" and "Private", which MAY sit below the fold at half height. As in the PWA, the switch SHALL make the tour private when on (off, the default: friends see it), with a note on who sees a private tour; sections SHALL sit closely, as in the system's Settings.

#### Scenario: Half-height sheet
- **WHEN** the user opens a tour on a 6.1-inch phone and the sheet stands at half height
- **THEN** the name, height, date, numbers (climb and descent, distance, time), activities with the grade and, when the tour has a track, its elevation profile show without scrolling, with the map visible above the sheet; the switches may need a scroll

#### Scenario: Making a tour private
- **WHEN** the owner turns "Private" on
- **THEN** the tour is hidden from friends and partners, the note says so, and reopening the tour shows the switch on
