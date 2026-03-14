// tests/services/rateLimiter.test.js
const { checkRateLimit } = require('../../src/services/rateLimiter');

jest.mock('@vercel/kv', () => ({
  kv: { get: jest.fn(), set: jest.fn(), incr: jest.fn() },
}));

const { kv } = require('@vercel/kv');

describe('checkRateLimit', () => {
  beforeEach(() => jest.clearAllMocks());

  test('allows request when under limit', async () => {
    kv.get.mockResolvedValue(5);
    const result = await checkRateLimit('hash123');
    expect(result.allowed).toBe(true);
  });

  test('blocks request when at limit', async () => {
    kv.get.mockResolvedValue(30);
    const result = await checkRateLimit('hash123');
    expect(result.allowed).toBe(false);
  });

  test('allows request on first message (no counter)', async () => {
    kv.get.mockResolvedValue(null);
    const result = await checkRateLimit('hash123');
    expect(result.allowed).toBe(true);
    expect(kv.set).toHaveBeenCalled();
  });
});
