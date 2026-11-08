-- Explicit Data API GRANTs for tables created after the baseline schema.
--
-- Context: Supabase is removing the default exposure of `public` tables to the
-- Data API (PostgREST / supabase-js / GraphQL).
--   - New projects: enforced 2026-05-30
--   - Existing projects (ours): enforced 2026-10-30, only on NEW tables
--
-- Tables created post-baseline currently rely on implicit default privileges.
-- Re-declaring grants explicitly is idempotent and safe today, and keeps the
-- migrations replayable against newer Supabase defaults (e.g. local `db reset`
-- once the CLI image flips defaults).
--
-- See: https://github.com/orgs/supabase/discussions/45329

grant all on table public.tour_attachments to anon, authenticated, service_role;

grant all on table public.user_blocks to anon, authenticated, service_role;
grant all on table public.abuse_reports to anon, authenticated, service_role;

grant all on table public.tour_link_group to anon, authenticated, service_role;
grant all on table public.tour_link_member to anon, authenticated, service_role;
grant all on table public.tour_link_request to anon, authenticated, service_role;
