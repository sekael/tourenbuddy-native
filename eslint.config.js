// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  globalIgnores(['dist/*', 'ios/*', 'android/*', '.expo/*', 'expo-env.d.ts']),
  expoConfig,
  prettierRecommended,
  {
    rules: { 'no-console': 'error' },
  },
  {
    files: ['src/core/logging/logger.ts', 'scripts/**'],
    rules: { 'no-console': 'off' },
  },
]);
