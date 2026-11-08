import type { TourAttachment } from '@/features/tours/domain/entities/tour-attachment'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTourAttachmentsStore } from '@/features/tours/presentation/stores/tour-attachments-store'

// ── Mocks ──────────────────────────────────────────────────────────────────────
const mockAdd = vi.hoisted(() => vi.fn())
const mockRemove = vi.hoisted(() => vi.fn())
const mockList = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const mockInsertRow = vi.hoisted(() => vi.fn())
const mockUploadObject = vi.hoisted(() => vi.fn())
const mockRemoveObject = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/features/tours/data/repositories/tour-attachment-repository-impl', () => ({
  attachmentStoragePath: (u: string, t: string, id: string) => `${u}/${t}/${id}.jpg`,
  SupabaseTourAttachmentRepository: vi.fn().mockImplementation(() => ({
    list: mockList,
    add: mockAdd,
    uploadObject: mockUploadObject,
    insertRow: mockInsertRow,
    remove: mockRemove,
    removeObject: mockRemoveObject,
    reorder: vi.fn(),
    getViewUrl: vi.fn(),
    getDownloadUrl: vi.fn(),
  })),
}))

// Block-form `mutate` runs the body verbatim when online — the offline drop is DC10's own test.
vi.mock('@/core/offline/mutate', () => ({
  mutate: (fn: () => Promise<unknown>) => fn(),
}))

// Exercise the store's own reconciliation, not IndexedDB: hand the fetched result straight
// to the assign callback, which is where the stale-read guard lives (design D1).
vi.mock('@/core/offline/cached-load', () => ({
  cachedLoad: async (
    _key: string,
    fetchFresh: () => Promise<unknown>,
    assign: (r: unknown) => void,
  ) => assign(await fetchFresh()),
}))

const mockEvictCachedBlob = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/core/offline/blob-cache', () => ({
  cacheBlob: vi.fn().mockResolvedValue(undefined),
  evictCachedBlob: mockEvictCachedBlob,
  peekCachedBlob: vi.fn().mockResolvedValue(new Blob(['x'])),
  loadCachedBlob: vi.fn(),
}))

vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn().mockReturnValue({
    currentUser: { id: 'user-123' },
  }),
}))

vi.mock('@/core/logging/use-logger', () => ({
  useLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'tours.attachments.limitRemaining')
        return `Only ${params?.remaining} more allowed; selected ${params?.selected}`
      return key
    },
  }),
}))

// ── Helpers ────────────────────────────────────────────────────────────────────
function makeFile(name: string, type: string, sizeBytes = 1000): File {
  const blob = new Blob([new Uint8Array(sizeBytes)], { type })
  return new File([blob], name, { type })
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('useTourAttachmentsStore — validateBatch', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should reject a file with HEIC mime type with dedicated error code', () => {
    const store = useTourAttachmentsStore()
    const heicFile = makeFile('photo.heic', 'image/heic')
    const err = store.validateBatch([heicFile], 0)
    expect(err?.code).toBe('heic_unsupported')
  })

  it('should reject a file with HEIF mime type with dedicated error code', () => {
    const store = useTourAttachmentsStore()
    const heifFile = makeFile('photo.heif', 'image/heif')
    const err = store.validateBatch([heifFile], 0)
    expect(err?.code).toBe('heic_unsupported')
  })

  it('should reject a file with disallowed mime type', () => {
    const store = useTourAttachmentsStore()
    const gifFile = makeFile('anim.gif', 'image/gif')
    const err = store.validateBatch([gifFile], 0)
    expect(err?.code).toBe('invalid_type')
  })

  it('should reject a file exceeding 10 MB', () => {
    const store = useTourAttachmentsStore()
    const bigFile = makeFile('big.jpg', 'image/jpeg', 10_485_761)
    const err = store.validateBatch([bigFile], 0)
    expect(err?.code).toBe('too_large')
  })

  it('should reject entire batch when it would exceed remaining capacity', () => {
    const store = useTourAttachmentsStore()
    // 3 existing + batch of 4 = 7 > 5
    const files = Array.from({ length: 4 }, (_, i) => makeFile(`img${i}.png`, 'image/png'))
    const err = store.validateBatch(files, 3)
    expect(err).toEqual({ code: 'limit_reached', remaining: 2, selected: 4 }) // 5 - 3 left
  })

  it('should reject adding any file when tour is already at limit', () => {
    const store = useTourAttachmentsStore()
    const file = makeFile('img.png', 'image/png')
    const err = store.validateBatch([file], 5)
    expect(err).toEqual({ code: 'limit_reached', remaining: 0, selected: 1 })
  })

  it('should accept a valid jpeg under 10 MB when capacity exists', () => {
    const store = useTourAttachmentsStore()
    const file = makeFile('photo.jpg', 'image/jpeg', 4_000_000)
    const err = store.validateBatch([file], 0)
    expect(err).toBeNull()
  })

  it('should accept a valid batch that exactly fills remaining capacity', () => {
    const store = useTourAttachmentsStore()
    const files = Array.from({ length: 2 }, (_, i) => makeFile(`img${i}.png`, 'image/png'))
    const err = store.validateBatch(files, 3) // 3 + 2 = 5 OK
    expect(err).toBeNull()
  })
})

describe('useTourAttachmentsStore — stage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should not stage a 6th file — sets error', () => {
    const store = useTourAttachmentsStore()
    const validFiles = Array.from({ length: 5 }, (_, i) => makeFile(`img${i}.png`, 'image/png'))
    store.stage('draft-1', validFiles)
    expect(store.error).toBeNull()

    store.stage('draft-1', [makeFile('extra.png', 'image/png')])
    expect(store.error).not.toBeNull()
  })

  it('should refuse files that fit the staged list but not the tour behind it', () => {
    // Suggest mode (D9): nothing is staged yet, but the owner already holds four — the
    // cap is on the tour's END state, not on the partner's picker.
    const store = useTourAttachmentsStore()

    store.stage('draft-1', [makeFile('a.jpg', 'image/jpeg'), makeFile('b.jpg', 'image/jpeg')], 4)

    expect(store.error).not.toBeNull()
    expect(store.stagedByDraft['draft-1']).toBeUndefined()
  })

  it('should count the base against already-staged files, not instead of them', () => {
    const store = useTourAttachmentsStore()

    store.stage('draft-1', [makeFile('a.jpg', 'image/jpeg')], 3)
    store.stage('draft-1', [makeFile('b.jpg', 'image/jpeg')], 3)
    store.stage('draft-1', [makeFile('c.jpg', 'image/jpeg')], 3)

    expect(store.stagedByDraft['draft-1']).toHaveLength(2)
    expect(store.error).not.toBeNull()
  })

  it('should stage valid files without error', () => {
    const store = useTourAttachmentsStore()
    const files = [makeFile('a.jpg', 'image/jpeg'), makeFile('b.pdf', 'application/pdf')]
    store.stage('draft-1', files)
    expect(store.error).toBeNull()
    expect(store.stagedByDraft['draft-1']).toHaveLength(2)
  })
})

describe('useTourAttachmentsStore — commitStaged', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockAdd.mockReset()
    mockInsertRow.mockReset()
    mockUploadObject.mockReset()
  })

  it('should no-op when nothing was pre-uploaded for the draft', async () => {
    const store = useTourAttachmentsStore()
    await store.commitStaged('draft-empty', 'tour-123')
    expect(mockInsertRow).not.toHaveBeenCalled()
  })

  it('should insert rows only — the create-flow bytes are already in storage', async () => {
    const store = useTourAttachmentsStore()
    mockUploadObject.mockResolvedValue('user-123/tour-123/att.jpg')
    mockInsertRow.mockImplementation(async (input: { id: string }) => ({
      ...attachment(input.id),
      tourId: 'tour-123',
    }))

    await store.preUpload('draft-1', 'tour-123', [makeFile('photo.jpg', 'image/jpeg')])
    await store.commitStaged('draft-1', 'tour-123')

    expect(mockUploadObject).toHaveBeenCalledOnce()
    expect(mockAdd).not.toHaveBeenCalled()
    expect(mockInsertRow).toHaveBeenCalledOnce()
    expect(store.preUploadedByDraft['draft-1']).toBeUndefined()
    expect(store.attachmentsByTour['tour-123']).toHaveLength(1)
  })
})

// ── Upload lifecycle (change: attachment-upload-ux) ─────────────────────────────
function attachment(id: string, filename = 'f.jpg'): TourAttachment {
  return {
    id,
    tourId: 'tour-1',
    userId: 'user-123',
    storagePath: `user-123/tour-1/${id}.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
    originalFilename: filename,
    sortOrder: 0,
    createdAt: new Date(),
  }
}

/** A pending promise plus its settle handles — for holding an upload in flight. */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise(r => setTimeout(r, 0))

describe('useTourAttachmentsStore — upload lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockRemoveObject.mockResolvedValue(undefined)
  })

  it('should not let a list() resolving with a pre-upload snapshot clobber the added row', async () => {
    const store = useTourAttachmentsStore()
    const slowList = deferred<TourAttachment[]>()
    mockList.mockReturnValueOnce(slowList.promise)
    mockAdd.mockResolvedValue(attachment('att-new'))

    const loadPromise = store.load('tour-1') // read in flight, server still has 0 rows
    await store.add('tour-1', [makeFile('photo.jpg', 'image/jpeg')])
    slowList.resolve([]) // the stale snapshot arrives last
    await loadPromise

    expect(store.attachmentsByTour['tour-1']).toHaveLength(1)
    expect(store.attachmentsByTour['tour-1'][0].id).toBe('att-new')
  })

  it('should report a cap rejection from a refetched count, never the raw trigger text', async () => {
    const store = useTourAttachmentsStore()
    mockAdd.mockRejectedValue(
      new Error('tour_attachment_limit_exceeded: a tour may have at most 5 attachments'),
    )
    mockList.mockResolvedValue([attachment('a'), attachment('b'), attachment('c'), attachment('d')])

    await store.add('tour-1', [makeFile('photo.jpg', 'image/jpeg')])

    expect(mockList).toHaveBeenCalled() // refetched before deciding what to say
    expect(store.error).toBe('Only 1 more allowed; selected 1')
    expect(store.error).not.toContain('tour_attachment_limit_exceeded')
  })

  it('should reject a selection that fits only because in-flight uploads are ignored', async () => {
    const store = useTourAttachmentsStore()
    const hanging = deferred<TourAttachment>()
    mockAdd.mockReturnValue(hanging.promise)
    store.attachmentsByTour['tour-1'] = [attachment('a'), attachment('b')]

    void store.add('tour-1', [makeFile('c.jpg', 'image/jpeg'), makeFile('d.jpg', 'image/jpeg')])
    await flush()
    expect(store.pendingByTour['tour-1']).toHaveLength(2) // 2 persisted + 2 in flight = 4

    await store.add('tour-1', [makeFile('e.jpg', 'image/jpeg'), makeFile('f.jpg', 'image/jpeg')])

    expect(store.error).toBe('Only 1 more allowed; selected 2')
    expect(mockAdd).toHaveBeenCalledTimes(2) // the second batch never started
  })

  it('should number colliding filenames instead of persisting three image.jpg', async () => {
    const store = useTourAttachmentsStore()
    mockAdd.mockImplementation(async (input: { file: File }) => attachment(input.file.name))

    await store.add('tour-1', [
      makeFile('image.jpg', 'image/jpeg'),
      makeFile('image.jpg', 'image/jpeg'),
      makeFile('image.jpg', 'image/jpeg'),
    ])

    const names = mockAdd.mock.calls.map(([input]) => (input.file as File).name)
    expect(names).toEqual(['image.jpg', 'image1.jpg', 'image2.jpg'])
  })

  it('should keep siblings uploading when one file is cancelled, evicting only its blob', async () => {
    const store = useTourAttachmentsStore()
    mockAdd.mockImplementation(({ signal }: { signal: AbortSignal }) =>
      new Promise((_res, rej) =>
        signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))),
      ),
    )

    void store.add('tour-1', [
      makeFile('a.jpg', 'image/jpeg'),
      makeFile('b.jpg', 'image/jpeg'),
      makeFile('c.jpg', 'image/jpeg'),
    ])
    await flush()

    const cancelled = store.pendingByTour['tour-1'][1]
    cancelled.cancel()
    await flush()

    expect(store.pendingByTour['tour-1'].map(p => p.filename)).toEqual(['a.jpg', 'c.jpg'])
    expect(store.uploading).toBe(true)
    expect(store.error).toBeNull() // a cancel is not a failure
    expect(mockEvictCachedBlob).toHaveBeenCalledExactlyOnceWith(cancelled.storagePath)
  })

  it('should reorder the pre-uploaded list in create mode, not the empty staged one', async () => {
    // Create mode no longer stages Files — a drag that only touched `stagedByDraft` would
    // silently do nothing and the insert order would ignore the user's arrangement.
    const store = useTourAttachmentsStore()
    mockUploadObject.mockResolvedValue('p')

    await store.preUpload('draft-1', 'tour-1', [
      makeFile('a.jpg', 'image/jpeg'),
      makeFile('b.jpg', 'image/jpeg'),
    ])
    store.stageReorder('draft-1', 1, 0)

    expect(store.preUploadedByDraft['draft-1'].map(f => f.originalFilename))
      .toEqual(['b.jpg', 'a.jpg'])
  })

  it('should delete a pre-uploaded file by dropping its object, not by deleting a row', async () => {
    const store = useTourAttachmentsStore()
    mockUploadObject.mockResolvedValue('p')

    await store.preUpload('draft-1', 'tour-1', [makeFile('a.jpg', 'image/jpeg')])
    const { id, storagePath } = store.preUploadedByDraft['draft-1'][0]
    await store.discardPreUploaded('draft-1', id)

    expect(store.preUploadedByDraft['draft-1']).toHaveLength(0)
    expect(mockRemove).not.toHaveBeenCalled() // no row exists to delete
    expect(mockRemoveObject).toHaveBeenCalledWith(storagePath)
    expect(mockEvictCachedBlob).toHaveBeenCalledWith(storagePath)
  })

  it('should leave a failed upload settled so Save is not blocked', async () => {
    const store = useTourAttachmentsStore()
    mockAdd.mockRejectedValue(new Error('network down'))

    await store.add('tour-1', [makeFile('a.jpg', 'image/jpeg')])

    expect(store.pendingByTour['tour-1'][0].status).toBe('failed')
    expect(store.uploading).toBe(false)
    expect(store.error).toBe('tours.attachments.uploadFailed')
  })

  it('should settle a retried upload once the connection is back', async () => {
    const store = useTourAttachmentsStore()
    mockAdd.mockRejectedValueOnce(new Error('network down'))

    await store.add('tour-1', [makeFile('a.jpg', 'image/jpeg')])
    const { id } = store.pendingByTour['tour-1'][0]
    mockAdd.mockResolvedValueOnce(attachment(id))
    await store.retryUpload(id)

    expect(store.pendingByTour['tour-1']).toHaveLength(0)
    expect(store.attachmentsByTour['tour-1'].map(a => a.id)).toEqual([id])
    expect(store.error).toBeNull()
  })

  it('should not duplicate a row whose first attempt landed before the response was lost', async () => {
    const store = useTourAttachmentsStore()
    mockAdd.mockRejectedValueOnce(new Error('network down'))

    await store.add('tour-1', [makeFile('a.jpg', 'image/jpeg')])
    const { id } = store.pendingByTour['tour-1'][0]
    // The insert had in fact succeeded; a load() in the meantime pulled the row in.
    store.attachmentsByTour['tour-1'] = [attachment(id)]
    mockAdd.mockResolvedValueOnce(attachment(id))
    await store.retryUpload(id)

    expect(store.attachmentsByTour['tour-1'].map(a => a.id)).toEqual([id])
  })
})
