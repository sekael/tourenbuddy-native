// The PWA's check: something@something.tld, no spaces.
const EMAIL = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;

export const isEmail = (value: string) => EMAIL.test(value);

/** The backend's minimum (`minimum_password_length` in the Vue repository's `config.toml`). */
export const PASSWORD_MIN_LENGTH = 8;

/** The same rule for iOS, which suggests a strong password that satisfies it. */
export const PASSWORD_RULES = `minlength: ${PASSWORD_MIN_LENGTH};`;
