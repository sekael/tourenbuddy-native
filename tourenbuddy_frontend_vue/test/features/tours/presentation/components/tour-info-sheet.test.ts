import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import BaseIcon from '@/core/components/base-icon.vue'
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store'
import TourInfoSheet from '@/features/tours/presentation/components/tour-info-sheet.vue'
import { TOUR_FILL } from '../../../../fixtures/tour-fill'

const mockDownloadOriginal = vi.fn()

vi.mock('@/features/tours/data/services/gpx-storage-service', () => ({
  downloadOriginal: (...args: unknown[]) => mockDownloadOriginal(...args),
  uploadGpx: vi.fn(),
  removeGpx: vi.fn(),
  getSignedUrl: vi.fn(),
}))

// Stub heavy child components
const BottomSheetStub = {
  name: 'BottomSheet',
  template:
    '<div :data-collapsed="collapsed ? \'true\' : \'false\'" :data-title="title"><slot /><slot name="default" /><slot name="footer" /></div>',
  props: ['title', 'collapsed'],
  emits: ['close'],
}
const SideDrawerStub = {
  name: 'SideDrawer',
  template:
    '<div :data-collapsed="collapsed ? \'true\' : \'false\'" :data-title="title"><slot /><slot name="default" /><slot name="footer" /></div>',
  props: ['title', 'collapsed'],
  emits: ['close'],
}
const TourFormStub = {
  name: 'TourForm',
  template:
    '<div data-testid="tour-form" :data-disabled="disabled ? \'true\' : \'false\'"><button data-testid="stub-submit" @click="$emit(\'submit\', stubDraft, false)">Save</button><button data-testid="stub-cancel" @click="$emit(\'cancel\')">Cancel</button></div>',
  props: [
    'submitLabel',
    'allowGoalEdit',
    'currentGoal',
    'initialDraft',
    'pick',
    'disabled',
  ],
  emits: ['submit', 'cancel', 'pickPoint'],
  setup() {
    const stubDraft = {
      name: 'Edited Tour',
      plannedDate: null,
      partnerIds: [],
      tourTypes: [],
      elevation: null,
      gpxFilepath: null,
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
    }
    return { stubDraft }
  },
}
const ContactChipStub = {
  name: 'ContactChip',
  template: '<div />',
  props: ['contact', 'selected', 'mode'],
  emits: ['open', 'toggle'],
}

const ContactActionMenuStub = {
  name: 'ContactActionMenu',
  template: '<div data-testid="contact-action-menu" />',
  props: ['contact', 'anchorRect'],
  emits: ['close', 'editContact'],
}

const mockTour = {
  ...TOUR_FILL,
  id: 'tour-1',
  userId: 'user-1',
  name: 'Rigi Tour',
  plannedDate: null,
  goal: { lng: 8.2, lat: 46.8 },
  partnerIds: [],
  tourTypes: [],
  elevation: null,
  gpxFilepath: null,
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
  completed: false,
}

function mountSheet(
  tourOverrides = {},
  authUserId = 'user-1',
  initialContacts: unknown[] = [],
  mapState: Record<string, unknown> = {},
  extraState: Record<string, unknown> = {},
  // `createTestingPinia` stubs every function a setup store returns — including read-only
  // helpers like `myPendingFor`, which then returns undefined. Tests that render off one
  // opt out; the rest keep the stubs so action calls stay assertable.
  stubActions = true,
) {
  return mount(TourInfoSheet, {
    props: { tour: { ...mockTour, ...tourOverrides } },
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions,
          initialState: {
            contacts: { contacts: initialContacts },
            tours: { tours: [mockTour] },
            auth: { currentUser: { id: authUserId }, isAuthenticated: true },
            map: { isPickingLocation: false, ...mapState },
            ...extraState,
          },
        }),
      ],
      stubs: {
        BottomSheet: BottomSheetStub,
        SideDrawer: SideDrawerStub,
        TourForm: TourFormStub,
        ContactChip: ContactChipStub,
        ContactActionMenu: ContactActionMenuStub,
        TourAttachmentsStrip: { template: '<div />' },
        TourAttachmentViewer: { template: '<div />' },
      },
    },
  })
}

describe('tourInfoSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('planned date rendering', () => {
    it('renders a span as a date range carrying both endpoints', () => {
      const wrapper = mountSheet({
        plannedDate: new Date(2026, 7, 25),
        endDate: new Date(2026, 7, 27),
      })
      // How much of the shared month/year `formatRange` collapses is ICU's call and
      // varies by locale data — assert the endpoints and the range dash, not the shape.
      expect(wrapper.text()).toMatch(/25[^-\n\r\u2013\u2028\u2029]*[-\u2013].*27/)
    })

    it('renders a single date when the tour has no end date', () => {
      const wrapper = mountSheet({ plannedDate: new Date(2026, 7, 25), endDate: null })
      expect(wrapper.text()).not.toContain('27')
    })
  })

  describe('add segment (#338)', () => {
    it('should swap the body for the add-segment view and hand a new goal pick to the page', async () => {
      const wrapper = mountSheet()
      await wrapper.find('[data-testid="add-segment-btn"]').trigger('click')
      expect(wrapper.find('[data-testid="edit-btn"]').exists()).toBe(false)
      await wrapper.find('[data-testid="add-segment-new"]').trigger('click')
      expect(wrapper.emitted('addSegment')).toEqual([[mockTour.id]])
    })

    it('should not offer it on a friend\'s tour', () => {
      const wrapper = mountSheet({}, 'someone-else')
      expect(wrapper.find('[data-testid="add-segment-btn"]').exists()).toBe(false)
    })
  })

  // ── Edit mode ──────────────────────────────────────────────────────────────

  describe('edit mode', () => {
    it('should show TourForm and hide detail view when edit is clicked', async () => {
      const wrapper = mountSheet()

      expect(wrapper.find('[data-testid="tour-form"]').exists()).toBe(false)

      await wrapper.find('[data-testid="edit-btn"]').trigger('click')

      expect(wrapper.find('[data-testid="tour-form"]').exists()).toBe(true)
    })

    it('should return to view mode when form cancel is triggered', async () => {
      const wrapper = mountSheet()

      // Enter edit mode
      await wrapper.find('[data-testid="edit-btn"]').trigger('click')

      expect(wrapper.find('[data-testid="tour-form"]').exists()).toBe(true)

      // Cancel
      await wrapper.find('[data-testid="stub-cancel"]').trigger('click')

      expect(wrapper.find('[data-testid="tour-form"]').exists()).toBe(false)
    })

    it('should call updateTour and return to view mode on successful save', async () => {
      const wrapper = mountSheet()
      const { useToursStore } = await import('@/features/tours/presentation/stores/tours-store')
      const store = useToursStore()
      vi.mocked(store.updateTour).mockResolvedValue({ queued: false, failed: false, value: undefined })

      // Enter edit
      await wrapper.find('[data-testid="edit-btn"]').trigger('click')

      // Submit via stub
      await wrapper.find('[data-testid="stub-submit"]').trigger('click')
      await wrapper.vm.$nextTick()

      expect(store.updateTour).toHaveBeenCalledWith(
        'tour-1',
        expect.objectContaining({ name: 'Edited Tour' }),
        { lng: 8.2, lat: 46.8 },
        false,
      )
      // Back to view mode
      expect(wrapper.find('[data-testid="tour-form"]').exists()).toBe(false)
    })

    it('should relay a pick to the form, and not replay it in the next edit session', async () => {
      const wrapper = mountSheet()
      await wrapper.find('[data-testid="edit-btn"]').trigger('click')
      const pick = { type: 'goal', location: { lng: 9.9, lat: 46.4 }, name: 'Piz Palü' }
      await wrapper.setProps({ editPickedPoint: pick })

      const form = () => wrapper.findComponent({ name: 'TourForm' })
      expect(form().props('pick')).toEqual(pick)
      expect(form().props('currentGoal')).toEqual(pick.location)
      expect(wrapper.emitted('pointConsumed')).toHaveLength(1)

      // The form looks up a pick on mount, so a stale one would refill a fresh session.
      await wrapper.find('[data-testid="stub-cancel"]').trigger('click')
      await wrapper.find('[data-testid="edit-btn"]').trigger('click')
      expect(form().props('pick')).toBeNull()
    })

    it('should collapse sheet and disable form while location picker is active', async () => {
      const wrapper = mountSheet({}, 'user-1', [], { isPickingLocation: true })
      await wrapper.find('[data-testid="edit-btn"]').trigger('click')

      const sheet = wrapper.find('[data-testid="tour-form"]').element.parentElement as HTMLElement
      // stubbed root of BottomSheet/SideDrawer
      const root = wrapper.element as HTMLElement
      expect(root.getAttribute('data-collapsed')).toBe('true')
      // collapsed title now shows pick-type label (defaults to goalTitle key when no activePickType)
      expect(root.getAttribute('data-title')).toContain('goalTitle')
      expect(wrapper.find('[data-testid="tour-form"]').attributes('data-disabled')).toBe('true')
      expect(sheet).toBeDefined()
    })

    it('should keep the mobile edit page and form mounted across a location pick (#337)', async () => {
      const realMatchMedia = window.matchMedia
      window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as typeof window.matchMedia
      const PageStub = { ...BottomSheetStub, name: 'FullScreenPage' }
      const wrapper = mount(TourInfoSheet, {
        props: { tour: mockTour },
        global: {
          plugins: [createTestingPinia({
            createSpy: vi.fn,
            initialState: { auth: { currentUser: { id: 'user-1' } }, map: { isPickingLocation: false } },
          })],
          stubs: { FullScreenPage: PageStub, BottomSheet: BottomSheetStub, TourForm: TourFormStub, TourAttachmentsStrip: true },
        },
      })
      await wrapper.find('[data-testid="edit-btn"]').trigger('click')
      const formUid = wrapper.findComponent(TourFormStub).vm.$.uid
      const { useMapStore } = await import('@/features/map/presentation/stores/map-store')
      useMapStore().isPickingLocation = true
      await nextTick()

      expect(wrapper.findComponent(PageStub).props('collapsed')).toBe(true)
      expect(wrapper.findComponent(TourFormStub).vm.$.uid).toBe(formUid)
      window.matchMedia = realMatchMedia
    })

    it('should not call updateTour when edit submit fires while picker is active', async () => {
      const wrapper = mountSheet({}, 'user-1', [], { isPickingLocation: true })
      const { useToursStore } = await import('@/features/tours/presentation/stores/tours-store')
      const store = useToursStore()

      await wrapper.find('[data-testid="edit-btn"]').trigger('click')
      await wrapper.find('[data-testid="stub-submit"]').trigger('click')
      await wrapper.vm.$nextTick()

      expect(store.updateTour).not.toHaveBeenCalled()
    })

    it('should show inline error and stay in edit mode when updateTour throws', async () => {
      const wrapper = mountSheet()
      const { useToursStore } = await import('@/features/tours/presentation/stores/tours-store')
      const store = useToursStore()
      vi.mocked(store.updateTour).mockRejectedValue(new Error('RPC failed'))

      await wrapper.find('[data-testid="edit-btn"]').trigger('click')

      await wrapper.find('[data-testid="stub-submit"]').trigger('click')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="tour-form"]').exists()).toBe(true)
      expect(wrapper.find('.save-error').text()).toBe('RPC failed')
    })
  })

  // ── Completion toggle ──────────────────────────────────────────────────────

  describe('completion toggle', () => {
    it('should show completion toggle for tour owner', async () => {
      const wrapper = mountSheet()
      expect(wrapper.find('.completion-toggle').exists()).toBe(true)
    })

    it('should not show completion toggle for non-owner', async () => {
      const wrapper = mountSheet({}, 'other-user')
      expect(wrapper.find('.completion-toggle').exists()).toBe(false)
    })

    it('should call setCompleted with true when not completed', async () => {
      const wrapper = mountSheet({ completed: false })
      const { useToursStore } = await import('@/features/tours/presentation/stores/tours-store')
      const store = useToursStore()

      await wrapper.find('.completion-toggle').trigger('click')
      await wrapper.vm.$nextTick()

      expect(store.setCompleted).toHaveBeenCalledWith('tour-1', true)
    })

    it('should call setCompleted with false when already completed', async () => {
      const wrapper = mountSheet({ completed: true })
      const { useToursStore } = await import('@/features/tours/presentation/stores/tours-store')
      const store = useToursStore()

      await wrapper.find('.completion-toggle').trigger('click')
      await wrapper.vm.$nextTick()

      expect(store.setCompleted).toHaveBeenCalledWith('tour-1', false)
    })

    it('should show check_circle icon when completed', () => {
      const wrapper = mountSheet({ completed: true })
      const icon = wrapper.find('.completion-toggle').findComponent(BaseIcon)
      expect(icon.props('name')).toBe('check_circle')
    })

    it('should show radio_button_unchecked icon when not completed', () => {
      const wrapper = mountSheet({ completed: false })
      const icon = wrapper.find('.completion-toggle').findComponent(BaseIcon)
      expect(icon.props('name')).toBe('radio_button_unchecked')
    })
  })

  // ── Delete flow ────────────────────────────────────────────────────────────

  describe('delete flow', () => {
    it('should show confirmation when delete button is clicked', async () => {
      const wrapper = mountSheet()

      const deleteBtn = wrapper.find('[data-testid="delete-btn"]')
      await deleteBtn.trigger('click')

      expect(wrapper.find('.delete-confirm-text').exists()).toBe(true)
    })

    it('should return to idle when cancel is clicked on confirm prompt', async () => {
      const wrapper = mountSheet()

      await wrapper.find('[data-testid="delete-btn"]').trigger('click')
      expect(wrapper.find('.delete-confirm-text').exists()).toBe(true)

      await wrapper.find('[data-testid="delete-cancel-btn"]').trigger('click')

      expect(wrapper.find('.delete-confirm-text').exists()).toBe(false)
      expect(wrapper.find('[data-testid="delete-btn"]').exists()).toBe(true)
    })

    it('should call deleteTour and emit close on successful delete', async () => {
      const wrapper = mountSheet()
      const { useToursStore } = await import('@/features/tours/presentation/stores/tours-store')
      const store = useToursStore()
      vi.mocked(store.deleteTour).mockResolvedValue({ queued: false, failed: false, value: undefined })

      await wrapper.find('[data-testid="delete-btn"]').trigger('click')
      await wrapper.find('[data-testid="delete-confirm-btn"]').trigger('click')
      await wrapper.vm.$nextTick()

      expect(store.deleteTour).toHaveBeenCalledWith('tour-1')
      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('should show error and not emit close when deleteTour throws', async () => {
      const wrapper = mountSheet()
      const { useToursStore } = await import('@/features/tours/presentation/stores/tours-store')
      const store = useToursStore()
      vi.mocked(store.deleteTour).mockRejectedValue(new Error('Delete failed'))

      await wrapper.find('[data-testid="delete-btn"]').trigger('click')
      await wrapper.find('[data-testid="delete-confirm-btn"]').trigger('click')
      await wrapper.vm.$nextTick()

      expect(wrapper.emitted('close')).toBeFalsy()
      expect(wrapper.find('.delete-error').text()).toBe('Delete failed')
    })
  })

  // ── Pick-type label in collapsed header ───────────────────────────────────

  describe('collapsed header label per activePickType', () => {
    function mountSheetWithPick(activePickType: 'goal' | 'start' | 'end') {
      return mount(TourInfoSheet, {
        props: {
          tour: { ...mockTour },
          activePickType,
        },
        global: {
          plugins: [
            createTestingPinia({
              createSpy: vi.fn,
              initialState: {
                contacts: { contacts: [] },
                tours: { tours: [mockTour] },
                auth: { currentUser: { id: 'user-1' }, isAuthenticated: true },
                map: { isPickingLocation: true },
              },
            }),
          ],
          stubs: {
            BottomSheet: BottomSheetStub,
            SideDrawer: SideDrawerStub,
            TourForm: TourFormStub,
            ContactChip: ContactChipStub,
            ContactActionMenu: ContactActionMenuStub,
            TourAttachmentsStrip: { template: '<div />' },
            TourAttachmentViewer: { template: '<div />' },
          },
        },
      })
    }

    it('shows goalTitle when activePickType is goal during edit pick', async () => {
      const wrapper = mountSheetWithPick('goal')
      await wrapper.find('[data-testid="edit-btn"]').trigger('click')
      expect((wrapper.element as HTMLElement).getAttribute('data-title')).toContain('goalTitle')
    })

    it('shows startTitle when activePickType is start during edit pick', async () => {
      const wrapper = mountSheetWithPick('start')
      await wrapper.find('[data-testid="edit-btn"]').trigger('click')
      expect((wrapper.element as HTMLElement).getAttribute('data-title')).toContain('startTitle')
    })

    it('shows endTitle when activePickType is end during edit pick', async () => {
      const wrapper = mountSheetWithPick('end')
      await wrapper.find('[data-testid="edit-btn"]').trigger('click')
      expect((wrapper.element as HTMLElement).getAttribute('data-title')).toContain('endTitle')
    })
  })

  // ── Start/end metadata and one-way indicator ───────────────────────────────

  describe('start/end point metadata display', () => {
    it('renders startPointName and startPointElevation when present', () => {
      const wrapper = mountSheet({
        startPoint: { lng: 8.0, lat: 46.5 },
        startPointName: 'Grindelwald',
        startPointElevation: 1034,
      })
      expect(wrapper.text()).toContain('Grindelwald')
      expect(wrapper.text()).toContain('1034')
    })

    it('renders "One-way to goal" indicator when start is set and end is null', () => {
      const wrapper = mountSheet({
        startPoint: { lng: 8.0, lat: 46.5 },
        endPoint: null,
      })
      expect(wrapper.text()).toContain('oneWayToGoalIndicator')
    })

    it('does not render one-way indicator when both start and end are set', () => {
      const wrapper = mountSheet({
        startPoint: { lng: 8.0, lat: 46.5 },
        endPoint: { lng: 8.1, lat: 46.6 },
      })
      expect(wrapper.text()).not.toContain('oneWayToGoalIndicator')
    })

    it('renders endPointName when end is set and name is present', () => {
      const wrapper = mountSheet({
        startPoint: { lng: 8.0, lat: 46.5 },
        endPoint: { lng: 8.1, lat: 46.6 },
        endPointName: 'Kleine Scheidegg',
        endPointElevation: 2061,
      })
      expect(wrapper.text()).toContain('Kleine Scheidegg')
      expect(wrapper.text()).toContain('2061')
    })
  })

  // ── Partners section ───────────────────────────────────────────────────────

  const mockContact = {
    id: 'contact-1',
    userId: 'user-1',
    firstName: 'Anna',
    lastName: null,
    displayName: null,
    updatedAt: null,
    contactMethods: [],
  }

  describe('header card state', () => {
    it('should split the hero badge per activity and leave the rest of the view untinted', () => {
      const wrapper = mountSheet({ tourTypes: ['paragliding', 'hiking'] })
      expect(wrapper.find('.hero-badge').findAll('.slice-icon')).toHaveLength(2)
      expect(wrapper.find('.details').attributes('style')).toBeUndefined()
    })

    it('should stamp a completed private tour with both states', () => {
      const wrapper = mountSheet({ completed: true, visibility: 'private' })
      expect(wrapper.find('.hero-badge').findAll('.hero-stamp')).toHaveLength(2)
    })

    it('should lead with the goal elevation and list the activity type as the first fact', () => {
      const wrapper = mountSheet({ tourTypes: ['skitour'], elevation: 2747 })
      expect(wrapper.find('.hero-headline').text()).toContain('2')
      expect(wrapper.find('.hero-headline').text()).not.toContain('skitour')
      expect(wrapper.find('[data-fact]').attributes('data-fact')).toBe('type')
    })

    it('should move the date up when the goal has no elevation, with no placeholder', () => {
      const wrapper = mountSheet({ elevation: null, plannedDate: new Date(2026, 7, 25) })
      expect(wrapper.find('.hero-headline').text()).toContain('25')
      expect(wrapper.find('.hero-meta').text()).not.toContain('25')
      expect(wrapper.find('.hero-meta').text()).toContain('46.8000°N')
    })

    it('should put the route numbers in the hero, where the sheet opens, not in a fact row', () => {
      const wrapper = mountSheet({ elevation: 3079, startPoint: { lng: 9.8, lat: 46.6 }, startPointElevation: 2632 })
      expect(wrapper.find('.hero-meta [data-testid="route-ascent"]').text()).toContain('447\u00A0m')
      expect(wrapper.find('[data-fact="route"]').exists()).toBe(false)
    })

    it('should show only the coordinates when neither elevation nor date exist', () => {
      const wrapper = mountSheet({ elevation: null, plannedDate: null })
      expect(wrapper.find('.hero-headline').exists()).toBe(false)
      expect(wrapper.find('.hero-meta').text()).toBe('46.8000°N, 8.2000°E')
    })

    it('should keep the owner toggles out of the hero, as the labelled row below it', () => {
      const wrapper = mountSheet({ completed: false, visibility: 'private' })
      expect(wrapper.find('.hero .completion-toggle').exists()).toBe(false)
      const row = wrapper.find('.owner-toggles')
      expect(row.find('.completion-toggle').text()).toBe('tours.infoSheet.completeTourBtn')
      expect(row.find('.visibility-toggle').text()).toBe('tours.infoSheet.visibilityMakeFriends')
      expect(row.find('.visibility-toggle').attributes('aria-pressed')).toBe('true')
    })

    it('should reserve each toggle\'s other label so flipping one never re-wraps the row', () => {
      const labels = (completed: boolean, visibility: 'friends' | 'private') =>
        mountSheet({ completed, visibility }).find('.owner-toggles').findAll('.toggle-label').map(l => [l.text(), l.attributes('data-alt')])
      expect(labels(false, 'friends')).toEqual([
        ['tours.infoSheet.completeTourBtn', 'tours.infoSheet.completedBtn'],
        ['tours.infoSheet.visibilityMakePrivate', 'tours.infoSheet.visibilityMakeFriends'],
      ])
      expect(labels(true, 'private')).toEqual([
        ['tours.infoSheet.completedBtn', 'tours.infoSheet.completeTourBtn'],
        ['tours.infoSheet.visibilityMakeFriends', 'tours.infoSheet.visibilityMakePrivate'],
      ])
    })

    it('should not keep an empty first line for a friend viewing a tour without elevation or date', () => {
      const wrapper = mountSheet({ isFriendTour: true, elevation: null, plannedDate: null }, 'user-2')
      expect(wrapper.find('.hero-line').exists()).toBe(false)
      expect(wrapper.find('.hero-meta').text()).toBe('46.8000°N, 8.2000°E')
    })

    it('should show a friend the owner instead of toggles', () => {
      const wrapper = mountSheet({ isFriendTour: true }, 'user-2')
      expect(wrapper.find('.owner-toggles').exists()).toBe(false)
      expect(wrapper.find('.hero').findAll('.hero-meta')).toHaveLength(2)
    })

    it('should spell out completion only for a friend viewing the tour', () => {
      expect(mountSheet({ completed: true }).find('.status-pill').exists()).toBe(false)
      expect(mountSheet({ completed: true, isFriendTour: true }, 'user-2').find('.status-pill').exists()).toBe(true)
    })
  })

  describe('partners section', () => {
    it('renders chips in action mode', () => {
      const wrapper = mountSheet({ partnerIds: ['contact-1'] }, 'user-1', [mockContact])
      const chip = wrapper.findComponent(ContactChipStub)
      expect(chip.exists()).toBe(true)
      expect(chip.props('mode')).toBe('action')
    })

    it('does not render ContactActionMenu when no chip is active', () => {
      const wrapper = mountSheet({ partnerIds: ['contact-1'] }, 'user-1', [mockContact])
      expect(wrapper.find('[data-testid="contact-action-menu"]').exists()).toBe(false)
    })

    it('should update partner chip contact prop when contact is renamed via contacts store', async () => {
      const wrapper = mountSheet({ partnerIds: ['contact-1'] }, 'user-1', [mockContact])
      const contactsStore = useContactsStore()

      contactsStore.contacts = [{ ...mockContact, firstName: 'Updated' }]
      await nextTick()

      const chip = wrapper.findComponent(ContactChipStub)
      expect((chip.props('contact') as typeof mockContact).firstName).toBe('Updated')
    })

    it('should reflect updated primary phone in action menu when setPrimaryPhoneOnContact is called', async () => {
      const contactWithPhone = {
        ...mockContact,
        contactMethods: [
          {
            id: 'method-1',
            contactId: 'contact-1',
            methodType: 'phone' as const,
            value: '+41791111111',
            label: null,
            isPrimary: true,
            isValid: true,
          },
          {
            id: 'method-2',
            contactId: 'contact-1',
            methodType: 'phone' as const,
            value: '+41792222222',
            label: null,
            isPrimary: false,
            isValid: true,
          },
        ],
      }
      const wrapper = mountSheet({ partnerIds: ['contact-1'] }, 'user-1', [contactWithPhone])
      const contactsStore = useContactsStore()

      const chip = wrapper.findComponent(ContactChipStub)
      chip.vm.$emit('open', 'contact-1', new DOMRect(0, 0, 100, 50))
      await nextTick()

      expect(wrapper.find('[data-testid="contact-action-menu"]').exists()).toBe(true)

      const updatedContact = {
        ...contactWithPhone,
        contactMethods: [
          {
            id: 'method-1',
            contactId: 'contact-1',
            methodType: 'phone' as const,
            value: '+41791111111',
            label: null,
            isPrimary: false,
            isValid: true,
          },
          {
            id: 'method-2',
            contactId: 'contact-1',
            methodType: 'phone' as const,
            value: '+41792222222',
            label: null,
            isPrimary: true,
            isValid: true,
          },
        ],
      }
      contactsStore.contacts = [updatedContact]
      await nextTick()

      const menu = wrapper.findComponent(ContactActionMenuStub)
      const menuContact = menu.props('contact') as typeof updatedContact
      expect(menuContact.contactMethods.find(m => m.isPrimary)?.id).toBe('method-2')
    })
  })

  describe('gPX download button', () => {
    it('should not show download button when gpxFilepath is null', () => {
      const wrapper = mountSheet({ gpxFilepath: null })
      const btn = wrapper.find('.gpx-download-btn')
      expect(btn.exists()).toBe(false)
    })

    it('should show download button when gpxFilepath is set', () => {
      const wrapper = mountSheet({ gpxFilepath: 'tour-abc.gpx' })
      const btn = wrapper.find('.gpx-download-btn')
      expect(btn.exists()).toBe(true)
    })

    it('should call downloadOriginal when download button is clicked', async () => {
      mockDownloadOriginal.mockResolvedValue(undefined)
      const wrapper = mountSheet({ gpxFilepath: 'tour-abc.gpx', name: 'My Tour' })
      const btn = wrapper.find('.gpx-download-btn')
      await btn.trigger('click')
      await nextTick()
      expect(mockDownloadOriginal).toHaveBeenCalledWith('tour-abc.gpx', 'My Tour.gpx')
    })

    it('should not throw when downloadOriginal fails', async () => {
      mockDownloadOriginal.mockRejectedValue(new Error('network error'))
      const wrapper = mountSheet({ gpxFilepath: 'tour-abc.gpx' })
      const btn = wrapper.find('.gpx-download-btn')
      await expect(btn.trigger('click')).resolves.not.toThrow()
    })
  })

  describe('friend-tour identity', () => {
    it('holds a skeleton for the owner rather than showing the fallback first', () => {
      const wrapper = mountSheet({ isFriendTour: true }, 'user-2')

      // Nothing resolvable yet — the slot must be a placeholder, not "Created by a friend"
      // that gets replaced once the lookups land.
      expect(wrapper.find('.owner-skeleton').exists()).toBe(true)
      expect(wrapper.text()).not.toContain('createdByLabel')
    })

    it('renders no owner row on the viewer\'s own tour', () => {
      const wrapper = mountSheet({ isFriendTour: false }, 'user-1')
      expect(wrapper.find('.owner-skeleton').exists()).toBe(false)
    })

    it('falls back to the profile name for a partner the viewer cannot resolve', () => {
      // A friend tour's partners are the OWNER's partners; find_phones_by_user_ids is
      // friendship-gated, so for an unconnected partner there is no phone to match and the
      // server-resolved profile name is the only name available — NOT the generic fallback.
      const wrapper = mountSheet(
        {
          isFriendTour: true,
          partnerNames: [{ userId: 'u-9', firstName: 'Ana', lastName: 'B' }],
          unresolvedPartnerCount: 0,
        },
        'user-2',
      )
      const chips = wrapper.findAll('.friend-partner-chip')
      expect(chips.length).toBeGreaterThan(0)
      expect(chips.every(c => c.text() === 'Ana B')).toBe(true)
    })
  })

  describe('unresolved partner pill (friend tour)', () => {
    it('renders the "and X more" pill when unresolvedPartnerCount > 0', () => {
      const wrapper = mountSheet(
        {
          isFriendTour: true,
          partnerNames: [{ userId: 'u-9', firstName: 'Ana', lastName: 'B' }],
          unresolvedPartnerCount: 2,
        },
        'user-2',
      )
      expect(wrapper.find('.friend-partner-chip--more').exists()).toBe(true)
    })

    it('renders the pill even when no partner names resolve (all unresolvable)', () => {
      const wrapper = mountSheet(
        { isFriendTour: true, partnerNames: [], unresolvedPartnerCount: 3 },
        'user-2',
      )
      expect(wrapper.find('.friend-partner-chip--more').exists()).toBe(true)
    })

    it('does not render the pill when unresolvedPartnerCount is 0', () => {
      const wrapper = mountSheet(
        {
          isFriendTour: true,
          partnerNames: [{ userId: 'u-9', firstName: 'Ana', lastName: 'B' }],
          unresolvedPartnerCount: 0,
        },
        'user-2',
      )
      expect(wrapper.find('.friend-partner-chip--more').exists()).toBe(false)
    })

    it('never renders the pill on the owner\'s own tour', () => {
      const wrapper = mountSheet({ isFriendTour: false, unresolvedPartnerCount: 4 }, 'user-1')
      expect(wrapper.find('.friend-partner-chip--more').exists()).toBe(false)
    })
  })

  // ── Suggestions (change: tour-suggestions) ─────────────────────────────────

  describe('suggestion entry points', () => {
    const friendTour = { isFriendTour: true, isPartner: true }

    function pending(overrides: Record<string, unknown> = {}) {
      return {
        id: 's1',
        tourId: 'tour-1',
        ownerId: 'user-1',
        suggesterId: 'user-2',
        batchId: 'b1',
        field: 'notes',
        value: 'Careful on the ridge',
        baseValue: null,
        currentValue: null,
        targetId: null,
        status: 'pending',
        isStale: false,
        createdAt: new Date('2026-08-01'),
        resolvedAt: null,
        suggesterFirstName: 'Jakob',
        suggesterLastName: null,
        ...overrides,
      }
    }

    it('hides "suggest changes" while the partner already has a pending proposal', () => {
      // Starting a second batch would upsert over every field of the first one — the only
      // route back in must be revise, which reopens the SAME batch (D12).
      const wrapper = mountSheet(friendTour, 'user-2', [], {}, {
        tourSuggestions: { suggestions: [pending()] },
      }, false)

      expect(wrapper.find('[data-testid="suggest-btn"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="my-suggestions-btn"]').exists()).toBe(true)
    })

    it('offers "suggest changes" again once the owner has resolved the proposal', () => {
      const wrapper = mountSheet(friendTour, 'user-2', [], {}, {
        tourSuggestions: {
          suggestions: [pending({ status: 'accepted', resolvedAt: new Date('2026-08-02') })],
        },
      }, false)

      expect(wrapper.find('[data-testid="suggest-btn"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="my-suggestions-btn"]').exists()).toBe(false)
    })

    it('never offers a non-partner the suggest entry on a friend tour', () => {
      const wrapper = mountSheet({ isFriendTour: true, isPartner: false }, 'user-2', [], {}, {}, false)

      expect(wrapper.find('[data-testid="suggest-btn"]').exists()).toBe(false)
    })
  })
})
