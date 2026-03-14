// tests/features/evacuation.test.js
const { handleEvacuation } = require('../../src/features/evacuation');

jest.mock('../../src/services/cache');
jest.mock('../../src/services/sheets');

const cache = require('../../src/services/cache');
const sheets = require('../../src/services/sheets');

const mockEvacuations = [
  { id: '1', zone_normalized: 'dahiye', status: 'active', direction_ar: 'روح ع الشمال', issued_at: '2026-03-14T08:00:00Z' },
  { id: '2', zone_normalized: 'hamra', status: 'all_clear', direction_ar: '', issued_at: '2026-03-13T10:00:00Z' },
];

describe('handleEvacuation', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns active evacuations for zone', async () => {
    cache.getFromCache.mockResolvedValue({ data: mockEvacuations, cachedAt: Date.now() });

    const result = await handleEvacuation({ zone: 'dahiye' });
    expect(result.evacuations).toHaveLength(1);
    expect(result.evacuations[0].status).toBe('active');
  });

  test('returns all_clear status for safe zones', async () => {
    cache.getFromCache.mockResolvedValue({ data: mockEvacuations, cachedAt: Date.now() });

    const result = await handleEvacuation({ zone: 'hamra' });
    expect(result.evacuations).toHaveLength(1);
    expect(result.evacuations[0].status).toBe('all_clear');
  });

  test('returns all active evacuations when no zone specified', async () => {
    cache.getFromCache.mockResolvedValue({ data: mockEvacuations, cachedAt: Date.now() });

    const result = await handleEvacuation({});
    expect(result.evacuations).toHaveLength(1); // only active ones
  });
});
