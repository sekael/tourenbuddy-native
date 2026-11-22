import {
  Button,
  Form,
  Host,
  Image,
  List,
  Menu,
  NavigationDestination,
  NavigationStack,
  Picker,
  RNHostView,
  Section,
  Text as SwiftText,
  Toolbar,
  ToolbarItem,
  ZStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  accessibilityLabel,
  animation,
  Animation,
  background,
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
  font,
  foregroundStyle,
  frame,
  id,
  lineLimit,
  listSectionMargins,
  listSectionSpacing,
  listStyle,
  menuStyle,
  minimumScaleFactor,
  navigationBarTitleDisplayMode,
  navigationTitle,
  pickerStyle,
  refreshable,
  scrollContentBackground,
  searchable,
  tag,
  tint,
  useScrollGeometryChange,
} from '@expo/ui/swift-ui/modifiers';
import { useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { color, size, space } from '@/core/theme/tokens';
import { useReducedMotion } from '@/core/theme/use-reduced-motion';

import { icons, type IconName } from './icons';
import { InSwiftUIList } from './in-list';
import { ListRow } from './list';
import { PageBanner } from './page-banner';
import { PageFit } from './page-fit';
import { PageOnTop } from './page-on-top';
import { PageReturn } from './page-return';
import { useFieldText } from './use-field-text';
import type { PageProps, ScreenProps } from './screen';

/**
 * iOS: a SwiftUI `NavigationStack` in one `Host`, so the title, the toolbar's glass buttons, the
 * search field in the bar, large titles that fold on scroll and the push transition are the
 * system's own. Pushed pages are `NavigationDestination`s for the values in `path`.
 */
export function Screen({ children, path, onPathChange, renderPage, fit }: ScreenProps) {
  const window = useWindowDimensions().height;
  // Fitted, the sheet (`fitSheetOptions`) is as tall as the top page's list, up to its largest
  // height (a longer list scrolls); below the status bar and the sheet's gap above it on every
  // iPhone, so the list's end never hides under the sheet's edge.
  //
  // Two frames: the SwiftUI host always has that largest height, and an outer frame, as tall as the
  // page, is what the sheet fits to. SwiftUI keeps a page's frame for a whole push, so a host that
  // changed size with each page cut a taller page off mid-push or had to grow before it; with a
  // host that never changes, a push or pop is the system's own slide, and the sheet glides once to
  // the new page's height, up or down. The outer frame doesn't clip: the sheet's own edge does, as
  // it glides, so a page sliding in or out is never cut off at the other page's height.
  const largest = window * 0.9;
  const [height, setHeight] = useState<number>();
  const pages = useLeavingPages(path ?? []);
  // The bar's inset, from the list's offset at rest, once: scrolled or pulled, the offset no longer
  // shows it, and the sheet must not shrink or grow under a finger.
  const inset = useRef(0);
  const pageFit = fit
    ? {
        height: (contentHeight: number, offsetY: number) => {
          if (!inset.current) inset.current = Math.max(0, -offsetY);
          return Math.ceil(contentHeight + inset.current);
        },
        report: setHeight,
      }
    : null;
  const host = (
    <Host style={fit ? { height: largest } : styles.host}>
      <PageFit.Provider value={pageFit}>
        <NavigationStack path={path} onPathChange={onPathChange}>
          <PageOnTop.Provider value={!path?.length}>{children}</PageOnTop.Provider>
          {pages.map((value) => (
            <NavigationDestination key={value} value={value}>
              {/* The tour's way back is the sheet's first page's, not a page pushed further on. */}
              <PageReturn.Provider value={null}>
                <PageOnTop.Provider value={value === path?.at(-1)}>
                  {renderPage?.(value)}
                </PageOnTop.Provider>
              </PageReturn.Provider>
            </NavigationDestination>
          ))}
        </NavigationStack>
      </PageFit.Provider>
    </Host>
  );
  if (!fit) return host;
  return <View style={{ height: Math.min(height ?? window / 2, largest) }}>{host}</View>;
}

/** How long the system's pop slides a page away. */
const POP_MS = 500;

/**
 * The pushed pages to render: the path, and for a moment those just popped. SwiftUI slides a popped
 * page out after the path has dropped it; its content gone at once, it slid out as an empty pane.
 */
function useLeavingPages(path: string[]) {
  const [shown, setShown] = useState(path);
  const [leaving, setLeaving] = useState<string[]>([]);
  if (shown !== path) {
    setShown(path);
    setLeaving(shown.filter((value) => !path.includes(value)));
  }
  useEffect(() => {
    if (!leaving.length) return;
    const timer = setTimeout(() => setLeaving([]), POP_MS);
    return () => clearTimeout(timer);
  }, [leaving]);
  return [...path, ...leaving.filter((value) => !path.includes(value))];
}

export function Page({
  title,
  largeTitle,
  actions,
  onClose,
  cancel,
  confirm,
  search,
  titleControl,
  form,
  onRefresh,
  header,
  titleInHeader,
  body,
  children,
}: PageProps) {
  const { t } = useTranslation();
  // A query set from JS (cleared filters, a reset) reaches the field; typing is never undone.
  // A query cleared from JS (a result taken) ends the search: a new list starts unsearched, so
  // the keyboard goes and the bar's buttons come back.
  const [searches, setSearches] = useState(0);
  const { text: query, onTextChange: onQueryChange } = useFieldText(
    search?.value ?? '',
    search?.onChange,
    () => setSearches((n) => n + 1),
  );

  const banner = useContext(PageBanner);
  const wayBack = useContext(PageReturn);
  const fit = useContext(PageFit);
  const onTop = useContext(PageOnTop);
  // Every page of a fitted sheet measures its list, on top or not: a modifier that came and went
  // with the page on top made SwiftUI build the list anew mid-slide (its bar blank, a stale strip).
  // Only the page on top sets the sheet's height; one back on top sets it at once from its last
  // measure, as the page over it slides away.
  const measured = useRef(0);
  useLayoutEffect(() => {
    if (fit && onTop && measured.current) fit.report(measured.current);
  }, [fit, onTop]);
  const fitting = useScrollGeometryChange(
    fit
      ? (g) => {
          // Before its first layout the list has no rows: no height to take yet.
          if (!g.contentHeight) return;
          measured.current = fit.height(g.contentHeight, g.contentOffsetY);
          if (onTop) fit.report(measured.current);
        }
      : undefined,
  );
  const reducedMotion = useReducedMotion();
  const Container = form ? Form : List;
  const modifiers = [
    // The status row slides in and out with the list (a cut under Reduce Motion).
    ...(reducedMotion ? [] : [animation(Animation.default, !!banner)]),
    ...(form ? [] : [listStyle('insetGrouped')]),
    // Fitted, the sheet's glass is the page's background: the list's own grouped background ended
    // above the sheet's bottom edge, a second, lighter shade under the cards.
    ...(fit ? [scrollContentBackground('hidden')] : []),
    // Sections close together, as in Settings: a sheet shows more than its gaps.
    listSectionSpacing('compact'),
    ...(onRefresh ? [refreshable(onRefresh)] : []),
    ...(fitting ? [fitting] : []),
    ...(search
      ? [
          searchable(query, {
            prompt: search.prompt,
            placement: 'navigationBarDrawer',
            onChange: onQueryChange,
          }),
        ]
      : []),
  ];
  const bar = [
    navigationTitle(titleInHeader ? '' : title),
    navigationBarTitleDisplayMode(largeTitle ? 'large' : 'inline'),
    tint(color.primary),
  ];

  return (
    <Toolbar>
      {body ? (
        // The app's own scroll view fills the page; the grouped background runs under the bars.
        <ZStack modifiers={[...bar, background(color.groupedBackground)]}>
          <RNHostView>
            <View style={styles.host}>{body}</View>
          </RNHostView>
        </ZStack>
      ) : (
        <Container key={searches} modifiers={[...modifiers, ...bar]}>
          {banner}
          {wayBack ? (
            <Section
              modifiers={
                fit ? [listSectionMargins({ edges: 'vertical', length: space.xs })] : undefined
              }
            >
              <ListRow
                title={wayBack.label}
                icon="help"
                chevron={false}
                onPress={wayBack.onPress}
              />
            </Section>
          ) : null}
          {header ? (
            // Close under the bar's buttons: the header is the page's top, not a section after it.
            <Section modifiers={[listSectionMargins({ edges: 'top', length: 0 })]}>
              <RNHostView matchContents={{ vertical: true }}>
                <HostedWidth>{header}</HostedWidth>
              </RNHostView>
            </Section>
          ) : null}
          <InSwiftUIList.Provider value>{children}</InSwiftUIList.Provider>
        </Container>
      )}
      <Toolbar.Content>
        {titleControl ? (
          <ToolbarItem placement="principal">
            <Picker
              selection={titleControl.value}
              onSelectionChange={(value) => titleControl.onChange(String(value))}
              // Room to breathe: in the bar the picker is offered no width and hugged its labels,
              // so it takes at least a comfortable width (more for longer labels), and the large
              // size gives each option a taller, roomier segment.
              modifiers={[
                pickerStyle('segmented'),
                controlSize('large'),
                frame({ minWidth: TITLE_CONTROL_MIN_WIDTH, maxWidth: TITLE_CONTROL_WIDTH }),
              ]}
            >
              {titleControl.options.map((option) => (
                <SwiftText key={option.value} modifiers={[tag(option.value)]}>
                  {option.label}
                </SwiftText>
              ))}
            </Picker>
          </ToolbarItem>
        ) : !largeTitle && !titleInHeader && title ? (
          <ToolbarItem placement="principal">
            {/* The bar's own title, but shrinking at the largest text sizes rather than cut to
                "Bearb…" between Cancel and Save. A new title is a new view: it fades in rather
                than morphing inside the old one's width ("Willkom…"). */}
            <SwiftText
              modifiers={[
                id(title),
                font({ textStyle: 'headline' }),
                lineLimit(1),
                minimumScaleFactor(0.5),
                accessibilityAddTraits(['isHeader']),
              ]}
            >
              {title}
            </SwiftText>
          </ToolbarItem>
        ) : null}
        {cancel ? (
          <ToolbarItem placement="cancellationAction">
            <Button label={cancel.label} role="cancel" onPress={cancel.onPress} />
          </ToolbarItem>
        ) : null}
        {actions?.map((action) => {
          // In a sheet's bar an icon gets a full target; a tab's large-title bar keeps the system's.
          const sized = !action.titled && !largeTitle;
          const look = [
            ...(sized ? [buttonStyle('plain')] : []),
            accessibilityLabel(action.label),
            ...(action.selected ? [tint(color.primary)] : []),
            ...(action.disabled ? [disabledModifier(true)] : []),
          ];
          const systemImage = sized || action.titled ? undefined : icons[action.icon].sf;
          return (
            <ToolbarItem
              key={action.id}
              placement={action.leading ? 'topBarLeading' : 'topBarTrailing'}
            >
              {action.menu?.length ? (
                <Menu
                  label={
                    sized ? <BarIcon icon={action.icon} selected={action.selected} /> : action.label
                  }
                  systemImage={systemImage}
                  modifiers={sized ? [menuStyle('button'), ...look] : look}
                >
                  {action.menu.map((item) => (
                    <Button
                      key={item.label}
                      label={item.label}
                      systemImage={item.icon ? icons[item.icon].sf : undefined}
                      role={item.destructive ? 'destructive' : undefined}
                      onPress={item.onPress}
                    />
                  ))}
                </Menu>
              ) : (
                <Button
                  label={sized ? undefined : action.label}
                  systemImage={systemImage}
                  onPress={action.onPress}
                  modifiers={look}
                >
                  {sized ? <BarIcon icon={action.icon} selected={action.selected} /> : undefined}
                </Button>
              )}
            </ToolbarItem>
          );
        })}
        {confirm ? (
          <ToolbarItem placement="confirmationAction">
            <Button
              label={confirm.label}
              onPress={confirm.onPress}
              modifiers={[
                buttonStyle('glassProminent'),
                tint(color.primary),
                ...(confirm.disabled ? [disabledModifier(true)] : []),
              ]}
            />
          </ToolbarItem>
        ) : null}
        {onClose ? (
          <ToolbarItem placement="topBarTrailing">
            {largeTitle ? (
              <Button
                role="close"
                onPress={onClose}
                modifiers={[accessibilityLabel(t('common.close'))]}
              />
            ) : (
              // The same xmark, as big as the bar's other buttons.
              <Button
                role="close"
                onPress={onClose}
                modifiers={[buttonStyle('plain'), accessibilityLabel(t('common.close'))]}
              >
                <BarIcon icon="close" />
              </Button>
            )}
          </ToolbarItem>
        ) : null}
      </Toolbar.Content>
    </Toolbar>
  );
}

/**
 * A hosted header laid out at the width its row ends up with. The row settles its width after the
 * first layout, and the hosted view takes the new width without laying out its children again
 * (flex columns kept the first, wider width: a long name or a row of chips ran out of the card).
 * Measured, the header mounts again at that width, once, as the sheet opens.
 */
function HostedWidth({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState<number | null>(null);
  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View key={width ?? 0} style={width ? { width } : undefined}>
        {children}
      </View>
    </View>
  );
}

/**
 * A bar's icon button: the glyph centred in a full touch target (the bar's own style would hold
 * it to 35 pt). Plain, so the bar's glass is the only glass around it. The glyph at the size of
 * the bar's words (body), as the system's own bar buttons: unsized, it drew half again as big
 * and heavier than a segmented control beside it. In the brand blue while `selected`.
 */
const TARGET = size.touch;
const TITLE_CONTROL_WIDTH = 264;
const TITLE_CONTROL_MIN_WIDTH = 220;

function BarIcon({ icon, selected = false }: { icon: IconName; selected?: boolean }) {
  return (
    <Image
      systemName={icons[icon].sf}
      modifiers={[
        font({ textStyle: 'body' }),
        frame({ width: TARGET, height: TARGET }),
        ...(selected ? [foregroundStyle(color.primary)] : []),
      ]}
    />
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
});
