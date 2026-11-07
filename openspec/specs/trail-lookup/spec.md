# trail-lookup Specification

## Purpose
Lets users tap a ski route shown by the ski-route overlay to identify it, see it highlighted and read its
details. It also provides the trail data (line geometry plus attributes) that later track drawing with trail
snapping builds on. Hiking trails are display-only: their category is already visible in the overlay's
symbology. Ski route data comes from the self-hosted dataset (see `ski-route-dataset`).

## Requirements

### Requirement: Clickable ski routes are marked

With the ski-route overlay on, at zoom 11 or closer, every ski route in view that carries route information SHALL be marked with a soft halo along its line and markers along the route that never overlap one another. Below zoom 11 the ski-route overlay SHALL still draw every route, unmarked. Routes without information SHALL NOT be marked. Marking SHALL come from the app's own ski-route dataset, without a request per pan beyond map tiles not yet loaded. Offline, routes SHALL be marked where their tiles are available (downloaded region or previously viewed).

#### Scenario: Marked routes

- **WHEN** the ski-route overlay is on at zoom 13
- **THEN** every ski route with route information in view SHALL show a halo and a marker, and routes without information SHALL look as on the plain overlay

#### Scenario: Below zoom 11

- **WHEN** the ski-route overlay is on at zoom 8
- **THEN** the ski routes SHALL be drawn and no route SHALL be marked

#### Scenario: Routes sharing a stretch

- **WHEN** several marked routes run along the same stretch (e.g. leaving the same hut)
- **THEN** their markers SHALL NOT overlap there, and each route SHALL still show a marker where its line is visible on its own

#### Scenario: Panning inside the loaded area

- **WHEN** the user pans over map tiles that have already loaded
- **THEN** no new request SHALL be made

#### Scenario: Offline in a downloaded region

- **WHEN** the device is offline inside a downloaded region with the ski-route overlay on at zoom 12
- **THEN** the routes SHALL be marked as online

### Requirement: Marked routes show their difficulty

A marked route's marker SHALL show its difficulty (SAC scale with `+`/`-`, in the UI language's notation). Marker and halo SHALL be colored by difficulty from blue (L) to purple (SS) and darker beyond, grey when the route has no difficulty.

#### Scenario: Difficulty on the marker

- **WHEN** a marked route has difficulty `ZS+` and the UI is German
- **THEN** its marker SHALL read `ZS+` and marker and halo SHALL take the ZS+ color, between the ZS and S colors
- **AND WHEN** the UI is English, the same route's marker SHALL read `AD+` in the same color

#### Scenario: No difficulty

- **WHEN** a marked route has no difficulty
- **THEN** its marker SHALL be grey and show no difficulty

### Requirement: Tap opens marked ski routes

A map tap that hits no tour marker SHALL, at zoom 11 or closer, find the marked routes within the tap tolerance: 24 screen pixels for touch (coarse pointer), 10 for a mouse. Only marked routes SHALL be found, each at most once however many map tiles it spans. The lookup SHALL NOT query hiking trails. Taps SHALL NOT look up routes below zoom 11, while picking a location, or drawing an offline region. Offline, a tap on a marked route SHALL NOT look it up and SHALL show a localized "Route details need a connection" snackbar; any other offline tap SHALL behave as without overlays.

#### Scenario: Tap on a marked route

- **WHEN** the ski-route overlay is on at zoom 13 and the user taps a marked ski route
- **THEN** its card SHALL open

#### Scenario: Tap at zoom 11

- **WHEN** the ski-route overlay is on at zoom 11.5 and the user taps a route's halo
- **THEN** its card (or the candidate list) SHALL open

#### Scenario: Tap below zoom 11

- **WHEN** the ski-route overlay is on at zoom 10.5 and the user taps the map
- **THEN** no lookup SHALL happen, no message SHALL appear, and an open trail card SHALL close

#### Scenario: Route spanning tiles under the tap

- **WHEN** the user taps where a route's line crosses a map tile edge
- **THEN** that route SHALL be listed once

#### Scenario: Tap on a route without information

- **WHEN** the user taps a ski route that is not marked
- **THEN** no card SHALL open

#### Scenario: Offline tap on a marked route

- **WHEN** the device is offline and the user taps a marked route
- **THEN** no lookup SHALL happen, no card SHALL open, and the "Route details need a connection" snackbar SHALL appear

#### Scenario: Offline tap beside the routes

- **WHEN** the device is offline and the user taps where no marked route is within tolerance
- **THEN** no snackbar SHALL appear and the map SHALL behave as without overlays

#### Scenario: Only hiking trails on

- **WHEN** only the hiking-trail overlay is on and the user taps a hiking trail
- **THEN** no lookup SHALL happen and the map SHALL behave as without overlays

#### Scenario: Tap on a tour marker

- **WHEN** the ski-route overlay is on and the user taps a tour marker lying on a route
- **THEN** the tour SHALL be selected as today and no lookup SHALL happen

#### Scenario: Picking a location

- **WHEN** the user is picking a tour location and taps on a ski route
- **THEN** no lookup SHALL happen

#### Scenario: Thumb-sized tolerance

- **WHEN** on a touch device the user taps 20 px beside a marked ski route
- **THEN** the route SHALL be found

### Requirement: Taps while a sheet is open

A background tap while the trail card is open SHALL run a new lookup: a hit SHALL replace the card's content, a miss SHALL close the card. A background tap while any other sheet is open SHALL only close that sheet, as today.

#### Scenario: Tap another route with the card open

- **WHEN** the trail card shows route A and the user taps route B
- **THEN** the card SHALL show route B and route A's highlight SHALL be gone

#### Scenario: Miss with the card open

- **WHEN** the trail card is open and the user taps where no route is found
- **THEN** the card and its highlight SHALL close

#### Scenario: Tap with a tour sheet open

- **WHEN** a tour's details are open and the user taps a ski route
- **THEN** the tour sheet SHALL close and no lookup SHALL happen

### Requirement: Several routes under the tap are listed

When a lookup finds exactly one route, the card SHALL open on its details. When it finds several, the card SHALL open as a list ordered by distance from the tap (nearest first), each row showing target · altitude and difficulty (or the route name / "Ski route" without info). At most 8 rows SHALL be shown, followed by a "+N more — zoom in" note. All listed routes SHALL be faintly highlighted. Choosing a row SHALL open that route's details with a back control to the list.

#### Scenario: Shared approach

- **WHEN** the user taps a forest track shared by three ski routes
- **THEN** the card SHALL list the three routes nearest-first and all three SHALL be faintly highlighted

#### Scenario: Pick from the list

- **WHEN** the user chooses the second row
- **THEN** the card SHALL show that route's details, only that route SHALL be fully highlighted, and back SHALL return to the list

#### Scenario: More than eight routes

- **WHEN** a tap finds 12 routes
- **THEN** the list SHALL show the 8 nearest and a "+4 more — zoom in" note

#### Scenario: Miss

- **WHEN** the tap finds no marked route
- **THEN** no highlight and no card SHALL appear, and nothing else on the map SHALL change

### Requirement: Selected route is highlighted

The selected route's full line geometry SHALL be drawn as a highlight above the overlays and below tour markers while the card is open. Closing the card SHALL remove all highlights. Highlights SHALL survive a base-map switch.

#### Scenario: Highlight follows the card

- **WHEN** the user closes the trail card
- **THEN** every route highlight SHALL disappear

#### Scenario: Highlight survives a base-map switch

- **WHEN** a route is highlighted and the user switches the base map
- **THEN** the highlight SHALL render again after the new base map loads

### Requirement: Trail card placement and framing

The trail card SHALL open as a bottom sheet on mobile and a side drawer on desktop, like tour details. It SHALL open only once the lookup has resolved, with its final content. When the highlighted geometry (all candidates in the list, the chosen route in details) is not fully visible beside the card, the map SHALL move to frame it; otherwise the camera SHALL NOT move, unless the route was just chosen from the list. Selecting a tour SHALL close the trail card. The card SHALL credit swisstopo.

#### Scenario: Route hidden behind the sheet

- **WHEN** the card opens and part of the route lies under the sheet or drawer
- **THEN** the map SHALL fly so the whole route is visible beside it

#### Scenario: Route already visible

- **WHEN** a lookup opens the card on a single route that is already fully visible beside it
- **THEN** the camera SHALL NOT move

#### Scenario: Back to the list

- **WHEN** the user goes back from a chosen route to the list and all candidates are visible beside the card
- **THEN** the camera SHALL NOT move

#### Scenario: Desktop

- **WHEN** the card opens on desktop
- **THEN** it SHALL appear as a side drawer, not a centered dialog

#### Scenario: Card opens with final content

- **WHEN** a tap finds a route
- **THEN** the card SHALL open already showing its details or list, with no placeholder text that later changes

### Requirement: Route chosen from the list fills the map

Choosing a route from the trail card's list SHALL always move the map so that route is centred in the map area left beside the card and fills it as far as possible without any part cut off, zooming in or out as needed up to zoom 15, even when the route was already fully visible.

#### Scenario: Route chosen from the list

- **WHEN** the card lists several routes and the user chooses one
- **THEN** the map SHALL fly so the chosen route is centred beside the card and fills that area with nothing cut off, even if it was already fully visible
- **AND** a route larger than that area SHALL make the map zoom out until it fits

#### Scenario: Short route chosen from the list

- **WHEN** the user chooses a short route from the list
- **THEN** the map SHALL zoom in past the tour zoom (12), at most to zoom 15, to fill the area beside the card

### Requirement: Ski route details

The card SHALL show route name, target and its altitude, difficulty, ascent time,
climb and descent, and its SAC tour portal link, laid out like a tour's:
the ski-tour disc, the altitude as headline, the difficulty as grade badge with the ascent time
(labelled as the ascent's, at the user's pace) and climb/descent beside it, "Plan as tour" and the
SAC link as full buttons. Text and link SHALL use the UI language when Swisstopo provides it, else
the original. Missing fields SHALL be omitted.

#### Scenario: Route with full information

- **WHEN** the selected ski route has a name, target, difficulty, ascent time, ascent/descent and an SAC link
- **THEN** the card SHALL show all of them, and the SAC link SHALL open in a new tab

#### Scenario: Ascent time at the user's pace

- **WHEN** SAC states an ascent time of "05:00 h" and the user's pace is 1.2
- **THEN** the card SHALL show "Ascent 4:10 h" with the badge "1.2×" beside it

#### Scenario: Ascent time in other words

- **WHEN** SAC states the ascent time as "4-5 h"
- **THEN** the card SHALL show "Ascent 4-5 h" as SAC gives it

#### Scenario: Name missing in UI language

- **WHEN** the UI language is English and the route has only a German name
- **THEN** the card SHALL show the German name

#### Scenario: Narrow phone

- **WHEN** the card shows a route with every field on a 360 px wide phone in German
- **THEN** the facts SHALL wrap between items, never inside one, and both buttons SHALL show their
  full label

### Requirement: Lookup failures and stale results

When loading the found routes' details fails (network error, non-OK response, or a response that fails validation), a tap SHALL show a localized error snackbar, open no card and leave the map unchanged. A newer tap SHALL supersede a pending one: the older result SHALL never be applied.

#### Scenario: Network error

- **WHEN** loading a tapped route's details fails
- **THEN** a localized "Couldn't load route info" snackbar SHALL appear and no card SHALL open

#### Scenario: Second tap during a load

- **WHEN** the user taps route A and, before its details load, taps route B
- **THEN** only route B's card SHALL open, even if A's details arrive last

#### Scenario: Pan during a load

- **WHEN** the user pans the map before a tapped route's details have loaded
- **THEN** the card SHALL still open for the tapped route once they load

### Requirement: Trail data includes full line geometry

Every route shown in the card SHALL carry its identity (overlay and feature id), its attributes, and its complete line geometry as one or more continuous WGS84 longitude/latitude polylines. This geometry SHALL be the one used for highlighting, framing and the card, and SHALL NEVER be assembled from map-tile fragments, so a route crossing tile edges or partly off screen is still highlighted and framed whole.

#### Scenario: Multi-line ski route

- **WHEN** a ski route consists of several lines
- **THEN** the route SHALL carry every part as its own polyline and the highlight SHALL draw all parts

#### Scenario: Route partly off screen

- **WHEN** the user taps a route whose line continues beyond the viewport
- **THEN** the highlight SHALL cover the whole route and the map SHALL frame all of it

### Requirement: Dataset refresh while the app is running

When the ski-route dataset is republished while the app is open, the app SHALL switch to the new version without showing an error: routes SHALL keep rendering, and a tapped route's details SHALL load from the new version. A tapped route that no longer exists in the new version SHALL be treated as a miss, silently.

#### Scenario: Tap after a refresh

- **WHEN** the app loaded the previous version and the user taps a route after a refresh was published
- **THEN** the route's card SHALL open with the new version's details and no error SHALL appear

#### Scenario: Route removed in the new version

- **WHEN** the tapped route was removed in the new version
- **THEN** no card and no error SHALL appear, and the route SHALL no longer be marked once the map reloads its tiles

### Requirement: Plan a tour from a ski route

A ski route's card SHALL offer "Plan as tour". It SHALL open the tour creation with the goal on
the route's target summit (named and high as the target), the start at the route end farthest
from it with the looked-up name and height, the activity ski tour, the route's difficulty as
grade, and the route name with the SAC link as description. Everything SHALL stay editable.

#### Scenario: Planning the Bundstock route

- **WHEN** the user opens the route "Von Tschingel" to the Bundstock (2756 m, WS+) and taps "Plan as tour"
- **THEN** the creation form SHALL open named "Bundstock" with goal height 2756, a start at the route's foot, activity ski tour and grade "WS+"

#### Scenario: The route ends on a variant

- **WHEN** a multi-part route's last point lies in the valley, away from its target "Furggegütsch (Hohgant)"
- **THEN** the goal SHALL be the summit Furggegütsch found by name near the route

#### Scenario: Search unavailable

- **WHEN** the place search fails (offline) or finds no same-named summit near the route
- **THEN** the route's last point SHALL be the goal

### Requirement: A planned ski route carries its line

"Plan as tour" SHALL also take the route's own line as the new tour's track: from the plan's start
along the route's parts up to the route point nearest the goal and, when the route states a
descent, down to the plan's end — saved as GPX with terrain heights so the tour's climb, descent
and distance come from it and match the route's. Parts that do not connect SHALL fall back to the
route's longest part, run from the end nearer the start. The track SHALL stay editable on the map.

#### Scenario: Planning a ski route

- **WHEN** the user plans the route "Sustenhorn" (1640 m up and down) as a tour and saves it
- **THEN** the tour SHALL show the route's line as its track, and climb and descent close to the route's stated 1640 m each

#### Scenario: A variant branches off

- **WHEN** a route has a variant part branching to another top
- **THEN** the track SHALL run to the goal and leave the variant out

### Requirement: A planned route starts and ends where its figures say

A planned route's start and end SHALL be loose ends of the route (where no other part meets it):
the start the one whose terrain height lies the route's climb below its summit, the end the one its
descent below — another end for a traverse, the start again (back the same way) for most routes.
Without those heights or figures, the start SHALL be the loose end farthest from the goal and the
way down the way up.

#### Scenario: A traverse

- **WHEN** the user plans "Eggerhorn, von Binn über Äbnimatt mit Abfahrt nach Ausserbinn" (1100 m up, 1200 m down) as a tour
- **THEN** the track SHALL start at Binn, run up to the summit and down to Ausserbinn, and the form SHALL take Binn as start and Ausserbinn as end

#### Scenario: Offline

- **WHEN** the terrain heights can't be had
- **THEN** the start SHALL be the loose end farthest from the summit and the track SHALL return to it

### Requirement: Plan a ski route from the goal pick

While picking a new tour's goal (not a segment's, not an edit's) with ski routes shown and online, a
tap on a marked ski route SHALL open its card as on the map, and the picker SHALL say so in a line
above its search. "Plan as tour" SHALL plan it with its line as track; closing the card SHALL return
to the goal pick.

#### Scenario: Tap a route while picking the goal

- **WHEN** the user taps "+", sees ski routes, and taps a marked route instead of confirming the crosshair
- **THEN** the route's card SHALL open, and "Plan as tour" SHALL open the form with goal, start and track from the route

#### Scenario: Back to picking

- **WHEN** the user closes that card
- **THEN** the goal pick SHALL be active again
