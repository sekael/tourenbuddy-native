import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import '@/core/i18n';
import { UpdatePrompt } from '@/core/web/update-prompt.web';
import { usePwaUpdateStore } from '@/core/web/use-pwa-update.web';

type Listener = () => void;

/** The page's Workbox: the test fires its events. */
class MockWorkbox {
  static last: MockWorkbox;
  listeners: Record<string, Listener[]> = {};
  messageSkipWaiting = jest.fn();
  register = jest.fn(async () => ({ update: jest.fn(async () => {}) }));
  constructor() {
    MockWorkbox.last = this;
  }
  addEventListener(type: string, listener: Listener) {
    (this.listeners[type] ??= []).push(listener);
  }
  fire(type: string) {
    this.listeners[type]?.forEach((listener) => listener());
  }
}
// Lazy: the top-level imports load the module before the class is defined.
jest.mock('workbox-window', () => ({ Workbox: jest.fn(() => new MockWorkbox()) }));

const container = new EventTarget();

/** A fresh app start: the module registers once per load. */
function start(controlled: boolean) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: Object.assign(container, { controller: controlled ? {} : null }),
  });
  type Module = typeof import('@/core/web/use-pwa-update.web');
  let mod!: Module;
  jest.isolateModules(() => {
    mod = jest.requireActual<Module>('@/core/web/use-pwa-update.web');
  });
  const reload = jest.spyOn(mod.page, 'reload').mockImplementation(() => {});
  mod.registerServiceWorker();
  return { ...mod, reload, wb: MockWorkbox.last };
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(globalThis, { __DEV__: false });
});
afterAll(() => {
  Object.assign(globalThis, { __DEV__: true });
});

describe('service worker updates', () => {
  it("should not reload when the first install claims the page (the user's input stays)", () => {
    const { reload } = start(false);

    act(() => void container.dispatchEvent(new Event('controllerchange')));

    expect(reload).not.toHaveBeenCalled();
  });

  it('should reload once when applied, though both controlling and controllerchange fire', () => {
    const { wb, reload, usePwaUpdateStore: store } = start(true);
    act(() => wb.fire('waiting'));

    act(() => store.getState().apply());
    expect(wb.messageSkipWaiting).toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    act(() => {
      wb.fire('controlling');
      container.dispatchEvent(new Event('controllerchange'));
    });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('should hide the banner on "later" but keep the update for the profile notice', async () => {
    render(<UpdatePrompt />);
    act(() => usePwaUpdateStore.setState({ updateAvailable: true }));
    expect(await screen.findByRole('status')).toBeTruthy();

    fireEvent.click(screen.getByText('Later'));

    // The banner glides out (a timed leave transition), then is gone.
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(usePwaUpdateStore.getState().updateAvailable).toBe(true);
  });

  it('should never register in development (the worker would cache the dev bundles)', () => {
    Object.assign(globalThis, { __DEV__: true });
    MockWorkbox.last = undefined as unknown as MockWorkbox;

    start(true);

    expect(MockWorkbox.last).toBeUndefined();
  });
});
