/**
 * Password-recovery deep-link parsing tests.
 *
 * Covers both link shapes Supabase can send (implicit tokens in the fragment,
 * and token_hash in the query string) plus the error redirect that an expired
 * or already-used link produces.
 */

import { parseAuthDeepLink, isPasswordRecoveryLink } from '../auth-deep-link';

const SCHEME = 'gutwellapp://reset-password';

describe('parseAuthDeepLink — implicit token flow', () => {
  test('reads access and refresh tokens out of the fragment', () => {
    const parsed = parseAuthDeepLink(
      `${SCHEME}#access_token=abc123&refresh_token=ref456&expires_in=3600&type=recovery`
    );
    expect(parsed).toEqual({
      kind: 'tokens',
      accessToken: 'abc123',
      refreshToken: 'ref456',
      type: 'recovery',
    });
    expect(isPasswordRecoveryLink(parsed)).toBe(true);
  });

  test('also handles tokens delivered in the query string', () => {
    const parsed = parseAuthDeepLink(
      `${SCHEME}?access_token=abc&refresh_token=ref&type=recovery`
    );
    expect(parsed).toMatchObject({ kind: 'tokens', accessToken: 'abc', refreshToken: 'ref' });
  });

  test('percent-decodes token values', () => {
    const parsed = parseAuthDeepLink(
      `${SCHEME}#access_token=a%2Bb%2Fc&refresh_token=r%3Dd&type=recovery`
    );
    expect(parsed).toMatchObject({ accessToken: 'a+b/c', refreshToken: 'r=d' });
  });

  test('works with an Expo Go style deep link', () => {
    const parsed = parseAuthDeepLink(
      'exp://192.168.1.5:8081/--/reset-password#access_token=t&refresh_token=r&type=recovery'
    );
    expect(isPasswordRecoveryLink(parsed)).toBe(true);
  });
});

describe('parseAuthDeepLink — token hash flow', () => {
  test('reads token_hash and type from the query string', () => {
    const parsed = parseAuthDeepLink(`${SCHEME}?token_hash=pkce_abc&type=recovery`);
    expect(parsed).toEqual({ kind: 'otp', tokenHash: 'pkce_abc', type: 'recovery' });
    expect(isPasswordRecoveryLink(parsed)).toBe(true);
  });

  test('accepts the legacy "token" parameter name', () => {
    const parsed = parseAuthDeepLink(`${SCHEME}?token=legacy_abc&type=recovery`);
    expect(parsed).toEqual({ kind: 'otp', tokenHash: 'legacy_abc', type: 'recovery' });
  });
});

describe('parseAuthDeepLink — errors and non-auth links', () => {
  test('recognises an expired-link error redirect', () => {
    const parsed = parseAuthDeepLink(
      `${SCHEME}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`
    );
    expect(parsed).toEqual({
      kind: 'error',
      code: 'otp_expired',
      description: 'Email link is invalid or has expired',
    });
    // An error link is not a usable recovery link.
    expect(isPasswordRecoveryLink(parsed)).toBe(false);
  });

  test('an error takes precedence over any tokens in the same URL', () => {
    const parsed = parseAuthDeepLink(`${SCHEME}#error=access_denied&access_token=x&refresh_token=y`);
    expect(parsed?.kind).toBe('error');
  });

  test('returns null for links carrying nothing auth-related', () => {
    expect(parseAuthDeepLink('gutwellapp://checkin')).toBeNull();
    expect(parseAuthDeepLink('gutwellapp://food?meal=lunch')).toBeNull();
    expect(parseAuthDeepLink('https://getgutwell.app')).toBeNull();
  });

  test('handles null, empty and malformed input without throwing', () => {
    expect(parseAuthDeepLink(null)).toBeNull();
    expect(parseAuthDeepLink(undefined)).toBeNull();
    expect(parseAuthDeepLink('')).toBeNull();
    expect(parseAuthDeepLink('not a url at all')).toBeNull();
    expect(parseAuthDeepLink(`${SCHEME}#access_token=only`)).toBeNull();
  });

  test('a non-recovery auth link (e.g. signup) is parsed but not treated as recovery', () => {
    const parsed = parseAuthDeepLink(`${SCHEME}#access_token=a&refresh_token=b&type=signup`);
    expect(parsed?.kind).toBe('tokens');
    expect(isPasswordRecoveryLink(parsed)).toBe(false);
  });

  test('isPasswordRecoveryLink is false for null', () => {
    expect(isPasswordRecoveryLink(null)).toBe(false);
  });
});
