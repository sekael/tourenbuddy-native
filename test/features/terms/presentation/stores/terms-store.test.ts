import { sessionUser } from '@/core/auth/session-user';
import { replayQueue } from '@/core/offline/replay';
import { TERMS_VERSION } from '@/features/terms/domain/terms';
import { useTermsStore } from '@/features/terms/presentation/stores/terms-store';

import { fakeTables } from '../../../../support/fake-tables';
import { fakeTerms } from '../../../../support/fake-terms';

jest.mock('@/core/offline/replay', () => ({
  ...jest.requireActual('@/core/offline/replay'),
  replayQueue: jest.fn(async () => {}),
}));

const offline = new Error('Network request failed');

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  fakeTables.reset();
  fakeTerms.reset();
  useTermsStore.getState().clear();
  sessionUser.setState({ id: 'u1' });
  jest.mocked(replayQueue).mockClear();
});

describe('terms store', () => {
  it('should let an accepted user in offline, from the last confirmed answer', async () => {
    await useTermsStore.getState().check();
    useTermsStore.getState().clear();
    fakeTerms.failure = offline;

    await useTermsStore.getState().check();

    expect(useTermsStore.getState()).toMatchObject({ gate: 'pass', offline: true });
  });

  it('should ask for the acceptance, with the connection note, when nothing was ever confirmed', async () => {
    fakeTerms.failure = offline;

    await useTermsStore.getState().check();

    expect(useTermsStore.getState()).toMatchObject({ gate: 'accept', offline: true });
  });

  it("should not keep one user's answer for another", async () => {
    await useTermsStore.getState().check();
    useTermsStore.getState().clear();
    sessionUser.setState({ id: 'u2' });
    fakeTerms.failure = offline;

    await useTermsStore.getState().check();

    expect(useTermsStore.getState().gate).toBe('accept');
  });

  it('should drop an answer that arrives after the user signed out', async () => {
    fakeTerms.status = { current: TERMS_VERSION, accepted: null };
    const pending = useTermsStore.getState().check();
    sessionUser.setState({ id: null });
    useTermsStore.getState().clear();
    await pending;

    expect(useTermsStore.getState().gate).toBe('loading');
  });

  it('should send the edits saved offline once accepted', async () => {
    fakeTerms.status = { current: TERMS_VERSION, accepted: null };
    await useTermsStore.getState().check();

    await useTermsStore.getState().accept();

    expect(useTermsStore.getState().gate).toBe('pass');
    expect(replayQueue).toHaveBeenCalled();
  });

  it('should say the acceptance failed and show the update page when the terms moved on', async () => {
    fakeTerms.status = { current: TERMS_VERSION, accepted: null };
    await useTermsStore.getState().check();
    fakeTerms.status = { current: '2999-01-01', accepted: null };

    await useTermsStore.getState().accept();
    await Promise.resolve();

    expect(useTermsStore.getState().failed).toBe(true);
    expect(useTermsStore.getState().gate).toBe('update');
    expect(replayQueue).not.toHaveBeenCalled();
  });
});
