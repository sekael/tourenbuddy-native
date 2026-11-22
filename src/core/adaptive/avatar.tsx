import { StyleSheet, View } from 'react-native';

import { color, size } from '@/core/theme/tokens';

import { Text } from './text';

/** A round brand badge with a person's initial, beside who they are (as Settings shows one). */
export function Avatar({ letters }: { letters: string }) {
  return (
    <View style={styles.avatar} aria-hidden>
      <Text variant="title" style={styles.letters} maxFontSizeMultiplier={1.3}>
        {letters}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: size.avatar,
    height: size.avatar,
    borderRadius: size.avatar / 2,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letters: { color: color.onPrimary },
});
