import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import BlockConfirmDialog from '@/features/friendships/presentation/components/block-confirm-dialog.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

function mountDialog(hasFriendship: boolean) {
  return mount(BlockConfirmDialog, {
    props: { hasFriendship },
    attachTo: document.body,
  })
}

describe('block-confirm-dialog', () => {
  it('shows bodyWithFriend copy when hasFriendship is true', () => {
    const w = mountDialog(true)
    expect(w.text()).toContain('blocks.confirm.bodyWithFriend')
    expect(w.text()).not.toContain('blocks.confirm.bodyWithoutFriend')
  })

  it('shows bodyWithoutFriend copy when hasFriendship is false', () => {
    const w = mountDialog(false)
    expect(w.text()).toContain('blocks.confirm.bodyWithoutFriend')
    expect(w.text()).not.toContain('blocks.confirm.bodyWithFriend')
  })

  it('always shows cooldown notice', () => {
    const w = mountDialog(false)
    expect(w.text()).toContain('blocks.confirm.cooldownNotice')
  })

  it('emits cancel on cancel click', async () => {
    const w = mountDialog(false)
    await w.find('.base-button--secondary').trigger('click')
    expect(w.emitted('cancel')).toBeTruthy()
  })

  it('emits confirm with null reason when report toggle not checked', async () => {
    const w = mountDialog(false)
    await w.find('.base-button--danger').trigger('click')
    expect(w.emitted('confirm')?.[0]).toEqual([null])
  })

  it('shows reason input when report toggle checked', async () => {
    const w = mountDialog(false)
    await w.find('input[type=checkbox]').setValue(true)
    expect(w.find('textarea').exists()).toBe(true)
  })

  it('emits confirm with reason string when toggle checked and text entered', async () => {
    const w = mountDialog(false)
    await w.find('input[type=checkbox]').setValue(true)
    await w.find('textarea').setValue('spamming me')
    await w.find('.base-button--danger').trigger('click')
    expect(w.emitted('confirm')?.[0]).toEqual(['spamming me'])
  })

  it('emits confirm with null when reason textarea is empty', async () => {
    const w = mountDialog(false)
    await w.find('input[type=checkbox]').setValue(true)
    await w.find('.base-button--danger').trigger('click')
    expect(w.emitted('confirm')?.[0]).toEqual([null])
  })
})
