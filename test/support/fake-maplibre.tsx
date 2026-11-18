import type { ReactNode } from 'react';
import { View } from 'react-native';

// MapLibre's native views do not run under Jest: each export is a plain view around its children,
// so screens that hold a map render and their own controls stay testable.
const stub = (name: string) => {
  const Stub = ({ children, testID }: { children?: ReactNode; testID?: string }) => (
    <View testID={testID ?? `maplibre-${name}`}>{children}</View>
  );
  Stub.displayName = name;
  return Stub;
};

export const Map = stub('Map');
export const Camera = stub('Camera');
export const GeoJSONSource = stub('GeoJSONSource');
export const VectorSource = stub('VectorSource');
export const RasterSource = stub('RasterSource');
export const Images = stub('Images');
export const Layer = stub('Layer');
export const UserLocation = stub('UserLocation');
export const LogManager = { setLogLevel: () => {}, onLog: () => {} };
export const OfflineManager = {
  setTileCountLimit: () => {},
  setProgressEventThrottle: () => {},
  getPacks: async () => [],
  createPack: async () => {
    throw new Error('No offline packs under Jest');
  },
  deletePack: async () => {},
  addListener: async () => {},
};
