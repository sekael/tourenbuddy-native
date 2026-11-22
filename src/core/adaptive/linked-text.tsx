import { StyleSheet } from 'react-native';

import { color } from '@/core/theme/tokens';

import { Text, type TextProps } from './text';

const MARK = '\u0001';

/** A placeholder value for `t()`, replaced by the link of that id: `t(key, { terms: linkMark('terms') })`. */
export const linkMark = (id: string) => `${MARK}${id}${MARK}`;

/**
 * A sentence with inline links: the catalog keeps the whole sentence with `{{placeholders}}`, so each
 * language orders it its own way, and each placeholder becomes a tappable word.
 */
export function LinkedText({
  text,
  links,
  ...props
}: TextProps & { text: string; links: Record<string, { label: string; onPress: () => void }> }) {
  return (
    <Text {...props}>
      {text.split(MARK).map((part, i) => {
        const link = i % 2 ? links[part] : undefined;
        return link ? (
          <Text key={i} role="link" style={styles.link} onPress={link.onPress}>
            {link.label}
          </Text>
        ) : (
          part
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({ link: { color: color.primary } });
