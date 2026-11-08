# Testing

- ALWAYS test edge cases and failure scenarios
- NEVER test happy path (everything successful)
- Keep tests brief and concise for faster execution
- Vitest + happy-dom. Test files mirroring `src/` structure under `test/`
- Mock abstract repository interfaces, never concrete implementations
- Pinia stores: `createTestingPinia()` for component tests, direct instantiation for unit tests
- Test file location: `src/features/tours/...` → `test/features/tours/...`
- Descriptive names: `'should return user when credentials are valid'`
- Run `npm run test` after every implementation — all must pass
- Database: pgTAP suites in `supabase/tests/*.sql` (RLS, notification emission, security regressions). Run `supabase db reset && supabase test db` after any migration; they assume pristine seed data and roll back
- Worker (`services/email-hook`): own Vitest suite, `cd services/email-hook && npm test`
- Playwright installed but no E2E config or tests yet
