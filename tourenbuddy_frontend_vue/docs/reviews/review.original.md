You are performing an architectural code review of a Vue 3 PWA.
Do NOT read every file. Navigate the repo structure first, then
sample selectively based on what you find.

**IMPORTANT: This is a read-only review. Do NOT modify, create,
or delete any file under any circumstance. Only report findings.**

**Review scope (in priority order):**

1. Architecture & module boundaries — check `src/features/` for
   DDD violations, circular deps, or leaking domain logic into
   presentation
2. Spec conformance — check that API calls, data models, and
   request/response shapes in the codebase match the OpenAPI
   specs in `specs/`
3. Security — RLS surface, Supabase client usage, any secrets/keys
   in non-.env files, unauthenticated route guards
4. State management — Pinia store patterns, reactivity misuse,
   missing error/loading states
5. PWA fundamentals — service worker strategy, offline handling,
   manifest completeness
6. Vue 3 best practices — Options vs Composition API consistency,
   defineProps/emits usage, v-model patterns

**What to read:**

- Top-level directory tree (1 level deep)
- `src/features/` tree (2 levels deep)
- `specs/` fully — read all spec files before touching any
  implementation code; build a mental model of the intended
  contract first
- One representative store, one repository, one service file
  (your choice based on the tree)
- `src/router/index.ts` (auth guards)
- `vite.config.ts` + `vite-pwa` plugin config
- Any file named `supabase.ts`, `client.ts`, or similar DB init

**What NOT to read:** tests, `node_modules`, lock files,
auto-generated types, migration SQL files.

**Spec conformance — what to check:**
For each spec file found, cross-reference against the matching
feature implementation and flag:

- Endpoints called in code but absent from the spec (undocumented
  surface)
- Endpoints in the spec with no corresponding implementation
  (unimplemented contract)
- Request payload shapes that differ from spec (wrong field names,
  missing required fields, wrong types)
- Response payload shapes that the code assumes but the spec does
  not guarantee (fragile destructuring)
- Error codes/states defined in the spec that are not handled in
  the store or repository layer
- Any RPC call whose signature or return shape differs from how
  the code invokes or parses it

Only compare what is actually readable in both the spec and the
sampled implementation files — do not infer full coverage from
partial reads.

**Output format:**
For each finding, use this structure:
[SEVERITY: Critical/High/Medium/Low]
[CATEGORY: Architecture | Spec Gap | Security | State | PWA | Vue]
File: path/to/file.ts (line if known)
Spec: specs/filename.yaml (path + operation/schema if relevant)
Issue: one sentence
Why it matters: one sentence
Suggestion: concrete recommendation (do not implement this)

**Output format:**
For each finding, use this structure:
[SEVERITY: Critical/High/Medium/Low]
[CATEGORY: Architecture | Spec Gap | Security | State | PWA | Vue]
File: path/to/file.ts (line if known)
Spec: specs/filename.yaml (path + operation/schema if relevant)
Issue: one sentence
Why it matters: one sentence
Suggestion: concrete recommendation (do not implement this)

When the review is complete, write ALL findings to a new file at:
`docs/reviews/code-review-[YYYY-MM-DD].md`

Create any missing directories. The file structure should be:

---

# Code Review — [date]

## Summary

[2–3 sentence overview of overall codebase health]

## Findings by Category

### Architecture

[findings]

### Spec Gaps

[findings]

### Security

[findings]

### State Management

[findings]

### PWA

[findings]

### Vue Best Practices

[findings]

## Priority Action List

Top 5 findings to address first, ranked by severity and impact.

---

Do NOT print the full findings to the terminal. Print only a
one-line confirmation once the file is written:
"Review complete — findings written to docs/reviews/code-review-[date].md"
