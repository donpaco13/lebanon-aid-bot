// tests/features/registration.test.js
const { handleRegistration } = require('../../src/features/registration');

jest.mock('../../src/services/cache');
jest.mock('../../src/services/sheets');

const cache = require('../../src/services/cache');
const sheets = require('../../src/services/sheets');

const mockSteps = [
  { step: '1', text_ar: 'تقدّم للمفوضية السامية للأمم المتحدة لشؤون اللاجئين', documents_ar: 'هوية', link: 'https://unhcr.org' },
  { step: '2', text_ar: 'سجّل في بلدية منطقتك', documents_ar: 'هوية + إيجار', link: '' },
];

describe('handleRegistration', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns raw registration steps from sheet', async () => {
    cache.getFromCache.mockResolvedValue(null);
    sheets.fetchSheet.mockResolvedValue(mockSteps);
    cache.setCache.mockResolvedValue();

    const result = await handleRegistration();
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]).toEqual(mockSteps[0]);
    expect(result.steps[0].link).toBe('https://unhcr.org');
  });

  test('returns steps from cache if available', async () => {
    cache.getFromCache.mockResolvedValue({ data: mockSteps, cachedAt: Date.now() });

    const result = await handleRegistration();
    expect(sheets.fetchSheet).not.toHaveBeenCalled();
    expect(result.steps).toHaveLength(2);
  });

  test('returns error message on sheets failure', async () => {
    cache.getFromCache.mockResolvedValue(null);
    sheets.fetchSheet.mockRejectedValue(new Error('down'));
    cache.getStaleOrNull.mockResolvedValue(null);

    const result = await handleRegistration();
    expect(result.error).toBe(true);
  });
});
