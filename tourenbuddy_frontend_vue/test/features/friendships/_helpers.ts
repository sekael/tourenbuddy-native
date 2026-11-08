import type {
  FriendRequest,
  Friendship,
} from '@/features/friendships/data/models/friendship-schemas'

/** Build a FriendRequest fixture with sensible defaults. */
export function makeRequest(overrides: Partial<FriendRequest> = {}): FriendRequest {
  return {
    id: 'req-1',
    fromUserId: 'user-other',
    toUserId: 'user-me',
    status: 'pending',
    createdAt: '2024-01-01T00:00:00Z',
    respondedAt: null,
    ...overrides,
  }
}

/** Build a Friendship fixture: requestUserId sent the request, responseUserId accepted it. */
export function makeFriendship(
  requestUserId: string,
  responseUserId: string,
  requestId: string | null = 'req-1',
): Friendship {
  return { requestUserId, responseUserId, createdAt: '2024-01-01T00:00:00Z', requestId }
}

/** Stub `supabase.from(...)` chainable query returning a fixed result. */
export function stubFrom(result: { data?: unknown, error?: { message: string } | null }) {
  const terminal = { ...result, error: result.error ?? null, data: result.data ?? null }
  const eq = () => Promise.resolve(terminal)
  const order = () => Promise.resolve(terminal)
  const single = () => Promise.resolve(terminal)
  const select = () => ({ single, eq, order })
  return {
    insert: () => ({ select }),
    update: () => ({ eq }),
    select: () => ({ eq: () => ({ order }), order }),
  }
}
