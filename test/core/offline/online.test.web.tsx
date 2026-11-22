import { connectivity } from '@/core/offline/online';

const setOnLine = (value: boolean) =>
  jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(value);

describe('connectivity on the web', () => {
  it("should follow the window's offline and online events", () => {
    setOnLine(false);
    window.dispatchEvent(new Event('offline'));
    expect(connectivity.getState().online).toBe(false);

    setOnLine(true);
    window.dispatchEvent(new Event('online'));
    expect(connectivity.getState().online).toBe(true);
  });
});
