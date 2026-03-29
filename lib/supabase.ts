import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

function normalizeUrl(raw: string | undefined): string {
  let url = (raw ?? '').trim().replace(/^['"]|['"]$/g, '');
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  url = url.replace(/\/+$/, '');
  // Validate early so we get a clear error instead of "Network request failed"
  try {
    new URL(url);
  } catch {
    console.error(`[supabase] Invalid EXPO_PUBLIC_SUPABASE_URL: "${raw}"`);
  }
  return url;
}

function normalizeKey(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/^['"]|['"]$/g, '');
}

const supabaseUrl = normalizeUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseKey = normalizeKey(process.env.EXPO_PUBLIC_SUPABASE_KEY);

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
    storage: SecureStoreAdapter as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
