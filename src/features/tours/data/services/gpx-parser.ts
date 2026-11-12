import { gpx } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export class GpxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GpxParseError';
  }
}

export class GpxFileTooLargeError extends Error {
  constructor() {
    super(`GPX file must be smaller than 5 MB`);
    this.name = 'GpxFileTooLargeError';
  }
}

/** What a GPX can be read from: a picked file or a downloaded body. */
export type GpxSource = { size: number; text(): Promise<string> };

/**
 * Parses a GPX file into a GeoJSON FeatureCollection.
 *
 * @throws {GpxFileTooLargeError} if the file exceeds 5 MB
 * @throws {GpxParseError} if the file is not valid GPX XML
 */
export async function parseGpxFile(file: GpxSource): Promise<GeoJSON.FeatureCollection> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new GpxFileTooLargeError();
  }
  return parseGpxText(await file.text());
}

/** Parses GPX text; no browser needed (`@xmldom/xmldom` stands in for `DOMParser`). */
export function parseGpxText(text: string): GeoJSON.FeatureCollection {
  let doc: Document;
  try {
    // Anything worse than a warning is not a GPX we can trust; xmldom throws on fatal errors itself.
    const parsed = new DOMParser({
      onError: (level) => {
        if (level !== 'warning') throw new Error(level);
      },
    }).parseFromString(text, 'application/xml');
    doc = parsed as unknown as Document;
  } catch {
    throw new GpxParseError('Invalid XML in GPX file');
  }

  const geojson = gpx(doc);

  if (!geojson || !geojson.features || geojson.features.length === 0) {
    throw new GpxParseError('GPX file contains no track data');
  }

  return geojson;
}
