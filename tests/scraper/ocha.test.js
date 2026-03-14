// tests/scraper/ocha.test.js
const { scrapeOCHA } = require('../../src/scraper/ocha');

global.fetch = jest.fn();

describe('scrapeOCHA', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns parsed shelter/medical data from OCHA API', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 123,
            fields: {
              title: 'Lebanon Flash Update #5',
              date: { original: '2026-03-14' },
              body: 'مستشفى رفيق الحريري يستقبل الجرحى. ملجأ في الحمرا متاح.',
              url: 'https://reliefweb.int/report/123',
            },
          },
        ],
      }),
    });

    const result = await scrapeOCHA();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('source_id');
    expect(result[0]).toHaveProperty('scraped_source');
  });

  test('returns empty array on fetch failure', async () => {
    global.fetch.mockRejectedValue(new Error('timeout'));
    const result = await scrapeOCHA();
    expect(result).toEqual([]);
  });
});
