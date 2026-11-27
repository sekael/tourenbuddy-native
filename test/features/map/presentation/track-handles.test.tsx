import { fireEvent, render, screen } from '@testing-library/react-native';

import '@/core/i18n';
import type { LngLat } from '@/features/map/domain/entities/trail';
import {
  useMapStore,
  type EditHandles,
  type HandleTarget,
} from '@/features/map/presentation/stores/map-store';
import { TrackHandles } from '@/features/map/presentation/track-handles';

const A: LngLat = [7.8, 46.5];
const B: LngLat = [7.83, 46.5];
const C: LngLat = [7.86, 46.5];

function show(picked: HandleTarget | null) {
  const handles: EditHandles = {
    points: [
      { at: A, kind: 'start' },
      { at: B, kind: 'via' },
      { at: C, kind: 'goal' },
    ],
    legs: [
      [A, B],
      [B, C],
    ],
    move: jest.fn(),
    pull: jest.fn(),
    pick: jest.fn(),
    picked,
  };
  useMapStore.setState({ editHandles: handles, zoom: 13, drag: null });
  return handles;
}

const handle = (id: string) => screen.getByTestId(`annotation-${id}`);
const at = (lngLat: LngLat, point: [number, number]) => ({ nativeEvent: { lngLat, point } });

describe('TrackHandles', () => {
  afterEach(() => useMapStore.setState({ editHandles: null, drag: null }));

  it('should select a point on a tap, and never take it out', async () => {
    const handles = show(null);
    await render(<TrackHandles />);
    await fireEvent.press(handle('point-1'));
    expect(handles.pick).toHaveBeenCalledWith({ point: 1 });
    expect(handles.move).not.toHaveBeenCalled();
  });

  it('should let only the selected handle drag, so a pan elsewhere moves the map', async () => {
    show({ point: 1 });
    await render(<TrackHandles />);
    expect(handle('point-1').props.draggable).toBe(true);
    expect(handle('point-0').props.draggable).toBeUndefined();
    expect(handle('point-2').props.draggable).toBeUndefined();
  });

  it('should read a touch on the selected point that barely moved as a tap, however long it lasted', async () => {
    const handles = show({ point: 1 });
    await render(<TrackHandles />);
    await fireEvent(handle('point-1'), 'dragStart', at(B, [200, 300]));
    await fireEvent(handle('point-1'), 'dragEnd', at(B, [203, 304]));
    expect(handles.pick).toHaveBeenCalledWith({ point: 1 });
    expect(handles.move).not.toHaveBeenCalled();
    expect(useMapStore.getState().drag).toBeNull();
  });

  it('should move the selected point where it was dragged', async () => {
    const handles = show({ point: 1 });
    await render(<TrackHandles />);
    const to: LngLat = [7.835, 46.51];
    await fireEvent(handle('point-1'), 'dragStart', at(B, [200, 300]));
    await fireEvent(handle('point-1'), 'drag', at(to, [240, 280]));
    expect(useMapStore.getState().drag?.at).toEqual(to);
    await fireEvent(handle('point-1'), 'dragEnd', at(to, [240, 280]));
    expect(handles.move).toHaveBeenCalledWith(1, to);
    expect(handles.pick).not.toHaveBeenCalled();
  });

  it('should send the leg through where its selected dot was dragged', async () => {
    const handles = show({ leg: 0 });
    await render(<TrackHandles />);
    const to: LngLat = [7.815, 46.52];
    await fireEvent(handle('leg-0'), 'dragStart', at([7.815, 46.5], [150, 300]));
    await fireEvent(handle('leg-0'), 'dragEnd', at(to, [150, 240]));
    expect(handles.pull).toHaveBeenCalledWith(0, to);
  });
});
