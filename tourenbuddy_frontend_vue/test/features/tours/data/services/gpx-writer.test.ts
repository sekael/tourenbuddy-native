import { describe, expect, it } from 'vitest'
import { parseGpxFile } from '@/features/tours/data/services/gpx-parser'
import { gpxFromLine } from '@/features/tours/data/services/gpx-writer'
import { trackMetrics } from '@/features/tours/domain/route-metrics'

describe('gpxFromLine', () => {
  it('should escape a tour name that reads as markup', async () => {
    const gpx = gpxFromLine([[8, 46], [8.01, 46]], null, 'Piz <Bernina> & "Biancograt"')
    const track = await parseGpxFile(new File([gpx], 't.gpx'))
    expect(track.features[0]!.properties!.name).toBe('Piz <Bernina> & "Biancograt"')
  })

  it('should leave the climb unknown when a point has no height, keeping the distance', async () => {
    const gpx = gpxFromLine([[8, 46], [8.01, 46], [8.02, 46]], [1500, null, 1600], 'x')
    const metrics = trackMetrics(await parseGpxFile(new File([gpx], 't.gpx')))
    expect(metrics.ascent).toBeNull()
    expect(metrics.distance).toBeGreaterThan(1500)
  })
})
