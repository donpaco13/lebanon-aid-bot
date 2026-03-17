// tests/features/aid.test.js
const { handleAid } = require('../../src/features/aid');

jest.mock('@vercel/kv', () => ({
  kv: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));
jest.mock('../../src/services/sheets');

const { kv } = require('@vercel/kv');
const sheets = require('../../src/services/sheets');

const PHONE_HASH = 'abc123';

describe('handleAid', () => {
  beforeEach(() => jest.clearAllMocks());

  test('starts flow by asking name when no state', async () => {
    kv.get.mockResolvedValue(null);
    const result = await handleAid({ phoneHash: PHONE_HASH, text: '4', lang: 'ar' });
    expect(result.reply).toContain('اسمك');
    expect(kv.set).toHaveBeenCalled();
  });

  test('advances to ask zone after name provided', async () => {
    kv.get.mockResolvedValue({ step: 'ask_name', lang: 'ar' });
    const result = await handleAid({ phoneHash: PHONE_HASH, text: 'Ahmad' });
    expect(result.reply).toContain('وين');
    expect(kv.set).toHaveBeenCalled();
  });

  test('advances to ask need after zone provided', async () => {
    kv.get.mockResolvedValue({ step: 'ask_zone', name: 'Ahmad', lang: 'ar' });
    const result = await handleAid({ phoneHash: PHONE_HASH, text: 'Hamra' });
    expect(result.reply).toContain('محتاج');
    expect(kv.set).toHaveBeenCalled();
  });

  test('completes flow and appends to sheet', async () => {
    kv.get.mockResolvedValue({ step: 'ask_need', name: 'Ahmad', zone: 'Hamra', lang: 'ar' });
    sheets.appendRow.mockResolvedValue();
    kv.del.mockResolvedValue();

    const result = await handleAid({ phoneHash: PHONE_HASH, text: '1' });
    expect(sheets.appendRow).toHaveBeenCalledWith('aid_requests', expect.objectContaining({
      name: 'Ahmad',
      zone: 'Hamra',
    }));
    expect(result.reply).toContain('✅');
    expect(result.notifyVolunteer).toBe(true);
    expect(result.ticketData).toMatchObject({ name: 'Ahmad', zone: 'Hamra', needType: 'أكل' });
    expect(kv.del).toHaveBeenCalled();
  });

  test('stores lang in KV state when starting flow', async () => {
    kv.get.mockResolvedValue(null);
    await handleAid({ phoneHash: PHONE_HASH, text: '4', lang: 'fr' });
    expect(kv.set).toHaveBeenCalledWith(
      `aid:${PHONE_HASH}`,
      expect.objectContaining({ step: 'ask_name', lang: 'fr' }),
      expect.any(Object)
    );
  });

  test('responds in French when lang is fr', async () => {
    kv.get.mockResolvedValue(null);
    const result = await handleAid({ phoneHash: PHONE_HASH, text: '4', lang: 'fr' });
    expect(result.reply).toContain('prénom');
  });

  test('uses stored lang from KV state on subsequent messages', async () => {
    kv.get.mockResolvedValue({ step: 'ask_name', lang: 'en' });
    const result = await handleAid({ phoneHash: PHONE_HASH, text: 'Ahmad', lang: 'ar' });
    // lang from KV ('en') takes precedence over incoming lang
    expect(result.reply).toContain('located');
  });
});
