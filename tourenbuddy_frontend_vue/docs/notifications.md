# Notifications

Single source of truth for every inbox entry, push and email the app emits.

## Architecture

**The database decides who is notified about what; the Worker only decides how.**

1. **Emission.** Every event is a row in `public.notifications` (the in-app inbox), inserted
   by the database **in the same transaction** as the write that caused it — inside the tour
   / link / suggestion RPCs, the friend-request trigger and the eviction sites — through
   `fn_emit_notification` (migrations `20261008073323`–`20261012125754`). A rolled-back write
   leaves no entry; a replayed offline write emits exactly once.
2. **Rules that live once, in `fn_emit_notification`:** the actor is never a recipient; no
   actor ⇒ no event (service-role writes and account-deletion cascades stay silent); the
   actor's name is snapshotted; it never raises (a notification bug never aborts the user's
   write). An unread `tour_updates/updated` or `tour_interest/collision` entry from the same
   actor about the same tour is **collapsed** (occurrences + 1, moved to the top) instead of
   duplicated — and a collapse is an UPDATE, so it never pushes again.
3. **Delivery.** An `AFTER INSERT` trigger (`fn_dispatch_notification`) POSTs the row to the
   Worker's `/notify/event` via `pg_net`, after commit, authenticated by the shared secret in
   Vault (`notify_hook_url`, `notify_webhook_secret`). Missing Vault secrets ⇒ silent no-op;
   the inbox row is the record either way. At-most-once, no retry.
4. **Worker** (`services/email-hook/src/notify.ts`): skips muted types, pushes to every
   registered device of the recipient (`push_subscriptions` row ⇔ push on for that browser),
   emails when `notif_email_enabled`, localizes copy from `user_profile.locale`, and deep-links
   to `<APP_URL>/?notification=<id>` — the app resolves the entry's own target and marks it read.

Clients can read, mark read and delete their own entries; they can never insert one
(`record_release_note` is the only self-insert door). Retention: 90 days (`pg_cron`).

## Mute types (`notif_muted_types`)

| Mute key           | Covers                                                         |
| ------------------ | -------------------------------------------------------------- |
| `friend_requests`  | Friend request received / responded                            |
| `tour_updates`     | Shared-tour created / updated / deleted                        |
| `tour_interest`    | Collision scan + tour-link lifecycle + group-membership events |
| `tour_suggestions` | Suggestion batch submitted / revised / resolved                |
| `availability`     | Weekly availability summary (Monday job)                       |
| `tour_reminders`   | Tour reminder 5 days before the planned date (daily job)       |

Mutes silence push and email only; the inbox always records. `release_notes` is an inbox-only
type and is **not** mutable: the dispatch trigger skips it, so it is never pushed or emailed.

## Notification catalogue

### Friend requests — type `friend_requests`

Emitted by the row trigger `fn_notify_friend_request` on `friend_requests`.

| Trigger                            | Action      | Recipient           | Push title (EN / DE)                                     | Push body (EN / DE)                                                             |
| ---------------------------------- | ----------- | ------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A sends B a friend request         | `received`  | request `to_user`   | New friend request / Neue Freundschaftsanfrage           | {actor} wants to connect. / {actor} möchte sich mit dir verbinden.              |
| B accepts (RPC) or denies (direct) | `responded` | request `from_user` | Friend request update / Antwort auf Freundschaftsanfrage | {actor} responded to your request. / {actor} hat auf deine Anfrage geantwortet. |

The outcome is never disclosed. Cancellation notifies nobody.

### Shared-tour changes — type `tour_updates`

Recipients = **friend partners** (registered partner users who are the owner's friends,
`fn_friend_partner_ids`) − actor. Private tours notify no one.

| Trigger                                                  | Emitted in                                       | Action                                  | Push title (EN / DE)                             | Push body (EN / DE)                                                       |
| -------------------------------------------------------- | ------------------------------------------------ | --------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| Owner creates a shared tour                              | `create_tour_full` → `fn_notify_tour_write`      | `created`                               | New shared tour / Neue geteilte Tour             | {actor} shared "{tour}" with you. / {actor} hat «{tour}» mit dir geteilt. |
| Edit **adds** a partner (or a private tour is re-shared) | `update_tour_full` → `fn_notify_tour_write`      | `created` (to the new partners only)    | New shared tour / Neue geteilte Tour             | as above                                                                  |
| Owner meaningfully edits or flips completion             | `update_tour_full` → `fn_notify_tour_write`      | `updated`                               | Shared tour updated / Geteilte Tour aktualisiert | {actor} updated "{tour}". / {actor} hat «{tour}» aktualisiert.            |
| Owner accepts a suggestion on a meaningful field         | `fn_emit_suggestion_tour_update`                 | `updated` (suggestion authors excluded) | Shared tour updated                              | as above                                                                  |
| Owner deletes a shared tour                              | `BEFORE DELETE` trigger `fn_notify_tour_deleted` | `deleted`                               | Shared tour removed / Geteilte Tour entfernt     | {actor} removed "{tour}". / {actor} hat «{tour}» entfernt.                |

**Meaningful-edit filter** (`fn_is_meaningful_tour_change`, evaluated on the before/after
rows): name, planned date or end date, goal location, tour type, partner set, GPX track,
description, equipment, seasons, start / end point (location or name). Notes, tour elevation
and point elevations are silent; a visibility flip is silent.

**Cleanup on lost access** (`20261010065119`): when a tour goes private, a partner is removed,
or a friendship ends, the database deletes the entries those users hold about the affected
tours (a `deleted` notice is kept). A re-share starts over with `created`.

### Tour interest — type `tour_interest`

| Trigger                                                                                                         | Emitted in                                              | Action                   | Recipient                                     | Push title EN          |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------ | --------------------------------------------- | ---------------------- |
| Create / meaningful edit of a friends-visible tour collides (≤ 200 m, same type, both friends-visible, friends) | `fn_notify_tour_write` (`fn_scan_collisions_for_tour`)  | `collision`              | owner of each colliding friend tour           | Same tour planned      |
| A friendship is accepted and the two users' tours collide                                                       | `accept_friend_request` (`fn_scan_backfill_collisions`) | `backfill`               | both users, one digest each                   | Shared tours planned   |
| A link request is created                                                                                       | `create_link_request`                                   | `link_created`           | target tour's owner                           | Link request received  |
| A link request is declined                                                                                      | `decline_link_request`                                  | `link_declined`          | initiator tour's owner                        | Link request declined  |
| A link request is accepted                                                                                      | `accept_link_request` → `fn_emit_to_group`              | `group_joined`           | every member owner except the acceptor        | New tour in your link  |
| A tour leaves a group, ≥ 2 remain                                                                               | eviction sites → `fn_emit_group_removal`                | `group_evicted_external` | every member owner (evicted included) − actor | Tour removed from link |
| A tour leaves a group, < 2 remain                                                                               | eviction sites → `fn_emit_group_removal`                | `group_dissolved`        | every member owner − actor                    | Tour link dissolved    |

Each group entry names the recipient's **own** tour in the group. Withdrawals are silent;
there is no separate `link_accepted`. Group dissolution emails use a dedicated template; the
digest's email action is `backfill_digest`.

### Suggestions — type `tour_suggestions`

| Trigger                                             | Emitted in                                             | Action                 | Recipient |
| --------------------------------------------------- | ------------------------------------------------------ | ---------------------- | --------- |
| Partner submits a new batch                         | `upsert_tour_suggestions`                              | `suggestion_submitted` | owner     |
| Author revises a still-pending batch                | `upsert_tour_suggestions`                              | `suggestion_revised`   | owner     |
| A batch becomes fully resolved (incl. auto-decline) | accept / decline RPCs → `fn_emit_suggestions_resolved` | `suggestion_resolved`  | author    |

Partial resolution, withdrawal and predicate-break voids are silent.

### Scheduled jobs — types `availability`, `tour_reminders`

Inserted directly by `pg_cron` jobs (`20261012125754`), actor-less, pushed through the same
dispatch trigger.

| Job (`cron.job`)              | Schedule (UTC) | Function                           | Recipient                                                                                                      | Push title (EN / DE)                                    |
| ----------------------------- | -------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `weekly-availability-summary` | `0 5 * * 1`    | `fn_weekly_availability_summary()` | user with ≥ 1 friend free on a shared free day this week, gated by a shared non-completed friends-visible tour | Friends free this week / Freunde haben diese Woche Zeit |
| `tour-reminders`              | `0 5 * * *`    | `fn_tour_reminders()`              | owner + friend partners (friends-visible only) of tours planned exactly `current_date + 5`                     | Tour in 5 days / Tour in 5 Tagen                        |
| `purge-old-notifications`     | `30 3 * * *`   | inline `delete`                    | entries older than 90 days                                                                                     | —                                                       |

The summary job first deletes previous weeks' summaries. Emails use the generic `tour_updates`
template with `action` `availability_weekly` / `tour_reminder`.

### Release notes — type `release_notes` (inbox only)

Recorded by the client calling `record_release_note(note_id, since)` once per app start; a
per-user marker (`user_release_note_state`) keeps it once-only and records a note only when it is
newer than the marker, ordered by (`since`, id). So an older build on the same database (prod next
to a PR preview, a device not yet updated) never re-records its older note. Never dispatched.

### Blocking

`block_user` deletes the blocker's entries whose actor is the blocked user.

## Known gaps

- **Removed partner is not notified.** An owner removing a partner sends that ex-partner
  nothing (their entries about the tour are deleted instead). Intentional (Issue #210).
- **At-most-once delivery.** A Worker outage drops that event's push/email; the inbox entry
  remains.

## Maintenance

This file is hand-maintained. When adding or changing a notification, update the relevant
table, the emission site (SQL), and the copy in `services/email-hook/src/notify.ts` + the
Brevo templates.
