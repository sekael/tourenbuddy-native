import { fireEvent, render, screen } from '@testing-library/react';

import '@/core/i18n';
import { ElevationProfile } from '@/features/map/presentation/web/elevation-profile.web';

// No layout in jsdom: the profile is 320 px wide, its chart from x 44 to 316.
jest.mock('@/core/web/use-element-size.web', () => ({ useElementSize: () => ({ width: 320 }) }));

// jsdom has no PointerEvent: a mouse event with the pointer's type and id stands in.
class TestPointerEvent extends MouseEvent {
  pointerType: string;
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? 'mouse';
    this.pointerId = init.pointerId ?? 1;
  }
}
window.PointerEvent ??= TestPointerEvent as unknown as typeof PointerEvent;

const line: [number, number][] = [
  [9.8, 46.7],
  [9.81, 46.7],
  [9.82, 46.7],
];

function draw(onScrub?: jest.Mock) {
  const { container } = render(
    <ElevationProfile
      line={line}
      heights={[1500, 1600, 1720]}
      bands={[{ from: 0, to: 1, color: '#90132E' }]}
      onScrub={onScrub}
    />,
  );
  return container.firstElementChild as HTMLElement;
}

describe('ElevationProfile (web)', () => {
  it('should follow a pressed mouse with a cursor and name the spot, until it lets go', () => {
    const onScrub = jest.fn();
    const box = draw(onScrub);
    fireEvent.pointerDown(box, { clientX: 100, buttons: 1, pointerType: 'mouse' });
    fireEvent.pointerMove(box, { clientX: 180, buttons: 1, pointerType: 'mouse' });
    expect(onScrub.mock.lastCall[0].point[0]).toBeCloseTo(9.81, 3);
    expect(screen.getByTestId('profile-cursor').textContent).toMatch(/^1\d{3}\sm · 0\.8\skm$/);

    fireEvent.pointerUp(box, { clientX: 180, pointerType: 'mouse' });
    expect(onScrub).toHaveBeenLastCalledWith(null);
    expect(screen.queryByTestId('profile-cursor')).toBeNull();
  });

  it('should ignore a mouse passing over without a press', () => {
    const onScrub = jest.fn();
    const box = draw(onScrub);
    fireEvent.pointerMove(box, { clientX: 180, buttons: 0, pointerType: 'mouse' });
    expect(onScrub).not.toHaveBeenCalled();
    expect(screen.queryByTestId('profile-cursor')).toBeNull();
  });

  it('should drop the cursor when a finger lifts', () => {
    const onScrub = jest.fn();
    const box = draw(onScrub);
    fireEvent.pointerDown(box, { clientX: 316, pointerType: 'touch', pointerId: 1 });
    expect(onScrub.mock.lastCall[0].point[0]).toBeCloseTo(9.82, 4);
    fireEvent.pointerUp(box, { clientX: 316, pointerType: 'touch', pointerId: 1 });
    expect(onScrub).toHaveBeenLastCalledWith(null);
  });

  it('should show no cursor without a listener (the drawing panel’s profile)', () => {
    const box = draw();
    fireEvent.pointerDown(box, { clientX: 180, buttons: 1, pointerType: 'mouse' });
    expect(screen.queryByTestId('profile-cursor')).toBeNull();
  });
});
