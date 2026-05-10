import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

function normalizeKey(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/^['"]|['"]$/g, '');
}

function normalizeUrl(raw: string | undefined): string {
  let url = (raw ?? '').trim().replace(/^['"]|['"]$/g, '');
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  url = url.replace(/\/+$/, '');
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return '';
    }
    return url;
  } catch {
    console.error(`[supabase] Invalid EXPO_PUBLIC_SUPABASE_URL: "${raw}"`);
    return '';
  }
}

/**
 * Expo only bundles vars prefixed with EXPO_PUBLIC_ into the JS bundle.
 * Prefer EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY in `.env`.
 * Legacy aliases are accepted so older configs keep working.
 */
const supabaseUrl = normalizeUrl(
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
);
const supabaseKey = normalizeKey(
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_KEY ??
    process.env.SUPABASE_ANON_KEY
);

if (__DEV__) {
  const warnMigrate =
    !process.env.EXPO_PUBLIC_SUPABASE_URL &&
    !!process.env.SUPABASE_URL &&
    !!normalizeUrl(process.env.SUPABASE_URL);
  const warnKeyMigrate =
    !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY &&
    !process.env.EXPO_PUBLIC_SUPABASE_KEY &&
    !!normalizeKey(process.env.SUPABASE_ANON_KEY);
  if (warnMigrate || warnKeyMigrate) {
    console.warn(
      '[supabase] Prefer EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY so Metro embeds them in the mobile bundle.'
    );
  }
}

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '[GutWell] Missing Supabase config. Copy .env.example to .env, set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (anon key from Supabase → Project Settings → API), then restart Expo.'
  );
}

/** Reject copied template values so we fail at startup instead of "Network request failed" on every request. */
function assertRealSupabaseCredentials(url: string, key: string): void {
  const blob = `${url}\n${key}`.toLowerCase();
  const placeholderHints = [
    'your_project_ref',
    'your_supabase',
    'your-project',
    'paste_',
    'changeme',
    'example.com',
    'your-anon-public-key',
  ];
  if (placeholderHints.some((h) => blob.includes(h))) {
    throw new Error(
      '[GutWell] .env still has placeholder Supabase values. In Supabase Dashboard → Project Settings → API, copy the real Project URL and anon public key into .env, then run: npx expo start -c'
    );
  }

  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error('[GutWell] EXPO_PUBLIC_SUPABASE_URL is not a valid URL.');
  }

  const isCloud = host.endsWith('.supabase.co');
  const isLocal =
    __DEV__ && (host === 'localhost' || host === '127.0.0.1' || host === '10.0.2.2');
  if (!isCloud && !isLocal) {
    throw new Error(
      '[GutWell] EXPO_PUBLIC_SUPABASE_URL should look like https://<ref>.supabase.co (from Project Settings → API).'
    );
  }

  if (isCloud && !key.startsWith('eyJ')) {
    throw new Error(
      '[GutWell] EXPO_PUBLIC_SUPABASE_ANON_KEY should be the anon public key (long JWT starting with eyJ) from Project Settings → API — not the service_role key.'
    );
  }

  function decodeJwtRef(jwt: string): string {
    const parts = jwt.split('.');
    if (parts.length < 2) return '';
    const payloadB64Url = parts[1];
    const payloadB64 = payloadB64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadB64.padEnd(payloadB64.length + ((4 - (payloadB64.length % 4)) % 4), '=');

    try {
      if (typeof atob === 'function') {
        return JSON.parse(atob(padded)).ref ?? '';
      }
    } catch {
      // ignore
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyGlobal = globalThis as any;
      if (anyGlobal?.Buffer) {
        const json = anyGlobal.Buffer.from(padded, 'base64').toString('utf8');
        return JSON.parse(json).ref ?? '';
      }
    } catch {
      // ignore
    }
    return '';
  }

  const urlRef = host.split('.')[0];
  const tokenRef = decodeJwtRef(key);
  if (tokenRef && urlRef && tokenRef !== urlRef) {
    throw new Error(
      `[GutWell] Supabase anon key doesn't match the Project URL.\n` +
        `Project URL ref: ${urlRef}\n` +
        `Anon key ref: ${tokenRef}\n\n` +
        `In Supabase, open the SAME project → Project Settings → API and copy the "anon public" key again (for URL ref ${urlRef}).`
    );
  }
}

assertRealSupabaseCredentials(supabaseUrl, supabaseKey);

/**
 * Auth persistence (mobile): tokens live in SecureStore; web uses localStorage.
 * - persistSession: restored on cold start
 * - autoRefreshToken: keeps JWT valid without re-login
 * - detectSessionInUrl: enabled only on web so Supabase email/reset redirects complete on hosted domains
 * - flowType: pkce — recommended for native deep links / OAuth
 */
const SecureStoreAdapter = {
  getItem: (key: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') return localStorage.getItem(key);
      return null;
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') localStorage.setItem(key, value);
      return;
    }
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') localStorage.removeItem(key);
      return;
    }
    return SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: SecureStoreAdapter as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});

if (__DEV__) {
  // Avoid repeated logs during Fast Refresh / remount cycles.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scope = globalThis as any;
  if (!scope.__gutwellSupabaseClientInitLogged) {
    console.log('Supabase Client Initialized');
    scope.__gutwellSupabaseClientInitLogged = true;
  }
}
