import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/core/adaptive/icon';
import type { IconName } from '@/core/adaptive/icons';
import { color, radius, size, space } from '@/core/theme/tokens';

type Action = { onPress: () => void; disabled: boolean };

/**
 * Undo, redo and delete for a line being shaped (track-drawing "Undo, redo and delete in every
 * drawing step"), side by side at the sheet's top as in the swisstopo app: in reach at every
 * height, apart from the bar's Back, which leaves the step.
 */
export function EditActions({
  undo,
  redo,
  remove,
}: {
  undo: Action;
  redo: Action;
  remove: Action;
}) {
  const { t } = useTranslation();
  const buttons: { icon: IconName; label: string; action: Action }[] = [
    { icon: 'undo', label: t('map.draw.undo'), action: undo },
    { icon: 'redo', label: t('map.draw.redo'), action: redo },
    { icon: 'delete', label: t('map.draw.delete'), action: remove },
  ];
  return (
    <View style={styles.row}>
      {buttons.map(({ icon, label, action }) => (
        <Pressable
          key={icon}
          role="button"
          aria-label={label}
          aria-disabled={action.disabled}
          disabled={action.disabled}
          onPress={action.onPress}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Icon
            name={icon}
            size={24}
            color={action.disabled ? color.onSurfaceVariant : color.primary}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: space.lg },
  button: {
    width: size.touch,
    height: size.touch,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: color.surfaceVariant },
});
