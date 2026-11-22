import { act, render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { ListRow, ListSection } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import '@/core/i18n';

type Geometry = { contentHeight: number; contentOffsetY: number };
type Modifier = { $type: string; eventListener?: (g: Geometry) => void };

const measuredLists = () =>
  screen.container.queryAll(
    (node) =>
      Array.isArray(node.props.modifiers) &&
      node.props.modifiers.some((m: Modifier) => m.$type === 'onScrollGeometryChange'),
  );

/** A list's scroll geometry, as SwiftUI reports it: the root page's, or the page pushed last. */
async function report(geometry: Geometry, page: 'root' | 'top' = 'top') {
  const lists = measuredLists();
  const list = page === 'root' ? lists[0] : lists.at(-1);
  const modifier = (list!.props.modifiers as Modifier[]).find(
    (m) => m.$type === 'onScrollGeometryChange',
  );
  await act(async () => modifier!.eventListener!(geometry));
}

/** The sheet's height: the outer frame around the always-full SwiftUI host. */
const hostHeight = () =>
  screen.container
    .queryAll((node) => typeof StyleSheet.flatten(node.props.style)?.height === 'number')
    .map((node) => StyleSheet.flatten(node.props.style).height as number)[0]!;

/** The SwiftUI host's own height: the sheet's largest, whatever the page. */
const swiftHostHeight = () =>
  screen.container
    .queryAll((node) => typeof node.props.style?.height === 'number')
    .map((node) => node.props.style.height as number)
    .at(-1)!;

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

describe('Screen on iOS, a page pushed into a fitted sheet', () => {
  const sheet = (path: string[]) => (
    <Screen
      fit
      path={path}
      renderPage={() => (
        <Page title="Offline maps">
          <ListSection>
            <ListRow title="Download a region" />
          </ListSection>
        </Page>
      )}
    >
      <Page title="Map layers">
        <ListSection>
          <ListRow title="Base map" />
        </ListSection>
      </Page>
    </Screen>
  );

  it('should push at once in a host that keeps its size, and glide the sheet to the new page', async () => {
    const largest = Dimensions.get('window').height * 0.9;
    const view = await render(sheet([]));
    await report({ contentHeight: 300, contentOffsetY: -56 });
    expect(hostHeight()).toBe(356);
    expect(swiftHostHeight()).toBe(largest);

    await view.rerender(sheet(['offline']));
    // No waiting and no growing first: the page is there, in the same full-size host.
    expect(screen.container.queryAll((n) => n.props.text === 'Download a region').length).toBe(1);
    expect(swiftHostHeight()).toBe(largest);

    // The pushed page reports its own height, its bar known already (no offset yet at its first
    // layout); only the sheet's frame follows.
    await report({ contentHeight: 200, contentOffsetY: 0 });
    expect(hostHeight()).toBe(256);
    expect(swiftHostHeight()).toBe(largest);
  });

  it('should keep measuring the page under the top, and take its height at once on the way back', async () => {
    const view = await render(sheet([]));
    await report({ contentHeight: 300, contentOffsetY: -56 });
    await view.rerender(sheet(['offline']));
    await report({ contentHeight: 200, contentOffsetY: -56 });

    // Its list keeps the same modifiers (SwiftUI would build it anew mid-slide), but under the
    // pushed page it doesn't size the sheet.
    await report({ contentHeight: 320, contentOffsetY: -56 }, 'root');
    expect(hostHeight()).toBe(256);

    // Back: the sheet takes its last measure as the pushed page slides away, with no new report.
    await view.rerender(sheet([]));
    expect(hostHeight()).toBe(376);
  });

  it("should keep a popped page's content while it slides away, then drop it", async () => {
    jest.useFakeTimers();
    const shown = () =>
      screen.container.queryAll((n) => n.props.text === 'Download a region').length > 0;
    const view = await render(sheet(['offline']));

    await view.rerender(sheet([]));
    expect(shown()).toBe(true); // not an empty pane sliding out

    await act(async () => jest.runAllTimers());
    expect(shown()).toBe(false);
    jest.useRealTimers();
  });
});
