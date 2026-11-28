# Design

## Context

- Handles are MapLibre RN `ViewAnnotation`s (`track-handles.tsx`). On iOS each is an
  `MLNAnnotationView` whose drag is a `UILongPressGestureRecognizer` with UIKit's default
  0.5 s `minimumPressDuration`, plus a pan that only runs once that has begun. Our patch
  (`patches/@maplibre+maplibre-react-native+11.5.1.patch`) already reports live `onDrag` positions.
  Taps come from the library's own `UITapGestureRecognizer` (`customViewTap`) → `onPress`.
- Seen in the Simulator (2026-11-26): a drag that starts at once on a point pans the map. A leg
  dot's tap picks and releases it reliably. A press held about 0.5 s and let go starts and ends a
  drag without moving, so `onDragEnd` re-routes the point where it was and no tap fires.
- The drawing step has history (`use-track-drawing.ts`: `past`/`future` of `DrawnTrack`). The
  route step (`plan-sheet.tsx`) keeps `placed` (start, goal, end with looked-up names and heights),
  `drawnVias` and `backSame` in state, with no history.
- The tour sheet (`tour-detail-page.tsx`) gets the tour's track with heights from `useRouteMetrics`
  (`withHeights`: the file's `<ele>`, else swisstopo's profile online). The web's
  `use-route-metrics.web.ts` does the same per tour. `ElevationProfile` exists for native (SVG) and
  web, with no touch handling.

## Decisions

### D1: The selected handle drags at once (iOS native patch)

Only the selected point or dot is `draggable`. The others take taps only, so a pan that starts on
an unselected point still pans the map, and a tap never moves anything by accident. In
`MLRNPointAnnotation setReactDraggable:`, after `self.draggable = …` (which creates MapLibre's
recognizers), the patch sets `minimumPressDuration = 0` on the view's
`UILongPressGestureRecognizer`s. The selected handle's drag then begins on touch-down: the first
movement moves it, and the map never sees the pan. Its tap arrives as a drag that ends where it
began (D2).

Rejected: a short duration (0.1–0.2 s). It keeps two paths and the same failure for a finger that
moves sooner. Also rejected: JS gestures over the map (no gesture library installed, and the
screen-to-map conversion is async per frame). Android keeps MapLibre's own drag and gets D2
unchanged.

### D2: Tap selects; a drag that didn't move is a tap

`onPress` on any handle toggles its selection (`pick`): select, or release when it is the
selected one. A selection haptic. On the selected handle, `onDragEnd` within 8 pt of
`onDragStart`'s screen point is that tap. Otherwise it is a move or a pull, as now. A moved point
stays selected, to be dragged again; a pull ends the selection (the leg is two then). In the
route step a start, goal or end is selected as the active row, which stays one. A map tap with a selection moves the point there (a leg's dot:
pulls the leg through there) and releases it. Without one, it sets a point (drawing) or the
active stop (route step), as now. The sheet's hint follows the state.

### D3: Undo, redo and delete in the sheet; route-step history

A shared `EditActions` row (three icon buttons: `undo`, `redo`, `delete`, labelled, 44 pt targets)
in both sheets' `header`, so it is in reach at every detent. The bar keeps Back and Done; the
draw sheet's bar actions go. Delete calls the step's `drop` for the selected point, disabled for
none, a leg's dot or the goal.

The route step gets history: `past` and `future` snapshots of `{ placed, drawnVias, backSame }`.
Every user change commits the state it replaces before it applies: tap, search pick, move, pull,
delete, round trip on or off. Legs aren't part of a snapshot: they're a cache keyed by ends and
follow mode, so restored points find their legs again (or route them). A restored point whose
lookup was still running is looked up again. The selection clears on undo and redo. Drawing keeps
its own history (`use-track-drawing.ts`).

### D4: Profile in the tour sheet, scrubbing to the map

- **Data:** `useRouteMetrics(tour).track` → `trackLines` joined in file order → `line` and
  `heights` (the third coordinate). It shows only with at least 2 heights. Bands:
  `routeShares(tour, goalShare(trackFromLine(line), tour))`, the same colours as the line on the
  map.
- **Place:** in `TourDetailPage`'s `header`, after the hero, so it sits at the top of the sheet in
  every detent. The web: in the info sheet's view mode, under the hero, in the bottom sheet and the
  desktop drawer alike.
- **Scrub:** `ElevationProfile` gets `onScrub?: (spot: ProfileSpot | null) => void`. iOS: a
  see-through horizontal `ScrollView` over the chart, its content 200 000 pt wide and starting in
  the middle. iOS 26's swipe back works anywhere on a pushed page and a JS responder can't hold it
  off (seen in the Simulator: scrubbing popped the tour page). A scroll view that can scroll
  sideways can. The finger's x is where it touched the content, less the offset since. Android:
  responder props on the box. The x position maps to a distance, then to the nearest station, interpolated by
  `pointAlong`. Web: pointer events with pointer capture, and `pointerleave` ends it. The profile
  draws a vertical cursor, a dot on the line and a label "2 310 m · 4.2 km".
- **Map:** a new `trackCursor: { point, color } | null` in `map-store.ts` and `map-store.web.ts`.
  Native: `TourMap` draws it as one more point in a small circle layer above the tour lines (white
  ring, the activity's colour, D8). Web: a `maplibregl.Marker`. The camera follows it (D8). Closing
  the sheet clears it.
- **Accessibility:** the profile stays hidden from VoiceOver (the numbers say the same). Reduce
  Motion: the cursor has no animation.

### D5: The form's order (second review)

The native form drops its "Details" section. The height joins the name, as on the sheet's hero
and in the web form. Partners take one section after the dates and seasons: chips when there are
people often along, else a single row. The route moves up after the grade. Activities and grade
stay together because the grade's chips follow the activities.
The web form does the same (owner, fourth review): its grade leaves the route's section for the
activities', so both forms read activities, grade, route.

### D6: Round trip in the form (second review)

A shared `lineEnds(first, last, goal)` (`tours/domain/distance.ts`) turns a line's ends into the
route's start and end. An end within 200 m of the goal is the goal (null), and a loop ends exactly
at its start. "Plan as tour", the GPX import and a drawing without a goal use it, as the spec's
"GPX fills empty points" says and the web form already does. A ski route up to its summit then has
no end, so "Round trip" shows. `makeRoundTrip` (`replan-track.ts`) first sets the end, so the row
is gone before a second tap. A route-step plan goes back as `backSame` with its track doubled, and
anything else gets the start copied into the end. Then the track (`savedLine`: the pending one,
else the saved GPX) becomes `withWayBack(drawing ?? trackFromLine(line))`, exactly as drawing's
"To start". The web's button now also takes a drawing without a goal (a ski route's) back down.

### D7: A taller profile in the sheet (second review)

A profile that scrubs (the tour sheet's, native and web) is 112 pt high, and its line starts 26 pt
down, under the cursor's label. Drawing keeps 72 pt. The extra 40 pt fit at half height on a 6.1-inch
phone with a date line and a second row of chips. The switches go below the fold.

### D8: The map keeps the dot in view (owner, third review)

The owner asked to keep the dot in frame, centring on it if that's friendlier. A dead zone, as a
game camera has: `keptInFrame` (`camera-flight.ts`) takes the map's bounds, its size and what the
sheet or drawer covers. It returns null while the dot is in the middle half of what's left, else
the pan that puts it back on that edge (centre, bounds, points). Rejected: always centring. It
moves the whole map at every step even when the tour shows whole, and the overview the default
framing gives is lost. Native: `TourMap` reads the bounds from `onRegionDidChange`. While a finger
scrubs it keeps its own view (the bounds it last moved to), since the map's reports come a frame
later. It moves with `easeTo(duration 0)` and the sheet's padding. Web: `map.getBounds()` and
`panBy(by, { duration: 0 })`, both synchronous. Under half a point past counts as on the edge (no
pan for rounding). Moves are instant, so Reduce Motion needs nothing. The dot's colour is the band
at the spot's share of the line (`shareColor(routeShares(...))`), the same on the profile and the
map.

On the web only a press and drag scrubs (owner, fourth review): a mouse passing over the drawer's
profile used to move the dot and, with the follow, jerk the map. `pointermove` with no button held
does nothing; releasing the button removes the cursor and the dot, as lifting a finger does.

### D9: Multi-day tours in one go on iOS (owner, fourth review)

The web keeps one form per day mounted and saves them together (`tour-creation-dialog.web.tsx`).
The native form is one screen over one draft store, so the store holds the days instead:
`stages` (every day's own fields: ids, draft, goal, track, route, way choices), `active` and
`dayCount` (a split span). The live fields stay the active day's, so the form, the route step and
the drawing work unchanged on whichever day shows; switching copies the live day into `stages` and
loads the other. `nextDay` seeds from the last day with the shared `nextSegmentSeed` (its end, else
its goal and place name; the day after; same activities, partners, visibility, seasons).

- **Shared fields follow (D11 of map-first-tour-creation):** `carriedForward` (`outing.ts`, pure,
  tested) hands a change of activities, partners or visibility on a day to each later day that still
  held the old value, and moves a later date that followed day by day. The store applies it on
  `update` and `toggleType`; a carried activity change recomputes that day's legs from its own way
  choices, a carried date its seasons.
- **Form:** the days as `Pills` at the top (`day-pills.tsx`), "Next day" after the end (on the last
  day), "Split into daily stages" when the dates span days, "Remove day n" at the end of a later
  day, a "Plan day n" row while a split span lacks a day. Save validates every day first
  (`firstUnsavableDay`), shows the first that fails, then creates them in order as one outing (a
  new id, or after the outing of an Add segment anchor) and opens the outing's overview. Cancel
  discards every day's uploads.
- **Route step:** keyed by the day's `draftId` (`plan-route.tsx`), so each day gets a fresh sheet
  that starts from the store. "Next day" commits this day's route and track, then lays out the next
  one in place; a day's pill commits and switches. A day without a goal yet is dropped when the
  user leaves it (cancel or another pill).
- **Left out:** the web moves the next day's start and first leg when a day's end moves; the
  native days keep their start (the user moves it in that day's route step). The route step draws
  only the day on screen: the map frames itself on the preview, so the other days' lines would
  zoom it out to the whole trip.

### D10: Overlays while picking on the web (owner, fourth review)

The map menu (with its layers panel) is hidden while picking, so the route planner shows the
overlay chips the drawing panel has (`TRAIL_OVERLAYS`, `toggleOverlay`), above its follow switch;
the layer the route follows is tinted as in the drawing panel.

## Risks

- D1 is native: it needs a dev build (`review-up.sh --build`), and the feel needs the iPhone 15
  (TestFlight). Without the new build, the selected point still drags after the 0.5 s hold, and
  the map tap moves it.
- A scrub inside the SwiftUI-hosted header: if the native sheet's pan still takes a horizontal drag,
  the profile claims it with `onMoveShouldSetResponderCapture`. To be checked in the Simulator.
- Half-height space: the profile (72 pt) pushes the owner switches below the fold on 6.1-inch
  phones. Accepted in the spec change, owner to confirm.
