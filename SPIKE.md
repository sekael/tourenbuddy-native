# Route gate spikes (#367)

Throwaway code on `spike/route-gate`, never merged. Results go into the table in
[#367](https://github.com/sekael/tourenbuddy_frontend_vue/issues/367).

## Run on your Mac

```sh
cd <tourenbuddy_frontend_vue>/worktrees/tourenbuddy-native
rm -rf node_modules && npm install        # container installed Linux binaries
npx expo run:ios --device                 # pick the iPhone; first run asks for a signing team (free Apple ID is fine)
npx expo run:ios --device --configuration Release   # use this build for every smoothness measurement
# pick the physical iPhone in the prompt: a simulator build ("Release-iphonesimulator") measures the Mac, not the phone
# after a new native dep: `rm -rf ios` first; `ls node_modules/@shopify/react-native-skia/libs/ios` must list xcframeworks
npx expo run:android --device             # Android phone, USB debugging on
```

`ios/` and `android/` are generated (CNG); never edit them, change `app.json` instead.

## S1: what to check

The map screen has every glass surface S1 needs:

| Surface | Where | Today's equivalent |
|---|---|---|
| Glass tab bar | bottom (Map, Calendar) | navigation (open question in #368) |
| Bottom accessory above the tabs | "Pigne d'Arolla" + Edit / Share / Done | `tour-action-bar` |
| Grouped glass buttons | right edge: zoom in/out, back to Zermatt, open sheet | `map-action-overlay` |
| Header glass button | top left: cycles base map → aerial → light | `map-layers-panel` |
| Glass button with system menu | top right `+` | `map-speed-dial-menu` |
| Sheet with detents | "Open tour sheet" or `+` → New tour; drag 25% / 50% / 100% | `bottom-sheet` |

1. **Glass samples the map:** switch to aerial imagery, pan slowly, screenshot each surface on iOS 27
   (17 Pro) and iOS 26 (iPhone 15 or simulator). Pass = map colors and edges visibly bend through the glass.
2. **Smoothness (iPhone 15, Release build):** Xcode → Open Developer Tool → Instruments → *Animation Hitches*,
   attach to "TB Spike", record 20 s of continuous panning and pinching under all the chrome,
   with the sheet at 50%. Pass = hitch ratio < 5 ms/s.
3. **Z-order:** with the sheet at 25% and 50%, the map stays pannable; the sheet sits above the map
   buttons; the `+` menu opens above the sheet.
4. **Accessibility:** VoiceOver on, swipe through every control, including the four map buttons and
   the accessory actions. Then Settings → Accessibility → Display & Text Size → Reduce Transparency:
   glass must turn opaque and stay readable.

Stop and report if S1 is not passing after 2 focused days (timebox in #367).

## S3: map parity

New native deps (Skia, expo-file-system): run the full block under "Run on your Mac" again
(`rm -rf node_modules && npm install`, then `expo run`), the container touched `node_modules`.

What is on the map screen now:

| Lab control | What it does | Today's equivalent |
|---|---|---|
| `Base` / `Aerial` / `Light` / `Classic` chip | cycles the four base maps (Classic = WMTS raster) | `map-layers-panel` |
| `Hiking`, `Ski` | WMTS trail overlays; Ski also adds the self-hosted route halo + Skia-drawn difficulty badges (z ≥ 11) | `trail-layers.ts`, `ski-badge.ts` |
| (always) | 1,000 fixture tours, native clusters; cluster pie = 7 rotated wedge layers | `tours-marker-layer.ts` |

Every map image is drawn with Skia **once at start** (`images: … drawn up front`): a native map asks
for a missing image synchronously and never re-asks, so the PWA's draw-on-`styleimagemissing` does
not port. A `missing image:` status line means an id slipped through: report it.
| tap (Draw off) | hit test: cluster → zooms to expansion zoom; tour → its name; ski route → id + grade | marker / trail lookup |
| `Draw`, `Undo`, `Clear` | tap-to-add track along the ways (A*, ported TS); drag a point, drop re-snaps | `use-track-drawing.ts` |
| `↓ View`, `↓ CH`, `Reset offline` | offline pack of the current view / all of CH, z0–14, incl. ski routes | offline map download |

Status lines under the chips carry the numbers to report.

1. **Look:** at Zermatt z12–14 with Ski on, compare against the PWA on the same spot, each base map.
   Pass = same layers, same order (badges above routes, tours on top), labels in Frutiger.
2. **1,000 markers (iPhone 15, Release):** zoom out to all of Switzerland, Ski on. Instruments →
   *Animation Hitches*, 20 s of panning and pinching from the whole country down to z12 and back.
   Pass = hitch ratio < 5 ms/s. Note the `images:` line (avg / max Skia draw ms).
   Android, same gesture: `adb shell dumpsys gfxinfo ch.tourenbuddy.spike reset`, pan 20 s,
   `adb shell dumpsys gfxinfo ch.tourenbuddy.spike` → note "Janky frames" (record only).
3. **Hit testing:** tap a cluster (zooms in), a single tour, a ski route halo. Pass = right status line each time.
4. **Snapping:** Draw on, Ski on, z14 above Zermatt; tap along a ski route for ~10 taps spread
   over 2–3 km, then the same with hiking only. The line must follow the route. `build 0` = the leg
   reused the last network; `slowest build` keeps the worst real one (tile download is `tiles`, not
   counted). Pass = slowest build + typical route < 100 ms.
   *Risk to watch:* Node (JIT) needs ~120 ms to build a new tile set's network, Hermes has no JIT.
5. **Drawing lag:** drag a point around for 5 s. Pass = point and its two straight legs follow the
   finger with no visible lag; on drop the legs snap back onto the ways.
6. **Offline labels:** `Reset offline`, frame the Zermatt area at z11, `↓ View`, wait for `complete`.
   Airplane mode, force-quit, relaunch on `Base`. Pass = map, labels, ski routes and badges render
   at Zermatt (WMTS overlays are not in the pack, same as the PWA).
7. **Whole CH (Wi-Fi):** `Reset offline` first (a running `↓ View` pack competes), then `↓ CH`.
   Pass = tile count climbs past 6,000 with no limit error (~2 min at the rate seen so far).
   Let it finish if you can and note MB and time (≈ 37k tiles per vector source).
8. **No Referer:** already checked from the container (curl, no Referer, HTTP 200 on vectortiles,
   wmts and api3; 2026-11-05); tiles rendering on the device covers the native client.

Report back: hitch ratio, Android janky %, `images:` avg/max, 3× build + route ms, drag verdict,
View pack MB/s + offline verdict, CH tile count / MB / time.

Stop and report if S3 is not passing after 4 focused days.
