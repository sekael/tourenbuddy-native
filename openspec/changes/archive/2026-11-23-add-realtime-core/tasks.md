# Tasks

## 1. Primitive

- [x] 1.1 `src/core/realtime/subscribe.ts`: `subscribeRealtime` for Postgres bindings and private broadcast, registry with listener sets, per-listener 150 ms debounce, `onSubscribed` on every `SUBSCRIBED` and at once for late joiners, idempotent end function, warn on channel errors
- [x] 1.2 `AppState` pause on `background`, resume on `active` after `realtime.setAuth()`, `inactive` ignored; a topic reopens only after its old channel is removed
- [x] 1.3 Refetch on unverified → verified (`sessionTrust`)

## 2. Tests

- [x] 2.1 `test/core/realtime/subscribe.test.ts` with a fake channel: sharing and fan-out, last-leaves removal, double end, debounce burst and cancel, rejoin refetch, late joiner, background close and resume after the token, `inactive` ignored, reopening while the old channel still closes, verified-session refetch, private broadcast config, filter passed through
- [x] 2.2 Token handler check: a real supabase-js client forwards `TOKEN_REFRESHED` to `realtime.setAuth` with the new token

## 3. Docs and checks

- [x] 3.1 `AGENTS.md`: Realtime only through `subscribeRealtime`, UI sync only, unsubscribe in the store's `clear()`
- [x] 3.2 `npm run check`, `openspec validate add-realtime-core --strict`
