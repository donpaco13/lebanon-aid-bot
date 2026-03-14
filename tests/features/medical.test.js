// tests/features/medical.test.js
const { handleMedical } = require('../../src/features/medical');

jest.mock('../../src/services/cache');
jest.mock('../../src/services/sheets');

const cache = require('../../src/services/cache');
const sheets = require('../../src/services/sheets');

const mockFacilities = [
  { id: '1', name_ar: 'مستشفى الحمرا', zone_normalized: 'hamra', status: 'operational', lat: '33.89', lng: '35.50', last_verified_at: '2026-03-14T08:00:00Z' },
  { id: '2', name_ar: 'مستشفى صيدا', zone_normalized: 'saida', status: 'limited', lat: '33.56', lng: '35.37', last_verified_at: '2026-03-14T06:00:00Z' },
  { id: '3', name_ar: 'مستشفى مدمّر', zone_normalized: 'dahiye', status: 'destroyed', lat: '33.85', lng: '35.52', last_verified_at: '2026-03-13T12:00:00Z' },
];

describe('handleMedical', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns operational and limited facilities for zone', async () => {
    cache.getFromCache.mockResolvedValue({ data: mockFacilities, cachedAt: Date.now() });

    const result = await handleMedical({ zone: 'hamra' });
    expect(result.facilities).toHaveLength(1);
    expect(result.facilities[0].name_ar).toBe('مستشفى الحمرا');
  });

  test('filters out destroyed facilities', async () => {
    cache.getFromCache.mockResolvedValue({ data: mockFacilities, cachedAt: Date.now() });

    const result = await handleMedical({});
    expect(result.facilities.every(f => f.status !== 'destroyed')).toBe(true);
  });

  test('returns nearest when GPS provided', async () => {
    cache.getFromCache.mockResolvedValue({ data: mockFacilities, cachedAt: Date.now() });

    const result = await handleMedical({ location: { lat: 33.89, lng: 35.50 } });
    expect(result.facilities.length).toBeGreaterThan(0);
    expect(result.facilities[0].name_ar).toBe('مستشفى الحمرا');
  });

  test('fetches from sheets on cache miss', async () => {
    cache.getFromCache.mockResolvedValue(null);
    sheets.fetchSheet.mockResolvedValue(mockFacilities);
    cache.setCache.mockResolvedValue();

    const result = await handleMedical({ zone: 'saida' });
    expect(sheets.fetchSheet).toHaveBeenCalledWith('medical');
    expect(result.facilities).toHaveLength(1);
  });

  test('falls back to stale on sheets failure', async () => {
    cache.getFromCache.mockResolvedValue(null);
    sheets.fetchSheet.mockRejectedValue(new Error('down'));
    cache.getStaleOrNull.mockResolvedValue({ data: mockFacilities, cachedAt: Date.now() - 3600000 });

    const result = await handleMedical({ zone: 'hamra' });
    expect(result.stale).toBe(true);
  });
});
