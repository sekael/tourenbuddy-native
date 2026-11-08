import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import AppUpdateNotice from '@/features/user/presentation/components/app-update-notice.vue'

const updateAvailable = ref(false)
const apply = vi.fn()
vi.mock('@/core/composables/use-pwa-update', () => ({
  usePwaUpdate: () => ({ updateAvailable, apply }),
}))

describe('appUpdateNotice', () => {
  beforeEach(() => {
    updateAvailable.value = false
    apply.mockClear()
  })

  it('should render nothing when no update is pending', () => {
    const wrapper = mount(AppUpdateNotice)
    expect(wrapper.find('[data-testid="app-update-notice"]').exists()).toBe(false)
  })

  it('should apply the update from the profile after the banner was dismissed', async () => {
    updateAvailable.value = true // dismissing the banner never clears this
    const wrapper = mount(AppUpdateNotice)
    await wrapper.find('button').trigger('click')
    expect(apply).toHaveBeenCalledTimes(1)
  })
})
