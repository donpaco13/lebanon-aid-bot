// tests/utils/phone.test.js
const { hashPhone, maskPhone, sanitizeLogs } = require('../../src/utils/phone');

describe('hashPhone', () => {
  beforeAll(() => { process.env.PHONE_SALT_SECRET = 'test-salt-123'; });

  test('returns consistent SHA256 hash', () => {
    const h1 = hashPhone('+961 71 123 456');
    const h2 = hashPhone('+961 71 123 456');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  test('different numbers produce different hashes', () => {
    expect(hashPhone('+961 71 111 111')).not.toBe(hashPhone('+961 71 222 222'));
  });
});

describe('maskPhone', () => {
  test('masks middle digits of Lebanese number', () => {
    expect(maskPhone('+96171123456')).toBe('+961 XX XX 34 56');
  });

  test('masks generic number keeping last 4', () => {
    expect(maskPhone('+33612345678')).toMatch(/\*+5678$/);
  });
});

describe('sanitizeLogs', () => {
  test('replaces phone numbers in log strings', () => {
    const log = 'User +96171123456 sent message';
    expect(sanitizeLogs(log)).not.toContain('+96171123456');
    expect(sanitizeLogs(log)).toContain('[PHONE]');
  });
});
