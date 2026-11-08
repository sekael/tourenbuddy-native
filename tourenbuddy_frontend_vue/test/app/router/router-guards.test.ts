import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { setupAuthRedirect, setupRouterGuards } from '@/app/router'
import { sessionUnverified } from '@/core/auth/session-trust'
import { isOnline } from '@/core/offline/use-online-status'

const { mockBeforeEach, mockPush, mockCurrentRoute } = vi.hoisted(() => ({
  mockBeforeEach: vi.fn(),
  mockPush: vi.fn(async () => {}),
  mockCurrentRoute: { value: { meta: {} as Record<string, boolean> } },
}))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    createRouter: () => ({
      beforeEach: mockBeforeEach,
      push: mockPush,
      currentRoute: mockCurrentRoute,
    }),
    createWebHistory: vi.fn(),
  }
})

function makeAuthStore(isAuthenticated: boolean) {
  return { isAuthenticated, isLoading: false }
}

function makeProfileStore(
  firstName: string | null,
  lastName: string | null,
  sessionSkipped = false,
) {
  return { profile: { firstName, lastName }, sessionSkipped }
}

function makeRoute(name: string, meta: Record<string, boolean> = {}) {
  return { name, meta }
}

describe('setupRouterGuards', () => {
  let capturedGuard: (to: ReturnType<typeof makeRoute>) => unknown

  beforeEach(() => {
    vi.clearAllMocks()
    mockBeforeEach.mockImplementation((guard: typeof capturedGuard) => {
      capturedGuard = guard
    })
  })

  function runGuard(
    to: ReturnType<typeof makeRoute>,
    authStore: ReturnType<typeof makeAuthStore>,
    profileStore: Parameters<typeof setupRouterGuards>[1],
  ) {
    setupRouterGuards(authStore, profileStore)
    return capturedGuard(to)
  }

  it('should redirect unauthenticated user from requiresAuth route to home', () => {
    const result = runGuard(
      makeRoute('map', { requiresAuth: true }),
      makeAuthStore(false),
      makeProfileStore(null, null),
    )
    expect(result).toEqual({ name: 'home' })
  })

  it('should redirect authenticated user away from redirectIfAuth route to map', () => {
    const result = runGuard(
      makeRoute('home', { redirectIfAuth: true }),
      makeAuthStore(true),
      makeProfileStore('Max', 'Doe'),
    )
    expect(result).toEqual({ name: 'map' })
  })

  it('should redirect to onboarding when profile is incomplete', () => {
    const result = runGuard(
      makeRoute('map', { requiresAuth: true, requiresCompleteProfile: true }),
      makeAuthStore(true),
      makeProfileStore(null, null),
    )
    expect(result).toEqual({ name: 'onboarding' })
  })

  it('should allow navigation when profile is complete', () => {
    const result = runGuard(
      makeRoute('map', { requiresAuth: true, requiresCompleteProfile: true }),
      makeAuthStore(true),
      makeProfileStore('Max', 'Doe'),
    )
    expect(result).toBeUndefined()
  })

  it('should allow navigation when profile is incomplete but skipped this session', () => {
    const result = runGuard(
      makeRoute('map', { requiresAuth: true, requiresCompleteProfile: true }),
      makeAuthStore(true),
      makeProfileStore(null, null, true),
    )
    expect(result).toBeUndefined()
  })

  it('should redirect to onboarding when profile is incomplete and not skipped this session', () => {
    const result = runGuard(
      makeRoute('map', { requiresAuth: true, requiresCompleteProfile: true }),
      makeAuthStore(true),
      makeProfileStore(null, null, false),
    )
    expect(result).toEqual({ name: 'onboarding' })
  })

  it('should redirect from onboarding to map if profile is already complete', () => {
    const result = runGuard(
      makeRoute('onboarding', { requiresAuth: true }),
      makeAuthStore(true),
      makeProfileStore('Max', 'Doe'),
    )
    expect(result).toEqual({ name: 'map' })
  })

  it('should NOT bounce to onboarding when offline with no cached profile (unknown ≠ incomplete)', () => {
    isOnline.value = false
    const result = runGuard(
      makeRoute('map', { requiresAuth: true, requiresCompleteProfile: true }),
      makeAuthStore(true),
      { profile: null, sessionSkipped: false },
    )
    expect(result).toBeUndefined()
  })

  it('should NOT bounce to onboarding on an unverified session with no cached profile', () => {
    // Reads are skipped while the session is unverified, so a null profile means "not
    // loaded yet", not "incomplete" — same reasoning as the offline case.
    isOnline.value = true
    sessionUnverified.value = true
    const result = runGuard(
      makeRoute('map', { requiresAuth: true, requiresCompleteProfile: true }),
      makeAuthStore(true),
      { profile: null, sessionSkipped: false },
    )
    expect(result).toBeUndefined()
    sessionUnverified.value = false
  })

  it('should still bounce to onboarding when online with no profile loaded', () => {
    isOnline.value = true
    const result = runGuard(
      makeRoute('map', { requiresAuth: true, requiresCompleteProfile: true }),
      makeAuthStore(true),
      { profile: null, sessionSkipped: false },
    )
    expect(result).toEqual({ name: 'onboarding' })
  })
})

describe('setupAuthRedirect', () => {
  const flush = () => new Promise(resolve => setTimeout(resolve))

  function wire(routeMeta: Record<string, boolean>) {
    mockCurrentRoute.value = { meta: routeMeta }
    const authStore = reactive({ isAuthenticated: false })
    const profileStore = { loadProfile: vi.fn(async () => {}), clear: vi.fn() }
    const notificationsStore = { ensurePushSubscription: vi.fn(), clear: vi.fn() }
    setupAuthRedirect(authStore, profileStore, notificationsStore)
    return { authStore, profileStore, notificationsStore }
  }

  beforeEach(() => {
    mockPush.mockClear()
  })

  it('should redirect to map when a session lands while the user sits on the sign-in page', async () => {
    const { authStore, profileStore } = wire({ redirectIfAuth: true })

    authStore.isAuthenticated = true
    await flush()

    expect(profileStore.loadProfile).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith({ name: 'map' })
  })

  it('should load the profile BEFORE navigating, so the guard is not fed a null profile', async () => {
    const order: string[] = []
    mockCurrentRoute.value = { meta: { redirectIfAuth: true } }
    const authStore = reactive({ isAuthenticated: false })
    const profileStore = {
      loadProfile: vi.fn(async () => { order.push('load') }),
      clear: vi.fn(),
    }
    mockPush.mockImplementation(async () => {
      order.push('push')
    })
    setupAuthRedirect(authStore, profileStore, { ensurePushSubscription: vi.fn(), clear: vi.fn() })

    authStore.isAuthenticated = true
    await flush()

    expect(order).toEqual(['load', 'push'])
    mockPush.mockImplementation(async () => {})
  })

  it('should NOT navigate when the session lands while the user is deep in the app', async () => {
    const { authStore } = wire({ requiresAuth: true })

    authStore.isAuthenticated = true
    await flush()

    expect(mockPush).not.toHaveBeenCalled()
  })

  it('should evict an auth-only view and clear stores when the session ends', async () => {
    const { authStore, profileStore, notificationsStore } = wire({ requiresAuth: true })
    authStore.isAuthenticated = true
    await flush()
    mockPush.mockClear()

    authStore.isAuthenticated = false
    await flush()

    expect(profileStore.clear).toHaveBeenCalled()
    expect(notificationsStore.clear).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith({ name: 'home' })
  })
})
