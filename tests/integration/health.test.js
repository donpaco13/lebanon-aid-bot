// tests/integration/health.test.js
const request = require('supertest');

jest.mock('@vercel/kv', () => ({
  kv: { ping: jest.fn().mockResolvedValue('PONG') },
}));
jest.mock('../../src/services/sheets', () => ({
  fetchSheet: jest.fn().mockResolvedValue([]),
}));

describe('GET /api/health', () => {
  let app;

  beforeAll(() => {
    process.env.TWILIO_ACCOUNT_SID = 'ACtest';
    process.env.TWILIO_AUTH_TOKEN = 'test';
    process.env.GOOGLE_SHEETS_ID = 'sheetid';
    process.env.PHONE_SALT_SECRET = 'salt';
    app = require('../../api/health');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply default mocks after clearAllMocks
    const { kv } = require('@vercel/kv');
    kv.ping.mockResolvedValue('PONG');
    const sheets = require('../../src/services/sheets');
    sheets.fetchSheet.mockResolvedValue([]);
    process.env.TWILIO_ACCOUNT_SID = 'ACtest';
    process.env.TWILIO_AUTH_TOKEN = 'test';
  });

  test('returns 200 with all checks passing', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.kv).toBe('ok');
    expect(res.body.checks.sheets).toBe('ok');
    expect(res.body.checks.twilio_env).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  test('returns 503 when KV is down', async () => {
    const { kv } = require('@vercel/kv');
    kv.ping.mockRejectedValueOnce(new Error('KV down'));

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.kv).toBe('error');
  });

  test('returns 503 when Sheets is unreachable', async () => {
    const sheets = require('../../src/services/sheets');
    sheets.fetchSheet.mockRejectedValueOnce(new Error('ECONNRESET'));

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.checks.sheets).toBe('error');
  });

  test('returns 503 when Twilio env vars missing', async () => {
    delete process.env.TWILIO_ACCOUNT_SID;

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.checks.twilio_env).toBe('error');

    process.env.TWILIO_ACCOUNT_SID = 'ACtest';
  });
});
