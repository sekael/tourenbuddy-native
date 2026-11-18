import type { Session } from '@supabase/supabase-js';

jest.unmock('@/core/supabase');

const { sessionKey, supabase } =
  jest.requireActual<typeof import('@/core/supabase')>('@/core/supabase');

// Tripwires against supabase-js: the app relies on two things the library does internally.
describe('supabase client', () => {
  it("should compute the session key the way supabase-js does (the PWA's key on web)", () => {
    // `storageKey` is protected in the types; the app reads the session under the same key.
    expect((supabase.auth as unknown as { storageKey: string }).storageKey).toBe(sessionKey);
    expect(sessionKey).toBe('sb-127-auth-token');
  });

  it('should hand a refreshed access token to Realtime by itself', async () => {
    const setAuth = jest.spyOn(supabase.realtime, 'setAuth').mockResolvedValue();
    const session = { access_token: 'fresh-token', user: { id: 'u' } } as Session;

    // What auth-js does after a refresh: tell every listener, supabase-js's own included.
    const auth = supabase.auth as unknown as {
      _notifyAllSubscribers(event: string, session: Session): Promise<void>;
    };
    await auth._notifyAllSubscribers('TOKEN_REFRESHED', session);

    expect(setAuth).toHaveBeenCalledWith('fresh-token');
  });
});
