// tests/features/shelter.test.js
const { handleShelter } = require('../../src/features/shelter');

jest.mock('../../src/services/cache');
jest.mock('../../src/services/sheets');

const cache = require('../../src/services/cache');
const sheets = require('../../src/services/sheets');

const mockShelters = [
  { id: '1', name_ar: 'ملجأ الحمرا', zone_normalized: 'hamra', address_ar: 'شارع الحمرا', available_spots: '15', status: 'open', lat: '33.89', lng: '35.50' },
  { id: '2', name_ar: 'ملجأ صيدا', zone_normalized: 'saida', address_ar: 'صيدا القديمة', available_spots: '30', status: 'open', lat: '33.56', lng: '35.37' },
];

describe('handleShelter', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns shelters filtered by zone', async () => {
    cache.getFromCache.mockResolvedValue(null);
    sheets.fetchSheet.mockResolvedValue(mockShelters);
    cache.setCache.mockResolvedValue();

    const result = await handleShelter({ zone: 'hamra' });
    expect(result.shelters).toHaveLength(1);
    expect(result.shelters[0].name_ar).toBe('ملجأ الحمرا');
    expect(result.stale).toBe(false);
  });

  test('returns from cache when available', async () => {
    cache.getFromCache.mockResolvedValue({
      data: mockShelters,
      cachedAt: Date.now(),
    });

    const result = await handleShelter({ zone: 'hamra' });
    expect(sheets.fetchSheet).not.toHaveBeenCalled();
    expect(result.shelters).toHaveLength(1);
  });

  test('returns nearest shelters when GPS provided', async () => {
    cache.getFromCache.mockResolvedValue({ data: mockShelters, cachedAt: Date.now() });

    const result = await handleShelter({ location: { lat: 33.89, lng: 35.50 } });
    expect(result.shelters).toHaveLength(2);
    expect(result.shelters[0].name_ar).toBe('ملجأ الحمرا'); // nearest
  });

  test('returns stale data with warning when sheets fails', async () => {
    cache.getFromCache.mockResolvedValue(null);
    sheets.fetchSheet.mockRejectedValue(new Error('API down'));
    cache.getStaleOrNull.mockResolvedValue({ data: mockShelters, cachedAt: Date.now() - 3600000 });

    const result = await handleShelter({ zone: 'hamra' });
    expect(result.stale).toBe(true);
    expect(result.cachedAt).toBeDefined();
  });

  test('filters out non-open shelters', async () => {
    const mixedShelters = [
      ...mockShelters,
      { id: '3', name_ar: 'مسكّر', zone_normalized: 'hamra', status: 'closed' },
    ];
    cache.getFromCache.mockResolvedValue({ data: mixedShelters, cachedAt: Date.now() });

    const result = await handleShelter({ zone: 'hamra' });
    expect(result.shelters.every(s => s.status === 'open')).toBe(true);
  });
});
