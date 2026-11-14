import {
  Button,
  ContextMenu,
  DatePicker,
  Form,
  Host,
  HStack,
  Image,
  List,
  Menu,
  Picker,
  RNHostView,
  Section,
  Spacer,
  Stepper,
  SwipeActions,
  Text as SwiftText,
  TextField,
  Toggle,
  VStack,
  ZStack,
  ContentUnavailableView,
} from '@expo/ui/swift-ui';
import {
  accessibilityHidden,
  accessibilityLabel as a11yLabel,
  autocorrectionDisabled,
  badge,
  datePickerStyle,
  disabled as disabledModifier,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  keyboardType as keyboardTypeModifier,
  listRowBackground,
  listSectionSpacing,
  listStyle,
  lineLimit,
  onSubmit as onSubmitModifier,
  pickerStyle,
  refreshable,
  tag,
  textContentType as textContentTypeModifier,
  textInputAutocapitalization,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Children, isValidElement, useContext, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { color } from '@/core/theme/tokens';

import { Icon } from './icon';
import { icons, type IconName } from './icons';
import { InSwiftUIList } from './in-list';
import { useFieldText } from './use-field-text';
import type {
  ContentRowProps,
  DateRowProps,
  EmptyStateProps,
  GroupedListProps,
  ListRowProps,
  ListSectionProps,
  PickerRowProps,
  RowAction,
  StepperRowProps,
  TextRowProps,
  ToggleRowProps,
} from './list';

/**
 * Grouped lists and forms on iOS (adaptive-lists-forms, D5): one SwiftUI `List` (inset grouped) or
 * `Form` per screen, rows built from system views, so separators, row heights, swipe actions,
 * context menus, Dynamic Type, haptics and VoiceOver are the system's own.
 */
const secondary = foregroundStyle({ type: 'hierarchical', style: 'secondary' });
const tertiary = foregroundStyle({ type: 'hierarchical', style: 'tertiary' });
// Symbols differ in width; a fixed column keeps every row's text on one left edge, as in Settings.
const iconFrame = frame({ width: 28 });
// A second line wraps in full: beside a switch, SwiftUI would rather cut it with "…".
const wraps = fixedSize({ horizontal: false, vertical: true });
const ROW_ICON = 22;

/**
 * A row's icon: the app's own glyph set (the PWA's Material Symbols), drawn by React Native inside
 * the SwiftUI row, so rows wear the same icons as the rest of the app. System-drawn menus keep
 * their SF Symbols.
 */
function RowIcon({ name, tint: tintColor }: { name: IconName; tint: string }) {
  return (
    <ZStack modifiers={[iconFrame]}>
      <RNHostView matchContents>
        <View style={styles.rowIcon}>
          <Icon name={name} size={ROW_ICON} color={tintColor} />
        </View>
      </RNHostView>
    </ZStack>
  );
}

export function GroupedList({ children, form, onRefresh, header, testID }: GroupedListProps) {
  const Container = form ? Form : List;
  const modifiers = [
    ...(form ? [] : [listStyle('insetGrouped')]),
    listSectionSpacing('compact'),
    ...(onRefresh ? [refreshable(onRefresh)] : []),
    tint(color.primary),
  ];
  return (
    <Host style={styles.host} testID={testID}>
      <Container modifiers={modifiers}>
        {header ? (
          <Section>
            <RNHostView matchContents={{ vertical: true }}>
              <View>{header}</View>
            </RNHostView>
          </Section>
        ) : null}
        <InSwiftUIList.Provider value>{children}</InSwiftUIList.Provider>
      </Container>
    </Host>
  );
}

export function ListSection({ title, footer, children }: ListSectionProps) {
  const rows = Children.toArray(children).filter(isValidElement);
  if (rows.length === 0) return null;
  return (
    <Section
      title={title}
      footer={footer ? <SwiftText modifiers={[secondary]}>{footer}</SwiftText> : undefined}
    >
      {rows}
    </Section>
  );
}

function actionButtons(actions: RowAction[]) {
  return actions.map((action) => (
    <Button
      key={action.label}
      label={action.label}
      systemImage={action.icon ? icons[action.icon].sf : undefined}
      role={action.destructive ? 'destructive' : undefined}
      // The list's tint would paint a destructive swipe blue: it is red, as in Mail.
      modifiers={action.destructive ? [tint(color.error)] : undefined}
      onPress={action.onPress}
    />
  ));
}

export function ListRow({
  title,
  subtitle,
  value,
  icon,
  iconColor,
  onPress,
  chevron,
  destructive,
  badge: badgeValue,
  checked,
  disabled,
  swipeActions,
  leadingSwipeActions,
  contextActions,
  menu,
  accessibilityLabel,
}: ListRowProps) {
  const showChevron = chevron ?? (!!onPress && !destructive && !menu);
  // A button in a list paints its label in the tint; only a plain action ("Rundtour") keeps it.
  // A row that opens something or is one of a choice reads in the label colour, as in Settings.
  const action = !!onPress && !showChevron && checked === undefined;
  const label = (
    <HStack spacing={12} modifiers={action ? undefined : [foregroundStyle('primary')]}>
      {icon ? <RowIcon name={icon} tint={iconColor ?? color.primary} /> : null}
      <VStack alignment="leading" spacing={2}>
        <SwiftText
          modifiers={[
            foregroundStyle(destructive ? color.error : { type: 'hierarchical', style: 'primary' }),
            lineLimit(2),
          ]}
        >
          {title}
        </SwiftText>
        {subtitle ? (
          <SwiftText modifiers={[font({ textStyle: 'subheadline' }), secondary, wraps]}>
            {subtitle}
          </SwiftText>
        ) : null}
      </VStack>
      <Spacer />
      {value ? <SwiftText modifiers={[secondary, lineLimit(1)]}>{value}</SwiftText> : null}
      {checked ? <Image systemName="checkmark" size={15} color={color.primary} /> : null}
      {showChevron ? (
        <Image
          systemName="chevron.forward"
          size={13}
          modifiers={[tertiary, font({ weight: 'semibold' })]}
        />
      ) : null}
    </HStack>
  );

  const modifiers = [
    ...(badgeValue !== undefined && badgeValue !== '' && badgeValue !== 0
      ? [badge(String(badgeValue))]
      : []),
    ...(disabled ? [disabledModifier(true)] : []),
    ...(accessibilityLabel ? [a11yLabel(accessibilityLabel)] : []),
  ];

  let row: ReactElement = menu?.length ? (
    <Menu label={label} modifiers={modifiers}>
      {actionButtons(menu)}
    </Menu>
  ) : onPress ? (
    <Button onPress={onPress} role={destructive ? 'destructive' : undefined} modifiers={modifiers}>
      {label}
    </Button>
  ) : (
    <HStack modifiers={modifiers}>{label}</HStack>
  );

  if (contextActions?.length) {
    row = (
      <ContextMenu>
        <ContextMenu.Trigger>{row}</ContextMenu.Trigger>
        <ContextMenu.Items>{actionButtons(contextActions)}</ContextMenu.Items>
      </ContextMenu>
    );
  }
  if (swipeActions?.length || leadingSwipeActions?.length) {
    row = (
      <SwipeActions>
        {row}
        {leadingSwipeActions?.length ? (
          <SwipeActions.Actions edge="leading">
            {actionButtons(leadingSwipeActions)}
          </SwipeActions.Actions>
        ) : null}
        {swipeActions?.length ? (
          <SwipeActions.Actions edge="trailing">{actionButtons(swipeActions)}</SwipeActions.Actions>
        ) : null}
      </SwipeActions>
    );
  }
  return row;
}

export function ToggleRow({
  title,
  subtitle,
  icon,
  value,
  onValueChange,
  disabled,
}: ToggleRowProps) {
  // The icon sits beside the switch, not in its label: the system draws a toggle's label itself,
  // where an app-drawn view does not show.
  const toggle = (
    <Toggle
      isOn={value}
      onIsOnChange={onValueChange}
      modifiers={[tint(color.primary), ...(disabled ? [disabledModifier(true)] : [])]}
    >
      <VStack alignment="leading" spacing={2}>
        <SwiftText modifiers={[wraps]}>{title}</SwiftText>
        {subtitle ? (
          <SwiftText modifiers={[font({ textStyle: 'subheadline' }), secondary, wraps]}>
            {subtitle}
          </SwiftText>
        ) : null}
      </VStack>
    </Toggle>
  );
  if (!icon) return toggle;
  return (
    <HStack spacing={12}>
      <RowIcon name={icon} tint={color.primary} />
      {toggle}
    </HStack>
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
  const { text, onTextChange } = useFieldText(value, onChangeText);

  const modifiers = [
    ...(keyboardType ? [keyboardTypeModifier(keyboardType)] : []),
    ...(autoCapitalize
      ? [textInputAutocapitalization(autoCapitalize === 'none' ? 'never' : autoCapitalize)]
      : []),
    ...(textContentType ? [textContentTypeModifier(textContentType)] : []),
    ...(keyboardType === 'email-address' || keyboardType === 'url'
      ? [autocorrectionDisabled()]
      : []),
    ...(onSubmit ? [onSubmitModifier(onSubmit)] : []),
    a11yLabel(label),
  ];

  return (
    // The name stays above the field once it is filled (a bare "1649" says nothing); VoiceOver
    // reads it from the field.
    <VStack alignment="leading" spacing={2}>
      <SwiftText
        modifiers={[
          font({ textStyle: 'caption' }),
          foregroundStyle(color.onSurfaceVariant),
          accessibilityHidden(true),
        ]}
      >
        {label}
      </SwiftText>
      <TextField
        text={text}
        placeholder={placeholder ?? label}
        axis={multiline ? 'vertical' : 'horizontal'}
        maxLength={maxLength}
        onTextChange={onTextChange}
        modifiers={modifiers}
      />
      {error ? (
        <SwiftText modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(color.error)]}>
          {error}
        </SwiftText>
      ) : null}
    </VStack>
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
  return (
    <Picker
      label={title}
      systemImage={icon ? icons[icon].sf : undefined}
      selection={value}
      onSelectionChange={(next) => onChange(next as T)}
      modifiers={[pickerStyle(style), tint(color.primary)]}
    >
      {options.map((option) => (
        <SwiftText key={String(option.value)} modifiers={[tag(option.value)]}>
          {option.label}
        </SwiftText>
      ))}
    </Picker>
  );
}

export function DateRow({
  title,
  value,
  onChange,
  mode = 'date',
  minimumDate,
  placeholder,
  onClear,
  clearLabel,
}: DateRowProps) {
  if (!value) {
    return (
      <Button onPress={() => onChange(minimumDate ?? new Date())}>
        <HStack>
          <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: 'primary' })]}>
            {title}
          </SwiftText>
          <Spacer />
          <SwiftText modifiers={[secondary]}>{placeholder ?? ''}</SwiftText>
        </HStack>
      </Button>
    );
  }
  const picker = (
    <DatePicker
      title={title}
      selection={value}
      range={minimumDate ? { start: minimumDate } : undefined}
      displayedComponents={[mode === 'date' ? 'date' : 'hourAndMinute']}
      onDateChange={onChange}
      modifiers={[datePickerStyle('compact'), tint(color.primary)]}
    />
  );
  if (!onClear) return picker;
  return (
    <SwipeActions>
      {picker}
      <SwipeActions.Actions edge="trailing">
        <Button label={clearLabel} systemImage="xmark" role="destructive" onPress={onClear} />
      </SwipeActions.Actions>
    </SwipeActions>
  );
}

export function StepperRow({
  title,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
}: StepperRowProps) {
  return (
    <Stepper
      label={format ? `${title}: ${format(value)}` : `${title}: ${value}`}
      value={value}
      step={step}
      min={min}
      max={max}
      onValueChange={onChange}
    />
  );
}

/** App-drawn content inside a section: React Native inside the SwiftUI row. */
export function ContentRow({ children, accessibilityLabel }: ContentRowProps) {
  return (
    <RNHostView matchContents={{ vertical: true }}>
      <View accessibilityLabel={accessibilityLabel}>{children as ReactNode}</View>
    </RNHostView>
  );
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  const inList = useContext(InSwiftUIList);
  const view = (
    <ContentUnavailableView
      title={title}
      systemImage={icons[icon].sf}
      description={description}
      actions={
        actionLabel && onAction ? (
          <Button label={actionLabel} onPress={onAction} modifiers={[tint(color.primary)]} />
        ) : undefined
      }
      // In a list it is a row of its own, on the list's background rather than a card.
      modifiers={inList ? [listRowBackground('clear')] : undefined}
    />
  );
  return inList ? view : <Host style={styles.host}>{view}</Host>;
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  rowIcon: { width: ROW_ICON, height: ROW_ICON },
});
