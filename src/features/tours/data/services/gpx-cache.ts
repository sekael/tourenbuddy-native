const MAX_ENTRIES = 10;

function createGpxCache() {
  const cache = new Map<string, GeoJSON.FeatureCollection>();
  const insertionOrder: string[] = [];

  function get(tourId: string): GeoJSON.FeatureCollection | undefined {
    return cache.get(tourId);
  }

  function set(tourId: string, data: GeoJSON.FeatureCollection): void {
    if (cache.has(tourId)) {
      const idx = insertionOrder.indexOf(tourId);
      if (idx !== -1) insertionOrder.splice(idx, 1);
    } else if (cache.size >= MAX_ENTRIES) {
      const oldest = insertionOrder.shift();
      if (oldest) cache.delete(oldest);
    }
    cache.set(tourId, data);
    insertionOrder.push(tourId);
  }

  function has(tourId: string): boolean {
    return cache.has(tourId);
  }

  return { get, set, has };
}

/** The parsed tracks shared by the map, the detail and the route numbers. */
export const gpxCache = createGpxCache();

export { createGpxCache };
