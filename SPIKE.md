# Route gate spikes (#367)

Throwaway code on `spike/route-gate`, never merged. Results go into the table in
[#367](https://github.com/sekael/tourenbuddy_frontend_vue/issues/367).

## Run on your Mac

```sh
cd <tourenbuddy_frontend_vue>/worktrees/tourenbuddy-native
rm -rf node_modules && npm install        # container installed Linux binaries
npx expo run:ios --device                 # pick the iPhone; first run asks for a signing team (free Apple ID is fine)
npx expo run:ios --device --configuration Release   # use this build for every smoothness measurement
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
