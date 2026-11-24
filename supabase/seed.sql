-- =============================================================================
-- Local-only test data seed
-- -----------------------------------------------------------------------------
-- Runs automatically on `supabase db reset` (configured via [db.seed] in
-- config.toml). NEVER pushed to production by `supabase db push`.
--
-- Six test users with verified phone numbers so friendship features work:
--   Patrick (patrick@tourenbuddy.ch / +41790000001) — friends with Jakob; friends with Selim
--   Jakob   (jakob@tourenbuddy.ch   / +41790000002) — friends with Patrick
--   Reni    (reni@tourenbuddy.ch    / +41790000003) — pending friend req → Patrick; pending friend req → Selim
--   Selim   (selim@tourenbuddy.ch   / +41790000004) — no profile name set; friends with Patrick;
--                                                    pending friend req → Anna; pending incoming from Reni
--   Anna    (anna@tourenbuddy.ch    / +41790000005) — pending incoming from Selim
--   Lena    (lena@tourenbuddy.ch    / +41790000006) — friends with Patrick; owns the tour
--                                                    detail showcase (see end of file)
--
-- The Selim/Anna/Reni triplet exercises friendship+request cleanup paths:
--   • deleting Selim's "Patrick" contact (or its phone) → removes Selim↔Patrick friendship
--   • deleting Selim's "Anna" contact (or its phone) → cancels Selim→Anna pending (outgoing)
--   • deleting Selim's "Reni" contact (or its phone) → denies Reni→Selim pending (incoming)
--   • delete_own_phone() on Selim → all three cleaned in one transaction
--
-- Tours:
--   ...01 Büelehora   — Patrick, no partners (a friend sees it gated)
--   ...02 Gfroren Hora — Patrick, partner Jakob (Jakob sees full detail)
--   ...03 Piz Ela      — JAKOB, partner Patrick (Patrick's friend tour; the one to test
--                        suggestions on, since only a marked partner may suggest)
--   ...10–14          — LENA, one per tour-detail display variant (see end of file)
--
-- Login locally via OTP code "123456" (see [auth.sms.test_otp] and
-- [auth.email.test_otp] in supabase/config.toml).
--
-- All inserts idempotent so re-running this file is safe.
-- =============================================================================

-- ----- auth.users -----------------------------------------------------------
-- phone column stored without leading '+', matching find_user_by_phone() expectations.
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
  ('11111111-1111-1111-1111-111111111111',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'patrick@tourenbuddy.ch',
   crypt('test-password-123', gen_salt('bf')),
   now(),
   '41790000001', now(),
   '{"provider":"email","providers":["email","phone"]}'::jsonb,
   '{"first_name":"Patrick","last_name":"Tester"}'::jsonb,
   now(), now(), '', '', '', ''),
  ('22222222-2222-2222-2222-222222222222',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'jakob@tourenbuddy.ch',
   crypt('test-password-123', gen_salt('bf')),
   now(),
   '41790000002', now(),
   '{"provider":"email","providers":["email","phone"]}'::jsonb,
   '{"first_name":"Jakob","last_name":"Tester"}'::jsonb,
   now(), now(), '', '', '', ''),
  ('33333333-3333-3333-3333-333333333333',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'reni@tourenbuddy.ch',
   crypt('test-password-123', gen_salt('bf')),
   now(),
   '41790000003', now(),
   '{"provider":"email","providers":["email","phone"]}'::jsonb,
   '{"first_name":"Reni","last_name":"Tester"}'::jsonb,
   now(), now(), '', '', '', ''),
  ('44444444-4444-4444-4444-444444444444',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'selim@tourenbuddy.ch',
   crypt('test-password-123', gen_salt('bf')),
   now(),
   '41790000004', now(),
   '{"provider":"email","providers":["email","phone"]}'::jsonb,
   '{}'::jsonb,
   now(), now(), '', '', '', ''),
  ('55555555-5555-5555-5555-555555555555',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'anna@tourenbuddy.ch',
   crypt('test-password-123', gen_salt('bf')),
   now(),
   '41790000005', now(),
   '{"provider":"email","providers":["email","phone"]}'::jsonb,
   '{"first_name":"Anna","last_name":"Tester"}'::jsonb,
   now(), now(), '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- ----- auth.identities ------------------------------------------------------
-- Required for email-based login alongside the auth.users row.
INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) VALUES
  ('11111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111',
   jsonb_build_object('sub','11111111-1111-1111-1111-111111111111','email','patrick@tourenbuddy.ch','email_verified',true,'phone_verified',true),
   'email', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222',
   jsonb_build_object('sub','22222222-2222-2222-2222-222222222222','email','jakob@tourenbuddy.ch','email_verified',true,'phone_verified',true),
   'email', now(), now(), now()),
  ('33333333-3333-3333-3333-333333333333',
   '33333333-3333-3333-3333-333333333333',
   jsonb_build_object('sub','33333333-3333-3333-3333-333333333333','email','reni@tourenbuddy.ch','email_verified',true,'phone_verified',true),
   'email', now(), now(), now()),
  ('44444444-4444-4444-4444-444444444444',
   '44444444-4444-4444-4444-444444444444',
   jsonb_build_object('sub','44444444-4444-4444-4444-444444444444','email','selim@tourenbuddy.ch','email_verified',true,'phone_verified',true),
   'email', now(), now(), now()),
  ('55555555-5555-5555-5555-555555555555',
   '55555555-5555-5555-5555-555555555555',
   jsonb_build_object('sub','55555555-5555-5555-5555-555555555555','email','anna@tourenbuddy.ch','email_verified',true,'phone_verified',true),
   'email', now(), now(), now())
ON CONFLICT (provider, provider_id) DO NOTHING;

-- ----- public.user_profile --------------------------------------------------
INSERT INTO public.user_profile (id, first_name, last_name, locale)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Patrick', 'Tester', 'de-CH'),
  ('22222222-2222-2222-2222-222222222222', 'Jakob',   'Tester', 'de-CH'),
  ('33333333-3333-3333-3333-333333333333', 'Reni',    'Tester', 'de-CH'),
  ('44444444-4444-4444-4444-444444444444', null,      null,     'de-CH'),
  ('55555555-5555-5555-5555-555555555555', 'Anna',    'Tester', 'de-CH')
ON CONFLICT (id) DO NOTHING;

-- ----- public.contacts ------------------------------------------------------
-- Each user has the other as a contact so tour_partners linking works.
INSERT INTO public.contacts (id, first_name, last_name, display_name, user_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Jakob',   'Tester', 'Jakob Tester',
   '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Patrick', 'Tester', 'Patrick Tester',
   '22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Patrick', 'Tester', 'Patrick Tester',
   '33333333-3333-3333-3333-333333333333'),
  -- Selim's contacts cover all three cleanup paths (friendship, outgoing pending, incoming pending).
  ('aaaaaaaa-0000-0000-0000-000000000004', 'Patrick', 'Tester', 'Patrick Tester',
   '44444444-4444-4444-4444-444444444444'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'Anna',    'Tester', 'Anna Tester',
   '44444444-4444-4444-4444-444444444444'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'Reni',    'Tester', 'Reni Tester',
   '44444444-4444-4444-4444-444444444444')
ON CONFLICT (id) DO NOTHING;

-- ----- public.contact_methods (phones with leading '+') ---------------------
INSERT INTO public.contact_methods (contact_id, method_type, value, is_primary) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'phone', '+41790000002', true),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'phone', '+41790000001', true),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'phone', '+41790000001', true),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'phone', '+41790000001', true),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'phone', '+41790000005', true),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'phone', '+41790000003', true)
ON CONFLICT (contact_id, method_type, value) DO NOTHING;

-- ----- public.friendships ---------------------------------------------------
-- Patrick ↔ Jakob (long-standing). Patrick ↔ Selim (exercises Selim's friendship-cleanup paths).
INSERT INTO public.friendships (request_user_id, response_user_id, created_at)
VALUES
  ('11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222',
   now()),
  ('11111111-1111-1111-1111-111111111111',
   '44444444-4444-4444-4444-444444444444',
   now())
ON CONFLICT DO NOTHING;

-- ----- public.friend_requests (pending) ------------------------------------
-- Reni → Patrick: existing scenario.
-- Selim → Anna: outgoing pending from Selim's perspective (cancelled when Selim deletes contact "Anna").
-- Reni → Selim: incoming pending from Selim's perspective (denied when Selim deletes contact "Reni").
INSERT INTO public.friend_requests (id, from_user_id, to_user_id, status, created_at)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001',
   '33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'pending', now()),
  ('bbbbbbbb-0000-0000-0000-000000000002',
   '44444444-4444-4444-4444-444444444444',
   '55555555-5555-5555-5555-555555555555',
   'pending', now()),
  ('bbbbbbbb-0000-0000-0000-000000000003',
   '33333333-3333-3333-3333-333333333333',
   '44444444-4444-4444-4444-444444444444',
   'pending', now())
ON CONFLICT (id) DO NOTHING;

-- ----- public.tours ---------------------------------------------------------
-- Solo tour for Patrick.
INSERT INTO public.tours (id, planned_date, user_id, goal, name, tour_types, elevation, description, seasons, start_point, end_point, equipment, notes, completed, start_point_name, start_point_elevation, end_point_name, end_point_elevation, gpx_filepath) VALUES ('cccccccc-0000-0000-0000-000000000001', '2026-05-17', '11111111-1111-1111-1111-111111111111', '0101000020E6100000805554B4A3C6234018C9E1F574654740', 'Büelehora', '{hiking}', 2512, NULL, '{summer}', '0101000020E610000040ECF72C27B023406871F8EABF674740', NULL, NULL, NULL, false, 'Flüelabach', 1559, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Joint tour: owned by Patrick, partner = Jakob (via Patrick's contact for Jakob).
INSERT INTO public.tours (id, planned_date, user_id, goal, name, tour_types, elevation, description, seasons, start_point, end_point, equipment, notes, completed, start_point_name, start_point_elevation, end_point_name, end_point_elevation, gpx_filepath) VALUES ('cccccccc-0000-0000-0000-000000000002', '2027-01-09', '11111111-1111-1111-1111-111111111111', '0101000020E61000009045D1B72ABE2340487CC076605C4740', 'Gfroren Hora', '{skitour}', 2747, NULL, '{winter}', '0101000020E610000020A6FC867AB22340A4FEF803E85C4740', '0101000020E610000020A6FC867AB22340A4FEF803E85C4740', NULL, NULL, false, 'Sertig Dörfji', 1864, 'Sertig Dörfji', 1864, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tour_partners (tour_id, contact_id) VALUES
  ('cccccccc-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Friend-owned tour: owned by JAKOB, partner = Patrick (via Jakob's contact for Patrick).
-- This is the mirror of tour ...02 and the one Patrick reads through friend_tours_view
-- rather than tours_view. Patrick being a marked partner is what makes it ungated for him
-- — and what lets him suggest changes on it (change: tour-suggestions).
--
-- Multi-day on purpose: `planned_date` + `end_date` are one logical field for suggestions,
-- so a seeded span exercises that coupling instead of the single-date shortcut.
--
-- Coordinates are built with PostGIS functions rather than the opaque EWKB hex above, so
-- the location is readable: goal = Piz Ela, start = Preda station (Albula valley).
-- `visibility` is omitted to take the column default ('friends') like the tours above; a
-- private tour here would be invisible to Patrick entirely.
INSERT INTO public.tours (
  id, planned_date, end_date, user_id, goal, name, tour_types, elevation,
  description, seasons, start_point, end_point, equipment, notes, completed,
  start_point_name, start_point_elevation, end_point_name, end_point_elevation, gpx_filepath
) VALUES (
  'cccccccc-0000-0000-0000-000000000003',
  '2027-02-13',
  '2027-02-14',
  '22222222-2222-2222-2222-222222222222',
  '0101000020E61000007EA67109546A23400573FA230D4D4740',
  'Piz Ela',
  '{mountaineering}',
  3339,
  'Zwei Tage mit Übernachtung in der Chamanna d''Es-cha.',
  '{winter,spring}',
  '0101000020E6100000C3F5285C8F82234050FC1873D74A4740',
  '0101000020E6100000C3F5285C8F82234050FC1873D74A4740',
  'Harscheisen, Seil, Friends, Keile',
  NULL,
  false,
  'Preda',
  1789,
  'Preda',
  1789,
  NULL
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tour_partners (tour_id, contact_id) VALUES
  ('cccccccc-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Tour detail showcase (change: location-search-and-compact-tour-details)
-- -----------------------------------------------------------------------------
-- Lena (lena@tourenbuddy.ch / +41790000006) owns one tour per display variant of the
-- tour detail view. Log in as Lena for the OWNER view (icon toggles, stamps), as
-- Patrick for the FRIEND view of the same tours (owner line, "Completed" pill,
-- "+N more" partners). Check each in the mobile bottom sheet and the desktop drawer.
--
--   ...10 Piz Palü …     everything: splitboarding (new icon), date range across two
--                        months, distinct named start/end, 3 partners (Patrick + two
--                        unregistered contacts → "+2 more" for Patrick), all texts,
--                        URL in description, long name for title wrapping
--   ...11 Schwarzhorn    skitour (new icon), NO elevation (date leads the hero),
--                        start/end as coordinates only, partner Patrick
--   ...12 Pischahorn     legacy minimum: name + goal only (no type/elevation/date) →
--                        badge + coordinates; Patrick sees it gated (not a partner)
--   ...13 Piz Kesch      completed AND private (both stamps), round trip, notes only;
--                        invisible to Patrick
--   ...14 Sentischhorn   completed, past same-month range, partner Patrick + one
--                        unregistered → Patrick sees "Completed" pill + "+1 more"
--
-- Kept apart from Patrick/Jakob/Selim on purpose so the pgTAP suites stay valid:
--   • Lena is friends with Patrick only → Jakob still sees exactly Patrick's 2 tours
--     (friend_tour_visibility_rls 4.3a).
--   • Lena never has availability rows → never part of a weekly summary
--     (notification_jobs 2.x).
--   • Dates are relative to current_date and never current_date + 5 → no reminders
--     (notification_jobs 3e). ...10's range always starts ~1 month out and spans a
--     month boundary.
-- =============================================================================

INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
  ('66666666-6666-6666-6666-666666666666',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'lena@tourenbuddy.ch',
   crypt('test-password-123', gen_salt('bf')),
   now(),
   '41790000006', now(),
   '{"provider":"email","providers":["email","phone"]}'::jsonb,
   '{"first_name":"Lena","last_name":"Tester"}'::jsonb,
   now(), now(), '', '', '', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) VALUES
  ('66666666-6666-6666-6666-666666666666',
   '66666666-6666-6666-6666-666666666666',
   jsonb_build_object('sub','66666666-6666-6666-6666-666666666666','email','lena@tourenbuddy.ch','email_verified',true,'phone_verified',true),
   'email', now(), now(), now())
ON CONFLICT (provider, provider_id) DO NOTHING;

INSERT INTO public.user_profile (id, first_name, last_name, locale)
VALUES ('66666666-6666-6666-6666-666666666666', 'Lena', 'Tester', 'de-CH')
ON CONFLICT (id) DO NOTHING;

-- Lena's partners: Patrick (registered → resolves to his name for him), Marco (phone of
-- no registered user) and Sandra (no phone) → both unresolved, i.e. "+N more" pills.
-- Patrick gets a contact for Lena so the friendship has its usual mutual contacts.
INSERT INTO public.contacts (id, first_name, last_name, display_name, user_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000010', 'Patrick', 'Tester', 'Patrick Tester',
   '66666666-6666-6666-6666-666666666666'),
  ('aaaaaaaa-0000-0000-0000-000000000011', 'Marco', 'Bergführer', 'Marco Bergführer',
   '66666666-6666-6666-6666-666666666666'),
  ('aaaaaaaa-0000-0000-0000-000000000012', 'Sandra', 'Beispiel', 'Sandra Beispiel',
   '66666666-6666-6666-6666-666666666666'),
  ('aaaaaaaa-0000-0000-0000-000000000013', 'Lena', 'Tester', 'Lena Tester',
   '11111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contact_methods (contact_id, method_type, value, is_primary) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000010', 'phone', '+41790000001', true),
  ('aaaaaaaa-0000-0000-0000-000000000011', 'phone', '+41790000099', true),
  ('aaaaaaaa-0000-0000-0000-000000000013', 'phone', '+41790000006', true)
ON CONFLICT (contact_id, method_type, value) DO NOTHING;

INSERT INTO public.friendships (request_user_id, response_user_id, created_at)
VALUES ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', now())
ON CONFLICT DO NOTHING;

-- Points as (lng, lat) so they stay readable; values are approximate.
INSERT INTO public.tours (
  id, user_id, name, tour_types, elevation, planned_date, end_date, visibility, completed,
  goal, start_point, start_point_name, start_point_elevation,
  end_point, end_point_name, end_point_elevation,
  seasons, description, equipment, notes
) VALUES
  ('cccccccc-0000-0000-0000-000000000010', '66666666-6666-6666-6666-666666666666',
   'Piz Palü Ostgipfel über den Fortezzagrat mit Abfahrt nach Morteratsch',
   '{splitboarding}', 3882,
   (date_trunc('month', current_date) + interval '2 months')::date - 2,
   (date_trunc('month', current_date) + interval '2 months')::date + 1,
   'friends', false,
   extensions.st_setsrid(extensions.st_makepoint(9.9614, 46.3779), 4326)::extensions.geography,
   extensions.st_setsrid(extensions.st_makepoint(9.9706, 46.4120), 4326)::extensions.geography,
   'Diavolezza', 2973,
   extensions.st_setsrid(extensions.st_makepoint(9.9369, 46.4594), 4326)::extensions.geography,
   'Morteratsch', 1896,
   '{winter,spring}',
   'Mit der ersten Bahn auf die Diavolezza, über den Persgletscher zum Fortezzagrat und weiter zum Ostgipfel. Abfahrt über den Morteratschgletscher, je nach Verhältnissen mit Abstecher zur Bovalhütte. Verhältnisse vorher prüfen: https://www.slf.ch/de/lawinenbulletin-und-schneesituation/ und Routenbeschreibung im SAC-Tourenportal https://www.sac-cas.ch/de/huetten-und-touren/sac-tourenportal/',
   'Splitboard, Felle, Harscheisen, Steigeisen, Pickel, Gurt, Seil 30 m, 2 Eisschrauben, LVS/Schaufel/Sonde',
   'Treffpunkt 07:15 Talstation Diavolezza. Zug ab Pontresina 06:52. Rückfahrt ab Morteratsch stündlich.'),
  ('cccccccc-0000-0000-0000-000000000011', '66666666-6666-6666-6666-666666666666',
   'Schwarzhorn', '{skitour,hiking}', NULL,
   current_date + 21, NULL,
   'friends', false,
   extensions.st_setsrid(extensions.st_makepoint(9.9403, 46.7343), 4326)::extensions.geography,
   extensions.st_setsrid(extensions.st_makepoint(9.9472, 46.7497), 4326)::extensions.geography,
   NULL, NULL,
   extensions.st_setsrid(extensions.st_makepoint(9.9100, 46.7709), 4326)::extensions.geography,
   NULL, NULL,
   '{winter}', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-000000000012', '66666666-6666-6666-6666-666666666666',
   'Pischahorn', '{}', NULL,
   NULL, NULL,
   'friends', false,
   extensions.st_setsrid(extensions.st_makepoint(9.9306, 46.8131), 4326)::extensions.geography,
   NULL, NULL, NULL,
   NULL, NULL, NULL,
   NULL, NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-000000000013', '66666666-6666-6666-6666-666666666666',
   'Piz Kesch', '{mountaineering}', 3418,
   current_date - 30, NULL,
   'private', true,
   extensions.st_setsrid(extensions.st_makepoint(9.8727, 46.6213), 4326)::extensions.geography,
   extensions.st_setsrid(extensions.st_makepoint(9.8650, 46.6383), 4326)::extensions.geography,
   'Chamanna digl Kesch', 2632,
   extensions.st_setsrid(extensions.st_makepoint(9.8650, 46.6383), 4326)::extensions.geography,
   'Chamanna digl Kesch', 2632,
   '{summer}', NULL, NULL,
   'Porchabella-Gletscher stark ausgeapert, Randkluft beim Einstieg offen.'),
  ('cccccccc-0000-0000-0000-000000000014', '66666666-6666-6666-6666-666666666666',
   'Sentischhorn', '{ski-mountaineering}', 2827,
   current_date - 60, current_date - 59,
   'friends', true,
   extensions.st_setsrid(extensions.st_makepoint(9.9087, 46.7186), 4326)::extensions.geography,
   extensions.st_setsrid(extensions.st_makepoint(9.9375, 46.7114), 4326)::extensions.geography,
   'Dürrboden', 2007,
   extensions.st_setsrid(extensions.st_makepoint(9.8936, 46.7578), 4326)::extensions.geography,
   'Teufi', 1702,
   '{winter}', 'Übernachtung im Berghaus Dürrboden.', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- A two-segment outing (#338): valley → hut on day one, hut → summit → valley on day two.
INSERT INTO public.tours (
  id, user_id, name, tour_types, elevation, planned_date, visibility,
  goal, start_point, start_point_name, start_point_elevation,
  end_point, end_point_name, end_point_elevation, seasons,
  outing_id, outing_name, outing_position
) VALUES
  ('cccccccc-0000-0000-0000-000000000015', '66666666-6666-6666-6666-666666666666',
   'Chamanna digl Kesch', '{hiking}', 2632, current_date + 40, 'friends',
   extensions.st_setsrid(extensions.st_makepoint(9.8650, 46.6383), 4326)::extensions.geography,
   extensions.st_setsrid(extensions.st_makepoint(9.7459, 46.6295), 4326)::extensions.geography,
   'Bergün/Bravuogn', 1367,
   NULL, NULL, NULL, '{summer}',
   'eeeeeeee-0000-0000-0000-000000000338', 'Kesch-Runde', 0),
  ('cccccccc-0000-0000-0000-000000000016', '66666666-6666-6666-6666-666666666666',
   'Piz Porchabella', '{mountaineering}', 3079, current_date + 41, 'friends',
   extensions.st_setsrid(extensions.st_makepoint(9.8957, 46.6239), 4326)::extensions.geography,
   extensions.st_setsrid(extensions.st_makepoint(9.8650, 46.6383), 4326)::extensions.geography,
   'Chamanna digl Kesch', 2632,
   extensions.st_setsrid(extensions.st_makepoint(9.8160, 46.6400), 4326)::extensions.geography,
   'Chants', 1822, '{summer}',
   'eeeeeeee-0000-0000-0000-000000000338', 'Kesch-Runde', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tour_partners (tour_id, contact_id) VALUES
  ('cccccccc-0000-0000-0000-000000000015', 'aaaaaaaa-0000-0000-0000-000000000010'),
  ('cccccccc-0000-0000-0000-000000000016', 'aaaaaaaa-0000-0000-0000-000000000010'),
  ('cccccccc-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000010'),
  ('cccccccc-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000011'),
  ('cccccccc-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000012'),
  ('cccccccc-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000010'),
  ('cccccccc-0000-0000-0000-000000000014', 'aaaaaaaa-0000-0000-0000-000000000010'),
  ('cccccccc-0000-0000-0000-000000000014', 'aaaaaaaa-0000-0000-0000-000000000011')
ON CONFLICT DO NOTHING;
