import { router } from 'expo-router';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';

// S1: content inside the sheet stays opaque (no glass on glass); the sheet itself is the glass surface.
export default function TourSheet() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title} accessibilityRole="header">Pigne d'Arolla</Text>
      <Text style={styles.meta}>Ski tour · 3796 m · 1450 m ascent</Text>
      {['Planned for', 'Partners', 'Notes', 'GPX', 'Attachments'].map(row => (
        <View key={row} style={styles.row}>
          <Text style={styles.rowLabel}>{row}</Text>
          <Text style={styles.rowValue}>…</Text>
        </View>
      ))}
      <Button title="Close" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: '600' },
  meta: { fontSize: 15, color: '#4b5563' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  rowLabel: { fontSize: 16 },
  rowValue: { fontSize: 16, color: '#6b7280' },
});
