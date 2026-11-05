import { NativeTabs } from 'expo-router/native-tabs';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

// Stand-in for today's tour-action-bar, rendered as the tab bar's bottom accessory (system glass).
// Rendered twice by the system (regular + inline), so it holds no state.
export function TourActionBar() {
  const inline = NativeTabs.BottomAccessory.usePlacement() === 'inline';
  return (
    <View style={styles.bar}>
      {!inline && <Text style={styles.title} numberOfLines={1}>Pigne d'Arolla</Text>}
      <Action icon="pencil" label="Edit" />
      <Action icon="square.and.arrow.up" label="Share" />
      <Action icon="checkmark.circle" label="Done" />
    </View>
  );
}

function Action({ icon, label }: { icon: SFSymbol, label: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} style={styles.action}>
      <SymbolView name={icon} size={20} tintColor="#1f2937" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: '600' },
  action: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
