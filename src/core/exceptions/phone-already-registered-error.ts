export class PhoneAlreadyRegisteredError extends Error {
  constructor(message = 'user.phoneVerification.alreadyRegisteredError') {
    super(message);
    this.name = 'PhoneAlreadyRegisteredError';
  }
}
