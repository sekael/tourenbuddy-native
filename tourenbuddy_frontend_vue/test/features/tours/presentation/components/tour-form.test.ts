import { createTestingPinia } from '@pinia/testing'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { GpxParseError, parseGpxFile } from '@/features/tours/data/services/gpx-parser'
import PointSuggestions from '@/features/tours/presentation/components/point-suggestions.vue'
import TourForm from '@/features/tours/presentation/components/tour-form.vue'

const { mockUploadGpx, mockRemoveGpx } = vi.hoisted(() => ({
  mockUploadGpx: vi.fn(),
  mockRemoveGpx: vi.fn(),
}))

vi.mock('@/features/tours/data/services/gpx-storage-service', () => ({
  uploadGpx: mockUploadGpx,
  removeGpx: mockRemoveGpx,
  // Real implementation — the failure path recomputes the key an interrupted upload was
  // writing to, and a stub returning undefined would hide a wrong-key cleanup.
  gpxStorageKey: (userId: string, tourId: string) => `${userId}/${tourId}.gpx`,
}))

// Spy on parseGpxFile but keep the real error classes for instanceof checks.
vi.mock('@/features/tours/data/services/gpx-parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/tours/data/services/gpx-parser')>()
  return { ...actual, parseGpxFile: vi.fn() }
})

const { mockGetElevation, mockSuggestTourName } = vi.hoisted(() => ({
  mockGetElevation: vi.fn(),
  mockSuggestTourName: vi.fn(),
}))
vi.mock('@/features/tours/data/services/swisstopo-elevation-service', () => ({ getElevation: mockGetElevation }))
vi.mock('@/features/tours/data/services/swisstopo-name-service', () => ({ suggestTourName: mockSuggestTourName }))

const { mockGetTrackProfile, mockLoadGpxTrack } = vi.hoisted(() => ({ mockGetTrackProfile: vi.fn(), mockLoadGpxTrack: vi.fn() }))
vi.mock('@/features/tours/data/services/swisstopo-profile-service', async importOriginal => ({
  ...await importOriginal<typeof import('@/features/tours/data/services/swisstopo-profile-service')>(),
  getTrackProfile: mockGetTrackProfile,
}))
vi.mock('@/features/tours/data/services/gpx-track-service', () => ({ loadGpxTrack: mockLoadGpxTrack }))

const { mockFindStopsNear } = vi.hoisted(() => ({ mockFindStopsNear: vi.fn() }))
vi.mock('@/features/tours/data/services/swisstopo-stop-service', () => ({ findStopsNear: mockFindStopsNear }))
mockFindStopsNear.mockResolvedValue([])

/** A parsed GPX without a single point. */
const NO_TRACK: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn().mockReturnValue({ currentUser: { id: 'user-abc' } }),
}))

function mountForm(props: Record<string, unknown> = {}) {
  return mount(TourForm, {
    props: { submitLabel: 'Save', ...props },
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: { contacts: { contacts: [] } },
        }),
      ],
      stubs: { ContactChip: true },
    },
  })
}

/** Opens start and end, folded while both are empty (design D9). */
async function byHand(wrapper: ReturnType<typeof mountForm>) {
  await wrapper.find('[data-testid=points-by-hand-btn]').trigger('click')
}

async function pickFile(wrapper: ReturnType<typeof mountForm>, file: File) {
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', {
    value: { 0: file, length: 1 },
    configurable: true,
  })
  await input.trigger('change')
  await nextTick()
}

describe('tourForm', () => {
  describe('seeded create (#338)', () => {
    /** The `draftId` a submit carries — non-empty only when the form creates (staging attachments). */
    async function submittedDraftId(props: Record<string, unknown>) {
      const wrapper = mountForm(props)
      await wrapper.find('#tf-tourName').setValue('Hut to summit')
      await wrapper.find('form').trigger('submit.prevent')
      return (wrapper.emitted('submit')![0] as unknown[])[3]
    }

    it('should still create when seeded without a tour id', async () => {
      expect(await submittedDraftId({ initialDraft: { tourTypes: ['skitour'] } })).not.toBe('')
    })

    it('should edit when given a tour id', async () => {
      expect(await submittedDraftId({ initialDraft: { tourTypes: ['skitour'] }, tourId: 't1' })).toBe('')
    })
  })

  describe('disabled prop', () => {
    it('renders the fieldset disabled so nested inputs and buttons are inert', () => {
      const wrapper = mountForm({ disabled: true })
      const fieldset = wrapper.find('fieldset.form-fieldset')
      expect(fieldset.exists()).toBe(true)
      // The component's job is to render <fieldset disabled>; native form
      // semantics make every nested control inert. happy-dom doesn't reliably
      // mirror that onto child .disabled props, so assert the mechanism itself.
      expect(fieldset.attributes('disabled')).toBeDefined()
    })

    it('does not emit submit while disabled', async () => {
      const wrapper = mountForm({ disabled: true })
      // Direct handleSubmit via form event (bypassing disabled button click)
      await wrapper.find('form').trigger('submit.prevent')
      expect(wrapper.emitted('submit')).toBeUndefined()
    })

    it('emits submit when not disabled and name is valid', async () => {
      const wrapper = mountForm({ disabled: false })
      const nameInput = wrapper.find('#tf-tourName')
      await nameInput.setValue('My Tour')
      await wrapper.find('form').trigger('submit.prevent')
      expect(wrapper.emitted('submit')).toHaveLength(1)
    })

    it('does not attribute disabled on fieldset when disabled is false', () => {
      const wrapper = mountForm({ disabled: false })
      const fieldset = wrapper.find('fieldset.form-fieldset')
      expect(fieldset.attributes('disabled')).toBeUndefined()
    })
  })

  describe('end-point row conditional rendering', () => {
    it('offers the end without a start, but no round trip — there is no start to return to', async () => {
      const wrapper = mountForm()
      await byHand(wrapper)
      const end = wrapper.find('.point-section--end')
      expect(end.text()).toContain('tours.form.addEndPointBtn')
      expect(end.text()).not.toContain('tours.form.roundTripBtn')
      await end.findAll('button').find(b => b.text().includes('addEndPointBtn'))!.trigger('click')
      expect(wrapper.emitted('pickPoint')).toEqual([['end']])
    })

    it('offers the round trip once a start is set', () => {
      const wrapper = mountForm({ initialDraft: { startPoint: { lng: 7.8, lat: 46.5 } } })
      expect(wrapper.find('.point-section--end').text()).toContain('tours.form.roundTripBtn')
    })

    it('reveals end-point row when an end point is set', () => {
      const wrapper = mountForm({
        initialDraft: { startPoint: { lng: 7.8, lat: 46.5 }, endPoint: { lng: 7.9, lat: 46.5 } },
      })
      // "Add end point" button should not be present
      const addBtn = wrapper.findAll('button').filter(b => b.text().includes('addEndPointBtn'))
      expect(addBtn.length).toBe(0)
      // Remove button present for end point
      const removeBtns = wrapper.findAll('[data-testid="remove-end-btn"]')
      expect(removeBtns.length).toBeGreaterThan(0)
    })
  })

  describe('activity chips (multi-select)', () => {
    async function submitTypes(wrapper: ReturnType<typeof mountForm>) {
      await wrapper.find('#tf-tourName').setValue('My Tour')
      await wrapper.find('form').trigger('submit.prevent')
      return ((wrapper.emitted('submit')![0] as unknown[])[0] as { tourTypes: string[] }).tourTypes
    }

    it('saves several activities in chip order, not tap order', async () => {
      const wrapper = mountForm()
      await wrapper.find('[data-type="hiking"]').trigger('click')
      await wrapper.find('[data-type="skitour"]').trigger('click')
      expect(await submitTypes(wrapper)).toEqual(['skitour', 'hiking'])
    })

    it('deselecting one activity keeps the others', async () => {
      const wrapper = mountForm({ initialDraft: { tourTypes: ['skitour', 'hiking'] } })
      await wrapper.find('[data-type="skitour"]').trigger('click')
      expect(await submitTypes(wrapper)).toEqual(['hiking'])
    })

    it('surfaces an emptied selection as [] (neutral preview), not null', async () => {
      const wrapper = mountForm({ initialDraft: { tourTypes: ['hiking'] } })
      await wrapper.find('[data-type="hiking"]').trigger('click')
      expect(wrapper.emitted('tourTypesChange')!.at(-1)).toEqual([[]])
    })
  })

  describe('clearing end point also clears metadata', () => {
    it('should include null endPointName and endPointElevation in draft when end point is removed', async () => {
      const wrapper = mountForm({
        initialDraft: {
          startPoint: { lng: 7.8, lat: 46.5 },
          endPoint: { lng: 7.9, lat: 46.5 },
          endPointName: 'Murren',
          endPointElevation: 1638,
        },
      })
      // Remove the end point
      const removeBtn = wrapper.find('[data-testid="remove-end-btn"]')
      await removeBtn.trigger('click')
      await nextTick()

      // Submit with a valid name
      const nameInput = wrapper.find('#tf-tourName')
      await nameInput.setValue('My Tour')
      await wrapper.find('form').trigger('submit.prevent')

      const emitted = wrapper.emitted('submit')
      expect(emitted).toHaveLength(1)
      const draft = (emitted![0] as unknown[])[0] as Record<string, unknown>
      expect(draft.endPoint).toBeNull()
      expect(draft.endPointName).toBeNull()
      expect(draft.endPointElevation).toBeNull()
    })
  })

  describe('gPX section states', () => {
    it('shows upload button in empty state', () => {
      const wrapper = mountForm()
      const uploadBtn = wrapper.find('[data-testid="gpx-upload-btn"]')
      expect(uploadBtn.exists()).toBe(true)
      const filledRow = wrapper.find('.gpx-filled-row')
      expect(filledRow.exists()).toBe(false)
    })

    it('shows filled row when initialDraft has gpxFilepath', () => {
      const wrapper = mountForm({
        initialDraft: {
          name: 'Test',
          plannedDate: null,
          partnerIds: [],
          tourTypes: [],
          elevation: null,
          gpxFilepath: 'tour-abc.gpx',
          description: null,
          seasons: null,
          startPoint: null,
          endPoint: null,
          startPointName: null,
          startPointElevation: null,
          endPointName: null,
          endPointElevation: null,
          equipment: null,
          notes: null,
        },
      })
      expect(wrapper.find('.gpx-filled-row').exists()).toBe(true)
      expect(wrapper.find('[data-testid="gpx-upload-btn"]').exists()).toBe(false)
    })

    it('emits gpxRemoved=true after remove click', async () => {
      const wrapper = mountForm({
        initialDraft: {
          name: 'Test',
          plannedDate: null,
          partnerIds: [],
          tourTypes: [],
          elevation: null,
          gpxFilepath: 'tour-abc.gpx',
          description: null,
          seasons: null,
          startPoint: null,
          endPoint: null,
          startPointName: null,
          startPointElevation: null,
          endPointName: null,
          endPointElevation: null,
          equipment: null,
          notes: null,
        },
      })
      const removeBtn = wrapper.find('[data-testid="gpx-remove-btn"]')
      await removeBtn.trigger('click')
      await nextTick()

      expect(wrapper.find('.gpx-filled-row').exists()).toBe(false)
      expect(wrapper.find('[data-testid="gpx-upload-btn"]').exists()).toBe(true)

      await wrapper.find('#tf-tourName').setValue('Test Tour')
      await wrapper.find('form').trigger('submit.prevent')

      const emitted = wrapper.emitted('submit')
      expect(emitted).toHaveLength(1)
      const [, gpxRemoved] = emitted![0] as [unknown, boolean]
      expect(gpxRemoved).toBe(true)
    })

    it('shows gpxError when parseGpxFile throws for invalid GPX', async () => {
      vi.mocked(parseGpxFile).mockRejectedValueOnce(new GpxParseError('bad xml'))

      const wrapper = mountForm()
      const input = wrapper.find('input[type="file"]')
      const file = new File(['bad'], 'bad.gpx')
      Object.defineProperty(input.element, 'files', { value: { 0: file, length: 1 } })
      await input.trigger('change')
      await nextTick()
      await nextTick()
      expect(wrapper.find('.gpx-error').exists()).toBe(true)
    })
  })

  describe('eager upload (always pre-uploads on file pick)', () => {
    const validGpxContent = `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg><trkpt lat="46.5" lon="8.2"/></trkseg></trk></gpx>`

    beforeEach(() => {
      vi.clearAllMocks()
      vi.mocked(parseGpxFile).mockResolvedValue(NO_TRACK)
      mockUploadGpx.mockResolvedValue('user-abc/new-tour-id.gpx')
      mockRemoveGpx.mockResolvedValue(undefined)
    })

    it('should trigger upload with a progress callback on valid file pick', async () => {
      const wrapper = mountForm()
      const file = new File([validGpxContent], 'track.gpx')

      await pickFile(wrapper, file)

      expect(mockUploadGpx).toHaveBeenCalledWith(
        'user-abc',
        expect.any(String),
        file,
        expect.objectContaining({ onProgress: expect.any(Function) }),
      )
      expect(wrapper.find('.gpx-filled-row').exists()).toBe(true)
    })

    it('should disable Save while uploading and re-enable after completion', async () => {
      let resolveUpload!: () => void
      mockUploadGpx.mockReturnValue(
        new Promise<string>((res) => {
          resolveUpload = () => res('user-abc/id.gpx')
        }),
      )

      const wrapper = mountForm()
      const file = new File([validGpxContent], 'track.gpx')

      const pickPromise = pickFile(wrapper, file)
      // parseGpxFile is async, so isUploadingGpx flips a microtask later — flush.
      await flushPromises()

      const submitBtn = wrapper.find('[data-testid="submit-btn"]').element as HTMLButtonElement
      expect(submitBtn.disabled).toBe(true)

      resolveUpload()
      await pickPromise
      await flushPromises()

      expect(submitBtn.disabled).toBe(false)
    })

    it('should delete prior pending blob when user picks a replacement file', async () => {
      mockUploadGpx
        .mockResolvedValueOnce('user-abc/first-id.gpx')
        .mockResolvedValueOnce('user-abc/second-id.gpx')

      const wrapper = mountForm()

      await pickFile(wrapper, new File([validGpxContent], 'first.gpx'))
      await nextTick()
      expect(mockUploadGpx).toHaveBeenCalledTimes(1)

      await pickFile(wrapper, new File([validGpxContent], 'second.gpx'))
      await nextTick()

      expect(mockRemoveGpx).toHaveBeenCalledWith('user-abc/first-id.gpx')
      expect(mockUploadGpx).toHaveBeenCalledTimes(2)
    })

    it('should delete pending blob on cancel after upload completes', async () => {
      const wrapper = mountForm()
      await pickFile(wrapper, new File([validGpxContent], 'track.gpx'))
      await nextTick()

      await wrapper.find('[data-testid="cancel-btn"]').trigger('click')

      expect(mockRemoveGpx).toHaveBeenCalledWith('user-abc/new-tour-id.gpx')
    })

    it('should set wasCancelledDuringUpload flag when cancel fires while upload in flight', async () => {
      let resolveUpload!: (key: string) => void
      mockUploadGpx.mockReturnValue(new Promise<string>(res => (resolveUpload = res)))

      const wrapper = mountForm()
      pickFile(wrapper, new File([validGpxContent], 'track.gpx'))
      await nextTick()

      await wrapper.find('[data-testid="cancel-btn"]').trigger('click')

      resolveUpload('user-abc/inflight.gpx')
      await nextTick()
      await nextTick()

      expect(mockRemoveGpx).toHaveBeenCalledWith('user-abc/inflight.gpx')
    })
  })

  describe('cancelling an in-flight GPX upload', () => {
    const validGpxContent = `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg><trkpt lat="46.5" lon="8.2"/></trkseg></trk></gpx>`

    /** Honours the abort signal the way the real XHR transport does. */
    function uploadThatHangs() {
      mockUploadGpx.mockImplementation(
        (_u: string, _t: string, _f: File, opts: { signal: AbortSignal }) =>
          new Promise<string>((_res, rej) => {
            opts.signal.addEventListener('abort', () =>
              rej(new DOMException('Upload aborted', 'AbortError')))
          }),
      )
    }

    beforeEach(() => {
      vi.clearAllMocks()
      vi.mocked(parseGpxFile).mockResolvedValue(NO_TRACK)
      mockRemoveGpx.mockResolvedValue(undefined)
    })

    it('swaps Replace for Cancel only while the upload is in flight', async () => {
      let resolveUpload!: (key: string) => void
      mockUploadGpx.mockReturnValue(new Promise<string>(res => (resolveUpload = res)))

      const wrapper = mountForm()
      const pick = pickFile(wrapper, new File([validGpxContent], 'track.gpx'))
      await flushPromises()

      expect(wrapper.find('[data-testid="gpx-cancel-btn"]').exists()).toBe(true)

      resolveUpload('user-abc/done.gpx')
      await pick
      await flushPromises()

      expect(wrapper.find('[data-testid="gpx-cancel-btn"]').exists()).toBe(false)
    })

    it('drops the file silently and deletes any partial object on cancel', async () => {
      uploadThatHangs()
      const wrapper = mountForm()
      pickFile(wrapper, new File([validGpxContent], 'track.gpx'))
      await flushPromises()

      await wrapper.find('[data-testid="gpx-cancel-btn"]').trigger('click')
      await flushPromises()

      // A cancel is not a failure — it must never reach the error line.
      expect(wrapper.find('.gpx-error').exists()).toBe(false)
      expect(mockRemoveGpx).toHaveBeenCalledWith(expect.stringMatching(/^user-abc\/.+\.gpx$/))
      expect(wrapper.find('.gpx-filled-row').exists()).toBe(false)
    })

    it('keeps the existing track visible when a replacement upload is cancelled', async () => {
      uploadThatHangs()
      const wrapper = mountForm({
        initialDraft: { name: 'T', gpxFilepath: 'user-abc/old.gpx' },
      })
      pickFile(wrapper, new File([validGpxContent], 'new.gpx'))
      await flushPromises()

      await wrapper.find('[data-testid="gpx-cancel-btn"]').trigger('click')
      await flushPromises()

      // Cancelling the replacement must not take the tour's existing track with it —
      // the tile stays, and it stops naming the file that never made it.
      expect(wrapper.find('.gpx-filled-row').exists()).toBe(true)
      expect(wrapper.find('.gpx-filled-row').text()).not.toContain('new.gpx')
      expect(wrapper.find('.gpx-error').exists()).toBe(false)
    })

    it('still surfaces the error line when the upload genuinely fails', async () => {
      mockUploadGpx.mockRejectedValue(new Error('500 from storage'))
      const wrapper = mountForm()

      await pickFile(wrapper, new File([validGpxContent], 'track.gpx'))
      await flushPromises()

      expect(wrapper.find('.gpx-error').exists()).toBe(true)
      // Never the raw transport message.
      expect(wrapper.find('.gpx-error').text()).not.toContain('500')
    })
  })

  describe('swisstopo lookups', () => {
    const GOAL = { lng: 9.9, lat: 46.4 }
    const OTHER = { lng: 9.95, lat: 46.41 }
    const goalPick = (location = GOAL, name?: string) => ({ type: 'goal', location, name })
    const value = (wrapper: ReturnType<typeof mountForm>, id: string) =>
      (wrapper.find(`#${id}`).element as HTMLInputElement).value

    /** A lookup the test resolves by hand; `signal` is what the form handed the service. */
    function pending<T>(mock: typeof mockGetElevation) {
      const call = { resolve: (_: T) => {}, signal: undefined as AbortSignal | undefined }
      mock.mockImplementationOnce((_coords: unknown, signal: AbortSignal) => {
        call.signal = signal
        return new Promise<T>(resolve => (call.resolve = resolve))
      })
      return call
    }

    beforeEach(() => {
      mockGetElevation.mockReset().mockResolvedValue(null)
      mockSuggestTourName.mockReset().mockResolvedValue(null)
    })

    it('holds a name that came first under the skeleton until the height is in, then shows both at once', async () => {
      mockSuggestTourName.mockResolvedValue('Piz Palü')
      const elevation = pending<number | null>(mockGetElevation)
      const wrapper = mountForm({ currentGoal: GOAL, pick: goalPick() })
      await flushPromises()

      expect(value(wrapper, 'tf-tourName')).toBe('Piz Palü')
      expect(wrapper.find('#tf-tourName').attributes('aria-busy')).toBe('true')
      expect(wrapper.findAll('.lookup-skeleton')).toHaveLength(2)

      elevation.resolve(3905)
      await flushPromises()
      expect(value(wrapper, 'tf-elevation')).toBe('3905')
      expect(wrapper.find('.lookup-skeleton').exists()).toBe(false)
    })

    it('cancels the request and keeps the typed value when the user types before Swisstopo answers', async () => {
      const elevation = pending<number | null>(mockGetElevation)
      const wrapper = mountForm({ currentGoal: GOAL, pick: goalPick() })
      await flushPromises()

      await wrapper.find('#tf-elevation').setValue('3000')
      expect(elevation.signal?.aborted).toBe(true)
      expect(wrapper.find('#tf-elevation').attributes('placeholder')).toBe('tours.form.elevationPlaceholder')

      elevation.resolve(3905)
      await flushPromises()
      expect(value(wrapper, 'tf-elevation')).toBe('3000')
    })

    it('skips a typed field on a re-pick: no request, no spinner, value kept', async () => {
      const wrapper = mountForm({ currentGoal: GOAL, pick: goalPick() })
      await flushPromises()
      await wrapper.find('#tf-tourName').setValue('Bernina Traverse')
      mockSuggestTourName.mockClear()

      await wrapper.setProps({ pick: goalPick(OTHER) })
      await flushPromises()
      expect(mockSuggestTourName).not.toHaveBeenCalled()
      expect(value(wrapper, 'tf-tourName')).toBe('Bernina Traverse')
      expect(mockGetElevation).toHaveBeenLastCalledWith(OTHER, expect.any(AbortSignal))
    })

    it('replaces a value it filled itself on a re-pick, and fills a field the user emptied', async () => {
      mockSuggestTourName.mockResolvedValueOnce('Piz Palü').mockResolvedValueOnce('Piz Bernina')
      const wrapper = mountForm({ currentGoal: GOAL, pick: goalPick() })
      await flushPromises()
      await wrapper.setProps({ pick: goalPick(OTHER) })
      await flushPromises()
      expect(value(wrapper, 'tf-tourName')).toBe('Piz Bernina')

      await wrapper.find('#tf-tourName').setValue('  ')
      mockSuggestTourName.mockResolvedValueOnce('Piz Morteratsch')
      await wrapper.setProps({ pick: goalPick(GOAL) })
      await flushPromises()
      expect(value(wrapper, 'tf-tourName')).toBe('Piz Morteratsch')
    })

    it('leaves the field empty with the manual-entry placeholder when Swisstopo fails or times out', async () => {
      const wrapper = mountForm({ currentGoal: GOAL, pick: goalPick() })
      await flushPromises()
      for (const id of ['tf-tourName', 'tf-elevation']) {
        expect(value(wrapper, id)).toBe('')
        expect(wrapper.find(`#${id}`).attributes('placeholder')).toBe('tours.form.swisstopo.failed')
      }
      expect(wrapper.find('.lookup-skeleton').exists()).toBe(false)
    })

    it('drops the answer of a superseded pick', async () => {
      const first = pending<number | null>(mockGetElevation)
      const wrapper = mountForm({ currentGoal: GOAL, pick: goalPick() })
      mockGetElevation.mockResolvedValueOnce(4049)
      await wrapper.setProps({ pick: goalPick(OTHER) })
      await flushPromises()
      expect(first.signal?.aborted).toBe(true)

      first.resolve(3905)
      await flushPromises()
      expect(value(wrapper, 'tf-elevation')).toBe('4049')
    })

    it('names the point after the picker search result without a nearby lookup', async () => {
      const wrapper = mountForm({ currentGoal: GOAL, pick: goalPick(GOAL, 'Piz Palü') })
      await flushPromises()
      expect(mockSuggestTourName).not.toHaveBeenCalled()
      expect(value(wrapper, 'tf-tourName')).toBe('Piz Palü')
    })

    it('looks nothing up for a form seeded from a saved tour', async () => {
      const wrapper = mountForm({ initialDraft: { name: 'Saved', elevation: 2000 } })
      await flushPromises()
      expect(mockSuggestTourName).not.toHaveBeenCalled()
      expect(mockGetElevation).not.toHaveBeenCalled()
      expect(value(wrapper, 'tf-tourName')).toBe('Saved')
    })

    it('cancels a removed start point\'s lookups so a late answer is never saved', async () => {
      const name = pending<string | null>(mockSuggestTourName)
      const wrapper = mountForm({ pick: { type: 'start', location: GOAL } })
      await flushPromises()
      await wrapper.find('[data-testid="remove-start-btn"]').trigger('click')
      expect(name.signal?.aborted).toBe(true)

      name.resolve('Bernina Hospiz')
      await flushPromises()
      await wrapper.find('#tf-tourName').setValue('Tour')
      await wrapper.find('form').trigger('submit.prevent')
      const draft = (wrapper.emitted('submit')![0] as unknown[])[0] as Record<string, unknown>
      expect(draft.startPointName).toBeNull()
    })

    it('shows a connected stage\'s end without a start, and offers a new end once that end goes', async () => {
      const wrapper = mountForm({
        initialDraft: { name: 'Stage 0', startPoint: null, endPoint: { lng: 8.4, lat: 46.7 }, endPointName: 'Tierberglihütte' },
      })
      expect(wrapper.find('[data-testid="remove-start-btn"]').exists()).toBe(false)
      expect((wrapper.find('#tf-end-name').element as HTMLInputElement).value).toBe('Tierberglihütte')
      await wrapper.find('[data-testid="remove-end-btn"]').trigger('click')
      // Nothing left to show: start and end fold, "Set by hand" brings them back.
      expect(wrapper.find('[data-testid=points-fold]').exists()).toBe(true)
      await byHand(wrapper)
      expect(wrapper.find('.point-section--end').text()).toContain('tours.form.addEndPointBtn')
    })

    it('keeps the end when the start is removed — an end stands on its own (a connected stage)', async () => {
      const end = { lng: 8.4, lat: 46.7 }
      const wrapper = mountForm({
        initialDraft: { name: 'Stage 1', startPoint: GOAL, startPointName: 'Hut', endPoint: end, endPointName: 'Tierberglihütte', endPointElevation: 2795 },
      })
      await wrapper.find('[data-testid="remove-start-btn"]').trigger('click')
      expect(wrapper.find('[data-testid="remove-end-btn"]').exists()).toBe(true)
      await wrapper.find('form').trigger('submit.prevent')
      expect(wrapper.emitted('submit')![0]![0]).toMatchObject({
        startPoint: null,
        startPointName: null,
        endPoint: end,
        endPointName: 'Tierberglihütte',
        endPointElevation: 2795,
      })
    })
  })

  describe('end date (multi-day span)', () => {
    async function fillAndSubmit(wrapper: ReturnType<typeof mountForm>, start: string, end: string) {
      await wrapper.find('#tf-tourName').setValue('Hut Tour')
      await wrapper.find('#tf-plannedDate').setValue(start)
      await wrapper.find('#tf-endDate').setValue(end)
      await wrapper.find('form').trigger('submit.prevent')
    }

    it('blocks submit and shows an error when the end date is before the start', async () => {
      const wrapper = mountForm()
      await fillAndSubmit(wrapper, '2026-08-25', '2026-08-20')
      expect(wrapper.emitted('submit')).toBeUndefined()
      expect(wrapper.find('#tf-endDate').classes()).toContain('input--error')
    })

    it('clears the end date when the planned date is cleared', async () => {
      const wrapper = mountForm()
      await wrapper.find('#tf-plannedDate').setValue('2026-08-25')
      await wrapper.find('#tf-endDate').setValue('2026-08-27')
      await wrapper.find('#tf-plannedDate').setValue('')
      await nextTick()
      expect((wrapper.find('#tf-endDate').element as HTMLInputElement).value).toBe('')
    })

    it('submits a null endDate when only the planned date is set', async () => {
      const wrapper = mountForm()
      await wrapper.find('#tf-tourName').setValue('Day Hike')
      await wrapper.find('#tf-plannedDate').setValue('2026-08-25')
      await wrapper.find('form').trigger('submit.prevent')
      expect(wrapper.emitted('submit')![0]![0]).toMatchObject({ endDate: null })
    })
  })
})

/** The attachments picker owns the SECOND file input — the first belongs to GPX. */
async function stageFile(wrapper: ReturnType<typeof mountForm>, file: File) {
  const input = wrapper.find('.picker__hidden-input')
  Object.defineProperty(input.element, 'files', { value: { 0: file, length: 1 }, configurable: true })
  await input.trigger('change')
  await nextTick()
}

describe('tourForm — suggest mode attachment cap (D10)', () => {
  const owned = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `att-${i}`,
      tourId: 't1',
      mimeType: 'image/jpeg',
      originalFilename: `own-${i}.jpg`,
      sizeBytes: 10,
      sortOrder: i,
    }))

  function mountSuggest(existing: number) {
    return mount(TourForm, {
      props: { submitLabel: 'Suggest', mode: 'suggest', tourId: 't1', initialDraft: { name: 'Tour' } },
      global: {
        // Real actions: `stage` is the guard under test, and toggling a removal has to
        // move the picker's remaining slots for real.
        plugins: [createTestingPinia({
          createSpy: vi.fn,
          stubActions: false,
          initialState: {
            contacts: { contacts: [] },
            tourAttachments: { attachmentsByTour: { t1: owned(existing) } },
          },
        })],
        stubs: { ContactChip: true },
      },
    })
  }

  it('offers no add button on a full tour — the owner\'s files count against the cap', async () => {
    // The picker used to measure only what the partner staged, so a tour holding five
    // still looked empty and four more adds could be proposed.
    const wrapper = mountSuggest(5)
    await nextTick()

    expect(wrapper.find('[data-testid="picker-limit"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('tours.suggestions.capHintSuggester')
  })

  it('frees a slot as soon as a removal is proposed', async () => {
    const wrapper = mountSuggest(5)
    await nextTick()

    await wrapper.findAll('.removal-row')[0].trigger('click')

    expect(wrapper.find('[data-testid="picker-limit"]').exists()).toBe(false)
  })

  it('blocks submit when un-marking a removal pushes the batch over the limit', async () => {
    const wrapper = mountSuggest(5)
    await nextTick()

    // Make room, take it, then take the room back — the picker can't gate this one.
    await wrapper.findAll('.removal-row')[0].trigger('click')
    await stageFile(wrapper, new File(['x'], 'new.jpg', { type: 'image/jpeg' }))
    await wrapper.findAll('.removal-row')[0].trigger('click')

    expect(wrapper.find('[data-testid="attachment-overflow"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="submit-btn"]').attributes('disabled')).toBeDefined()

    await wrapper.find('form').trigger('submit.prevent')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })
})

describe('tourForm — creation that knows more (smarter-tour-creation)', () => {
  const GOAL = { lng: 8.4551, lat: 46.6989 }

  beforeEach(() => {
    mockGetElevation.mockReset().mockResolvedValue(1865)
    mockSuggestTourName.mockReset().mockResolvedValue('Steingletscher')
    mockFindStopsNear.mockReset().mockResolvedValue([])
  })

  async function submitted(wrapper: ReturnType<typeof mountForm>) {
    await wrapper.find('#tf-tourName').setValue('Sustenhorn')
    await wrapper.find('form').trigger('submit.prevent')
    return (wrapper.emitted('submit')!.at(-1) as unknown[])[0] as Record<string, unknown>
  }
  const selectedSeasons = (wrapper: ReturnType<typeof mountForm>) =>
    wrapper.findAll('.season-chip.selected').map(c => c.text())

  it('should derive the seasons from the dates until the user picks one', async () => {
    const wrapper = mountForm({ currentGoal: GOAL })
    await wrapper.find('#tf-plannedDate').setValue('2027-02-26')
    await wrapper.find('#tf-endDate').setValue('2027-03-02')
    expect(selectedSeasons(wrapper)).toEqual(['tours.season.winter', 'tours.season.spring'])

    await wrapper.findAll('.season-chip')[2]!.trigger('click')
    await wrapper.find('#tf-plannedDate').setValue('2027-07-01')
    expect(selectedSeasons(wrapper)).toEqual(['tours.season.winter', 'tours.season.spring', 'tours.season.summer'])
  })

  it('should leave seasons that don\'t match the dates alone in an edit', async () => {
    const wrapper = mountForm({
      currentGoal: GOAL,
      initialDraft: { name: 'X', plannedDate: new Date('2027-03-13'), seasons: ['winter'], tourTypes: [], partnerIds: [] },
    })
    await wrapper.find('#tf-plannedDate').setValue('2027-07-13')
    expect(selectedSeasons(wrapper)).toEqual(['tours.season.winter'])
  })

  it('should send a trimmed grade and the start time, and drop the time with the date', async () => {
    const wrapper = mountForm({ currentGoal: GOAL })
    expect(wrapper.find('#tf-startTime').attributes('disabled')).toBeDefined()
    await wrapper.find('#tf-plannedDate').setValue('2027-03-13')
    await wrapper.find('#tf-startTime').setValue('06:30')
    await wrapper.find('#tf-grade').setValue(' ZS- ')
    expect(await submitted(wrapper)).toMatchObject({ grade: 'ZS-', startTime: '06:30' })

    await wrapper.find('#tf-plannedDate').setValue('')
    expect(await submitted(wrapper)).toMatchObject({ startTime: null, plannedDate: null })
  })

  it('should offer the activity\'s grade scale and set the grade from a chip', async () => {
    const wrapper = mountForm({ currentGoal: GOAL })
    expect(wrapper.find('[data-testid=grade-chip]').exists()).toBe(false)
    await wrapper.find('[data-type=hiking]').trigger('click')
    const chips = wrapper.findAll('[data-testid=grade-chip]')
    expect(chips.map(c => c.text())).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6'])
    await chips[3]!.trigger('click')
    expect((wrapper.find('#tf-grade').element as HTMLInputElement).value).toBe('T4')
  })

  it('should hold one grade per scale and drop a scale\'s grade with its activity', async () => {
    const wrapper = mountForm({ currentGoal: GOAL })
    const grade = () => (wrapper.find('#tf-grade').element as HTMLInputElement).value
    const chip = (g: string) => wrapper.findAll('[data-testid=grade-chip]').find(c => c.text() === g)!
    await wrapper.find('[data-type=hiking]').trigger('click')
    await wrapper.find('[data-type=mountain-biking]').trigger('click')
    await chip('T3').trigger('click')
    await chip('S2').trigger('click')
    expect(grade()).toBe('T3, S2')

    await wrapper.find('#tf-grade').setValue('t3+, S2, 5c')
    expect(chip('T3').attributes('aria-pressed')).toBe('true')
    await wrapper.find('[data-type=mountain-biking]').trigger('click')
    expect(grade()).toBe('t3+, 5c')
    expect(await submitted(wrapper)).toMatchObject({ grade: 'T3+, 5c' })
  })

  it('should not let a chip push the grade past what the database takes', async () => {
    const wrapper = mountForm({ currentGoal: GOAL })
    await wrapper.find('[data-type=hiking]').trigger('click')
    await wrapper.find('[data-type=mountaineering]').trigger('click')
    await wrapper.find('#tf-grade').setValue('ZS+ (III-IV), 5c+')
    await wrapper.findAll('[data-testid=grade-chip]').find(c => c.text() === 'T5')!.trigger('click')
    expect((wrapper.find('#tf-grade').element as HTMLInputElement).value).toBe('ZS+ (III-IV), 5c+')
  })

  it('should set up a hike & fly in two taps and save its legs', async () => {
    const wrapper = mountForm({ currentGoal: GOAL })
    expect(wrapper.find('[data-testid=activity-legs]').exists()).toBe(false)
    await wrapper.find('[data-type=hiking]').trigger('click')
    expect(wrapper.find('[data-testid=activity-legs]').exists()).toBe(false)
    await wrapper.find('[data-type=paragliding]').trigger('click')
    const way = (type: string) => wrapper.find(`[data-leg=${type}] [aria-checked=true]`).attributes('data-way')
    expect([way('hiking'), way('paragliding')]).toEqual(['up', 'down'])
    expect(await submitted(wrapper)).toMatchObject({ tourTypes: ['paragliding', 'hiking'], legs: { ascent: ['hiking'], descent: ['paragliding'] } })
  })

  it('should keep a tapped way when a third activity joins, and unsplit when all go both ways', async () => {
    const wrapper = mountForm({ currentGoal: GOAL })
    await wrapper.find('[data-type=hiking]').trigger('click')
    await wrapper.find('[data-type=mountain-biking]').trigger('click')
    await wrapper.find('[data-leg=hiking] [data-way=up]').trigger('click')
    await wrapper.find('[data-leg=mountain-biking] [data-way=down]').trigger('click')
    expect(await submitted(wrapper)).toMatchObject({ legs: { ascent: ['hiking'], descent: ['mountain-biking'] } })
    await wrapper.find('[data-leg=hiking] [data-way=both]').trigger('click')
    await wrapper.find('[data-leg=mountain-biking] [data-way=both]').trigger('click')
    expect(await submitted(wrapper)).toMatchObject({ legs: null })
  })

  it('should not let the last activity on a way leave it', async () => {
    const wrapper = mountForm({ currentGoal: GOAL })
    await wrapper.find('[data-type=hiking]').trigger('click')
    await wrapper.find('[data-type=mountain-biking]').trigger('click')
    const disabled = (type: string, way: string) => wrapper.find(`[data-leg=${type}] [data-way=${way}]`).attributes('disabled') !== undefined
    expect([disabled('mountain-biking', 'up'), disabled('hiking', 'down'), disabled('mountain-biking', 'both')]).toEqual([true, true, false])
    expect(wrapper.find('[data-testid=activity-legs] .hint').text()).toContain('tours.form.legs.needsOne')
  })

  it('should show and save the defaults when removing an activity leaves a way empty', async () => {
    const wrapper = mountForm({ currentGoal: GOAL })
    for (const type of ['hiking', 'mountain-biking', 'paragliding'])
      await wrapper.find(`[data-type=${type}]`).trigger('click')
    await wrapper.find('[data-leg=mountain-biking] [data-way=up]').trigger('click')
    await wrapper.find('[data-type=paragliding]').trigger('click')
    expect(wrapper.find('[data-leg=mountain-biking] [aria-checked=true]').attributes('data-way')).toBe('down')
    expect(await submitted(wrapper)).toMatchObject({ legs: { ascent: ['hiking'], descent: ['mountain-biking'] } })
  })

  it('should give an activity added back the way it had', async () => {
    const wrapper = mountForm({ currentGoal: GOAL })
    await wrapper.find('[data-type=hiking]').trigger('click')
    await wrapper.find('[data-type=paragliding]').trigger('click')
    await wrapper.find('[data-leg=paragliding] [data-way=both]').trigger('click')
    await wrapper.find('[data-type=paragliding]').trigger('click')
    await wrapper.find('[data-type=paragliding]').trigger('click')
    expect(wrapper.find('[data-leg=paragliding] [aria-checked=true]').attributes('data-way')).toBe('both')
  })

  it('should let a lone glider fly from the start, and keep it so in an edit', async () => {
    const wrapper = mountForm({ currentGoal: GOAL })
    await wrapper.find('[data-type=paragliding]').trigger('click')
    expect(wrapper.findAll('[data-leg=paragliding] [data-way]').map(w => w.attributes('data-way'))).toEqual(['both', 'down'])
    expect(await submitted(wrapper)).toMatchObject({ legs: null })
    await wrapper.find('[data-leg=paragliding] [data-way=both]').trigger('click')
    expect(await submitted(wrapper)).toMatchObject({ legs: { ascent: ['paragliding'], descent: ['paragliding'] } })
    const edit = mountForm({
      currentGoal: GOAL,
      initialDraft: { name: 'X', plannedDate: null, tourTypes: ['paragliding'], partnerIds: [], legs: { ascent: ['paragliding'], descent: ['paragliding'] } },
    })
    expect(edit.find('[data-leg=paragliding] [aria-checked=true]').attributes('data-way')).toBe('both')
  })

  it('should leave an unsplit multi-activity tour unsplit in an edit', async () => {
    const wrapper = mountForm({
      currentGoal: GOAL,
      initialDraft: { name: 'X', plannedDate: null, tourTypes: ['paragliding', 'hiking'], partnerIds: [], legs: null },
    })
    expect(await submitted(wrapper)).toMatchObject({ legs: null })
  })

  it('should flag a landing picked in the wrong valley by its distance from the goal', async () => {
    const wrapper = mountForm({
      currentGoal: GOAL,
      initialDraft: { name: 'X', plannedDate: null, tourTypes: ['paragliding'], partnerIds: [], startPoint: { lng: 8.4, lat: 46.7 }, endPoint: { lng: 7.6, lat: 47.4 } },
    })
    const [start, end] = wrapper.findAll('[data-testid=point-distance]')
    expect([start!.classes('far'), end!.classes('far')]).toEqual([false, true])
    expect(end!.text()).toBe('tours.form.farFromGoal')
  })

  it('should call the end of a flown way down the landing, without a round trip', async () => {
    const wrapper = mountForm({
      currentGoal: GOAL,
      initialDraft: { name: 'X', plannedDate: null, tourTypes: ['paragliding'], partnerIds: [], startPoint: { lng: 8.4, lat: 46.7 } },
    })
    expect(wrapper.find('.point-section--end .point-section-title').text()).toBe('tours.form.landingLabel')
    expect(wrapper.find('.point-section--end').text()).not.toContain('tours.form.roundTripBtn')
  })

  it('should offer a lone glider\'s landing without a start, and no round trip', async () => {
    const wrapper = mountForm({ currentGoal: GOAL, initialDraft: { name: 'X', plannedDate: null, tourTypes: ['paragliding'], partnerIds: [] } })
    await byHand(wrapper)
    const end = wrapper.find('.point-section--end')
    expect(end.text()).toContain('tours.form.addLandingBtn')
    expect(end.text()).not.toContain('tours.form.roundTripBtn')
  })

  it('should say what a stage is once the dates span more than one day', async () => {
    const wrapper = mountForm({ currentGoal: GOAL })
    await wrapper.find('#tf-plannedDate').setValue('2027-03-12')
    await wrapper.find('#tf-endDate').setValue('2027-03-12')
    expect(wrapper.find('[data-testid=multi-day-hint]').exists()).toBe(false)
    await wrapper.find('#tf-endDate').setValue('2027-03-14')
    expect(wrapper.find('[data-testid=multi-day-hint]').exists()).toBe(true)
  })

  it('should set the start from a suggestion with its name and a looked-up height', async () => {
    mockFindStopsNear.mockResolvedValue([{ name: 'Steingletscher, Susten', lng: 8.4275, lat: 46.7311, distance: 4200 }])
    const wrapper = mountForm({ currentGoal: GOAL })
    await byHand(wrapper)
    await flushPromises()
    await wrapper.find('[data-testid=point-suggestion]').trigger('click')
    await flushPromises()
    expect(await submitted(wrapper)).toMatchObject({
      startPoint: { lng: 8.4275, lat: 46.7311 },
      startPointName: 'Steingletscher, Susten',
      startPointElevation: 1865,
    })
    expect(mockSuggestTourName).not.toHaveBeenCalled()
  })

  describe('a picked GPX fills empty points', () => {
    const track = (coordinates: number[][]): GeoJSON.FeatureCollection =>
      ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }] })

    beforeEach(() => {
      mockUploadGpx.mockResolvedValue('user-abc/new-tour-id.gpx')
    })

    it('should make a loop a round trip from its first point', async () => {
      vi.mocked(parseGpxFile).mockResolvedValue(track([[8.4275, 46.7311], [8.4551, 46.6989], [8.4276, 46.7312]]))
      const wrapper = mountForm({ currentGoal: GOAL })
      await pickFile(wrapper, new File(['<gpx/>'], 'loop.gpx'))
      await flushPromises()
      const draft = await submitted(wrapper)
      expect(draft.startPoint).toEqual({ lng: 8.4275, lat: 46.7311 })
      expect(draft.endPoint).toEqual(draft.startPoint)
      expect(draft).toMatchObject({ startPointName: 'Steingletscher', endPointName: 'Steingletscher', endPointElevation: 1865 })
    })

    it('should name no point at the goal — a flight from it has no start, a walk up it no end, a top landing neither', async () => {
      const valley = [8.40, 46.73]
      vi.mocked(parseGpxFile).mockResolvedValue(track([[GOAL.lng + 0.001, GOAL.lat], valley]))
      const flight = mountForm({ currentGoal: GOAL })
      await pickFile(flight, new File(['<gpx/>'], 'flight.gpx'))
      await flushPromises()
      expect(await submitted(flight)).toMatchObject({ startPoint: null, endPoint: { lng: 8.40, lat: 46.73 } })

      vi.mocked(parseGpxFile).mockResolvedValue(track([valley, [GOAL.lng, GOAL.lat + 0.001]]))
      const walkUp = mountForm({ currentGoal: GOAL })
      await pickFile(walkUp, new File(['<gpx/>'], 'walk-up.gpx'))
      await flushPromises()
      expect(await submitted(walkUp)).toMatchObject({ startPoint: { lng: 8.40, lat: 46.73 }, endPoint: null })

      vi.mocked(parseGpxFile).mockResolvedValue(track([[GOAL.lng + 0.001, GOAL.lat], valley, [GOAL.lng, GOAL.lat + 0.001]]))
      const topLanding = mountForm({ currentGoal: GOAL })
      await pickFile(topLanding, new File(['<gpx/>'], 'top-landing.gpx'))
      await flushPromises()
      expect(await submitted(topLanding)).toMatchObject({ startPoint: null, endPoint: null })
    })

    it('should never move a point the user set', async () => {
      vi.mocked(parseGpxFile).mockResolvedValue(track([[8.40, 46.73], [8.4551, 46.6989], [8.50, 46.75]]))
      const wrapper = mountForm({
        currentGoal: GOAL,
        initialDraft: { name: 'X', startPoint: { lng: 8.43, lat: 46.71 }, startPointName: 'Tierberglihütte SAC', tourTypes: [], partnerIds: [] },
      })
      await pickFile(wrapper, new File(['<gpx/>'], 'traverse.gpx'))
      await flushPromises()
      expect(await submitted(wrapper)).toMatchObject({
        startPoint: { lng: 8.43, lat: 46.71 },
        startPointName: 'Tierberglihütte SAC',
        endPoint: { lng: 8.50, lat: 46.75 },
      })
    })
  })

  describe('start and end follow the track (design D9)', () => {
    const track = (coordinates: number[][]): GeoJSON.FeatureCollection =>
      ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }] })

    beforeEach(() => {
      mockUploadGpx.mockResolvedValue('user-abc/new-tour-id.gpx')
    })

    it('should fold start and end until something sets them, and show the track first', async () => {
      const wrapper = mountForm({ currentGoal: GOAL })
      expect(wrapper.find('.point-section--start').exists()).toBe(false)
      const html = wrapper.html()
      expect(html.indexOf('type-chip')).toBeLessThan(html.indexOf('gpx-draw-btn'))
      expect(html.indexOf('gpx-draw-btn')).toBeLessThan(html.indexOf('points-fold'))
      expect(html.indexOf('points-fold')).toBeLessThan(html.indexOf('grade-input'))
      vi.mocked(parseGpxFile).mockResolvedValue(track([[8.40, 46.73], [GOAL.lng, GOAL.lat + 0.001]]))
      await pickFile(wrapper, new File(['<gpx/>'], 'up.gpx'))
      await flushPromises()
      expect(wrapper.find('[data-testid=start-from-track]').exists()).toBe(true)
      expect(wrapper.find('[data-testid=points-fold]').exists()).toBe(false)
      // The track's own numbers on its tile (no heights here: the length alone).
      expect(wrapper.find('[data-testid=gpx-numbers]').text()).toMatch(/km/)
      // Replacing is a labelled button beside the edit, not a bare icon.
      expect(wrapper.find('[data-testid=gpx-replace-btn]').text()).toContain('tours.form.gpxReplaceTooltip')
    })

    it('should move the ends a track set to the next track\'s, and clear one that now lies at the goal', async () => {
      vi.mocked(parseGpxFile).mockResolvedValue(track([[8.40, 46.73], [8.4551, 46.6989], [8.50, 46.75]]))
      const wrapper = mountForm({ currentGoal: GOAL })
      await pickFile(wrapper, new File(['<gpx/>'], 'first.gpx'))
      await flushPromises()
      vi.mocked(parseGpxFile).mockResolvedValue(track([[8.41, 46.72], [8.4551, 46.6989], [GOAL.lng, GOAL.lat + 0.001]]))
      await pickFile(wrapper, new File(['<gpx/>'], 'second.gpx'))
      await flushPromises()
      expect(await submitted(wrapper)).toMatchObject({ startPoint: { lng: 8.41, lat: 46.72 }, endPoint: null, endPointName: null })
    })

    it('should keep an end the user renamed, though the track set it', async () => {
      vi.mocked(parseGpxFile).mockResolvedValue(track([[8.40, 46.73], [8.4551, 46.6989], [8.50, 46.75]]))
      const wrapper = mountForm({ currentGoal: GOAL })
      await pickFile(wrapper, new File(['<gpx/>'], 'first.gpx'))
      await flushPromises()
      await wrapper.find('#tf-end-name').setValue('Parkplatz')
      await wrapper.find('#tf-end-name').trigger('input')
      vi.mocked(parseGpxFile).mockResolvedValue(track([[8.40, 46.73], [8.4551, 46.6989], [8.52, 46.76]]))
      await pickFile(wrapper, new File(['<gpx/>'], 'second.gpx'))
      await flushPromises()
      expect(wrapper.find('[data-testid=end-from-track]').exists()).toBe(false)
      expect(await submitted(wrapper)).toMatchObject({ startPoint: { lng: 8.40, lat: 46.73 }, endPoint: { lng: 8.50, lat: 46.75 }, endPointName: 'Parkplatz' })
    })
  })

  describe('a track drawn on the map (#323)', () => {
    const LINE: [number, number][] = [[8.40, 46.73], [8.42, 46.72], [8.4551, 46.6989]]
    const DRAWN = { points: [LINE[0]!, LINE[2]!], legs: [LINE] }
    const asTrack = (coordinates: number[][]): GeoJSON.FeatureCollection =>
      ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }] })

    beforeEach(() => {
      mockUploadGpx.mockReset().mockResolvedValue('user-abc/new-tour-id.gpx')
      vi.mocked(parseGpxFile).mockResolvedValue(asTrack(LINE))
    })

    it('should hold Save while the drawing gets its heights, then upload it with them', async () => {
      let answer!: (p: unknown) => void
      mockGetTrackProfile.mockReturnValue(new Promise((resolve) => {
        answer = resolve
      }))
      const wrapper = mountForm({ currentGoal: GOAL, drawnTrack: DRAWN })
      await flushPromises()
      await wrapper.find('#tf-tourName').setValue('Sustenhorn')
      await wrapper.find('form').trigger('submit.prevent')
      expect(wrapper.emitted('submit')).toBeUndefined()

      answer({ line: LINE, heights: [1900, 2400, 3500] })
      await flushPromises()
      const file = mockUploadGpx.mock.calls[0]![2] as File
      expect(await file.text()).toContain('<ele>3500</ele>')
      expect(wrapper.emitted('trackChange')!.at(-1)).toEqual([LINE])
    })

    it('should name the drawing\'s ends while its heights load, and not look them up again once they come', async () => {
      mockGetTrackProfile.mockReturnValue(new Promise(() => {}))
      mockSuggestTourName.mockClear()
      const wrapper = mountForm({ currentGoal: GOAL, drawnTrack: DRAWN })
      await flushPromises()
      expect(wrapper.find('[data-testid=start-from-track]').exists()).toBe(true)
      expect(mockSuggestTourName).toHaveBeenCalledWith({ lng: 8.40, lat: 46.73 }, expect.anything())
      const lookups = mockSuggestTourName.mock.calls.length

      // Heights in, the GPX parsed: same ends, so the same names stand.
      mockGetTrackProfile.mockResolvedValue({ line: LINE, heights: [1900, 2400, 3500] })
      await wrapper.setProps({ drawnTrack: { ...DRAWN } })
      await flushPromises()
      expect(mockSuggestTourName).toHaveBeenCalledTimes(lookups)
    })

    it('should still take the drawing without heights when the profile is out of reach, through the same points', async () => {
      mockGetTrackProfile.mockResolvedValue(null)
      const wrapper = mountForm({ currentGoal: GOAL, drawnTrack: DRAWN })
      await flushPromises()
      const file = mockUploadGpx.mock.calls[0]![2] as File
      const gpx = await file.text()
      expect(gpx).not.toContain('<ele>')
      // Densified as with heights: a route planned twice stays one track, whatever the profile did.
      expect(gpx.match(/<trkpt/g)!.length).toBeGreaterThan(100)
      expect((await submitted(wrapper)).gpxFilepath).toBe('user-abc/new-tour-id.gpx')
    })

    it('should go on from the saved track, loaded first, when editing', async () => {
      mockLoadGpxTrack.mockResolvedValue(asTrack(LINE))
      const wrapper = mountForm({ tourId: 't1', initialDraft: { name: 'X', gpxFilepath: 'user-abc/t1.gpx', tourTypes: [], partnerIds: [] } })
      await wrapper.find('[data-testid="gpx-edit-btn"]').trigger('click')
      await flushPromises()
      expect(mockLoadGpxTrack).toHaveBeenCalledWith({ id: 't1', gpxFilepath: 'user-abc/t1.gpx' })
      const [seed] = wrapper.emitted('drawTrack')![0] as [{ points: unknown[], legs: unknown[][] }]
      expect(seed.points[0]).toEqual(LINE[0])
      expect(seed.legs.flat().at(-1)).toEqual(LINE[2])
    })
  })
})

describe('tourForm — map-first creation (map-first-tour-creation)', () => {
  beforeEach(() => {
    mockGetElevation.mockReset().mockResolvedValue(999)
    mockSuggestTourName.mockReset().mockResolvedValue('Looked up')
  })

  it('should take the route step\'s name and height without asking Swisstopo again, and look up only what it lacks', async () => {
    const wrapper = mountForm({
      currentGoal: { lng: 8.4, lat: 46.8 },
      pick: [
        { type: 'start', location: { lng: 8.3, lat: 46.7 }, name: 'Engelberg', elevation: 1002 },
        { type: 'end', location: { lng: 8.5, lat: 46.9 } },
      ],
    })
    await flushPromises()

    expect((wrapper.find('#tf-start-name').element as HTMLInputElement).value).toBe('Engelberg')
    expect((wrapper.find('#tf-start-elevation').element as HTMLInputElement).value).toBe('1002')
    expect((wrapper.find('#tf-end-name').element as HTMLInputElement).value).toBe('Looked up')
    expect(mockGetElevation).toHaveBeenCalledTimes(1)
  })

  it('should show a height the route step couldn\'t find as failed, not look it up again', async () => {
    const wrapper = mountForm({ currentGoal: { lng: 8.4, lat: 46.8 }, pick: [{ type: 'start', location: { lng: 8.3, lat: 46.7 }, name: 'Erlen', elevation: null }] })
    await flushPromises()
    expect(mockGetElevation).not.toHaveBeenCalled()
    expect((wrapper.find('#tf-start-elevation').element as HTMLInputElement).value).toBe('')
  })

  it('should drop the end the route step removed, keeping the start', async () => {
    const seed = { tourTypes: [], startPoint: { lng: 8.3, lat: 46.7 }, startPointName: 'A', endPoint: { lng: 8.5, lat: 46.9 }, endPointName: 'B' }
    const wrapper = mountForm({ currentGoal: { lng: 8.4, lat: 46.8 }, initialDraft: seed })
    await wrapper.setProps({ pick: [{ type: 'end', location: null }] })
    expect(wrapper.find('#tf-end-name').exists()).toBe(false)
    expect((wrapper.find('#tf-start-name').element as HTMLInputElement).value).toBe('A')
  })

  it('should offer the next day only where the stages are laid out', () => {
    expect(mountForm().find('[data-testid=next-day-btn]').exists()).toBe(false)
    expect(mountForm({ stages: true }).find('[data-testid=next-day-btn]').exists()).toBe(true)
  })

  it('should keep the first day of a split span and ask for the next with the day count', async () => {
    const wrapper = mountForm({ stages: true, initialDraft: { tourTypes: [], plannedDate: new Date('2027-03-12'), endDate: new Date('2027-03-14') } })
    await wrapper.find('[data-testid=split-days-btn]').trigger('click')

    expect(wrapper.emitted('nextDay')).toEqual([[3]])
    expect((wrapper.find('#tf-endDate').element as HTMLInputElement).value).toBe('')
  })

  it('should not collect a stage without a name, and not move the focus when asked not to', async () => {
    const wrapper = mountForm({ stages: true })
    const form = wrapper.vm as unknown as { collect: (focus?: boolean) => unknown }
    expect(form.collect(false)).toBeNull()
    await nextTick()
    expect(wrapper.find('#tf-tourName').classes()).toContain('input--error')
  })
})

describe('tourForm — the route is the track (map-first-tour-creation D9)', () => {
  const GOAL = { lng: 8.4, lat: 46.8 }
  const START: [number, number] = [8.3, 46.7]
  const route = (start: [number, number]) => ({ points: [start, [GOAL.lng, GOAL.lat]], legs: [[start, [GOAL.lng, GOAL.lat]]], goal: 1 })
  const asTrack = (coordinates: number[][]): GeoJSON.FeatureCollection =>
    ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }] })
  const startName = (wrapper: ReturnType<typeof mountForm>) => (wrapper.find('#tf-start-name').element as HTMLInputElement).value

  beforeEach(() => {
    mockUploadGpx.mockReset().mockResolvedValue('user-abc/new-tour-id.gpx')
    mockGetTrackProfile.mockReset().mockResolvedValue(null)
    mockGetElevation.mockReset().mockResolvedValue(1000)
    mockSuggestTourName.mockReset().mockResolvedValue('Looked up')
    vi.mocked(parseGpxFile).mockResolvedValue(asTrack([START, [GOAL.lng, GOAL.lat]]))
  })

  it('should keep the start\'s name when the track moves it a little, and name it anew when far', async () => {
    const wrapper = mountForm({ currentGoal: GOAL, pick: [{ type: 'start', location: { lng: START[0], lat: START[1] }, name: 'Engelberg', elevation: 1002 }], drawnTrack: route(START) })
    await flushPromises()
    await wrapper.setProps({ drawnTrack: route([START[0] + 0.0005, START[1]]) })
    await flushPromises()
    expect(startName(wrapper)).toBe('Engelberg')

    await wrapper.setProps({ drawnTrack: route([8.35, 46.72]) })
    await flushPromises()
    expect(startName(wrapper)).toBe('Looked up')
    expect(wrapper.find('[data-testid=start-from-track]').exists()).toBe(false)
  })

  it('should start a drawing as the route\'s start, goal and end while there is no track', async () => {
    const seed = { tourTypes: [], startPoint: { lng: 8.3, lat: 46.7 }, endPoint: { lng: 8.5, lat: 46.9 } }
    const wrapper = mountForm({ currentGoal: GOAL, initialDraft: seed })
    await wrapper.find('[data-testid=gpx-draw-btn]').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('drawTrack')![0]).toEqual([{ points: [[8.3, 46.7], [8.4, 46.8], [8.5, 46.9]], legs: [], goal: 1 }])
  })

  it('should name the goal by its place for the route step, not by a name typed for the tour', async () => {
    const wrapper = mountForm({ currentGoal: GOAL, pick: [{ type: 'goal', location: GOAL, name: 'Jochpass', elevation: 2207 }] })
    await flushPromises()
    await wrapper.find('#tf-tourName').setValue('Review Tag 1')
    const form = wrapper.vm as unknown as { route: () => { goal: { name: string, place: string | null } }, handover: { name: string } }
    expect(form.route().goal).toMatchObject({ name: 'Jochpass', place: 'Jochpass' })
    expect(form.handover.name).toBe('Jochpass')
  })

  it('should say the start is the goal for a track drawn from it, and offer no stops that would leave the track behind', async () => {
    vi.mocked(parseGpxFile).mockResolvedValue(asTrack([[GOAL.lng, GOAL.lat], [8.5, 46.9]]))
    const wrapper = mountForm({ currentGoal: GOAL, drawnTrack: { points: [[GOAL.lng, GOAL.lat], [8.5, 46.9]], legs: [[[GOAL.lng, GOAL.lat], [8.5, 46.9]]], goal: 0 } })
    await flushPromises()
    expect(wrapper.find('.point-section--start').text()).toContain('tours.form.trackFromGoal')
    expect(wrapper.findAllComponents(PointSuggestions)).toHaveLength(0)
  })

  it('should go back the way up on a round trip of a drawn route, its end named as its start', async () => {
    const wrapper = mountForm({ currentGoal: GOAL, pick: [{ type: 'start', location: { lng: START[0], lat: START[1] }, name: 'Engelberg', elevation: 1002 }], drawnTrack: route(START) })
    await flushPromises()
    const roundTrip = wrapper.find('.point-section--end').findAll('button').find(b => b.text().includes('tours.form.roundTripBtn'))!
    await roundTrip.trigger('click')
    await flushPromises()
    const form = wrapper.vm as unknown as { route: () => { drawing: unknown, end: { location: unknown, name: string } } }
    expect(form.route().drawing).toEqual({ points: [START, [GOAL.lng, GOAL.lat], START], legs: [[START, [GOAL.lng, GOAL.lat]], [[GOAL.lng, GOAL.lat], START]], goal: 1 })
    expect(form.route().end).toMatchObject({ location: { lng: START[0], lat: START[1] }, name: 'Engelberg' })
  })

  it('should take a drawn track away when its route goes straight, and keep an uploaded one', async () => {
    const drawn = mountForm({ currentGoal: GOAL, drawnTrack: route(START) })
    await flushPromises()
    await drawn.setProps({ drawnTrack: { points: [], legs: [] } })
    expect(drawn.find('[data-testid=gpx-remove-btn]').exists()).toBe(false)

    const uploaded = mountForm({ currentGoal: GOAL })
    await pickFile(uploaded, new File(['<gpx/>'], 'mine.gpx'))
    await flushPromises()
    await uploaded.setProps({ drawnTrack: { points: [], legs: [] } })
    expect(uploaded.find('[data-testid=gpx-remove-btn]').exists()).toBe(true)
  })
})
