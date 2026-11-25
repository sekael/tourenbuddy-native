ALTER TABLE user_profile ADD COLUMN locale text;
ALTER TABLE user_profile ADD CONSTRAINT user_profile_locale_check CHECK (locale IS NULL OR locale IN ('en', 'de-CH'));
