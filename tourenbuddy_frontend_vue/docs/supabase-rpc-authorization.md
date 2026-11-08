# Supabase RPC authorization

How a client call reaches a Postgres function, which gates it passes, and how to write a
function that is safe to expose. Worked example: the `tour_partner_user_ids` roster leak,
fixed in `20261013083452_tour_partner_ids_lockdown.sql`. The rules are summarized in
`.claude/conventions.md` → Supabase / Database.

## Roles

`anon`, `authenticated` and `service_role` are ordinary Postgres roles that nobody logs in
as. PostgREST logs in as `authenticator` and, per request, switches to the role named in the
JWT's `role` claim.

| Role            | How a request gets it                                                           | `auth.uid()` | In TourenBuddy                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `anon`          | Bearer token is the anon (publishable) key itself — no user session             | `null`       | The key ships in the JS bundle: **anon = the whole internet**                                                                         |
| `authenticated` | Bearer token is a user's access token (`role: authenticated`, `sub: <user id>`) | user id      | Every signed-in request. Sign-up is open (`enable_signup = true`), so **authenticated = anyone with an email address**, not "trusted" |
| `service_role`  | Bearer token is the service key; role has `BYPASSRLS`                           | `null`       | Only the Worker (`services/email-hook`)                                                                                               |
| `postgres`      | Not reachable over HTTP                                                         | —            | Runs migrations and `pg_cron`; owns tables, views and SECURITY DEFINER functions; has `BYPASSRLS` (not a superuser)                   |
| `PUBLIC`        | Pseudo-role every role belongs to                                               | —            | Receives EXECUTE on every new function by PostgreSQL default                                                                          |

supabase-js sends two headers: `apikey` (always the anon key; checked by the gateway, it
does not pick the role) and `Authorization: Bearer <jwt>` (the user's access token with a
session, otherwise the anon key) — this one decides the role.

## Call chain: app → database

Creating a tour:

```
tour form component
 → tours-store.ts                     inside mutate() (core/offline/mutate.ts)
                                      online: run now · offline: IndexedDB outbox, replay later
 → ToursRepository (interface) → ToursRepositoryImpl.createTourWithPartners
 → supabase.rpc('create_tour_full', {...})       client singleton, core/utils/supabase.ts
     auth-js:      reads the session from localStorage, refreshes an expired token
     postgrest-js: POST https://<ref>.supabase.co/rest/v1/rpc/create_tour_full
                   apikey: <anon key>   Authorization: Bearer <user access token>
 → Supabase API gateway               apikey is a valid project key → route /rest/v1 to PostgREST
 → PostgREST                          verify JWT signature + expiry, then in one transaction:
                                        set local role authenticated;
                                        set_config('request.jwt.claims', '{"sub":"<uid>",...}', true);
                                        select public.create_tour_full(...);
 → Postgres                           EXECUTE check → function body → commit → JSON
```

A table or view read (`supabase.from('tours_view').select('*')`) takes the same path as a
plain `select` run as `authenticated`, with RLS applied. The same token also opens Storage
(`/storage/v1`, `storage.objects` policies) and Realtime (`/realtime/v1`, table RLS for
`postgres_changes`, `realtime.messages` policies for broadcasts). The Auth API (`/auth/v1`)
issues the tokens and is not governed by database grants. The Worker takes the same path
with the service key (`service_role`); the database calls the Worker back through `pg_net`.

## The gates

Authentication happens once, at login: the OTP verify returns an access token — a JWT signed
with the project secret, valid one hour (`jwt_expiry = 3600`), carrying `sub`, `role`, `exp`.
Every request after that is authorization:

| #   | Gate                    | Checks                                                                                                                                                                            | On failure                                                |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | API gateway             | `apikey` is a valid project key — not a secret, only identifies the project                                                                                                       | 401                                                       |
| 2   | PostgREST               | JWT signature + expiry; `set local role <role claim>`, claims → `request.jwt.claims`. No user token → `anon`. An expired token is rejected, never downgraded to `anon`            | 401                                                       |
| 3   | Schema exposure         | Only schemas in `[api] schemas` (`public`, `graphql_public` — `supabase/config.toml`) get endpoints                                                                               | 404                                                       |
| 4   | **EXECUTE privilege**   | The calling role holds EXECUTE on the function (`proacl` entry `authenticated=X/postgres`)                                                                                        | `42501 permission denied for function` → 401 (anon) / 403 |
| 5   | **Inside the function** | _Invoker:_ runs as the caller, RLS applies to every table it touches. _Definer:_ runs as its owner, which bypasses RLS — **the body's own `auth.uid()` checks are the only gate** | whatever the function decides                             |

Gates 1–3 are coarse. Gate 4 decides who may call at all, gate 5 what they get. Granting
EXECUTE to `authenticated` means "anyone with an account may call this with any arguments",
so a definer function behind that grant must authorize the caller itself.

## SECURITY DEFINER

- **Invoker (default):** the body runs with the caller's privileges; `current_user` is
  `authenticated`.
- **Definer:** the body runs with the privileges of the function's **owner** — no matter who
  calls it: a PostgREST client, another function, a trigger, `pg_cron`. Nothing "assigns"
  `postgres`: the owner is whichever role ran `create function` (or a later
  `alter function … owner to`). Migrations run as `postgres`, so `postgres` owns ours.
- **What switches:** `current_user` and with it every privilege check. RLS is skipped because
  `postgres` has `BYPASSRLS` and owns the tables — a consequence of who the owner is, not of
  definer itself; an owner without those rights would still be filtered by RLS.
- **What does not switch:** `session_user` stays `authenticator`, and `request.jwt.claims`
  stays as PostgREST set it, so **`auth.uid()` still returns the caller**. That is what makes
  self-authorization possible.
- **Gate 4 still applies to the caller.** Definer changes what the body may do, not who may
  start it: the caller needs EXECUTE first.
- **Nested calls run as the owner.** A function called from a definer body is
  privilege-checked against the owner, so internal helpers need no client grant. Trigger
  functions are not EXECUTE-checked when they fire either (only at `create trigger`).
- **Views use the same mechanism.** A view without `security_invoker` runs as its owner —
  how `tours_view` was readable, updatable and deletable with the anon key until
  `20261012144059`.
- **`auth.uid()` is `null`** with no JWT: `pg_cron` jobs, Worker (`service_role`) writes and
  the triggers they fire. A check like "caller must be X" silently returns nothing there.

## search_path

`search_path` is the ordered list of schemas Postgres searches for an **unqualified** name
(`tours`, `now()`, `geography`). A function without `set search_path` resolves names with the
**caller's** path at call time. In a definer function that is dangerous: whoever can put an
object earlier in that path (a schema they can write, or a temp table — `pg_temp` is searched
first for tables unless listed explicitly) makes the function run _their_ object with the
owner's privileges.

- `set search_path = ''` leaves only `pg_catalog` built-ins (and, for table names, the
  session's temp schema), so every other name must be schema-qualified (`public.tours`,
  `auth.users`, `extensions.st_x`) — an unqualified function or type fails loudly instead of
  resolving somewhere unexpected, and a qualified name cannot be shadowed. Default for new
  functions.
- A fixed list (`public, extensions` on `create_tour_full` / `update_tour_full`, whose bodies
  use the PostGIS `geography` type unqualified) is acceptable because clients cannot create
  objects in those schemas (`authenticated` has no CREATE on `public` or `extensions`).
- Through PostgREST a client cannot run `set` or DDL, so this is defense in depth — it holds
  even if a future grant, extension or role change opens a writable schema. Supabase's
  database linter flags it as `function_search_path_mutable`.

## How EXECUTE grants resolve

A role's effective privilege is the union of grants to the role itself, to roles it is a
member of, and to `PUBLIC`. Two defaults granted EXECUTE broadly:

1. PostgreSQL grants EXECUTE to `PUBLIC` on every new function.
2. Supabase's default privileges (`pg_default_acl`) granted EXECUTE on new `public`
   functions created by `postgres` to `anon`, `authenticated` and `service_role`.

So revoking from one role alone changed nothing — the role still held EXECUTE through
`PUBLIC` or the default grant. `20261012144059_security_hardening.sql` step 2 therefore:

- revokes internal helpers from `public, anon, authenticated` at once;
- revokes everything from `public, anon` (no signed-out feature calls a function);
- changes the defaults so new functions start closed: `postgres`-created functions in
  `public` now get EXECUTE for `postgres` and `service_role` only. Default privileges are
  per creating role — objects created by other roles (e.g. `supabase_admin`) keep theirs.

Removing client EXECUTE from a helper changes no app behaviour when every caller is a definer
function or trigger (they run as the owner). It **does** break callers that run as the
client: RPC endpoints, functions used in **RLS policies**, and functions used in
**`security_invoker` views** — those need the grant.

## Checklist for a new function

1. Invoker unless it must read across users; then `security definer`.
2. Definer: `set search_path = ''` and schema-qualify every name.
3. Definer and client-callable: authorize `auth.uid()` in the body; return only what that
   caller may see. Prefer the narrowest return shape (a boolean about the caller beats a
   list about everyone).
4. `grant execute on function public.<fn>(<args>) to authenticated;` — nothing to `anon`
   unless a signed-out feature needs it. `service_role` gets EXECUTE by default.
5. Internal helper (only definer functions / triggers call it): no client grant.
6. pgTAP: impersonate an unrelated user and assert `42501` or an empty result.

## Worked example: `tour_partner_user_ids`

`tour_partner_user_ids(p_tour_id)` resolves a tour's partner contacts to registered user ids.
It is definer (it must read the owner's private `contact_methods` and `auth.users`) and
returns the whole roster without checking the caller.

**The leak.** `authenticated` held EXECUTE, so any account could call
`rpc('tour_partner_user_ids', { p_tour_id })`. Tour ids are random UUIDs, but every friend
receives them: `friend_tours_view` returns `id` for a friend's friends-visible tours, partner
or not. A non-partner friend could read the roster that the view gates away from them, and
`get_user_names_by_ids` names the ids that are also their friends.

**Why not just revoke.** `friend_tours_view` (`security_invoker`) and three partner-friend
read policies (`tour_attachments_select_partner_friend`, `tour-gpx partner friend select`,
`tour-attachments partner friend select`) called it as the client — gate 4 applies to them.

**Why not gate inside.** "Return the roster only to a partner or the owner" breaks the
`pg_cron` reminder and weekly-summary jobs (`fn_tour_reminders`,
`fn_weekly_availability_summary` → `fn_friend_partner_ids` → `tour_partner_user_ids`):
`auth.uid()` is `null` there, so partners would silently stop being notified. A
"null caller sees everything" exception would make the function's answer depend on its
calling context, across ten callers.

**The fix** — split by what each caller needs:

| Caller                                                            | Runs as            | Needs                                |
| ----------------------------------------------------------------- | ------------------ | ------------------------------------ |
| `friend_tours_view` + the three policies                          | `authenticated`    | "is the caller a partner?" — one bit |
| ten definer functions (the cron jobs via `fn_friend_partner_ids`) | `postgres` (owner) | the full roster                      |

```sql
create function public.is_tour_partner(p_tour_id uuid)
  returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select auth.uid()) = any (public.tour_partner_user_ids(p_tour_id)), false) $$;
grant execute on function public.is_tour_partner(uuid) to authenticated;

-- view + 3 policies: `auth.uid() = any (tour_partner_user_ids(t.id))` → `public.is_tour_partner(t.id)`
revoke execute on function public.tour_partner_user_ids(uuid) from authenticated;
```

A boolean about yourself reveals nothing you did not know; the roster function becomes an
internal helper that only owner-context code reaches. Covered by
`supabase/tests/security_hardening.sql` §8.

## Inspecting

```sql
-- owner, definer flag, pinned search_path, EXECUTE grants
select oid::regprocedure, proowner::regrole, prosecdef, proconfig, proacl
from pg_proc where proname = 'tour_partner_user_ids';

-- default privileges for future functions
select defaclrole::regrole, defaclnamespace::regnamespace, defaclacl
from pg_default_acl where defaclobjtype = 'f';

-- may a role call it?
select has_function_privilege('authenticated', 'public.is_tour_partner(uuid)', 'execute');

-- impersonate a user the way PostgREST does (pgTAP suites use the same pattern)
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<uid>","role":"authenticated"}', true);
select public.is_tour_partner('<tour id>');
rollback;
```
