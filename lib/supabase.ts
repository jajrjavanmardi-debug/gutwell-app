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

const supabaseUrl = normalizeUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseKey = normalizeKey(
  process.env.EXPO_PUBLIC_SUPABASE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '[NutriFlow] Missing Supabase config. Copy .env.example to .env, set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY (anon key from Supabase → Project Settings → API), then restart Expo.'
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
  ];
  if (placeholderHints.some((h) => blob.includes(h))) {
    throw new Error(
      '[NutriFlow] .env still has placeholder Supabase values. In Supabase Dashboard → Project Settings → API, copy the real Project URL and anon public key into .env, then run: npx expo start -c'
    );
  }

  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error('[NutriFlow] EXPO_PUBLIC_SUPABASE_URL is not a valid URL.');
  }

  const isCloud = host.endsWith('.supabase.co');
  const isLocal =
    __DEV__ && (host === 'localhost' || host === '127.0.0.1' || host === '10.0.2.2');
  if (!isCloud && !isLocal) {
    throw new Error(
      '[NutriFlow] EXPO_PUBLIC_SUPABASE_URL should look like https://<ref>.supabase.co (from Project Settings → API).'
    );
  }

  if (isCloud && !key.startsWith('eyJ')) {
    throw new Error(
      '[NutriFlow] EXPO_PUBLIC_SUPABASE_KEY should be the anon public key (long JWT starting with eyJ) from Project Settings → API — not the service_role key.'
    );
  }

  // Make sure the anon key actually belongs to the same Supabase project as the URL.
  // When they don't match, auth requests often fail with confusing "Network request failed".
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
      // Some environments polyfill Buffer
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
      `[NutriFlow] Supabase anon key doesn't match the Project URL.\n` +
        `Project URL ref: ${urlRef}\n` +
        `Anon key ref: ${tokenRef}\n\n` +
        `In Supabase, open the SAME project → Project Settings → API and copy the "anon public" key again (for URL ref ${urlRef}).`
    );
  }
}

assertRealSupabaseCredentials(supabaseUrl, supabaseKey);

// Secure storage adapter for auth tokens
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
    // SecureStoreAdapter's return types (Promise<string | null> vs Promise<void>)
    // don't exactly match Supabase's SupportedStorage interface, but are functionally
    // compatible. The cast is necessary to satisfy the type checker.
    storage: SecureStoreAdapter as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
