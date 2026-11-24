-- Users must opt-in to notifications; change column defaults and reset existing rows to false.
ALTER TABLE user_profile
  ALTER COLUMN notif_push_enabled SET DEFAULT false,
  ALTER COLUMN notif_email_enabled SET DEFAULT false;

UPDATE user_profile SET notif_push_enabled = false, notif_email_enabled = false;
