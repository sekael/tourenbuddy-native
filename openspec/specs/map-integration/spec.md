## Purpose

MapLibre GL JS map with Swisstopo vector and WMTS layers, marker layers for tours, and bidirectional camera sync with the store.

## Requirements

### Requirement: MapLibre GL JS map with Swisstopo tiles

The app SHALL render a full-screen MapLibre GL JS map on the `/map` page using Swisstopo vector tiles. The initial view SHALL center on Switzerland (46.8°N, 8.2°E) at zoom level 8.

#### Scenario: Map loads with base style

- **WHEN** the map page is rendered
- **THEN** a MapLibre map SHALL initialize with the Swisstopo base vector tile style from `https://vectortiles.geo.admin.ch`

#### Scenario: Map cleanup on unmount

- **WHEN** the map page is navigated away from
- **THEN** the MapLibre map instance SHALL be destroyed to free resources

### Requirement: Map style switching

The map SHALL support switching between two Swisstopo styles: "Base" (the `ch.swisstopo.basemap.vt` vector style) and "Classic" (WMTS raster style loaded from a local JSON file). The style SHALL be chosen in the "Base map" section of the map layers panel. Switching styles needs the network: offline, the "Base map" section SHALL be disabled with a "Needs a connection" hint while the rest of the panel stays usable. Switching styles SHALL NOT change which trail overlays are on.

#### Scenario: Switch to classic style

- **WHEN** the user selects "Classic" in the "Base map" section of the map layers panel
- **THEN** the map SHALL load the WMTS style from `public/swisstopo_wmts_style.json` and re-render

#### Scenario: Switch back to base style

- **WHEN** the user selects "Base" in the "Base map" section of the map layers panel
- **THEN** the map SHALL revert to the vector tile style URL

#### Scenario: Overlays kept across a switch

- **WHEN** a trail overlay is on and the user switches the style
- **THEN** the overlay SHALL still be on and render after the new style loads

#### Scenario: Offline

- **WHEN** the device is offline and the user opens the map layers panel
- **THEN** the base-map options SHALL be disabled with a "Needs a connection" hint and the current style SHALL stay loaded

### Requirement: Tour markers rendered as circles

Tours SHALL be rendered on the map as circle markers using a MapLibre circle layer backed by a GeoJSON source. The circle color SHALL be derived from the tour's activity types, in six groups: piste (skiing, snowboarding) in sky blue, ski touring (skitour, splitboarding, ski-mountaineering) in indigo, hiking and trailrunning in rose red, alpine (mountaineering, climbing) in rock brown, mountain-biking in plum, paragliding in amber, and tours with no type in neutral grey. Six is the most colours that stay distinguishable when any two markers sit side by side, for colour-blind and full-colour vision alike and against the green completion badge and the grey; the activity glyph tells the types within a group apart. A tour whose types map to more than one of these colors SHALL render split between them (see "Multi-activity markers split between their colours").

Every goal circle SHALL carry a thin white ring, and a tour with at least one activity SHALL show the white glyph of its primary (first) activity centred in the circle, so that each activity is recognisable within a colour family and app markers never read as basemap symbols. A tour without an activity SHALL show no glyph.

Each GeoJSON feature SHALL additionally carry a `completed` boolean property mirroring the tour's `completed` field. A completed tour SHALL show a completion badge (a small green disc with a white check) on the lower right edge of its circle. A friend tour SHALL show a friendship badge, and a linked tour a link badge instead, on the lower left edge. The circle radius and stroke for completed tours SHALL remain identical to not-completed tours. Selected-state styling (larger radius, thicker white stroke) SHALL apply to completed tours identically, and the badges SHALL still render on top of the selected-state circle. Clicking a completed tour's marker SHALL trigger the same selection and fly-to behavior as a not-completed tour. GPX track rendering SHALL be unaffected by completion state. Not-completed tours SHALL render with no completion badge.

#### Scenario: Tours displayed on map

- **WHEN** the tours store has loaded tours
- **THEN** each tour SHALL appear as a circle marker at its goal coordinates

#### Scenario: Selected tour highlighted

- **WHEN** a user clicks on a tour circle
- **THEN** the selected tour SHALL render with a larger radius (18px vs default 14px) and a white stroke

#### Scenario: Tour selection shows info

- **WHEN** a user clicks on a tour circle marker
- **THEN** the map SHALL fly to the tour location and display the tour info component

#### Scenario: Winter tour colored blue

- **WHEN** a tour's types are all among skiing, snowboarding, skitour, splitboarding, or ski-mountaineering
- **THEN** its circle marker SHALL render in a winter blue: sky blue for a piste day, indigo for a ski tour

#### Scenario: Summer tour colored red

- **WHEN** a tour's types are all among hiking or trailrunning
- **THEN** its circle marker SHALL render in rose red

#### Scenario: Hike and alpine tour apart

- **WHEN** one tour is a hike and another a Hochtour
- **THEN** the hike SHALL render rose red and the Hochtour rock brown

#### Scenario: Paragliding tour colored amber

- **WHEN** a tour's only type is paragliding
- **THEN** its circle marker SHALL render in the paragliding (amber) palette color

#### Scenario: Unknown tour type falls back to neutral

- **WHEN** a tour has no activity type
- **THEN** its circle marker SHALL render in the neutral (grey) fallback color with no activity glyph

#### Scenario: Activities of one colour tell apart

- **WHEN** one tour's primary activity is mountaineering and another's is climbing
- **THEN** both markers SHALL be rock brown, one showing the mountaineering glyph and the other the climbing glyph

#### Scenario: Completed tour shows distinct visual

- **WHEN** a tour has `completed === true`
- **THEN** the marker SHALL show the completion badge on the lower right edge of the type-colored circle
- **AND** the circle radius and stroke SHALL be identical to not-completed markers

#### Scenario: Selected completed tour

- **WHEN** a completed tour becomes the selected tour
- **THEN** the marker SHALL show the selected-state larger radius and white stroke
- **AND** the completion badge SHALL remain rendered on top

#### Scenario: GPX track unaffected by completion

- **WHEN** a completed tour has a GPX track displayed on the map
- **THEN** the track SHALL render with the same style as for a not-completed tour

#### Scenario: Completion toggle reflects on map immediately

- **WHEN** a tour's `completed` field changes in the tours store
- **THEN** the corresponding map marker SHALL update its visual within the same reactive tick, with no page reload required

### Requirement: Start and end markers shown only while viewing or editing a tour's details

The map SHALL render a tour's **start** and **end** point markers ONLY while that tour's details are being viewed or edited (its info sheet is open, i.e. it is the selected tour) OR while a tour is being created. An open outing overview shows its segments' loose ends and handover rings instead (gpx-tracks → Outing overview start and end markers, Outing handover points). The standard map view, with no tour selected, no outing overview open and no tour being created, SHALL NOT show any start or end markers. Start/end markers SHALL NOT participate in clustering, collision suppression, or the goal-marker click/selection behavior. Start/end markers SHALL be display-only (non-interactive): a tap on a start or end marker SHALL be swallowed — it SHALL NOT select a tour, fly to it, NOR dismiss the open info sheet or cancel an in-progress tour creation. The same start/end markers SHALL be shown for a partner friend tour's details exactly as for an owned tour, with no friend-specific icon on the start or end marker.

Start/end markers SHALL reuse the goal marker's GL rendering mechanism: a circle in the tour's type-based color with a sibling symbol layer carrying the icon, kept on a selection-scoped source separate from the clustering source, and rendered beneath the goal marker so the goal stays on top when they overlap.

A start/end marker SHALL reuse the goal marker's circle design and the tour's type-based color, distinguished by a centered white icon: the **start** marker SHALL carry the start icon and the **end** marker SHALL carry the end icon, matching the icons the tour info sheet uses for those points (the ring `trip_origin` for start, the chequered flag `sports_score` for end; see tour-info-extended → Point icons match the form). The completion check glyph SHALL remain on the goal marker only — completing a tour SHALL NOT change its start or end markers.

The **start** marker SHALL be shown whenever the tour has a start point. The **end** marker SHALL be shown whenever the tour has an end point, unless it is the same place as the start point (within 10 m). A round-trip tour (end point in the same place as the start point, within 10 m) and a one-way-to-goal tour (no end point) SHALL therefore show a start marker and no end marker, mirroring the info sheet's treatment. A tour with an end point but no start point (a stage connected to the next one) SHALL show the end marker alone.

When the tour's details are closed (deselected) the start/end markers SHALL be removed. On a map style switch the start/end markers SHALL be re-rendered for the still-selected tour, the same as the goal and GPX layers.

#### Scenario: Start and end markers appear when a tour's details open

- **WHEN** a tour with a start point and a distinct end point becomes the selected tour and its info sheet opens
- **THEN** a start marker SHALL render at the start point and an end marker at the end point, both in the tour's type-based color with the start/end icons respectively
- **AND** the goal marker SHALL continue to render as before

#### Scenario: No start/end markers on the standard map

- **WHEN** no tour is selected, no outing overview is open and no tour is being created
- **THEN** no start or end markers SHALL be rendered anywhere on the map
- **AND** clustering and collision behavior SHALL be computed from goal markers only

#### Scenario: Round-trip tour shows start only

- **WHEN** the selected tour's end point is the same place as its start point (within 10 m)
- **THEN** a start marker SHALL render and NO end marker SHALL render

#### Scenario: One-way-to-goal tour shows start only

- **WHEN** the selected tour has a start point but no end point
- **THEN** a start marker SHALL render and NO end marker SHALL render

#### Scenario: End without a start shows the end marker alone

- **WHEN** the selected tour has an end point but no start point
- **THEN** an end marker SHALL render at the end point and NO start marker SHALL render

#### Scenario: Friend tour shows identical start/end markers

- **WHEN** a partner friend tour's details are open
- **THEN** its start/end markers SHALL render with the same design as an owned tour's, with no additional friend icon on the start or end marker

#### Scenario: Completion does not change start/end markers

- **WHEN** the selected tour is completed
- **THEN** the check glyph SHALL appear only on the goal marker
- **AND** the start and end markers SHALL render unchanged

#### Scenario: Tapping a start/end marker is swallowed, not dismissed

- **WHEN** the user taps a start or end marker while a tour's info sheet is open
- **THEN** no selection or fly-to SHALL occur (the goal marker remains the only selectable handle)
- **AND** the info sheet SHALL NOT close (the tap SHALL NOT be treated as a map-background click)

#### Scenario: Tapping a draft start/end marker does not cancel creation

- **WHEN** the user taps a start or end draft marker while creating a tour
- **THEN** the tour creation flow SHALL NOT be canceled

#### Scenario: Start/end markers removed on deselect

- **WHEN** the selected tour is deselected / its info sheet closes
- **THEN** the start and end markers SHALL be removed from the map

#### Scenario: Start/end markers survive a style switch

- **WHEN** the map base style is switched while a tour's details are open
- **THEN** the start and end markers SHALL be re-rendered for the still-selected tour after the new style loads

### Requirement: Edit-mode preview marker matches tour type

When a user is editing an existing tour's goal location **or creating a new tour**, the map SHALL render a tentative draft preview circle at the candidate goal coordinates. The preview circle's color SHALL be a lighter variant of the relevant tour's type-based color (split the same way as a saved marker when the types span several colors), preserving the "tentative / not yet committed" visual cue. While the form is open the relevant types are the activity types currently selected in the form, during editing and creation alike. When no type is selected (including the start of creation before any activity is chosen, or after the user deselects every type), the preview SHALL use the neutral-light fallback color.

During creation, picking a goal SHALL show the draft marker, and re-picking the goal SHALL move the single existing draft marker rather than adding a second one. When the user selects or changes the activity type in the creation form, the draft marker's color SHALL update to the matching lighter shade within the same reactive tick. On save the draft marker SHALL remain visible through the create round-trip and SHALL be cleared only once the real, full-color marker exists, so the light draft visibly transforms into the saved marker with no intervening empty-map gap. If the create fails, the draft marker SHALL still be cleared.

The same draft-preview mechanism SHALL extend to the **start** and **end** points. While creating or editing a tour, every set point (goal, start, end) SHALL be shown with its respective marker and icon. When a start or end location is changed during the edit/create flow, the changed point SHALL be shown as a lighter-tone draft marker carrying its start/end icon, in the same lighter shade rule used for the goal draft (type-based light color, or neutral-light when no type is selected). Unchanged points SHALL continue to render as their saved, full-color markers. On save, the start/end draft markers SHALL be promoted to saved markers the same way the goal draft is. Canceling the edit, or leaving a point's location unchanged, SHALL leave that point's marker unaffected.

#### Scenario: Preview for winter tour uses light blue

- **WHEN** the user is editing a tour of a winter type and has picked a new tentative goal
- **THEN** a circle marker SHALL appear at the tentative location in a lighter blue than the saved marker color

#### Scenario: Preview for summer tour uses light red

- **WHEN** the user is editing a tour of a summer type and has picked a new tentative goal
- **THEN** a circle marker SHALL appear at the tentative location in a lighter red

#### Scenario: Preview for paragliding tour uses light amber

- **WHEN** the user is editing a paragliding tour and has picked a new tentative goal
- **THEN** a circle marker SHALL appear in a lighter amber

#### Scenario: Draft marker appears on goal pick during creation

- **WHEN** the user picks a goal location to start creating a tour and no activity type has been chosen yet
- **THEN** a single draft preview circle SHALL appear at the picked goal in the neutral-light fallback color

#### Scenario: Re-picking the goal moves the draft marker

- **WHEN** the user changes the goal location during creation
- **THEN** the existing draft marker SHALL move to the new coordinates and NO additional draft marker SHALL be added

#### Scenario: Draft marker recolors live when activity type is selected during creation

- **WHEN** the user selects, adds or removes an activity type in the creation form
- **THEN** the draft marker SHALL update to the matching lighter shade(s) of the selected types' colors within the same reactive tick

#### Scenario: Draft marker transforms into the saved marker on create

- **WHEN** the user saves the new tour
- **THEN** the draft marker SHALL stay on screen until the created tour is loaded into the store
- **AND** it SHALL then be replaced by the real activity-type-colored marker at the saved goal, with no empty-map gap during the create round-trip

#### Scenario: Draft marker cleared when create fails

- **WHEN** saving the new tour fails (e.g. the create request errors)
- **THEN** the draft marker SHALL be cleared rather than left dangling on the map

#### Scenario: Preview cleared on exit

- **WHEN** the user exits edit mode, cancels the tentative pick, or cancels tour creation
- **THEN** the preview circle SHALL disappear

#### Scenario: Changing a start point shows a draft start marker

- **WHEN** the user changes the start location while creating or editing a tour
- **THEN** a lighter-tone draft marker carrying the start icon SHALL appear at the new start location
- **AND** any unchanged goal or end markers SHALL keep their saved full-color rendering

#### Scenario: Changing an end point shows a draft end marker

- **WHEN** the user changes the end location while creating or editing a tour
- **THEN** a lighter-tone draft marker carrying the end icon SHALL appear at the new end location

#### Scenario: Start/end draft markers promote to saved on save

- **WHEN** the user saves edits that changed the start and/or end location
- **THEN** the changed point's draft marker SHALL become its saved, full-color marker

#### Scenario: Canceling edits leaves start/end markers unchanged

- **WHEN** the user cancels the edit, or leaves the start/end location unchanged
- **THEN** the start/end markers SHALL reflect the saved tour, with no lingering draft marker

### Requirement: Location picker with crosshair

The map SHALL support a location-picking mode where a crosshair overlay appears at the center of the viewport, and the user can pan to choose a location. While picking is active, the location picker SHALL be the only interactive UI; any open tour edit or tour creation surface SHALL be suspended (collapsed to a title-only header, inputs disabled, dismissal affordances hidden) and any submit path SHALL refuse to execute until picking ends. On confirm or cancel, picking ends and the suspended surface SHALL be restored to its prior interactive state.

A suspended surface SHALL remain scrollable within its own scroll region while picking is
active, so the user can read the fields the pick will populate. Scroll inside such a
surface SHALL NOT reach the map.

#### Scenario: Enter location picker mode

- **WHEN** the user clicks the "Add Location" button
- **THEN** a crosshair overlay SHALL appear at the center of the map, the map action buttons SHALL hide, and cancel/continue FABs SHALL appear

#### Scenario: Confirm location

- **WHEN** the user clicks "Continue" in location picker mode
- **THEN** the app SHALL capture the map center coordinates and open the tour creation dialog with those coordinates

#### Scenario: Cancel location picking

- **WHEN** the user clicks "Cancel" in location picker mode
- **THEN** the crosshair SHALL disappear, the map action buttons SHALL reappear, and no tour is created

#### Scenario: Disabled when not logged in

- **WHEN** the user is not authenticated
- **THEN** the "Add Location" button SHALL be disabled

#### Scenario: Suspends an open tour edit surface while picking

- **WHEN** the location picker is active
- **AND** a tour info sheet is open in edit mode
- **THEN** the tour edit surface SHALL render in a collapsed header-only state showing "Edit: <tour title>"
- **AND** all form inputs and non-picker action buttons inside the edit surface SHALL be disabled
- **AND** backdrop / map-background / Escape dismissal of the edit surface SHALL be suppressed
- **AND** the edit surface SHALL NOT expose a close button

#### Scenario: Suspended surface remains readable while picking

- **WHEN** the location picker is active over a suspended edit or creation surface whose content overflows its scroll region
- **THEN** that content SHALL still scroll within the surface
- **AND** the map camera SHALL NOT change as a result of that scroll

#### Scenario: Suspends the tour creation dialog while re-picking

- **WHEN** the location picker is re-opened from within the tour creation dialog to pick start, end, or goal
- **THEN** the tour creation dialog SHALL be suspended equivalently (collapsed header, disabled inputs, dismissal suppressed) until picking ends

#### Scenario: Restores the suspended surface on confirm

- **WHEN** the user confirms the picker
- **THEN** picking SHALL end
- **AND** the previously suspended surface SHALL be restored to full interactive state with the newly picked coordinates applied to the target field, and all other in-progress form values SHALL be preserved

#### Scenario: Restores the suspended surface on cancel

- **WHEN** the user cancels the picker
- **THEN** picking SHALL end
- **AND** the previously suspended surface SHALL be restored to full interactive state with the target field unchanged, and all other in-progress form values SHALL be preserved

### Requirement: Map store manages map state

A Pinia store (`useMapStore`) SHALL manage map-related state: `isPickingLocation`, `currentStyleIndex`, `selectedTourId`.

#### Scenario: Toggle location picker

- **WHEN** `setPickingLocation(true)` is called
- **THEN** the store SHALL set `isPickingLocation` to true, hiding action buttons and showing picker controls

#### Scenario: Select tour

- **WHEN** `selectTour(tour)` is called
- **THEN** the store SHALL set `selectedTourId` and the map SHALL animate to the tour's location

#### Scenario: Change map style

- **WHEN** `setStyleIndex(index)` is called
- **THEN** the store SHALL update `currentStyleIndex` and trigger a map style reload

### Requirement: Map page registers the tours overlay

`map-page.vue` SHALL extend its `OverlayName` union with `'tours'` and SHALL mount `TourListSheet` inside the same unified overlay container that hosts the other single-active overlays. Opening the tours overlay SHALL follow the existing single-active policy so that any other open overlay (contacts, profile, feedback, tour, tour-creation) closes when the tours overlay opens.

#### Scenario: Open tours overlay closes other overlays

- **WHEN** the tour action bar's My Tours segment is activated
- **THEN** `map-page.vue` SHALL set `activeOverlay` to `'tours'`, causing any previously active overlay to unmount
- **AND** `TourListSheet` SHALL mount

#### Scenario: Tour list close resets overlay state

- **WHEN** `TourListSheet` emits `close`
- **THEN** `map-page.vue` SHALL reset `activeOverlay` so no overlay is active

#### Scenario: Selecting a tour from the list hands off to TourInfoSheet

- **WHEN** the user taps a tour row inside `TourListSheet`
- **THEN** `mapStore.selectTour(tourId)` SHALL be called and `TourListSheet` SHALL emit `close`
- **AND** the existing map-page reaction to `selectedTourId` SHALL open `TourInfoSheet` and fly the camera to the tour's goal

### Requirement: Map action overlay icons

Each speed-dial entry SHALL show its label followed by a Material Symbols icon: `feedback` for feedback, `layers` for map layers, `download_for_offline` for offline maps, `account_circle` for profile, `group` for contacts, and `notifications` for the inbox. Every entry, the trigger, and the compass SHALL wear the shared map-control glass surface (semi-transparent brand fill with backdrop blur) for visual separation from map content.

#### Scenario: FABs display Material Symbols

- **WHEN** the speed-dial menu is open in portrait
- **THEN** each entry shows its label followed by its Material Symbol icon, the icons aligned on the trigger's axis

#### Scenario: FABs have glass effect

- **WHEN** the map action overlay is visible over map content
- **THEN** entry backgrounds are semi-transparent with a blur effect

### Requirement: Location picker button styling

The location picker and the offline-region drawing SHALL use the shared `Button` for their actions: Cancel (and Redraw) as the tonal secondary variant lifted off the map with `--shadow-md`, Continue as the primary variant, all with pill corners.

#### Scenario: Location picker buttons render with updated styling

- **WHEN** the location picker is active
- **THEN** Cancel renders as a tonal secondary pill with a shadow and Continue as a primary pill

### Requirement: Map action overlay exposes a feedback entry point

The speed-dial menu SHALL contain a Feedback item, and the map action overlay SHALL emit an `openFeedback` event when it is selected, without owning any feedback sheet state itself.

#### Scenario: Feedback item listed

- **WHEN** the speed-dial menu is open and the user is not picking a location
- **THEN** a Feedback item SHALL be listed alongside the other entries

#### Scenario: Feedback item emits event

- **WHEN** the user selects the Feedback item
- **THEN** the menu SHALL close, the overlay SHALL emit the `openFeedback` event, and it SHALL NOT mutate any sheet visibility state

### Requirement: Map page owns feedback sheet visibility

The map page SHALL own the Feedback sheet's visibility through its single-active overlay state and SHALL render the shared `FeedbackSheet` component in response to the overlay's `openFeedback` event, consistent with how the profile and contact sheets are wired.

#### Scenario: Map page opens feedback sheet

- **WHEN** the map action overlay emits `openFeedback`
- **THEN** the map page SHALL set `activeOverlay` to `'feedback'` (closing any other overlay) and render the `FeedbackSheet` component

#### Scenario: Sheet close clears state

- **WHEN** the `FeedbackSheet` emits its close event
- **THEN** the map page SHALL reset `activeOverlay` and unmount the sheet

### Requirement: Tour selection shows info

- **WHEN** a user clicks on a tour circle marker
- **THEN** the map SHALL fly to the tour location and display the tour info component

The camera offset behavior SHALL be responsive: on mobile viewports (<600px), the map SHALL apply bottom padding equal to the sheet height to keep the tour marker visible above the sheet. On desktop viewports (>=600px), the map SHALL apply right padding equal to the side drawer width to keep the tour marker centered in the visible map area beside the drawer.

#### Scenario: Tour selection shows info

- **WHEN** a user clicks on a tour circle marker
- **THEN** the map SHALL fly to the tour location and display the tour info component

#### Scenario: Camera offset on mobile

- **WHEN** a tour is selected on a viewport below 600px
- **THEN** the map SHALL fly to the tour location with bottom padding equal to the sheet height

#### Scenario: Camera offset on desktop with side drawer

- **WHEN** a tour is selected on a viewport at or above 600px
- **THEN** the map SHALL fly to the tour location with right padding equal to the side drawer width (400px)

### Requirement: Dismiss modal bottom sheets via map background click

When a modal bottom sheet is open and the user clicks on the map background (outside the sheet), the sheet SHALL close, returning the user to the map view without performing any action.

#### Scenario: Click outside closes open sheet

- **WHEN** a modal bottom sheet (profile, contact creation, feedback, or tour detail) is open
- **AND** the user clicks on the map background area outside the sheet
- **THEN** the sheet SHALL dismiss (close)

#### Scenario: Click inside sheet does not close it

- **WHEN** a modal bottom sheet is open
- **AND** the user clicks anywhere within the sheet content area
- **THEN** the sheet SHALL remain open

#### Scenario: Overlay backdrop receives click events

- **WHEN** a modal bottom sheet is rendered
- **THEN** the map page SHALL render a transparent backdrop overlay behind the sheet
- **AND** clicks on the backdrop SHALL trigger the sheet's close action

#### Scenario: Only one sheet closes at a time

- **WHEN** a click on the map background occurs with exactly one sheet open
- **THEN** only that sheet SHALL close
- **AND** no other state changes SHALL occur

#### Scenario: Escape key also closes sheet

- **WHEN** a modal bottom sheet is open
- **AND** the user presses the Escape key
- **THEN** the sheet SHALL dismiss

#### Scenario: Dismissal does not lose form data warning

- **WHEN** a sheet with a form contains unsaved data
- **AND** the user clicks outside the sheet
- **THEN** the sheet SHALL close without additional confirmation (data loss is acceptable for MVP)

#### Scenario: Sheet close emits close event

- **WHEN** the map page closes a sheet in response to a backdrop click
- **THEN** the sheet component SHALL emit its standard `close` event
- **AND** the map page SHALL handle that event identically to an explicit close button press

### Requirement: Cluster membership is a stable hierarchical tree

The renderer SHALL maintain a single hierarchical agglomerative cluster tree, built once per `updateTours` invocation, that fully determines cluster membership at every zoom level. Two tours that are in the same cluster at zoom Z SHALL remain in the same cluster lineage at every zoom Z' &le; Z; conversely, two tours separated at zoom Z SHALL remain separated at every zoom Z' &ge; Z. Cluster identity SHALL NOT depend on tile boundaries, snapshot timing, or non-monotone re-grouping. The tree SHALL persist between zoom changes and pans, and SHALL be discarded only when `updateTours` is called with a different tour list.

#### Scenario: Two tours that cluster at low zoom remain co-clustered at all lower zooms

- **GIVEN** two tours A and B that the tree assigns to the same cluster at zoom 10
- **WHEN** the user zooms out to zoom 8 and back to zoom 10 several times
- **THEN** A and B SHALL be assigned to the same cluster lineage at every zoom Z &le; 10 throughout the session

#### Scenario: Two tours that separate at high zoom remain separated at all higher zooms

- **GIVEN** two tours A and B whose merge node has `splitZoom = 11`
- **WHEN** the user zooms in past zoom 11 and back several times
- **THEN** A and B SHALL be rendered as separate visible nodes at every zoom Z > 11 throughout the session

#### Scenario: Tree rebuild on tour list change

- **WHEN** `updateTours` is invoked with a new tour list
- **THEN** the tree SHALL be rebuilt from scratch using the new list
- **AND** any in-flight cluster animations SHALL be cancelled
- **AND** the renderer SHALL diff the previously committed visible state against the new forest cut at the current zoom and animate the resulting differences

### Requirement: Cluster split / merge animations fire only when a `splitZoom` threshold is crossed

The renderer SHALL fire a split or merge animation if and only if the user's zoom gesture crosses the `splitZoom` of at least one tree node. Pan gestures, intra-band zoom (zoom changes that do not cross any node's `splitZoom`), and programmatic camera moves that do not cross thresholds SHALL produce zero marker churn — visible markers SHALL translate with the map but SHALL NOT be removed, recreated, or faded. Animations SHALL be triggered during the gesture (not deferred to `zoomend`) by sampling `zoom` events and detecting threshold crossings against the previously sampled zoom.

#### Scenario: Pure pan produces no animation

- **WHEN** the user pans the map without changing zoom
- **THEN** no split or merge animation SHALL fire
- **AND** the visible cluster and tour markers SHALL remain mounted in the DOM

#### Scenario: Zoom within a threshold-free band produces no animation

- **GIVEN** the closest two `splitZoom` values to the current zoom are at zoom 8 and zoom 11, and the current zoom is 9.5
- **WHEN** the user zooms to 10.4 and back to 9.5
- **THEN** no split or merge animation SHALL fire

#### Scenario: Crossing one threshold during zoom-in fires one split animation

- **GIVEN** a node N has `splitZoom = 10.3`
- **WHEN** the user zooms from zoom 10.0 to zoom 10.6 in a single gesture
- **THEN** the renderer SHALL fire exactly one split animation for N during the gesture, beginning when the zoom crosses 10.3
- **AND** the animation SHALL begin before `zoomend` fires

#### Scenario: Crossing multiple thresholds during one gesture fires the corresponding animations

- **GIVEN** nodes N1, N2 have `splitZoom = 9.5, 10.5` respectively
- **WHEN** the user zooms from zoom 9.0 to zoom 11.0 in a single gesture
- **THEN** the renderer SHALL fire a split animation for N1 when the zoom crosses 9.5
- **AND** SHALL fire a split animation for N2 when the zoom crosses 10.5

### Requirement: Marker-granularity tweens for cluster transitions

Split and merge animations SHALL tween at the granularity of visible markers (cluster pies for cluster nodes, colored circles for leaf nodes), not at the granularity of every constituent leaf. For a split, the renderer SHALL spawn one temp marker per child of the splitting node, each starting at the parent centroid and tweening to its child centroid. For a merge, the renderer SHALL spawn one temp marker per disappearing visible node, each starting at the disappearing node's centroid and tweening to the new parent centroid. Temp markers for cluster children SHALL be constructed using the same pie-marker primitive as committed cluster markers; temp markers for leaf children SHALL be colored circles matching the tour-type palette. Animation duration SHALL be approximately 250 ms with a cubic ease-out.

#### Scenario: Split spawns one temp marker per direct child, not per leaf

- **GIVEN** a cluster N with two child clusters C1 (3 leaves) and C2 (2 leaves), and N is splitting
- **WHEN** the split animation fires
- **THEN** the renderer SHALL spawn exactly two temp markers (one for C1, one for C2)
- **AND** SHALL NOT spawn five temp markers (one per leaf)

#### Scenario: Merge spawns one temp marker per disappearing visible node

- **GIVEN** two visible cluster pies C1 and C2 are merging into a new parent P
- **WHEN** the merge animation fires
- **THEN** the renderer SHALL spawn exactly two temp markers, one tweening from C1.centroid → P.centroid and one from C2.centroid → P.centroid

#### Scenario: GL filter excludes animating tour ids

- **WHEN** a temp marker is animating for any tour id `t`
- **THEN** the GL `tours-circles` and `tours-circles-selected` layer filters SHALL exclude `t` for the duration of the animation
- **AND** SHALL re-include `t` immediately when the animation completes

### Requirement: Unified state-diff engine drives both zoom-driven and data-driven changes

The renderer SHALL implement a single state-diff engine that, on every change to either the cluster tree or the current zoom, computes the new forest (forest cut of the tree at the new zoom), diffs it against the previously committed visible state, and emits one of three transition kinds for each affected node: appeared, disappeared, or updated. For each appeared and disappeared node, the engine SHALL classify the cause as zoom-driven (an ancestor or descendant relationship to the previous state exists in the new tree) or data-driven (no such relationship), and SHALL select the corresponding animation: zoom-driven uses the merge / split tween; data-driven uses opacity fade-in / fade-out at the node's own centroid. Updated nodes (still visible but with a changed centroid or leaf set) SHALL tween their marker position from old to new centroid and re-render any pie-chart counts in place.

#### Scenario: Realtime tour add absorbed into existing cluster

- **GIVEN** a visible cluster pie C exists at zoom Z
- **WHEN** an external `updateTours` adds a new tour T whose tree placement at zoom Z assigns T to C
- **THEN** a temp colored dot for T SHALL animate from T's coordinates to C's new centroid
- **AND** C's marker SHALL tween its position from the old centroid to the new weighted centroid
- **AND** C's pie SVG SHALL re-render with updated counts

#### Scenario: Realtime tour add as a brand-new individual

- **WHEN** an external `updateTours` adds a tour T that is not clustered with any existing tour at the current zoom
- **THEN** T's GL circle SHALL fade in at its position via opacity transition
- **AND** no merge animation SHALL fire

#### Scenario: Tour deletion fades out

- **WHEN** an external `updateTours` removes a tour T that was visible as an individual circle
- **THEN** T's GL circle SHALL fade out at its position
- **AND** no merge or split animation SHALL fire

#### Scenario: Tour deletion shrinks a cluster

- **GIVEN** a visible cluster pie C of three leaves, one of which is tour T
- **WHEN** an external `updateTours` removes T
- **THEN** C's pie SVG SHALL re-render with the new total and counts
- **AND** C's marker SHALL tween its position from the old centroid to the new weighted centroid

#### Scenario: Mid-gesture data update cancels in-flight tweens and re-diffs

- **GIVEN** a split animation is in flight for cluster N during a user zoom gesture
- **WHEN** an external `updateTours` arrives
- **THEN** the in-flight tween SHALL be cancelled and its temp marker SHALL be removed
- **AND** the renderer SHALL recompute the forest from the new tree at the current zoom
- **AND** SHALL diff against the previously committed visible state and animate accordingly

### Requirement: GL `tours` source does not cluster

The MapLibre GL `tours` GeoJSON source SHALL be configured with `cluster: false` (or with no cluster option, which defaults to false). The `tours-circles`, `tours-circles-selected`, and `tours-completed-check` layers SHALL be filtered to the explicit set of currently-visible-as-individual tour ids, computed from the cluster tree's forest cut at the current zoom. There SHALL NOT be any reliance on MapLibre's internal point clustering for cluster behaviour, identity, or transitions.

#### Scenario: Source has no cluster option

- **WHEN** the `tours` source is added to the map
- **THEN** the `addSource` options SHALL NOT include `cluster: true`, `clusterMaxZoom`, or `clusterRadius`

#### Scenario: Layer filter is an explicit visible-id set

- **WHEN** the renderer commits a new visible state
- **THEN** each of `tours-circles`, `tours-circles-selected`, and `tours-completed-check` SHALL have its filter set to an `['in', ['get', 'id'], ['literal', [...visibleIds]]]` form combined with selection / animation exclusions

### Requirement: `splitZoom` is computed from world-meter centroid distance and pixel radius

For every internal tree node N with children C1 and C2, the `splitZoom` SHALL be computed as the zoom at which the projected pixel distance between `C1.centroid` and `C2.centroid` equals `CLUSTER_RADIUS = 50` pixels, using the standard Web Mercator pixels-per-meter formula evaluated at the merge node's centroid latitude. The post-build pass SHALL clamp every child's `splitZoom` to be greater than or equal to its parent's `splitZoom`, propagating recursively, to guarantee monotone visibility transitions during a continuous zoom. Building the tree SHALL NOT take time cubic in the number of tours; its merges SHALL equal those of an exhaustive closest-pair search.

#### Scenario: Two tours 100 m apart at latitude 47° have a deterministic `splitZoom`

- **GIVEN** two tour leaves at the same latitude 47.0° and exactly 100 m apart
- **WHEN** the tree is built
- **THEN** their merge node's `splitZoom` SHALL be the unique solution of `pixelDist = 50` per the Web Mercator formula
- **AND** the value SHALL be reproducible across builds for the same input

#### Scenario: Monotonicity clamp preserves child >= parent

- **GIVEN** centroid linkage produced a node N with `splitZoom = 9.0` whose parent P has `splitZoom = 9.5`
- **WHEN** the post-build clamp runs
- **THEN** `N.splitZoom` SHALL be set to `9.5` (or any value `>= 9.5`)

#### Scenario: Two tours at identical coordinates have effectively infinite `splitZoom`

- **GIVEN** two tour leaves at identical coordinates (distance = 0)
- **WHEN** the tree is built
- **THEN** their merge node's `splitZoom` SHALL be greater than the stack zoom
- **AND** tapping that cluster SHALL open the stack list

#### Scenario: Large tour sets build fast

- **WHEN** the tree is built for 600 tours
- **THEN** the build SHALL finish in well under 100 ms on a desktop browser

### Requirement: Reduced motion bypasses all marker tweens

When `window.matchMedia('(prefers-reduced-motion: reduce)').matches` is true, the renderer SHALL apply state diffs instantly: no temp marker animations, no opacity fades, no centroid tweens. Marker creation, removal, and centroid updates SHALL commit on the same frame as the diff.

#### Scenario: Threshold crossing with reduced motion enabled

- **GIVEN** `prefers-reduced-motion: reduce` is set
- **WHEN** the user zooms past a `splitZoom` threshold
- **THEN** no `requestAnimationFrame` tween SHALL be scheduled
- **AND** the cluster pie SHALL be removed and the child markers SHALL appear within the same frame as the threshold crossing

### Requirement: Map route never scrolls the document

While the map route is mounted, the document SHALL NOT scroll by any means: wheel, touch
pan, momentum/inertial scroll, rubber-band overscroll, or browser-chrome collapse. The map
SHALL be navigable only through its own gestures — drag, pinch, and rotate.

The lock SHALL be applied for the entire mounted lifetime of the route, not only while the
location picker is active, and SHALL be released when the route is left so every other
route scrolls normally.

Pinning the page element alone SHALL NOT be considered sufficient: the document root and
body SHALL both be pinned, because suppressing overflow alone does not stop momentum,
rubber-band, or address-bar scroll on iOS.

#### Scenario: Scroll gesture outside the map canvas

- **WHEN** the map route is mounted
- **AND** the user performs a scroll or overscroll gesture on any non-canvas surface (a sheet edge, the tour action bar, the picker button row, the page background)
- **THEN** the document scroll offset SHALL remain unchanged
- **AND** the map canvas SHALL NOT move relative to the viewport

#### Scenario: Location picker crosshair stays over the aimed point

- **WHEN** the location picker is active
- **AND** the user performs a scroll or overscroll gesture anywhere outside the map canvas
- **THEN** the geographic point resolved on confirm SHALL be the point the crosshair was rendered over before the gesture

#### Scenario: Lock released on leaving the route

- **WHEN** the user navigates from the map route to any other route
- **THEN** the document scroll lock SHALL be released
- **AND** the destination route SHALL scroll normally

#### Scenario: Lock survives a concurrent release by a leaving route

- **WHEN** the map route is mounted and holds the lock
- **AND** another route that also held the lock unmounts afterwards
- **THEN** the document SHALL remain locked while the map route stays mounted

### Requirement: Map gestures remain available while an overlay is open

Suppressing document scroll SHALL NOT suppress the map's own gestures. While the map route
is mounted — including while a bottom sheet, dialog, or side drawer covers part of the map
— wheel-zoom, pinch-zoom, drag-pan, and rotate over the still-visible portion of the map
SHALL continue to work.

The document scroll lock SHALL therefore be applied at the document root and body only, and
SHALL NOT declare `touch-action` there, so that no gesture policy is imposed on the map
canvas or on any scroll region inside an overlay.

#### Scenario: Wheel zoom beside an open side drawer

- **WHEN** a side drawer is open over part of the map on desktop
- **AND** the user scroll-wheels over the still-visible portion of the map
- **THEN** the map SHALL zoom about the pointer
- **AND** neither the document nor the drawer content SHALL scroll

#### Scenario: Touch gestures beside an open bottom sheet

- **WHEN** a bottom sheet is open over part of the map on a touch device
- **AND** the user drags, pinches, or rotates on the still-visible portion of the map
- **THEN** the map SHALL pan, zoom, or rotate accordingly

#### Scenario: Overlay content still scrolls while the document is locked

- **WHEN** the map route is mounted and an overlay's content overflows its scroll region
- **THEN** that content SHALL scroll by touch and by wheel within the overlay

### Requirement: Speed dial excludes Tours and Add tour

The previously top-level Tours and Add-tour FABs SHALL NOT be part of the speed dial — they are owned by the persistent bottom-center tour action bar.

#### Scenario: Speed-dial does not expose Tours or Add tour

- **WHEN** the user opens the speed-dial menu
- **THEN** the menu SHALL NOT contain a Tours entry or an Add-tour entry

### Requirement: Speed-dial trigger disabled while an overlay is active

While any overlay is active (`activeOverlay !== null`), the speed-dial trigger SHALL render in a disabled state, and tapping it SHALL close the active overlay instead of opening the menu, as "Single active top-level interaction" in `tour-action-bar` specifies.

#### Scenario: Speed-dial trigger hidden during location picking

- **WHEN** `mapStore.isPickingLocation === true`
- **THEN** the speed-dial trigger and its menu SHALL be hidden (existing behaviour)

#### Scenario: Speed-dial trigger hidden while drawing an offline region

- **WHEN** the user is drawing a region to download as an offline map
- **THEN** the speed-dial trigger and its menu SHALL be hidden

#### Scenario: Speed-dial trigger disabled when an overlay is open

- **WHEN** any overlay is active (`activeOverlay !== null`) and `mapStore.isPickingLocation === false`
- **THEN** the speed-dial trigger SHALL render in a disabled state
- **AND** tapping it SHALL close the active overlay without opening the menu

### Requirement: Speed-dial menu entries and order

The map page SHALL display entries in the bottom-right speed dial, in this order: feedback, map layers, offline maps, user profile, contacts, and the notification inbox (nearest the trigger, carrying the inbox badge — see `notification-inbox`). Profile shows a dot when an app update is available; contacts shows a dot while incoming friend requests are pending.

#### Scenario: Map layers entry

- **WHEN** the user clicks the "Map layers" entry in the speed-dial menu
- **THEN** the map layers panel SHALL replace the menu above the trigger (see "Map layers panel" in `map-trail-overlays`)

#### Scenario: User profile button

- **WHEN** the user clicks the profile entry in the speed-dial menu
- **THEN** the user profile sheet SHALL open

#### Scenario: Contacts button

- **WHEN** the user clicks the contacts entry in the speed-dial menu
- **THEN** the contacts list sheet SHALL open

### Requirement: Multi-activity markers split between their colours

A tour whose activity types map to two or three distinct palette colours SHALL render each of its circle markers — goal, selected goal, start/end detail and draft preview — as a circle divided into equal slices, one per distinct colour, in the order of its types. Types sharing a colour SHALL count once. Size, stroke, opacity and overlay glyphs SHALL match a single-colour marker.

#### Scenario: Ski tour and hike

- **WHEN** a tour has types `skitour` and `hiking`
- **THEN** its goal marker SHALL show a blue half and a red half

#### Scenario: Types of one colour stay solid

- **WHEN** a tour has types `skitour` and `splitboarding`
- **THEN** its goal marker SHALL render solid blue, exactly like a single-type ski tour

#### Scenario: Selected split marker keeps its ring

- **WHEN** a split tour is selected
- **THEN** its marker SHALL keep the slices at the selected size with the white selected-state stroke around them

### Requirement: Cluster pies weight tours by their colours

A cluster pie SHALL give each member tour a total weight of one, divided equally among the tour's distinct colours, so slice sizes reflect tours rather than type counts. The number shown SHALL remain the count of tours. Stack-list colour dots and leaf tween dots of a split tour SHALL show its colours split the same way.

#### Scenario: Mixed cluster

- **WHEN** a cluster holds one ski tour and one ski-tour-and-hike tour
- **THEN** its pie SHALL be three quarters blue and one quarter red
- **AND** it SHALL show the count 2

### Requirement: Cluster tap frames its tours or opens the stack list

Tapping a cluster marker for node N SHALL fly the map to frame all of N's tours in the part of the map an open side drawer (desktop) or sheet (phone) leaves visible, never under it. The target zoom SHALL be the largest of `N.splitZoom + ε` (ε ≈ 0.01), the zoom that fits N's tours into the middle half of that visible area, and one level above the current zoom (so even a country-wide cluster's tap visibly drills in), capped at the map's maximum zoom. The split animation SHALL be the same one a user zoom fires. The fitted zoom SHALL NOT exceed 15.5 unless the split itself needs more, so a tap never lands at street level for no gain. The fit SHALL keep the tours clear of the bottom tour bar. When `N.splitZoom` exceeds the stack zoom (17), meaning the tours sit within metres of each other, the tap SHALL open the stack list instead and SHALL NOT zoom the map.

#### Scenario: Tap on a spread cluster separates it in one step

- **GIVEN** a cluster of four tours spread across 10 km at zoom 9.5
- **WHEN** the user taps it
- **THEN** the map SHALL fly so that all four tours are in view
- **AND** the target zoom SHALL be at least `splitZoom + ε`

#### Scenario: Two tours kept in the middle

- **GIVEN** a cluster of Säntis and Altmann, 2.5 km apart, at zoom 9.5
- **WHEN** the user taps it
- **THEN** both tours SHALL land within the middle half of the map, not near its corners

#### Scenario: Tap beside the open tour list on desktop

- **GIVEN** the tour list drawer is open on the right
- **WHEN** the user taps a cluster
- **THEN** all of its tours SHALL land in view left of the drawer

#### Scenario: Tap on a same-spot stack

- **GIVEN** a cluster whose tours share one goal
- **WHEN** the user taps it
- **THEN** the stack list SHALL open
- **AND** the map SHALL NOT zoom

### Requirement: Stack list for tours on the same spot

The stack list SHALL be a popup anchored at the stack, titled with the number of tours there, with one row per tour. The list SHALL open below the stack, within the area an open drawer leaves visible and clear of the bottom tour bar; opening it SHALL pan the map (without zooming) only as far as the list would otherwise run past that area, and not at all when it fits. When not every row fits, the list SHALL scroll and SHALL show a shadow at the edge where more rows hide. Each row SHALL show:
- the tour's colour dot, split like its marker, carrying its primary activity's glyph and marked when completed
- its name, or the unnamed-tour label
- a second line with its date or date range, or "no date", or "done" for a completed tour

Rows SHALL be ordered:
1. planned tours with a date, earliest first
2. undated tours
3. completed tours

Tapping a row SHALL close the list and select that tour exactly as a marker tap does. The list SHALL close with its close button, Escape, a tap on the map, or a zoom. Opening SHALL move keyboard focus to the first row and closing SHALL return it to the cluster marker. Each row SHALL be a button whose accessible name is the tour's name.

#### Scenario: Open a tour from the stack

- **GIVEN** the stack list is open at Niederhorn with 11 tours
- **WHEN** the user taps the row "Mira R5 Outing Tag 1"
- **THEN** the list SHALL close and that tour's detail (or its outing overview) SHALL open

#### Scenario: Escape closes the list

- **WHEN** the stack list is open and the user presses Escape
- **THEN** the list SHALL close and focus SHALL return to the cluster marker

### Requirement: Marker taps do not reach the map

A tap on a cluster marker or a stack-list row SHALL NOT also be handled as a tap on the map background. It SHALL NOT close an open sheet, start a trail lookup or dismiss the stack list it opened.

#### Scenario: Selecting from the stack keeps the sheet open

- **WHEN** the user selects a tour from the stack list
- **THEN** its detail sheet SHALL open and stay open

### Requirement: An open tour or outing has the map to itself

While a tour's detail is open, the map SHALL show only that tour: its goal marker (never clustered), its start and end markers, its track and its label. While an outing overview is open, the map SHALL show only that outing's segments. Every other tour marker, cluster and outing chain SHALL be hidden meanwhile and SHALL return when the detail or overview closes. When other tours share the open tour's spot (within 25 m), a small "+N" chip at its marker's upper left SHALL count them; tapping it SHALL open the stack list of all tours at that spot (the open one included), opening upward so the open sheet does not cover it. When the open tour has no marker on the map (a friend tour the user is not a partner on), the map SHALL keep showing every tour.

#### Scenario: Opening a tour clears the map around it

- **GIVEN** the map shows clusters and tours around Piz Kesch
- **WHEN** the user opens "Chamanna digl Kesch"
- **THEN** only its marker, start and end markers and route SHALL be shown
- **AND** closing it SHALL bring every other tour and cluster back

#### Scenario: Opening an outing shows only its segments

- **WHEN** the user opens the overview of "Kesch-Runde"
- **THEN** only its segments, numbered, SHALL be shown, with no other tours or outing chains

#### Scenario: Selecting a tour from a same-spot stack

- **GIVEN** a stack of 14 tours on one summit
- **WHEN** the user selects one of them
- **THEN** only the selected marker SHALL show at the summit
- **AND** a "+13" chip SHALL sit at its upper left, and tapping it SHALL list all 14 tours

### Requirement: Tour name labels

From zoom 10, every individually rendered tour marker SHALL show a label beside it with two lines:
1. the tour's name (or the unnamed-tour label)
2. for an outing segment its stage ("Etappe 2/3"), then its elevation and its date or date range; "no date" when undated; "done" instead of the date when completed

Labels SHALL avoid overlapping each other and SHALL NOT run over another tour's marker, a cluster or a start/end marker: a label SHALL move to another side of its marker or, failing that, be dropped. Where labels collide, lower-priority labels SHALL be dropped and basemap labels SHALL give way to tour labels. The selected tour's label and the focused outing's segment labels SHALL show at any zoom. Clustered tours SHALL have no label. Labels SHALL be localised and SHALL render with the base map's own fonts, including offline.

#### Scenario: Labels appear when zoomed in

- **WHEN** the map is at zoom 12 and a tour renders as an individual marker
- **THEN** its name SHALL be shown beside the marker, with its elevation and date below

#### Scenario: No labels at overview zoom

- **WHEN** the map is at zoom 9.5 and no tour is selected
- **THEN** no tour labels SHALL be shown

#### Scenario: Selected tour labelled at any zoom

- **WHEN** a tour is selected at zoom 9
- **THEN** its label SHALL be shown

#### Scenario: Name next to a neighbouring marker

- **GIVEN** "Piz Bernina" and the "Piz Palü" friend tour about 150 px apart
- **WHEN** Piz Bernina's name on its right would reach the Piz Palü marker
- **THEN** the name SHALL sit on another side of its marker, clear of Piz Palü

### Requirement: Start and end markers are labelled

While a tour's start and end markers are shown, each SHALL carry a short label below it naming it as the start point or the end point. An outing's handover rings SHALL carry no label.

#### Scenario: Open tour with start and end

- **WHEN** a tour with a start and an end point is opened
- **THEN** the start marker SHALL be labelled "Startpunkt" and the end marker "Endpunkt" (de-CH)

### Requirement: Base-map symbols give way to tour markers

A base-map symbol (summit pictogram, place or height label, POI icon) that would be drawn under a tour marker SHALL be hidden, so it can never read as a second, dark marker. Base-map symbols beside a marker SHALL remain. Landmark summits, which the base map draws as dark pictogram discs, SHALL instead use the base map's ordinary summit symbol, keeping their names and heights.

#### Scenario: Landmark summit without a tour

- **WHEN** the map shows the Eiger at zoom 12 and no tour is there
- **THEN** the Eiger SHALL carry the ordinary summit symbol with its name and height, not a dark disc

#### Scenario: Tour on a summit

- **WHEN** a tour's goal is a summit that the base map marks with a summit pictogram
- **THEN** only the tour marker SHALL show at that spot

### Requirement: Cluster marker readability

A cluster marker SHALL show its pie as a ring wide enough to read the colour mix, its count in a legible size (at least 12 px for up to two digits) on a white centre, and a white outline with a soft shadow so it stands out from the base map. When any of its tours are completed it SHALL carry a green completion badge on its lower right: a bare check when all are completed, else a check with the number completed. Its accessible name, also its hover title, SHALL split its count by status: planned (dated), without a date, and done (e.g. "Cluster aus 14 Touren · 9 geplant · 4 ohne Datum · 1 erledigt"), omitting empty parts.

#### Scenario: Partly completed cluster

- **WHEN** a cluster holds three tours, one of them completed
- **THEN** it SHALL show the count 3 and a green badge "✓ 1"

#### Scenario: Cluster on a busy base map

- **WHEN** a cluster renders over dense topo detail
- **THEN** its outline, ring colours and count SHALL remain distinguishable

### Requirement: Map controls leave the map tappable

The floating bottom controls (tour bar, menu and legend buttons) SHALL dock at the bottom edge of the screen (above the safe area), level with the location picker's controls, rather than floating above a strip of live map, so that an objective in the lower part of the map stays tappable.

#### Scenario: Objective near the bottom of a phone screen

- **WHEN** a tour marker sits 100 px above the bottom edge of a 852 px phone screen
- **THEN** a tap on it SHALL reach the marker, not a control

### Requirement: Calm camera flights

Every camera move the app makes on its own (framing a tour or outing, a cluster tap, a place chosen in the search) SHALL fly at one shared, calm speed, slower than MapLibre's default, so that base-map tiles load while the camera moves on a decent connection. A long flight SHALL take longer than a short one rather than squeezing every distance into a fixed duration. A framing or cluster move of up to a screen and two zoom levels SHALL glide in about a second instead, never in a fraction of one. Framing SHALL NOT move the map at all when the view already shows the tour or outing about as framed: every point in view, at most a level further out, the framed centre within an eighth of the view. Gestures (pinch, scroll, drag) SHALL stay direct. With reduced motion requested, flights SHALL jump.

#### Scenario: Cluster tap zooms by two levels

- **WHEN** a cluster tap zooms the map in by two levels
- **THEN** the flight SHALL take about a second, not half a second

#### Scenario: Next stage half a screen away

- **WHEN** the user steps to the next stage of an outing, half a screen from the current one
- **THEN** the camera SHALL glide there in about a second

#### Scenario: Next tour of a stack already in view

- **GIVEN** "Säntis über den Lisengrat" is open, centred, with two more tours at its spot
- **WHEN** the user opens its "+2" list and picks another tour there
- **THEN** the map SHALL NOT move, neither when the list opens nor when the tour opens

### Requirement: Calm switch between tours and stages

When a tour or outing opens or closes, or the user steps to another stage, the map's tour markers, labels, clusters, chains and tracks SHALL fade out first; the next view's SHALL be drawn while hidden and fade in once drawn, so old and new never show side by side and no marker shows without its glyph. Changes within one view (an edit, a refresh) SHALL apply without fading. With reduced motion requested, the switch SHALL be immediate.

#### Scenario: Stepping to the next stage

- **GIVEN** stage 1 of "Piz Bernina Hike & Fly" is open
- **WHEN** the user taps the next-stage button
- **THEN** stage 1's markers and route SHALL fade out as the camera starts moving
- **AND** stage 2's markers, start point and route SHALL fade in together once drawn, never next to stage 1's

#### Scenario: Two quick steps

- **WHEN** the user taps next twice within a fifth of a second
- **THEN** only the last stage SHALL be drawn and faded in

### Requirement: Tour markers follow the tour list

While the tour list is open and its search or filters narrow the active tab, the map SHALL show markers, clusters and outing chains only for the tours that list shows; an outing listed as one row SHALL keep all its segments. Tours it can never show (non-partner friend tours) SHALL stay unmarked. With no search and no active filter, and whenever the list is closed, the map SHALL show every tour as before.

#### Scenario: Filtering the list thins the map

- **WHEN** the tour list is open on My Tours and the grade filter keeps two of five tours
- **THEN** the map SHALL show markers for those two tours only
- **AND** clusters SHALL count only those two

#### Scenario: Search thins the map

- **WHEN** the user types a query that matches one tour
- **THEN** the map SHALL show that tour's marker only

#### Scenario: Friends tab narrows to listed partner tours

- **WHEN** the Friends tab is active and its filters keep one tour the viewer is a partner on and one they are not
- **THEN** the map SHALL show the partner tour's marker only, and no owned tour

#### Scenario: A filtered-out tour no longer shadows

- **WHEN** a partner friend tour shares its spot with an owned tour and the Friends tab's filters keep the friend tour
- **THEN** the friend tour's marker SHALL be shown

#### Scenario: Outing kept whole

- **WHEN** a filter matches one segment of a three-segment outing
- **THEN** the map SHALL show all three segments and their chain

#### Scenario: Clearing restores every marker

- **WHEN** the user clears search and filters, or closes the tour list
- **THEN** the map SHALL show every tour again
