import {
  Button,
  Divider,
  GlassEffectContainer,
  HStack,
  Host,
  Image,
  Label,
} from '@expo/ui/swift-ui';
import {
  accessibilityHint,
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
  font,
  frame,
  glassEffect,
  labelStyle,
  padding,
} from '@expo/ui/swift-ui/modifiers';

import { color, size, space } from '@/core/theme/tokens';

import { icons, type IconName } from './icons';
import type { CapsuleItem } from './map-controls';

export type { CapsuleItem } from './map-controls';

/**
 * Liquid Glass over the map (D6): one interactive glass capsule holding its actions, the shape
 * Apple Maps uses for grouped controls, and the FAB-sized glass circle of Phase 1's menu. Real
 * system glass samples the map, follows Reduce Transparency and the glass intensity setting.
 */
export function GlassCapsule({ items, label }: { items: CapsuleItem[]; label: string }) {
  return (
    <Host matchContents>
      <GlassEffectContainer>
        <HStack
          spacing={0}
          modifiers={[
            glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'capsule' }),
            accessibilityLabel(label),
          ]}
        >
          {items.map((item, index) => [
            index > 0 ? (
              <Divider key={`${item.id}-divider`} modifiers={[frame({ height: 24 })]} />
            ) : null,
            <Button
              key={item.id}
              onPress={item.onPress}
              modifiers={[
                buttonStyle('plain'),
                controlSize('large'),
                frame({ minWidth: size.menu, minHeight: size.menu }),
                accessibilityLabel(item.label),
                ...(item.hint ? [accessibilityHint(item.hint)] : []),
                ...(item.disabled ? [disabledModifier(true)] : []),
              ]}
            >
              <Label
                title={item.label}
                systemImage={icons[item.icon].sf}
                color={color.onSurface}
                modifiers={[labelStyle(item.iconOnly ? 'iconOnly' : 'titleAndIcon')]}
              />
            </Button>,
          ])}
        </HStack>
      </GlassEffectContainer>
    </Host>
  );
}

export function GlassCircleButton({
  label,
  hint,
  icon,
  onPress,
}: {
  label: string;
  hint?: string;
  icon: IconName;
  onPress: () => void;
}) {
  return (
    <Host matchContents>
      <Button
        onPress={onPress}
        modifiers={[
          buttonStyle('glass'),
          buttonBorderShape('circle'),
          frame({ width: size.menu, height: size.menu }),
          accessibilityLabel(label),
          ...(hint ? [accessibilityHint(hint)] : []),
        ]}
      >
        <Image
          systemName={icons[icon].sf}
          size={size.icon}
          color={color.onSurface}
          modifiers={[frame({ maxWidth: size.menu, maxHeight: size.menu })]}
        />
      </Button>
    </Host>
  );
}

/** A status capsule over the app (offline, syncing): glass, a button only when it leads somewhere. */
export function GlassStatus({
  label,
  icon,
  onPress,
  warning = false,
}: {
  label: string;
  icon: IconName;
  onPress?: () => void;
  warning?: boolean;
}) {
  const content = (
    <Label
      title={label}
      systemImage={icons[icon].sf}
      color={warning ? color.error : color.onSurface}
      modifiers={[font({ textStyle: 'footnote', weight: 'semibold' })]}
    />
  );
  return (
    <Host matchContents>
      {onPress ? (
        <Button
          onPress={onPress}
          modifiers={[
            buttonStyle('glass'),
            buttonBorderShape('capsule'),
            controlSize('small'),
            accessibilityLabel(label),
          ]}
        >
          {content}
        </Button>
      ) : (
        <HStack
          modifiers={[
            padding({ horizontal: space.sm, vertical: space.xs - 2 }),
            glassEffect({ glass: { variant: 'regular' }, shape: 'capsule' }),
            accessibilityLabel(label),
          ]}
        >
          {content}
        </HStack>
      )}
    </Host>
  );
}
