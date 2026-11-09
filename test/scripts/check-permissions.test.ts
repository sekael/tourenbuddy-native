import { review } from '../../scripts/check-permissions';

// `aapt2 dump permissions` of a release APK.
const dump = (...names: string[]) =>
  [
    'package: ch.tourenbuddy.app',
    ...names.map((name) => `uses-permission: name='${name}'`),
    "permission: name='ch.tourenbuddy.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'",
  ].join('\n');

describe('permission review', () => {
  it('should pass when Android declares exactly the reviewed permissions', () => {
    const output = dump('android.permission.INTERNET', 'android.permission.VIBRATE');

    expect(
      review('android', output, ['android.permission.VIBRATE', 'android.permission.INTERNET']),
    ).toEqual({ added: [], missing: [] });
  });

  it('should name a permission a library added on Android, including max-SDK and SDK 23 ones', () => {
    const output = [
      dump('android.permission.INTERNET'),
      "uses-permission: name='android.permission.ACCESS_FINE_LOCATION' maxSdkVersion='32'",
      "uses-permission-sdk-23: name='android.permission.CAMERA'",
    ].join('\n');

    expect(review('android', output, ['android.permission.INTERNET'])).toEqual({
      added: ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.CAMERA'],
      missing: [],
    });
  });

  it('should name a reviewed Android permission the build no longer declares', () => {
    expect(
      review('android', dump('android.permission.INTERNET'), [
        'android.permission.INTERNET',
        'android.permission.VIBRATE',
      ]),
    ).toEqual({ added: [], missing: ['android.permission.VIBRATE'] });
  });

  it('should pass when iOS declares no usage descriptions and none are reviewed', () => {
    const plist = { CFBundleName: 'TourenBuddy', NSAppTransportSecurity: {} };

    expect(review('ios', JSON.stringify(plist), [])).toEqual({ added: [], missing: [] });
  });

  it('should name an added iOS usage description and background mode', () => {
    const plist = {
      NSLocationWhenInUseUsageDescription: 'Shows where you are on the map.',
      UIBackgroundModes: ['remote-notification'],
    };

    expect(review('ios', JSON.stringify(plist), [])).toEqual({
      added: ['NSLocationWhenInUseUsageDescription', 'UIBackgroundModes: remote-notification'],
      missing: [],
    });
  });

  it('should name a reviewed iOS entry the build no longer declares', () => {
    const plist = { NSLocationWhenInUseUsageDescription: 'Shows where you are on the map.' };

    expect(
      review('ios', JSON.stringify(plist), [
        'NSCameraUsageDescription',
        'NSLocationWhenInUseUsageDescription',
      ]),
    ).toEqual({ added: [], missing: ['NSCameraUsageDescription'] });
  });
});
