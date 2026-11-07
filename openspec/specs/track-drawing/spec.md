# track-drawing Specification

## Purpose
Drawing a tour's track on the map from the tour form, the way the swisstopo app draws a tour: points
set by tapping, the line following the trails the map shows, live numbers, and the result saved as
the tour's GPX track.

## Requirements

### Requirement: Draw a track from the tour form

The tour form's track section SHALL offer "Draw on map" when the tour has no track and "Edit on map"
when it has one, in create, edit and suggest mode. Drawing SHALL collapse the form like a point pick
and show the map with a drawing panel; Cancel SHALL return to the form unchanged, Done SHALL return
with the drawing as the tour's track.

#### Scenario: Drawing a new tour's track

- **WHEN** the user creates a tour, taps "Draw on map", sets points on the map and taps Done
- **THEN** the form SHALL show the track as "Drawn track · <distance>" and save it with the tour

#### Scenario: Cancel keeps the form

- **WHEN** the user draws some points and taps Cancel
- **THEN** the form SHALL return with every field and the previous track as they were

#### Scenario: Done needs a line

- **WHEN** fewer than two points are set, or a leg is still loading
- **THEN** Done SHALL be disabled

### Requirement: Setting points

A tap on the map SHALL set a point and the line SHALL run to it from the previous point. A point
SHALL land on a way of the followed network within about 32 screen pixels (16 with a mouse, never
more than 250 m): of the ways about as near as the nearest, the one cheapest to reach, so the line
never runs past the point and back. Farther off it SHALL stay where it was set and its leg SHALL be
straight, without a notice: a straight line reads as one, as on any map.

#### Scenario: Tap on a trail

- **WHEN** hiking trails are shown and the user taps 10 m beside a trail
- **THEN** the point SHALL lie on the trail and the leg SHALL follow it from the previous point

#### Scenario: Tap in open terrain

- **WHEN** the user taps where no way lies within reach
- **THEN** the point SHALL stay there and its leg SHALL be straight, with no notice

#### Scenario: Tap between a road and a side path

- **WHEN** the tap lies between the road the line comes along and a side path joining it farther on
- **THEN** the point SHALL land on the road, without the line running to the side path's end and back

#### Scenario: A street stopping short of the trail

- **WHEN** a way's loose end stops within 30 m of a trail in the map data (a street ending at the
  square the trail crosses) and the next point lies along that way
- **THEN** the line SHALL cross the gap, not run round by the next junction and back

### Requirement: Moving points, loops and undo

A point SHALL be draggable with a finger or the mouse, showing straight legs while held and
following the network again when let go. A tap on the start of a line with two or more points SHALL
close a loop back to it. Undo and redo SHALL step through every set, move, split and loop.

#### Scenario: Drag a point

- **WHEN** the user drags a point and lets go
- **THEN** both its legs SHALL follow the network to its new place, and undo SHALL put it back

#### Scenario: Close a loop

- **WHEN** the line has three points and the user taps its start
- **THEN** a last leg SHALL run back to the start

### Requirement: Leg handles split a leg

Every leg at least about 40 screen pixels long SHALL show a small handle halfway along it, as the
swisstopo app does. Pulling a handle SHALL show a new point on straight legs while held; let go, the
point SHALL land like a tap and the leg SHALL become two, each following the network. A tap on a
handle SHALL set no point.

#### Scenario: Pull the line onto another path

- **WHEN** the user pulls the handle of a leg onto a parallel path and lets go
- **THEN** a new point SHALL sit on that path and both new legs SHALL follow the ways through it

### Requirement: Back to the start

The panel SHALL offer "To start": the line SHALL run back to its start the same way, exactly
reversed, in one undoable step — an out-and-back in one tap. It SHALL be disabled before the first
leg and once the line ends at its start.

#### Scenario: Out-and-back

- **WHEN** the user draws up to a summit and taps "To start"
- **THEN** the line SHALL return along the drawn way, the distance double and the descent the climb's

### Requirement: Map taps while drawing

While drawing, tour markers SHALL not take taps (a tap on one sets a point there) and double-tap
zoom SHALL be off; panning and pinch zoom SHALL work as usual.

#### Scenario: Tap on a tour marker

- **WHEN** the user taps a tour's marker while drawing
- **THEN** a point SHALL be set there and no tour SHALL open

### Requirement: The line follows the shown trail layer, then the map's ways

The line SHALL follow the marked hiking trails first when only hiking trails are shown, the ski
routes first when only ski routes are shown, and in every case go on along the base map's roads,
forest roads and paths; with neither layer shown it SHALL follow those ways alone. A leg SHALL be
straight only where no way lies within reach, over a far jump, where no ways load, or where the
ways connect only far round (over 2.5× the straight distance and over 500 m more).

#### Scenario: No layer shown

- **WHEN** neither layer is shown and the user taps beside a forest road
- **THEN** the point SHALL land on the road, the leg SHALL follow the ways, and the panel SHALL say
  the line follows roads and paths

#### Scenario: Ski route down to the road

- **WHEN** only ski routes are shown and the next point lies on the forest road below a route's end
- **THEN** the line SHALL follow the ski route to its end and go on along the road

#### Scenario: Ways meet only far round

- **WHEN** two points 1 km apart lie on paths that meet only by a 4.6 km detour
- **THEN** the leg SHALL be straight

#### Scenario: Switchbacks

- **WHEN** two points lie on one zig-zag path, 50 m apart straight and 300 m along it
- **THEN** the leg SHALL follow the path

#### Scenario: Trails can't load

- **WHEN** the network's tiles can't be had (offline, never cached)
- **THEN** the leg SHALL be straight and the panel SHALL say the trails couldn't load

#### Scenario: Far jump

- **WHEN** two points lie too far apart to search the ways between them
- **THEN** the leg SHALL be straight, with no notice

### Requirement: The activity decides with both layers

With both layers shown the line SHALL follow the ski routes when the tour's activities include ski
touring, splitboarding or ski mountaineering and not hiking or trail running, else the hiking
network.

#### Scenario: Both layers, ski tour

- **WHEN** both layers are shown and the tour's activity is ski tour
- **THEN** the line SHALL follow the ski routes

#### Scenario: Both layers, hiking and ski tour

- **WHEN** both layers are shown and the activities are hiking and ski tour
- **THEN** the line SHALL follow the hiking trails

### Requirement: The panel names what the line follows

The drawing panel SHALL show the two trail layer toggles, switching the map's layers, and say what
the line follows — and that the activity decided, when both layers are shown. While drawing, the
trail layers SHALL show faded so the drawn red line stands out from the red hiking trails.

#### Scenario: Switching layers while drawing

- **WHEN** the user turns on ski routes in the panel while only hiking trails were shown
- **THEN** the map SHALL show both layers and the panel SHALL say which one the line follows

### Requirement: Live numbers and profile

The drawing panel SHALL show the line's distance, an estimated time, climb and descent, and an
elevation profile, updating after every change. Heights SHALL come from swisstopo's terrain profile
along the line; until they arrive, or offline, climb and descent SHALL show as unknown and the
profile area SHALL say so. The panel SHALL keep its height from the first tap on.

#### Scenario: Numbers after two points

- **WHEN** the user has set two points along a trail and the profile has loaded
- **THEN** the panel SHALL show distance, time, climb, descent and the profile with its lowest and highest height

### Requirement: Time estimate

The time SHALL follow the SAC rule: 4 km/h on the flat, 300 m/h up and 500 m/h down, the shorter of
horizontal and vertical time counting half; for a ski-touring activity the climb SHALL go at 400 m/h
and the descent at 1500 m/h. Times SHALL read as SAC writes them: minutes under an hour ("45 min"),
else hours and minutes ("2:05 h").

#### Scenario: A climb on foot

- **WHEN** the line is 4 km long with 600 m of climb on a hiking tour
- **THEN** the panel SHALL show 2:30 h

### Requirement: Time at the user's pace

Every time SHALL be taken at the user's pace, a factor on the rule's speed from 0.5 (tortoise) to
1.5 (hare) in steps of 0.1, 1.0 by default: the time divided by the pace. A pace SHALL always read
as a factor with one decimal and a times sign ("1.2×"), never as a percentage. A tour on lifts, bike or climbing
alone, or with a flown way, SHALL show no time.

#### Scenario: A faster team

- **WHEN** the user has set the pace to 1.2 and the line is 4 km long with 600 m of climb on a hiking tour
- **THEN** the panel SHALL show 2:05 h

#### Scenario: A flown way down

- **WHEN** the tour hikes up and flies down by paraglider
- **THEN** the panel SHALL show no time

### Requirement: Pace slider

Tapping the panel's time (a 44 px target) SHALL open and close a slider between a tortoise and a
hare with the factor beside it, in the status line's place, so the panel keeps its height and the
track stays in view. Moving it SHALL update the time at once, the figures staying on one line on a
360 px phone. Only the open slider SHALL show the tortoise and the hare; while closed, a pace off
1.0 SHALL show as its factor badge in place of the time's pace icon.

#### Scenario: Setting the pace before drawing

- **WHEN** the user opens the pace before the first tap and moves it to 0.8
- **THEN** the slider SHALL show "0.8×", and the time of the line drawn next SHALL be the rule's time divided by 0.8

#### Scenario: Pace open while drawing

- **WHEN** the user has drawn a track on a 360 px phone and opens the pace
- **THEN** the panel SHALL keep its height, the status line SHALL give way to the slider, and distance, time, climb and descent SHALL stay on one line and unchanged but for the time

### Requirement: Pace kept and shown

The pace SHALL be kept on the user's account, for every later drawing, after a reload and on every
device the user signs in on; set offline, it SHALL be saved once back online. The form's track, the
tour detail and the ski route card SHALL show a pace other than 1.0 as a small badge with its
factor beside the time, without tortoise or hare.

#### Scenario: Pace kept

- **WHEN** the user has set the pace to 1.2 and reloads the app
- **THEN** the next drawing SHALL time its line at 1.2, its time SHALL show the badge "1.2×", and the slider SHALL open at 1.2

#### Scenario: Another device

- **WHEN** the user has set the pace to 0.8 on the phone and opens the app on a laptop
- **THEN** the laptop SHALL time every tour at 0.8

### Requirement: Drawn track saved as GPX

On Done the drawing SHALL become a one-segment GPX track, straight stretches densified to at most
25 m, with a terrain height per point when the profile service answers and without heights
otherwise — through the same points either way. It SHALL take the same path as a picked GPX file: uploaded at once (staged offline),
filling an empty start and end from its ends, Save waiting until it is ready.

#### Scenario: Offline drawing

- **WHEN** the user draws offline and taps Done
- **THEN** the track SHALL be staged without heights and upload with the tour on reconnect

### Requirement: Editing an existing track

"Edit on map" SHALL open the drawing on the current track: a drawing from this form exactly as
drawn; an uploaded or saved track with its line unchanged and at most 10 of its turning points as
draggable points.

#### Scenario: Editing a saved track

- **WHEN** the user edits a tour with a saved track and taps "Edit on map"
- **THEN** the drawing SHALL show that track with draggable points, and Done without changes SHALL keep its line
