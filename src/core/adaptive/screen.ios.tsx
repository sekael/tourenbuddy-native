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
} from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  animation,
  Animation,
  buttonStyle,
  disabled as disabledModifier,
  frame,
  listSectionMargins,
  listSectionSpacing,
  listStyle,
  menuStyle,
  navigationBarTitleDisplayMode,
  navigationTitle,
  pickerStyle,
  refreshable,
  searchable,
  tag,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useContext, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { color, size } from '@/core/theme/tokens';
import { useReducedMotion } from '@/core/theme/use-reduced-motion';

import { icons, type IconName } from './icons';
import { InSwiftUIList } from './in-list';
import { PageBanner } from './page-banner';
import { useFieldText } from './use-field-text';
import type { PageProps, ScreenProps } from './screen';

/**
 * iOS: a SwiftUI `NavigationStack` in one `Host`, so the title, the toolbar's glass buttons, the
 * search field in the bar, large titles that fold on scroll and the push transition are the
 * system's own. Pushed pages are `NavigationDestination`s for the values in `path`.
 */
export function Screen({ children, path, onPathChange, renderPage }: ScreenProps) {
  return (
    <Host style={styles.host}>
      <NavigationStack path={path} onPathChange={onPathChange}>
        {children}
        {(path ?? []).map((value) => (
          <NavigationDestination key={value} value={value}>
            {renderPage?.(value)}
          </NavigationDestination>
        ))}
      </NavigationStack>
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
  const reducedMotion = useReducedMotion();
  const Container = form ? Form : List;
  const modifiers = [
    // The status row slides in and out with the list (a cut under Reduce Motion).
    ...(reducedMotion ? [] : [animation(Animation.default, !!banner)]),
    ...(form ? [] : [listStyle('insetGrouped')]),
    // Sections close together, as in Settings: a sheet shows more than its gaps.
    listSectionSpacing('compact'),
    ...(onRefresh ? [refreshable(onRefresh)] : []),
    ...(search
      ? [
          searchable(query, {
            prompt: search.prompt,
            placement: 'navigationBarDrawer',
            onChange: onQueryChange,
          }),
        ]
      : []),
    navigationTitle(titleInHeader ? '' : title),
    navigationBarTitleDisplayMode(largeTitle ? 'large' : 'inline'),
    tint(color.primary),
  ];

  return (
    <Toolbar>
      <Container key={searches} modifiers={modifiers}>
        {banner}
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
                  label={sized ? <BarIcon icon={action.icon} /> : action.label}
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
                  {sized ? <BarIcon icon={action.icon} /> : undefined}
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
 * it to 35 pt). Plain, so the bar's glass is the only glass around it.
 */
const TARGET = size.touch;
const TITLE_CONTROL_WIDTH = 264;

function BarIcon({ icon }: { icon: IconName }) {
  return (
    <Image systemName={icons[icon].sf} modifiers={[frame({ width: TARGET, height: TARGET })]} />
  );
}

const styles = StyleSheet.create({ host: { flex: 1 } });
