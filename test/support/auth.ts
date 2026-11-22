import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import { useTermsStore } from '@/features/terms/presentation/stores/terms-store';

import { memory } from './fake-auth-storage';
import { fakeAuth, testSession } from './fake-supabase';
import { fakeTerms } from './fake-terms';

/** A fresh auth store and backend: signed out, restore not started. */
export function resetAuth() {
  fakeAuth.reset();
  memory.clear();
  fakeTerms.reset();
  useTermsStore.getState().clear();
  useAuthStore.setState({
    user: null,
    isLoading: true,
    restoring: undefined,
    pendingPassword: undefined,
  });
}

/** A stored session that restore finds at launch, for tests about the signed-in app. */
export function signIn(email?: string) {
  resetAuth();
  fakeAuth.session = testSession(email);
}
