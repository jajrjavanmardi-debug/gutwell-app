/**
 * lib/secure-chunk-store.ts
 *
 * Chunked read/write helpers for expo-secure-store.
 *
 * A Supabase session (access JWT + refresh token + user object) serializes to
 * roughly 3–4 KB, which exceeds expo-secure-store's 2048-byte advisory limit.
 * Storing it as a single value logged, on every sign-in and token refresh:
 *
 *   WARN  Value being stored in SecureStore is larger than 2048 bytes and it
 *         may not be stored successfully. In a future SDK version, this call
 *         may throw an error.
 *
 * and risked the session silently failing to persist — which would sign users
 * out unpredictably. These helpers split large values across numbered chunks
 * and record the count in a companion key.
 *
 * Reads stay backward compatible: a value written by the previous single-key
 * adapter is still found, so existing users are not signed out by the change.
 *
 * The backing store is injected so the logic can be unit tested without a
 * native module.
 */

export type SecureBackend = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

/** Comfortably under the 2048-byte limit. */
export const CHUNK_SIZE = 1800;

export const chunkCountKey = (key: string) => `${key}__chunkCount`;
export const chunkKey = (key: string, index: number) => `${key}__chunk${index}`;

export async function chunkedGet(
  backend: SecureBackend,
  key: string
): Promise<string | null> {
  const countRaw = await backend.getItemAsync(chunkCountKey(key)).catch(() => null);

  if (countRaw) {
    const count = Number.parseInt(countRaw, 10);
    if (Number.isFinite(count) && count > 0) {
      const parts = await Promise.all(
        Array.from({ length: count }, (_, i) =>
          backend.getItemAsync(chunkKey(key, i)).catch(() => null)
        )
      );
      // A missing chunk means a partial write. Treat the whole value as absent
      // so the caller re-authenticates instead of parsing a truncated session.
      if (parts.some((part) => part == null)) return null;
      return parts.join('');
    }
  }

  // Legacy single-key value written before chunking existed.
  return backend.getItemAsync(key).catch(() => null);
}

export async function chunkedRemove(backend: SecureBackend, key: string): Promise<void> {
  const countRaw = await backend.getItemAsync(chunkCountKey(key)).catch(() => null);
  const count = countRaw ? Number.parseInt(countRaw, 10) : 0;

  const deletions: Promise<void>[] = [
    backend.deleteItemAsync(key).catch(() => {}),
    backend.deleteItemAsync(chunkCountKey(key)).catch(() => {}),
  ];
  if (Number.isFinite(count)) {
    for (let i = 0; i < count; i++) {
      deletions.push(backend.deleteItemAsync(chunkKey(key, i)).catch(() => {}));
    }
  }
  await Promise.all(deletions);
}

export async function chunkedSet(
  backend: SecureBackend,
  key: string,
  value: string
): Promise<void> {
  // Clear any previous representation first, so a shorter value can never
  // leave stale trailing chunks behind for chunkedGet to reassemble.
  await chunkedRemove(backend, key);

  if (value.length <= CHUNK_SIZE) {
    await backend.setItemAsync(key, value);
    return;
  }

  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.slice(i, i + CHUNK_SIZE));
  }
  await Promise.all(chunks.map((chunk, i) => backend.setItemAsync(chunkKey(key, i), chunk)));
  // Written last: until the count exists, chunkedGet falls back to the legacy
  // key rather than reading a half-written set.
  await backend.setItemAsync(chunkCountKey(key), String(chunks.length));
}
