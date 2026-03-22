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

  test('throws for unknown key in non-production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      expect(() => t('NONEXISTENT', 'en')).toThrow('Unknown message key: NONEXISTENT');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  test('returns empty string for unknown key in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(t('NONEXISTENT', 'en')).toBe('');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});

describe('ONBOARDING', () => {
  test('contains the trilingue language selection prompt', () => {
    const msg = t('ONBOARDING', 'ar');
    expect(msg).toContain('1️⃣');
    expect(msg).toContain('2️⃣');
    expect(msg).toContain('3️⃣');
    expect(msg).toContain('العربية');
    expect(msg).toContain('English');
    expect(msg).toContain('Français');
  });

  test('same content regardless of lang parameter (intentionally trilingue)', () => {
    expect(t('ONBOARDING', 'ar')).toBe(t('ONBOARDING', 'en'));
    expect(t('ONBOARDING', 'en')).toBe(t('ONBOARDING', 'fr'));
  });
});

describe('EMERGENCY_FALLBACK', () => {
  test('returns Arabic fallback containing Croix-Rouge (140) and Civil Defence (125)', () => {
    const msg = t('EMERGENCY_FALLBACK', 'ar');
    expect(msg).toContain('140');
    expect(msg).toContain('125');
    expect(msg).toContain('112');
  });

  test('returns English fallback containing emergency numbers', () => {
    const msg = t('EMERGENCY_FALLBACK', 'en');
    expect(msg).toContain('140');
    expect(msg).toContain('125');
    expect(msg).toContain('1526');
  });

  test('returns French fallback containing emergency numbers', () => {
    const msg = t('EMERGENCY_FALLBACK', 'fr');
    expect(msg).toContain('140');
    expect(msg).toContain('04726111');
    expect(msg).toContain('175');
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

  test('includes distance when provided', () => {
    const result = formatShelterResult(shelter, 3.5, 'en');
    expect(result).toContain('3.5 km');
  });

  test('includes available_spots when present', () => {
    const result = formatShelterResult(shelter, undefined, 'en');
    expect(result).toContain('10');
    expect(result).toContain('Available spots');
  });

  test('uses French locale with Arabic fallback for missing name_fr', () => {
    const s = { name_ar: 'ملجأ', address_ar: 'بيروت' };
    const result = formatShelterResult(s, undefined, 'fr');
    expect(result).toContain('ملجأ');
  });
});

describe('formatStaleWarning()', () => {
  const ts = new Date('2026-03-17T14:30:00Z').getTime();

  test('returns Arabic warning for ar', () => {
    expect(formatStaleWarning(ts, 'ar')).toContain('⚠️');
    expect(formatStaleWarning(ts, 'ar')).toMatch(/\d{2}:\d{2}/);
    expect(formatStaleWarning(ts, 'ar')).toContain('14:30');
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

  test('returns stable status in English', () => {
    const evac = { zone: 'Achrafieh', status: 'stable', direction_ar: null };
    const result = formatEvacuationResult(evac, 'en');
    expect(result).toContain('🟢');
    expect(result).toContain('Situation stable');
  });

  test('returns active evacuation in Arabic', () => {
    const evac = { zone: 'الحمرا', status: 'active', direction_ar: 'اتجه شمالاً' };
    const result = formatEvacuationResult(evac, 'ar');
    expect(result).toContain('🔴');
    expect(result).toContain('إخلاء فوري');
    expect(result).toContain('اتجه شمالاً');
  });

  test('returns active evacuation in French', () => {
    const evac = { zone: 'Hamra', status: 'active', direction_fr: 'Dirigez-vous vers le nord', direction_ar: 'اتجه شمالاً' };
    const result = formatEvacuationResult(evac, 'fr');
    expect(result).toContain('🔴');
    expect(result).toContain('Évacuation immédiate');
    expect(result).toContain('Dirigez-vous vers le nord');
  });

  test('falls back to direction_ar when direction_fr absent', () => {
    const evac = { zone: 'Hamra', status: 'active', direction_ar: 'اتجه شمالاً' };
    const result = formatEvacuationResult(evac, 'fr');
    expect(result).toContain('اتجه شمالاً');
  });
});

describe('formatMedicalResult()', () => {
  test('uses name_en fallback pattern', () => {
    const facility = { name_ar: 'مستشفى', status: 'operational', last_verified_at: null };
    expect(formatMedicalResult(facility, undefined, 'en')).toContain('مستشفى');
  });

  test('includes timestamp when last_verified_at is present', () => {
    const facility = {
      name_ar: 'مستشفى الجامعة',
      name_en: 'AUB Medical Center',
      status: 'operational',
      last_verified_at: '2026-03-17T09:15:00Z',
    };
    const result = formatMedicalResult(facility, undefined, 'en');
    expect(result).toContain('09:15');
    expect(result).toContain('Last verified');
  });

  test('includes distance when provided', () => {
    const facility = { name_ar: 'مستشفى', status: 'operational', last_verified_at: null };
    const result = formatMedicalResult(facility, 2.3, 'en');
    expect(result).toContain('2.3 km');
  });

  test('shows limited status in English', () => {
    const facility = { name_ar: 'مستشفى', status: 'limited', last_verified_at: null };
    const result = formatMedicalResult(facility, undefined, 'en');
    expect(result).toContain('🟡 Limited');
  });

  test('shows closed status in English', () => {
    const facility = { name_ar: 'مستشفى', status: 'closed', last_verified_at: null };
    const result = formatMedicalResult(facility, undefined, 'en');
    expect(result).toContain('🔴 Closed');
  });

  test('returns Arabic locale strings', () => {
    const facility = {
      name_ar: 'مستشفى الجامعة',
      status: 'operational',
      last_verified_at: '2026-03-17T09:15:00Z',
    };
    const result = formatMedicalResult(facility, undefined, 'ar');
    expect(result).toContain('مستشفى الجامعة');
    expect(result).toContain('🟢 شغّال');
    expect(result).toContain('آخر تحقق');
  });
});

describe('formatRegistrationStep()', () => {
  test('renders basic step in Arabic', () => {
    const step = { step: 1, text_ar: 'اذهب إلى المركز', text_en: 'Go to the center' };
    const result = formatRegistrationStep(step, 'ar');
    expect(result).toContain('خطوة');
    expect(result).toContain('1');
    expect(result).toContain('اذهب إلى المركز');
  });

  test('renders basic step in English', () => {
    const step = { step: 1, text_ar: 'اذهب إلى المركز', text_en: 'Go to the center' };
    const result = formatRegistrationStep(step, 'en');
    expect(result).toContain('Step');
    expect(result).toContain('1');
    expect(result).toContain('Go to the center');
  });

  test('includes documents when present', () => {
    const step = {
      step: 2,
      text_ar: 'احضر وثائقك',
      text_en: 'Bring your documents',
      documents_ar: 'جواز السفر',
      documents_en: 'Passport',
    };
    const result = formatRegistrationStep(step, 'en');
    expect(result).toContain('Documents');
    expect(result).toContain('Passport');
  });

  test('includes link when present', () => {
    const step = {
      step: 3,
      text_ar: 'سجّل أونلاين',
      text_en: 'Register online',
      link: 'https://unhcr.org/register',
    };
    const result = formatRegistrationStep(step, 'en');
    expect(result).toContain('https://unhcr.org/register');
  });

  test('falls back to text_ar when text_en absent', () => {
    const step = { step: 1, text_ar: 'اذهب إلى المركز' };
    const result = formatRegistrationStep(step, 'en');
    expect(result).toContain('اذهب إلى المركز');
  });
});
