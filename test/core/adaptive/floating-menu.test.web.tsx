import { act, fireEvent, render, screen } from '@testing-library/react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FloatingMenu } from '@/core/adaptive/floating-menu';

// The menu folds away when its screen loses focus; these tests render it without a navigator.
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const settle = () => act(() => jest.runAllTimers());
const pressEscape = () => act(() => fireEvent.keyDown(window, { key: 'Escape' }));

function renderMenu() {
  const onInbox = jest.fn();
  render(
    <SafeAreaProvider>
      <FloatingMenu
        label="Menu"
        closeLabel="Close menu"
        items={[{ id: 'inbox', label: 'Inbox', icon: 'inbox', onPress: onInbox }]}
      />
    </SafeAreaProvider>,
  );
  return { onInbox };
}

describe('FloatingMenu (web)', () => {
  it('should close on Escape without running an item', async () => {
    const { onInbox } = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await settle();
    expect(screen.getByRole('group', { name: 'Menu' })).toBeTruthy();

    await pressEscape();
    await settle();

    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(onInbox).not.toHaveBeenCalled();
  });

  it('should move keyboard focus from the button into the items', async () => {
    renderMenu();
    const button = screen.getByRole('button', { name: 'Menu' });
    fireEvent.click(button);
    await settle();

    // DOM order is what Tab follows: the items must come after the button.
    const item = screen.getByRole('button', { name: 'Inbox' });
    expect(button.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
