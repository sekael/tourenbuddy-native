// Ported from the PWA's features/map/presentation/stores/offline-map-store.ts (port-pwa-web).
import { create } from 'zustand';

import { createLogger } from '@/core/logging/logger';
import {
  getAllRegions,
  type OfflineRegion,
} from '@/features/map/data/services/offline-region-store.web';
import {
  deleteRegion as deleteRegionService,
  downloadRegion,
  estimateBytes,
  OfflineQuotaError,
  REGION_MAX_ZOOM,
  REGION_MIN_ZOOM,
  sweepOrphanTiles,
  type DownloadProgress,
} from '@/features/map/data/services/offline-tile-service.web';

export type DownloadStatus = 'idle' | 'running' | 'error';
export type Bbox = [number, number, number, number];

const logger = createLogger('OfflineMapStore');

interface OfflineMapState {
  regions: OfflineRegion[];
  loading: boolean;
  error: string | null;
  usage: number;
  quota: number;
  durableStorageAvailable: boolean;
  estimate: number;
  status: DownloadStatus;
  progress: DownloadProgress;
  refreshUsage: () => Promise<void>;
  loadRegions: () => Promise<void>;
  updateEstimate: (bbox: Bbox | null) => void;
  ensureDurable: () => Promise<boolean>;
  download: (label: string, bbox: Bbox) => Promise<boolean>;
  cancelDownload: () => void;
  deleteRegion: (id: string) => Promise<void>;
}

let controller: AbortController | null = null;

export const useOfflineMapStore = create<OfflineMapState>()((set, get) => ({
  regions: [],
  loading: false,
  error: null,
  usage: 0,
  quota: 0,
  durableStorageAvailable: false,
  estimate: 0,
  status: 'idle',
  progress: { done: 0, total: 0, bytes: 0 },

  async refreshUsage() {
    const est = await navigator.storage?.estimate?.();
    set({
      usage: est?.usage ?? 0,
      quota: est?.quota ?? 0,
      durableStorageAvailable: (await navigator.storage?.persisted?.()) ?? false,
    });
  },

  async loadRegions() {
    set({ loading: true, error: null });
    try {
      await sweepOrphanTiles();
      set({ regions: await getAllRegions() });
      await get().refreshUsage();
    } catch (err) {
      logger.error('loadRegions failed', err);
      set({ error: 'offlineMap.errors.load' });
    } finally {
      set({ loading: false });
    }
  },

  updateEstimate(bbox) {
    set({ estimate: bbox ? estimateBytes(bbox, REGION_MIN_ZOOM, REGION_MAX_ZOOM) : 0 });
  },

  /** Ask the browser for durable (non-evictable) storage before the first download. */
  async ensureDurable() {
    const durable = (await navigator.storage?.persist?.()) ?? false;
    set({ durableStorageAvailable: durable });
    return durable;
  },

  /** Run a cancelable download of `bbox`, refreshing the region list on success. */
  async download(label, bbox) {
    controller = new AbortController();
    set({ status: 'running', progress: { done: 0, total: 0, bytes: 0 }, error: null });
    try {
      await get().ensureDurable();
      await downloadRegion(
        {
          id: crypto.randomUUID(),
          label,
          bbox,
          minZoom: REGION_MIN_ZOOM,
          maxZoom: REGION_MAX_ZOOM,
        },
        { signal: controller.signal, onProgress: (progress) => set({ progress }) },
      );
      await get().loadRegions();
      set({ status: 'idle' });
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        set({ status: 'idle' }); // user canceled — not an error state
        return false;
      }
      logger.error('download failed', err);
      set({
        error:
          err instanceof OfflineQuotaError
            ? 'offlineMap.errors.quota'
            : 'offlineMap.errors.download',
        status: 'error',
      });
      return false;
    } finally {
      controller = null;
    }
  },

  cancelDownload() {
    controller?.abort();
  },

  async deleteRegion(id) {
    set({ error: null });
    try {
      await deleteRegionService(id);
      await get().loadRegions();
    } catch (err) {
      logger.error('deleteRegion failed', err);
      set({ error: 'offlineMap.errors.delete' });
    }
  },
}));

/**
 * Bytes used by offline maps ALONE (sum of region records) — not whole-origin usage, which also
 * counts the app shell, IndexedDB and other caches.
 */
export const offlineUsage = (s: OfflineMapState) => s.regions.reduce((n, r) => n + r.bytes, 0);
export const usedRatio = (s: OfflineMapState) => (s.quota ? offlineUsage(s) / s.quota : 0);
/** Bytes we allow before the next download would breach the 90% safety line. */
const freeHeadroom = (s: OfflineMapState) => Math.max(0, s.quota * 0.9 - s.usage);
/** Soft warning: estimate eats >70% of remaining headroom (button stays enabled). */
export const estimateWarns = (s: OfflineMapState) =>
  freeHeadroom(s) > 0 && s.estimate > freeHeadroom(s) * 0.7;
/** Hard block: estimate exceeds the real ceiling. */
export const estimateBlocks = (s: OfflineMapState) => s.quota > 0 && s.estimate > freeHeadroom(s);
