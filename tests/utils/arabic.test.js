// tests/utils/arabic.test.js
const { normalizeZone } = require('../../src/utils/arabic');

describe('normalizeZone', () => {
  test('normalizes Arabic text to lowercase latin token', () => {
    expect(normalizeZone('الحمرا')).toBe('hamra');
  });

  test('normalizes franco-arabic', () => {
    expect(normalizeZone('Hamra')).toBe('hamra');
    expect(normalizeZone('el hamra')).toBe('hamra');
    expect(normalizeZone('El Hamra')).toBe('hamra');
  });

  test('normalizes with diacritics removed', () => {
    expect(normalizeZone('الحَمْرا')).toBe('hamra');
  });

  test('handles Dahiyeh variants', () => {
    expect(normalizeZone('الضاحية')).toBe('dahiye');
    expect(normalizeZone('Dahiyeh')).toBe('dahiye');
    expect(normalizeZone('dahieh')).toBe('dahiye');
    expect(normalizeZone('الضاحيه')).toBe('dahiye');
  });

  test('handles Baalbek variants', () => {
    expect(normalizeZone('بعلبك')).toBe('baalbek');
    expect(normalizeZone('Baalbeck')).toBe('baalbek');
    expect(normalizeZone('baalbek')).toBe('baalbek');
  });

  test('returns trimmed lowercase for unknown zones', () => {
    expect(normalizeZone('  Some Place  ')).toBe('some place');
  });

  test('handles empty/null input', () => {
    expect(normalizeZone('')).toBe('');
    expect(normalizeZone(null)).toBe('');
    expect(normalizeZone(undefined)).toBe('');
  });
});
