// tests/services/cache.test.js
const { getFromCache, setCache, getStaleOrNull } = require('../../src/services/cache');

// Mock @vercel/kv
jest.mock('@vercel/kv', () => ({
  kv: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

const { kv } = require('@vercel/kv');

describe('cache', () => {
  beforeEach(() => jest.clearAllMocks());

  test('getFromCache returns parsed data on cache hit', async () => {
    kv.get.mockResolvedValue({ data: [{ id: '1' }], cachedAt: Date.now() });
    const result = await getFromCache('shelters:hamra');
    expect(result).toEqual({ data: [{ id: '1' }], cachedAt: expect.any(Number) });
  });

  test('getFromCache returns null on cache miss', async () => {
    kv.get.mockResolvedValue(null);
    const result = await getFromCache('shelters:hamra');
    expect(result).toBeNull();
  });

  test('setCache stores data with TTL', async () => {
    await setCache('shelters:hamra', [{ id: '1' }], 900);
    expect(kv.set).toHaveBeenCalledWith(
      'shelters:hamra',
      { data: [{ id: '1' }], cachedAt: expect.any(Number) },
      { ex: 900 }
    );
  });

  test('getStaleOrNull returns stale data from backup key', async () => {
    kv.get.mockResolvedValue({ data: [{ id: '1' }], cachedAt: 1000 });
    const result = await getStaleOrNull('shelters:hamra');
    expect(result).toEqual({ data: [{ id: '1' }], cachedAt: 1000 });
    expect(kv.get).toHaveBeenCalledWith('stale:shelters:hamra');
  });

  test('getStaleOrNull returns null if no stale data', async () => {
    kv.get.mockResolvedValue(null);
    const result = await getStaleOrNull('shelters:hamra');
    expect(result).toBeNull();
  });
});
