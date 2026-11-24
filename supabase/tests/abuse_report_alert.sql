-- Abuse report alert (change: add-native-backend, design D6).
--
-- The trigger only hands the report to pg_net; locally Vault has no `notify_hook_url`, so it must
-- stay silent there and never block the report. With Vault set (simulated inside the
-- transaction) it queues exactly one request per insert or repeat, and none when a deletion
-- anonymizes the row.
--
-- pgTAP. Seed identities: Patrick 1111, Reni 3333.

\set ON_ERROR_STOP on
\set patrick '11111111-1111-1111-1111-111111111111'
\set reni '33333333-3333-3333-3333-333333333333'

begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

delete from public.abuse_reports;
delete from vault.secrets where name in ('notify_hook_url', 'notify_webhook_secret');

-- 1. Without Vault: the report is recorded, nothing is queued.
create temp table queued_before as select count(*)::int n from net.http_request_queue;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select lives_ok($$ select public.report_user('33333333-3333-3333-3333-333333333333'::uuid, 'spam') $$, 'report recorded without Vault');
reset role;
select is(
  (select count(*)::int from net.http_request_queue) - (select n from queued_before),
  0, 'nothing queued without Vault'
);

-- 2. With Vault: one request per report and per repeat, to /moderation/report.
select vault.create_secret('https://worker.example', 'notify_hook_url');
select vault.create_secret('s3cret', 'notify_webhook_secret');
truncate queued_before;
insert into queued_before select count(*)::int from net.http_request_queue;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select public.report_user(:'reni'::uuid, 'spam again');
reset role;
select is(
  (select count(*)::int from net.http_request_queue where url = 'https://worker.example/moderation/report')
    - 0,
  1, 'a repeat report queues one alert'
);
select is(
  (select (convert_from(body, 'utf8')::jsonb)->>'reason' from net.http_request_queue
    where url = 'https://worker.example/moderation/report' order by id desc limit 1),
  'spam again', 'the alert carries the reason'
);

-- 3. Anonymizing on account deletion is not a report.
update public.abuse_reports set reporter_user_id = null where reported_user_id = :'reni';
select is(
  (select count(*)::int from net.http_request_queue where url = 'https://worker.example/moderation/report'),
  1, 'anonymizing queues nothing'
);

select * from finish();
rollback;
