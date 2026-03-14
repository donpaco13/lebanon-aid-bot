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

  test('rate limits excessive requests', async () => {
    rateLimiter.checkRateLimit.mockResolvedValue({ allowed: false });

    const res = await request(app)
      .post('/api/webhook')
      .type('form')
      .send({ Body: '1', From: 'whatsapp:+961711234', NumMedia: '0' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('xml');
  });
});
