import { act, fireEvent, screen } from '@testing-library/react-native';
import { router, Slot } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import { openTour } from '@/features/map/presentation/open-tour';
import { useMapStore } from '@/features/map/presentation/stores/map-store';

import { signIn } from '../support/auth';
import { routes as appRoutes } from './routes';

// iOS map controls and routing. A slot stands in for the `NativeTabs` layout, which Jest renders
// with every tab mounted; the tab bar itself is native UI, checked in the Simulator. The map's
// controls are React Native over glass; the sheets' toolbars are SwiftUI, which Jest renders as
// inert native views carrying their props.
const routes = { ...appRoutes, '(tabs)/_layout': Slot };

type Node = ReturnType<typeof screen.container.queryAll>[number];
type Props = Record<string, unknown> & { modifiers?: { $type: string; label?: string }[] };

const nodes = (match: (props: Props) => boolean) =>
  screen.container.queryAll((node) => match(node.props as Props));

/** A SwiftUI view announced as `label` (a sheet's close button). */
const labelled = (label: string) =>
  nodes((p) => !!p.modifiers?.some((m) => m.$type === 'accessibilityLabel' && m.label === label));

async function press(node: Node) {
  await act(() => fireEvent(node, 'buttonPress'));
}

const MAP_CONTROLS = ['Search places', 'My Tours', 'Add tour', 'Map layers'];

// The tabs are for a signed-in user (`test/app/auth.test.tsx` covers signing in).
beforeEach(() => signIn());

describe('app navigation (iOS map controls)', () => {
  it('should hold the map controls in one row: search, my tours, add tour, map', async () => {
    await renderRouter(routes);

    const labels = screen
      .getAllByRole('button')
      .map((b) => b.props.accessibilityLabel as string | undefined)
      .filter((label) => label && MAP_CONTROLS.includes(label));
    expect(labels).toEqual(MAP_CONTROLS);
  });

  it.each(['/calendar', '/contacts', '/profile'])(
    'should show no map controls on %s',
    async (url) => {
      await renderRouter(routes, { initialUrl: url });

      expect(screen.queryByRole('button', { name: 'Map layers' })).toBeNull();
    },
  );

  it('should open Profile as a place, not as a sheet', async () => {
    await renderRouter(routes, { initialUrl: '/profile' });

    // The title is the SwiftUI navigation bar's.
    expect(
      nodes(
        (p) =>
          !!p.modifiers?.some(
            (m) => m.$type === 'navigationTitle' && (m as { title?: string }).title === 'Profile',
          ),
      ),
    ).not.toEqual([]);
    expect(labelled('Close')).toEqual([]);
  });

  it('should open the map button as a sheet and close back to the map', async () => {
    await renderRouter(routes);

    await act(() => fireEvent.press(screen.getByRole('button', { name: 'Map layers' })));
    expect(screen).toHavePathname('/map-layers');

    await press(labelled('Close')[0]);

    expect(screen).toHavePathname('/');
  });

  it('should keep one lookup sheet when the map is tapped again while it is open', async () => {
    await renderRouter(routes);
    const lookUp = (id: string) =>
      act(() => {
        useMapStore.getState().showTrails([{ overlay: 'ski', id, lines: [], route: null }], 0);
        router.push('/trail');
      });

    await lookUp('first');
    await lookUp('second');
    await press(labelled('Close')[0]);

    // One Close is back on the map, and the closed sheet kept its card while it slid away.
    expect(screen).toHavePathname('/');
    expect(useMapStore.getState().trailCard?.candidates[0]?.id).toBe('second');
  });

  it('should open a tour from a sheet over Profile on the map, the sheet closed', async () => {
    await renderRouter(routes, { initialUrl: '/profile' });
    await act(() => router.push('/inbox'));

    await act(() => openTour('t1'));

    expect(screen).toHavePathname('/tour/t1');
    expect(useMapStore.getState().selectedTourId).toBe('t1');
    // Closing it shows the map, not the inbox or Profile.
    await press(labelled('Close')[0]);
    expect(screen).toHavePathname('/');
  });
});
