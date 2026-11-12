import type { LngLat } from '@/features/map/domain/entities/trail';

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A one-segment GPX track of `line`, with `<ele>` where `heights` knows one. */
export function gpxFromLine(
  line: readonly LngLat[],
  heights: readonly (number | null)[] | null,
  name: string,
): string {
  const points = line.map(([lng, lat], i) => {
    const ele = heights?.[i];
    return `<trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}">${ele == null ? '' : `<ele>${ele}</ele>`}</trkpt>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="TourenBuddy" xmlns="http://www.topografix.com/GPX/1/1">',
    `<trk><name>${escapeXml(name)}</name><trkseg>`,
    ...points,
    '</trkseg></trk>',
    '</gpx>',
  ].join('\n');
}
