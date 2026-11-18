// Learn more: https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Review runs write screenshots, recordings and logs into .review/ and .review-kit/ while the app
// runs; watched, every write pushes a refresh that swallows the gesture being recorded.
config.resolver.blockList = [
  ...[config.resolver.blockList].flat().filter(Boolean),
  /(^|[/\\])\.review(-kit)?[/\\]/,
];

module.exports = config;
