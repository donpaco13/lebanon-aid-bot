// tests/scraper/scheduler.test.js
const { run } = require('../../src/scraper/scheduler');

jest.mock('../../src/scraper/ocha');
jest.mock('../../src/services/sheets');

const ocha = require('../../src/scraper/ocha');
const sheets = require('../../src/services/sheets');

describe('scheduler.run', () => {
  beforeEach(() => jest.clearAllMocks());

  test('runs OCHA scraper and appends new entries', async () => {
    ocha.scrapeOCHA.mockResolvedValue([
      { source_id: 'OCHA-1', title: 'Flash Update', scraped_source: 'reliefweb.int', auto_scraped: 'TRUE', needs_review: 'TRUE' },
    ]);
    sheets.fetchSheet.mockResolvedValue([]);
    sheets.appendRow.mockResolvedValue();

    const result = await run();
    expect(result.ochaCount).toBe(1);
    expect(sheets.appendRow).toHaveBeenCalled();
  });

  test('skips already-existing entries by source_id', async () => {
    ocha.scrapeOCHA.mockResolvedValue([
      { source_id: 'OCHA-1', title: 'existing', scraped_source: 'reliefweb.int', auto_scraped: 'TRUE', needs_review: 'TRUE' },
    ]);
    sheets.fetchSheet.mockResolvedValue([{ source_id: 'OCHA-1' }]);
    sheets.appendRow.mockResolvedValue();

    const result = await run();
    expect(result.ochaCount).toBe(0);
    expect(sheets.appendRow).not.toHaveBeenCalled();
  });

  test('returns zero count on scraper failure', async () => {
    ocha.scrapeOCHA.mockRejectedValue(new Error('down'));
    sheets.fetchSheet.mockResolvedValue([]);

    const result = await run();
    expect(result.ochaCount).toBe(0);
  });
});
