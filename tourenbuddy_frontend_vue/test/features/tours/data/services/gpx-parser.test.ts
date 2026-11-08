import { describe, expect, it } from 'vitest'
import {
  GpxFileTooLargeError,
  GpxParseError,
  parseGpxFile,
} from '@/features/tours/data/services/gpx-parser'

const MINIMAL_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <name>Test Track</name>
    <trkseg>
      <trkpt lat="46.8" lon="8.2"><ele>500</ele></trkpt>
      <trkpt lat="46.9" lon="8.3"><ele>600</ele></trkpt>
      <trkpt lat="47.0" lon="8.4"><ele>700</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`

function makeFile(content: string, name = 'track.gpx', type = 'application/gpx+xml'): File {
  return new File([content], name, { type })
}

function makeOversizedFile(): File {
  const fiveMBPlusOne = 5 * 1024 * 1024 + 1
  const buf = new Uint8Array(fiveMBPlusOne).fill(32)
  return new File([buf], 'big.gpx', { type: 'application/gpx+xml' })
}

describe('parseGpxFile', () => {
  it('should parse a valid GPX file into a GeoJSON FeatureCollection', async () => {
    const file = makeFile(MINIMAL_GPX)
    const result = await parseGpxFile(file)

    expect(result.type).toBe('FeatureCollection')
    expect(result.features.length).toBeGreaterThan(0)
  })

  it('should throw GpxFileTooLargeError when file exceeds 5 MB', async () => {
    const file = makeOversizedFile()
    await expect(parseGpxFile(file)).rejects.toThrow(GpxFileTooLargeError)
  })

  it('should throw GpxParseError for invalid XML', async () => {
    const file = makeFile('<this is not valid xml<<<')
    await expect(parseGpxFile(file)).rejects.toThrow(GpxParseError)
  })

  it('should throw GpxParseError for valid XML that is not GPX (no track data)', async () => {
    const file = makeFile('<?xml version="1.0"?><root><item>hello</item></root>')
    await expect(parseGpxFile(file)).rejects.toThrow(GpxParseError)
  })

  it('should include LineString geometry for a track segment', async () => {
    const file = makeFile(MINIMAL_GPX)
    const result = await parseGpxFile(file)

    const lineFeature = result.features.find(f => f.geometry?.type === 'LineString')
    expect(lineFeature).toBeDefined()
  })
})
