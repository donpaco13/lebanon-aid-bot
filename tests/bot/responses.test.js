// tests/bot/responses.test.js
const responses = require('../../src/bot/responses');

describe('responses', () => {
  test('MENU is defined and contains numbered options', () => {
    expect(responses.MENU).toContain('1️⃣');
    expect(responses.MENU).toContain('5️⃣');
  });

  test('VOICE_RECEIVED is defined', () => {
    expect(responses.VOICE_RECEIVED).toBeDefined();
    expect(typeof responses.VOICE_RECEIVED).toBe('string');
  });

  test('ERROR_SHEETS_DOWN is defined', () => {
    expect(responses.ERROR_SHEETS_DOWN).toBeDefined();
  });

  test('formatStaleWarning includes time', () => {
    const result = responses.formatStaleWarning(new Date('2026-03-14T10:00:00Z'));
    expect(result).toContain('10:00');
  });

  test('formatShelterResult formats shelter data', () => {
    const shelter = {
      name_ar: 'ملجأ الحمرا',
      address_ar: 'شارع الحمرا',
      available_spots: '15',
      status: 'open',
    };
    const result = responses.formatShelterResult(shelter);
    expect(result).toContain('ملجأ الحمرا');
    expect(result).toContain('15');
  });

  test('formatMedicalResult includes last_verified_at disclaimer', () => {
    const facility = {
      name_ar: 'مستشفى رفيق الحريري',
      status: 'operational',
      last_verified_at: '2026-03-14T08:00:00Z',
    };
    const result = responses.formatMedicalResult(facility);
    expect(result).toContain('مستشفى رفيق الحريري');
    expect(result).toContain('⚠️');
  });
});
