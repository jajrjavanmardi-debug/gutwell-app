import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const QUEUE_KEY = 'offline_queue';

// Tables whose offline writes must be idempotent. Each queued row is tagged with
// a stable `client_uuid` (the queue item id) and upserted on (user_id, client_uuid)
// so a re-flush after a partial success cannot create duplicates. Requires
// migration 007_offline_dedup.sql; falls back to plain insert if not yet applied.
const DEDUPE_TABLES = new Set<string>(['food_logs', 'symptoms']);

export interface QueueItem {
  id: string;
  table: string;
  payload: Record<string, unknown>;
  timestamp: number;
  operation?: 'insert' | 'upsert';
  onConflict?: string;
}

async function getQueue(): Promise<QueueItem[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueueItem[]) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueueItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

// Serializes every read-modify-write of the stored queue. Without this, an
// enqueue() racing a flush() could read the pre-flush queue and then be
// overwritten by flush's final save — silently losing the new item.
let storageLock: Promise<unknown> = Promise.resolve();
function withStorageLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = storageLock.then(fn, fn);
  storageLock = run.catch(() => {});
  return run;
}

/**
 * Add an insert operation to the offline queue.
 * Deduplicates by table + JSON-stringified payload to avoid redundant entries.
 */
export async function enqueue(
  table: string,
  payload: Record<string, unknown>,
  options?: { operation?: 'insert' | 'upsert'; onConflict?: string }
): Promise<void> {
  await withStorageLock(async () => {
    const queue = await getQueue();

    // Deduplicate: skip if an identical table + payload combination already exists
    const payloadKey = JSON.stringify(payload);
    const duplicate = queue.some(
      (item) => item.table === table && JSON.stringify(item.payload) === payloadKey,
    );
    if (duplicate) return;

    queue.push({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      table,
      payload,
      timestamp: Date.now(),
      operation: options?.operation || 'insert',
      onConflict: options?.onConflict,
    });
    await saveQueue(queue);
  });
}

/**
 * Attempt to insert all queued items into Supabase.
 * Successfully inserted items are removed from the queue.
 */
let flushInFlight: Promise<number> | null = null;

export async function flush(): Promise<number> {
  // Single-flight: NetInfo can fire several times in quick succession; a
  // second concurrent flush would double-insert items the first one is
  // still writing.
  if (flushInFlight) return flushInFlight;
  flushInFlight = doFlush().finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

async function doFlush(): Promise<number> {
  const queue = await getQueue();
  if (queue.length === 0) return 0;

  const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const now = Date.now();
  const resolvedIds = new Set<string>(); // synced or expired — safe to remove
  let synced = 0;
  let expired = 0;

  // NOTE: Items are processed sequentially to avoid overwhelming the server
  // with concurrent writes. A future improvement could batch by table.
  for (const item of queue) {
    // Skip expired items (older than 7 days)
    if (now - item.timestamp > EXPIRY_MS) {
      expired++;
      resolvedIds.add(item.id);
      continue;
    }

    let operation = item.operation || 'insert';
    let payload = item.payload;
    let onConflict = item.onConflict;

    // Idempotent offline sync for dedupe-prone tables: tag with a stable
    // client_uuid and upsert on it so a re-flush can't duplicate rows.
    if (DEDUPE_TABLES.has(item.table)) {
      payload = { ...item.payload, client_uuid: item.id };
      operation = 'upsert';
      onConflict = 'user_id,client_uuid';
    }

    let { error } = operation === 'upsert'
      ? await supabase.from(item.table).upsert(payload, onConflict ? { onConflict } : undefined)
      : await supabase.from(item.table).insert(payload);

    // Backward-compat: if migration 007 hasn't been applied yet the client_uuid
    // column won't exist (Postgres undefined_column = 42703). Fall back to a
    // plain insert of the original payload so offline sync still works.
    if (error?.code === '42703' && DEDUPE_TABLES.has(item.table)) {
      const res = await supabase.from(item.table).insert(item.payload);
      error = res.error;
    }

    if (!error) {
      synced++;
      resolvedIds.add(item.id);
    }
  }

  // Reconcile against CURRENT storage instead of overwriting with our
  // snapshot: items enqueued while the network writes ran must survive.
  await withStorageLock(async () => {
    const current = await getQueue();
    await saveQueue(current.filter((item) => !resolvedIds.has(item.id)));
  });
  if (expired > 0) {
    console.warn(`[offline-queue] dropped ${expired} expired item(s)`);
  }
  return synced;
}

/**
 * Returns the number of items waiting to be synced.
 */
export async function getPendingCount(): Promise<number> {
  const queue = await getQueue();
  return queue.length;
}
