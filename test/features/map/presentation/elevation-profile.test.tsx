import { fireEvent, render, screen } from '@testing-library/react-native';
import { processColor } from 'react-native';

import '@/core/i18n';
import { ElevationProfile } from '@/features/map/presentation/elevation-profile';

const line: [number, number][] = [
  [9.8, 46.7],
  [9.81, 46.7],
  [9.82, 46.7],
];

async function draw(heights: (number | null)[], onScrub?: jest.Mock) {
  await render(
    <ElevationProfile
      line={line}
      heights={heights}
      bands={[{ from: 0, to: 1, color: '#90132E' }]}
      onScrub={onScrub}
    />,
  );
  const box = screen.container.queryAll((n) => typeof n.props.onLayout === 'function')[0]!;
  await fireEvent(box, 'layout', { nativeEvent: { layout: { width: 320, height: 72 } } });
  return box;
}

// react-native-svg renders each label as a span carrying its `content`.
const texts = () =>
  screen.container
    .queryAll((n) => typeof n.props.content === 'string')
    .map((n) => (n.props.content as string).replace(/\s/g, ' '));

describe('ElevationProfile', () => {
  it('should draw nothing until two points have a height', async () => {
    await draw([1500, null, null]);
    expect(texts()).not.toContain('0');
  });

  it('should skip points without a height and label the highest and lowest of the rest', async () => {
    await draw([1500, null, 1720]);
    expect(texts()).toEqual(expect.arrayContaining(['1720 m', '1500 m', '0']));
  });

  it('should draw the line and its ends in the route’s colours, not a fixed red', async () => {
    await draw([1500, 1600, 1720]);
    // react-native-svg hands colours on as ARGB numbers, a gradient as a reference to it.
    const brushes = screen.container
      .queryAll((n) => n.type === 'RNSVGPath' || n.type === 'RNSVGCircle')
      .flatMap((n) => [n.props.fill, n.props.stroke])
      .filter(Boolean);
    const solid = brushes.map((b) => b.payload).filter((p) => p !== undefined);
    expect(solid).toEqual([processColor('#90132E'), processColor('#90132E')]);
    expect(brushes.filter((b) => b.brushRef)).toHaveLength(2);
  });

  // iOS: a sideways scroll view over the chart holds the drag, so the page's swipe back can't.
  // Its content starts 100 000 pt in: the finger's x is where it touched the content, less the
  // offset since.
  const MIDDLE = 100_000;
  // Hidden from VoiceOver with the profile: the numbers above say the same.
  const surface = () => screen.getByTestId('profile-scrub', { includeHiddenElements: true });

  it('should show the height and distance under a finger and name the spot until it lifts', async () => {
    const onScrub = jest.fn();
    await draw([1500, 1600, 1720], onScrub);
    expect(surface().props.horizontal).toBe(true);
    // The chart runs from x 44 to 316: halfway is the middle point.
    await fireEvent(surface(), 'touchStart', { nativeEvent: { locationX: MIDDLE + 180 } });
    const spot = onScrub.mock.lastCall[0];
    expect(spot.point[0]).toBeCloseTo(9.81, 3);
    expect(spot.height).toBeCloseTo(1600, -1);
    expect(texts().some((x) => /^1\d{3} m · 0\.8 km$/.test(x))).toBe(true);

    // The finger moves 136 pt right: the content scrolls back as far.
    await fireEvent.scroll(surface(), {
      nativeEvent: { contentOffset: { x: MIDDLE - 136, y: 0 } },
    });
    expect(onScrub.mock.lastCall[0].point[0]).toBeCloseTo(9.82, 4);

    await fireEvent(surface(), 'scrollEndDrag', {});
    expect(onScrub).toHaveBeenLastCalledWith(null);
    expect(texts().some((x) => x.includes(' · '))).toBe(false);
  });

  it('should drop the cursor after a tap that never scrolled', async () => {
    const onScrub = jest.fn();
    await draw([1500, 1600, 1720], onScrub);
    await fireEvent(surface(), 'touchStart', { nativeEvent: { locationX: MIDDLE + 100 } });
    await fireEvent(surface(), 'touchEnd', {});
    expect(onScrub).toHaveBeenLastCalledWith(null);
  });

  it('should take no touches without a listener (the drawing sheet’s profile)', async () => {
    await draw([1500, 1600, 1720]);
    expect(screen.queryByTestId('profile-scrub', { includeHiddenElements: true })).toBeNull();
  });
});
