# TourenBuddy

A tour-planning app for outdoor enthusiasts.
Pin tour objectives on the Swiss topo map, remember the friends you want to do them with, set dates, and finally complete your adventures.

This repository holds the iOS, Android and web clients, built with React Native and Expo.
They replace the Vue PWA in [`sekael/tourenbuddy_frontend_vue`](https://github.com/sekael/tourenbuddy_frontend_vue).

## Status

Phase 1 (repo, CI and app foundation, [#368](https://github.com/sekael/tourenbuddy_frontend_vue/issues/368)) is starting; there is no runnable app on `main` yet.
`main` grows one reviewed change at a time: each pull request implements an approved OpenSpec change.
The migration plan, its decisions and phases are in [#346](https://github.com/sekael/tourenbuddy_frontend_vue/issues/346).

## Platforms

- **iOS 26** or later, with Liquid Glass and no fallback look
- **Android 7** or later, with Material 3 Expressive
- **Web** in the browser: online only, with a side-panel layout on desktop (≥ 1024 px)

## Branches and related repositories

- `main`: the app.
- `spike/route-gate`: Phase 0 feasibility spikes ([#367](https://github.com/sekael/tourenbuddy_frontend_vue/issues/367)). Throwaway code, never merged.
- The backend (Supabase schema and migrations, the `email-hook` Cloudflare Worker, ski-route data) stays in `sekael/tourenbuddy_frontend_vue` during the migration.

## Disclaimer

Most of the code in this repository is generated with Claude Code using specification-driven development with OpenSpec.
The agent configuration is in [AGENTS.md](./AGENTS.md).
