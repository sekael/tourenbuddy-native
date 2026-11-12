import { Platform } from 'react-native';
import { create } from 'zustand';

import { createLogger } from '@/core/logging/logger';
import {
  OFFLINE_MAX_ZOOM,
  OFFLINE_MIN_ZOOM,
  type Bounds,
} from '@/features/map/domain/offline-regions';
import { BASE_MAP_URL } from '@/features/map/presentation/map-styles';

import { OfflineManager, type OfflinePack } from './offline-packs';

/**
 * Offline maps (offline-map D10): each region an offline pack of the vector base map, zoom 0 to
 * 14. What the list shows is read from the packs themselves (the system may evict tiles), and a
 * download in progress reports here. Not on the web.
 */
export type OfflineRegion = {
  id: string;
  name: string;
  bounds: Bounds;
  state: 'downloading' | 'complete' | 'incomplete';
  percentage: number;
  bytes: number;
};

const log = createLogger('OfflineMaps');
export const offlineMapsSupported = Platform.OS !== 'web';
/** Whole Switzerland in four packs is ~37 000 tiles; the default limit is 6000. */
const TILE_LIMIT = 50_000;

type OfflineMapsState = {
  regions: OfflineRegion[];
  loaded: boolean;
  error: 'load' | 'download' | 'delete' | null;
  load: () => Promise<void>;
  download: (name: string, bounds: Bounds) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** An incomplete region: delete and download it again. */
  redownload: (id: string) => Promise<void>;
};

let configured = false;
function configure() {
  if (configured) return;
  configured = true;
  OfflineManager.setTileCountLimit(TILE_LIMIT);
  OfflineManager.setProgressEventThrottle(500);
}

async function regionOf(pack: OfflinePack): Promise<OfflineRegion> {
  const status = await pack.status();
  return {
    id: pack.id,
    name: typeof pack.metadata?.name === 'string' ? pack.metadata.name : '',
    bounds: pack.bounds as Bounds,
    state:
      status.state === 'complete' && status.percentage >= 100
        ? 'complete'
        : status.state === 'active'
          ? 'downloading'
          : 'incomplete',
    percentage: Math.round(status.percentage),
    bytes: status.completedResourceSize,
  };
}

export const useOfflineMapsStore = create<OfflineMapsState>()((set, get) => {
  const upsert = (region: OfflineRegion) =>
    set({ regions: [...get().regions.filter((r) => r.id !== region.id), region] });

  const listen = (id: string) =>
    OfflineManager.addListener(
      id,
      (pack) => void regionOf(pack).then(upsert),
      (_pack, error) => {
        log.warn('Offline pack failed', error.message);
        set({ error: 'download' });
        void get().load();
      },
    );

  return {
    regions: [],
    loaded: false,
    error: null,

    load: async () => {
      if (!offlineMapsSupported) return;
      configure();
      try {
        const packs = await OfflineManager.getPacks();
        const regions = await Promise.all(packs.map(regionOf));
        set({ regions, loaded: true, error: null });
        // A download still running from before keeps reporting.
        regions.filter((r) => r.state === 'downloading').forEach((r) => void listen(r.id));
      } catch (error) {
        log.error('Loading offline packs failed', error);
        set({ loaded: true, error: 'load' });
      }
    },

    download: async (name, bounds) => {
      if (!offlineMapsSupported) return;
      configure();
      set({ error: null });
      try {
        const pack = await OfflineManager.createPack(
          {
            mapStyle: BASE_MAP_URL,
            bounds,
            minZoom: OFFLINE_MIN_ZOOM,
            maxZoom: OFFLINE_MAX_ZOOM,
            metadata: { name },
          },
          (current) => void regionOf(current).then(upsert),
          (_pack, error) => {
            log.warn('Offline pack failed', error.message);
            set({ error: 'download' });
          },
        );
        upsert(await regionOf(pack));
      } catch (error) {
        log.error('Creating an offline pack failed', error);
        set({ error: 'download' });
      }
    },

    remove: async (id) => {
      if (!offlineMapsSupported) return;
      try {
        await OfflineManager.deletePack(id);
        set({ regions: get().regions.filter((r) => r.id !== id) });
      } catch (error) {
        log.error('Deleting an offline pack failed', error);
        set({ error: 'delete' });
      }
    },

    redownload: async (id) => {
      const region = get().regions.find((r) => r.id === id);
      if (!region) return;
      await get().remove(id);
      await get().download(region.name, region.bounds);
    },
  };
});
