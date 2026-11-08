## Git Workflow

- IMPORTANT: Before ANY new feature or task, ALWAYS create branch from latest `main`:
  `git fetch origin && git checkout main && git pull && git checkout -b feat/<issue-number>-<short-description>`
- Branch naming: `feat/<issue-number>-<description>` or `fix/<issue-number>-<description>`, omit issue number if none
- NEVER run `git commit`. ALWAYS prompt user to commit + provide ready-to-copy conventional commit message
- Commit messages MUST follow conventional commits: `type(scope): description`
  - Types: feat, fix, refactor, test, docs, chore, style
- Commits atomic — one logical change per commit
- Never commit to `main`
- Versioning automated by release-please — DO NOT MANUALLY edit version in package.json

## Database Workflow

- IMPORTANT: NEVER apply schema changes directly to productive Supabase. Local-first only.
- Every DB change → new migration file in `supabase/migrations/<timestamp>_<name>.sql` via `supabase migration new <name>`
- Verify locally with `supabase db reset` before commit
- `supabase db push` to prod is a deploy step — prompt user, do not run unprompted
- See `.claude/conventions.md` → Supabase / Database for full rules
