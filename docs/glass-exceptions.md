# Glass exceptions

Liquid Glass is for controls that float over content (#346 section 5, D6). This lists what is glass
on iOS and what is deliberately not, with the reason, so a review can tell a choice from an
oversight. Android and the web use Material 3 everywhere by design (D5).

| Surface                                   | iOS                                         | Why                                                                     |
| ----------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| Tab bar                                   | System glass (`NativeTabs`)                 | System component                                                        |
| Map menu circle, "My Tours" capsule, ⓘ    | Glass (`@expo/ui` `glassEffect`, `glass` button) | Float over the map                                                  |
| Offline status capsule                    | Glass                                       | At the top of the map only, which has no navigation bar; every other screen shows the status as its first list row (offline-data-cache) |
| Sheets, menus, alerts, toolbars           | System glass                                | System components                                                       |
| Lists and forms in sheets and tabs        | Not glass (inset grouped lists)             | Content, not chrome: Apple keeps lists opaque                           |
| Month grid and seasons in Calendar        | Not glass                                   | Content                                                                 |
| Elevation profile                         | Not glass                                   | Content                                                                 |
| Map markers, clusters, ski badges         | Not glass (drawn images)                    | Map content; glass on hundreds of markers would hide the map           |
| Welcome sheet                             | System sheet, list content                  | Onboarding is a sheet (D12 as revised), not an overlay                  |
| Update screen                             | Opaque full screen                          | Blocks the app on purpose; nothing behind it should show                |

Reduce Transparency turns the glass solid through the system; the app draws no glass of its own.
