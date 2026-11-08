# Track routing

How a tour's line is found along the ways: in the route step of map-first creation (start, goal,
end), in the track drawer ("Auf Karte bearbeiten") and when a day's start moves (D11). It all runs in
the browser, on the vector tiles the map already shows. There is no routing server. The numbers
named here are listed in [distance-limits.md → Track routing](distance-limits.md#track-routing).

| Piece                              | File                                                |
| ---------------------------------- | --------------------------------------------------- |
| Which ways, at what cost           | `map/data/services/trail-network-service.ts`        |
| Which layer the line follows       | `map/domain/snap-network.ts`                        |
| Graph, snapping, Dijkstra / A\*    | `map/domain/track-routing.ts`                       |
| One leg: `resolve`, `between`      | `map/presentation/composables/use-leg-router.ts`    |
| Route step (stops, points between) | `map/presentation/components/route-planner.vue`     |
| Drawer (taps, drag, undo)          | `map/presentation/composables/use-track-drawing.ts` |

## 1. The network

- **Ways.** The `transportation` layer of swisstopo's base map tiles (`ch.swisstopo.base.vt`),
  always at zoom 13. Every official hiking trail counts (it has `sac_scale`), plus paths, tracks
  and small roads (`WALKABLE`). Highways and rails never count. In ski mode the self-hosted
  ski-route tiles come on top.
- **Only what is in the tiles.** A dotted line on the map isn't always a way: the dotted lines at
  Pt. 1763 above Wartau are dry stone walls. Where the tiles have no way, the line goes straight.
- **Cost per metre.** The shown trail layer picks what the line prefers (`snapNetworkFor`): the
  hiking trails, the ski routes, or with both shown, the tour's activity. Its marked ways cost 1
  per metre and every other way 1.5 (`OFF_TRAIL_COST`), so the line keeps to the layer. With no
  layer shown, every way costs 1. Routing knows only length × cost. It doesn't know height,
  steepness, rock or forest.
- **Graph** (`buildNetwork`). Tile vertices land on whole units of a global zoom-13 grid (~0.8 m),
  so one vertex read from two neighbouring tiles is the same node.
  - A line end or vertex within 3 m (`JOIN_M`) of another line joins it. This mends lines cut at a
    tile edge and paths that end on a road without a shared vertex.
  - A loose end (no other line there) bridges up to 30 m (`BRIDGE_M`) to the nearest way, at 3×
    cost (`OFF_WAY_WEIGHT`). The tiles stop a street short of the square a trail crosses.
- **Area loaded.** A leg loads the tiles around its two points, `400 m + half their distance`
  around them (`MARGIN_M`). That is at most 64 tiles in the route step and 30 in the drawer. A
  longer leg goes straight (`TooFarError`).

## 2. Where a point lands (snapping)

- **A tap in the drawer, or a point dragged and let go,** lands on the nearest way within
  `tapSnapM`: 32 screen px on a touch screen, 16 px with a mouse, never more than 250 m.
- **Several ways almost equally near.** A tap beside a road with a side path along it could land
  on either. Every way within 40 % (`SLACK`) of the nearest one's distance is a candidate.
  `routeToTap` runs one Dijkstra from the previous point and picks the candidate that is cheapest
  to reach, counting each metre between tap and landing 3×. So the tap lands on the road the line
  came along, not on a path it would only reach at the far end.
- **No way that near:** the point stays where it was set, and the leg to it goes straight.

## 3. Start, goal and end: the legs between them

The route step keeps its stops exactly where they were set: a hut, a summit, a bus stop is a
place, not a way. `route.stops = [start, …points between, goal, …points between, end]`. Each pair
in a row is a leg, routed one after another by `between(from, to, ends)`:

1. **Reach.** Each end reaches for a way as far as its kind allows (`ends`).
   - A **stop** reaches 250 m (`STOP_SNAP_M`).
   - A **point between** reaches 10 m (`VIA_SNAP_M`). It landed on its way when it was set, or it
     stands off the ways on purpose (see 4.).
2. **Route.** `from` joins the nearest way within its reach. `routeToTap` finds the cheapest way
   from there to a way within `to`'s reach (candidates and scoring as in 2.).
3. **Too far round?** If the part along the ways is longer than `max(2.5 × straight, straight +
500 m)` (`DETOUR`, `DETOUR_MIN_M`), it is a dead end or the next junction is kilometres off.
   The leg follows no way. The 500 m floor keeps the switchbacks of a short, steep leg.
4. **A stop far off the ways.** No way within 250 m (a summit above the trail's end)? A stop then
   reaches out to 1 km (`FAR_STOP_M`) and the leg is tried once more. A point between doesn't
   reach farther.
5. **Do the ways do most of the work?** The bits off the ways (from `from` to the first way, from
   the last way to `to`) may add up to at most half the straight distance (`OFF_WAY_SHARE`).
   Otherwise the ways don't lead there and the leg goes straight, from point to point, with no
   bend at a way on the side. This keeps a line from a ridge to its summit off the valley path
   below.
6. **Join.** The leg starts and ends exactly on its two points: a straight bit joins each of them
   to the way.

Each leg is drawn straight until its way is found, and drawn straight while a point is held under
the finger. A leg that stays straight for more than 50 m (`isGap`) turns the follow row into a
warning ("Kein Weg für einen Abschnitt – dort Luftlinie"). Without tiles (offline, never cached),
the legs go straight and the row says why. Routed legs are cached per pair of points and per
network, so switching the layer back and forth doesn't route again. Weiter / Nächster Tag wait for
the pending legs.

**Worked example (Tschugga, Wartau).** Start at Tschuggawald on the trail, goal on the summit
(1880 m), which is 378 m from the nearest way:

- The first try finds no way near the summit. Step 4 reaches 1 km and finds the trail through
  Spinatobel and Josenwald, ending ~480 m below the summit.
- Off the ways: ~480 m of a 1 km straight distance, under half (step 5). The line follows the
  trail and goes straight only for the last bit.
- Put the start on the open alp near Pt. 1763 instead. Following the ways would take 2.1 km for
  600 m straight, and the bits off the ways would add up to 1.3 × the straight distance. The leg
  goes straight along the ridge.

## 4. Points between (shaping the line)

- **Handles.** Each routed leg has a handle halfway along. A leg under 40 px on screen has none
  (`HANDLE_MIN_PX`).
- **Pulling a point out.** Dragging a handle pulls out a point between. Let go, it lands like a
  dragged point in the drawer (2.), reached from the point before it, and that leg is kept as
  found. A tap on a point between removes it.
- **Off the ways on purpose.** A point between with no way within reach stays where it was let
  go. You put it there on purpose, so both its legs go straight to it (10 m reach in step 1).
  Reaching 250 m like a stop would join it to a way behind it and draw a spur out and back.
- **Rundtour.** The way back is the way up by default: its points between again, in reverse order,
  and each leg the way up found, reversed (`legOf` looks up the reverse leg, nothing is routed
  again). Pull its handles to come back another way: where a handle or point of the way back lies
  on one of the way up, a grab takes the way back's. "Rundtour" in the form does the same to a
  drawn route that ends at its goal (`withWayBack`, the drawer's "Zum Start").
- **Handed on with the track.** The points between travel with the track (`{ points, legs, goal }`):
  the form, "Auf Karte bearbeiten" and a reopened route step all show them.

## 5. The drawer and the day handover

- **The drawer.** A tap or a dropped point is joined to the point before it with `resolve`, both
  ends reaching only as far as a tap (2.). A drawing opened from a straight route (no legs yet)
  routes its points once with `between`: the start, goal and end as stops, the rest as points
  between.
- **The day handover.** When a day's start moves (the day before now ends elsewhere), its first
  leg is routed again with `between` from the new start (a stop) to the drawing's next point.

## What it doesn't do

- **No terrain.** No height, slope or exposure in the cost. A short leg over a cliff and the
  switchbacks beside it are compared by length alone. Pull points between to choose.
- **Ways only.** No off-trail route search: off the ways it is a straight line.
- **One leg at a time.** A leg never looks at the leg after it.
