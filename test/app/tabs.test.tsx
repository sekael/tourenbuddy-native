import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { routes } from './routes';

// iOS: the dock is SwiftUI, which Jest renders as bare native views carrying their props, so the
// tests find its buttons by their accessibility label (tabs) or label (menu entries).
type Props = Record<string, unknown> & { modifiers?: { $type: string; [key: string]: unknown }[] };

const nodes = (match: (props: Props) => boolean) =>
  screen.container.queryAll((node) => match(node.props as Props));

const hasModifier = (props: Props, type: string, check: (m: Record<string, unknown>) => boolean) =>
  props.modifiers?.some((m) => m.$type === type && check(m)) ?? false;

/** A SwiftUI button announced as `label`: a place in the dock, or a sheet's close button. */
function button(label: string) {
  const [node] = nodes(
    (p) => !!p.onButtonPress && hasModifier(p, 'accessibilityLabel', (m) => m.label === label),
  );
  if (!node) throw new Error(`No SwiftUI button labelled ${label}`);
  return node;
}

const isSelected = (label: string) =>
  hasModifier(button(label).props as Props, 'accessibilityAddTraits', (m) =>
    (m.traits as string[]).includes('isSelected'),
  );

const menuEntries = () =>
  nodes((p) => !!p.onButtonPress && !!p.systemImage).map((node) => node.props.label as string);

const press = (node: ReturnType<typeof button>) => act(() => fireEvent(node, 'buttonPress'));

describe('tabs (iOS glass dock)', () => {
  it('should mark the place a link opens on, not the map', async () => {
    await renderRouter(routes, { initialUrl: '/calendar' });

    expect(isSelected('Calendar')).toBe(true);
    expect(isSelected('Map')).toBe(false);
  });

  it('should switch places from the dock', async () => {
    await renderRouter(routes);

    await press(button('Calendar'));

    expect(screen).toHavePathname('/calendar');
    expect(isSelected('Calendar')).toBe(true);
    expect(isSelected('Map')).toBe(false);
  });

  it('should stay put when the selected place is pressed again', async () => {
    await renderRouter(routes);

    await press(button('Map'));

    expect(screen).toHavePathname('/');
    expect(isSelected('Map')).toBe(true);
  });

  it("should list the menu nearest first, with the map's own entries on the map only", async () => {
    await renderRouter(routes);
    expect(menuEntries()).toEqual([
      'Inbox',
      'Contacts',
      'Profile',
      'Offline maps',
      'Map layers',
      'Feedback',
    ]);

    await press(button('Calendar'));

    expect(menuEntries()).toEqual(['Inbox', 'Contacts', 'Profile', 'Feedback']);
  });

  it('should open a menu entry as a sheet and close back to the same place', async () => {
    await renderRouter(routes, { initialUrl: '/calendar' });
    const [inbox] = nodes((p) => p.label === 'Inbox' && !!p.onButtonPress);

    await press(inbox);
    expect(screen).toHavePathname('/inbox');

    await press(button('Close'));

    expect(screen).toHavePathname('/calendar');
    expect(isSelected('Calendar')).toBe(true);
  });
});
