import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/core/adaptive/text';
import { color, space } from '@/core/theme/tokens';

type PlaceholderScreenProps = {
  title: string;
  subtitle: string;
  tint?: string;
  children?: ReactNode;
};

/** Stands in for a tab's screen until its feature is ported. */
export function PlaceholderScreen({
  title,
  subtitle,
  tint = color.background,
  children,
}: PlaceholderScreenProps) {
  return (
    <View style={[styles.screen, { backgroundColor: tint }]}>
      <Text variant="title" role="heading">
        {title}
      </Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xs },
  subtitle: { color: color.onSurfaceVariant },
});
