import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const QUEUE_KEY = 'offline_queue';

export interface QueueItem {
  id: string;
  table: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

async function getQueue(): Promise<QueueItem[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveQueue(queue: QueueItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Add an insert operation to the offline queue.
 * Deduplicates by table + JSON-stringified payload to avoid redundant entries.
 */
export async function enqueue(table: string, payload: Record<string, unknown>): Promise<void> {
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
  });
  await saveQueue(queue);
}

/**
 * Attempt to insert all queued items into Supabase.
 * Successfully inserted items are removed from the queue.
 */
export async function flush(): Promise<number> {
  const queue = await getQueue();
  if (queue.length === 0) return 0;

  const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const now = Date.now();
  const failed: QueueItem[] = [];
  let synced = 0;

  // NOTE: Items are processed sequentially to avoid overwhelming the server
  // with concurrent writes. A future improvement could batch by table.
  for (const item of queue) {
    // Skip expired items (older than 7 days)
    if (now - item.timestamp > EXPIRY_MS) continue;

    const { error } = await supabase.from(item.table).insert(item.payload);
    if (error) {
      failed.push(item);
    } else {
      synced++;
    }
  }

  await saveQueue(failed);
  return synced;
}

/**
 * Returns the number of items waiting to be synced.
 */
export async function getPendingCount(): Promise<number> {
  const queue = await getQueue();
  return queue.length;
}
