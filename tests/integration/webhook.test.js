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

  // Lang persistence: non-digit message saves detected lang to KV
  test('saves detected language to KV under lang:phoneHash on non-digit message', async () => {
    cache.getFromCache.mockResolvedValue(null);
    sheets.fetchSheet.mockRejectedValue(new Error('down'));
    cache.getStaleOrNull.mockResolvedValue(null);

    const { kv } = require('@vercel/kv');

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: 'bonjour', From: 'whatsapp:+33200000001', NumMedia: '0' });

    expect(kv.set).toHaveBeenCalledWith(
      expect.stringContaining('lang:'),
      'fr',
      expect.any(Object)
    );
  });

  // Lang persistence: digit message reads stored lang from KV
  test('reads stored lang from KV when user sends a bare digit', async () => {
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

    expect(kv.get).toHaveBeenCalledWith(expect.stringContaining('lang:'));
  });

  // Lang persistence: digit with no stored lang defaults to 'ar'
  test('defaults to ar when digit sent with no stored lang in KV', async () => {
    cache.getFromCache.mockResolvedValue(null);
    sheets.fetchSheet.mockRejectedValue(new Error('down'));
    cache.getStaleOrNull.mockResolvedValue(null);

    const messages = require('../../src/bot/messages');
    const spy = jest.spyOn(messages, 't');

    await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: '3', From: 'whatsapp:+96100000099', NumMedia: '0' });

    expect(spy).toHaveBeenCalledWith('EMERGENCY_FALLBACK', 'ar');
    spy.mockRestore();
  });

  // Bug 1: emergency fallback when both cache and stale are unavailable
  test('returns EMERGENCY_FALLBACK (not ERROR_SHEETS_DOWN) when cache and stale both unavailable', async () => {
    cache.getFromCache.mockResolvedValue(null);
    sheets.fetchSheet.mockRejectedValue(new Error('Sheets down'));
    cache.getStaleOrNull.mockResolvedValue(null);

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
