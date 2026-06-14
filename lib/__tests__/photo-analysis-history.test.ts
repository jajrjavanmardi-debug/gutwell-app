import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getPhotoAnalysisHistory,
  savePhotoAnalysisHistoryItem,
} from '../photo-analysis-history';

const KEY = 'gutwell_photo_analysis_history';

function makeItem(i: number, createdAt: string) {
  return {
    id: `id-${i}`,
    imageUri: `file:///tmp/meal-${i}.jpg`,
    createdAt,
    aiText: `MEAL: Item ${i}\nMEAL IMPACT SCORE: 6/10`,
    symptoms: [],
    mealName: `Item ${i}`,
    mealImpactScore: '6/10',
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('getPhotoAnalysisHistory — Android CursorWindow guard', () => {
  it('returns [] and drops the key when getItem throws (oversized row)', async () => {
    const getSpy = jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(
        new Error('Row too big to fit into CursorWindow requiredPos=0, totalRows=1'),
      );
    const removeSpy = jest.spyOn(AsyncStorage, 'removeItem');

    const result = await getPhotoAnalysisHistory();

    expect(result).toEqual([]);
    expect(getSpy).toHaveBeenCalledWith(KEY);
    expect(removeSpy).toHaveBeenCalledWith(KEY);
  });

  it('does not throw even if removeItem also fails', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('CursorWindow'));
    jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('nope'));

    await expect(getPhotoAnalysisHistory()).resolves.toEqual([]);
  });

  it('returns [] for missing/empty storage', async () => {
    await expect(getPhotoAnalysisHistory()).resolves.toEqual([]);
  });
});

describe('history size cap (MAX_HISTORY_ITEMS = 50)', () => {
  it('caps a pre-seeded oversized array to 50 on read', async () => {
    const now = Date.now();
    const items = Array.from({ length: 60 }, (_, i) =>
      makeItem(i, new Date(now - i * 1000).toISOString()),
    );
    await AsyncStorage.setItem(KEY, JSON.stringify(items));

    const result = await getPhotoAnalysisHistory();
    expect(result).toHaveLength(50);
  });

  it('never grows beyond 50 across many saves', async () => {
    for (let i = 0; i < 60; i++) {
      await savePhotoAnalysisHistoryItem({
        imageUri: `file:///tmp/m-${i}.jpg`,
        aiText: `MEAL: Save ${i}\nMEAL IMPACT SCORE: 5/10`,
        symptoms: [],
        mealImpactScore: '5/10',
      });
    }
    const result = await getPhotoAnalysisHistory();
    expect(result.length).toBeLessThanOrEqual(50);
    // newest is first
    expect(result[0].aiText).toContain('Save 59');
  });
});

describe('14-day window + shape compatibility', () => {
  it('drops entries older than 14 days', async () => {
    const now = Date.now();
    const fresh = makeItem(1, new Date(now).toISOString());
    const old = makeItem(2, new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString());
    await AsyncStorage.setItem(KEY, JSON.stringify([fresh, old]));

    const result = await getPhotoAnalysisHistory();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('id-1');
  });

  it('preserves the stored item shape (no base64 fields introduced)', async () => {
    await savePhotoAnalysisHistoryItem({
      imageUri: 'file:///tmp/meal.jpg',
      aiText: 'MEAL: Herbal tea\nMEAL IMPACT SCORE: 8/10',
      symptoms: ['bloating'],
      mealImpactScore: '8/10',
    });
    const [item] = await getPhotoAnalysisHistory();
    expect(Object.keys(item).sort()).toEqual(
      ['aiText', 'createdAt', 'id', 'imageUri', 'mealImpactScore', 'mealName', 'symptoms'].sort(),
    );
    expect(item.imageUri).toBe('file:///tmp/meal.jpg');
    expect(JSON.stringify(item)).not.toMatch(/base64/i);
  });
});
