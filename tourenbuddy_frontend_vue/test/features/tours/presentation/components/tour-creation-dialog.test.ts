import { createTestingPinia } from '@pinia/testing'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import TourCreationDialog from '@/features/tours/presentation/components/tour-creation-dialog.vue'

interface FormApi {
  collect: ReturnType<typeof vi.fn>
  discard: ReturnType<typeof vi.fn>
  adopt: ReturnType<typeof vi.fn>
  shared: { tourTypes: string[], partnerIds: string[], visibility: string }
  plannedDate: string
  handover: { location: { lng: number, lat: number }, name: string, elevation: number | null } | null
  start: { lng: number, lat: number } | null
  route: () => { start: { location: { lng: number, lat: number } } | null }
}
const forms: FormApi[] = []
const TourFormStub = {
  name: 'TourForm',
  template: '<button data-testid="stub-submit" @click="$emit(\'submit\')" />',
  props: ['formId', 'idPrefix', 'currentGoal', 'initialDraft', 'pick', 'drawnTrack', 'disabled', 'stages', 'submitLabel', 'embedded', 'allowGoalEdit'],
  emits: ['submit', 'cancel'],
  setup(_: unknown, { expose }: { expose: (api: object) => void }) {
    const api: FormApi = reactive({
      collect: vi.fn(),
      discard: vi.fn(),
      adopt: vi.fn((values: Partial<FormApi['shared'] & { plannedDate: string }>) => {
        const { plannedDate, ...shared } = values
        Object.assign(api.shared, shared)
        if (plannedDate !== undefined)
          api.plannedDate = plannedDate
      }),
      submitBlocked: false,
      tourName: 'Stage',
      plannedDate: '',
      shared: { tourTypes: [], partnerIds: [], visibility: 'friends' },
      handover: null,
      start: null,
      route: () => ({ start: api.start && { location: api.start } }),
    }) as FormApi
    forms.push(api)
    expose(api)
    return {}
  },
}

const stage = (key: string) => ({ key, goal: { lng: 8, lat: 46 }, seed: null, picks: null, drawnTrack: null })

function mountDialog(mapState: Record<string, unknown> = {}, stages = [stage('a'), stage('b')]) {
  forms.length = 0
  return mount(TourCreationDialog, {
    props: { stages, active: 0, title: 'New tour' },
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn, initialState: { map: { isPickingLocation: false, ...mapState } } })],
      stubs: { TourForm: TourFormStub, FullScreenPage: { template: '<div><slot /><slot name="page-action" /></div>', emits: ['close'] } },
    },
  })
}

describe('tourCreationDialog — stages', () => {
  it('should save nothing and bring the stage that can\'t be saved to the front', async () => {
    const wrapper = mountDialog()
    forms[0]!.collect.mockReturnValue({ draft: { name: 'Day 1' }, preUploadedTourId: null, draftId: 'd1' })
    forms[1]!.collect.mockReturnValue(null)

    await wrapper.find('[data-testid=stub-submit]').trigger('click')

    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.emitted('select')).toEqual([[1]])
  })

  it('should not save while a point is being set on the map', async () => {
    const wrapper = mountDialog({ isPickingLocation: true })
    await wrapper.find('[data-testid=stub-submit]').trigger('click')
    expect(forms[0]!.collect).not.toHaveBeenCalled()
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('should ask before discarding a planned tour, and keep everything when the user goes on', async () => {
    const wrapper = mountDialog()
    await wrapper.findComponent(TourFormStub).vm.$emit('cancel')
    expect(wrapper.emitted('close')).toBeUndefined()

    await wrapper.find('[data-testid=discard-keep]').trigger('click')
    expect(wrapper.find('[data-testid=discard-confirm]').exists()).toBe(false)
    expect(forms.every(f => f.discard.mock.calls.length === 0)).toBe(true)
  })

  it('should discard every stage\'s uploads once confirmed', async () => {
    const wrapper = mountDialog()
    await wrapper.findComponent(TourFormStub).vm.$emit('cancel')
    await wrapper.find('[data-testid=discard-confirm-btn]').trigger('click')
    expect(forms.map(f => f.discard.mock.calls.length)).toEqual([1, 1])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('should say which day of a split span is still missing and plan it', async () => {
    const wrapper = mountDialog()
    await wrapper.setProps({ dayOffset: 0, dayCount: 3 })
    expect(wrapper.find('[data-testid=missing-day]').text()).toContain('tours.creation.dayMissing')
    await wrapper.find('[data-testid=plan-missing-day]').trigger('click')
    expect(wrapper.emitted('nextDay')).toHaveLength(1)

    await wrapper.setProps({ stages: [stage('a'), stage('b'), stage('c')] })
    expect(wrapper.find('[data-testid=missing-day]').exists()).toBe(false)
  })
})

describe('tourCreationDialog — what the days share (D11)', () => {
  const trip = () => [stage('a'), stage('b'), stage('c')]

  it('should give a later day the first day\'s new activity only while it still held the old one', async () => {
    mountDialog({}, trip())
    forms[2]!.shared.tourTypes = ['ski_touring']
    await flushPromises()

    forms[0]!.shared = { ...forms[0]!.shared, tourTypes: ['hiking'] }
    await flushPromises()

    expect(forms[1]!.adopt).toHaveBeenCalledWith({ tourTypes: ['hiking'] })
    expect(forms[2]!.adopt).not.toHaveBeenCalled()
  })

  it('should move the dates along day by day, and leave a date set otherwise', async () => {
    mountDialog({}, trip())
    forms[0]!.plannedDate = '2027-07-10'
    await flushPromises()
    // The undated days took the dates after it; one set by hand now stays.
    expect([forms[1]!.plannedDate, forms[2]!.plannedDate]).toEqual(['2027-07-11', '2027-07-12'])
    forms[2]!.plannedDate = '2027-07-20'
    await flushPromises()

    forms[0]!.plannedDate = '2027-07-17'
    await flushPromises()
    expect([forms[1]!.plannedDate, forms[2]!.plannedDate]).toEqual(['2027-07-18', '2027-07-20'])
  })
})

describe('tourCreationDialog — the next day starts where a day ends (D11)', () => {
  const JOCH = { lng: 8.387, lat: 46.778 }

  it('should move the next day\'s start along with the day\'s end, but not a start set elsewhere', async () => {
    const wrapper = mountDialog({}, [stage('a'), stage('b'), stage('c')])
    forms[0]!.handover = { location: JOCH, name: 'Jochpass', elevation: 2207 }
    forms[1]!.start = { ...JOCH }
    forms[1]!.handover = { location: { lng: 8.34, lat: 46.77 }, name: 'Engstlenalp', elevation: 1834 }
    forms[2]!.start = { lng: 8.2, lat: 46.7 }
    await flushPromises()

    forms[0]!.handover = { location: { lng: 8.39, lat: 46.775 }, name: 'Jochstock', elevation: 2500 }
    forms[1]!.handover = { location: { lng: 8.35, lat: 46.77 }, name: 'Tannalp', elevation: 1974 }
    await flushPromises()

    expect(wrapper.emitted('handoverMoved')).toEqual([[1, { location: { lng: 8.39, lat: 46.775 }, name: 'Jochstock', elevation: 2500 }]])
  })

  it('should hand on the height looked up after the end moved, to the next day starting there', async () => {
    const wrapper = mountDialog({}, [stage('a'), stage('b')])
    forms[0]!.handover = { location: JOCH, name: 'Jochpass', elevation: 2207 }
    forms[1]!.start = { ...JOCH }
    await flushPromises()

    const moved = { lng: 8.39, lat: 46.775 }
    forms[0]!.handover = { location: moved, name: 'Jochstock', elevation: null }
    forms[1]!.start = { ...moved }
    await flushPromises()
    forms[0]!.handover = { location: moved, name: 'Jochstock', elevation: 2500 }
    await flushPromises()

    expect(wrapper.emitted('handoverMoved')!.at(-1)).toEqual([1, { location: moved, name: 'Jochstock', elevation: 2500 }])
  })
})
