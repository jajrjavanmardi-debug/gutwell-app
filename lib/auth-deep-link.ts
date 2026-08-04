/**
 * lib/auth-deep-link.ts
 *
 * Parses Supabase auth deep links (password recovery, email confirmation).
 *
 * The mobile client runs with `detectSessionInUrl: false` because there is no
 * browser URL to read, so the app has to interpret the incoming link itself.
 *
 * Supabase can deliver a recovery link in more than one shape depending on the
 * email template in use, so both are handled:
 *
 *   1. Implicit flow — the hosted /auth/v1/verify endpoint redirects to the app
 *      with tokens in the URL fragment:
 *        gutwellapp://reset-password#access_token=…&refresh_token=…&type=recovery
 *
 *   2. Token-hash flow — the template passes {{ .TokenHash }} straight through:
 *        gutwellapp://reset-password?token_hash=…&type=recovery
 *
 * Failures also arrive as a redirect (expired or already-used links), so error
 * links are recognised rather than silently ignored.
 *
 * This module is deliberately pure and free of React and Supabase imports so
 * the parsing rules can be unit tested directly.
 */

export type AuthDeepLink =
  | { kind: 'tokens'; accessToken: string; refreshToken: string; type: string }
  | { kind: 'otp'; tokenHash: string; type: string }
  | { kind: 'error'; code: string; description: string };

/**
 * Collect parameters from both the query string and the fragment.
 * Supabase uses the fragment for the implicit flow and the query string for
 * token-hash and error redirects.
 */
function collectParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};

  const readPairs = (blob: string) => {
    for (const pair of blob.split('&')) {
      if (!pair) continue;
      const idx = pair.indexOf('=');
      const rawKey = idx === -1 ? pair : pair.slice(0, idx);
      const rawValue = idx === -1 ? '' : pair.slice(idx + 1);
      if (!rawKey) continue;
      try {
        params[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.replace(/\+/g, ' '));
      } catch {
        params[rawKey] = rawValue;
      }
    }
  };

  const hashIndex = url.indexOf('#');
  const withoutHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  if (hashIndex !== -1) readPairs(url.slice(hashIndex + 1));

  const queryIndex = withoutHash.indexOf('?');
  if (queryIndex !== -1) readPairs(withoutHash.slice(queryIndex + 1));

  return params;
}

/**
 * Parse an incoming deep link.
 * Returns null when the URL carries nothing auth-related, so callers can pass
 * every link through without pre-filtering.
 */
export function parseAuthDeepLink(url: string | null | undefined): AuthDeepLink | null {
  if (!url || typeof url !== 'string') return null;

  const params = collectParams(url);

  if (params.error || params.error_code) {
    return {
      kind: 'error',
      code: params.error_code || params.error || 'unknown',
      description: params.error_description || '',
    };
  }

  if (params.access_token && params.refresh_token) {
    return {
      kind: 'tokens',
      accessToken: params.access_token,
      refreshToken: params.refresh_token,
      type: params.type || '',
    };
  }

  const tokenHash = params.token_hash || params.token;
  if (tokenHash && params.type) {
    return { kind: 'otp', tokenHash, type: params.type };
  }

  return null;
}

/** True when the parsed link is a password-recovery link specifically. */
export function isPasswordRecoveryLink(parsed: AuthDeepLink | null): boolean {
  if (!parsed) return false;
  if (parsed.kind === 'error') return false;
  return parsed.type === 'recovery';
}
