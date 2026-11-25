# Manual tests on production infrastructure

> Moved from the Vue repository (`sekael/tourenbuddy_frontend_vue`, release 0.54.0) and updated for
> this repository: the PWA is the web port here, and the iOS app joins the push and background cases.

What only production can show: real email delivery (Brevo), push with the production keys (Web Push
with the production VAPID key, APNs for the iOS app), Realtime over the public WebSocket, long
sessions, and the installed web app on a real phone. Everything else runs against the local stack:
`docs/manual-test-plan.md`.

**Where:** a pull request's web preview (`<branch>.tourenbuddy-native.pages.dev`, from
`web-preview.yml`) and TestFlight builds both use the production Supabase project and Worker.
**When:** after a Worker deploy, after a migration that touches notifications or tour links, and
before the web cutover (#374).

Use two throwaway accounts, A and B, both with verified phones (friend features require them). Before
each email or push case, check the recipient has email notifications on (`notif_email_enabled`) or
push on for the receiving device, and that the case's type isn't muted (`notif_muted_types`).

| # | Area | Setup | Action | Expected |
| --- | --- | --- | --- | --- |
| 1 | Email: friend request | A and B are not friends yet | A sends B a friend request | B gets the Brevo email within ~30 s, with the right subject, locale and link. Sender and reply-to match the production settings. |
| 2 | Email: tour update | A and B are friends; B is a partner on A's tour T | A changes T's planned date and saves | B gets the `tour_updates` email with the new date. Edits that don't matter (notes, elevation) send no email. |
| 3 | Email: tour interest | A and B are friends; A has tour T (visibility `friends`, tour type set) | B saves a tour within 200 m of T's goal with the same tour type | A gets the `tour_interest` email naming both tours, ending "Open the tour to link with them and plan together." |
| 4 | Email: backfill digest | A and B each have at least one tour matching the collision rule and are not friends yet | A sends a friend request, B accepts | A and B each get **one** digest email (notification `backfill`, Brevo action `backfill_digest`) listing the earlier collisions, not one email per collision. |
| 5a | Push: web app | B installed the web app from the preview on a phone and allowed notifications | A does something notifiable (friend request, link request, tour update) | The system notification appears on B's phone. Tapping it opens the web app on that screen. |
| 5b | Push: iOS app | B runs the TestFlight build with notifications allowed | Same as 5a | APNs delivers the notification. Tapping it opens the app on that screen. |
| 6 | Realtime: link request | A and B on two devices, both on the same tour's info sheet ("Same tour planned") | A taps "Request to link" | Within seconds, B's sheet shows "A wants to link …" with Accept and Decline, without a reload: production Realtime fan-out works. |
| 7 | Realtime: accept | Continued from 6 | B taps Accept | Within seconds, A's collision notice turns into the "Linked with" pill showing B's name. |
| 8 | Realtime: dissolve | A and B linked (7) | A moves T's goal pin more than 200 m and confirms "Save & unlink" | A leaves the group, which dissolves (one member left). B's pill disappears within seconds, and B gets the `group_dissolved` push and email (its own "link deleted" template). |
| 9 | Background and resume | B has the web app or the iOS app open, then puts it in the background for 5 min or more while A makes several changes | B brings it back | It catches up at once: link pills, tour list and friendships show A's changes. This confirms the background pause and the `onSubscribed` refetch on resume (`src/core/realtime/subscribe.ts`). |
| 10 | Long session | A leaves the web app open in a tab for over an hour (longer than an access token lives), or the iOS app in the background as long | A writes something (edits a tour, sends a link request) | The write succeeds without a new sign-in, and Realtime keeps delivering: auth-js's token refresh (started per app state in `src/core/supabase.ts` on iOS, on its own in browsers) and Realtime's (`setAuth` in `subscribe.ts`) work against production. |

## After the run

- Compare email subjects and bodies with `services/email-hook/templates/` (sign-in code) and
  `services/email-hook/brevo-templates/` (notifications; Brevo holds the live templates, these are
  their source copies), and the push copy with `services/email-hook/src/notify.ts`.
- Note the Realtime latency in 6–8. More than 5 s on a good network is a finding.
- Stale UI in 9: the affected store's `subscribeRealtime` call lacks `onSubscribed` (background:
  `docs/realtime-and-pwa-energy.md`).
- Clean up before the next run, so backfill digests don't pile up: delete the test links, tours and
  friendships, or delete both accounts.
