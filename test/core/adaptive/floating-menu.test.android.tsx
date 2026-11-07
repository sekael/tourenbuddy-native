import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Animated, BackHandler, DeviceEventEmitter } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FloatingMenu } from '@/core/adaptive/floating-menu';

// The menu folds away when its screen loses focus; these tests render it without a navigator.
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const settle = () => act(() => jest.runAllTimers());
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderMenu() {
  const onInbox = jest.fn();
  const onProfile = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <FloatingMenu
        label="Menu"
        closeLabel="Close menu"
        items={[
          { id: 'inbox', label: 'Inbox', icon: 'inbox', onPress: onInbox },
          { id: 'profile', label: 'Profile', icon: 'profile', onPress: onProfile },
        ]}
      />
    </SafeAreaProvider>,
  );
  return { onInbox, onProfile };
}

type Done = (result: { finished: boolean }) => void;

/** Jest finishes animations at once; this holds them so a test can end them, finished or not. */
function holdAnimations() {
  const pending: Done[] = [];
  jest.spyOn(Animated, 'timing').mockImplementation(
    () =>
      ({
        start: (done?: Done) => done && pending.push(done),
        stop: () => {},
        reset: () => {},
      }) as unknown as Animated.CompositeAnimation,
  );
  return pending;
}

const items = () => screen.queryAllByRole('button', { name: /^(Inbox|Profile)$/ });

async function open() {
  await fireEvent.press(screen.getByRole('button', { name: 'Menu' }));
  await settle();
}

describe('FloatingMenu (Material)', () => {
  it('should show no items until the button opens it', async () => {
    await renderMenu();

    expect(items()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Menu' })).toBeCollapsed();

    await open();

    expect(items()).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Close menu' })).toBeExpanded();
  });

  it('should run the chosen item once and fold away', async () => {
    const { onInbox, onProfile } = await renderMenu();
    await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Profile' }));
    await settle();

    expect(onProfile).toHaveBeenCalledTimes(1);
    expect(onInbox).not.toHaveBeenCalled();
    expect(items()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Menu' })).toBeCollapsed();
  });

  it('should reopen when tapped again while still folding away', async () => {
    const pending = holdAnimations();
    await renderMenu();
    await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Close menu' }));
    // Mid-fold, the button already offers to open again.
    await fireEvent.press(screen.getByRole('button', { name: 'Menu' }));
    // Opening interrupts the fold, which then ends unfinished.
    await act(() => pending.forEach((done) => done({ finished: false })));

    expect(items()).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Close menu' })).toBeExpanded();
  });

  it('should take the items away once the fold finishes', async () => {
    const pending = holdAnimations();
    await renderMenu();
    await open();

    await fireEvent.press(screen.getByRole('button', { name: 'Close menu' }));
    expect(items()).toHaveLength(2); // still gliding out

    await act(() => pending.forEach((done) => done({ finished: true })));
    expect(items()).toHaveLength(0);
  });

  it('should fold away on Back and consume it, without running an item', async () => {
    const { onInbox, onProfile } = await renderMenu();
    await open();

    await act(() => DeviceEventEmitter.emit('hardwareBackPress'));
    await settle();

    expect(items()).toHaveLength(0);
    expect(onInbox).not.toHaveBeenCalled();
    expect(onProfile).not.toHaveBeenCalled();
  });

  it('should leave Back to the app while closed', async () => {
    await renderMenu();
    const fallback = jest.fn(() => true);
    const sub = BackHandler.addEventListener('hardwareBackPress', fallback);

    await act(() => DeviceEventEmitter.emit('hardwareBackPress'));

    expect(fallback).toHaveBeenCalledTimes(1);
    sub.remove();
  });
});
