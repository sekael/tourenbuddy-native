import { createContext, useContext, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, fieldType, radius, size, space } from '@/core/theme/tokens';

import { CloseButton } from './close-button';
import { Icon } from './icon';
import type { IconName } from './icons';
import { GroupedList, type RowAction } from './list';
import { PageBanner } from './page-banner';
import { Text } from './text';
import { useEscape } from './use-escape';

/**
 * A screen of grouped content with its navigation bar (adaptive-lists-forms, D5): title, toolbar
 * buttons, an optional search field and pushed pages. iOS builds it from SwiftUI's
 * `NavigationStack`, toolbar and `searchable` (`screen.ios.tsx`); this is the Material one, shared by
 * Android and the web: a top bar, a search field and the list. Feature screens compose `Screen`
 * and `Page` and never branch on the platform.
 */

export type ScreenAction = {
  id: string;
  label: string;
  icon: IconName;
  onPress?: () => void;
  disabled?: boolean;
  /** A tap opens these instead (iOS: the system menu from the bar button). */
  menu?: RowAction[];
  /** Shows its label instead of the icon: a word where an icon would leave the user guessing. */
  titled?: boolean;
  /** iOS: at the bar's leading edge, so a title control sits centred with room on both sides. */
  leading?: boolean;
};

export type PageProps = {
  title: string;
  /** Tab roots: a large title that folds into the bar on scroll (iOS). */
  largeTitle?: boolean;
  /** Trailing toolbar buttons, icon only (their label is read out) unless `titled`. */
  actions?: ScreenAction[];
  /** A sheet's close button (iOS: the system xmark). */
  onClose?: () => void;
  /** Forms: Cancel leading, the confirm action trailing. */
  cancel?: { label: string; onPress: () => void };
  confirm?: { label: string; onPress: () => void; disabled?: boolean };
  search?: { value: string; onChange: (text: string) => void; prompt: string };
  /** A segmented choice in place of the title (iOS: in the bar, as Phone's "All | Missed"). */
  titleControl?: {
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
  };
  form?: boolean;
  onRefresh?: () => Promise<void>;
  /** App-drawn content above the first section (a hero, a segmented control). */
  header?: ReactNode;
  /** The header shows the title (a contact's name under their avatar): the bar leaves it out. */
  titleInHeader?: boolean;
  children: ReactNode;
  testID?: string;
};

export type ScreenProps = {
  /** The root page: a `Page` (or a component rendering one). */
  children: ReactElement;
  /** Pages pushed over the root, by value (a tour's id, a filters page). */
  path?: string[];
  onPathChange?: (path: string[]) => void;
  /** The page for a pushed value: a component rendering a `Page`. */
  renderPage?: (value: string) => ReactNode;
};

const BackContext = createContext<(() => void) | null>(null);

/** The navigation container: the root page and the pages pushed over it. */
export function Screen({ children, path = [], onPathChange, renderPage }: ScreenProps) {
  const top = path.length > 0 && renderPage ? renderPage(path[path.length - 1]!) : null;
  if (!top) return children;
  return (
    <BackContext.Provider value={() => onPathChange?.(path.slice(0, -1))}>
      {top}
    </BackContext.Provider>
  );
}

/** One page: its bar (title or segmented control, buttons), search field and grouped list. */
export function Page(page: PageProps) {
  const { t } = useTranslation();
  const onBack = useContext(BackContext);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menu = page.actions?.find((a) => a.id === openMenu)?.menu;
  useEscape(onBack ?? page.onClose ?? page.cancel?.onPress);
  const banner = useContext(PageBanner);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen} testID={page.testID}>
      <View style={styles.bar}>
        {onBack ? (
          <IconButton icon="arrow_back" label={t('common.back')} onPress={onBack} />
        ) : page.cancel ? (
          <TextButton label={page.cancel.label} onPress={page.cancel.onPress} />
        ) : null}
        {page.titleInHeader ? (
          <View style={styles.title} />
        ) : (
          <Text variant="title" role="heading" style={styles.title} numberOfLines={1}>
            {page.title}
          </Text>
        )}
        {page.actions?.map((action) => {
          const onPress = action.menu?.length
            ? () => setOpenMenu((open) => (open === action.id ? null : action.id))
            : (action.onPress ?? (() => {}));
          return action.titled ? (
            <TextButton
              key={action.id}
              label={action.label}
              onPress={onPress}
              disabled={action.disabled}
            />
          ) : (
            <IconButton
              key={action.id}
              icon={action.icon}
              label={action.label}
              onPress={onPress}
              disabled={action.disabled}
            />
          );
        })}
        {page.confirm ? (
          <TextButton
            label={page.confirm.label}
            onPress={page.confirm.onPress}
            disabled={page.confirm.disabled}
            strong
          />
        ) : null}
        {page.onClose ? <CloseButton label={t('common.close')} onPress={page.onClose} /> : null}
      </View>
      {menu ? (
        <View style={styles.menu} role="menu">
          {menu.map((item) => (
            <Pressable
              key={item.label}
              role="menuitem"
              onPress={() => {
                setOpenMenu(null);
                item.onPress();
              }}
              style={styles.menuItem}
            >
              {item.icon ? (
                <Icon
                  name={item.icon}
                  size={20}
                  color={item.destructive ? color.error : color.onSurface}
                />
              ) : null}
              <Text style={item.destructive ? { color: color.error } : undefined}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {page.titleControl ? (
        <View style={styles.segments} role="tablist">
          {page.titleControl.options.map((option) => {
            const selected = option.value === page.titleControl!.value;
            return (
              <Pressable
                key={option.value}
                role="tab"
                aria-selected={selected}
                onPress={() => page.titleControl!.onChange(option.value)}
                style={[styles.segment, selected && styles.segmentSelected]}
              >
                <Text
                  variant="label"
                  style={{ color: selected ? color.onSecondaryContainer : color.onSurface }}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {page.search ? (
        <View style={styles.search}>
          <Icon name="search" color={color.onSurfaceVariant} size={20} />
          <TextInput
            value={page.search.value}
            onChangeText={page.search.onChange}
            placeholder={page.search.prompt}
            placeholderTextColor={color.onSurfaceVariant}
            aria-label={page.search.prompt}
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      ) : null}
      <GroupedList
        header={
          <>
            {banner}
            {page.header}
          </>
        }
        onRefresh={page.onRefresh}
        form={page.form}
      >
        {page.children}
      </GroupedList>
    </SafeAreaView>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Icon name={icon} color={color.onSurface} />
    </Pressable>
  );
}

function TextButton({
  label,
  onPress,
  disabled,
  strong,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  strong?: boolean;
}) {
  return (
    <Pressable
      role="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.textButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text variant="label" style={{ color: strong ? color.primary : color.onSurface }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    minHeight: size.touch + space.md,
  },
  title: { flex: 1 },
  menu: {
    marginHorizontal: space.md,
    marginBottom: space.xs,
    borderRadius: radius.md,
    backgroundColor: color.neutralContainer,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: size.touch,
    paddingHorizontal: space.md,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginHorizontal: space.md,
    marginBottom: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: color.neutralContainer,
  },
  searchInput: {
    flex: 1,
    minHeight: size.touch - space.xs,
    ...fieldType.body,
    color: color.onSurface,
  },
  iconButton: {
    width: size.touch,
    height: size.touch,
    borderRadius: size.touch / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textButton: { minHeight: size.touch, justifyContent: 'center', paddingHorizontal: space.xs },
  segments: {
    flexDirection: 'row',
    marginHorizontal: space.md,
    marginBottom: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.outlineVariant,
    overflow: 'hidden',
  },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  segmentSelected: { backgroundColor: color.secondaryContainer },
  pressed: { backgroundColor: color.neutralContainer },
  disabled: { opacity: 0.38 },
});
