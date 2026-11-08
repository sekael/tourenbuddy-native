const { getAndroidPreset, getIOSPreset, getWebPreset } = require('jest-expo/config');

const scripts = '\\.[jt]sx?$';

const withApp = (preset, moduleNameMapper = {}) => {
  const [babelJest, babelOptions] = preset.transform[scripts];
  const project = {
    ...preset,
    roots: ['<rootDir>/test'],
    // With the React Compiler, as Metro builds the app (`experiments.reactCompiler`), so the tests
    // run the code the app runs: the compiler's memoization can change what re-renders.
    transform: {
      ...preset.transform,
      [scripts]: [
        babelJest,
        { ...babelOptions, caller: { ...babelOptions.caller, supportsReactCompiler: true } },
      ],
    },
    moduleNameMapper: {
      ...preset.moduleNameMapper,
      ...moduleNameMapper,
      '^@/(.*)$': '<rootDir>/src/$1',
    },
    setupFiles: [...(preset.setupFiles ?? []), '<rootDir>/test/setup.ts'],
  };
  // Root-only options that jest-expo's presets carry; Jest rejects them inside a project.
  delete project.passWithNoTests;
  delete project.watchPlugins;
  return project;
};

// Tests run as iOS by default. A platform suffix picks another runtime:
// - `*.test.android.tsx`: the Material components (`*.tsx`, shared with web), with React Native
//   Testing Library.
// - `*.test.web.tsx`: web-only behavior (`*.web.tsx`, keyboard), with the DOM Testing Library,
//   because react-native-web renders DOM elements that React Native Testing Library cannot query.
module.exports = {
  projects: [
    withApp(getIOSPreset()),
    { ...withApp(getAndroidPreset()), testMatch: ['**/*.test.android.tsx'] },
    {
      ...withApp(getWebPreset(), {
        // Expo's web bundler resolves this the same way (react-native-svg still imports it).
        '^@react-native/assets-registry/registry$': 'react-native-web/asset-registry',
      }),
      // First: the preset's setup already loads react-native-web, which reads `matchMedia` once.
      setupFiles: [
        '<rootDir>/test/jsdom-setup.ts',
        ...(getWebPreset().setupFiles ?? []),
        '<rootDir>/test/setup.ts',
      ],
      testMatch: ['**/*.test.web.tsx'],
    },
  ],
};
