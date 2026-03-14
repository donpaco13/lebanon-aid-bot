// tests/scraper/scheduler.test.js
const { run } = require('../../src/scraper/scheduler');

jest.mock('../../src/scraper/telegram');
jest.mock('../../src/scraper/ocha');
jest.mock('../../src/services/sheets');

const telegram = require('../../src/scraper/telegram');
const ocha = require('../../src/scraper/ocha');
const sheets = require('../../src/services/sheets');

describe('scheduler.run', () => {
  beforeEach(() => jest.clearAllMocks());

  test('runs both scrapers and appends new entries', async () => {
    telegram.scrapeTelegram.mockResolvedValue([
      { source_id: 'TG-1', text: 'إخلاء الضاحية', scraped_source: '@IDFarabic', auto_scraped: 'TRUE', needs_review: 'TRUE' },
    ]);
    ocha.scrapeOCHA.mockResolvedValue([
      { source_id: 'OCHA-1', title: 'Flash Update', scraped_source: 'reliefweb.int', auto_scraped: 'TRUE', needs_review: 'TRUE' },
    ]);
    sheets.fetchSheet.mockResolvedValue([]);
    sheets.appendRow.mockResolvedValue();

    const result = await run();
    expect(result.telegramCount).toBe(1);
    expect(result.ochaCount).toBe(1);
    expect(sheets.appendRow).toHaveBeenCalled();
  });

  test('skips already-existing entries by source_id', async () => {
    telegram.scrapeTelegram.mockResolvedValue([
      { source_id: 'TG-1', text: 'existing', scraped_source: '@IDFarabic', auto_scraped: 'TRUE', needs_review: 'TRUE' },
    ]);
    ocha.scrapeOCHA.mockResolvedValue([]);
    sheets.fetchSheet.mockResolvedValue([{ source_id: 'TG-1' }]);
    sheets.appendRow.mockResolvedValue();

    const result = await run();
    expect(result.telegramCount).toBe(0);
    expect(sheets.appendRow).not.toHaveBeenCalled();
  });

  test('returns zero counts on scraper failure', async () => {
    telegram.scrapeTelegram.mockRejectedValue(new Error('down'));
    ocha.scrapeOCHA.mockRejectedValue(new Error('down'));
    sheets.fetchSheet.mockResolvedValue([]);

    const result = await run();
    expect(result.telegramCount).toBe(0);
    expect(result.ochaCount).toBe(0);
  });
});
