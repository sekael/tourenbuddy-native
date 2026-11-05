import {
  Camera,
  type CameraRef,
  type GeoJSONSourceRef,
  Images,
  Map,
  type MapRef,
  type ViewState,
  ViewAnnotation,
} from '@maplibre/maplibre-react-native';
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { GlassContainer, GlassView } from 'expo-glass-effect';
import { router, Stack } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tapSnapM } from '@/spike/leg-router';
import { drawStats, registeredImages } from '@/spike/marker-images';
import { basemapStyle, downloadPack, resetOffline, SWITZERLAND } from '@/spike/offline';
import { CLUSTER_LAYER, S3Layers, SKI_HALO_LAYER, TOUR_LAYERS, TOURS } from '@/spike/s3-layers';
import { useTrackDrawing } from '@/spike/use-track-drawing';
import type { LngLat } from '@/spike/vendor/trail';

// Classic = the PWA's public/swisstopo_wmts_style.json (raster, no style.json of its own).
const CLASSIC: StyleSpecification = {
  version: 8,
  glyphs: 'https://vectortiles.geo.admin.ch/fonts/{fontstack}/{range}.pbf',
  sources: {
    'swisstopo-wmts': {
      type: 'raster',
      tiles: ['https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg'],
      tileSize: 256,
      attribution: '© swisstopo',
      maxzoom: 25,
    },
  },
  layers: [{ id: 'swisstopo-wmts-layer', source: 'swisstopo-wmts', type: 'raster' }],
};
const remote = (name: string) => `https://vectortiles.geo.admin.ch/styles/ch.swisstopo.${name}.vt/style.json`;
// The vector base map is the local merged copy once an offline pack exists (see offline.ts).
const STYLES = [basemapStyle, () => remote('imagerybasemap'), () => remote('lightbasemap'), () => CLASSIC];
const STYLE_NAMES = ['Base', 'Aerial', 'Light', 'Classic'];
const ZERMATT = { center: [7.75, 46.02] as [number, number], zoom: 11 };
const HIT_PX = 12;

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const toursRef = useRef<GeoJSONSourceRef>(null);
  const view = useRef<ViewState | null>(null);
  const [styleIndex, setStyleIndex] = useState(0);
  const [hiking, setHiking] = useState(false);
  const [ski, setSki] = useState(true);
  const [drawing, setDrawing] = useState(false);
  // Drawn once, before the map can ask for any of them (see marker-images.ts).
  const [images] = useState(() => {
    const all = registeredImages(new Set(TOURS.features.flatMap(f => f.properties?.pie ?? [])));
    const { count, totalMs, maxMs } = drawStats;
    setTimeout(() => report('images', `images: ${count} drawn up front in ${totalMs.toFixed(0)} ms (max ${maxMs.toFixed(1)})`));
    return all;
  });
  const slowestBuild = useRef(0);
  const [status, setStatus] = useState<Record<string, string>>({});
  const report = (key: string, line: string) => setStatus(s => ({ ...s, [key]: line }));

  const track = useTrackDrawing(
    () => (ski ? 'ski' : hiking ? 'hiking' : null),
    (t) => {
      // build = 0 when the leg reuses the last network; keep the slowest real build in view.
      slowestBuild.current = Math.max(slowestBuild.current, t.buildMs);
      report('snap', `snap: build ${t.buildMs.toFixed(0)} + route ${t.routeMs.toFixed(0)} ms (tiles ${t.loadMs.toFixed(0)} ms)`);
      report('build', `slowest build: ${slowestBuild.current.toFixed(0)} ms`);
    },
  );
  const snapRadius = () => tapSnapM(view.current?.center[1] ?? 46, view.current?.zoom ?? 13);

  async function zoomBy(delta: number) {
    const map = mapRef.current;
    if (!map) return;
    const [center, zoom] = await Promise.all([map.getCenter(), map.getZoom()]);
    cameraRef.current?.easeTo({ center, zoom: zoom + delta, duration: 250 });
  }

  async function onPress(lngLat: LngLat, [x, y]: [number, number]) {
    if (drawing) return track.add(lngLat, snapRadius());
    const t0 = performance.now();
    const [hit] = await mapRef.current!.queryRenderedFeatures(
      [[x - HIT_PX, y - HIT_PX], [x + HIT_PX, y + HIT_PX]],
      { layers: [CLUSTER_LAYER, ...TOUR_LAYERS, SKI_HALO_LAYER] },
    );
    const ms = (performance.now() - t0).toFixed(0);
    const p = hit?.properties ?? {};
    if (p.cluster_id != null) {
      const zoom = await toursRef.current!.getClusterExpansionZoom(p.cluster_id);
      cameraRef.current?.easeTo({ center: (hit!.geometry as GeoJSON.Point).coordinates as LngLat, zoom, duration: 400 });
      report('tap', `tap: cluster of ${p.point_count} → z${zoom} (query ${ms} ms)`);
    }
    else if (p.name) report('tap', `tap: ${p.name} (query ${ms} ms)`);
    else if (p.difficulty_de !== undefined) report('tap', `tap: ski route ${p.id} ${p.difficulty_de ?? ''} (query ${ms} ms)`);
    else report('tap', `tap: nothing (query ${ms} ms)`);
  }

  function download(name: string, bounds: ViewState['bounds'] | undefined) {
    if (!bounds) return;
    downloadPack(name, bounds, line => report('offline', line)).catch(err => report('offline', `${name}: ${err}`));
  }

  const cycleStyle = () => setStyleIndex(i => (i + 1) % STYLES.length);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Map
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapStyle={STYLES[styleIndex]!()}
        onPress={e => onPress(e.nativeEvent.lngLat, e.nativeEvent.point)}
        onRegionDidChange={e => { view.current = e.nativeEvent; }}
      >
        <Camera ref={cameraRef} initialViewState={ZERMATT} />
        <Images images={images} onImageMissing={e => report('missing', `missing image: ${e.nativeEvent.image}`)} />
        <S3Layers hiking={hiking} ski={ski} dimmed={drawing} track={track.line} toursRef={toursRef} />
        {drawing && track.points.map((point, i) => (
          <ViewAnnotation
            key={i}
            id={`track-point-${i}`}
            lngLat={point}
            draggable
            onDrag={e => track.drag(i, e.nativeEvent.lngLat)}
            onDragEnd={e => track.drop(i, e.nativeEvent.lngLat, snapRadius())}
          >
            <View style={styles.point} accessibilityLabel={`Track point ${i + 1}`} />
          </ViewAnnotation>
        ))}
      </Map>

      {/* ponytail: header glass items are iOS-only here; Android chrome is S2 (Material, not SF Symbols). */}
      {process.env.EXPO_OS === 'ios' && (
        <>
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button icon="square.3.layers.3d" onPress={cycleStyle} />
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

      {/* S3 lab: plain chips on both platforms (not a design proposal). */}
      <View style={[styles.lab, { top: insets.top + 60 }]} pointerEvents="box-none">
        <View style={styles.chips}>
          <Chip label={STYLE_NAMES[styleIndex]!} onPress={cycleStyle} />
          <Chip label="Hiking" on={hiking} onPress={() => setHiking(v => !v)} />
          <Chip label="Ski" on={ski} onPress={() => setSki(v => !v)} />
          <Chip label="Draw" on={drawing} onPress={() => setDrawing(v => !v)} />
          {drawing && <Chip label="Undo" onPress={track.undo} />}
          {drawing && <Chip label="Clear" onPress={track.clear} />}
        </View>
        <View style={styles.chips}>
          <Chip label="↓ View" onPress={() => download('view', view.current?.bounds)} />
          <Chip label="↓ CH" onPress={() => download('CH', SWITZERLAND)} />
          <Chip label="Reset offline" onPress={() => resetOffline().then(() => report('offline', 'offline: reset'))} />
        </View>
        {Object.values(status).map(line => <Text key={line} style={styles.status}>{line}</Text>)}
      </View>

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

function Chip({ label, on, onPress }: { label: string, on?: boolean, onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={on === undefined ? undefined : { selected: on }}
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
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
  lab: { position: 'absolute', left: 12, right: 76, gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.92)' },
  chipOn: { backgroundColor: '#1f2937' },
  chipText: { fontSize: 13, color: '#1f2937' },
  chipTextOn: { color: '#ffffff' },
  status: { fontSize: 11, color: '#111827', backgroundColor: 'rgba(255,255,255,0.85)', paddingHorizontal: 6, alignSelf: 'flex-start' },
  point: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#ffffff', borderWidth: 3, borderColor: '#E11D48' },
});
