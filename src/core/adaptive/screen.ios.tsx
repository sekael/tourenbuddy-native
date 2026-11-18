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
  disabled as disabledModifier,
  font,
  foregroundStyle,
  frame,
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
  searchable,
  tag,
  tint,
  useScrollGeometryChange,
} from '@expo/ui/swift-ui/modifiers';
import { useContext, useRef, useState, type ReactNode } from 'react';
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
  // Fitted, the sheet (`fitSheetOptions`) takes the host's height: the top page's list, up to
  // the sheet's largest height (a longer list scrolls). Below the status bar and the sheet's gap
  // above it on every iPhone, so the list's end never hides under the sheet's edge.
  const [height, setHeight] = useState<number>();
  const window = useWindowDimensions().height;
  const style = fit ? { height: Math.min(height ?? window / 2, window * 0.9) } : styles.host;
  return (
    <Host style={style}>
      <PageFit.Provider value={fit ? setHeight : null}>
        <NavigationStack path={path} onPathChange={onPathChange}>
          <PageOnTop.Provider value={!path?.length}>{children}</PageOnTop.Provider>
          {(path ?? []).map((value, i, all) => (
            <NavigationDestination key={value} value={value}>
              <PageOnTop.Provider value={i === all.length - 1}>
                {renderPage?.(value)}
              </PageOnTop.Provider>
            </NavigationDestination>
          ))}
        </NavigationStack>
      </PageFit.Provider>
    </Host>
  );
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
  // The list's top inset is the bar, read from its offset at rest, once: scrolled or pulled, the
  // offset no longer shows it, and the sheet must not shrink or grow under a finger.
  const inset = useRef(0);
  const fitting = useScrollGeometryChange(
    fit && onTop
      ? (g) => {
          // Before its first layout the list has no rows: no height to take yet.
          if (!g.contentHeight) return;
          if (!inset.current) inset.current = Math.max(0, -g.contentOffsetY);
          fit(Math.ceil(g.contentHeight + inset.current));
        }
      : undefined,
  );
  const reducedMotion = useReducedMotion();
  const Container = form ? Form : List;
  const modifiers = [
    // The status row slides in and out with the list (a cut under Reduce Motion).
    ...(reducedMotion ? [] : [animation(Animation.default, !!banner)]),
    ...(form ? [] : [listStyle('insetGrouped')]),
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
              // As wide as the bar allows (up to a comfortable width), so the longer label
              // has room in its half instead of the picker hugging it.
              modifiers={[pickerStyle('segmented'), frame({ maxWidth: TITLE_CONTROL_WIDTH })]}
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
                "Bearb…" between Cancel and Save. */}
            <SwiftText
              modifiers={[
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

const styles = StyleSheet.create({ host: { flex: 1 } });
