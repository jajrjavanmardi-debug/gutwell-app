/**
 * Chunked SecureStore tests.
 *
 * The Supabase session is 3–4 KB, over expo-secure-store's 2048-byte limit.
 * Storing it whole logged a warning on every sign-in and risked the session
 * silently failing to persist. These tests pin the chunking behaviour and the
 * backward-compatible read path for sessions written before the change.
 */

import {
  CHUNK_SIZE,
  chunkCountKey,
  chunkKey,
  chunkedGet,
  chunkedRemove,
  chunkedSet,
  type SecureBackend,
} from '../secure-chunk-store';

const KEY = 'sb-peipdakrqtgabnvpazrc-auth-token';

function makeBackend() {
  const store = new Map<string, string>();
  const backend: SecureBackend = {
    getItemAsync: async (key) => store.get(key) ?? null,
    setItemAsync: async (key, value) => {
      store.set(key, value);
    },
    deleteItemAsync: async (key) => {
      store.delete(key);
    },
  };
  return { backend, store };
}

/** Stand-in for a realistic Supabase session payload. */
const bigSession = JSON.stringify({
  access_token: 'e'.repeat(900),
  refresh_token: 'r'.repeat(60),
  user: { id: 'u'.repeat(36), meta: 'm'.repeat(2500) },
});

describe('chunkedSet / chunkedGet', () => {
  test('a small value is stored under the plain key, unchunked', async () => {
    const { backend, store } = makeBackend();
    await chunkedSet(backend, KEY, 'short');

    expect(store.get(KEY)).toBe('short');
    expect(store.has(chunkCountKey(KEY))).toBe(false);
    await expect(chunkedGet(backend, KEY)).resolves.toBe('short');
  });

  test('a value over the limit is split and round-trips exactly', async () => {
    const { backend, store } = makeBackend();
    expect(bigSession.length).toBeGreaterThan(2048);

    await chunkedSet(backend, KEY, bigSession);

    // Nothing is left under the plain key.
    expect(store.has(KEY)).toBe(false);
    const count = Number(store.get(chunkCountKey(KEY)));
    expect(count).toBe(Math.ceil(bigSession.length / CHUNK_SIZE));

    await expect(chunkedGet(backend, KEY)).resolves.toBe(bigSession);
  });

  test('no individual chunk exceeds the SecureStore limit', async () => {
    const { backend, store } = makeBackend();
    await chunkedSet(backend, KEY, bigSession);

    for (const [key, value] of store) {
      if (key === chunkCountKey(KEY)) continue;
      expect(value.length).toBeLessThanOrEqual(2048);
    }
  });

  test('a value exactly at the chunk size is not split', async () => {
    const { backend, store } = makeBackend();
    const exact = 'x'.repeat(CHUNK_SIZE);
    await chunkedSet(backend, KEY, exact);

    expect(store.get(KEY)).toBe(exact);
    await expect(chunkedGet(backend, KEY)).resolves.toBe(exact);
  });

  test('one byte over the chunk size is split into two', async () => {
    const { backend, store } = makeBackend();
    await chunkedSet(backend, KEY, 'x'.repeat(CHUNK_SIZE + 1));

    expect(store.get(chunkCountKey(KEY))).toBe('2');
  });

  test('overwriting a long value with a short one leaves no stale chunks', async () => {
    const { backend, store } = makeBackend();
    await chunkedSet(backend, KEY, bigSession);
    await chunkedSet(backend, KEY, 'short');

    expect(store.get(KEY)).toBe('short');
    expect(store.has(chunkCountKey(KEY))).toBe(false);
    expect([...store.keys()].filter((k) => k.includes('__chunk'))).toEqual([]);
    await expect(chunkedGet(backend, KEY)).resolves.toBe('short');
  });

  test('overwriting with a shorter multi-chunk value does not concatenate leftovers', async () => {
    const { backend } = makeBackend();
    await chunkedSet(backend, KEY, 'a'.repeat(CHUNK_SIZE * 4));
    const shorter = 'b'.repeat(CHUNK_SIZE * 2);
    await chunkedSet(backend, KEY, shorter);

    await expect(chunkedGet(backend, KEY)).resolves.toBe(shorter);
  });
});

describe('backward compatibility', () => {
  test('a session written by the old single-key adapter is still readable', async () => {
    const { backend, store } = makeBackend();
    // Simulate the pre-chunking layout.
    store.set(KEY, bigSession);

    await expect(chunkedGet(backend, KEY)).resolves.toBe(bigSession);
  });

  test('the legacy key is cleared once a chunked value replaces it', async () => {
    const { backend, store } = makeBackend();
    store.set(KEY, bigSession);
    await chunkedSet(backend, KEY, bigSession);

    expect(store.has(KEY)).toBe(false);
    await expect(chunkedGet(backend, KEY)).resolves.toBe(bigSession);
  });
});

describe('resilience', () => {
  test('a missing chunk reads as absent rather than a truncated session', async () => {
    const { backend, store } = makeBackend();
    await chunkedSet(backend, KEY, bigSession);
    store.delete(chunkKey(KEY, 1));

    await expect(chunkedGet(backend, KEY)).resolves.toBeNull();
  });

  test('an absent key reads as null', async () => {
    const { backend } = makeBackend();
    await expect(chunkedGet(backend, KEY)).resolves.toBeNull();
  });

  test('a corrupt chunk count falls back to the legacy key', async () => {
    const { backend, store } = makeBackend();
    store.set(chunkCountKey(KEY), 'not-a-number');
    store.set(KEY, 'legacy');

    await expect(chunkedGet(backend, KEY)).resolves.toBe('legacy');
  });

  test('chunkedRemove clears chunks, the count, and the legacy key', async () => {
    const { backend, store } = makeBackend();
    await chunkedSet(backend, KEY, bigSession);
    store.set(KEY, 'legacy-leftover');

    await chunkedRemove(backend, KEY);

    expect(store.size).toBe(0);
    await expect(chunkedGet(backend, KEY)).resolves.toBeNull();
  });

  test('a backend that throws on read is treated as empty, not fatal', async () => {
    const backend: SecureBackend = {
      getItemAsync: async () => {
        throw new Error('keychain unavailable');
      },
      setItemAsync: async () => {},
      deleteItemAsync: async () => {},
    };

    await expect(chunkedGet(backend, KEY)).resolves.toBeNull();
  });
});
