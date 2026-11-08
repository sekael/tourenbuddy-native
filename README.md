# TourenBuddy

A tour-planning app for outdoor enthusiasts.
Pin tour objectives on the Swiss topo map, remember the friends you want to do them with, set dates, and finally complete your adventures.

This repository holds the iOS, Android and web clients, built with React Native and Expo.
They replace the Vue PWA in [`sekael/tourenbuddy_frontend_vue`](https://github.com/sekael/tourenbuddy_frontend_vue).

## Status

Phase 1 (repo, CI and app foundation, [#368](https://github.com/sekael/tourenbuddy_frontend_vue/issues/368)) is in progress: `main` signs in with an email code and shows the empty shell.
`main` grows one reviewed change at a time: each pull request implements an approved OpenSpec change.
The migration plan, its decisions and phases are in [#346](https://github.com/sekael/tourenbuddy_frontend_vue/issues/346).

## Development

You need Node 24 (see `.nvmrc`), Xcode for iOS and Android Studio for Android.
The app uses native modules, so it runs in a development build, not in Expo Go.

```sh
npm install
npm run ios        # build and run the dev app on a simulator or device (generates ios/)
npm run android    # same for Android (generates android/)
npm run web        # dev server in the browser
npm start          # dev server for an installed dev build
npm run check      # lint, type check and tests; CI also runs a web export
```

Builds default to the `dev` variant ("TourenBuddy Dev", `ch.tourenbuddy.app.dev`), which installs next to the store app.
`APP_VARIANT=prod` selects the store identity ("TourenBuddy", `ch.tourenbuddy.app`).
The variant changes the bundle identifier, so regenerate the native projects when you switch: `npx expo prebuild --clean`.
`ios/` and `android/` are generated from `app.config.ts` and never committed; change native settings there or in a config plugin.
Releases, store builds and web previews run on GitHub Actions and EAS: see [docs/publishing.md](./docs/publishing.md).

## Backend

The app talks to Supabase. Schema, migrations and the local stack live in the Vue repository.
Set two variables in `.env.local` (gitignored); the app refuses to start without them:

```sh
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

- **Local stack:** `supabase start` in `tourenbuddy_frontend_vue`; `supabase status` prints the anon key.
  Sign-in codes land in Mailpit at `http://127.0.0.1:54324`.
  The URL depends on where the app runs: iOS Simulator and web `http://127.0.0.1:54321`, Android emulator `http://10.0.2.2:54321`, a phone your Mac's address on the same Wi-Fi (`http://192.168.x.y:54321`).
- **Hosted project:** the project URL and anon key from the Supabase dashboard (Project Settings → API).

`EXPO_PUBLIC_*` values are compiled into the app, so restart the dev server with `npm start -- --clear` after changing them.
Releases get them from EAS environment variables and GitHub secrets: see [docs/publishing.md](./docs/publishing.md).

## Platforms (target)

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
