import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/core/i18n';
import { PageBanner } from '@/core/adaptive/page-banner';
import { Page, Screen } from '@/core/adaptive/screen';
import { OfflineBanner } from '@/features/shell/presentation/offline-status';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe('OfflineBanner', () => {
  it('should lead every page, above its own header, and open what it points at', async () => {
    const review = () => router.push('/sync-issues');
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <PageBanner.Provider
          value={
            <OfflineBanner
              status={{ label: "1 change couldn't sync", icon: 'sync_problem', onPress: review }}
            />
          }
        >
          <Screen>
            <Page title="Contacts" header={<></>}>
              {null}
            </Page>
          </Screen>
        </PageBanner.Provider>
      </SafeAreaProvider>,
    );

    await fireEvent.press(screen.getByText("1 change couldn't sync"));
    expect(router.push).toHaveBeenCalledWith('/sync-issues');
  });
});
