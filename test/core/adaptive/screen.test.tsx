import { act, render, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { ListRow, ListSection } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import '@/core/i18n';

type Geometry = { contentHeight: number; contentOffsetY: number };
type Modifier = { $type: string; eventListener?: (g: Geometry) => void };

/** The list's scroll geometry, as SwiftUI reports it. */
async function report(geometry: Geometry) {
  const [list] = screen.container.queryAll(
    (node) =>
      Array.isArray(node.props.modifiers) &&
      node.props.modifiers.some((m: Modifier) => m.$type === 'onScrollGeometryChange'),
  );
  const modifier = (list!.props.modifiers as Modifier[]).find(
    (m) => m.$type === 'onScrollGeometryChange',
  );
  await act(async () => modifier!.eventListener!(geometry));
}

const hostHeight = () =>
  screen.container.queryAll((node) => typeof node.props.style?.height === 'number')[0]!.props.style
    .height as number;

describe('Screen on iOS, fitted to its page', () => {
  const page = (
    <Screen fit>
      <Page title="Map layers">
        <ListSection>
          <ListRow title="Legend" />
        </ListSection>
      </Page>
    </Screen>
  );

  it('should take the list and its bar, and keep it while the list scrolls', async () => {
    await render(page);
    const before = hostHeight();

    // Before its first layout the list has no rows: the sheet keeps its height.
    await report({ contentHeight: 0, contentOffsetY: 0 });
    expect(hostHeight()).toBe(before);

    await report({ contentHeight: 300, contentOffsetY: -70 });
    expect(hostHeight()).toBe(370);

    // Scrolled or pulled, the offset no longer shows the bar: the sheet stays as it is.
    await report({ contentHeight: 300, contentOffsetY: 40 });
    await report({ contentHeight: 300, contentOffsetY: -150 });
    expect(hostHeight()).toBe(370);

    // A row comes (the way back to the tour): the sheet grows with it.
    await report({ contentHeight: 360, contentOffsetY: -70 });
    expect(hostHeight()).toBe(430);
  });

  it('should stop short of the screen, so a long list scrolls', async () => {
    await render(page);

    await report({ contentHeight: 5000, contentOffsetY: -70 });

    expect(hostHeight()).toBeLessThan(Dimensions.get('window').height);
  });

  it('should not measure a page that is not fitted', async () => {
    await render(
      <Screen>
        <Page title="Tours">
          <ListSection>
            <ListRow title="Niesen" />
          </ListSection>
        </Page>
      </Screen>,
    );

    expect(
      screen.container.queryAll(
        (node) =>
          Array.isArray(node.props.modifiers) &&
          node.props.modifiers.some((m: Modifier) => m.$type === 'onScrollGeometryChange'),
      ),
    ).toHaveLength(0);
  });
});
