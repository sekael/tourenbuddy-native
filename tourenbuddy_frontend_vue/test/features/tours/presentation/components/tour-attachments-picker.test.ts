import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TourAttachmentsPicker from '@/features/tours/presentation/components/tour-attachments-picker.vue'
import { useTourAttachmentsStore } from '@/features/tours/presentation/stores/tour-attachments-store'

const file = (id: string) => ({ id, originalFilename: `${id}.pdf`, mimeType: 'application/pdf' })

function mountPicker(props: Record<string, unknown>) {
  const pinia = createTestingPinia({ createSpy: vi.fn })
  const wrapper = mount(TourAttachmentsPicker, {
    props: { attachments: [file('a'), file('b'), file('c')], ...props },
    global: { plugins: [pinia] },
  })
  // happy-dom has no layout: stack the rows 100 px apart.
  wrapper.findAll('[data-reorder-index]').forEach(({ element }, i) => {
    element.getBoundingClientRect = () => ({ top: i * 100, height: 100 }) as DOMRect
  })
  return { wrapper, store: useTourAttachmentsStore(pinia) }
}

async function dragHandle(wrapper: ReturnType<typeof mountPicker>['wrapper'], index: number, toY: number) {
  const handle = wrapper.findAll('.picker__drag-handle')[index]!
  await handle.trigger('pointerdown', { button: 0, clientY: index * 100 + 50 })
  await handle.trigger('pointermove', { clientY: toY })
  await handle.trigger('pointerup')
}

describe('tourAttachmentsPicker', () => {
  it('should reorder a saved tour\'s files by dragging a handle — no native drag-and-drop', async () => {
    const { wrapper, store } = mountPicker({ tourId: 't1' })
    expect(wrapper.find('[draggable="true"]').exists()).toBe(false)
    await dragHandle(wrapper, 2, -20)
    expect(store.reorder).toHaveBeenCalledWith('t1', ['c', 'a', 'b'])
  })

  it('should stage the move while creating, and not move a file dropped back in place', async () => {
    const { wrapper, store } = mountPicker({ draftId: 'd1' })
    await dragHandle(wrapper, 0, 60)
    expect(store.stageReorder).not.toHaveBeenCalled()
    await dragHandle(wrapper, 0, 260)
    expect(store.stageReorder).toHaveBeenCalledWith('d1', 0, 2)
  })
})
