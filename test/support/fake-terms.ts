import { TERMS_VERSION, type TermsStatus } from '@/features/terms/domain/terms';

/**
 * Stands in for the terms repository in every test (`test/setup.ts`): the version in force is the
 * app's and the user has accepted it, so the app opens as it did before the gate. Terms tests set
 * `fakeTerms.status` (and `reset()` after).
 */
const accepted = (): TermsStatus => ({ current: TERMS_VERSION, accepted: TERMS_VERSION });

export const fakeTerms = {
  status: accepted(),
  /** The next call fails with this (offline, a refusal). */
  failure: null as Error | null,
  reset() {
    fakeTerms.status = accepted();
    fakeTerms.failure = null;
    fetchTermsStatus.mockClear();
    acceptTerms.mockClear();
  },
};

function answer(): TermsStatus {
  if (fakeTerms.failure) throw fakeTerms.failure;
  return { ...fakeTerms.status };
}

export const fetchTermsStatus = jest.fn(async () => answer());

export const acceptTerms = jest.fn(async (version: string) => {
  if (!fakeTerms.failure && version !== fakeTerms.status.current)
    throw new Error('terms_version_mismatch');
  answer();
  fakeTerms.status = { ...fakeTerms.status, accepted: version };
  return answer();
});
