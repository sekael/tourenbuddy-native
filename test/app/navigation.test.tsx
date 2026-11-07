import { act, fireEvent, screen } from '@testing-library/react-native';
import { Slot } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import { routes as appRoutes } from './routes';

// iOS menu and routing. A slot stands in for the `NativeTabs` layout, which Jest renders with every
// tab mounted; the tab bar itself is native UI, checked in the Simulator. The menu is SwiftUI, which
// Jest renders as inert native views carrying their props: its entries are the buttons with an SF
// Symbol, grouped under one parent per section.
const routes = { ...appRoutes, '(tabs)/_layout': Slot };

type Node = ReturnType<typeof screen.container.queryAll>[number];
type Props = Record<string, unknown> & { modifiers?: { $type: string; label?: string }[] };

const nodes = (match: (props: Props) => boolean) =>
  screen.container.queryAll((node) => match(node.props as Props));

const entries = () => nodes((p) => !!p.onButtonPress && !!p.systemImage);

/** The menu's entries by label, in the groups the system menu separates. */
function menuGroups() {
  const groups = new Map<Node | null, string[]>();
  for (const entry of entries()) {
    groups.set(entry.parent, [...(groups.get(entry.parent) ?? []), entry.props.label]);
  }
  return [...groups.values()];
}

/** A SwiftUI view announced as `label` (the menu circle, a sheet's close button). */
const labelled = (label: string) =>
  nodes((p) => !!p.modifiers?.some((m) => m.$type === 'accessibilityLabel' && m.label === label));

async function press(node: Node) {
  await act(() => fireEvent(node, 'buttonPress'));
}

describe('app navigation (iOS menu)', () => {
  it("should group the map's own entries apart from the rest", async () => {
    await renderRouter(routes);

    expect(menuGroups()).toEqual([
      ['Inbox', 'Contacts', 'Profile'],
      ['Offline maps', 'Map layers'],
      ['Feedback'],
    ]);
  });

  it("should close the gap the map's entries leave on the calendar", async () => {
    await renderRouter(routes, { initialUrl: '/calendar' });

    expect(menuGroups()).toEqual([['Inbox', 'Contacts', 'Profile', 'Feedback']]);
  });

  it('should name the circle, which shows only a glyph', async () => {
    await renderRouter(routes);

    expect(labelled('Menu')).toHaveLength(1);
  });

  it('should open an entry as a sheet and close back to the same tab', async () => {
    await renderRouter(routes, { initialUrl: '/calendar' });

    await press(entries().find((entry) => entry.props.label === 'Inbox')!);
    expect(screen).toHavePathname('/inbox');

    await press(labelled('Close')[0]);

    expect(screen).toHavePathname('/calendar');
  });
});
