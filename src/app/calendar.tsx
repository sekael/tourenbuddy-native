import { StyleSheet, Text, View } from 'react-native';

// Placeholder so the tab bar has a second tab; not part of any spike.
export default function Calendar() {
  return (
    <View style={styles.center}>
      <Text>Calendar</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
