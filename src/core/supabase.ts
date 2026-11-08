import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { authStorage } from '@/core/auth/auth-storage';
import { env } from '@/core/env';

/** The shared Supabase client. */
export const supabase = createClient(
  env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: authStorage,
      // Sign-in is a code: no magic link or OAuth redirect ever carries a session in a URL.
      detectSessionInUrl: false,
    },
  },
);

/**
 * Where auth-js keeps the session: its default key, computed as supabase-js does (a test pins
 * it), so the app can read and delete the stored session without going through auth-js.
 */
export const sessionKey = `sb-${new URL(env.EXPO_PUBLIC_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

// Refresh the token only in the foreground; auth-js does this itself in browsers.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
