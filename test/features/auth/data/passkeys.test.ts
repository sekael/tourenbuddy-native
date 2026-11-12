import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import {
  addPasskey,
  deletePasskey,
  listPasskeys,
  PasskeyError,
  passkeysSupported,
  RP_ID,
  signInWithPasskey,
} from '@/features/auth/data/passkeys';

import { resetAuth } from '../../../support/auth';
import { assertion, Passkey, sheetError } from '../../../support/fake-passkey';
import { passkeyOptions, supabase } from '../../../support/fake-supabase';

const passkey = supabase.auth.passkey;
const offline = () => new AuthRetryableFetchError('Failed to fetch', 0);
const refused = (code: string) => new AuthApiError(code, 422, code);

/** The reason a call failed with, or a test failure when it did not. */
async function reason(call: Promise<unknown>) {
  const error = await call.then(
    () => null,
    (err: unknown) => err,
  );
  expect(error).toBeInstanceOf(PasskeyError);
  return (error as PasskeyError).reason;
}

beforeEach(() => {
  resetAuth();
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

it('should offer passkeys on iOS', () => {
  expect(passkeysSupported).toBe(true);
});

describe('signing in with a passkey', () => {
  it("should hand the server's challenge to the sheet and its answer back as WebAuthn JSON", async () => {
    await signInWithPasskey();

    expect(Passkey.get).toHaveBeenCalledWith(passkeyOptions.authentication);
    expect(passkey.verifyAuthentication).toHaveBeenCalledWith({
      challengeId: 'challenge-1',
      credential: {
        id: 'credential-1',
        rawId: 'credential-1',
        type: 'public-key',
        authenticatorAttachment: undefined,
        response: assertion.response,
        clientExtensionResults: {},
      },
    });
  });

  it('should name the relying party when the server leaves it out', async () => {
    passkey.startAuthentication.mockResolvedValueOnce({
      data: { challenge_id: 'challenge-1', options: { challenge: 'Y2hhbGxlbmdl' } },
      error: null,
    });

    await signInWithPasskey();

    expect(Passkey.get).toHaveBeenCalledWith({ challenge: 'Y2hhbGxlbmdl', rpId: RP_ID });
  });

  it('should fill in the raw id the module may leave out', async () => {
    Passkey.get.mockResolvedValueOnce({ id: 'credential-1', response: assertion.response });

    await signInWithPasskey();

    expect(passkey.verifyAuthentication).toHaveBeenCalledWith(
      expect.objectContaining({
        credential: expect.objectContaining({ id: 'credential-1', rawId: 'credential-1' }),
      }),
    );
  });

  it.each([
    ['UserCancelled', 'cancelled'],
    ['NoCredentials', 'noCredentials'],
    ['BadConfiguration', 'failed'],
    ['TimedOut', 'failed'],
  ])('should answer a sheet failing with %s as %s, never verifying', async (error, expected) => {
    Passkey.get.mockRejectedValueOnce(sheetError(error));

    expect(await reason(signInWithPasskey())).toBe(expected);
    expect(passkey.verifyAuthentication).not.toHaveBeenCalled();
  });

  it('should not open the sheet when the server is out of reach', async () => {
    passkey.startAuthentication.mockResolvedValueOnce({ data: null, error: offline() });

    expect(await reason(signInWithPasskey())).toBe('offline');
    expect(Passkey.get).not.toHaveBeenCalled();
  });

  it('should report a passkey the server no longer knows to the system', async () => {
    passkey.verifyAuthentication.mockResolvedValueOnce({
      data: { session: null },
      error: refused('webauthn_credential_not_found'),
    });

    expect(await reason(signInWithPasskey())).toBe('unknownCredential');
    expect(Passkey.signalUnknownCredential).toHaveBeenCalledWith({
      rpId: RP_ID,
      credentialId: 'credential-1',
    });
  });

  it("should follow the server's relying party, also when reporting an unknown passkey", async () => {
    passkey.startAuthentication.mockResolvedValueOnce({
      data: {
        challenge_id: 'challenge-1',
        options: { challenge: 'Y2hhbGxlbmdl', rpId: 'other.example' },
      },
      error: null,
    });
    passkey.verifyAuthentication.mockResolvedValueOnce({
      data: { session: null },
      error: refused('webauthn_credential_not_found'),
    });

    await reason(signInWithPasskey());

    expect(Passkey.get).toHaveBeenCalledWith(expect.objectContaining({ rpId: 'other.example' }));
    expect(Passkey.signalUnknownCredential).toHaveBeenCalledWith(
      expect.objectContaining({ rpId: 'other.example' }),
    );
  });

  it('should still say the passkey is unknown when reporting it fails', async () => {
    Passkey.signalUnknownCredential.mockRejectedValueOnce(sheetError('NotSupported'));
    passkey.verifyAuthentication.mockResolvedValueOnce({
      data: { session: null },
      error: refused('webauthn_credential_not_found'),
    });

    expect(await reason(signInWithPasskey())).toBe('unknownCredential');
  });

  it('should not report a passkey the server refused for another reason', async () => {
    passkey.verifyAuthentication.mockResolvedValueOnce({
      data: { session: null },
      error: refused('webauthn_verification_failed'),
    });

    expect(await reason(signInWithPasskey())).toBe('failed');
    expect(Passkey.signalUnknownCredential).not.toHaveBeenCalled();
  });
});

describe('adding a passkey', () => {
  it('should register what the sheet creates', async () => {
    await addPasskey();

    expect(Passkey.create).toHaveBeenCalledWith(passkeyOptions.registration);
    expect(passkey.verifyRegistration).toHaveBeenCalledWith({
      challengeId: 'challenge-2',
      credential: expect.objectContaining({
        id: 'credential-2',
        rawId: 'credential-2',
        type: 'public-key',
        clientExtensionResults: {},
      }),
    });
  });

  it('should name the relying party when the server leaves it out', async () => {
    const { rp, ...rest } = passkeyOptions.registration;
    passkey.startRegistration.mockResolvedValueOnce({
      data: { challenge_id: 'challenge-2', options: { ...rest, rp: { name: rp.name } } },
      error: null,
    });

    await addPasskey();

    expect(Passkey.create).toHaveBeenCalledWith(
      expect.objectContaining({ rp: { id: RP_ID, name: 'TourenBuddy' } }),
    );
  });

  it.each([
    ['UserCancelled', 'cancelled'],
    ['CredentialAlreadyExists', 'exists'],
  ])('should answer a sheet failing with %s as %s, never verifying', async (error, expected) => {
    Passkey.create.mockRejectedValueOnce(sheetError(error));

    expect(await reason(addPasskey())).toBe(expected);
    expect(passkey.verifyRegistration).not.toHaveBeenCalled();
  });

  it.each([
    ['webauthn_credential_exists', 'exists'],
    ['too_many_passkeys', 'tooMany'],
    ['passkey_disabled', 'failed'],
  ])('should answer a server refusing with %s as %s', async (code, expected) => {
    passkey.verifyRegistration.mockResolvedValueOnce({ data: null, error: refused(code) });

    expect(await reason(addPasskey())).toBe(expected);
  });
});

describe('listing and deleting passkeys', () => {
  it("should list the account's passkeys with their names and dates", async () => {
    passkey.list.mockResolvedValueOnce({
      data: [
        { id: 'p1', friendly_name: 'iCloud Keychain', created_at: '2026-11-08T10:00:00Z' },
        { id: 'p2', created_at: '2026-11-09T10:00:00Z' },
      ],
      error: null,
    });

    expect(await listPasskeys()).toEqual([
      { id: 'p1', name: 'iCloud Keychain', createdAt: '2026-11-08T10:00:00Z' },
      { id: 'p2', name: undefined, createdAt: '2026-11-09T10:00:00Z' },
    ]);
  });

  it('should say when the list is out of reach', async () => {
    passkey.list.mockResolvedValueOnce({ data: null, error: offline() });
    expect(await reason(listPasskeys())).toBe('offline');
  });

  it('should delete the passkey by its id', async () => {
    await deletePasskey('p1');
    expect(passkey.delete).toHaveBeenCalledWith({ passkeyId: 'p1' });
  });

  it('should hand a failed deletion to the screen', async () => {
    passkey.delete.mockResolvedValueOnce({ data: null, error: offline() });
    expect(await reason(deletePasskey('p1'))).toBe('offline');
  });
});
