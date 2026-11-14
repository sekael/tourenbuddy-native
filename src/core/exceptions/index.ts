/** Thrown when an operation requires authentication but no user session exists. */
export class UnauthenticatedUserException extends Error {
  constructor(message = 'User is not authenticated') {
    super(message);
    this.name = 'UnauthenticatedUserException';
  }
}

/** Thrown when the authenticated user is not authorized for the requested operation. */
export class UnauthorizedUserException extends Error {
  constructor(message = 'User is not authorized for this operation') {
    super(message);
    this.name = 'UnauthorizedUserException';
  }
}

/** Thrown when a user profile is expected to exist but is not found. */
export class NoUserProfileException extends Error {
  constructor(message = 'User profile does not exist') {
    super(message);
    this.name = 'NoUserProfileException';
  }
}

/** Thrown when a phone number string cannot be parsed to a valid international format. */
export class InvalidPhoneNumberError extends Error {
  constructor(
    message = 'Invalid phone number. Use international format (+41 79 012 34 56) or Swiss national format (079 012 34 56).',
  ) {
    super(message);
    this.name = 'InvalidPhoneNumberError';
  }
}

/** Thrown when a friendship operation requires a verified phone but the caller's phone is unverified. */
export class UnverifiedPhoneError extends Error {
  constructor(message = 'Phone number must be verified to use this feature') {
    super(message);
    this.name = 'UnverifiedPhoneError';
  }
}

/** Thrown when a friendship or friend request already exists between two users. */
export class FriendshipExistsError extends Error {
  constructor(message = 'A friendship or pending request already exists') {
    super(message);
    this.name = 'FriendshipExistsError';
  }
}

export { PhoneAlreadyRegisteredError } from './phone-already-registered-error';

/** Thrown when unblock_user is called but 48h cooldown since last_blocked_at has not elapsed. */
export class BlockCooldownError extends Error {
  readonly remainingSeconds: number;

  constructor(remainingSeconds: number) {
    super('blocks.cooldown.active');
    this.name = 'BlockCooldownError';
    this.remainingSeconds = remainingSeconds;
  }
}

/** Thrown when block_user is called but target is already actively blocked. Treated as silent success. */
export class BlockAlreadyExistsError extends Error {
  constructor() {
    super('blocks.alreadyBlocked');
    this.name = 'BlockAlreadyExistsError';
  }
}

/** Thrown when unblock_user is called but no active block row exists. Treated as silent success. */
export class NotBlockedError extends Error {
  constructor() {
    super('blocks.notBlocked');
    this.name = 'NotBlockedError';
  }
}

/** Thrown when send_friend_request RPC indicates the target has blocked the caller. */
export class BlockedBySenderError extends Error {
  constructor() {
    super('blocks.blockedBySender');
    this.name = 'BlockedBySenderError';
  }
}

/** Thrown when a contact method insert violates the unique constraint (contact_methods_unique_per_contact). */
export class DuplicateContactMethodError extends Error {
  readonly i18nKey = 'contacts.errors.duplicateMethod';

  constructor(message = 'This contact method is already saved for this contact') {
    super(message);
    this.name = 'DuplicateContactMethodError';
  }
}

/** Why a picked file could not be imported as vCard. Ordered: emptiness beats format, format beats content. */
export type VCardImportFailure = 'emptyFile' | 'notVCard' | 'noContacts';

/** Thrown by `parseVCardFile` when the picked file cannot yield an importable contact. */
export class VCardImportError extends Error {
  readonly reason: VCardImportFailure;

  constructor(reason: VCardImportFailure) {
    super(`vCard import failed: ${reason}`);
    this.name = 'VCardImportError';
    this.reason = reason;
  }
}

/** Thrown when a contact method value already belongs to another contact of the same user (contact_methods_value_unique_per_user). */
export class DuplicateContactAcrossContactsError extends Error {
  readonly i18nKey = 'contacts.errors.duplicateAcrossContacts';

  constructor(message = 'This value is already saved on another contact') {
    super(message);
    this.name = 'DuplicateContactAcrossContactsError';
  }
}
