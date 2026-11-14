import { Children, isValidElement, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from 'react-native';

import { color, fieldType, radius, size, space, type as typeScale } from '@/core/theme/tokens';

import { Icon } from './icon';
import type { IconName } from './icons';
import { Text } from './text';

/**
 * Grouped lists and forms (adaptive-lists-forms, D5). The Material implementation, shared by
 * Android and the web; iOS (`list.ios.tsx`) builds the same props from SwiftUI's `List` and
 * `Form`. Feature screens compose these and never branch on the platform.
 */

export type RowAction = {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  onPress: () => void;
};

export type GroupedListProps = {
  children: ReactNode;
  /** A form: iOS uses SwiftUI `Form` (fields), otherwise `List` (rows). */
  form?: boolean;
  /** Pull to refresh. */
  onRefresh?: () => Promise<void>;
  /** Content above the first section that is not a row (a hero), drawn by the app. */
  header?: ReactNode;
  testID?: string;
};

export type ListSectionProps = { title?: string; footer?: string; children: ReactNode };

export type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Trailing secondary text (a setting's current value). */
  value?: string;
  /** A bar under the text, 0 to 1 (a download under way). */
  progress?: number;
  icon?: IconName;
  /** The icon's tint; the brand colour by default. */
  iconColor?: string;
  onPress?: () => void;
  /** Disclosure chevron; on by default for a row that navigates (`onPress`, not destructive). */
  chevron?: boolean;
  destructive?: boolean;
  /** A count or a short label at the trailing edge (the inbox's unread count). */
  badge?: string | number;
  /** A checkmark at the trailing edge (single choice lists). */
  checked?: boolean;
  disabled?: boolean;
  swipeActions?: RowAction[];
  leadingSwipeActions?: RowAction[];
  contextActions?: RowAction[];
  /** A tap opens these as a menu (iOS: the system menu from the row). */
  menu?: RowAction[];
  /** A button of its own at the trailing edge, its icon alone (a download's stop). */
  accessory?: RowAction;
  accessibilityLabel?: string;
  testID?: string;
};

export type ToggleRowProps = {
  title: string;
  subtitle?: string;
  icon?: IconName;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
};

export type TextRowProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'decimal-pad' | 'url';
  autoCapitalize?: 'none' | 'words' | 'sentences';
  textContentType?:
    | 'name'
    | 'givenName'
    | 'familyName'
    | 'nickname'
    | 'emailAddress'
    | 'telephoneNumber'
    | 'oneTimeCode'
    | 'URL';
  maxLength?: number;
  /** Shown under the field in the error colour. */
  error?: string;
  onSubmit?: () => void;
};

export type PickerOption<T extends string | number> = { value: T; label: string };

export type PickerRowProps<T extends string | number> = {
  title: string;
  value: T;
  options: PickerOption<T>[];
  onChange: (value: T) => void;
  icon?: IconName;
  /** `menu` (default) pops a menu from the row; `segmented` shows the options inline. */
  style?: 'menu' | 'segmented';
};

export type DateRowProps = {
  title: string;
  value: Date | null;
  onChange: (value: Date) => void;
  mode?: 'date' | 'time';
  minimumDate?: Date;
  /** An unset value shows this and a tap sets today. */
  placeholder?: string;
  onClear?: () => void;
  clearLabel?: string;
};

export type StepperRowProps = {
  title: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (value: number) => string;
};

export type ContentRowProps = { children: ReactNode; accessibilityLabel?: string };

export type EmptyStateProps = {
  icon: IconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function GroupedList({ children, header, testID }: GroupedListProps) {
  return (
    <ScrollView
      testID={testID}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
    >
      {header}
      {children}
    </ScrollView>
  );
}

export function ListSection({ title, footer, children }: ListSectionProps) {
  const rows = Children.toArray(children).filter(isValidElement);
  if (rows.length === 0) return null;
  return (
    <View style={styles.section}>
      {title ? (
        <Text variant="caption" role="heading" level={3} style={styles.sectionTitle}>
          {title}
        </Text>
      ) : null}
      <View style={styles.card}>
        {rows.map((row, index) => (
          <View key={row.key ?? index} style={index > 0 ? styles.divided : undefined}>
            {row}
          </View>
        ))}
      </View>
      {footer ? (
        <Text variant="caption" style={styles.footer}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  value,
  progress,
  icon,
  iconColor,
  onPress,
  chevron,
  destructive,
  badge,
  checked,
  disabled,
  swipeActions,
  leadingSwipeActions,
  contextActions,
  menu: tapMenu,
  accessory,
  accessibilityLabel,
  testID,
}: ListRowProps) {
  const [menu, setMenu] = useState(false);
  // Material has no swipe or context menu: a long press (or, for a menu row, a tap) lists them.
  const extra = tapMenu?.length
    ? tapMenu
    : [...(leadingSwipeActions ?? []), ...(swipeActions ?? []), ...(contextActions ?? [])];
  const showChevron = chevron ?? (!!onPress && !destructive && !tapMenu);
  const press = tapMenu?.length ? () => setMenu((open) => !open) : onPress;
  const content = (
    <View style={styles.row}>
      {icon ? <Icon name={icon} color={iconColor ?? color.primary} /> : null}
      <View style={styles.rowText}>
        <Text style={[styles.title, destructive && styles.destructive]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" style={styles.muted} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {progress !== undefined ? (
          <View style={styles.track} role="progressbar" aria-valuenow={Math.round(progress * 100)}>
            <View
              style={[styles.fill, { width: `${Math.min(Math.max(progress, 0), 1) * 100}%` }]}
            />
          </View>
        ) : null}
      </View>
      {value ? (
        <Text variant="caption" style={styles.muted} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {badge !== undefined && badge !== '' && badge !== 0 ? (
        <View style={styles.badge}>
          <Text variant="caption" style={styles.badgeText}>
            {String(badge)}
          </Text>
        </View>
      ) : null}
      {checked ? <Icon name="check" color={color.primary} size={20} /> : null}
      {showChevron ? <Icon name="chevron_right" color={color.onSurfaceVariant} size={20} /> : null}
      {accessory?.icon ? (
        <Pressable
          role="button"
          aria-label={accessory.label}
          onPress={accessory.onPress}
          hitSlop={space.xs}
          style={styles.accessory}
        >
          <Icon name={accessory.icon} color={color.primary} size={26} />
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View>
      <Pressable
        testID={testID}
        role={press ? 'button' : undefined}
        aria-label={accessibilityLabel ?? title}
        aria-disabled={disabled}
        aria-expanded={tapMenu?.length ? menu : undefined}
        disabled={disabled || (!press && extra.length === 0)}
        onPress={press}
        onLongPress={extra.length > 0 ? () => setMenu((open) => !open) : undefined}
        style={({ pressed }) => [pressed && styles.pressed, disabled && styles.disabled]}
      >
        {content}
      </Pressable>
      {menu ? (
        <View style={styles.actions}>
          {extra.map((action) => (
            <Pressable
              key={action.label}
              role="button"
              onPress={() => {
                setMenu(false);
                action.onPress();
              }}
              style={styles.action}
            >
              {action.icon ? (
                <Icon
                  name={action.icon}
                  size={20}
                  color={action.destructive ? color.error : color.onSurface}
                />
              ) : null}
              <Text style={action.destructive ? styles.destructive : undefined}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ToggleRow({
  title,
  subtitle,
  icon,
  value,
  onValueChange,
  disabled,
}: ToggleRowProps) {
  return (
    <View style={styles.row}>
      {icon ? <Icon name={icon} color={color.primary} /> : null}
      <View style={styles.rowText}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? (
          <Text variant="caption" style={styles.muted}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Switch
        aria-label={title}
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ true: color.primary, false: color.outlineVariant }}
        thumbColor={color.background}
      />
    </View>
  );
}

export function TextRow({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  autoCapitalize,
  textContentType,
  maxLength,
  error,
  onSubmit,
}: TextRowProps) {
  return (
    <View style={styles.fieldRow}>
      <Text variant="caption" style={styles.muted}>
        {label}
      </Text>
      <TextInput
        aria-label={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.onSurfaceVariant}
        selectionColor={color.primary}
        multiline={multiline}
        keyboardType={keyboardType as KeyboardTypeOptions | undefined}
        autoCapitalize={autoCapitalize}
        textContentType={textContentType as TextInputProps['textContentType']}
        maxLength={maxLength}
        onSubmitEditing={onSubmit}
        style={[styles.input, multiline && styles.multiline]}
      />
      {error ? (
        <Text variant="caption" role="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function PickerRow<T extends string | number>({
  title,
  value,
  options,
  onChange,
  icon,
  style = 'menu',
}: PickerRowProps<T>) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value)?.label ?? '';
  if (style === 'segmented') {
    return (
      <View style={styles.fieldRow}>
        <Text variant="caption" style={styles.muted}>
          {title}
        </Text>
        <View role="radiogroup" aria-label={title} style={styles.segments}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <Pressable
                key={String(option.value)}
                role="radio"
                aria-checked={selected}
                onPress={() => onChange(option.value)}
                style={[styles.segment, selected && styles.segmentSelected]}
              >
                <Text
                  variant="caption"
                  style={selected ? styles.segmentSelectedText : styles.muted}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }
  return (
    <View>
      <ListRow title={title} icon={icon} value={current} onPress={() => setOpen((o) => !o)} />
      {open ? (
        <View role="radiogroup" aria-label={title}>
          {options.map((option) => (
            <ListRow
              key={String(option.value)}
              title={option.label}
              checked={option.value === value}
              chevron={false}
              onPress={() => {
                setOpen(false);
                onChange(option.value);
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Android and the web: a plain field in ISO form (`YYYY-MM-DD`, `HH:MM`), which the web turns into
 * the browser's own date and time inputs (`*.web.tsx` can refine). A system date dialog on Android
 * is a Phase 4 polish item.
 */
export function DateRow({
  title,
  value,
  onChange,
  mode = 'date',
  placeholder,
  onClear,
  clearLabel,
}: DateRowProps) {
  const format = mode === 'date' ? isoDate : isoTime;
  const [draft, setDraft] = useState(value ? format(value) : '');
  const commit = (text: string) => {
    setDraft(text);
    const match =
      mode === 'date' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(text) : /^(\d{1,2}):(\d{2})$/.exec(text);
    if (!match) return;
    const next = value ? new Date(value) : new Date();
    if (mode === 'date') next.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    else next.setHours(Number(match[1]), Number(match[2]), 0, 0);
    if (!Number.isNaN(next.getTime())) onChange(next);
  };
  return (
    <View style={styles.fieldRow}>
      <Text variant="caption" style={styles.muted}>
        {title}
      </Text>
      <View style={styles.dateLine}>
        <TextInput
          aria-label={title}
          value={draft}
          placeholder={placeholder ?? (mode === 'date' ? 'YYYY-MM-DD' : 'HH:MM')}
          placeholderTextColor={color.onSurfaceVariant}
          onChangeText={commit}
          inputMode="numeric"
          style={[styles.input, styles.dateInput]}
        />
        {value && onClear ? (
          <Pressable
            role="button"
            aria-label={clearLabel}
            onPress={() => {
              setDraft('');
              onClear();
            }}
          >
            <Icon name="close" color={color.onSurfaceVariant} size={20} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function StepperRow({
  title,
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  format,
}: StepperRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.title}>{title}</Text>
        <Text variant="caption" style={styles.muted}>
          {format ? format(value) : String(value)}
        </Text>
      </View>
      <View style={styles.stepper}>
        <Pressable
          role="button"
          aria-label={`${title} −`}
          disabled={value - step < min}
          onPress={() => onChange(Math.max(min, value - step))}
          style={styles.stepperButton}
        >
          <Text style={styles.title}>−</Text>
        </Pressable>
        <Pressable
          role="button"
          aria-label={`${title} +`}
          disabled={value + step > max}
          onPress={() => onChange(Math.min(max, value + step))}
          style={styles.stepperButton}
        >
          <Text style={styles.title}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** App-drawn content inside a section (a profile chart, the attachments strip). */
export function ContentRow({ children, accessibilityLabel }: ContentRowProps) {
  return (
    <View style={styles.content} aria-label={accessibilityLabel}>
      {children}
    </View>
  );
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={48} color={color.onSurfaceVariant} />
      <Text variant="title" role="heading" level={2} style={styles.emptyTitle}>
        {title}
      </Text>
      {description ? <Text style={[styles.muted, styles.center]}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable role="button" onPress={onAction} style={styles.emptyAction}>
          <Text variant="label" style={styles.emptyActionText}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: color.surface },
  listContent: { padding: space.md, gap: space.lg, paddingBottom: space.xxxl },
  section: { gap: space.xs },
  sectionTitle: { color: color.onSurfaceVariant, paddingHorizontal: space.md },
  card: { backgroundColor: color.background, borderRadius: radius.md, overflow: 'hidden' },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.divider },
  footer: { color: color.onSurfaceVariant, paddingHorizontal: space.md },
  row: {
    minHeight: size.touch + space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  rowText: { flex: 1, gap: 2 },
  title: { ...typeScale.body, color: color.onSurface },
  muted: { color: color.onSurfaceVariant },
  track: {
    height: 4,
    marginTop: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: color.neutralContainer,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: color.primary },
  accessory: { padding: space.xxs },
  destructive: { color: color.error },
  pressed: { backgroundColor: color.neutralContainer },
  disabled: { opacity: 0.38 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    backgroundColor: color.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: color.onContrast, lineHeight: 18 },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.divider },
  action: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
  },
  fieldRow: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.xxs },
  input: {
    ...fieldType.body,
    color: color.onSurface,
    minHeight: size.touch - space.xs,
    paddingVertical: space.xs,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  error: { color: color.error },
  segments: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.outlineVariant,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
  },
  segmentSelected: { backgroundColor: color.secondaryContainer },
  segmentSelectedText: { color: color.onSecondaryContainer },
  dateLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dateInput: { flex: 1 },
  stepper: { flexDirection: 'row', gap: space.xs },
  stepperButton: {
    width: 44,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: color.neutralContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: space.md },
  empty: { alignItems: 'center', gap: space.sm, padding: space.xxl },
  emptyTitle: { textAlign: 'center' },
  center: { textAlign: 'center' },
  emptyAction: {
    marginTop: space.sm,
    minHeight: size.touch,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyActionText: { color: color.onFab },
});
