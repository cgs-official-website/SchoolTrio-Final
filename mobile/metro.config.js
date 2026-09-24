const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { FileStore } = require('metro-cache');
const path = require('path');
const fs = require('fs');

const rootDir = fs.realpathSync(__dirname);
const cacheDir = path.join(rootDir, '.metro-cache');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  projectRoot: rootDir,
  watchFolders: [rootDir, path.resolve(__dirname)],
  maxWorkers: 1,
  cacheStores: [
    new FileStore({
      root: cacheDir,
    }),
  ],
};

module.exports = mergeConfig(getDefaultConfig(rootDir), config);

