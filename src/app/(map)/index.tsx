import { Camera, type CameraRef, Map, type MapRef } from '@maplibre/maplibre-react-native';
import { GlassContainer, GlassView } from 'expo-glass-effect';
import { router, Stack } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Aerial imagery is the hardest case for "does glass sample the map", so it is in the cycle.
const STYLES = ['basemap', 'imagerybasemap', 'lightbasemap'].map(
  name => `https://vectortiles.geo.admin.ch/styles/ch.swisstopo.${name}.vt/style.json`,
);
const ZERMATT = { center: [7.75, 46.02] as [number, number], zoom: 11 };

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const [styleIndex, setStyleIndex] = useState(0);

  async function zoomBy(delta: number) {
    const map = mapRef.current;
    if (!map) return;
    const [center, zoom] = await Promise.all([map.getCenter(), map.getZoom()]);
    cameraRef.current?.easeTo({ center, zoom: zoom + delta, duration: 250 });
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <Map ref={mapRef} style={StyleSheet.absoluteFill} mapStyle={STYLES[styleIndex]}>
        <Camera ref={cameraRef} initialViewState={ZERMATT} />
      </Map>

      {/* ponytail: header glass items are iOS-only here; Android chrome is S2 (Material, not SF Symbols). */}
      {process.env.EXPO_OS === 'ios' && (
        <>
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button
              icon="square.3.layers.3d"
              onPress={() => setStyleIndex(i => (i + 1) % STYLES.length)}
            />
          </Stack.Toolbar>
          {/* Speed dial equivalent: glass button with a system menu. */}
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Menu icon="plus">
              <Stack.Toolbar.MenuAction icon="mountain.2" onPress={() => router.push('/tour')}>
                New tour
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction icon="person.crop.circle.badge.plus" onPress={() => {}}>
                New contact
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction icon="square.and.arrow.down" onPress={() => {}}>
                Import GPX
              </Stack.Toolbar.MenuAction>
            </Stack.Toolbar.Menu>
          </Stack.Toolbar>
        </>
      )}

      {/* Floating map controls (map-action-overlay): grouped glass buttons. */}
      <GlassContainer spacing={8} style={[styles.controls, { top: insets.top + 60 }]}>
        <MapButton icon="plus" label="Zoom in" onPress={() => zoomBy(1)} />
        <MapButton icon="minus" label="Zoom out" onPress={() => zoomBy(-1)} />
        <MapButton
          icon="scope"
          label="Back to Zermatt"
          onPress={() => cameraRef.current?.flyTo({ ...ZERMATT, duration: 800 })}
        />
        <MapButton icon="list.bullet.rectangle" label="Open tour sheet" onPress={() => router.push('/tour')} />
      </GlassContainer>
    </View>
  );
}

function MapButton({ icon, label, onPress }: { icon: SFSymbol, label: string, onPress: () => void }) {
  return (
    <GlassView isInteractive style={styles.button}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={styles.hit}
      >
        <SymbolView name={icon} size={20} tintColor="#1f2937" />
      </Pressable>
    </GlassView>
  );
}

const styles = StyleSheet.create({
  controls: { position: 'absolute', right: 16, gap: 8 },
  button: { width: 48, height: 48, borderRadius: 24 },
  hit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
