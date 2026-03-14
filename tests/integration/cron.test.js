// tests/integration/cron.test.js
const request = require('supertest');
const express = require('express');

jest.mock('../../src/scraper/scheduler');
const scheduler = require('../../src/scraper/scheduler');

describe('GET /api/cron/scrape', () => {
  let app;

  beforeAll(() => {
    process.env.CRON_SECRET = 'test-secret';
    const cronHandler = require('../../api/cron/scrape');
    app = express();
    app.get('/api/cron/scrape', cronHandler);
  });

  beforeEach(() => jest.clearAllMocks());

  test('returns 401 without authorization', async () => {
    const res = await request(app).get('/api/cron/scrape');
    expect(res.status).toBe(401);
  });

  test('returns 200 with correct authorization and runs scheduler', async () => {
    scheduler.run.mockResolvedValue({ telegramCount: 2, ochaCount: 1 });

    const res = await request(app)
      .get('/api/cron/scrape')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.telegramCount).toBe(2);
  });

  test('returns 500 if scheduler throws', async () => {
    scheduler.run.mockRejectedValue(new Error('scheduler failed'));

    const res = await request(app)
      .get('/api/cron/scrape')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
  });
});
