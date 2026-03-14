// tests/scraper/telegram.test.js
const { scrapeTelegram } = require('../../src/scraper/telegram');

global.fetch = jest.fn();

describe('scrapeTelegram', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns parsed evacuation orders from Telegram messages', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: [
          {
            message: {
              message_id: 1,
              text: 'إخلاء فوري لمنطقة الضاحية الجنوبية اتجاه الشمال',
              date: 1710000000,
            },
          },
        ],
      }),
    });

    const result = await scrapeTelegram();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('source_id');
    expect(result[0]).toHaveProperty('text');
    expect(result[0]).toHaveProperty('scraped_source');
  });

  test('returns empty array on API failure', async () => {
    global.fetch.mockRejectedValue(new Error('network'));
    const result = await scrapeTelegram();
    expect(result).toEqual([]);
  });

  test('returns empty array when API returns ok:false', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, result: [] }),
    });
    const result = await scrapeTelegram();
    expect(result).toEqual([]);
  });
});
