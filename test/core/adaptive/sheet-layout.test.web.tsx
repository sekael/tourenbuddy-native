import { act, fireEvent, render, screen } from '@testing-library/react';
import { useIsFocused } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/core/i18n';
import { Page } from '@/core/adaptive/screen';
import { mapSheetOptions, sheetLayout, sheetOptions } from '@/core/adaptive/sheet.web';

jest.mock('expo-router', () => ({ useIsFocused: jest.fn(() => true) }));

function Route({ options, onClose }: { options: typeof sheetOptions; onClose: () => void }) {
  return (
    <div data-testid="route">
      <div>
        {sheetLayout({
          options,
          children: (
            <Page title="Tours" onClose={onClose}>
              {null}
            </Page>
          ),
        })}
      </div>
    </div>
  );
}

const metrics = {
  frame: { x: 0, y: 0, width: 1280, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const tree = (options: typeof sheetOptions, onClose: () => void) => (
  <SafeAreaProvider initialMetrics={metrics}>
    <div>
      <div data-testid="map" />
      <Route options={options} onClose={onClose} />
    </div>
  </SafeAreaProvider>
);
const renderRoute = (options = mapSheetOptions, onClose = jest.fn()) =>
  render(tree(options, onClose));

describe('sheetLayout', () => {
  it('should let clicks beside a map sheet through to the map, up to its route only', () => {
    renderRoute();
    const panel = screen.getByRole('heading', { name: 'Tours' }).closest('[tabindex="-1"]')!;
    expect(document.activeElement).toBe(panel);
    expect(screen.getByTestId('route').style.pointerEvents).toBe('none');
    expect(screen.getByTestId('map').parentElement!.style.pointerEvents).toBe('');
  });

  it('should leave an overlay sheet as it is', () => {
    renderRoute(sheetOptions);
    expect(screen.getByTestId('route').style.pointerEvents).toBe('');
  });

  it('should close the page on Escape only while its route is on top', () => {
    const onClose = jest.fn();
    jest.mocked(useIsFocused).mockReturnValue(false);
    const view = renderRoute(mapSheetOptions, onClose);
    act(() => void fireEvent.keyDown(window, { key: 'Escape' }));
    expect(onClose).not.toHaveBeenCalled();

    jest.mocked(useIsFocused).mockReturnValue(true);
    view.unmount();
    renderRoute(mapSheetOptions, onClose);
    act(() => void fireEvent.keyDown(window, { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
