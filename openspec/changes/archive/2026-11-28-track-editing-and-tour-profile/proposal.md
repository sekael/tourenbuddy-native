# Proposal

## Why

From the owner's first TestFlight review on the iPhone 15 (2026-11-26), on top of the eight fixes
already in `fix/ios-feedback`:

1. Shaping a line in the route step and while drawing feels unresponsive. Pressing a point "does
   not always register", and points seem not to move. Seen in the Simulator: a point moves only
   after a 0.5 s hold. A drag that starts sooner pans the map, and the point stays put. A press held
   about that long, then let go, is neither a tap nor a move. The route step has no undo and redo,
   so a point removed by a tap or moved by mistake can't be got back. Drawing has them.
2. A tour with a GPX track shows its numbers (climb, descent, distance, time) but not its
   elevation profile. The drawing sheet already draws one. The owner wants it in the tour sheet,
   at its top so the map stays visible above, and dragging along it shows the place on the map. On
   iOS, Android and the web (bottom sheet on phones, side drawer on desktop).

## What Changes

- **Select, then move (owner, 2026-11-26):** a tap on a point or a leg's middle dot selects it,
  every time, however long the finger rested. A tap never removes a point. The selected point is
  dragged from the first movement (no hold, the map stays still) or moved to the next map tap. On
  iOS the immediate drag needs a native patch to MapLibre's annotation drag recognizer (existing
  `patches/@maplibre+maplibre-react-native+11.5.1.patch`), so a new dev build.
- **Undo, redo and delete, in reach:** three buttons side by side in the sheet of the route step and
  of drawing, as in the swisstopo app. Delete removes the selected point. Today neither step shows
  undo or redo on the phone (drawing's sit in the bar, where the phone doesn't show them). "Back"
  keeps leaving the step.
- **Elevation profile in the tour sheet:** the tour's track (all its legs, in the activity colours)
  under the overview at the top of the sheet. It shows only when the tour has a track and heights
  for it (from the file, else swisstopo's terrain profile online). Touching or dragging along it, or
  dragging with the mouse pressed on the web, shows a cursor with the height and distance there, and a dot on
  the map at that place on the track. Letting go removes both.

- **After the second simulator review (owner, 2026-11-26):**
  - The tour form's sections follow the spec's order. Today a "Details" section holds the goal's
    height next to the partners. The height now sits with the name, and the partners get a section
    of their own after the dates and seasons.
  - "Round trip" is one tap in the form's route section, as in the route step and the web form.
    It sets the end at the start and sends the track back the same way. "Plan as tour" on a ski
    route without a way down no longer sets the summit as the tour's end, which hid the option. A
    track end at the goal sets nothing (spec "GPX fills empty points"), the same for an imported
    file and a drawing.
  - The tour sheet's profile is taller, with room above its line for the cursor's label. At half
    height the switches "Completed" and "Private" give way to it.

- **Third review (owner, 2026-11-26):** while scrubbing the profile, the map's dot never leaves the
  view. The map stays still while the dot is in its middle, then moves along with it at any zoom.
  The dot wears the track's activity colour there.

- **Fourth review (owner, 2026-11-26):** on the web, only a pressed drag scrubs the profile; the web
  form asks the grade above the route. Then, after accepting the handoff:
  - The web route planner (start, goal, end) gets the trail overlays' toggles, as the drawing panel
    has them: the map menu is hidden while picking, so there was no way to show the ski routes
    before drawing.
  - The native app lays out a multi-day tour in one go, as the web does (owner: "Must have feature
    parity on mobile"; full parity on this branch, by the owner's choice): "Next day" in the form
    and the route step, the days as pills to switch between, a later day removable, "Split into
    daily stages" while creating, one save creating every day as one outing, cancel creating
    nothing.

## Capabilities

### Modified Capabilities

- `track-drawing`: a tap selects, the selection drags at once or moves to the next map tap; undo,
  redo and delete in both steps' sheets.
- `tour-info-extended`: the elevation profile in the tour sheet, scrubbing to the map; the compact
  overview includes it.
- `adaptive-lists-forms`: the profile in the tour detail sits at the top of the sheet, not in a list
  section.
- `tour-form-extended`: the form's order (height with the name, partners on their own); "Round
  trip" in the native form, track included, also when the tour ends on its goal.
- `tour-outings`: the native app gets the stages laid out before the first save, the days in the
  route step and the split while creating (the requirements are the web's, unchanged).
- `map-trail-overlays`: the overlays switch from the web route planner too.

## Impact

- Native: `track-handles.tsx`, `plan-sheet.tsx`, `draw-sheet.tsx` (if the bar hides undo and redo),
  `elevation-profile.tsx`, `tour-detail-page.tsx`, `map-store.ts`, `tour-map.tsx`, the MapLibre RN
  patch (iOS native code: a new dev build, `review-up.sh --build`).
- Web: `elevation-profile.web.tsx`, `tour-info-sheet.web.tsx`, `map-store.web.ts`,
  `tourenbuddy-map.web.tsx`, `tour-form.web.tsx` (its "Round trip" sends a ski route's track back
  down too).
- Native, second review: `tour-form-screen.tsx`, `replan-track.ts` (`makeRoundTrip`, `savedLine`),
  `trail-sheet.tsx`, `draw-sheet.tsx`, `distance.ts` (`lineEnds`).
- Native, fourth review: `tour-draft-store.ts` (the days), `outing.ts` (`carriedForward`),
  `day-pills.tsx`, `tour-form-screen.tsx`, `plan-sheet.tsx`, `plan-route.tsx`. Web:
  `route-planner.web.tsx` (overlay chips), `elevation-profile.web.tsx` (drag only),
  `tour-form.web.tsx` and `grade-chips.web.tsx` (grade above the route, icon centred).
- No backend, schema or i18n changes beyond a few labels (en, de-CH).
- Owner checks on the iPhone 15 after TestFlight: grab and drag feel, tap vs. small drag, profile
  scrubbing inside the sheet.

## Decisions (owner, 2026-11-26)

- A tap selects, delete removes (trash next to undo and redo, as in the swisstopo app).
- The profile comes after the name and numbers; the switches "Completed" and "Private" may move
  below the fold at half height on a 6.1-inch phone.
- Same branch as the TestFlight fixes (`fix/ios-feedback`), one commit.
- Assumed: the cursor and the map dot show only while the finger or the pressed mouse is on the
  profile; the camera doesn't follow them (the third review changed that: it keeps the dot in view).
- Second review: the important facts at half height are the title, height, distance, time, metres
  up and down, the profile, activities and grade; the switches need not show there.
