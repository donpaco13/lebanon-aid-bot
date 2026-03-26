// tests/scraper/ocha.test.js
const { scrapeOCHA } = require('../../src/scraper/ocha');

global.fetch = jest.fn();

const MOCK_ITEM = {
  id: 123,
  fields: {
    title: 'Lebanon Flash Update #5',
    date: { original: '2026-03-14' },
    body: 'مستشفى رفيق الحريري يستقبل الجرحى.',
    url: 'https://reliefweb.int/report/123',
  },
};

describe('scrapeOCHA', () => {
  beforeEach(() => jest.clearAllMocks());

  test('maps all required fields from API response', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [MOCK_ITEM] }),
    });

    const [item] = await scrapeOCHA();

    expect(item.source_id).toBe('123');
    expect(item.title).toBe('Lebanon Flash Update #5');
    expect(item.text).toBe('مستشفى رفيق الحريري يستقبل الجرحى.');
    expect(item.date).toBe('2026-03-14');
    expect(item.scraped_source).toBe('https://reliefweb.int/report/123');
    expect(item.auto_scraped).toBe('TRUE');
    expect(item.needs_review).toBe('TRUE');
  });

  test('falls back to current date when date field is missing', async () => {
    const itemNoDate = {
      id: 456,
      fields: { title: 'Update', body: 'text', url: 'https://reliefweb.int/456' },
    };
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [itemNoDate] }),
    });

    const [item] = await scrapeOCHA();

    expect(item.source_id).toBe('456');
    expect(typeof item.date).toBe('string');
    expect(item.date.length).toBeGreaterThan(0);
  });

  test('returns empty array on non-OK HTTP response or fetch error', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });
    expect(await scrapeOCHA()).toEqual([]);

    global.fetch.mockRejectedValue(new Error('timeout'));
    expect(await scrapeOCHA()).toEqual([]);
  });
});
