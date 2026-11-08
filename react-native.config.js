// Passkeys (Face ID sign-in) are iOS only: keep react-native-passkey's Android library, and the
// Credential Manager it brings, out of the Android app.
module.exports = {
  dependencies: {
    'react-native-passkey': { platforms: { android: null } },
  },
};
