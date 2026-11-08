-- Users with verifiable email (you'll OTP-login as each).
insert into auth.users (id, email, instance_id, aud, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'alice@local.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bob@local.test',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'carol@local.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.user_profile (id, first_name, last_name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice', 'Alpine'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Bob',   'Bergstein'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Carol', 'Climbing');

-- Mutual friendships (Alice↔Bob, Bob↔Carol, Alice↔Carol).
insert into public.friendships (request_user_id, response_user_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc');
