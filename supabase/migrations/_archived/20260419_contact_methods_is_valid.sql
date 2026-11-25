-- Add is_valid flag to contact_methods to track whether a phone value is a valid E.164 number.
-- Default true: all newly inserted rows are expected to be valid (repository enforces this).
-- The one-time migration script (scripts/migrate-phones-to-e164.ts) sets is_valid=false for
-- pre-existing rows that cannot be normalized to E.164.
ALTER TABLE contact_methods
  ADD COLUMN IF NOT EXISTS is_valid BOOLEAN NOT NULL DEFAULT TRUE;
