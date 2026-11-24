import { fireEvent, render, screen } from '@testing-library/react-native';
import { processColor } from 'react-native';

import '@/core/i18n';
import { ElevationProfile } from '@/features/map/presentation/elevation-profile';

const line: [number, number][] = [
  [9.8, 46.7],
  [9.81, 46.7],
  [9.82, 46.7],
];

async function draw(heights: (number | null)[]) {
  await render(
    <ElevationProfile
      line={line}
      heights={heights}
      bands={[{ from: 0, to: 1, color: '#90132E' }]}
    />,
  );
  const box = screen.container.queryAll((n) => typeof n.props.onLayout === 'function')[0]!;
  await fireEvent(box, 'layout', { nativeEvent: { layout: { width: 320, height: 72 } } });
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
});
