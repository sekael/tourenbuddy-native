import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

// Placeholder until add-adaptive-ui and add-auth-session replace it.
export default function ShellScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        TourenBuddy
      </Text>
      <Text style={styles.tagline}>{t('shell.tagline')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
    backgroundColor: '#ffffff',
  },
  title: { fontSize: 34, fontWeight: '700', color: '#0f172a' },
  tagline: { fontSize: 17, color: '#475569', textAlign: 'center' },
});
