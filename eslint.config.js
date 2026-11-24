// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  // The map's and the PDF viewer's workers, copied minified into public/ by postinstall. The
  // backend (database, Worker, ski-route job) keeps its own runners and the Vue repository's style.
  globalIgnores([
    'dist/*',
    'ios/*',
    'android/*',
    '.expo/*',
    'expo-env.d.ts',
    'public/*.mjs',
    'services/*',
    'supabase/*',
    'scripts/ski-routes/*',
  ]),
  expoConfig,
  prettierRecommended,
  {
    rules: { 'no-console': 'error' },
  },
  {
    files: ['src/core/logging/logger.ts', 'scripts/**'],
    rules: { 'no-console': 'off' },
  },
  {
    // The web app ported line by line from the Vue PWA (port-pwa-web D1–D3): its components keep
    // Vue's synchronous refs and watchers (`useReactive`, refs read in render, state set from
    // watchers) and opt out of the React Compiler with `'use no memo'` where they do. These rules
    // guard the compiler's assumptions, which those components don't make. A Vue `watch` runs on
    // exactly the sources it names, so effect dependencies list those, not every value read.
    files: ['src/core/web/**', 'src/features/*/presentation/web/**', 'src/routes/**/*.web.tsx'],
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/set-state-in-render': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
]);
