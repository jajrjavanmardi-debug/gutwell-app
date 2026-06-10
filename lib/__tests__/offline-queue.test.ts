import AsyncStorage from '@react-native-async-storage/async-storage';

// Controllable supabase mock: each insert/upsert resolves with the next queued
// result (default success), letting tests simulate failures and slow networks.
const pendingResults: Array<{ error: unknown } | Promise<{ error: unknown }>> = [];
const insertCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];

jest.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        insertCalls.push({ table, payload });
        return Promise.resolve(pendingResults.shift() ?? { error: null });
      },
      upsert: (payload: Record<string, unknown>) => {
        insertCalls.push({ table, payload });
        return Promise.resolve(pendingResults.shift() ?? { error: null });
      },
    }),
  },
}));

import { enqueue, flush, getPendingCount } from '../offline-queue';

beforeEach(async () => {
  await AsyncStorage.clear();
  pendingResults.length = 0;
  insertCalls.length = 0;
});

describe('enqueue', () => {
  it('queues an item', async () => {
    await enqueue('check_ins', { user_id: 'u1', entry_date: '2026-06-10' });
    expect(await getPendingCount()).toBe(1);
  });

  it('deduplicates identical table+payload combinations', async () => {
    await enqueue('check_ins', { user_id: 'u1', entry_date: '2026-06-10' });
    await enqueue('check_ins', { user_id: 'u1', entry_date: '2026-06-10' });
    expect(await getPendingCount()).toBe(1);
  });

  it('keeps distinct payloads', async () => {
    await enqueue('check_ins', { user_id: 'u1', entry_date: '2026-06-10' });
    await enqueue('check_ins', { user_id: 'u1', entry_date: '2026-06-11' });
    expect(await getPendingCount()).toBe(2);
  });
});

describe('flush', () => {
  it('uploads queued items and empties the queue', async () => {
    await enqueue('check_ins', { user_id: 'u1', entry_date: '2026-06-10' });
    await enqueue('check_ins', { user_id: 'u1', entry_date: '2026-06-11' });
    const synced = await flush();
    expect(synced).toBe(2);
    expect(await getPendingCount()).toBe(0);
  });

  it('keeps failed items for the next flush', async () => {
    await enqueue('check_ins', { user_id: 'u1', entry_date: '2026-06-10' });
    pendingResults.push({ error: { code: '500', message: 'server down' } });
    const synced = await flush();
    expect(synced).toBe(0);
    expect(await getPendingCount()).toBe(1);
  });

  it('tags dedupe-table rows with client_uuid and upserts', async () => {
    await enqueue('food_logs', { user_id: 'u1', meal_name: 'Oats' });
    await flush();
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].payload.client_uuid).toBeTruthy();
  });

  it('does NOT lose an item enqueued while a flush is in flight (race regression)', async () => {
    await enqueue('check_ins', { user_id: 'u1', entry_date: '2026-06-10' });

    // Make the in-flight network write slow so we can enqueue mid-flush.
    let releaseNetwork!: (value: { error: unknown }) => void;
    pendingResults.push(new Promise((resolve) => { releaseNetwork = resolve; }));

    const flushPromise = flush();
    // Give flush a tick to read its snapshot and start the network call.
    await new Promise((r) => setTimeout(r, 10));
    await enqueue('symptoms', { user_id: 'u1', symptom_type: 'bloating' });

    releaseNetwork({ error: null });
    const synced = await flushPromise;

    expect(synced).toBe(1);
    // The mid-flight item must still be queued — the old implementation
    // overwrote storage with its pre-flush snapshot and silently lost it.
    expect(await getPendingCount()).toBe(1);
  });

  it('is single-flight: concurrent flush calls share one run', async () => {
    await enqueue('check_ins', { user_id: 'u1', entry_date: '2026-06-10' });
    const [a, b] = await Promise.all([flush(), flush()]);
    // Exactly one network write for the single queued item.
    expect(insertCalls).toHaveLength(1);
    expect(a + b).toBeGreaterThanOrEqual(1);
  });
});
