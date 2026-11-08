-- Push is per device (change: notification-inbox): a `push_subscriptions` row existing IS
-- "push enabled" for that browser. Neither the client nor the Worker reads the account-wide
-- flag any more (20261008073325_per_device_push.sql already reconciled the rows), so drop it.
--
-- Old PWA builds still select/write this column until they take the update prompt; their
-- preferences load then fails (PostgREST unknown column) and they show the prefs error state.
-- Accepted: the update prompt fixes it, and push itself keeps working off the rows.
alter table public.user_profile drop column notif_push_enabled;
