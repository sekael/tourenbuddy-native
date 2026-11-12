import {
  Button,
  Form,
  Host,
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
  useNativeState,
} from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  animation,
  Animation,
  buttonStyle,
  disabled as disabledModifier,
  fixedSize,
  listStyle,
  navigationBarTitleDisplayMode,
  navigationTitle,
  pickerStyle,
  refreshable,
  searchable,
  tag,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useContext, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { color } from '@/core/theme/tokens';
import { useReducedMotion } from '@/core/theme/use-reduced-motion';

import { icons } from './icons';
import { InSwiftUIList } from './in-list';
import { PageBanner } from './page-banner';
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
  children,
}: PageProps) {
  const { t } = useTranslation();
  const query = useNativeState(search?.value ?? '');
  // A query set from JS (cleared filters, a reset) reaches the field.
  useEffect(() => {
    if (search && query.get() !== search.value) query.set(search.value);
  }, [query, search]);

  const banner = useContext(PageBanner);
  const reducedMotion = useReducedMotion();
  const Container = form ? Form : List;
  const modifiers = [
    // The status row slides in and out with the list (a cut under Reduce Motion).
    ...(reducedMotion ? [] : [animation(Animation.default, !!banner)]),
    ...(form ? [] : [listStyle('insetGrouped')]),
    ...(onRefresh ? [refreshable(onRefresh)] : []),
    ...(search
      ? [
          searchable(query, {
            prompt: search.prompt,
            placement: 'navigationBarDrawer',
            onChange: search.onChange,
          }),
        ]
      : []),
    navigationTitle(title),
    navigationBarTitleDisplayMode(largeTitle ? 'large' : 'inline'),
    tint(color.primary),
  ];

  return (
    <Toolbar>
      <Container modifiers={modifiers}>
        {banner}
        {header ? (
          <Section>
            <RNHostView matchContents={{ vertical: true }}>
              <View>{header}</View>
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
              modifiers={[pickerStyle('segmented'), fixedSize()]}
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
        {actions?.map((action) => (
          <ToolbarItem key={action.id} placement="topBarTrailing">
            {action.menu?.length ? (
              <Menu
                label={action.label}
                systemImage={icons[action.icon].sf}
                modifiers={[
                  accessibilityLabel(action.label),
                  ...(action.disabled ? [disabledModifier(true)] : []),
                ]}
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
                label={action.label}
                systemImage={icons[action.icon].sf}
                onPress={action.onPress}
                modifiers={[
                  accessibilityLabel(action.label),
                  ...(action.disabled ? [disabledModifier(true)] : []),
                ]}
              />
            )}
          </ToolbarItem>
        ))}
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
            <Button
              role="close"
              onPress={onClose}
              modifiers={[accessibilityLabel(t('common.close'))]}
            />
          </ToolbarItem>
        ) : null}
      </Toolbar.Content>
    </Toolbar>
  );
}

const styles = StyleSheet.create({ host: { flex: 1 } });
