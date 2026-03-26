// tests/features/aid.test.js
const { handleAid } = require('../../src/features/aid');

jest.mock('@vercel/kv', () => ({
  kv: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/services/sheets', () => ({
  appendRow: jest.fn(),
}));

const { kv } = require('@vercel/kv');
const logger = require('../../src/utils/logger');
const sheets = require('../../src/services/sheets');

const PHONE_HASH = 'abc123';

describe('handleAid', () => {
  beforeEach(() => jest.clearAllMocks());

  // --- Flow steps ---

  test('starts flow by asking name when no state', async () => {
    kv.get.mockResolvedValue(null);
    const result = await handleAid({ phoneHash: PHONE_HASH, text: '4', lang: 'ar' });
    expect(result.reply).toContain('اسمك');
    expect(kv.set).toHaveBeenCalled();
  });

  test('advances to ask_zone after name provided', async () => {
    kv.get.mockResolvedValue({ step: 'ask_name', lang: 'ar' });
    const result = await handleAid({ phoneHash: PHONE_HASH, text: 'Ahmad' });
    expect(result.reply).toContain('وين');
    expect(kv.set).toHaveBeenCalled();
  });

  test('advances to ask_need after zone provided', async () => {
    kv.get.mockResolvedValue({ step: 'ask_zone', name: 'Ahmad', lang: 'ar' });
    const result = await handleAid({ phoneHash: PHONE_HASH, text: 'Hamra' });
    expect(result.reply).toContain('محتاج');
    expect(kv.set).toHaveBeenCalled();
  });

  // --- Need parsing ---

  test('accepts single digit need "1"', async () => {
    kv.get
      .mockResolvedValueOnce({ step: 'ask_need', name: 'Ahmad', zone: 'Hamra', lang: 'ar' })
      .mockResolvedValueOnce('ar'); // lang:phoneHash
    kv.del.mockResolvedValue();

    const result = await handleAid({ phoneHash: PHONE_HASH, text: '1' });
    expect(result.ticketData.needType).toBe('أكل');
    expect(result.reply).toContain('✅');
  });

  test('accepts comma-separated needs "1, 2, 3"', async () => {
    kv.get
      .mockResolvedValueOnce({ step: 'ask_need', name: 'Fatima', zone: 'Tripoli', lang: 'ar' })
      .mockResolvedValueOnce('ar');
    kv.del.mockResolvedValue();

    const result = await handleAid({ phoneHash: PHONE_HASH, text: '1, 2, 3' });
    expect(result.ticketData.needType).toBe('أكل, فرشات / حرامات, دوا');
    expect(result.reply).toContain('✅');
  });

  test('accepts space-separated needs "1 2"', async () => {
    kv.get
      .mockResolvedValueOnce({ step: 'ask_need', name: 'Sara', zone: 'Saida', lang: 'en' })
      .mockResolvedValueOnce('en');
    kv.del.mockResolvedValue();

    const result = await handleAid({ phoneHash: PHONE_HASH, text: '1 2' });
    expect(result.ticketData.needType).toBe('Food, Blankets');
  });

  test('deduplicates repeated digits "1 1 2"', async () => {
    kv.get
      .mockResolvedValueOnce({ step: 'ask_need', name: 'Ali', zone: 'Beirut', lang: 'ar' })
      .mockResolvedValueOnce('ar');
    kv.del.mockResolvedValue();

    const result = await handleAid({ phoneHash: PHONE_HASH, text: '1 1 2' });
    expect(result.ticketData.needType).toBe('أكل, فرشات / حرامات');
  });

  test('falls back to raw text when no digit found', async () => {
    kv.get
      .mockResolvedValueOnce({ step: 'ask_need', name: 'Rami', zone: 'Dekwaneh', lang: 'ar' })
      .mockResolvedValueOnce('ar');
    kv.del.mockResolvedValue();

    const result = await handleAid({ phoneHash: PHONE_HASH, text: 'ماء وحليب' });
    expect(result.ticketData.needType).toBe('ماء وحليب');
  });

  // --- Language for confirmation ---

  test('confirmation uses lang:phoneHash, not state.lang', async () => {
    kv.get
      .mockResolvedValueOnce({ step: 'ask_need', name: 'Marie', zone: 'Hamra', lang: 'ar' }) // state has ar
      .mockResolvedValueOnce('fr'); // but lang:phoneHash is fr
    kv.del.mockResolvedValue();

    const result = await handleAid({ phoneHash: PHONE_HASH, text: '1' });
    expect(result.reply).toContain('demande'); // French confirmation text
  });

  test('confirmation falls back to session lang when lang:phoneHash absent', async () => {
    kv.get
      .mockResolvedValueOnce({ step: 'ask_need', name: 'Ahmad', zone: 'Hamra', lang: 'en' })
      .mockResolvedValueOnce(null); // lang:phoneHash missing
    kv.del.mockResolvedValue();

    const result = await handleAid({ phoneHash: PHONE_HASH, text: '1' });
    expect(result.reply).toContain('registered'); // English confirmation
  });

  // --- Google Sheets persistence ---

  test('persists aid request to sheets on submission', async () => {
    kv.get
      .mockResolvedValueOnce({ step: 'ask_need', name: 'Ahmad', zone: 'Hamra', lang: 'ar' })
      .mockResolvedValueOnce('ar');
    kv.del.mockResolvedValue();
    sheets.appendRow.mockResolvedValue();

    await handleAid({ phoneHash: PHONE_HASH, text: '1' });

    expect(sheets.appendRow).toHaveBeenCalledWith('aid_requests', expect.objectContaining({
      name: 'Ahmad',
      zone: 'Hamra',
      need: 'أكل',
      phone: PHONE_HASH,
      lang: 'ar',
    }));
  });

  test('sheets error does not crash the flow — logs and returns confirmation', async () => {
    kv.get
      .mockResolvedValueOnce({ step: 'ask_need', name: 'Ahmad', zone: 'Hamra', lang: 'ar' })
      .mockResolvedValueOnce('ar');
    kv.del.mockResolvedValue();
    sheets.appendRow.mockRejectedValue(new Error('Sheets unavailable'));

    const result = await handleAid({ phoneHash: PHONE_HASH, text: '1' });

    expect(result.reply).toContain('✅');
    expect(logger.error).toHaveBeenCalledWith('aid_sheets_write_failed', expect.objectContaining({
      error: 'Sheets unavailable',
    }));
  });

  test('notifyVolunteer is true on completion', async () => {
    kv.get
      .mockResolvedValueOnce({ step: 'ask_need', name: 'Ahmad', zone: 'Hamra', lang: 'ar' })
      .mockResolvedValueOnce('ar');
    kv.del.mockResolvedValue();

    const result = await handleAid({ phoneHash: PHONE_HASH, text: '2' });
    expect(result.notifyVolunteer).toBe(true);
    expect(result.ticketData).toMatchObject({ name: 'Ahmad', zone: 'Hamra' });
  });

  // --- Lang persistence ---

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
    expect(result.reply).toContain('located'); // English, not Arabic
  });
});
