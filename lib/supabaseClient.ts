import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const SECURE_STORE_SAFE_VALUE_LENGTH = 1900;
const ASYNC_STORAGE_POINTER = '__gutwell_async_storage_v1__';

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function warnAuthStorage(message: string, error: unknown): void {
  if (__DEV__) {
    console.warn(`[supabase auth storage] ${message}`, error);
  }
}

async function getNativeAuthItem(key: string): Promise<string | null> {
  try {
    const secureValue = await SecureStore.getItemAsync(key);
    if (secureValue === ASYNC_STORAGE_POINTER) {
      return await AsyncStorage.getItem(key);
    }
    if (secureValue !== null) {
      if (secureValue.length > SECURE_STORE_SAFE_VALUE_LENGTH) {
        await migrateOversizedSecureStoreValue(key, secureValue);
      }
      return secureValue;
    }
  } catch (error) {
    warnAuthStorage(`SecureStore read failed for ${key}; trying AsyncStorage fallback.`, error);
  }

  try {
    return await AsyncStorage.getItem(key);
  } catch (error) {
    warnAuthStorage(`AsyncStorage read failed for ${key}.`, error);
    return null;
  }
}

async function setNativeAuthItem(key: string, value: string): Promise<void> {
  if (value.length > SECURE_STORE_SAFE_VALUE_LENGTH) {
    await setLargeNativeAuthItem(key, value);
    return;
  }

  try {
    await SecureStore.setItemAsync(key, value);
    await AsyncStorage.removeItem(key).catch((error) => {
      warnAuthStorage(`AsyncStorage cleanup failed for ${key}.`, error);
    });
    return;
  } catch (error) {
    warnAuthStorage(`SecureStore write failed for ${key}; using AsyncStorage fallback.`, error);
  }

  try {
    await AsyncStorage.setItem(key, value);
  } catch (error) {
    warnAuthStorage(`AsyncStorage fallback write failed for ${key}.`, error);
  }
}

async function setLargeNativeAuthItem(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch (error) {
    warnAuthStorage(`AsyncStorage write failed for oversized auth item ${key}.`, error);
    return;
  }

  try {
    await SecureStore.setItemAsync(key, ASYNC_STORAGE_POINTER);
  } catch (error) {
    warnAuthStorage(`SecureStore pointer write failed for oversized auth item ${key}.`, error);
  }
}

async function migrateOversizedSecureStoreValue(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
    await SecureStore.setItemAsync(key, ASYNC_STORAGE_POINTER);
  } catch (error) {
    warnAuthStorage(`Could not migrate oversized SecureStore auth item ${key}.`, error);
  }
}

async function removeNativeAuthItem(key: string): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(key).catch((error) => {
      warnAuthStorage(`SecureStore delete failed for ${key}.`, error);
    }),
    AsyncStorage.removeItem(key).catch((error) => {
      warnAuthStorage(`AsyncStorage delete failed for ${key}.`, error);
    }),
  ]);
}

/**
 * Auth persistence:
 * - web uses localStorage for browser sessions
 * - native stores small auth values in SecureStore
 * - oversized Supabase session JSON is stored in AsyncStorage with a tiny SecureStore pointer
 */
const AuthStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return canUseLocalStorage() ? window.localStorage.getItem(key) : null;
    }
    return getNativeAuthItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      if (canUseLocalStorage()) window.localStorage.setItem(key, value);
      return;
    }
    await setNativeAuthItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      if (canUseLocalStorage()) window.localStorage.removeItem(key);
      return;
    }
    await removeNativeAuthItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AuthStorageAdapter as any,
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
