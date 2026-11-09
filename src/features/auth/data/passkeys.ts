import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { Passkey, type PasskeyCreateRequest, type PasskeyGetRequest } from 'react-native-passkey';

import { createLogger } from '@/core/logging/logger';
import { supabase } from '@/core/supabase';

const log = createLogger('Passkeys');

/**
 * The relying party. Passkeys stay bound to it for good: changing it makes every passkey useless.
 * The domain lists the apps in `/.well-known/apple-app-site-association` (`public/`).
 */
export const RP_ID = 'tourenbuddy.ch';

/** Face ID sign-in is iOS only (owner, 2026-11-08): Android and web offer no passkeys. */
export const passkeysSupported = Platform.OS === 'ios' && Passkey.isSupported();

export type PasskeyFailure =
  'cancelled' | 'noCredentials' | 'unknownCredential' | 'exists' | 'tooMany' | 'offline' | 'failed';

/** Why a passkey action failed, for the screens to put into words (`cancelled`: say nothing). */
export class PasskeyError extends Error {
  constructor(
    readonly reason: PasskeyFailure,
    cause?: unknown,
  ) {
    super(reason, { cause });
    this.name = 'PasskeyError';
  }
}

export type PasskeyItem = { id: string; name?: string; createdAt: string };

type Credential = Parameters<typeof supabase.auth.passkey.verifyAuthentication>[0]['credential'];

/** The system sheet's answer (react-native-passkey rejects with `{ error, message }`). */
function fromDevice(error: unknown): PasskeyError {
  switch ((error as { error?: string } | null)?.error) {
    case 'UserCancelled':
      return new PasskeyError('cancelled', error);
    case 'NoCredentials':
      return new PasskeyError('noCredentials', error);
    case 'CredentialAlreadyExists':
      return new PasskeyError('exists', error);
    default:
      // BadConfiguration (the association file), NotSupported, timeouts: nothing the user can fix.
      log.warn('The passkey sheet failed', error);
      return new PasskeyError('failed', error);
  }
}

function fromServer(error: unknown): PasskeyError {
  // auth-js reports a request that never reached the server with status 0.
  if (isAuthRetryableFetchError(error) && error.status === 0) {
    return new PasskeyError('offline', error);
  }
  switch (isAuthApiError(error) ? error.code : undefined) {
    case 'webauthn_credential_not_found':
      return new PasskeyError('unknownCredential', error);
    case 'webauthn_credential_exists':
      return new PasskeyError('exists', error);
    case 'too_many_passkeys':
      return new PasskeyError('tooMany', error);
    default:
      log.warn('The auth server refused the passkey', error);
      return new PasskeyError('failed', error);
  }
}

/**
 * The module's answer in the shape Supabase verifies. Both speak WebAuthn JSON (base64url fields);
 * the module leaves out what the standard requires and the app does not use (no extensions).
 */
function toCredential(result: {
  id: string;
  rawId?: string;
  authenticatorAttachment?: string;
  response: object;
}) {
  return {
    id: result.id,
    rawId: result.rawId ?? result.id,
    type: 'public-key',
    authenticatorAttachment: result.authenticatorAttachment,
    response: result.response,
    clientExtensionResults: {},
  } as Credential;
}

/**
 * Signs in with a passkey the user picks in the system sheet (Face ID); no email needed, the
 * passkey names the account. auth-js saves the session and emits `SIGNED_IN`.
 */
export async function signInWithPasskey(): Promise<void> {
  const { data: start, error } = await supabase.auth.passkey.startAuthentication();
  if (error) throw fromServer(error);
  const rpId = start.options.rpId ?? RP_ID;

  // The same JSON; the two libraries only type its transports differently.
  const request = { ...start.options, rpId } as unknown as PasskeyGetRequest;
  let result;
  try {
    result = await Passkey.get(request);
  } catch (err) {
    throw fromDevice(err);
  }

  const { error: verifyError } = await supabase.auth.passkey.verifyAuthentication({
    challengeId: start.challenge_id,
    credential: toCredential(result),
  });
  if (!verifyError) return;
  const failure = fromServer(verifyError);
  if (failure.reason === 'unknownCredential') {
    // Deleted on the server: iOS 26 stops offering it (best effort, a no-op before iOS 26).
    Passkey.signalUnknownCredential({ rpId, credentialId: result.id }).catch((err: unknown) =>
      log.warn('Could not report the unknown passkey', err),
    );
  }
  throw failure;
}

/** Registers a new passkey for the signed-in user (system sheet, Face ID). */
export async function addPasskey(): Promise<void> {
  const { data: start, error } = await supabase.auth.passkey.startRegistration();
  if (error) throw fromServer(error);

  const request = {
    ...start.options,
    rp: { ...start.options.rp, id: start.options.rp.id ?? RP_ID },
  } as unknown as PasskeyCreateRequest;
  let result;
  try {
    result = await Passkey.create(request);
  } catch (err) {
    throw fromDevice(err);
  }

  const { error: verifyError } = await supabase.auth.passkey.verifyRegistration({
    challengeId: start.challenge_id,
    credential: toCredential(result),
  });
  if (verifyError) throw fromServer(verifyError);
}

export async function listPasskeys(): Promise<PasskeyItem[]> {
  const { data, error } = await supabase.auth.passkey.list();
  if (error) throw fromServer(error);
  return data.map((item) => ({
    id: item.id,
    name: item.friendly_name,
    createdAt: item.created_at,
  }));
}

export async function deletePasskey(id: string): Promise<void> {
  const { error } = await supabase.auth.passkey.delete({ passkeyId: id });
  if (error) throw fromServer(error);
}
