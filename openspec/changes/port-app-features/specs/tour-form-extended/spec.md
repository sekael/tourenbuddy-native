## REMOVED Requirements

### Requirement: Pick-type label in collapsed overlay header
**Reason**: Native picks run in a sheet over the live map whose title names the point; there is no collapsed form header.
**Migration**: tour-creation-flow "Route step in a sheet over the live map".

### Requirement: Point picker action rows stay within their bounded section
**Reason**: A web layout concern; native forms use system rows that size themselves.
**Migration**: adaptive-lists-forms "Lists and forms use system components on iOS".

## ADDED Requirements

### Requirement: Ways up and down beside the activities

With two or more activities selected, or paragliding alone, the form SHALL show a "Way up and down"
section right after the activities, with no page or menu to open: one line per activity (paragliding
last) in the activity's own glyph and colour, above a switch "Up | Both | Down" ("Both | Down" for
a lone glider) that one tap changes. An edited tour SHALL start from its saved ways.

#### Scenario: Skitour & fly at a glance

- **WHEN** the user selects ski touring, then paragliding
- **THEN** the section SHALL appear under the activities with ski touring on "Up" and paragliding on
  "Down", without opening anything

#### Scenario: A pick that stays

- **WHEN** the user sets hiking to "Both" on a hike & fly, then adds mountain biking
- **THEN** hiking SHALL stay on "Both" and mountain biking SHALL take its default, "Up"

### Requirement: A greyed way says why

A part of the switch that would leave a way without activity SHALL show greyed and take no tap;
the section's footer SHALL explain the three ways and that each way needs an activity.

#### Scenario: The only way down

- **WHEN** paragliding is the only activity on the way down
- **THEN** its "Up" SHALL be greyed, and tapping it SHALL change nothing

### Requirement: A flown way ends at the landing

When the way down includes paragliding, the route's end SHALL read as the landing ("Landeplatz") in
the route step, the form and the tour sheet; the route step SHALL ask where the user lands, and
neither it nor the drawing SHALL offer the way back to the start. The form's start and end SHALL say how far they lie from the goal, and past
20 km ask whether the place is right.

#### Scenario: Hike & fly to the valley

- **WHEN** the user plans hiking up and paragliding down, then sets the end in the valley
- **THEN** the route step's end row SHALL read "Landeplatz" with no "Rundtour" offered, and the form
  SHALL show "Landeplatz · 2,4 km vom Ziel" under the place's name

#### Scenario: A landing in the wrong valley

- **WHEN** the landing found by a search lies 35 km from the goal
- **THEN** the form SHALL show "35 km vom Ziel – stimmt der Ort?" under it
