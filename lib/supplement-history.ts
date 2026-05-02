import AsyncStorage from '@react-native-async-storage/async-storage';

export type SupplementHistoryItem = {
  id: string;
  name: string;
  time: string;
  dosage: string;
  createdAt: string;
};

const SUPPLEMENT_HISTORY_KEY = 'gutwell_supplement_history';
const HISTORY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function keepRecentItems(items: SupplementHistoryItem[]): SupplementHistoryItem[] {
  const cutoff = Date.now() - HISTORY_WINDOW_MS;

  return items
    .filter((item) => {
      const createdAt = Date.parse(item.createdAt);
      return Number.isFinite(createdAt) && createdAt >= cutoff;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function getSupplementHistory(): Promise<SupplementHistoryItem[]> {
  const raw = await AsyncStorage.getItem(SUPPLEMENT_HISTORY_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalizedItems = parsed.map((item) => {
      const supplement = item as Partial<SupplementHistoryItem>;
      const createdAt = supplement.createdAt ?? new Date().toISOString();

      return {
        id: supplement.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: supplement.name ?? '',
        time: supplement.time ?? new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        dosage: supplement.dosage ?? '',
        createdAt,
      };
    });

    return keepRecentItems(normalizedItems);
  } catch {
    return [];
  }
}

export async function getRecentSupplements(hoursBack = 12): Promise<SupplementHistoryItem[]> {
  const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
  const history = await getSupplementHistory();

  return history.filter((item) => Date.parse(item.createdAt) >= cutoff);
}

export async function saveSupplementHistoryItem(
  item: Omit<SupplementHistoryItem, 'id' | 'createdAt' | 'time'> & { time?: string },
): Promise<SupplementHistoryItem[]> {
  const createdAt = new Date();
  const nextItem: SupplementHistoryItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    time: item.time ?? createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    createdAt: createdAt.toISOString(),
  };
  const existing = await getSupplementHistory();
  const nextHistory = keepRecentItems([nextItem, ...existing]);

  await AsyncStorage.setItem(SUPPLEMENT_HISTORY_KEY, JSON.stringify(nextHistory));
  return nextHistory;
}
