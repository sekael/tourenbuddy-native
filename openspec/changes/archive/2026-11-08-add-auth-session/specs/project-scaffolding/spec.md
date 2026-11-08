## MODIFIED Requirements

### Requirement: Environment variables validated at startup

The app SHALL validate its environment with a Zod schema when it starts: `EXPO_PUBLIC_SUPABASE_URL`
(a URL with its scheme) and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (non-empty) are required, with empty
strings treated as unset. The validated `env` object SHALL be the only way to access environment
variables in app code. Variables for later features are added with their first consumer.

#### Scenario: Missing environment variable

- **WHEN** the app starts without `EXPO_PUBLIC_SUPABASE_URL` set, or with it empty
- **THEN** the validation SHALL throw an error naming the variable before any screen renders

#### Scenario: Valid environment

- **WHEN** both `EXPO_PUBLIC_SUPABASE_URL` (valid URL) and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  (non-empty string) are set
- **THEN** the `env` object SHALL be available with typed properties

#### Scenario: URL without a scheme

- **WHEN** `EXPO_PUBLIC_SUPABASE_URL` is set to a host without `http://` or `https://`
- **THEN** the validation SHALL throw an error naming the variable

### Requirement: Supabase client initialized as singleton

A shared Supabase client SHALL be created with the validated environment variables and reused
across all services. On iOS and Android it SHALL persist the session in secure storage (see `auth`)
and SHALL NOT look for a session in URLs, since sign-in uses a code and no redirect.

#### Scenario: Client creation

- **WHEN** the app initializes
- **THEN** a single Supabase client instance SHALL be created and exported for use by all
  repositories
