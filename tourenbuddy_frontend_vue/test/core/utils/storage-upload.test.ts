import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadWithProgress } from '@/core/utils/storage-upload'

const createSignedUploadUrl = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ data: { signedUrl: 'https://sb/upload?token=t' }, error: null }),
)

vi.mock('@/core/utils/supabase', () => ({
  supabase: { storage: { from: () => ({ createSignedUploadUrl }) } },
}))

/** Minimal XHR double: the test drives the outcome via `instance`. */
interface FakeXhr {
  status: number
  responseText: string
  sent: boolean
  aborted: boolean
  upload: { onprogress?: (e: { lengthComputable: boolean, loaded: number, total: number }) => void }
  onload?: () => void
  onerror?: () => void
  onabort?: () => void
  open: (m: string, u: string) => void
  setRequestHeader: (k: string, v: string) => void
  send: (b: Blob) => void
  abort: () => void
}

let instance: FakeXhr

function installXhr() {
  instance = {
    status: 200,
    responseText: '',
    sent: false,
    aborted: false,
    upload: {},
    open: vi.fn(),
    setRequestHeader: vi.fn(),
    send: vi.fn(() => { instance.sent = true }),
    abort: vi.fn(() => {
      instance.aborted = true
      instance.onabort?.()
    }),
  }
  vi.stubGlobal('XMLHttpRequest', vi.fn(() => instance))
}

const file = new Blob(['bytes'], { type: 'image/jpeg' })
const flush = () => new Promise(r => setTimeout(r, 0))

describe('uploadWithProgress (edges)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installXhr()
  })

  it('rejects with an AbortError — not a generic error — when cancelled mid-flight', async () => {
    // A cancel must be distinguishable from a failure: one is silent, the other offers Retry.
    const controller = new AbortController()
    const promise = uploadWithProgress('b', 'p.jpg', file, { signal: controller.signal })
    await flush()
    controller.abort()

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(instance.abort).toHaveBeenCalled()
  })

  it('rejects with the status on a non-2xx response', async () => {
    const promise = uploadWithProgress('b', 'p.jpg', file)
    await flush()
    instance.status = 403
    instance.responseText = 'denied'
    instance.onload?.()

    await expect(promise).rejects.toThrow(/403/)
  })

  it('rejects without sending when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      uploadWithProgress('b', 'p.jpg', file, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(instance.sent).toBe(false)
  })

  it('reports no progress for a transfer whose total is unknown', async () => {
    const onProgress = vi.fn()
    const promise = uploadWithProgress('b', 'p.jpg', file, { onProgress })
    await flush()
    instance.upload.onprogress?.({ lengthComputable: false, loaded: 10, total: 0 })
    instance.onload?.()
    await promise

    expect(onProgress).not.toHaveBeenCalled()
  })

  it('propagates a signed-URL failure without touching the network', async () => {
    createSignedUploadUrl.mockResolvedValueOnce({ data: null, error: { message: 'no bucket' } })

    await expect(uploadWithProgress('b', 'p.jpg', file)).rejects.toThrow('no bucket')
    expect(instance.sent).toBe(false)
  })
})
