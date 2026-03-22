// tests/utils/language.test.js
const { detectLanguage } = require('../../src/utils/language');

describe('detectLanguage', () => {
  test('detects Arabic via unicode range', () => {
    expect(detectLanguage('مرحبا')).toBe('ar');
    expect(detectLanguage('وين أقرب ملجأ')).toBe('ar');
    expect(detectLanguage('محتاج مساعدة')).toBe('ar');
  });

  test('detects French via keywords', () => {
    expect(detectLanguage('bonjour')).toBe('fr');
    expect(detectLanguage("j'ai besoin d'aide")).toBe('fr');
    expect(detectLanguage('abri proche')).toBe('fr');
    expect(detectLanguage('évacuation')).toBe('fr');
    expect(detectLanguage('médecin disponible')).toBe('fr');
    expect(detectLanguage('nourriture')).toBe('fr');
    expect(detectLanguage('couverture')).toBe('fr');
  });

  test('detects English via keywords', () => {
    expect(detectLanguage('shelter nearby')).toBe('en');
    expect(detectLanguage('i need help')).toBe('en');
    expect(detectLanguage('hospital')).toBe('en');
    expect(detectLanguage('evacuate now')).toBe('en');
    expect(detectLanguage('food please')).toBe('en');
    expect(detectLanguage('blanket')).toBe('en');
  });

  test('Arabic takes priority over French/English if mixed', () => {
    expect(detectLanguage('help مرحبا')).toBe('ar');
  });

  test('defaults to ar for unrecognised input (majority of users are Arabic speakers)', () => {
    expect(detectLanguage('')).toBe('ar');
    expect(detectLanguage(null)).toBe('ar');
    expect(detectLanguage('123')).toBe('ar');
    expect(detectLanguage('menu')).toBe('ar');
  });

  test('single digits 1-5 default to ar', () => {
    expect(detectLanguage('1')).toBe('ar');
    expect(detectLanguage('5')).toBe('ar');
  });
});
