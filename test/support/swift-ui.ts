import { act, fireEvent, screen } from '@testing-library/react-native';

// Jest renders SwiftUI as inert native views carrying their props: a button is the view with
// `onButtonPress`, its label the text view inside it, `disabled` one of its modifiers.
type Node = ReturnType<typeof screen.container.queryAll>[number];
type Modifier = { $type: string; disabled?: boolean };

export function swiftButton(label: string): Node {
  // The last match: a pushed screen renders after the screens it covers, which stay mounted.
  let node: Node | null = screen.container.queryAll((n) => n.props.text === label).at(-1) ?? null;
  while (node && !node.props.onButtonPress) node = node.parent;
  if (!node) throw new Error(`No SwiftUI button "${label}"`);
  return node;
}

export const isSwiftDisabled = (node: Node) =>
  (node.props.modifiers as Modifier[]).some((m) => m.$type === 'disabled' && m.disabled);

export async function pressSwift(label: string) {
  await act(() => fireEvent(swiftButton(label), 'buttonPress'));
}

/** A SwiftUI button known by its label alone (an icon-only one: a row's delete). */
export function swiftButtonLabelled(prefix: string): Node {
  const node = screen.container
    .queryAll((n) => typeof n.props.label === 'string' && n.props.label.startsWith(prefix))
    .find((n) => n.props.onButtonPress);
  if (!node) throw new Error(`No SwiftUI button labelled "${prefix}…"`);
  return node;
}

/** Whether SwiftUI text containing `text` is on the screen (rows, footers). */
export const hasSwiftText = (text: string) =>
  screen.container.queryAll((n) => typeof n.props.text === 'string' && n.props.text.includes(text))
    .length > 0;
