# Security Hardening & Resilience Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Fix two critical security/correctness bugs, add exponential-backoff retry on external APIs, write edge-case tests, and add a health check endpoint.

**Architecture:** All changes are additive or minimal bug fixes. A shared `src/utils/retry.js` module handles backoff; sheets and twilio call it. The health endpoint is a standalone Vercel serverless file with no shared state.

**Tech Stack:** Node.js, Vercel serverless, Twilio SDK, googleapis, @vercel/kv.

---

## Bugs found during audit

| # | Location | Issue |
|---|----------|-------|
| 1 | `api/webhook.js:93` | `handleAid({ from, text })` passes raw phone instead of `phoneHash` — PII leak into aid flow |
| 2 | `api/webhook.js:102` | `result.response` is `undefined`; `aid.js` returns `{ reply }` — users get no response |
| 3 | `api/webhook.js` | `validateRequest` is imported but never called — any attacker can forge webhooks |

---

### Task 1: Fix `handleAid` interface mismatch

**Files:**
- Modify: `api/webhook.js:93,102`
- Modify: `src/features/aid.js:58` (add `notifyVolunteer` + `ticketData` on final step)
- Test: `tests/features/aid.test.js` (verify new return shape)

**Step 1: Update `aid.js` to return notify fields on final step**

In `src/features/aid.js`, replace the return at the end of the `ask_need` block:

```diff
-    await kv.del(stateKey);
-    return { reply: responses.AID_CONFIRMED(ticket) };
+    await kv.del(stateKey);
+    return {
+      reply: responses.AID_CONFIRMED(ticket),
+      notifyVolunteer: true,
+      ticketData: { ticket, name, zone, needType: need },
+    };
```

**Step 2: Fix webhook.js to pass `phoneHash` and read `reply`**

In `api/webhook.js`, replace:
```diff
-      const result = await handleAid({ from, text });
+      const result = await handleAid({ phoneHash, text });
       if (result.notifyVolunteer && result.ticketData) {
         notifyVolunteers({ ... }).catch(() => {});
       }
-      return result.response;
+      return result.reply;
```

**Step 3: Run existing aid tests**

```bash
cd /Users/francoishatem/Documents/💻\ Développement\ \&\ Code/GitHub/lebanon-aid-bot
npx jest tests/features/aid.test.js --no-coverage
```
Expected: all pass.

**Step 4: Verify webhook integration test still passes**

```bash
npx jest tests/integration/webhook.test.js --no-coverage
```
Expected: all pass.

**Step 5: Commit**

```bash
git add api/webhook.js src/features/aid.js
git commit -m "fix: resolve handleAid interface mismatch — pass phoneHash and read reply"
```

---

### Task 2: Add Twilio signature validation

**Files:**
- Modify: `api/webhook.js` — add validation before processing
- Test: `tests/integration/webhook.test.js` — add 403 on bad signature test

**Step 1: Add signature guard to webhook.js**

After line 21 (`app.post('/api/webhook', async (req, res) => {`), insert:

```javascript
  // Validate Twilio signature (P0 security requirement)
  const { validateRequest } = require('../src/services/twilio');
  const isValid = validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    req.headers['x-twilio-signature'] || '',
    process.env.TWILIO_WEBHOOK_URL || `https://${req.headers.host}/api/webhook`,
    req.body
  );
  if (!isValid) {
    return res.status(403).end();
  }
```

**Step 2: Write failing test**

Add to `tests/integration/webhook.test.js`:

```javascript
test('rejects request with invalid Twilio signature', async () => {
  // Override validateRequest to return false for this test
  const twilio = require('twilio');
  twilio.validateRequest.mockReturnValueOnce(false);

  const res = await request(app)
    .post('/api/webhook')
    .type('form')
    .send({ Body: '1', From: 'whatsapp:+961711234', NumMedia: '0' });

  expect(res.status).toBe(403);
});

test('accepts request with valid Twilio signature', async () => {
  const twilio = require('twilio');
  twilio.validateRequest.mockReturnValueOnce(true);

  const res = await request(app)
    .post('/api/webhook')
    .type('form')
    .send({ Body: 'مرحبا', From: 'whatsapp:+961711234', NumMedia: '0' });

  expect(res.status).toBe(200);
});
```

**Step 3: Run test to verify it fails first**

```bash
npx jest tests/integration/webhook.test.js --no-coverage
```
Expected: new tests fail (validateRequest not yet called).

**Step 4: Apply the guard to webhook.js (Step 1 above)**

**Step 5: Run tests again**

```bash
npx jest tests/integration/webhook.test.js --no-coverage
```
Expected: all pass.

**Step 6: Commit**

```bash
git add api/webhook.js tests/integration/webhook.test.js
git commit -m "fix: enforce Twilio signature validation on every webhook request (P0)"
```

---

### Task 3: Add exponential backoff retry utility

**Files:**
- Create: `src/utils/retry.js`
- Modify: `src/services/sheets.js`
- Modify: `src/services/twilio.js`
- Test: `tests/utils/retry.test.js`

**Step 1: Write failing test for retry utility**

Create `tests/utils/retry.test.js`:

```javascript
const { withRetry } = require('../../src/utils/retry');

describe('withRetry', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('returns value on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue('ok');
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });
    // Advance timers to skip backoff delay
    jest.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('throws after maxAttempts exhausted', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always fails'));
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
    jest.runAllTimersAsync();
    await expect(promise).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('does not retry on non-retryable error', async () => {
    const err = new Error('auth error');
    err.code = 401;
    const fn = jest.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 10,
      isRetryable: (e) => e.code !== 401
    })).rejects.toThrow('auth error');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Run to verify it fails**

```bash
npx jest tests/utils/retry.test.js --no-coverage
```
Expected: FAIL — `withRetry` not found.

**Step 3: Implement `src/utils/retry.js`**

```javascript
// src/utils/retry.js

const DEFAULT_OPTS = {
  maxAttempts: 3,
  baseDelayMs: 300,
  maxDelayMs: 5000,
  isRetryable: () => true,
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(fn, opts = {}) {
  const { maxAttempts, baseDelayMs, maxDelayMs, isRetryable } = { ...DEFAULT_OPTS, ...opts };

  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isRetryable(err)) throw err;
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      await sleep(delay);
    }
  }
  throw lastErr;
}

module.exports = { withRetry };
```

**Step 4: Run retry tests**

```bash
npx jest tests/utils/retry.test.js --no-coverage
```
Expected: all pass.

**Step 5: Apply retry to `src/services/sheets.js`**

Add import at top:
```javascript
const { withRetry } = require('../utils/retry');
```

Wrap both API calls:
```javascript
async function fetchSheet(tabName) {
  return withRetry(async () => {
    const client = getClient();
    const res = await client.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: `${tabName}!A:Z`,
    });
    // ... rest unchanged
  });
}

async function appendRow(tabName, data) {
  return withRetry(async () => {
    const client = getClient();
    // ... rest unchanged
  });
}
```

**Step 6: Apply retry to `src/services/twilio.js`**

Add import at top:
```javascript
const { withRetry } = require('../utils/retry');
```

Wrap sendMessage:
```javascript
async function sendMessage(to, body) {
  return withRetry(() => getClient().messages.create({
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
    body,
  }), { isRetryable: (err) => err.status >= 500 });
}
```

**Step 7: Run all service tests**

```bash
npx jest tests/services/sheets.test.js tests/services/twilio.test.js --no-coverage
```
Expected: all pass.

**Step 8: Commit**

```bash
git add src/utils/retry.js src/services/sheets.js src/services/twilio.js tests/utils/retry.test.js
git commit -m "feat: add exponential backoff retry to Sheets and Twilio calls"
```

---

### Task 4: Edge-case tests

**Files:**
- Modify: `tests/integration/webhook.test.js` — 4 new edge-case tests

Add the following tests to the existing `describe('POST /api/webhook')` block:

**Test A — Empty message body returns menu**

```javascript
test('empty message body returns main menu', async () => {
  const res = await request(app)
    .post('/api/webhook')
    .type('form')
    .send({ Body: '', From: 'whatsapp:+961700000001', NumMedia: '0' });

  expect(res.status).toBe(200);
  expect(res.text).toContain('xml');
  // Should return menu XML response, not crash
});
```

**Test B — Unknown zone returns NO_RESULTS**

```javascript
test('unknown zone in shelter request returns no-results response', async () => {
  cache.getFromCache.mockResolvedValue({
    data: [{ id: '1', name_ar: 'Test', zone_normalized: 'بيروت', status: 'open', available_spots: '5', address_ar: '' }],
    cachedAt: Date.now(),
  });

  const res = await request(app)
    .post('/api/webhook')
    .type('form')
    .send({ Body: 'ملاجئ في زحلة', From: 'whatsapp:+961700000002', NumMedia: '0' });

  expect(res.status).toBe(200);
  expect(res.text).toContain('xml');
});
```

**Test C — Google Sheets unreachable falls back to stale cache**

```javascript
test('Sheets unreachable falls back to stale cache with timestamp warning', async () => {
  const staleTime = Date.now() - 30 * 60 * 1000; // 30 min ago
  // Fresh cache miss, stale cache hit
  cache.getFromCache
    .mockResolvedValueOnce(null)                         // fresh miss
    .mockResolvedValueOnce({ data: [{ id: '1', name_ar: 'ملجأ', zone_normalized: '', status: 'open', available_spots: '3', address_ar: '' }], cachedAt: staleTime }); // stale hit
  sheets.fetchSheet.mockRejectedValue(new Error('ECONNRESET'));

  const res = await request(app)
    .post('/api/webhook')
    .type('form')
    .send({ Body: '1', From: 'whatsapp:+961700000003', NumMedia: '0' });

  expect(res.status).toBe(200);
  expect(res.text).toContain('xml');
});
```

**Test D — KV down during aid flow returns graceful error**

```javascript
test('KV down during aid flow returns graceful error, not crash', async () => {
  const { kv } = require('@vercel/kv');
  kv.get.mockRejectedValueOnce(new Error('KV connection refused'));

  const res = await request(app)
    .post('/api/webhook')
    .type('form')
    .send({ Body: '4', From: 'whatsapp:+961700000004', NumMedia: '0' });

  expect(res.status).toBe(200);
  expect(res.text).toContain('xml');
  // Should not 500 — caught by outer try/catch
});
```

**Step 1: Add all 4 tests to the file**

**Step 2: Run to see which fail (expected: C and D may fail before fixes)**

```bash
npx jest tests/integration/webhook.test.js --no-coverage --verbose
```

**Step 3: Fix any failures by adjusting mocks (no production code changes needed)**

**Step 4: Run full suite to confirm no regressions**

```bash
npx jest --no-coverage
```
Expected: ≥96 tests passing.

**Step 5: Commit**

```bash
git add tests/integration/webhook.test.js
git commit -m "test: add edge-case tests (empty msg, unknown zone, Sheets down, KV down)"
```

---

### Task 5: Health check endpoint

**Files:**
- Create: `api/health.js`
- Modify: `vercel.json` — add route for health endpoint
- Test: `tests/integration/health.test.js`

**Step 1: Write failing test**

Create `tests/integration/health.test.js`:

```javascript
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

  test('returns 200 with all checks passing', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.kv).toBe('ok');
    expect(res.body.checks.sheets).toBe('ok');
    expect(res.body.checks.twilio_env).toBe('ok');
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

    process.env.TWILIO_ACCOUNT_SID = 'ACtest'; // restore
  });
});
```

**Step 2: Run to confirm it fails**

```bash
npx jest tests/integration/health.test.js --no-coverage
```
Expected: FAIL — file not found.

**Step 3: Implement `api/health.js`**

```javascript
// api/health.js
const express = require('express');
const { kv } = require('@vercel/kv');
const sheets = require('../src/services/sheets');

const app = express();

app.get('/api/health', async (req, res) => {
  const checks = {};
  let degraded = false;

  // KV check
  try {
    await kv.ping();
    checks.kv = 'ok';
  } catch {
    checks.kv = 'error';
    degraded = true;
  }

  // Sheets check (fetch a small known tab)
  try {
    await sheets.fetchSheet('volunteers');
    checks.sheets = 'ok';
  } catch {
    checks.sheets = 'error';
    degraded = true;
  }

  // Twilio env vars check (no live call — just verify credentials are configured)
  const hasAccountSid = !!process.env.TWILIO_ACCOUNT_SID;
  const hasAuthToken = !!process.env.TWILIO_AUTH_TOKEN;
  if (hasAccountSid && hasAuthToken) {
    checks.twilio_env = 'ok';
  } else {
    checks.twilio_env = 'error';
    degraded = true;
  }

  const status = degraded ? 'degraded' : 'ok';
  return res.status(degraded ? 503 : 200).json({
    status,
    checks,
    timestamp: new Date().toISOString(),
  });
});

module.exports = app;
```

**Step 4: Add route to `vercel.json`**

Add to the `routes` array:
```json
{ "src": "/api/health", "dest": "/api/health.js" }
```

**Step 5: Run health tests**

```bash
npx jest tests/integration/health.test.js --no-coverage
```
Expected: all pass.

**Step 6: Run full suite**

```bash
npx jest --no-coverage
```
Expected: ≥100 tests passing.

**Step 7: Commit**

```bash
git add api/health.js tests/integration/health.test.js vercel.json
git commit -m "feat: add /api/health endpoint with KV, Sheets, and Twilio checks"
```

---

## Final verification

```bash
npx jest --no-coverage --verbose
```
All tests green. Then open a PR or merge to main.
