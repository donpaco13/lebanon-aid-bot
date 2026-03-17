// tests/bot/messages.test.js
const { t, formatShelterResult, formatEvacuationResult, formatMedicalResult, formatRegistrationStep, formatStaleWarning } = require('../../src/bot/messages');

describe('t()', () => {
  test('returns Arabic string for ar', () => {
    expect(t('MENU', 'ar')).toContain('أهلا');
  });

  test('returns English string for en', () => {
    expect(t('MENU', 'en')).toContain('Hello');
  });

  test('returns French string for fr', () => {
    expect(t('MENU', 'fr')).toContain('Bonjour');
  });

  test('interpolates ticket in AID_CONFIRMED', () => {
    expect(t('AID_CONFIRMED', 'en', 'AID-XYZ')).toContain('AID-XYZ');
    expect(t('AID_CONFIRMED', 'fr', 'AID-XYZ')).toContain('AID-XYZ');
    expect(t('AID_CONFIRMED', 'ar', 'AID-XYZ')).toContain('AID-XYZ');
  });

  test('falls back to en for unknown lang', () => {
    expect(t('MENU', 'xx')).toContain('Hello');
  });
});

describe('formatShelterResult()', () => {
  const shelter = {
    name_ar: 'ملجأ الحمرا',
    name_en: 'Hamra Shelter',
    address_ar: 'الحمرا',
    available_spots: 10,
  };

  test('uses name_en for English', () => {
    expect(formatShelterResult(shelter, 1.2, 'en')).toContain('Hamra Shelter');
  });

  test('falls back to name_ar when name_en absent', () => {
    const s = { name_ar: 'ملجأ', address_ar: 'بيروت' };
    expect(formatShelterResult(s, undefined, 'en')).toContain('ملجأ');
  });

  test('uses name_ar for Arabic', () => {
    expect(formatShelterResult(shelter, undefined, 'ar')).toContain('ملجأ الحمرا');
  });
});

describe('formatStaleWarning()', () => {
  const ts = new Date('2026-03-17T14:30:00Z').getTime();

  test('returns Arabic warning for ar', () => {
    expect(formatStaleWarning(ts, 'ar')).toContain('⚠️');
    expect(formatStaleWarning(ts, 'ar')).toMatch(/\d{2}:\d{2}/);
  });

  test('returns English warning for en', () => {
    expect(formatStaleWarning(ts, 'en')).toContain('⚠️');
    expect(formatStaleWarning(ts, 'en')).toContain('14:30');
  });
});

describe('formatEvacuationResult()', () => {
  test('returns active evacuation in English', () => {
    const evac = { zone: 'Hamra', status: 'active', direction_ar: 'اتجه شمالاً' };
    const result = formatEvacuationResult(evac, 'en');
    expect(result).toContain('🔴');
    expect(result).toContain('Hamra');
  });
});

describe('formatMedicalResult()', () => {
  test('uses name_en fallback pattern', () => {
    const facility = { name_ar: 'مستشفى', status: 'operational', last_verified_at: null };
    expect(formatMedicalResult(facility, undefined, 'en')).toContain('مستشفى');
  });
});
