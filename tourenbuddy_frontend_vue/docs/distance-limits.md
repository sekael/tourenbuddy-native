# Distance limits

Every fixed distance the app uses to decide something: when two points are the same place, how
far to search, when to warn. Look here before you add a new limit, and reuse one that means the
same thing.

Two points are compared in one of two ways:

- `isSameGoal(a, b, m = 10)` (`src/features/tours/domain/distance.ts`): straight-line distance
  in Swiss LV95 coordinates, `<= m`. Use it for "is this the same place".
- `haversineMeters(a, b)` (`src/core/utils/haversine.ts`): great-circle metres. Use it when the
  distance itself is needed (shown, sorted or summed).

The database uses `st_dwithin(geography, geography, m)`, which measures geodesic metres.

## Same place

| Limit                   | Value | Where                                                                                    | What it decides                                                                                                                                                                                                                                                                                                |
| ----------------------- | ----- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isSameGoal` default    | 10 m  | `domain/distance.ts`                                                                     | Two points are the same spot. Uses below.                                                                                                                                                                                                                                                                      |
| ↳ round trip            | 10 m  | `tour-detail-markers.ts`, `gpx-track-layer.ts`, `tour-fact-rows.vue`, `route-metrics.ts` | An end this close to the start makes a round trip. The map draws one marker and no goal → end leg, the info sheet says "Round trip", and the end borrows the start's height.                                                                                                                                   |
| ↳ connector leg         | 10 m  | `gpx-track-layer.ts` (`connectorLegs`)                                                   | A leg whose two points coincide is not drawn.                                                                                                                                                                                                                                                                  |
| ↳ outing handover       | 10 m  | `domain/outing.ts` (`outingGaps`), `tour-detail-markers.ts` (`outingDetailMarkers`)      | A segment that starts this close to the previous segment's finish (its end, else its goal) continues the chain: a handover ring and no gap hint. Farther away, the timeline shows "Starts away from …" and the map shows a transfer line. A marker is not drawn again on a goal or on a marker already placed. |
| ↳ re-pick is no change  | 10 m  | `map-page.vue` (`draftIfChanged`, goal re-pick)                                          | A re-picked start or end this close to the saved one gets no draft marker. A re-picked goal this close to the pending one during creation changes nothing, and no lookup runs.                                                                                                                                 |
| `SAME_SPOT_M` (markers) | 25 m  | `map/…/tours-marker-layer.ts`                                                            | Tours this close to the open tour share its spot. Its "+N" chip counts and lists them.                                                                                                                                                                                                                         |

## Tour form and point suggestions

| Limit          | Value | Where                                   | What it decides                                                                                                                                                                                                                                                                                                                                          |
| -------------- | ----- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEAR_M`       | 200 m | `tour-form.vue` (`fillPointsFromTrack`) | A picked GPX fills the empty start and end from its first and last point. A track end this close to the goal fills nothing, because it is the goal: a flight from the goal has no start, and a walk up to it has no end. The same 200 m makes a track a loop: when its ends lie this close together and the tour has a start, the end becomes the start. |
| `SAME_GOAL_M`  | 300 m | `point-suggestions.vue`                 | An earlier own tour whose goal is this close has the same objective. Its start or end (a landing for a flown way down) is offered first.                                                                                                                                                                                                                 |
| `SAME_PLACE_M` | 100 m | `point-suggestions.vue`                 | An end suggestion this close to the start is not offered. "Round Trip" already covers it.                                                                                                                                                                                                                                                                |
| `AT_GOAL_M`    | 500 m | `point-suggestions.vue`                 | A public-transport stop this close to the goal is not offered as a start, because it is the summit's cable car or bus, so there is no way up. It is still offered as an end (the ride down).                                                                                                                                                             |
| `FAR_M`        | 20 km | `point-distance.vue`                    | A start or end farther from the goal shows its distance as a warning (`tours.form.farFromGoal`), for example a landing picked in the wrong valley.                                                                                                                                                                                                       |

Why 200 m for a track end but 500 m for a stop: a stop near the goal is a real place (the
station at the top), while a track end near the goal is the goal itself, off only by when the
recorder started and where the goal marker sits.

## Place lookups (Swisstopo)

| Limit                  | Value                      | Where                                           | What it decides                                                                                                                                                                   |
| ---------------------- | -------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name search radius     | 50 m, then 500 m           | `swisstopo-name-service.ts` (`suggestTourName`) | A picked point is named after a feature within 50 m. If none is found, the search widens to 500 m.                                                                                |
| `WINDOW_DEG`           | 0.08° (≈ 9 km north–south) | `swisstopo-stop-service.ts`                     | Half the square window the stop search asks GeoAdmin for.                                                                                                                         |
| `RADIUS_M`             | 8 km                       | `swisstopo-stop-service.ts`                     | Stops are kept within this distance of the goal, which trims the window to a circle. Trailheads of big summits lie 6–8 km off, for example Morteratsch below Piz Bernina.         |
| `SAME_SPOT_M` (search) | 150 m                      | `map/data/…/swisstopo-search-service.ts`        | A stop this close to a search result with the same name is that place and is not listed twice.                                                                                    |
| `NAME_RADIUS_M`        | 50 m                       | `map/…/location-picker.vue`                     | A confirm this close to the chosen search result keeps the result's name, which allows for touch drift. Farther away, the point is named by lookup.                               |
| `SUMMIT_NEAR_M`        | 1.5 km                     | `map/…/plan-from-route.ts`                      | When a ski route is planned as a tour, the place named like the route's target must lie this close to the route to become the goal. Otherwise the route's last point is the goal. |

## Tour links (client and database)

| Limit                | Value | Where                                                                                                                                                                                                                                                               | What it decides                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COLLISION_RADIUS_M` | 200 m | `domain/collision.ts`, `tour-info-sheet.vue`, `collision-notice.vue`, `tourenbuddy-map.vue`                                                                                                                                                                         | A friend's tour with a goal this close and a shared activity is the same objective, and the app offers a link. A partner's friend tour this close to an own tour gets no marker of its own (own tours take precedence) unless it is the one open. Moving a linked tour's goal farther than this from a sibling breaks the link, and the info sheet warns before saving. |
| `st_dwithin(…, 200)` | 200 m | migrations: `fn_collision_predicate`, `fn_scan_collisions_for_tour`, `fn_scan_backfill_collisions`, `list_backfill_pairs_for_friendship`, `list_all_backfill_pairs`, `fn_evict_member_on_tour_change` (latest of each in `20261020071230_multi_activity_tours.sql`) | The database side of the same rule: which tours may link, which pairs a new friendship offers to link, and which member is evicted when its goal moves away. **Keep it equal to `COLLISION_RADIUS_M`.** Changing it needs a new migration that replaces all of these functions.                                                                                         |

## Route numbers

| Limit                     | Value | Where                     | What it decides                                                                                                                            |
| ------------------------- | ----- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `HYSTERESIS_M` (vertical) | 5 m   | `domain/route-metrics.ts` | A GPX height swing counts as climb or descent only past 5 m from the last turning point, so recorder noise on a flat stretch adds nothing. |

## Track routing

How the line along the ways is found, step by step: [track-routing.md](track-routing.md). All in
`map/…`.

| Limit                     | Value         | Where                      | What it decides                                                                                                                             |
| ------------------------- | ------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `tapSnapM`                | 16 / 32 px    | `use-leg-router.ts`        | A tap, or a point let go, lands on a way this many screen pixels away (mouse / touch).                                                      |
| `MAX_TAP_SNAP_M`          | 250 m         | `use-leg-router.ts`        | The tap reach is never more than this, however far out the map is zoomed.                                                                   |
| `STOP_SNAP_M`             | 250 m         | `use-leg-router.ts`        | A route's stop (start, goal, end) joins a way this far off.                                                                                 |
| `FAR_STOP_M`              | 1 km          | `use-leg-router.ts`        | A stop with no way within 250 m (a summit above the trail's end) tries again this far; the last bit goes straight.                          |
| `VIA_SNAP_M`              | 10 m          | `use-leg-router.ts`        | A point between joins a way only this close. Farther off, it was set off the ways on purpose and its legs go straight.                      |
| `OFF_WAY_SHARE`           | ½ of straight | `use-leg-router.ts`        | The bits off the ways (to the first way, from the last) may add up to this share of the straight distance; more, and the leg goes straight. |
| `DETOUR` / `DETOUR_MIN_M` | 2.5× / +500 m | `use-leg-router.ts`        | A way longer than both goes too far round (a dead end): the leg goes straight. The floor keeps a short leg's switchbacks.                   |
| `MARGIN_M`                | 400 m         | `use-leg-router.ts`        | A leg loads the ways this far around its two points, plus half their distance.                                                              |
| `JOIN_M`                  | 3 m           | `use-leg-router.ts`        | Two ways this close meet (lines cut at a tile edge, a path ending beside a road).                                                           |
| `SKI_JOIN_M`              | 20 m          | `trail-network-service.ts` | Ski routes this close meet (side by side up a shared approach).                                                                             |
| `BRIDGE_M`                | 30 m          | `use-leg-router.ts`        | A way's loose end reaches across this far to another way, at three times the cost.                                                          |
| `GAP_M`                   | 50 m          | `use-leg-router.ts`        | A straight leg longer than this found no way: the follow row and the drawer warn.                                                           |
| `HANDLE_MIN_PX`           | 40 px         | `use-leg-router.ts`        | A leg shorter than this on screen has no handle to pull a point out of.                                                                     |

## On screen (pixels, not metres)

| Limit            | Value  | Where                      | What it decides                                                                                                    |
| ---------------- | ------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `CLUSTER_RADIUS` | 50 px  | `map/…/cluster-tree.ts`    | Goals closer than this on screen join a cluster. A cluster splits at the zoom where its two parts lie 50 px apart. |
| `ARROW_SPACING`  | 120 px | `map/…/gpx-track-layer.ts` | The gap between direction arrows along a connector leg.                                                            |
