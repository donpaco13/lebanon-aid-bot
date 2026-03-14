# Lebanon Aid Bot — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Build a WhatsApp chatbot in Lebanese dialect that helps displaced civilians find shelters, evacuation alerts, medical care, request aid, and register as displaced — powered by Google Sheets, cached via Vercel KV, with voice transcription via Whisper.

**Architecture:** Express monolith deployed as a Vercel serverless function. Google Sheets as the data backend editable by NGO volunteers. Vercel KV (Redis) for caching and resilience. Semi-automated scraping of Telegram IDF and OCHA sources with human validation.

**Tech Stack:** Node.js, Express, Twilio WhatsApp API, Google Sheets API (googleapis), OpenAI Whisper API, Vercel KV (@vercel/kv), Jest

**Design doc:** `docs/plans/2026-03-14-lebanon-aid-bot-design.md`

---

## Task 0: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `vercel.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `jest.config.js`

**Step 1: Initialize npm project**

Run: `npm init -y`

**Step 2: Install production dependencies**

Run: `npm install express twilio googleapis @vercel/kv openai`

**Step 3: Install dev dependencies**

Run: `npm install --save-dev jest`

**Step 4: Create vercel.json**

```json
{
  "version": 2,
  "builds": [
    { "src": "api/**/*.js", "use": "@vercel/node" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/$1" }
  ],
  "crons": [
    { "path": "/api/cron/scrape", "schedule": "*/30 * * * *" }
  ]
}
```

**Step 5: Create .env.example**

```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
GOOGLE_SHEETS_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
OPENAI_API_KEY=
TELEGRAM_BOT_TOKEN=
KV_REST_API_URL=
KV_REST_API_TOKEN=
PHONE_SALT_SECRET=
```

**Step 6: Create .gitignore**

```
node_modules/
.env
.vercel/
coverage/
```

**Step 7: Create jest.config.js**

```js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', 'api/**/*.js'],
};
```

**Step 8: Add test script to package.json**

Set `"scripts": { "test": "jest --verbose", "test:watch": "jest --watch" }` in package.json.

**Step 9: Create directory structure**

```bash
mkdir -p api/cron src/bot src/features src/services src/scraper src/utils tests/bot tests/features tests/services tests/scraper tests/utils tests/integration
```

**Step 10: Commit**

```bash
git add -A && git commit -m "chore: scaffold project with dependencies and config"
```

---

## Task 1: Arabic text normalization utility

**Files:**
- Create: `src/utils/arabic.js`
- Create: `tests/utils/arabic.test.js`

**Step 1: Write the failing test**

```js
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
```

**Step 2: Run test to verify it fails**

Run: `npx jest tests/utils/arabic.test.js --verbose`
Expected: FAIL — `Cannot find module '../../src/utils/arabic'`

**Step 3: Write implementation**

```js
// src/utils/arabic.js

// Map of Arabic zone names to normalized tokens
const ARABIC_TO_TOKEN = {
  'الحمرا': 'hamra',
  'الحمراء': 'hamra',
  'الضاحية': 'dahiye',
  'الضاحيه': 'dahiye',
  'بعلبك': 'baalbek',
  'صيدا': 'saida',
  'صور': 'tyre',
  'طرابلس': 'tripoli',
  'جونيه': 'jounieh',
  'جبيل': 'jbeil',
  'البقاع': 'bekaa',
  'زحلة': 'zahle',
  'النبطية': 'nabatieh',
  'بنت جبيل': 'bint jbeil',
  'مرجعيون': 'marjayoun',
  'بيروت': 'beirut',
  'الشياح': 'chiyah',
  'برج البراجنة': 'borj barajne',
  'حارة حريك': 'haret hreik',
};

// Map of franco-arabic variants to normalized tokens
const FRANCO_TO_TOKEN = {
  'hamra': 'hamra',
  'el hamra': 'hamra',
  'dahiyeh': 'dahiye',
  'dahieh': 'dahiye',
  'dahiye': 'dahiye',
  'baalbek': 'baalbek',
  'baalbeck': 'baalbek',
  'saida': 'saida',
  'sidon': 'saida',
  'tyre': 'tyre',
  'sour': 'tyre',
  'tripoli': 'tripoli',
  'trablous': 'tripoli',
  'jounieh': 'jounieh',
  'jbeil': 'jbeil',
  'byblos': 'jbeil',
  'bekaa': 'bekaa',
  'beqaa': 'bekaa',
  'zahle': 'zahle',
  'zahleh': 'zahle',
  'nabatieh': 'nabatieh',
  'nabatiyeh': 'nabatieh',
  'bint jbeil': 'bint jbeil',
  'marjayoun': 'marjayoun',
  'beirut': 'beirut',
  'beyrouth': 'beirut',
  'chiyah': 'chiyah',
  'borj barajne': 'borj barajne',
  'haret hreik': 'haret hreik',
};

function removeDiacritics(text) {
  // Remove Arabic diacritics (tashkeel)
  return text.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, '');
}

function normalizeZone(input) {
  if (!input) return '';
  const trimmed = input.trim();
  if (!trimmed) return '';

  // Remove Arabic diacritics
  const noDiacritics = removeDiacritics(trimmed);

  // Try Arabic lookup
  if (ARABIC_TO_TOKEN[noDiacritics]) {
    return ARABIC_TO_TOKEN[noDiacritics];
  }

  // Try franco-arabic lookup (case-insensitive)
  const lower = noDiacritics.toLowerCase();
  if (FRANCO_TO_TOKEN[lower]) {
    return FRANCO_TO_TOKEN[lower];
  }

  // Fallback: return trimmed lowercase
  return lower;
}

module.exports = { normalizeZone, removeDiacritics, ARABIC_TO_TOKEN, FRANCO_TO_TOKEN };
```

**Step 4: Run test to verify it passes**

Run: `npx jest tests/utils/arabic.test.js --verbose`
Expected: PASS — all tests green

**Step 5: Commit**

```bash
git add src/utils/arabic.js tests/utils/arabic.test.js
git commit -m "feat: add Arabic text normalization utility"
```

---

## Task 2: Vercel KV cache service

**Files:**
- Create: `src/services/cache.js`
- Create: `tests/services/cache.test.js`

**Step 1: Write the failing test**

```js
// tests/services/cache.test.js
const { getFromCache, setCache, getStaleOrNull } = require('../../src/services/cache');

// Mock @vercel/kv
jest.mock('@vercel/kv', () => ({
  kv: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

const { kv } = require('@vercel/kv');

describe('cache', () => {
  beforeEach(() => jest.clearAllMocks());

  test('getFromCache returns parsed data on cache hit', async () => {
    kv.get.mockResolvedValue({ data: [{ id: '1' }], cachedAt: Date.now() });
    const result = await getFromCache('shelters:hamra');
    expect(result).toEqual({ data: [{ id: '1' }], cachedAt: expect.any(Number) });
  });

  test('getFromCache returns null on cache miss', async () => {
    kv.get.mockResolvedValue(null);
    const result = await getFromCache('shelters:hamra');
    expect(result).toBeNull();
  });

  test('setCache stores data with TTL', async () => {
    await setCache('shelters:hamra', [{ id: '1' }], 900);
    expect(kv.set).toHaveBeenCalledWith(
      'shelters:hamra',
      { data: [{ id: '1' }], cachedAt: expect.any(Number) },
      { ex: 900 }
    );
  });

  test('getStaleOrNull returns stale data from backup key', async () => {
    kv.get.mockResolvedValue({ data: [{ id: '1' }], cachedAt: 1000 });
    const result = await getStaleOrNull('shelters:hamra');
    expect(result).toEqual({ data: [{ id: '1' }], cachedAt: 1000 });
    expect(kv.get).toHaveBeenCalledWith('stale:shelters:hamra');
  });

  test('getStaleOrNull returns null if no stale data', async () => {
    kv.get.mockResolvedValue(null);
    const result = await getStaleOrNull('shelters:hamra');
    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest tests/services/cache.test.js --verbose`
Expected: FAIL

**Step 3: Write implementation**

```js
// src/services/cache.js
const { kv } = require('@vercel/kv');

// TTL values in seconds
const TTL = {
  shelters: 900,      // 15 min
  evacuations: 300,   // 5 min
  medical: 600,       // 10 min
  registration: 3600, // 1h
  zones: 3600,        // 1h
};

const STALE_TTL = 86400; // 24h — stale backup lives longer

async function getFromCache(key) {
  try {
    const cached = await kv.get(key);
    return cached || null;
  } catch {
    return null;
  }
}

async function setCache(key, data, ttlSeconds) {
  try {
    const payload = { data, cachedAt: Date.now() };
    await kv.set(key, payload, { ex: ttlSeconds });
    // Also store in stale backup with longer TTL
    await kv.set(`stale:${key}`, payload, { ex: STALE_TTL });
  } catch {
    // Cache write failure is non-fatal
  }
}

async function getStaleOrNull(key) {
  try {
    return await kv.get(`stale:${key}`) || null;
  } catch {
    return null;
  }
}

module.exports = { getFromCache, setCache, getStaleOrNull, TTL };
```

**Step 4: Run test to verify it passes**

Run: `npx jest tests/services/cache.test.js --verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/cache.js tests/services/cache.test.js
git commit -m "feat: add Vercel KV cache service with stale fallback"
```

---

## Task 3: Google Sheets service

**Files:**
- Create: `src/services/sheets.js`
- Create: `tests/services/sheets.test.js`

**Step 1: Write the failing test**

```js
// tests/services/sheets.test.js
const { fetchSheet, appendRow } = require('../../src/services/sheets');

// Mock googleapis
jest.mock('googleapis', () => {
  const mockGet = jest.fn();
  const mockAppend = jest.fn();
  return {
    google: {
      auth: {
        GoogleAuth: jest.fn().mockImplementation(() => ({})),
      },
      sheets: jest.fn().mockReturnValue({
        spreadsheets: {
          values: {
            get: mockGet,
            append: mockAppend,
          },
        },
      }),
    },
    __mockGet: mockGet,
    __mockAppend: mockAppend,
  };
});

const { __mockGet, __mockAppend } = require('googleapis');

describe('sheets', () => {
  beforeEach(() => jest.clearAllMocks());

  test('fetchSheet returns rows as objects using header row', async () => {
    __mockGet.mockResolvedValue({
      data: {
        values: [
          ['id', 'name_ar', 'zone', 'status'],
          ['1', 'ملجأ الحمرا', 'الحمرا', 'open'],
          ['2', 'ملجأ صيدا', 'صيدا', 'full'],
        ],
      },
    });
    const rows = await fetchSheet('shelters');
    expect(rows).toEqual([
      { id: '1', name_ar: 'ملجأ الحمرا', zone: 'الحمرا', status: 'open' },
      { id: '2', name_ar: 'ملجأ صيدا', zone: 'صيدا', status: 'full' },
    ]);
  });

  test('fetchSheet returns empty array when no data rows', async () => {
    __mockGet.mockResolvedValue({
      data: { values: [['id', 'name_ar']] },
    });
    const rows = await fetchSheet('shelters');
    expect(rows).toEqual([]);
  });

  test('fetchSheet filters out rows where needs_review is TRUE', async () => {
    __mockGet.mockResolvedValue({
      data: {
        values: [
          ['id', 'name_ar', 'needs_review'],
          ['1', 'verified', 'FALSE'],
          ['2', 'unverified', 'TRUE'],
        ],
      },
    });
    const rows = await fetchSheet('shelters');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('1');
  });

  test('appendRow appends a row to the sheet', async () => {
    __mockAppend.mockResolvedValue({});
    await appendRow('aid_requests', { id: '1', name: 'Ahmad', zone: 'Hamra' });
    expect(__mockAppend).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest tests/services/sheets.test.js --verbose`
Expected: FAIL

**Step 3: Write implementation**

```js
// src/services/sheets.js
const { google } = require('googleapis');

let sheetsClient = null;

function getClient() {
  if (sheetsClient) return sheetsClient;
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

async function fetchSheet(tabName) {
  const client = getClient();
  const res = await client.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range: `${tabName}!A:Z`,
  });
  const rows = res.data.values;
  if (!rows || rows.length < 2) return [];

  const headers = rows[0];
  const needsReviewIndex = headers.indexOf('needs_review');

  return rows.slice(1)
    .filter(row => {
      if (needsReviewIndex === -1) return true;
      const val = (row[needsReviewIndex] || '').toUpperCase();
      return val !== 'TRUE';
    })
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] || ''; });
      return obj;
    });
}

async function appendRow(tabName, data) {
  const client = getClient();
  // Fetch headers first to ensure correct column order
  const headerRes = await client.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range: `${tabName}!1:1`,
  });
  const headers = headerRes.data.values?.[0] || [];
  const row = headers.map(h => data[h] || '');

  await client.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range: `${tabName}!A:Z`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });
}

module.exports = { fetchSheet, appendRow };
```

**Step 4: Run test to verify it passes**

Run: `npx jest tests/services/sheets.test.js --verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/sheets.js tests/services/sheets.test.js
git commit -m "feat: add Google Sheets service with needs_review filter"
```

---

## Task 4: Geolocation service

**Files:**
- Create: `src/services/geo.js`
- Create: `tests/services/geo.test.js`

**Step 1: Write the failing test**

```js
// tests/services/geo.test.js
const { haversineDistance, findNearest, parseLocation } = require('../../src/services/geo');

describe('haversineDistance', () => {
  test('calculates distance between two points in km', () => {
    // Beirut to Sidon ~42km
    const d = haversineDistance(33.8938, 35.5018, 33.5572, 35.3729);
    expect(d).toBeGreaterThan(38);
    expect(d).toBeLessThan(45);
  });

  test('same point returns 0', () => {
    expect(haversineDistance(33.89, 35.50, 33.89, 35.50)).toBe(0);
  });
});

describe('findNearest', () => {
  const items = [
    { id: '1', lat: '33.89', lng: '35.50' }, // closest
    { id: '2', lat: '34.43', lng: '35.83' }, // far
    { id: '3', lat: '33.88', lng: '35.49' }, // second closest
  ];

  test('returns N nearest items sorted by distance', () => {
    const result = findNearest(33.89, 35.50, items, 2);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('1');
    expect(result[1].id).toBe('3');
    expect(result[0].distance).toBeDefined();
  });

  test('skips items without lat/lng', () => {
    const withMissing = [...items, { id: '4' }];
    const result = findNearest(33.89, 35.50, withMissing, 5);
    expect(result).toHaveLength(3);
  });
});

describe('parseLocation', () => {
  test('extracts lat/lng from Twilio location message', () => {
    const result = parseLocation({ Latitude: '33.89', Longitude: '35.50' });
    expect(result).toEqual({ lat: 33.89, lng: 35.50 });
  });

  test('returns null if no location data', () => {
    expect(parseLocation({})).toBeNull();
    expect(parseLocation({ Body: 'hello' })).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest tests/services/geo.test.js --verbose`
Expected: FAIL

**Step 3: Write implementation**

```js
// src/services/geo.js

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function findNearest(lat, lng, items, count = 3) {
  return items
    .filter(item => item.lat && item.lng)
    .map(item => ({
      ...item,
      distance: haversineDistance(lat, lng, parseFloat(item.lat), parseFloat(item.lng)),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count);
}

function parseLocation(twilioBody) {
  if (twilioBody.Latitude && twilioBody.Longitude) {
    return {
      lat: parseFloat(twilioBody.Latitude),
      lng: parseFloat(twilioBody.Longitude),
    };
  }
  return null;
}

module.exports = { haversineDistance, findNearest, parseLocation };
```

**Step 4: Run test to verify it passes**

Run: `npx jest tests/services/geo.test.js --verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/geo.js tests/services/geo.test.js
git commit -m "feat: add geolocation service with haversine distance"
```

---

## Task 5: Phone privacy utility

**Files:**
- Create: `src/utils/phone.js`
- Create: `tests/utils/phone.test.js`

**Step 1: Write the failing test**

```js
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
```

**Step 2: Run test to verify it fails**

Run: `npx jest tests/utils/phone.test.js --verbose`
Expected: FAIL

**Step 3: Write implementation**

```js
// src/utils/phone.js
const crypto = require('crypto');

function hashPhone(phone) {
  const salt = process.env.PHONE_SALT_SECRET || '';
  return crypto.createHash('sha256').update(phone + salt).digest('hex');
}

function maskPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('961') && digits.length >= 11) {
    const last4 = digits.slice(-4);
    return `+961 XX XX ${last4.slice(0, 2)} ${last4.slice(2)}`;
  }
  const last4 = digits.slice(-4);
  return '*'.repeat(Math.max(0, digits.length - 4)) + last4;
}

function sanitizeLogs(text) {
  // Match international phone numbers
  return text.replace(/\+?\d[\d\s-]{7,14}\d/g, '[PHONE]');
}

module.exports = { hashPhone, maskPhone, sanitizeLogs };
```

**Step 4: Run test to verify it passes**

Run: `npx jest tests/utils/phone.test.js --verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/phone.js tests/utils/phone.test.js
git commit -m "feat: add phone privacy utilities (hash, mask, sanitize)"
```

---

## Task 6: Lebanese dialect response texts

**Files:**
- Create: `src/bot/responses.js`
- Create: `tests/bot/responses.test.js`

**Step 1: Write the failing test**

```js
// tests/bot/responses.test.js
const responses = require('../../src/bot/responses');

describe('responses', () => {
  test('MENU is defined and contains numbered options', () => {
    expect(responses.MENU).toContain('1️⃣');
    expect(responses.MENU).toContain('5️⃣');
  });

  test('VOICE_RECEIVED is defined', () => {
    expect(responses.VOICE_RECEIVED).toBeDefined();
    expect(typeof responses.VOICE_RECEIVED).toBe('string');
  });

  test('ERROR_SHEETS_DOWN is defined', () => {
    expect(responses.ERROR_SHEETS_DOWN).toBeDefined();
  });

  test('formatStaleWarning includes time', () => {
    const result = responses.formatStaleWarning(new Date('2026-03-14T10:00:00Z'));
    expect(result).toContain('10:00');
  });

  test('formatShelterResult formats shelter data', () => {
    const shelter = {
      name_ar: 'ملجأ الحمرا',
      address_ar: 'شارع الحمرا',
      available_spots: '15',
      status: 'open',
    };
    const result = responses.formatShelterResult(shelter);
    expect(result).toContain('ملجأ الحمرا');
    expect(result).toContain('15');
  });

  test('formatMedicalResult includes last_verified_at disclaimer', () => {
    const facility = {
      name_ar: 'مستشفى رفيق الحريري',
      status: 'operational',
      last_verified_at: '2026-03-14T08:00:00Z',
    };
    const result = responses.formatMedicalResult(facility);
    expect(result).toContain('مستشفى رفيق الحريري');
    expect(result).toContain('⚠️');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest tests/bot/responses.test.js --verbose`
Expected: FAIL

**Step 3: Write implementation**

```js
// src/bot/responses.js

const MENU = `أهلا 👋
أنا بوت المساعدة للنازحين بلبنان.
بعتلي رقم أو صوت:

1️⃣ ملاجئ قريبة
2️⃣ تحذيرات إخلاء
3️⃣ مستشفيات شغّالة
4️⃣ طلب مساعدة (أكل، فرشات، دوا)
5️⃣ تسجيل كنازح

أو ابعتلي موقعك 📍 لألاقيلك أقرب ملجأ.`;

const VOICE_RECEIVED = 'بعتلي صوت، عم بسمعو... 🎧';

const ERROR_SHEETS_DOWN = '⚠️ ما منقدر نوصل للمعلومات هلق. جرّب بعد شوي.';

const ERROR_UNKNOWN = 'ما فهمت شو بدك. ابعتلي رقم من 1 لـ 5 أو صوت.';

const NO_RESULTS = 'ما لقيت نتائج لهيدي المنطقة. جرّب اسم تاني أو ابعتلي موقعك 📍';

const AID_ASK_NAME = 'شو اسمك؟';
const AID_ASK_ZONE = 'وين موجود/ة؟ (اسم المنطقة)';
const AID_ASK_NEED = `شو محتاج/ة؟
1️⃣ أكل
2️⃣ فرشات / حرامات
3️⃣ دوا
4️⃣ شي تاني`;
const AID_CONFIRMED = (ticket) => `✅ تم تسجيل طلبك — رقم التذكرة: ${ticket}\nرح يتواصل معك متطوع بأقرب وقت.`;

const RATE_LIMITED = '⚠️ عم تبعت كتير رسائل. استنى شوي وجرّب بعدين.';

function formatStaleWarning(cachedAt) {
  const date = new Date(cachedAt);
  const time = date.toLocaleTimeString('ar-LB', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `⚠️ هيدي المعلومات تحققنا منها آخر مرة الساعة ${time}`;
}

function formatShelterResult(shelter, distance) {
  let msg = `🏠 ${shelter.name_ar}\n📍 ${shelter.address_ar || ''}`;
  if (shelter.available_spots) msg += `\n🛏️ أماكن متاحة: ${shelter.available_spots}`;
  if (distance !== undefined) msg += `\n📏 ${distance} كم`;
  return msg;
}

function formatEvacuationResult(evac) {
  const statusEmoji = evac.status === 'active' ? '🔴' : '🟢';
  let msg = `${statusEmoji} ${evac.zone}: ${evac.status === 'active' ? 'إخلاء فوري' : 'الوضع مستقر'}`;
  if (evac.direction_ar) msg += `\n➡️ ${evac.direction_ar}`;
  return msg;
}

function formatMedicalResult(facility, distance) {
  const statusMap = { operational: '🟢 شغّال', limited: '🟡 محدود', closed: '🔴 مسكّر', destroyed: '⛔ مدمّر' };
  let msg = `🏥 ${facility.name_ar}\n${statusMap[facility.status] || facility.status}`;
  if (facility.address_ar) msg += `\n📍 ${facility.address_ar}`;
  if (distance !== undefined) msg += `\n📏 ${distance} كم`;
  if (facility.last_verified_at) {
    const date = new Date(facility.last_verified_at);
    const time = date.toLocaleTimeString('ar-LB', { hour: '2-digit', minute: '2-digit', hour12: false });
    msg += `\n⚠️ آخر تحقق: ${time}`;
  }
  return msg;
}

function formatRegistrationStep(step) {
  let msg = `📋 خطوة ${step.step}: ${step.text_ar}`;
  if (step.documents_ar) msg += `\n📄 المستندات: ${step.documents_ar}`;
  if (step.link) msg += `\n🔗 ${step.link}`;
  return msg;
}

module.exports = {
  MENU, VOICE_RECEIVED, ERROR_SHEETS_DOWN, ERROR_UNKNOWN, NO_RESULTS,
  AID_ASK_NAME, AID_ASK_ZONE, AID_ASK_NEED, AID_CONFIRMED,
  RATE_LIMITED,
  formatStaleWarning, formatShelterResult, formatEvacuationResult,
  formatMedicalResult, formatRegistrationStep,
};
```

**Step 4: Run test to verify it passes**

Run: `npx jest tests/bot/responses.test.js --verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/bot/responses.js tests/bot/responses.test.js
git commit -m "feat: add Lebanese dialect response texts"
```

---

## Task 7: Twilio messaging service

**Files:**
- Create: `src/services/twilio.js`
- Create: `tests/services/twilio.test.js`

**Step 1: Write the failing test**

```js
// tests/services/twilio.test.js
const { sendMessage, validateRequest, parseTwilioBody } = require('../../src/services/twilio');

jest.mock('twilio', () => {
  const mockCreate = jest.fn().mockResolvedValue({ sid: 'SM123' });
  const mockValidate = jest.fn();
  const client = jest.fn().mockReturnValue({
    messages: { create: mockCreate },
  });
  client.validateRequest = mockValidate;
  client.__mockCreate = mockCreate;
  client.__mockValidate = mockValidate;
  return client;
});

const twilio = require('twilio');

describe('sendMessage', () => {
  beforeAll(() => {
    process.env.TWILIO_ACCOUNT_SID = 'AC_test';
    process.env.TWILIO_AUTH_TOKEN = 'test_token';
    process.env.TWILIO_PHONE_NUMBER = 'whatsapp:+14155238886';
  });

  test('sends WhatsApp message via Twilio', async () => {
    const result = await sendMessage('whatsapp:+961711234', 'hello');
    expect(twilio.__mockCreate).toHaveBeenCalledWith({
      from: 'whatsapp:+14155238886',
      to: 'whatsapp:+961711234',
      body: 'hello',
    });
    expect(result.sid).toBe('SM123');
  });
});

describe('parseTwilioBody', () => {
  test('extracts Body, From, NumMedia, Latitude, Longitude', () => {
    const body = {
      Body: 'hello',
      From: 'whatsapp:+961711234',
      NumMedia: '0',
      Latitude: '33.89',
      Longitude: '35.50',
    };
    const result = parseTwilioBody(body);
    expect(result.text).toBe('hello');
    expect(result.from).toBe('whatsapp:+961711234');
    expect(result.hasMedia).toBe(false);
    expect(result.location).toEqual({ lat: 33.89, lng: 35.50 });
  });

  test('detects media (voice note)', () => {
    const body = {
      Body: '',
      From: 'whatsapp:+961711234',
      NumMedia: '1',
      MediaContentType0: 'audio/ogg',
      MediaUrl0: 'https://api.twilio.com/audio.ogg',
    };
    const result = parseTwilioBody(body);
    expect(result.hasMedia).toBe(true);
    expect(result.mediaType).toBe('audio/ogg');
    expect(result.mediaUrl).toBe('https://api.twilio.com/audio.ogg');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest tests/services/twilio.test.js --verbose`
Expected: FAIL

**Step 3: Write implementation**

```js
// src/services/twilio.js
const twilio = require('twilio');

let client = null;

function getClient() {
  if (client) return client;
  client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return client;
}

async function sendMessage(to, body) {
  return getClient().messages.create({
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
    body,
  });
}

function validateRequest(authToken, signature, url, params) {
  return twilio.validateRequest(authToken, signature, url, params);
}

function parseTwilioBody(body) {
  const numMedia = parseInt(body.NumMedia || '0', 10);
  const hasMedia = numMedia > 0;
  const location = (body.Latitude && body.Longitude)
    ? { lat: parseFloat(body.Latitude), lng: parseFloat(body.Longitude) }
    : null;

  return {
    text: (body.Body || '').trim(),
    from: body.From || '',
    hasMedia,
    mediaType: hasMedia ? body.MediaContentType0 : null,
    mediaUrl: hasMedia ? body.MediaUrl0 : null,
    location,
  };
}

module.exports = { sendMessage, validateRequest, parseTwilioBody };
```

**Step 4: Run test to verify it passes**

Run: `npx jest tests/services/twilio.test.js --verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/twilio.js tests/services/twilio.test.js
git commit -m "feat: add Twilio messaging service"
```

---

## Task 8: Whisper voice transcription service

**Files:**
- Create: `src/services/whisper.js`
- Create: `tests/services/whisper.test.js`

**Step 1: Write the failing test**

```js
// tests/services/whisper.test.js
const { transcribeAudio } = require('../../src/services/whisper');

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    audio: {
      transcriptions: {
        create: jest.fn().mockResolvedValue({ text: 'وين أقرب ملجأ' }),
      },
    },
  }));
});

// Mock node fetch for downloading audio
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100)),
});

describe('transcribeAudio', () => {
  beforeAll(() => { process.env.OPENAI_API_KEY = 'test-key'; });

  test('downloads audio and returns transcribed text', async () => {
    const result = await transcribeAudio('https://api.twilio.com/audio.ogg');
    expect(result).toBe('وين أقرب ملجأ');
  });

  test('returns null on transcription failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network'));
    const result = await transcribeAudio('https://bad-url');
    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest tests/services/whisper.test.js --verbose`
Expected: FAIL

**Step 3: Write implementation**

```js
// src/services/whisper.js
const OpenAI = require('openai');

let openaiClient = null;

function getClient() {
  if (openaiClient) return openaiClient;
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

async function transcribeAudio(mediaUrl) {
  try {
    // Download audio from Twilio
    const response = await fetch(mediaUrl, {
      headers: {
        Authorization: 'Basic ' + Buffer.from(
          `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
        ).toString('base64'),
      },
    });
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());

    // Create a File-like object for the API
    const file = new File([buffer], 'audio.ogg', { type: 'audio/ogg' });

    const transcription = await getClient().audio.transcriptions.create({
      model: 'whisper-1',
      file,
      language: 'ar',
      prompt: 'هيدا بوت للمساعدة. ملجأ إخلاء مستشفى مساعدة تسجيل نازح',
    });

    return transcription.text || null;
  } catch {
    return null;
  }
}

module.exports = { transcribeAudio };
```

**Step 4: Run test to verify it passes**

Run: `npx jest tests/services/whisper.test.js --verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/whisper.js tests/services/whisper.test.js
git commit -m "feat: add Whisper voice transcription service"
```

---

## Task 9: Intent router

**Files:**
- Create: `src/bot/router.js`
- Create: `tests/bot/router.test.js`

**Step 1: Write the failing test**

```js
// tests/bot/router.test.js
const { detectIntent } = require('../../src/bot/router');

describe('detectIntent', () => {
  test('detects menu number 1 as shelter', () => {
    expect(detectIntent('1')).toEqual({ intent: 'shelter', zone: null });
  });

  test('detects menu number 2 as evacuation', () => {
    expect(detectIntent('2')).toEqual({ intent: 'evacuation', zone: null });
  });

  test('detects menu number 3 as medical', () => {
    expect(detectIntent('3')).toEqual({ intent: 'medical', zone: null });
  });

  test('detects menu number 4 as aid', () => {
    expect(detectIntent('4')).toEqual({ intent: 'aid', zone: null });
  });

  test('detects menu number 5 as registration', () => {
    expect(detectIntent('5')).toEqual({ intent: 'registration', zone: null });
  });

  test('detects shelter keywords in Arabic', () => {
    expect(detectIntent('وين أقرب ملجأ')).toEqual({ intent: 'shelter', zone: null });
    expect(detectIntent('بدي محل نام')).toEqual({ intent: 'shelter', zone: null });
  });

  test('detects evacuation keywords', () => {
    expect(detectIntent('في إخلاء بالحمرا')).toEqual({ intent: 'evacuation', zone: 'hamra' });
  });

  test('detects medical keywords', () => {
    expect(detectIntent('وين أقرب مستشفى')).toEqual({ intent: 'medical', zone: null });
    expect(detectIntent('محتاج طبيب')).toEqual({ intent: 'medical', zone: null });
  });

  test('detects aid keywords', () => {
    expect(detectIntent('محتاج أكل')).toEqual({ intent: 'aid', zone: null });
  });

  test('detects registration keywords', () => {
    expect(detectIntent('بدي اتسجل كنازح')).toEqual({ intent: 'registration', zone: null });
  });

  test('detects zone name in text', () => {
    expect(detectIntent('ملاجئ صيدا')).toEqual({ intent: 'shelter', zone: 'saida' });
  });

  test('returns menu for unrecognized input', () => {
    expect(detectIntent('مرحبا')).toEqual({ intent: 'menu', zone: null });
  });

  test('returns menu for رجّعني', () => {
    expect(detectIntent('رجعني')).toEqual({ intent: 'menu', zone: null });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest tests/bot/router.test.js --verbose`
Expected: FAIL

**Step 3: Write implementation**

```js
// src/bot/router.js
const { normalizeZone, ARABIC_TO_TOKEN } = require('../utils/arabic');

const INTENT_KEYWORDS = {
  shelter: ['ملجأ', 'مأوى', 'محل نام', 'وين نام', 'ملاجئ', 'مأوى'],
  evacuation: ['إخلاء', 'هرب', 'طلعوا', 'خطر', 'اخلاء'],
  medical: ['مستشفى', 'طبيب', 'دوا', 'جريح', 'إسعاف', 'مستشفيات', 'دكتور'],
  aid: ['أكل', 'حرام', 'بطانية', 'مساعدة', 'فرشات', 'حرامات'],
  registration: ['تسجيل', 'ورق', 'نازح', 'اتسجل', 'نازحين'],
};

const MENU_NUMBERS = { '1': 'shelter', '2': 'evacuation', '3': 'medical', '4': 'aid', '5': 'registration' };

const MENU_TRIGGERS = ['رجعني', 'رجّعني', 'menu', 'قائمة', 'ابدا', 'ابدأ'];

function detectIntent(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return { intent: 'menu', zone: null };

  // Check menu number
  if (MENU_NUMBERS[trimmed]) {
    return { intent: MENU_NUMBERS[trimmed], zone: null };
  }

  // Check menu triggers
  if (MENU_TRIGGERS.some(t => trimmed.includes(t))) {
    return { intent: 'menu', zone: null };
  }

  // Check intent keywords
  let detectedIntent = null;
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (keywords.some(kw => trimmed.includes(kw))) {
      detectedIntent = intent;
      break;
    }
  }

  // Try to extract zone from text
  let zone = null;
  for (const arabicZone of Object.keys(ARABIC_TO_TOKEN)) {
    if (trimmed.includes(arabicZone)) {
      zone = ARABIC_TO_TOKEN[arabicZone];
      break;
    }
  }

  // If no zone found from Arabic, try normalized match
  if (!zone) {
    const words = trimmed.split(/\s+/);
    for (const word of words) {
      const normalized = normalizeZone(word);
      if (normalized !== word.toLowerCase() && normalized !== word) {
        zone = normalized;
        break;
      }
    }
  }

  if (detectedIntent) {
    return { intent: detectedIntent, zone };
  }

  // If only zone detected, default to shelter
  if (zone) {
    return { intent: 'shelter', zone };
  }

  return { intent: 'menu', zone: null };
}

module.exports = { detectIntent, INTENT_KEYWORDS, MENU_NUMBERS };
```

**Step 4: Run test to verify it passes**

Run: `npx jest tests/bot/router.test.js --verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/bot/router.js tests/bot/router.test.js
git commit -m "feat: add intent router with keyword matching"
```

---

## Task 10: Shelter feature

**Files:**
- Create: `src/features/shelter.js`
- Create: `tests/features/shelter.test.js`

**Step 1: Write the failing test**

```js
// tests/features/shelter.test.js
const { handleShelter } = require('../../src/features/shelter');

jest.mock('../../src/services/cache');
jest.mock('../../src/services/sheets');

const cache = require('../../src/services/cache');
const sheets = require('../../src/services/sheets');

const mockShelters = [
  { id: '1', name_ar: 'ملجأ الحمرا', zone_normalized: 'hamra', address_ar: 'شارع الحمرا', available_spots: '15', status: 'open', lat: '33.89', lng: '35.50' },
  { id: '2', name_ar: 'ملجأ صيدا', zone_normalized: 'saida', address_ar: 'صيدا القديمة', available_spots: '30', status: 'open', lat: '33.56', lng: '35.37' },
];

describe('handleShelter', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns shelters filtered by zone', async () => {
    cache.getFromCache.mockResolvedValue(null);
    sheets.fetchSheet.mockResolvedValue(mockShelters);
    cache.setCache.mockResolvedValue();

    const result = await handleShelter({ zone: 'hamra' });
    expect(result.shelters).toHaveLength(1);
    expect(result.shelters[0].name_ar).toBe('ملجأ الحمرا');
    expect(result.stale).toBe(false);
  });

  test('returns from cache when available', async () => {
    cache.getFromCache.mockResolvedValue({
      data: mockShelters,
      cachedAt: Date.now(),
    });

    const result = await handleShelter({ zone: 'hamra' });
    expect(sheets.fetchSheet).not.toHaveBeenCalled();
    expect(result.shelters).toHaveLength(1);
  });

  test('returns nearest shelters when GPS provided', async () => {
    cache.getFromCache.mockResolvedValue({ data: mockShelters, cachedAt: Date.now() });

    const result = await handleShelter({ location: { lat: 33.89, lng: 35.50 } });
    expect(result.shelters).toHaveLength(2);
    expect(result.shelters[0].name_ar).toBe('ملجأ الحمرا'); // nearest
  });

  test('returns stale data with warning when sheets fails', async () => {
    cache.getFromCache.mockResolvedValue(null);
    sheets.fetchSheet.mockRejectedValue(new Error('API down'));
    cache.getStaleOrNull.mockResolvedValue({ data: mockShelters, cachedAt: Date.now() - 3600000 });

    const result = await handleShelter({ zone: 'hamra' });
    expect(result.stale).toBe(true);
    expect(result.cachedAt).toBeDefined();
  });

  test('filters out non-open shelters', async () => {
    const mixedShelters = [
      ...mockShelters,
      { id: '3', name_ar: 'مسكّر', zone_normalized: 'hamra', status: 'closed' },
    ];
    cache.getFromCache.mockResolvedValue({ data: mixedShelters, cachedAt: Date.now() });

    const result = await handleShelter({ zone: 'hamra' });
    expect(result.shelters.every(s => s.status === 'open')).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest tests/features/shelter.test.js --verbose`
Expected: FAIL

**Step 3: Write implementation**

```js
// src/features/shelter.js
const cache = require('../services/cache');
const sheets = require('../services/sheets');
const { findNearest } = require('../services/geo');

const CACHE_KEY = 'shelters:all';

async function handleShelter({ zone, location }) {
  let data;
  let stale = false;
  let cachedAt = null;

  // Try cache
  const cached = await cache.getFromCache(CACHE_KEY);
  if (cached) {
    data = cached.data;
    cachedAt = cached.cachedAt;
  } else {
    // Try sheets
    try {
      data = await sheets.fetchSheet('shelters');
      await cache.setCache(CACHE_KEY, data, cache.TTL.shelters);
      cachedAt = Date.now();
    } catch {
      // Fallback to stale
      const staleData = await cache.getStaleOrNull(CACHE_KEY);
      if (staleData) {
        data = staleData.data;
        cachedAt = staleData.cachedAt;
        stale = true;
      } else {
        return { shelters: [], stale: false, error: true };
      }
    }
  }

  // Filter open shelters only
  let shelters = data.filter(s => s.status === 'open');

  // Filter by zone or find nearest
  if (location) {
    shelters = findNearest(location.lat, location.lng, shelters, 3);
  } else if (zone) {
    shelters = shelters.filter(s => s.zone_normalized === zone);
  }

  return { shelters, stale, cachedAt };
}

module.exports = { handleShelter };
```

**Step 4: Run test to verify it passes**

Run: `npx jest tests/features/shelter.test.js --verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/features/shelter.js tests/features/shelter.test.js
git commit -m "feat: add shelter locator feature"
```

---

## Task 11: Evacuation feature

**Files:**
- Create: `src/features/evacuation.js`
- Create: `tests/features/evacuation.test.js`

Follows same pattern as Task 10 but queries `evacuations` tab, filters by `status === 'active'`, and returns zone-specific evacuation status + direction.

**Step 1: Write the failing test**

```js
// tests/features/evacuation.test.js
const { handleEvacuation } = require('../../src/features/evacuation');

jest.mock('../../src/services/cache');
jest.mock('../../src/services/sheets');

const cache = require('../../src/services/cache');
const sheets = require('../../src/services/sheets');

const mockEvacuations = [
  { id: '1', zone_normalized: 'dahiye', status: 'active', direction_ar: 'روح ع الشمال', issued_at: '2026-03-14T08:00:00Z' },
  { id: '2', zone_normalized: 'hamra', status: 'all_clear', direction_ar: '', issued_at: '2026-03-13T10:00:00Z' },
];

describe('handleEvacuation', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns active evacuations for zone', async () => {
    cache.getFromCache.mockResolvedValue({ data: mockEvacuations, cachedAt: Date.now() });

    const result = await handleEvacuation({ zone: 'dahiye' });
    expect(result.evacuations).toHaveLength(1);
    expect(result.evacuations[0].status).toBe('active');
  });

  test('returns all_clear status for safe zones', async () => {
    cache.getFromCache.mockResolvedValue({ data: mockEvacuations, cachedAt: Date.now() });

    const result = await handleEvacuation({ zone: 'hamra' });
    expect(result.evacuations).toHaveLength(1);
    expect(result.evacuations[0].status).toBe('all_clear');
  });

  test('returns all active evacuations when no zone specified', async () => {
    cache.getFromCache.mockResolvedValue({ data: mockEvacuations, cachedAt: Date.now() });

    const result = await handleEvacuation({});
    expect(result.evacuations).toHaveLength(1); // only active ones
  });
});
```

**Step 2-5: Implement, test, commit** (same pattern as Task 10)

```js
// src/features/evacuation.js
const cache = require('../services/cache');
const sheets = require('../services/sheets');

const CACHE_KEY = 'evacuations:all';

async function handleEvacuation({ zone }) {
  let data;
  let stale = false;
  let cachedAt = null;

  const cached = await cache.getFromCache(CACHE_KEY);
  if (cached) {
    data = cached.data;
    cachedAt = cached.cachedAt;
  } else {
    try {
      data = await sheets.fetchSheet('evacuations');
      await cache.setCache(CACHE_KEY, data, cache.TTL.evacuations);
      cachedAt = Date.now();
    } catch {
      const staleData = await cache.getStaleOrNull(CACHE_KEY);
      if (staleData) {
        data = staleData.data;
        cachedAt = staleData.cachedAt;
        stale = true;
      } else {
        return { evacuations: [], stale: false, error: true };
      }
    }
  }

  let evacuations;
  if (zone) {
    evacuations = data.filter(e => e.zone_normalized === zone);
  } else {
    evacuations = data.filter(e => e.status === 'active');
  }

  return { evacuations, stale, cachedAt };
}

module.exports = { handleEvacuation };
```

Commit: `git commit -m "feat: add evacuation alerts feature"`

---

## Task 12: Medical feature

**Files:**
- Create: `src/features/medical.js`
- Create: `tests/features/medical.test.js`

Same cache/sheets pattern. Filters by `status !== 'destroyed'`. Includes `last_verified_at` in response. Supports GPS nearest.

Commit: `git commit -m "feat: add medical care locator feature"`

---

## Task 13: Aid request feature (stateful)

**Files:**
- Create: `src/features/aid.js`
- Create: `tests/features/aid.test.js`

This feature is stateful — it requires a 3-step conversation flow using Vercel KV for state.

**Step 1: Write the failing test**

```js
// tests/features/aid.test.js
const { handleAid } = require('../../src/features/aid');

jest.mock('../../src/services/cache');
jest.mock('../../src/services/sheets');
jest.mock('../../src/utils/phone');

const cache = require('../../src/services/cache');
const sheets = require('../../src/services/sheets');
const phone = require('../../src/utils/phone');

const { kv } = require('@vercel/kv');

jest.mock('@vercel/kv', () => ({
  kv: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
}));

describe('handleAid', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    phone.hashPhone.mockReturnValue('hash123');
    phone.maskPhone.mockReturnValue('+961 XX XX 34 56');
  });

  test('step 1: no state → asks for name', async () => {
    kv.get.mockResolvedValue(null);
    const result = await handleAid({ from: '+96171123456', text: '' });
    expect(result.response).toContain('اسمك');
    expect(kv.set).toHaveBeenCalled();
  });

  test('step 2: has name → asks for zone', async () => {
    kv.get.mockResolvedValue({ step: 'name' });
    const result = await handleAid({ from: '+96171123456', text: 'أحمد' });
    expect(result.response).toContain('وين');
  });

  test('step 3: has zone → asks for need type', async () => {
    kv.get.mockResolvedValue({ step: 'zone', name: 'أحمد' });
    const result = await handleAid({ from: '+96171123456', text: 'الحمرا' });
    expect(result.response).toContain('محتاج');
  });

  test('step 4: has need → creates ticket', async () => {
    kv.get.mockResolvedValue({ step: 'need', name: 'أحمد', zone: 'الحمرا' });
    sheets.appendRow.mockResolvedValue();

    const result = await handleAid({ from: '+96171123456', text: '1' });
    expect(result.response).toContain('تذكرة');
    expect(sheets.appendRow).toHaveBeenCalled();
    expect(result.notifyVolunteer).toBe(true);
  });
});
```

**Step 2-5: Implement, test, commit**

```js
// src/features/aid.js
const { kv } = require('@vercel/kv');
const sheets = require('../services/sheets');
const { hashPhone, maskPhone } = require('../utils/phone');
const responses = require('../bot/responses');

const NEED_TYPES = { '1': 'food', '2': 'blankets', '3': 'medicine', '4': 'other' };
const STATE_TTL = 600; // 10 min

async function handleAid({ from, text }) {
  const stateKey = `aid:${hashPhone(from)}`;
  const state = await kv.get(stateKey);

  if (!state) {
    await kv.set(stateKey, { step: 'name' }, { ex: STATE_TTL });
    return { response: responses.AID_ASK_NAME };
  }

  if (state.step === 'name') {
    await kv.set(stateKey, { step: 'zone', name: text }, { ex: STATE_TTL });
    return { response: responses.AID_ASK_ZONE };
  }

  if (state.step === 'zone') {
    await kv.set(stateKey, { step: 'need', name: state.name, zone: text }, { ex: STATE_TTL });
    return { response: responses.AID_ASK_NEED };
  }

  if (state.step === 'need') {
    const needType = NEED_TYPES[text] || 'other';
    const ticket = `AID-${Date.now().toString(36).toUpperCase()}`;

    await sheets.appendRow('aid_requests', {
      id: ticket,
      ticket_number: ticket,
      name: state.name,
      phone: maskPhone(from),
      phone_full: from,
      zone: state.zone,
      need_type: needType,
      status: 'pending',
      created_at: new Date().toISOString(),
    });

    await kv.del(stateKey);
    return {
      response: responses.AID_CONFIRMED(ticket),
      notifyVolunteer: true,
      ticketData: { ticket, zone: state.zone, needType },
    };
  }

  return { response: responses.AID_ASK_NAME };
}

module.exports = { handleAid };
```

Commit: `git commit -m "feat: add stateful aid request feature with ticket system"`

---

## Task 14: Registration feature

**Files:**
- Create: `src/features/registration.js`
- Create: `tests/features/registration.test.js`

Simple — fetches `registration_info` tab and formats steps.

Commit: `git commit -m "feat: add displaced registration guide feature"`

---

## Task 15: Volunteer notifier service

**Files:**
- Create: `src/services/notifier.js`
- Create: `tests/services/notifier.test.js`

Reads `volunteers` tab, finds on-duty volunteer matching zone/shift, sends WhatsApp notification via `twilio.js` in volunteer's preferred language.

Commit: `git commit -m "feat: add volunteer notifier service"`

---

## Task 16: Rate limiter middleware

**Files:**
- Create: `src/services/rateLimiter.js`
- Create: `tests/services/rateLimiter.test.js`

Uses Vercel KV counter per phone hash. Max 30 messages/hour.

**Step 1: Write the failing test**

```js
// tests/services/rateLimiter.test.js
const { checkRateLimit } = require('../../src/services/rateLimiter');

jest.mock('@vercel/kv', () => ({
  kv: { get: jest.fn(), set: jest.fn(), incr: jest.fn() },
}));

const { kv } = require('@vercel/kv');

describe('checkRateLimit', () => {
  beforeEach(() => jest.clearAllMocks());

  test('allows request when under limit', async () => {
    kv.get.mockResolvedValue(5);
    const result = await checkRateLimit('hash123');
    expect(result.allowed).toBe(true);
  });

  test('blocks request when at limit', async () => {
    kv.get.mockResolvedValue(30);
    const result = await checkRateLimit('hash123');
    expect(result.allowed).toBe(false);
  });

  test('allows request on first message (no counter)', async () => {
    kv.get.mockResolvedValue(null);
    const result = await checkRateLimit('hash123');
    expect(result.allowed).toBe(true);
    expect(kv.set).toHaveBeenCalled();
  });
});
```

Commit: `git commit -m "feat: add rate limiter using Vercel KV"`

---

## Task 17: Main menu handler

**Files:**
- Create: `src/bot/menu.js`
- Create: `tests/bot/menu.test.js`

Simple — returns the MENU response text from `responses.js`.

Commit: `git commit -m "feat: add main menu handler"`

---

## Task 18: Webhook entry point (integration)

**Files:**
- Create: `api/webhook.js`
- Create: `tests/integration/webhook.test.js`

This is the main entry point that wires everything together: Twilio signature validation → parse body → rate limit → voice detection → router → feature handler → format response → send via TwiML.

**Step 1: Write the failing integration test**

```js
// tests/integration/webhook.test.js
const request = require('supertest'); // install as devDep
// Test the Express app directly

jest.mock('../../src/services/cache');
jest.mock('../../src/services/sheets');
jest.mock('../../src/services/whisper');
jest.mock('../../src/services/rateLimiter');
jest.mock('twilio', () => {
  const mock = jest.fn().mockReturnValue({ messages: { create: jest.fn() } });
  mock.validateRequest = jest.fn().mockReturnValue(true);
  mock.twiml = { MessagingResponse: jest.fn().mockImplementation(() => ({
    message: jest.fn(),
    toString: jest.fn().mockReturnValue('<Response></Response>'),
  })) };
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
      data: [{ id: '1', name_ar: 'Test', zone_normalized: '', status: 'open', available_spots: '5' }],
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
    // Response should contain rate limit message
  });
});
```

**Step 2: Install supertest**

Run: `npm install --save-dev supertest`

**Step 3: Write implementation**

```js
// api/webhook.js
const express = require('express');
const twilio = require('twilio');
const { parseTwilioBody, sendMessage } = require('../src/services/twilio');
const { transcribeAudio } = require('../src/services/whisper');
const { detectIntent } = require('../src/bot/router');
const { handleShelter } = require('../src/features/shelter');
const { handleEvacuation } = require('../src/features/evacuation');
const { handleMedical } = require('../src/features/medical');
const { handleAid } = require('../src/features/aid');
const { handleRegistration } = require('../src/features/registration');
const { checkRateLimit } = require('../src/services/rateLimiter');
const { notifyVolunteer } = require('../src/services/notifier');
const { hashPhone } = require('../src/utils/phone');
const { sanitizeLogs } = require('../src/utils/phone');
const responses = require('../src/bot/responses');
const { parseLocation } = require('../src/services/geo');

const app = express();
app.use(express.urlencoded({ extended: false }));

app.post('/api/webhook', async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();

  try {
    const parsed = parseTwilioBody(req.body);
    const phoneHash = hashPhone(parsed.from);

    // Rate limit
    const rateCheck = await checkRateLimit(phoneHash);
    if (!rateCheck.allowed) {
      twiml.message(responses.RATE_LIMITED);
      return res.type('text/xml').send(twiml.toString());
    }

    let text = parsed.text;
    const location = parsed.location || parseLocation(req.body);

    // Handle voice message
    if (parsed.hasMedia && parsed.mediaType?.startsWith('audio/')) {
      twiml.message(responses.VOICE_RECEIVED);
      res.type('text/xml').send(twiml.toString());

      // Async transcription + response
      const transcribed = await transcribeAudio(parsed.mediaUrl);
      if (transcribed) {
        const asyncResponse = await processIntent(transcribed, parsed.from, location);
        await sendMessage(parsed.from, asyncResponse);
      } else {
        await sendMessage(parsed.from, responses.MENU);
      }
      return;
    }

    // Process text intent
    const response = await processIntent(text, parsed.from, location);
    twiml.message(response);
    return res.type('text/xml').send(twiml.toString());
  } catch (err) {
    console.error(sanitizeLogs(`Webhook error: ${err.message}`));
    twiml.message(responses.ERROR_SHEETS_DOWN);
    return res.type('text/xml').send(twiml.toString());
  }
});

async function processIntent(text, from, location) {
  const { intent, zone } = detectIntent(text);

  switch (intent) {
    case 'shelter': {
      const result = await handleShelter({ zone, location });
      if (result.error) return responses.ERROR_SHEETS_DOWN;
      if (result.shelters.length === 0) return responses.NO_RESULTS;
      let msg = result.shelters.map(s => responses.formatShelterResult(s, s.distance)).join('\n\n');
      if (result.stale) msg = responses.formatStaleWarning(result.cachedAt) + '\n\n' + msg;
      return msg;
    }
    case 'evacuation': {
      const result = await handleEvacuation({ zone });
      if (result.error) return responses.ERROR_SHEETS_DOWN;
      if (result.evacuations.length === 0) return zone ? responses.NO_RESULTS : 'ما في تحذيرات إخلاء حاليًا ✅';
      let msg = result.evacuations.map(e => responses.formatEvacuationResult(e)).join('\n\n');
      if (result.stale) msg = responses.formatStaleWarning(result.cachedAt) + '\n\n' + msg;
      return msg;
    }
    case 'medical': {
      const result = await handleMedical({ zone, location });
      if (result.error) return responses.ERROR_SHEETS_DOWN;
      if (result.facilities.length === 0) return responses.NO_RESULTS;
      let msg = result.facilities.map(f => responses.formatMedicalResult(f, f.distance)).join('\n\n');
      if (result.stale) msg = responses.formatStaleWarning(result.cachedAt) + '\n\n' + msg;
      return msg;
    }
    case 'aid': {
      const result = await handleAid({ from, text });
      if (result.notifyVolunteer) {
        notifyVolunteer(result.ticketData).catch(() => {});
      }
      return result.response;
    }
    case 'registration': {
      const result = await handleRegistration();
      if (result.error) return responses.ERROR_SHEETS_DOWN;
      return result.steps.map(s => responses.formatRegistrationStep(s)).join('\n\n');
    }
    default:
      return responses.MENU;
  }
}

module.exports = app;
```

**Step 4: Run test to verify it passes**

Run: `npx jest tests/integration/webhook.test.js --verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add api/webhook.js tests/integration/webhook.test.js
git commit -m "feat: add webhook entry point wiring all features"
```

---

## Task 19: Telegram scraper

**Files:**
- Create: `src/scraper/telegram.js`
- Create: `tests/scraper/telegram.test.js`

Reads recent messages from public IDF Telegram channel via Telegram Bot API. Extracts zone names and evacuation orders. Returns structured data for scheduler.

Commit: `git commit -m "feat: add Telegram IDF channel scraper"`

---

## Task 20: OCHA scraper

**Files:**
- Create: `src/scraper/ocha.js`
- Create: `tests/scraper/ocha.test.js`

Fetches latest OCHA Lebanon Flash Updates from ReliefWeb API. Parses shelter and medical facility data. Returns structured data for scheduler.

Commit: `git commit -m "feat: add OCHA Flash Updates scraper"`

---

## Task 21: Scraper scheduler

**Files:**
- Create: `src/scraper/scheduler.js`
- Create: `tests/scraper/scheduler.test.js`

Compares scraped data with existing Sheet data (via sheets.js). Appends new entries with `auto_scraped: true, needs_review: true`. Triggers notifier for on-duty volunteer.

Commit: `git commit -m "feat: add scraper scheduler with Sheet comparison"`

---

## Task 22: Cron endpoint

**Files:**
- Create: `api/cron/scrape.js`
- Create: `tests/integration/cron.test.js`

Simple endpoint that calls scheduler.run(). Vercel cron hits this every 30 min.

```js
// api/cron/scrape.js
const { run } = require('../../src/scraper/scheduler');

module.exports = async (req, res) => {
  // Verify cron secret (Vercel sets CRON_SECRET)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }
  try {
    const result = await run();
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
```

Commit: `git commit -m "feat: add cron endpoint for scraper"`

---

## Task 23: Full test suite run + cleanup

**Step 1:** Run `npx jest --verbose --coverage`
**Step 2:** Fix any failing tests
**Step 3:** Commit: `git commit -m "test: ensure full test suite passes"`

---

## Task 24: Final integration test with curl

**Step 1:** Run `npx vercel dev` locally
**Step 2:** Test with curl:

```bash
# Menu
curl -X POST http://localhost:3000/api/webhook -d "Body=مرحبا&From=whatsapp:+961711234&NumMedia=0"

# Shelter by zone
curl -X POST http://localhost:3000/api/webhook -d "Body=1&From=whatsapp:+961711234&NumMedia=0"

# Evacuation
curl -X POST http://localhost:3000/api/webhook -d "Body=2&From=whatsapp:+961711234&NumMedia=0"
```

**Step 3:** Verify responses are correct Lebanese dialect
**Step 4:** Commit any fixes: `git commit -m "fix: integration test corrections"`
