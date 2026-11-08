---
# Code Review — 2026-05-04

## Summary
Codebase is well-organized with a clean DDD layout, Zod-validated boundaries, and sensible Supabase + PWA setup. Main risks cluster around drift between the older `tours` spec and the newer `gpx-tracks` spec, missing reactive wiring between the auth and tours stores, and a couple of PWA manifest gaps. No critical security issues observed in the sampled surface.

## Findings by Category

### Architecture

[SEVERITY: Medium]
[CATEGORY: Architecture]
File: src/features/tours/presentation/stores/tours-store.ts (line 11)
Spec: openspec/specs/tours/spec.md (Tours store)
Issue: Pinia store hardcodes a module-level `new ToursRepositoryImpl()` instead of depending on the abstract `ToursRepository` interface.
Why it matters: Couples presentation directly to data layer; violates DDD inward-pointing dep rule and conflicts with testing convention "Mock abstract repository interfaces, never concrete implementations".
Suggestion: Inject the repository (factory arg or DI provider keyed on `ToursRepository`) so the store binds to the interface and tests can swap a fake.

[SEVERITY: Low]
[CATEGORY: Architecture]
File: src/features/tours/presentation/stores/tours-store.ts (lines 6-7, 22-35)
Spec: n/a (architecture.md — module boundaries)
Issue: Tours store directly imports `useContactsStore` and subscribes via `$onAction` to a sibling feature's internal action.
Why it matters: Cross-feature reach into another feature's store action couples tours to the contacts implementation; if `deleteContact` is renamed, tours silently breaks.
Suggestion: Expose a typed event (e.g. emitted contact-deleted bus or watcher on `contactsStore.contacts` length+id diff) so the contract is explicit, or document `deleteContact` as a public store action under contacts' published API.

### Spec Gaps

[SEVERITY: High]
[CATEGORY: Spec Gap]
File: src/features/tours/data/repositories/tours-repository-impl.ts (lines 21-42, 53-74); src/features/tours/data/models/tour-schema.ts (line 19)
Spec: openspec/specs/tours/spec.md (Requirement "Tour model with Zod validation"; "Tours repository"; "Tours repository supports update")
Issue: tours/spec.md still mandates `gpxTrack` (GeoJSON FeatureCollection) and `p_gpx_track` RPC param, but code (and the newer gpx-tracks/spec.md) uses `gpxFilepath` / `p_gpx_filepath`.
Why it matters: Two specs describe the same surface incompatibly, so any reader / generator following tours/spec.md will produce broken code.
Suggestion: Update tours/spec.md MODIFIED block to reference `gpxFilepath` consistent with gpx-tracks/spec.md, or archive the stale requirement.

[SEVERITY: High]
[CATEGORY: Spec Gap]
File: src/features/tours/presentation/stores/tours-store.ts (entire file — no auth subscription)
Spec: openspec/specs/tours/spec.md (Requirement "Tours store" — "Auto-load on authentication" and "Clear on sign-out")
Issue: Store exposes `loadTours` and `clear` but does not subscribe to auth-store state to auto-load on sign-in or auto-clear on sign-out.
Why it matters: The two scenarios in the spec are unimplemented in the store; correctness depends on an external caller remembering to invoke them in the right order.
Suggestion: Add `watch(() => authStore.isAuthenticated, …)` in the store setup to call `loadTours()` on transition to true and `clear()` on transition to false, or document the orchestrator that owns this lifecycle.

[SEVERITY: Medium]
[CATEGORY: Spec Gap]
File: src/features/tours/presentation/stores/tours-store.ts (lines 85-134)
Spec: openspec/specs/tours/spec.md (Requirement "Tours store supports update" — "Store update surfaces errors")
Issue: `updateTour` does not re-throw repository errors; if `repository.updateTour` throws, the function aborts but the error is not propagated to callers (no try/catch, but also no error-state assignment, and the local mutation is skipped silently).
Why it matters: Callers cannot display the error inline as the spec requires; UI will see a successful return with stale state.
Suggestion: Wrap repository call in try/catch, set `error.value`, and re-throw so the caller (tour info sheet) can render an inline error per the "Update error displayed inline" scenario.

[SEVERITY: Low]
[CATEGORY: Spec Gap]
File: src/features/tours/presentation/stores/tours-store.ts (lines 155-167)
Spec: openspec/specs/tours/spec.md (Requirement "Tours store supports delete" — "Store delete surfaces errors")
Issue: `deleteTour` does not catch/re-throw; current pass-through works but does not set `error.value`, while spec mandates the store re-throws with the local array unchanged. The unchanged-array invariant holds, but error visibility on store state does not.
Why it matters: Components that observe `error` ref for inline messages will not see delete failures.
Suggestion: Mirror `setCompleted`'s rollback pattern — set `error.value` on failure and re-throw.

### Security

[SEVERITY: Low]
[CATEGORY: Security]
File: src/core/utils/supabase.ts
Spec: n/a
Issue: Single shared Supabase client instantiated at module load with no auth-state observability boundary; fine, but `auth.persistSession`, `autoRefreshToken`, and `detectSessionInUrl` are left at default (true/true/true) implicitly relied upon by auth/spec.md "Magic link callback page".
Why it matters: Defaults work today, but if a future Supabase JS bump changes defaults, the PKCE callback flow silently breaks.
Suggestion: Pass `auth: { detectSessionInUrl: true, autoRefreshToken: true, persistSession: true, flowType: 'pkce' }` explicitly to `createClient` to lock the contract.

[SEVERITY: Low]
[CATEGORY: Security]
File: src/app/router/index.ts (lines 62-85)
Spec: openspec/specs/auth/spec.md (Requirement "Auth gate redirects based on session state")
Issue: Guard reads `authStore.isAuthenticated` synchronously without consulting `authStore.isLoading`; during the bootstrap window before `onAuthStateChange` fires, an authenticated reload of `/map` may briefly redirect to `/` before being bounced back.
Why it matters: Causes a navigation flash and potential loss of in-flight query params; the auth spec's `isLoading` ref exists for this reason.
Suggestion: In `beforeEach`, return a promise that awaits `until(!authStore.isLoading)` (or skip redirect while loading), so initial nav waits for resolved state.

### State Management

[SEVERITY: Medium]
[CATEGORY: State]
File: src/features/tours/presentation/stores/tours-store.ts (lines 68-83)
Spec: openspec/specs/tours/spec.md (Requirement "Tours store" — create flow)
Issue: `createTourFromDraft` calls `loadTours()` after a successful insert (full refetch) instead of optimistic local insert.
Why it matters: Wastes a round-trip on every tour creation and creates a UI gap where the store briefly has no entry for the new id between `createTourWithPartners` and `loadTours` resolving.
Suggestion: Insert the new tour locally from the draft + assigned id, then optionally reconcile in the background — or accept the refetch but document it.

[SEVERITY: Low]
[CATEGORY: State]
File: src/features/tours/presentation/stores/tours-store.ts (lines 71-79)
Spec: openspec/specs/gpx-tracks/spec.md (Requirement "GPX file storage" — pre-upload model)
Issue: GPX is uploaded again inside `createTourFromDraft` even when `preUploadedTourId` is provided (the pre-upload path) — `uploadGpx` is called unconditionally when `gpxFile` is non-null.
Why it matters: Spec scenario "Pre-upload completes before submit" says submit should NOT re-upload. Code re-uploads, doubling Storage writes.
Suggestion: Guard `uploadGpx` with `if (gpxFile && !preUploadedTourId)`; if already pre-uploaded, only call `patchGpxFilepath` (or skip if RPC already received `p_gpx_filepath`).

### PWA

[SEVERITY: Medium]
[CATEGORY: PWA]
File: vite.config.ts (lines 24-46)
Spec: openspec/specs/pwa-support/spec.md (Requirement "PWA configured with vite-plugin-pwa")
Issue: Manifest lacks `lang`, `scope`, `id`, and a maskable-purpose icon variant.
Why it matters: Without `id`, browsers may treat manifest changes as a different app on update; without a maskable icon, the home-screen icon is letterboxed on Android adaptive launchers.
Suggestion: Add `id: '/'`, `lang: 'en'` (or detected), `scope: '/'`, and a `purpose: 'maskable'` icon entry.

[SEVERITY: Low]
[CATEGORY: PWA]
File: vite.config.ts (line 49)
Spec: n/a
Issue: `maximumFileSizeToCacheInBytes: 3MB` will silently skip precaching any single bundled asset >3 MB (e.g., MapLibre GL JS chunk).
Why it matters: Offline first-launch may fail for skipped assets without warning.
Suggestion: Audit built bundle sizes; raise the limit or split chunks so all precached assets stay under it.

[SEVERITY: Low]
[CATEGORY: PWA]
File: vite.config.ts (lines 81-91)
Spec: openspec/specs/gpx-tracks/spec.md (Requirement "Lazy fetch and caching of GPX data")
Issue: GPX runtime cache regex `/\/storage\/v1\/object\/(?:sign\/)?tour-gpx\//i` matches the signed-URL path, but signed URLs include a query-string `token=...` that StaleWhileRevalidate keys by full URL — every new signed URL will miss cache.
Why it matters: The 30-day cache rarely hits because the URL identity rotates each `getSignedUrl` call.
Suggestion: Use a Workbox `cacheKeyWillBeUsed` plugin to strip the token query param, or download GPX via the bucket's public path with an explicit auth header instead of signed URL rotation.

### Vue Best Practices

[SEVERITY: Low]
[CATEGORY: Vue]
File: src/features/tours/presentation/stores/tours-store.ts (lines 110-133)
Spec: n/a
Issue: Local update creates a new tour object via spread+overwrite for every field rather than diffing — fine, but reads as mutation logic mirroring repository payload, which will rot whenever the schema gains a field.
Why it matters: Each new field requires a code change in three places (schema, repository, store). Easy to forget one.
Suggestion: Drive the local update from a single source — either refetch the row after RPC (consistent with create flow) or build the patch from `{ ...existing, ...draft, goal }` once.

## Priority Action List

1. [High / Spec Gap] Reconcile `tours` spec with `gpx-tracks` spec — update or archive `p_gpx_track` / `gpxTrack` references in `openspec/specs/tours/spec.md`.
2. [High / Spec Gap] Wire `useToursStore` to auth state for auto-load on sign-in and auto-clear on sign-out (currently unimplemented).
3. [Medium / Spec Gap] `updateTour` action must catch, set `error.value`, and re-throw so the info sheet can show inline errors.
4. [Medium / State] Stop re-uploading GPX in `createTourFromDraft` when a `preUploadedTourId` is supplied.
5. [Medium / Architecture] Inject `ToursRepository` interface into the store instead of instantiating `ToursRepositoryImpl` at module scope.

---
