// Learn more: https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Review runs write screenshots, recordings and logs into .review/ and .review-kit/ while the app
// runs; watched, every write pushes a refresh that swallows the gesture being recorded.
config.resolver.blockList = [
  ...[config.resolver.blockList].flat().filter(Boolean),
  /(^|[/\\])\.review(-kit)?[/\\]/,
  // The backend is no app code; `wrangler dev` and the Supabase CLI write their state into it.
  // Anchored at the project root (absolute or project-relative paths), never inside node_modules.
  new RegExp(
    `^(${__dirname.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}[/\\\\])?(services|supabase)[/\\\\]`,
  ),
];

module.exports = config;
