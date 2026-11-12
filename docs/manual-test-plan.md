# Manual test plan: Phases 2 to 4

What Jest cannot check: how the app looks, feels and behaves on iOS, with real system UI, push,
links and the network. This plan covers the pull request that brings Phase 2 (backend and public
pages), Phase 3 (the feature port) and Phase 4 (native polish), on iOS and the web.

The IDs follow the required minimum in #346 section 12; cases that go further than it (onboarding,
update gate details, backend, public pages, performance) have their own prefixes. Not covered here,
and still owed before release: the Android devices (Android is deprioritized), the oldest iPhone on
the minimum iOS, the browser matrix, the PWA cutover (WEB-1) and store review (STO), all in #346
section 12.

**Where:** **S** = Simulator in Xcode 27 Device Hub (an iPhone 17 Pro on iOS 27 unless a case says
otherwise), **S+S** = two Simulators side by side, **15** = the real iPhone 15, **W** = web (Safari
or Chrome on the Mac). The iPhone 15 cases are the ones a Simulator cannot prove: push from APNs,
touch feel, performance, Universal Links through Apple's CDN, the camera.

**Record** pass or fail per case with the build (Profile → version at the bottom), device and date.
A failure gets a note: what you did, what you saw, a screenshot.

## Setup

### Backend (Vue repository)

1. In `tourenbuddy_frontend_vue`, on a branch from `main`, apply the backend patches if their pull
   requests are not merged yet:

   ```sh
   git apply ../tourenbuddy-native/.vue-patch/unconfirmed-accounts-hold-no-password.patch
   git apply ../tourenbuddy-native/.vue-patch/native-backend.patch
   ```

2. `supabase db reset && supabase test db` (seed users below, all pgTAP green).
3. Worker: `cd services/email-hook && npx wrangler dev --ip 0.0.0.0`. For real pushes to the
   iPhone 15 put the APNs key in `.dev.vars` (`SETUP-NOTIFICATIONS.md`, "Native push"); without it
   push cases run in the Simulator with `simctl push` only.
4. `.env.local` here as in the README ("Backend"), with `EXPO_PUBLIC_NOTIFY_HOOK_URL` set to the
   Worker (`http://127.0.0.1:8787` for the Simulator, `http://<Mac's address>:8787` for the
   iPhone 15, and the Supabase URL likewise).

### App

```sh
npm install                  # also copies the web map's worker into public/
npx expo prebuild --clean    # applinks, privacy manifest, usage strings
npm run ios                  # pick the Simulator
npx expo run:ios --device    # the iPhone 15 (add --configuration Release for PERF)
npm run web                  # web cases
```

### Accounts (seed)

Sign in with email and code; codes land in Mailpit (`http://127.0.0.1:54324`). The SMS code for
phone verification is the fixed test code in the Vue repo's `supabase/config.toml`
(`[auth.sms.test_otp]`).

| Account | Email                    | Has                                                                    |
| ------- | ------------------------ | ---------------------------------------------------------------------- |
| Patrick | `patrick@tourenbuddy.ch` | friends Jakob, Selim, Lena; a request from Reni; tours, one with Jakob |
| Jakob   | `jakob@tourenbuddy.ch`   | friend Patrick; partner on Patrick's Gfroren Hora; owns Piz Ela        |
| Lena    | `lena@tourenbuddy.ch`    | friend Patrick; the tour-detail showcase tours                         |
| Selim   | `selim@tourenbuddy.ch`   | **no name** (welcome asks for it); requests to Anna, from Reni         |
| Anna    | `anna@tourenbuddy.ch`    | a request from Selim                                                   |
| New     | any fresh address        | created in AUTH-7                                                      |

### Device Hub tricks

| Need              | How                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| Offline           | Turn off the Mac's Wi-Fi (the Simulator shares it), or Network Link Conditioner at 100 % loss        |
| Flaky network     | Network Link Conditioner "Very Bad Network", or toggle Wi-Fi every few seconds                        |
| Kill the app      | Swipe it away in the app switcher (⇧⌘H twice), or `xcrun simctl terminate booted ch.tourenbuddy.app.dev` |
| Push              | `xcrun simctl push booted ch.tourenbuddy.app.dev push.json` (payload below)                            |
| Universal Link    | `xcrun simctl openurl booted "https://tourenbuddy.ch/?notification=<id>"`                             |
| Face ID           | `xcrun simctl spawn booted notifyutil -p com.apple.BiometricKit_Sim.pearl.match` (your `faceid` alias) |
| Software keyboard | ⌥⌘K                                                                                                  |
| German            | Settings → Apps → TourenBuddy Dev → Language → Deutsch                                                |
| Accessibility     | Settings → Accessibility: Reduce Motion, Reduce Transparency, Bold Text, Larger Text, VoiceOver        |
| Short sessions    | Local `supabase/config.toml`: `[auth] jwt_expiry = 60`, then `supabase stop && supabase start`        |
| Inbox entry ids   | Supabase Studio (`http://127.0.0.1:54323`) → table `notifications`, the user's newest row             |
| Queue contents    | Studio cannot see the device; the Sync issues sheet and the status row show the queue                |

`push.json` (an inbox entry of the signed-in user; take its id from Studio):

```json
{
  "aps": { "alert": { "title": "TourenBuddy", "body": "Jakob suggested a change" } },
  "url": "https://tourenbuddy.ch/?notification=<id>"
}
```

## Cases

### Install, upgrade, auth (INS, AUTH)

| ID     | Where | Steps                                                                                                          | Expected                                                                                                                             |
| ------ | ----- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| INS-1  | S     | Delete the app, install it again, launch with the network off                                                  | Sign-in says you are offline in plain words; no crash, no spinner forever                                                             |
| INS-2  | 15    | With cached data and two offline edits waiting, install a newer build over it (`npx expo run:ios --device` again) | Still signed in; cached data shows at once; the waiting edits sync when online                                                       |
| INS-3  | 15    | Sign in, delete the app, install it again                                                                      | Sign-in shows: no session comes back from the Keychain                                                                                |
| INS-4  | S     | See UPD-1 to UPD-4                                                                                             | Blocks online below the minimum; offline use always continues                                                                         |
| AUTH-1 | S     | Email code: a wrong code; a code from an older email after requesting a new one; Resend until it refuses; then the right code. With Apple Mail set up on the iPhone 15, tap the code above the keyboard | Each wrong case says why, in both languages; Resend counts down and then says to wait; the right code signs in; autofill offers the code (15) |
| AUTH-2 | 15    | Sign in; leave the app in the background over an hour; return and edit a tour                                  | Still signed in; the edit saves; a friend's change made meanwhile shows (Realtime reconnected)                                       |
| AUTH-3 | S     | With `jwt_expiry = 60`: sign in, quit, wait two minutes, go offline, launch; then go online                    | Signed in with saved data and the status row "Not verified" (or offline); online, the row goes and nothing signs you out              |
| AUTH-4 | S     | As Patrick, offline: edit two tours; Profile → Sign out; online: sign in as Jakob; then sign out and back in as Patrick | Jakob sees none of Patrick's tours, contacts or waiting changes, and Patrick's edits never reach the server under Jakob (Studio); back as Patrick, his two edits sync; this device's push token row moved to the signed-in user |
| AUTH-5 | S     | See ONB-1 to ONB-3, ONB-12                                                                                     | Name gate and skip work; offline, an unknown profile never asks for a name                                                            |
| AUTH-6 | S     | See PRO-6 and BE-1; open `https://tourenbuddy.ch/account-deletion` (PUB-1)                                      | In-app deletion removes everything; the web page explains the same path                                                               |
| AUTH-7 | S     | Create account with the suggested password; sign out; sign in with the saved password; Create account again for the same address; add a passkey in Profile, sign in with Face ID, delete it | Code confirms the account, then the password works; the second Create account looks the same and sets the new password; cancelling the passkey sheet shows nothing; a deleted passkey no longer signs in |

### Onboarding (ONB)

| ID     | Where | Steps                                                                                       | Expected                                                                                                        |
| ------ | ----- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| ONB-1  | S     | Sign in as Selim                                                                            | A sheet asks for first and last name; no close button; Skip for now and Continue in the bar                    |
| ONB-2  | S     | Tap Continue with an empty last name                                                        | Footer says the last name is required; nothing saved                                                            |
| ONB-3  | S     | Enter both names, Continue                                                                  | Slides to "Welcome to TourenBuddy": an intro line, eleven rows with icon, title and one sentence each           |
| ONB-4  | S     | Tap "Friend requests"                                                                       | The sheet closes, Contacts opens on its friend requests                                                         |
| ONB-5  | S     | Relaunch the app                                                                            | Welcome shows again (it was left with a row, not Done); no name step now                                        |
| ONB-6  | S     | Tap Done; relaunch                                                                          | It no longer shows at launch                                                                                    |
| ONB-7  | S     | Profile → Show app tour                                                                     | The list opens with a close button, no Done; closing it changes nothing                                         |
| ONB-8  | S     | Rows Plan a tour, Map layers, Offline maps, Your tours, Inbox, Verify phone, Notifications, Calendar sync, Calendar | Each opens its place: a sheet over the map, or the right tab and page                                   |
| ONB-9  | S     | Open Calendar (first time for this account)                                                 | A tip under the month: what the days show, sharing availability, seasons, Done                                  |
| ONB-10 | S     | Tap the availability row in the tip; then Done in the tip; relaunch                         | Marking mode starts; Done removes the tip for good (also on another device)                                     |
| ONB-11 | S     | ONB-1 with Selim in German                                                                  | Swiss German copy, du-form, "ss", nothing cut off                                                               |
| ONB-12 | S     | Selim (no name) launches offline with saved data                                            | No name step while offline; it asks once online                                                                 |

### Map and offline maps (MAP, OFM)

| ID    | Where | Steps                                                                                     | Expected                                                                                                   |
| ----- | ----- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| MAP-1 | S     | As Patrick: menu circle → Map layers; switch base map; add hiking trails, then ski routes; ⓘ legend | Sheet over the map; layers change at once; labels and swisstopo attribution stay; the legend matches  |
| MAP-2 | S     | Zoom out and in over Graubünden; tap a cluster; tap a stack of tours on one spot           | Clusters with colour pies and counts; single tours with activity glyphs and badges; a cluster zooms in; a stack opens its list |
| MAP-3 | S     | Tap a tour; drag the sheet                                                                | Detail sheet at half height; the tour framed in the visible part; no re-fly while dragging                  |
| MAP-4 | S     | Add tour: search "Piz Ela"; pick the goal by tapping the map                              | Results by name; the point lands where tapped; the keyboard never covers the step sheet's fields           |
| MAP-5 | S     | Ski routes on, zoom in, tap a route badge; hiking trails on, tap a trail at a lower zoom  | Route card(s) with summit, ascent, difficulty; overlapping routes listed; the trail card shows its grade    |
| MAP-6 | S     | Draw a track: snap, drag a point, undo, back to start, finish                              | Points follow the network; the drag follows the finger; once online an elevation profile (red line, max/min in m, km axis); the saved GPX has heights |
| MAP-7 | S     | Open a tour with a GPX                                                                     | Track per leg in the type colour, direction connector; distance, climb, descent and pace in the sheet      |
| MAP-8 | 15    | Pan, pinch, rotate with a sheet open and the glass controls above                         | Smooth, no hitches; glass samples the map; compass appears when rotated                                     |
| OFM-1 | S     | Menu → Offline maps → Download a region: frame it, name it, Download; start a second and cancel it | Estimate updates as you pan and is close to the final size; progress in the list; the cancelled one is gone |
| OFM-2 | S     | Offline, kill and relaunch, pan inside and outside the region                             | Base map, relief, labels and ski routes render inside; outside stays empty, no spinner pretending          |
| OFM-3 | 15    | Download all of Switzerland; interrupt (airplane mode) midway; Redownload                  | Estimate before start; interrupted regions marked incomplete; redownload completes; a full disk says so    |
| OFM-4 | S     | Swipe-delete a region                                                                     | Gone; total size drops                                                                                     |
| OFM-5 | W     | Menu → Offline maps on the web                                                             | Says offline maps are in the iPhone and Android apps; nothing to download                                  |

### Offline data and write sync (OFD, OFW)

While something is worth knowing, the status shows as the **first row of every page** (below its
navigation bar) and as a **glass capsule at the top of the map**: offline, changes waiting, changes
that could not sync, or for a moment an action refused offline or changes just synced.

| ID    | Where | Steps                                                                                              | Expected                                                                                                      |
| ----- | ----- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| OFD-1 | S     | Go offline; kill and relaunch; open each tab, a tour, a friend's tour, the inbox                    | Everything from the device; status row "Offline · showing saved data" on each page, capsule on the map; it covers no control |
| OFW-1 | S     | Offline: edit a tour, a contact, your profile name, a notification mute, availability; unfriend Lena; mark an inbox entry read | Each shows at once; the status counts the waiting changes; online, each one reaches the server (Studio) |
| OFW-2 | S     | Offline: edit one tour three times, then a contact                                                | The status counts 2, not 4; online, the tour is written once (Studio `updated_at` moves once)                 |
| OFW-3 | S+S   | Patrick offline edits the name of Gfroren Hora; Jakob (online) edits its notes; Patrick goes online | Jakob's newer server change wins (row-level last-write-wins): Patrick's edit is not applied and he gets "1 change couldn't sync" saying a newer version exists; repeat with Patrick editing a tour nobody touched: his edit lands |
| OFW-4 | S+S   | Patrick reconnects with waiting edits to a tour Jakob is partner on                               | The list does not flash back to the old values; Jakob gets exactly one notification                          |
| OFW-5 | S     | Offline: add a tour with a GPX picked from Files; try to add a photo attachment                    | The GPX track shows at once and uploads on reconnect; the attachment says it needs a connection               |
| OFW-6 | S     | With five waiting changes, go online and kill the app at once; relaunch; toggle Wi-Fi several times while it syncs | No change lost, none written twice (Studio); the count reaches zero                                    |
| OFW-7 | S     | Make a replay fail for good: offline edit of a tour, delete that tour in Studio, go online; kill and relaunch | "1 change couldn't sync" stays across the relaunch; tap opens Sync issues with the reason; Discard removes it (Retry only for a transient failure) |
| OFW-8 | W     | Web: go offline (DevTools → Network → Offline) and edit a tour                                      | Says it needs a connection; nothing pretends to save                                                           |
| OFW-9 | S     | Offline: try a friend request, account deletion                                                    | The status flashes "not available offline" with a warning haptic                                               |
| OFW-10 | S    | Reduce Motion on, repeat OFW-1 online and offline                                                  | The capsule fades and the row appears without sliding                                                           |

### Tours (TOUR)

| ID     | Where | Steps                                                                                       | Expected                                                                                              |
| ------ | ----- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| TOUR-1 | S     | Add tour (capsule +): tap start, goal, end; Next day; save. Add the same goal again. Make an outing of two segments; a traverse with a different end | Step sheet low enough to see the map; route follows trails; multi-day tour saved with its days; the duplicate opens the existing tour; outing and segments navigate |
| TOUR-2 | S     | In the form: elevation and name filled from the goal; a stop near the start; pace in Profile | Filled online; offline the fields stay empty without errors                                          |
| TOUR-3 | S     | Import a GPX from Files (good, malformed, over 10 MB); export via share                     | Track shown; friendly errors for the other two; the share sheet offers the file                       |
| TOUR-4 | 15    | Attach a photo from Photos, one from the camera, a PDF; open, zoom, share; delete one. Then try a file over 10 MB, a `.zip`, and attach until the cap | System pickers; usage strings in your language; Quick Look zooms; oversize, wrong type and over-cap each refused with the reason |
| TOUR-5 | S     | My Tours: mine and friends' segments, filters, mark completed                                | Lists update; filtered footer; completed tours fade on the map                                        |
| TOUR-6 | S     | Edit a tour: activities, date, seasons, partners, notes; Cancel with changes; save; delete  | Form as a full sheet; Cancel asks before discarding; delete asks, then the marker goes                 |

### Contacts and friends (CON, SOC)

| ID    | Where | Steps                                                                                     | Expected                                                                                                        |
| ----- | ----- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| CON-1 | S     | + → Add contact: two numbers (one invalid), an email; pick primary; save; add another with the same number | Invalid number refused; saved as E.164 (CH default); the duplicate offers "Edit existing"                   |
| CON-2 | S     | + → Import from contacts (system picker); + → Import from file (`.vcf` good and broken)   | No Contacts permission prompt; results page lists imported, duplicates, unreadable                               |
| CON-3 | 15    | Contact detail: message, call, WhatsApp (installed and not), mail, copy a number          | The right app opens; without WhatsApp a clear message                                                           |
| CON-4 | S     | Contacts tab: search by name and digits; scroll the letter sections; delete a friend contact | Large title, search in the bar, sections A–Z; friend and blocked icons; the delete warning names the friendship |
| SOC-1 | S+S   | Patrick accepts Reni's request; Selim cancels his to Anna; Anna denies one                | Badge on the Contacts tab; lists update live on both sides; the denied side is never told                       |
| SOC-2 | S+S   | Jakob looks at Patrick's tours as a friend, then as partner on Gfroren Hora               | Dates and GPX only where the spec allows them                                                                    |
| SOC-3 | S     | Block and report from a request and from a contact; unblock                               | Friendship ends; "Block and report" and "Block"; the report reaches the moderation inbox (BE-2); unblock tells the cooldown |
| SOC-4 | S+S   | Patrick and Jakob each create a tour within 200 m of the other's goal; accept; move a pin away; dissolve | Overlap notice and link request live on both; linked-with section on both; moving away warns; dissolving ends it |
| SOC-5 | S+S   | Jakob suggests a change on Piz Ela (as partner), revises it; Patrick accepts one, declines one; Jakob withdraws a third | Diff shows what changes; both sides update live; history lists all                                   |

### Calendar (CAL)

| ID    | Where | Steps                                                                                             | Expected                                                                                     |
| ----- | ----- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| CAL-1 | S     | Calendar tab: browse months, Today, pick a day with a tour, then each day of a multi-day tour; Planned / Seasons | Dots in activity colours; day rows show "Day 2 of 3"; tapping opens the tour on the map. Seasons: Winter to Autumn with months, one bar per run of adjacent seasons, a red line at today, "No seasons scheduled" rows |
| CAL-2 | S+S   | Patrick: Edit availability, mark days, Save; Jakob's calendar; tap a weekly "who's free" inbox entry | Selection haptics; Jakob sees Patrick free on those days live; the entry opens that day     |
| CAL-3 | S     | Profile → Calendar sync: add a feed (valid, invalid, a Google embed link), Sync now; relabel, remove; "Where do I find the address?" | Errors per feed; busy days unmarked; the help shows steps, iCloud first, segmented to Google and Outlook |
| CAL-4 | 15    | Copy and Share the outbound link; subscribe in Apple Calendar; Regenerate                         | Tours appear in Calendar; after regenerate the old link stops                                 |

### Profile and account (PRO)

| ID    | Where | Steps                                                                              | Expected                                                                                          |
| ----- | ----- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| PRO-1 | S     | Edit profile names                                                                 | Saved; the hero updates                                                                           |
| PRO-2 | S     | Phone: remove (warning lists friendships), add a new number, acknowledge, code, resend | Countdown before resend; verified badge; friends can find you                                  |
| PRO-3 | S     | Language row                                                                       | Opens the app's page in Settings                                                                  |
| PRO-4 | S     | Legal rows in English and German                                                   | Privacy, terms, imprint open in Safari in the app's language (needs the pages deployed: PUB)      |
| PRO-5 | S     | Sign out                                                                           | Back to sign-in; this device's push token row is gone (Studio, `device_push_tokens`)              |
| PRO-6 | S     | New account: delete account (offline first, then online)                          | Offline: refused with a message. Online: confirm, signed out; all data and files gone (Studio); signing up again makes a fresh account |

### Notifications and links (NOT, LNK)

| ID    | Where | Steps                                                                                        | Expected                                                                                              |
| ----- | ----- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| NOT-1 | S     | Profile → Notifications: turn push on; deny; Open Settings; allow; turn off                  | The system prompt only when turning on; denied shows the Settings row; off removes the token row       |
| NOT-2 | S     | For three types in `docs/notifications.md` (Vue repo): `simctl push` with the app killed, in the background, in front; mute one type, turn email off | Banner each time in your language (also in front); a muted type stays silent but lands in the inbox |
| NOT-3 | S     | Tap the pushes from NOT-2 (killed and background)                                             | Opens the entry's target and marks it read                                                            |
| NOT-4 | 15    | Real push from the Worker (Jakob suggests a change to Patrick's tour); sign in as Patrick on a second device too | Arrives on both within seconds; uninstalling on one deletes its token row on the next push (BE-4)      |
| NOT-5 | S     | Profile → Inbox: collapse, mark all read, swipe delete, clear, load more, release note; offline mark read | Badge on Profile counts unread; release note opens with its settings shortcut and records once across devices; the offline read syncs |
| NOT-6 | 15    | After PUB: tap `https://tourenbuddy.ch/?notification=<id>` in Notes; delete the app and tap it again | With the app it opens the entry; without it Safari opens the site                                      |
| NOT-7 | 15    | Settings → Developer → Universal Links → Diagnostics with `https://tourenbuddy.ch/tours`      | Valid for the dev app's identifier                                                                     |
| LNK-1 | S     | `simctl openurl` with `https://tourenbuddy.ch/?notification=<id>` while signed in            | The app opens the entry                                                                               |
| LNK-2 | S     | Sign out; open the same link; sign in                                                        | After sign-in the entry opens once                                                                   |
| LNK-3 | S     | Sign out; `simctl openurl booted "https://tourenbuddy.ch/inbox"`; sign in                     | After sign-in the inbox opens, once                                                                   |
| LNK-4 | S     | `simctl openurl booted "tourenbuddy-dev://calendar"`; `.../wp-admin`                         | Calendar opens; the unknown path opens the map                                                        |
| LNK-5 | 15    | After PUB: tap `/privacy` in Notes                                                           | The privacy page opens in Safari, not the app                                                         |

### Update gate (UPD, covers INS-4 and XC-2)

Serve a raised minimum locally and point the app at it:

```sh
mkdir -p /tmp/gate && echo '{"min_supported_ios":"99.0.0"}' > /tmp/gate/app-config.json
npx serve -l 8099 /tmp/gate
# .env.local: EXPO_PUBLIC_APP_CONFIG_URL=http://127.0.0.1:8099/app-config.json, then restart Metro
```

| ID    | Where | Steps                                                               | Expected                                                                            |
| ----- | ----- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| UPD-1 | S     | Launch                                                              | Full-screen "Update TourenBuddy", no way past it; Update opens the App Store search |
| UPD-2 | S     | Stop `serve`; relaunch (online)                                     | Still gated (the last good answer is kept)                                          |
| UPD-3 | S     | Go offline; relaunch                                                | The app works offline, no gate; back online, the gate returns                       |
| UPD-4 | S     | Set the minimum to `0.1.0`, serve again; background 16 min, return  | The gate lifts                                                                       |

Remove the variable afterwards.

### Design, accessibility, device behavior (DES, A11Y, DEV)

| ID     | Where | Steps                                                                                   | Expected                                                                                     |
| ------ | ----- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| DES-1  | S     | Walk every tab and sheet                                                                | System tab bar, large titles, inset grouped lists, native menus and swipe actions; glass only on the floating map controls and the map's status capsule (`docs/glass-exceptions.md`) |
| DES-2  | S     | Reduce Transparency, Increase Contrast, Reduce Motion, glass intensity                  | Glass turns solid and legible; nothing slides under Reduce Motion                            |
| DES-3  | S     | Dark mode on                                                                            | Light app stays legible (light-only by design)                                               |
| DES-4  | 15    | Launch from cold, Home screen icon, Home screen in tinted and dark icon styles           | White launch screen with the mark, no flash; icon legible in each style (Icon Composer artwork pending, see PR) |
| A11Y-1 | S     | VoiceOver: sign in, plan a tour, share a GPX, open a contact, accept a request, the inbox | Everything reachable and named, in order                                                    |
| A11Y-2 | S     | Largest Accessibility text size, both languages                                         | Nothing clipped; rows wrap; no action lost                                                   |
| A11Y-3 | S     | Bold Text on (Settings → Accessibility → Display & Text Size), then the calendar, seasons chart, welcome sheet | App-drawn text (calendar grid, chart) turns bolder like the system lists                    |
| A11Y-4 | S     | VoiceOver on the map: the map, legend circle, My Tours, Add tour                         | The map is one element ("Map", hint to explore); each control reads its label, then a hint saying what it does |
| A11Y-5 | W     | Web, keyboard only: Tab through sign-in, the map controls, My Tours; Escape             | Visible focus on every control; focus moves into the panel; Escape closes it; lists announce as lists |
| DEV-1  | S     | Rotate to landscape on the map, a sheet and the tour form; iPad simulator: same walk     | No orientation lock; nothing clipped; sheets and controls stay reachable; state kept         |
| DEV-2  | S     | Tour form, contact form, phone code, feed URL: type with the software keyboard            | The focused field stays visible above the keyboard; Return moves on or submits; no jump      |
| DEV-3  | S     | = DES-3                                                                                  |                                                                                              |
| DEV-4  | S+S   | Patrick backgrounds the app for 5 minutes while Jakob edits a shared tour and sends a request; Patrick returns | Both changes show at once on return; in Xcode's Debug Navigator no network activity while in the background |
| DEV-5  | 15    | = PERF-3                                                                                 |                                                                                              |

### Performance (PERF), iPhone 15, Release build

| ID     | Steps                                                          | Expected                                         |
| ------ | -------------------------------------------------------------- | ------------------------------------------------ |
| PERF-1 | Instruments, App Launch: cold start to the first map frame     | Record the time; under 2 s                      |
| PERF-2 | Instruments, Animation Hitches: pan and zoom with a sheet open | No hitches over 33 ms during steady panning     |
| PERF-3 | 30 minutes of use, Allocations                                 | No steady growth; memory drops when sheets close |

### Backend and public pages (BE, PUB)

| ID    | Where | Steps                                                                                         | Expected                                                                                     |
| ----- | ----- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| BE-1  | S     | Delete an account that has tours, attachments and a push token (PRO-6), then check Studio     | Rows and Storage objects gone; reports kept without the user; no notification sent to friends |
| BE-2  | S     | Report a user (SOC-3)                                                                         | The moderation address gets an email (Mailpit locally)                                       |
| BE-3  | S     | Two devices registered for one account, then sign out on one                                  | Only that device's row goes; pushes reach the other                                         |
| BE-4  | 15    | Uninstall the app, send a push to that account                                                | The Worker deletes the stale token row                                                      |
| PUB-1 | W     | `npx expo export --platform web && npx serve dist`; open `/privacy`, `/de/privacy`, `/terms`, `/imprint`, `/account-deletion` | Each page loads alone, readable at phone width, links to its other language and the others |
| PUB-2 | W     | After deploying to Pages: `curl -I https://tourenbuddy.ch/app-config.json` and `/.well-known/apple-app-site-association` | JSON content type; `max-age=300` on the config                                 |

### Web and cross-client (WEB, XC)

| ID    | Where | Steps                                                                                          | Expected                                                                                     |
| ----- | ----- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| WEB-2 | W     | `npm run web`: sign in, open a tour, reload; back and forward; open `/?notification=<id>` signed out, then sign in | Same place after reload; history works; the entry opens after sign-in            |
| WEB-3 | W     | `npx expo export --platform web && npx serve dist`, Chrome DevTools "Fast 4G", hard reload     | Record the time to the first map frame (budget in #346)                                       |
| WEB-4 | W     | Safari and Chrome: password manager on sign-in, paste a code, resize from phone to desktop width, zoom to 200 % | Autofill and paste work; layout switches between bottom bar and rail without losing state |
| WEB-5 | W     | Map, My Tours, a tour, Add tour (tap start and goal on the map), Cancel; desktop width and phone width | From 600 px the sheets are a full-height panel on the left with the map live beside it, on a phone a bottom sheet; Cancel asks before discarding (browser dialog) |
| XC-1  | S+W   | Patrick in the PWA (`test.tourenbuddy.ch` against local, or Vue `npm run dev`) and in the app; edit in each | Each sees the other's edits live; inbox entries open in both                                |
