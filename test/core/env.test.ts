import { parseEnv } from '@/core/env';

const valid = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://abcd.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon',
};

describe('parseEnv', () => {
  it('should return typed values for a valid environment', () => {
    expect(parseEnv(valid)).toEqual(valid);
  });

  it('should accept the local backend over http', () => {
    const local = { ...valid, EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' };
    expect(parseEnv(local).EXPO_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
  });

  it.each([
    ['missing', { ...valid, EXPO_PUBLIC_SUPABASE_URL: undefined }],
    ['empty (an unset CI secret)', { ...valid, EXPO_PUBLIC_SUPABASE_URL: '' }],
    ['without a scheme', { ...valid, EXPO_PUBLIC_SUPABASE_URL: 'abcd.supabase.co' }],
    ['with another scheme', { ...valid, EXPO_PUBLIC_SUPABASE_URL: 'ftp://abcd.supabase.co' }],
  ])('should name the URL when it is %s', (_, source) => {
    expect(() => parseEnv(source)).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
  });

  it('should name every bad variable at once', () => {
    expect(() => parseEnv({})).toThrow(
      /EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY/,
    );
  });

  it('should reject an empty anon key', () => {
    expect(() => parseEnv({ ...valid, EXPO_PUBLIC_SUPABASE_ANON_KEY: '' })).toThrow(
      /EXPO_PUBLIC_SUPABASE_ANON_KEY/,
    );
  });
});
