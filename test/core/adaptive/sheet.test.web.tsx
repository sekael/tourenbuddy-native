import { act, fireEvent, render, screen } from '@testing-library/react';
import { router } from 'expo-router';
import { Text } from 'react-native';

import '@/core/i18n';
import { Sheet } from '@/core/adaptive/sheet';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}));

const mockRouter = jest.mocked(router);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRouter.canGoBack.mockReturnValue(true);
});
afterEach(() => jest.useRealTimers());

const settle = () => act(() => jest.runAllTimers());
const pressEscape = () => act(() => fireEvent.keyDown(window, { key: 'Escape' }));

async function renderSheet() {
  const view = render(
    <Sheet title="Profile">
      <Text>Body</Text>
    </Sheet>,
  );
  await settle();
  return view;
}

describe('Sheet (web)', () => {
  it('should be a modal dialog named by its title, with focus inside', async () => {
    await renderSheet();

    const dialog = screen.getByRole('dialog', { name: 'Profile' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(screen.getByText('Body')).toBeTruthy();
  });

  // react-native-web finishes animations at once under test, so these check where a close lands,
  // not the glide itself.
  it('should go back when the close button is pressed', async () => {
    await renderSheet();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await settle();

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('should go back once when Escape, the backdrop and the button race', async () => {
    const { container } = await renderSheet();

    await pressEscape();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(container.querySelector('[aria-label="Close"][tabindex="-1"]')!);
    await pressEscape();
    await settle();

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('should land on the map when opened from a link with nothing to go back to', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    await renderSheet();

    await pressEscape();
    await settle();

    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('should stop listening for Escape once it is gone', async () => {
    const { unmount } = await renderSheet();
    unmount();

    await pressEscape();
    await settle();

    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});
