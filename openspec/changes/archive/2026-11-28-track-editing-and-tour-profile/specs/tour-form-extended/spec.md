## MODIFIED Requirements

### Requirement: Round Trip Tour shortcut

When a start point is set and the tour ends at its goal (no end point, or one within 200 m of the goal), the form SHALL offer "Round Trip" (`tours.form.roundTripBtn`): a button on the web, a row in the route section on the phone, as the route step's. Not for a flown way down, which offers "Add landing" instead. One tap SHALL copy the start point's coordinates, name and elevation into the end point, and send the tour's track, if it has one (drawn, planned, from a ski route, a file or the saved one), back the same way to the start, exactly, so its descent is its climb. A route from the route step SHALL open there again as a round trip.

#### Scenario: User clicks Round Trip Tour

- **WHEN** the user has set a start point, has no end point, and clicks "Round Trip"
- **THEN** `endPoint` SHALL be set to a copy of `startPoint`'s coordinates, `endPointName` SHALL equal `startPointName`, and `endPointElevation` SHALL equal `startPointElevation`

#### Scenario: A ski route made a round trip

- **WHEN** the user plans a ski route without a way down as a tour and taps "Round Trip" in the form
- **THEN** the end is the start, the track runs up to the summit and back down the same way, and the tour's climb and descent are equal

#### Scenario: Round Trip button hidden without start point

- **WHEN** no start point is set
- **THEN** the "Round Trip" button SHALL NOT be rendered (an empty end point section offers only "Add end point" or "Add landing" and its suggestions)

#### Scenario: Round Trip button hidden when end point already set

- **WHEN** an end point away from the goal is already set
- **THEN** the "Round Trip" button SHALL NOT be rendered (only the populated end point row is shown)

### Requirement: Form order

The tour form SHALL ask where, then what, then how, then when, then who, each in a section of its own: the name with the goal's height; the activities with their ways and the grade; the route (track, start, end); planned date with start time, end date and seasons; partners; visibility; then description, equipment, notes and attachments. No section SHALL mix fields of two of these, such as the height with the partners. The web form, too, asks the grade in the activities' section, above the route (owner, 2026-11-26).

#### Scenario: Date near the top

- **WHEN** the creation form opens after a goal pick
- **THEN** the date SHALL come right after the route, before partners and visibility

#### Scenario: Height with the name

- **WHEN** the user opens a tour's edit form
- **THEN** the goal's height SHALL sit in the name's section, and the partners SHALL have a section of their own after the dates and seasons

#### Scenario: Track before the points

- **WHEN** the creation form opens on the web after a goal pick
- **THEN** the track SHALL come right after the activities, before start and end
