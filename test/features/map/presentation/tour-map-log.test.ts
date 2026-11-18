import { connectivity } from '@/core/offline/online';
import { onMapLog } from '@/features/map/presentation/tour-map';

// MapLibre's log as the owner's offline session wrote it: none of it may reach `console.error`,
// which opens the red overlay in development.
const OS_TAG =
  'virtual bool mln::MLNCoreLoggingObserver::onRecord(EventSeverity, Event, int64_t, const std::string &)';
const NETWORK_TAG = '-[MLNNetworkConfiguration errorLog:]';
const OFFLINE = 'Es besteht anscheinend keine Verbindung zum Internet.';

describe('onMapLog', () => {
  const debug = jest.spyOn(console, 'debug').mockImplementation(() => {});
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => jest.clearAllMocks());
  afterAll(() => connectivity.setState({ online: true }));

  it.each([
    [
      OS_TAG,
      `[event]:Style [code]:-1 [message]:Failed to load glyph range 0-255 for font stack Frutiger Neue Regular: ${OFFLINE}`,
    ],
    [
      OS_TAG,
      `[event]:Style [code]:-1 [message]:Failed to load tile 12/2133/1444=>12 for source base: ${OFFLINE}`,
    ],
    [OS_TAG, `[event]:Style [code]:-1 [message]:Failed to load sprite: ${OFFLINE}`],
    [OS_TAG, `[event]:Style [code]:-1 [message]:Failed to load source relief_v1.0.0: ${OFFLINE}`],
    [
      NETWORK_TAG,
      `Requesting: https://vectortiles.geo.admin.ch/fonts/x/0-255.pbf failed with error: ${OFFLINE}`,
    ],
    [NETWORK_TAG, ''],
  ])('should keep a failed request offline to a debug line (%#)', (tag, message) => {
    connectivity.setState({ online: false });

    expect(onMapLog({ tag, message })).toBe(true);
    expect(debug).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('should warn of a failed request online, swallow the overlays outside Switzerland, pass the rest', () => {
    connectivity.setState({ online: true });

    expect(
      onMapLog({
        tag: OS_TAG,
        message: '[event]:Style [code]:-1 [message]:Failed to load tile 7/66/45',
      }),
    ).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(onMapLog({ tag: OS_TAG, message: 'source overlay-hiking: HTTP status code 400' })).toBe(
      true,
    );
    expect(onMapLog({ tag: OS_TAG, message: 'Style parse error' })).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
