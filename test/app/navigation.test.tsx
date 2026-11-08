import { act, fireEvent, screen } from '@testing-library/react-native';
import { Slot } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import { signIn } from '../support/auth';
import { routes as appRoutes } from './routes';

// iOS menu and routing. A slot stands in for the `NativeTabs` layout, which Jest renders with every
// tab mounted; the tab bar itself is native UI, checked in the Simulator. The menu is SwiftUI, which
// Jest renders as inert native views carrying their props: its entries are the buttons with an SF
// Symbol.
const routes = { ...appRoutes, '(tabs)/_layout': Slot };

type Node = ReturnType<typeof screen.container.queryAll>[number];
type Props = Record<string, unknown> & { modifiers?: { $type: string; label?: string }[] };

const nodes = (match: (props: Props) => boolean) =>
  screen.container.queryAll((node) => match(node.props as Props));

const entries = () => nodes((p) => !!p.onButtonPress && !!p.systemImage);
const entryLabels = () => entries().map((entry) => entry.props.label);

/** A SwiftUI view announced as `label` (the menu circle, a sheet's close button). */
const labelled = (label: string) =>
  nodes((p) => !!p.modifiers?.some((m) => m.$type === 'accessibilityLabel' && m.label === label));

async function press(node: Node) {
  await act(() => fireEvent(node, 'buttonPress'));
}

// The tabs are for a signed-in user (`test/app/auth.test.tsx` covers signing in).
beforeEach(() => signIn());

describe('app navigation (iOS menu)', () => {
  it("should hold the map's own entries only, nearest the circle first", async () => {
    await renderRouter(routes);

    expect(entryLabels()).toEqual(['Offline maps', 'Map layers']);
    expect(labelled('Menu')).toHaveLength(1);
  });

  it.each(['/calendar', '/contacts', '/profile'])('should show no menu on %s', async (url) => {
    await renderRouter(routes, { initialUrl: url });

    expect(labelled('Menu')).toEqual([]);
    expect(entries()).toEqual([]);
  });

  it('should open Profile as a place, not as a sheet', async () => {
    await renderRouter(routes, { initialUrl: '/profile' });

    expect(screen.getByRole('heading', { name: 'Profile' })).toBeOnTheScreen();
    expect(labelled('Close')).toEqual([]);
  });

  it('should open an entry as a sheet and close back to the map', async () => {
    await renderRouter(routes);

    await press(entries().find((entry) => entry.props.label === 'Map layers')!);
    expect(screen).toHavePathname('/map-layers');

    await press(labelled('Close')[0]);

    expect(screen).toHavePathname('/');
  });
});
