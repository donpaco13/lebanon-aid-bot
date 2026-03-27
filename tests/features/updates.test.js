// tests/features/updates.test.js
jest.mock('../../src/services/sheets');

const sheets = require('../../src/services/sheets');
const { handleUpdates } = require('../../src/features/updates');

const makeRow = (needs_review, i) => ({
  title: `Report ${i}`,
  date: `2026-0${i}-01`,
  url: `https://example.com/${i}`,
  needs_review,
});

describe('handleUpdates', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns exactly 3 messages when 3 of 5 rows have needs_review=FALSE', async () => {
    sheets.fetchSheet.mockResolvedValue([
      makeRow('TRUE', 1),
      makeRow('FALSE', 2),
      makeRow('FALSE', 3),
      makeRow('TRUE', 4),
      makeRow('FALSE', 5),
    ]);

    const result = await handleUpdates({ lang: 'en' });
    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]).toContain('📰');
    expect(result.messages[0]).toContain('📅');
    expect(result.messages[0]).toContain('🔗');
  });

  test('returns fallback message in AR when 0 rows have needs_review=FALSE', async () => {
    sheets.fetchSheet.mockResolvedValue([makeRow('TRUE', 1), makeRow('TRUE', 2)]);
    const ar = await handleUpdates({ lang: 'ar' });
    expect(ar.messages).toHaveLength(1);
    expect(ar.messages[0]).toContain('reliefweb.int/lebanon');
  });

  test('returns fallback message in EN when 0 rows approved', async () => {
    sheets.fetchSheet.mockResolvedValue([]);
    const en = await handleUpdates({ lang: 'en' });
    expect(en.messages).toHaveLength(1);
    expect(en.messages[0]).toContain('No updates available');
  });

  test('returns fallback message in FR when 0 rows approved', async () => {
    sheets.fetchSheet.mockResolvedValue([]);
    const fr = await handleUpdates({ lang: 'fr' });
    expect(fr.messages).toHaveLength(1);
    expect(fr.messages[0]).toContain('Aucune mise à jour');
  });

  test('returns fallback without crash when sheets throws', async () => {
    sheets.fetchSheet.mockRejectedValue(new Error('network error'));
    const result = await handleUpdates({ lang: 'en' });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toContain('reliefweb.int/lebanon');
  });
});
