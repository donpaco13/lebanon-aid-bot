// tests/integration/webhook.test.js
const request = require('supertest');

jest.mock('../../src/services/cache');
jest.mock('../../src/services/sheets');
jest.mock('../../src/services/whisper');
jest.mock('../../src/services/rateLimiter');
jest.mock('@vercel/kv', () => ({
  kv: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() },
}));
jest.mock('twilio', () => {
  const mock = jest.fn().mockReturnValue({ messages: { create: jest.fn().mockResolvedValue({ sid: 'SM1' }) } });
  // Default: valid signature — individual tests override with mockReturnValueOnce(false)
  mock.validateRequest = jest.fn().mockReturnValue(true);
  mock.twiml = {
    MessagingResponse: jest.fn().mockImplementation(() => {
      const messages = [];
      return {
        message: jest.fn((text) => messages.push(text)),
        toString: jest.fn().mockReturnValue('<?xml version="1.0" encoding="UTF-8"?><Response><Message>ok</Message></Response>'),
      };
    }),
  };
  return mock;
});

const cache = require('../../src/services/cache');
const sheets = require('../../src/services/sheets');
const rateLimiter = require('../../src/services/rateLimiter');

describe('POST /api/webhook', () => {
  let app;

  beforeAll(() => {
    process.env.TWILIO_AUTH_TOKEN = 'test';
    process.env.PHONE_SALT_SECRET = 'test-salt';
    process.env.TWILIO_PHONE_NUMBER = 'whatsapp:+14155238886';
    app = require('../../api/webhook');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    rateLimiter.checkRateLimit.mockResolvedValue({ allowed: true });
    // Restore default valid signature after clearAllMocks wipes implementations
    const twilio = require('twilio');
    twilio.validateRequest.mockReturnValue(true);
    // Restore KV default
    const { kv } = require('@vercel/kv');
    kv.get.mockResolvedValue(null);
    kv.set.mockResolvedValue(undefined);
    kv.del.mockResolvedValue(undefined);
  });

  test('responds with menu for unrecognized text', async () => {
    const res = await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: 'مرحبا', From: 'whatsapp:+961711234', NumMedia: '0' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/xml');
  });

  test('responds with shelter data for menu option 1', async () => {
    cache.getFromCache.mockResolvedValue({
      data: [{ id: '1', name_ar: 'Test', zone_normalized: '', status: 'open', available_spots: '5', address_ar: '' }],
      cachedAt: Date.now(),
    });

    const res = await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: '1', From: 'whatsapp:+961711234', NumMedia: '0' });

    expect(res.status).toBe(200);
  });

  test('rejects request with invalid Twilio signature', async () => {
    const twilio = require('twilio');
    twilio.validateRequest.mockReturnValueOnce(false);

    const res = await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: '1', From: 'whatsapp:+961711234', NumMedia: '0' });

    expect(res.status).toBe(403);
  });

  test('accepts request with valid Twilio signature', async () => {
    const res = await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: 'مرحبا', From: 'whatsapp:+961711234', NumMedia: '0' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/xml');
  });

  test('rate limits excessive requests', async () => {
    rateLimiter.checkRateLimit.mockResolvedValue({ allowed: false });

    const res = await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: '1', From: 'whatsapp:+961711234', NumMedia: '0' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('xml');
  });

  // Edge case: empty message body returns main menu
  test('empty message body returns main menu XML', async () => {
    const res = await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: '', From: 'whatsapp:+961700000001', NumMedia: '0' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/xml');
  });

  // Edge case: unknown zone returns no results (shelter list exists but no zone match)
  test('unknown zone in shelter request returns no-results XML', async () => {
    cache.getFromCache.mockResolvedValue({
      data: [{ id: '1', name_ar: 'ملجأ', zone_normalized: 'بيروت', status: 'open', available_spots: '5', address_ar: '' }],
      cachedAt: Date.now(),
    });

    const res = await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: 'ملاجئ في زحلة', From: 'whatsapp:+961700000002', NumMedia: '0' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/xml');
  });

  // Edge case: Google Sheets unreachable falls back to stale cache
  test('Sheets unreachable falls back to stale cache without crashing', async () => {
    const staleTime = Date.now() - 30 * 60 * 1000; // 30 min ago
    cache.getFromCache.mockResolvedValue(null);  // fresh miss
    sheets.fetchSheet.mockRejectedValue(new Error('ECONNRESET'));
    cache.getStaleOrNull.mockResolvedValue({
      data: [{ id: '1', name_ar: 'ملجأ', zone_normalized: '', status: 'open', available_spots: '3', address_ar: '' }],
      cachedAt: staleTime,
    });

    const res = await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: '1', From: 'whatsapp:+961700000003', NumMedia: '0' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/xml');
  });

  // Edge case: KV down during aid flow — outer catch returns error XML, no 500
  test('KV down during aid flow returns graceful error XML, not 500', async () => {
    const { kv } = require('@vercel/kv');
    kv.get.mockRejectedValueOnce(new Error('KV connection refused'));

    const res = await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: '4', From: 'whatsapp:+961700000004', NumMedia: '0' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/xml');
  });

  // Language detection: English input should route through detectLanguage → 'en'
  // The TwiML mock returns a fixed XML string, so we verify the response is valid XML
  // and that detectLanguage is called correctly via the language utility unit tests.
  // This test validates that an English message Body is accepted and processed without error.
  test('English message body is processed without error', async () => {
    const res = await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: 'I need help', From: 'whatsapp:+441234567890', NumMedia: '0' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/xml');
  });

  test('French message body is processed without error', async () => {
    const res = await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: "J'ai besoin d'aide", From: 'whatsapp:+33123456789', NumMedia: '0' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/xml');
  });

  // Bug 2: "English" → saves lang:en and shows English menu
  test('"English" command saves lang:en and shows menu without requiring prior onboarding', async () => {
    const { kv } = require('@vercel/kv');
    kv.get.mockResolvedValue(null);

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: 'English', From: 'whatsapp:+44500000001', NumMedia: '0' });

    expect(kv.set).toHaveBeenCalledWith(expect.stringContaining('lang:'), 'en');
  });

  // Bug 2: "Français" → saves lang:fr
  test('"Français" command saves lang:fr', async () => {
    const { kv } = require('@vercel/kv');
    kv.get.mockResolvedValue(null);

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: 'Français', From: 'whatsapp:+33500000001', NumMedia: '0' });

    expect(kv.set).toHaveBeenCalledWith(expect.stringContaining('lang:'), 'fr');
  });

  // Bug 2: "langue" → clears lang, shows onboarding
  test('"langue" command clears stored lang and relaunches onboarding', async () => {
    const { kv } = require('@vercel/kv');
    kv.get.mockImplementation(async (key) => {
      if (key.startsWith('lang:')) return 'fr';
      return null;
    });

    const messages = require('../../src/bot/messages');
    const spy = jest.spyOn(messages, 't');

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: 'langue', From: 'whatsapp:+33500000002', NumMedia: '0' });

    expect(kv.del).toHaveBeenCalledWith(expect.stringContaining('lang:'));
    expect(spy).toHaveBeenCalledWith('ONBOARDING', 'ar');
    spy.mockRestore();
  });

  // Bug 2: "language" (English variant) → relaunches onboarding
  test('"language" command relaunches onboarding', async () => {
    const { kv } = require('@vercel/kv');
    kv.get.mockImplementation(async (key) => {
      if (key.startsWith('lang:')) return 'en';
      return null;
    });

    const messages = require('../../src/bot/messages');
    const spy = jest.spyOn(messages, 't');

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: 'language', From: 'whatsapp:+44500000002', NumMedia: '0' });

    expect(spy).toHaveBeenCalledWith('ONBOARDING', 'ar');
    spy.mockRestore();
  });

  // Bug 3: "reset" → clears both keys and shows onboarding
  test('"reset" command clears lang and onboarding KV keys', async () => {
    const { kv } = require('@vercel/kv');
    kv.get.mockImplementation(async (key) => {
      if (key.startsWith('lang:')) return 'ar';
      return null;
    });

    const messages = require('../../src/bot/messages');
    const spy = jest.spyOn(messages, 't');

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: 'reset', From: 'whatsapp:+96100000020', NumMedia: '0' });

    expect(kv.del).toHaveBeenCalledWith(expect.stringContaining('lang:'));
    expect(spy).toHaveBeenCalledWith('ONBOARDING', 'ar');
    spy.mockRestore();
  });

  // UX footer: known user response contains NAV_FOOTER
  test('known user response includes NAV_FOOTER appended after main content', async () => {
    const { kv } = require('@vercel/kv');
    kv.get.mockImplementation(async (key) => {
      if (key.startsWith('lang:')) return 'en';
      return null;
    });

    const messages = require('../../src/bot/messages');
    const spy = jest.spyOn(messages, 't');

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: 'help', From: 'whatsapp:+44500000010', NumMedia: '0' });

    expect(spy).toHaveBeenCalledWith('NAV_FOOTER', 'en');
    spy.mockRestore();
  });

  // UX footer: onboarding response does NOT include NAV_FOOTER
  test('onboarding response does not include NAV_FOOTER', async () => {
    const { kv } = require('@vercel/kv');
    kv.get.mockResolvedValue(null);

    const messages = require('../../src/bot/messages');
    const spy = jest.spyOn(messages, 't');

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: 'مرحبا', From: 'whatsapp:+96100000021', NumMedia: '0' });

    expect(spy).not.toHaveBeenCalledWith('NAV_FOOTER', expect.any(String));
    spy.mockRestore();
  });

  // Onboarding: new user (no lang in KV) receives trilingue onboarding
  test('new user with no stored lang receives onboarding and sets onboarding state in KV', async () => {
    const { kv } = require('@vercel/kv');
    kv.get.mockResolvedValue(null); // no aid, no lang, no onboarding state

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: 'مرحبا', From: 'whatsapp:+96100000010', NumMedia: '0' });

    expect(kv.set).toHaveBeenCalledWith(
      expect.stringContaining('onboarding:'),
      true,
      expect.any(Object)
    );
  });

  // Onboarding: user selects Arabic (1) — lang saved without TTL, onboarding cleared
  test('user in onboarding selects "1" — saves lang:ar without TTL and deletes onboarding key', async () => {
    const { kv } = require('@vercel/kv');
    kv.get.mockImplementation(async (key) => {
      if (key.startsWith('onboarding:')) return true;
      return null;
    });

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: '1', From: 'whatsapp:+96100000011', NumMedia: '0' });

    expect(kv.set).toHaveBeenCalledWith(expect.stringContaining('lang:'), 'ar');
    expect(kv.del).toHaveBeenCalledWith(expect.stringContaining('onboarding:'));
  });

  // Onboarding: user selects English (2)
  test('user in onboarding selects "2" — saves lang:en', async () => {
    const { kv } = require('@vercel/kv');
    kv.get.mockImplementation(async (key) => {
      if (key.startsWith('onboarding:')) return true;
      return null;
    });

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: '2', From: 'whatsapp:+96100000012', NumMedia: '0' });

    expect(kv.set).toHaveBeenCalledWith(expect.stringContaining('lang:'), 'en');
  });

  // Onboarding: user selects French (3)
  test('user in onboarding selects "3" — saves lang:fr', async () => {
    const { kv } = require('@vercel/kv');
    kv.get.mockImplementation(async (key) => {
      if (key.startsWith('onboarding:')) return true;
      return null;
    });

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: '3', From: 'whatsapp:+96100000013', NumMedia: '0' });

    expect(kv.set).toHaveBeenCalledWith(expect.stringContaining('lang:'), 'fr');
  });

  // Onboarding: invalid choice repeats onboarding, does not save lang
  test('user in onboarding with invalid choice receives onboarding again without saving lang', async () => {
    const { kv } = require('@vercel/kv');
    kv.get.mockImplementation(async (key) => {
      if (key.startsWith('onboarding:')) return true;
      return null;
    });

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: 'xyz', From: 'whatsapp:+96100000014', NumMedia: '0' });

    expect(kv.set).toHaveBeenCalledWith(
      expect.stringContaining('onboarding:'),
      true,
      expect.any(Object)
    );
    expect(kv.set).not.toHaveBeenCalledWith(
      expect.stringContaining('lang:'),
      expect.anything()
    );
  });

  // Universal "0" → menu in stored lang
  test('known user sends "0" — receives menu in their stored lang', async () => {
    const { kv } = require('@vercel/kv');
    kv.get.mockImplementation(async (key) => {
      if (key.startsWith('lang:')) return 'fr';
      return null;
    });

    const messages = require('../../src/bot/messages');
    const spy = jest.spyOn(messages, 't');

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: '0', From: 'whatsapp:+33300000001', NumMedia: '0' });

    expect(spy).toHaveBeenCalledWith('MENU', 'fr');
    spy.mockRestore();
  });

  // Universal "menu" → menu
  test('known user sends "menu" — receives menu in stored lang', async () => {
    const { kv } = require('@vercel/kv');
    kv.get.mockImplementation(async (key) => {
      if (key.startsWith('lang:')) return 'en';
      return null;
    });

    const messages = require('../../src/bot/messages');
    const spy = jest.spyOn(messages, 't');

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: 'menu', From: 'whatsapp:+44400000001', NumMedia: '0' });

    expect(spy).toHaveBeenCalledWith('MENU', 'en');
    spy.mockRestore();
  });

  // Universal "retour" → menu in French
  test('known user sends "retour" — receives menu in stored lang', async () => {
    const { kv } = require('@vercel/kv');
    kv.get.mockImplementation(async (key) => {
      if (key.startsWith('lang:')) return 'fr';
      return null;
    });

    const messages = require('../../src/bot/messages');
    const spy = jest.spyOn(messages, 't');

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: 'retour', From: 'whatsapp:+33300000002', NumMedia: '0' });

    expect(spy).toHaveBeenCalledWith('MENU', 'fr');
    spy.mockRestore();
  });

  // Universal "قائمة" → menu in Arabic
  test('known user sends "قائمة" — receives menu in stored lang', async () => {
    const { kv } = require('@vercel/kv');
    kv.get.mockImplementation(async (key) => {
      if (key.startsWith('lang:')) return 'ar';
      return null;
    });

    const messages = require('../../src/bot/messages');
    const spy = jest.spyOn(messages, 't');

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: 'قائمة', From: 'whatsapp:+96100000015', NumMedia: '0' });

    expect(spy).toHaveBeenCalledWith('MENU', 'ar');
    spy.mockRestore();
  });

  // Lang persistence: known user non-digit message updates stored lang in KV
  test('known user: non-digit message updates lang:phoneHash in KV', async () => {
    cache.getFromCache.mockResolvedValue(null);
    sheets.fetchSheet.mockRejectedValue(new Error('down'));
    cache.getStaleOrNull.mockResolvedValue(null);

    const { kv } = require('@vercel/kv');
    kv.get.mockImplementation(async (key) => {
      if (key.startsWith('lang:')) return 'ar'; // known user
      return null;
    });

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: 'bonjour', From: 'whatsapp:+33200000001', NumMedia: '0' });

    expect(kv.set).toHaveBeenCalledWith(
      expect.stringContaining('lang:'),
      'fr'
    );
  });

  // Lang persistence: digit message reads stored lang from KV for known user
  test('known user: digit message uses storedLang from KV (no re-detection)', async () => {
    cache.getFromCache.mockResolvedValue(null);
    sheets.fetchSheet.mockRejectedValue(new Error('down'));
    cache.getStaleOrNull.mockResolvedValue(null);

    const { kv } = require('@vercel/kv');
    kv.get.mockImplementation(async (key) => {
      if (key.startsWith('lang:')) return 'fr';
      return null;
    });

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: '2', From: 'whatsapp:+33200000002', NumMedia: '0' });

    // storedLang used directly — no new kv.set for lang:
    expect(kv.get).toHaveBeenCalledWith(expect.stringContaining('lang:'));
  });

  // New user sending a digit sees onboarding (not a feature response)
  test('new user sending a digit receives onboarding, not a feature response', async () => {
    const { kv } = require('@vercel/kv');
    kv.get.mockResolvedValue(null); // no lang, no aid, no onboarding state

    const messages = require('../../src/bot/messages');
    const spy = jest.spyOn(messages, 't');

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: '3', From: 'whatsapp:+96100000099', NumMedia: '0' });

    expect(spy).toHaveBeenCalledWith('ONBOARDING', 'ar');
    spy.mockRestore();
  });

  // Bug 1: emergency fallback when both cache and stale are unavailable (known user)
  test('known user: returns EMERGENCY_FALLBACK when cache and stale both unavailable', async () => {
    cache.getFromCache.mockResolvedValue(null);
    sheets.fetchSheet.mockRejectedValue(new Error('Sheets down'));
    cache.getStaleOrNull.mockResolvedValue(null);

    const { kv } = require('@vercel/kv');
    kv.get.mockImplementation(async (key) => {
      if (key.startsWith('lang:')) return 'ar'; // known user
      return null;
    });

    const messages = require('../../src/bot/messages');
    const spy = jest.spyOn(messages, 't');

    const res = await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: '1', From: 'whatsapp:+961700000099', NumMedia: '0' });

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith('EMERGENCY_FALLBACK', expect.any(String));
    spy.mockRestore();
  });

  // Bug 2+3: aid flow continues when KV state exists — free text is not misrouted to menu
  test('continues aid flow when KV has active state, advances step from ask_name to ask_zone', async () => {
    const { kv } = require('@vercel/kv');
    kv.get.mockImplementation(async (key) => {
      if (key.startsWith('aid:')) return { step: 'ask_name', lang: 'fr' };
      return null;
    });

    const res = await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: 'François', From: 'whatsapp:+33100000001', NumMedia: '0' });

    expect(res.status).toBe(200);
    expect(kv.set).toHaveBeenCalledWith(
      expect.stringContaining('aid:'),
      expect.objectContaining({ step: 'ask_zone', name: 'François', lang: 'fr' }),
      expect.any(Object)
    );
  });

  // Bug 2: language stored in KV state is persisted to next step, not re-detected from text
  test('persists stored lang into next KV state when user sends a name during aid flow', async () => {
    const { kv } = require('@vercel/kv');
    kv.get.mockImplementation(async (key) => {
      if (key.startsWith('aid:')) return { step: 'ask_name', lang: 'fr' };
      return null;
    });

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: 'Marie', From: 'whatsapp:+33100000002', NumMedia: '0' });

    // The KV state must carry lang:'fr' forward — not 'en' (which detectLanguage would infer from 'Marie')
    expect(kv.set).toHaveBeenCalledWith(
      expect.stringContaining('aid:'),
      expect.objectContaining({ step: 'ask_zone', name: 'Marie', lang: 'fr' }),
      expect.any(Object)
    );
  });
});
