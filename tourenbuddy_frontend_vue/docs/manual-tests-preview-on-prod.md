# Manual test cases — Preview on production infra

Focused tests for the Cloudflare Preview deployment running against the
production Supabase + Worker. Scope is **only** behaviors that cannot be
exercised locally: real email delivery (Brevo), Web Push from prod VAPID,
Realtime latency over public WebSocket, long-lived auth, and PWA install on a
real device.

For every email-or-push case below: confirm the recipient has
`notif_email_enabled` on (email) or push enabled on the receiving device (push) and
the relevant type is not muted. Use two real users (A, B) who are friends, both with verified phones.

| #   | Area                   | Setup                                                                                    | Action                                                                | Expected                                                                                                                                                                                                             |
| --- | ---------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Email — friend req     | A and B are not yet friends                                                              | A sends friend request to B                                           | B receives Brevo email within ~30 s with correct subject + locale + link. From-address and reply-to match prod config.                                                                                               |
| 2   | Email — tour update    | A and B are friends; B is a partner on tour T owned by A                                 | A edits T's planned date and saves                                    | B receives `tour_updates` email with the new date; non-meaningful field edits (notes, elevation) do **not** trigger an email.                                                                                        |
| 3   | Email — tour interest  | A and B are friends; A has tour T (visibility=`friends`, tour_type set)                  | B saves a tour within 200 m of T's goal with the same `tour_type`     | A receives `tour_interest` email referencing both tours. Verify wording is the new "consider linking" copy, not the legacy "declined duplicate."                                                                     |
| 4   | Email — backfill       | A and B each have ≥1 tour matching the collision predicate, are **not** friends yet      | A sends friend request, B accepts                                     | Both A and B receive **one** `backfill_digest` email each, listing the pre-existing collisions. Digest is batched (single email, not one per collision).                                                             |
| 5   | Web Push — real device | B has PWA installed on phone, push permission granted, VAPID subscription saved          | A triggers any notifiable action (friend req, link req, tour update)  | OS notification appears on B's device. Tap opens the PWA on the relevant screen.                                                                                                                                     |
| 6   | Realtime — link req    | A and B on two separate devices/browsers, both viewing the same tour info sheet          | A taps "Request to link" on the collision notice                      | Within a few seconds, B's info sheet shows the incoming link-request banner with Accept / Decline — **no reload required**. Confirms prod WS fanout.                                                                 |
| 7   | Realtime — accept      | Continued from #6                                                                        | B taps Accept                                                         | A's info sheet updates within seconds: collision notice → linked-with pill (showing B's name). Disclaimer/pill copy reflects the new linked state.                                                                   |
| 8   | Realtime — dissolve    | A and B linked via #7                                                                    | A moves T's goal pin >200 m away and confirms the edit-warning dialog | A is evicted; group dissolves (only one member left). B sees pill disappear within seconds; B receives the `group_dissolved` push/email (dedicated link-deleted template). Disclaimer reverts to "no longer linked." |
| 9   | PWA pause + recover    | B has PWA installed; pull down to home screen for ≥5 min while A makes several changes   | Bring PWA back to foreground                                          | UI catches up immediately (linked-with pills, tour list, friendships all reflect A's changes). No stale state. Confirms `visibilitychange` pause + `onSubscribed` refetch on resume.                                 |
| 10  | Long-session token     | A leaves a tab open for ≥1 hour (longer than access-token lifetime), still authenticated | A performs any write (edit tour, send link request)                   | Write succeeds without a forced re-login. Realtime channel keeps delivering events afterward — confirms the `TOKEN_REFRESHED` + `realtime.setAuth` path on prod, and the b5b0aa9 JWT-retry fix.                      |

## After the run

- Record any email subject/body wording drift against `services/email-hook/templates/*` (OTP) and `services/email-hook/brevo-templates/*` (notifications), and push copy against `services/email-hook/src/notify.ts`.
- Note observed Realtime latency for #6–#8. Anything >5 s under good network = flag.
- If #9 shows stale UI, the affected store is missing `onSubscribed` — see
  `docs/realtime-and-pwa-energy.md`.
- Clean up: delete test friend links, test tours, test friendships before the
  next run so backfill digests do not accumulate.

# TODO:

- [x] Retest realtime for link requests and dissolution by setting linked tour private
- [x] Investigate issue of tour link group cleanup when setting one tour to private -> double notification in screenshot from PWA push notifications in Downloads
