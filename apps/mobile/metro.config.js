// Expo's defaults already handle the pnpm monorepo (SDK 52+); only SVG is added as an asset so
// the shared logo can be shown with expo-image.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('svg');

module.exports = config;
