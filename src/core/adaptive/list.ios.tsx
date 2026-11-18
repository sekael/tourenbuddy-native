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
  ProgressView,
  RNHostView,
  Section,
  Spacer,
  Stepper,
  Slider,
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
  accessibilityValue,
  autocorrectionDisabled,
  buttonStyle,
  datePickerStyle,
  disabled as disabledModifier,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  keyboardType as keyboardTypeModifier,
  labelStyle,
  listRowBackground,
  listSectionMargins,
  listSectionSpacing,
  listStyle,
  lineLimit,
  monospacedDigit,
  onSubmit as onSubmitModifier,
  pickerStyle,
  refreshable,
  tag,
  textContentType as textContentTypeModifier,
  textInputAutocapitalization,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import {
  Children,
  isValidElement,
  useContext,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { color, space } from '@/core/theme/tokens';

import { Avatar } from './avatar';
import { Icon } from './icon';
import { icons, type IconName } from './icons';
import { InSwiftUIList } from './in-list';
import { PageFit } from './page-fit';
import { Segments } from './segments';
import { Text } from './text';
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
  SliderRowProps,
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
/** iOS's first accessibility text size (AX1) as React Native's font scale; the larger ones beyond. */
const ACCESSIBILITY_SCALE = 1.7;

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
  const fit = useContext(PageFit);
  const rows = Children.toArray(children).filter(isValidElement);
  if (rows.length === 0) return null;
  return (
    <Section
      // In a sheet as tall as its page, the sections sit close under the bar and to each other.
      modifiers={fit ? [listSectionMargins({ edges: 'vertical', length: space.xs })] : undefined}
      // SwiftUI builds a section with and without a footer (or title) as different views, so its
      // rows are made anew when one comes or goes; the rows' app-drawn icons are remounted with
      // them, or they stay blank.
      key={`${title ? 'title' : ''}-${footer ? 'footer' : ''}`}
      title={title}
      footer={footer ? <SwiftText modifiers={[secondary]}>{footer}</SwiftText> : undefined}
    >
      {rows}
    </Section>
  );
}

function actionButtons(actions: RowAction[], { swipe = false } = {}) {
  return actions.map((action) => (
    <Button
      key={action.label}
      label={action.label}
      systemImage={action.icon ? icons[action.icon].sf : undefined}
      // A destructive swipe button makes SwiftUI take the row out at once, while the app first
      // asks and removes it later: the list's rows no longer add up and the app quits. A swipe
      // shows red by its tint alone; menus keep the role.
      role={action.destructive && !swipe ? 'destructive' : undefined}
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
  progress,
  icon,
  iconColor,
  avatar,
  onPress,
  chevron,
  destructive,
  badge: count,
  checked,
  disabled,
  swipeActions,
  leadingSwipeActions,
  contextActions,
  menu,
  accessory,
  accessibilityLabel,
}: ListRowProps) {
  const { fontScale } = useWindowDimensions();
  // At the accessibility text sizes a value beside the title leaves neither room (Kalen-der-Sy…):
  // it goes under the title instead, as Settings does.
  const stacked = !!value && fontScale >= ACCESSIBILITY_SCALE;
  const showChevron = chevron ?? (!!onPress && !destructive && !menu);
  // A button in a list paints its label in the tint; only a plain action ("Rundtour") keeps it.
  // A row that opens something or is one of a choice reads in the label colour, as in Settings.
  const action = !!onPress && !showChevron && checked === undefined;
  const label = (
    <HStack spacing={12} modifiers={action ? undefined : [foregroundStyle('primary')]}>
      {avatar ? (
        <RNHostView matchContents>
          <View pointerEvents="none">
            <Avatar letters={avatar} />
          </View>
        </RNHostView>
      ) : icon ? (
        <RowIcon name={icon} tint={iconColor ?? (destructive ? color.error : color.primary)} />
      ) : null}
      <VStack alignment="leading" spacing={2}>
        <SwiftText
          modifiers={[
            foregroundStyle(destructive ? color.error : { type: 'hierarchical', style: 'primary' }),
            // Two lines keep a list even; at the accessibility sizes a title wraps in full.
            fontScale >= ACCESSIBILITY_SCALE ? wraps : lineLimit(2),
          ]}
        >
          {title}
        </SwiftText>
        {subtitle ? (
          <SwiftText modifiers={[font({ textStyle: 'subheadline' }), secondary, wraps]}>
            {subtitle}
          </SwiftText>
        ) : null}
        {stacked ? <SwiftText modifiers={[secondary, wraps]}>{value}</SwiftText> : null}
        {progress !== undefined ? (
          <ProgressView value={Math.min(Math.max(progress, 0), 1)} />
        ) : null}
      </VStack>
      <Spacer />
      {value && !stacked ? (
        <SwiftText modifiers={[secondary, lineLimit(1)]}>{value}</SwiftText>
      ) : null}
      {/* A count as Settings shows one, before the chevron: text in the row, not SwiftUI's badge,
          a modifier that comes and goes with the count. */}
      {count ? <SwiftText modifiers={[secondary, lineLimit(1)]}>{count}</SwiftText> : null}
      {checked ? <Image systemName="checkmark" size={15} color={color.primary} /> : null}
      {showChevron ? (
        <Image
          systemName="chevron.forward"
          size={13}
          modifiers={[tertiary, font({ weight: 'semibold' })]}
        />
      ) : null}
      {accessory?.icon ? (
        // Borderless, so only the symbol takes the tap, as an App Store download's stop.
        <Button
          label={accessory.label}
          systemImage={icons[accessory.icon].sf}
          onPress={accessory.onPress}
          role={accessory.destructive ? 'destructive' : undefined}
          modifiers={[
            buttonStyle('borderless'),
            labelStyle('iconOnly'),
            font({ size: accessory.destructive ? 20 : 26 }),
            // In the brand colour, as the App Store's stop (red when it deletes): the row's label
            // colour would win a tint.
            foregroundStyle(accessory.destructive ? color.error : color.primary),
          ]}
        />
      ) : null}
    </HStack>
  );

  const modifiers = [
    // Always there, only its value changes: a modifier that comes and goes rebuilds the row, and
    // its app-drawn icon with it stays blank (a contact's delete row while a number saves).
    disabledModifier(!!disabled),
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
            {actionButtons(leadingSwipeActions, { swipe: true })}
          </SwipeActions.Actions>
        ) : null}
        {swipeActions?.length ? (
          <SwipeActions.Actions edge="trailing">
            {actionButtons(swipeActions, { swipe: true })}
          </SwipeActions.Actions>
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
      modifiers={[tint(color.primary), disabledModifier(!!disabled)]}
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
  iconColor,
  style = 'menu',
}: PickerRowProps<T>) {
  if (style === 'segmented' && icon) {
    // Headed by its glyph and title, in line with the rows' own; the parts are the app's, since
    // the system's segmented control can't grey out one part.
    return (
      <ContentRow>
        <View style={styles.choice}>
          <View style={styles.choiceHead}>
            <View style={styles.choiceIcon}>
              <Icon name={icon} size={ROW_ICON} color={iconColor ?? color.primary} />
            </View>
            <Text numberOfLines={1}>{title}</Text>
          </View>
          <Segments label={title} options={options} value={value} onChange={onChange} />
        </View>
      </ContentRow>
    );
  }
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
  // SwiftUI's Stepper here counts in whole numbers: count in steps, so 0.5–1.5 by 0.1 works.
  const steps = (n: number) => Math.round(n / step);
  return (
    <Stepper
      label={format ? `${title}: ${format(value)}` : `${title}: ${value}`}
      value={steps(value)}
      step={1}
      min={min === undefined ? undefined : steps(min)}
      max={max === undefined ? undefined : steps(max)}
      onValueChange={(n) => onChange(Number((n * step).toFixed(6)))}
      // VoiceOver reads the value as shown ("1.1×"), not the count of steps.
      modifiers={[accessibilityValue(format ? format(value) : String(value))]}
    />
  );
}

/**
 * A value along a range, as Settings' brightness: the title and the value on top, the system's
 * slider between the slow and the fast end's icons below. It saves when the finger lifts, not on
 * every step of a drag.
 */
export function SliderRow({
  title,
  icon,
  value,
  onChange,
  min = 0,
  max = 1,
  step,
  format,
  minIcon,
  maxIcon,
}: SliderRowProps) {
  const [dragging, setDragging] = useState(false);
  const draft = useRef(value);
  const [shownDraft, setShownDraft] = useState(value);
  const shown = dragging ? shownDraft : value;
  const label = format ? format(shown) : String(shown);
  return (
    <VStack alignment="leading" spacing={space.sm}>
      <HStack spacing={12}>
        {icon ? <RowIcon name={icon} tint={color.primary} /> : null}
        <SwiftText modifiers={[wraps]}>{title}</SwiftText>
        <Spacer />
        <SwiftText modifiers={[secondary, monospacedDigit()]}>{label}</SwiftText>
      </HStack>
      <Slider
        value={shown}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => {
          draft.current = next;
          setShownDraft(next);
        }}
        onEditingChanged={(editing) => {
          setDragging(editing);
          if (!editing && draft.current !== value) onChange(draft.current);
        }}
        minimumValueLabel={<Image systemName={icons[minIcon].sf} modifiers={[secondary]} />}
        maximumValueLabel={<Image systemName={icons[maxIcon].sf} modifiers={[secondary]} />}
        modifiers={[tint(color.primary), a11yLabel(title), accessibilityValue(label)]}
      />
    </VStack>
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
  choice: { gap: space.sm, paddingVertical: space.xxs },
  // The icon column and gap of a SwiftUI row (`iconFrame`, spacing 12), so titles line up.
  choiceHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  choiceIcon: { width: 28, alignItems: 'center' },
});
