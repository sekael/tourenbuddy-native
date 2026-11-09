/**
 * Stands in for `react-native-passkey` in every test (`test/setup.ts`): the system sheet answers
 * at once with a credential; a test rejects it the way the module does (`{ error, message }`).
 */
export const assertion = {
  id: 'credential-1',
  rawId: 'credential-1',
  type: 'public-key',
  response: { clientDataJSON: 'e30', authenticatorData: 'YXV0aA', signature: 'c2ln', userHandle: 'dXNlci0x' },
};

export const attestation = {
  id: 'credential-2',
  response: { clientDataJSON: 'e30', attestationObject: 'YXR0', transports: ['internal'] },
};

export const sheetError = (error: string) => ({ error, message: error });

export const Passkey = {
  isSupported: jest.fn(() => true),
  get: jest.fn(async (_: unknown): Promise<object> => assertion),
  create: jest.fn(async (_: unknown): Promise<object> => attestation),
  signalUnknownCredential: jest.fn(async (_: unknown) => {}),
};
