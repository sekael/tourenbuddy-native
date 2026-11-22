import type { OfflineManager as NativeOfflineManager } from '@maplibre/maplibre-react-native';

/** No offline packs on the web (D8); the store never calls this there (`offlineMapsSupported`). */
export const OfflineManager = {} as typeof NativeOfflineManager;
