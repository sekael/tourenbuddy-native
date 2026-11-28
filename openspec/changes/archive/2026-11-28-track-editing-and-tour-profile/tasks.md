# Tasks

## 1. Points answer at once

- [x] 1.1 Patch `MLRNPointAnnotation setReactDraggable:`: `minimumPressDuration = 0` on its long-press recognizers, also those added later (patch-package, existing patch file)
- [x] 1.2 `TrackHandles`: a tap selects; only the selected handle is draggable; a drag ending within 8 pt of its start is the tap, `drag` cleared; tests for tap, slow tap, move and pull
- [x] 1.3 Owner: dev build (`review-up.sh --build`); Simulator check that a drag from the first movement moves the point, the map stays, and a tap on a handle sets no map point

## 2. Undo and redo

- [x] 2.1 Route step history (`placed`, `drawnVias`, `backSame`) through `useHistory` (tests: steps, redo cleared, empty); selection of points between; delete for the selected point
- [x] 2.2 `EditActions` row (undo, redo, delete) at the top of both sheets; the draw sheet's bar actions removed (the phone's bar didn't show them)

## 3. Elevation profile in the tour sheet

- [x] 3.1 `ElevationProfile` (native): `onScrub`, cursor and label; tests for x → place along the line, release clears
- [x] 3.2 `trackCursor` in the map store; `TourMap` draws it; cleared when the tour sheet closes
- [x] 3.3 `TourDetailPage`: profile under the hero when the track has heights (`trackProfile` tests: pieces joined, no heights → none; the page itself checked in the Simulator)
- [x] 3.4 Web: `ElevationProfile.web` with pointer scrub (a press and drag, never hover), `trackCursor` in the web map store, a marker on the web map, profile in `tour-info-sheet.web.tsx`; tests with DOM Testing Library
- [x] 3.5 Labels in `en.json` and `de-CH.json`: delete button, select/selected hints (the web's shared hint keys unchanged)

## 4. Checks

- [x] 4.1 `npm run check`
- [x] 4.2 Persona review on the Simulator (route step, drawing, tour sheet profile) and the web build on desktop width
- [x] 4.3 Owner on the iPhone 15 after TestFlight: grab and drag, slow taps, scrubbing inside the sheet

## 5. Second simulator review (owner, 2026-11-26)

- [x] 5.1 Form order: height with the name, partners on their own after dates and seasons, the route after the grade
- [x] 5.2 `lineEnds` (tests) for "Plan as tour", GPX import and a drawing without a goal
- [x] 5.3 "Round trip" row in the form's route section; `makeRoundTrip` (tests: no track, ski route, route-step plan); the web's button takes a ski route's track back down
- [x] 5.4 The tour sheet's profile 112 pt with room for the label (native and web)
- [x] 5.5 Persona review rounds on the Simulator and the web (round 5 PASS)

## 6. The dot stays in view (owner, third review)

- [x] 6.1 `keptInFrame` (tests: still in the middle, just far enough past it, under the sheet, unmeasured map); `shareColor`; the spot's `share`
- [x] 6.2 Native: `TourMap` follows the cursor; the dot in the activity's colour (map and profile)
- [x] 6.3 Web: the marker in the activity's colour; `panBy` past the middle beside the drawer or sheet
- [x] 6.4 Persona review on the Simulator and the web (round 7 PASS)

## 7. Fourth review (owner, web)

- [x] 7.1 Web profile scrubs only while the mouse is pressed and dragging, never on hover (tests)
- [x] 7.2 Web form: the grade in the activities' section, above the route, as in the app
- [x] 7.3 Persona review on the web (round 8 PASS)
- [x] 7.4 Web grade chips: the activity's icon centred on its chips, which wrap beside it (owner)
- [x] 7.5 Web route planner: the overlay toggles while picking start, goal and end (O-11)

## 8. Multi-day tours in one go on iOS (owner, O-12)

- [x] 8.1 `carriedForward` (tests: activities, partners as a set, dates following, a day dated on its own, a cleared date)
- [x] 8.2 Draft store days: `stages`, `active`, `dayCount`, `nextDay`, `selectDay`, `removeDay`, `days`, carry on `update` and `toggleType`, `firstUnsavableDay` (tests)
- [x] 8.3 Form: day pills, "Next day", "Split into daily stages", "Remove day", "Plan day n", one save as one outing, cancel discards all
- [x] 8.4 Route step: day pills, "Next day" in place, a fresh sheet per day
- [x] 8.5 Persona review on the web (overlays, round 9 PASS) and the Simulator (multi-day, round 10 PASS)

