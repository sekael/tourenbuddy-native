import { Stack } from 'expo-router';

export default function MapLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerTransparent: true, title: '' }} />
      {/* S1: sheet with detents over the map; map stays interactive up to the middle detent. */}
      <Stack.Screen
        name="tour"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.25, 0.5, 1],
          sheetInitialDetentIndex: 1,
          sheetGrabberVisible: true,
          sheetLargestUndimmedDetentIndex: 1,
          headerShown: false,
        }}
      />
    </Stack>
  );
}
