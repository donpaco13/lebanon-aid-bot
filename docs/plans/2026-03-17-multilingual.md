# Multilingual Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Add Arabic / English / French support — language detected per message, persisted in KV for multi-step flows, threaded through all features and formatters.

**Architecture:** `detectLanguage(text)` runs at the top of `processIntent` in `webhook.js` and is passed as a `lang` param to every feature handler and formatter. For the `aid` multi-step flow, `lang` is stored in KV state alongside `step`/`name`/`zone`. A new `src/bot/messages.js` file centralises all strings in 3 languages, accessed via `t(key, lang, ...args)`. `responses.js` is kept but its callers are migrated to `messages.js`.

**Tech Stack:** Node.js, Jest, Vercel KV (`@vercel/kv`), Google Sheets

---

### Task 1: `src/utils/language.js` — détection de langue

**Files:**
- Create: `src/utils/language.js`
- Create: `tests/utils/language.test.js`

**Step 1: Write the failing tests**

```js
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

  test('defaults to en for unrecognised input', () => {
    expect(detectLanguage('')).toBe('en');
    expect(detectLanguage(null)).toBe('en');
    expect(detectLanguage('123')).toBe('en');
    expect(detectLanguage('menu')).toBe('en');
  });

  test('menu keyword detected as English', () => {
    expect(detectLanguage('menu')).toBe('en');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx jest tests/utils/language.test.js --no-coverage
```
Expected: FAIL — `Cannot find module '../../src/utils/language'`

**Step 3: Implement `src/utils/language.js`**

```js
// src/utils/language.js

const ARABIC_RANGE = /[\u0600-\u06FF]/;

const FR_KEYWORDS = [
  'bonjour', 'aide', 'besoin', 'abri', 'évacuation', 'evacuation',
  'médecin', 'medecin', 'nourriture', 'couverture', 'hôpital', 'hopital',
];

const EN_KEYWORDS = [
  'shelter', 'help', 'need', 'food', 'hospital', 'evacuate', 'evacuation',
  'blanket', 'doctor', 'medicine', 'register',
];

function detectLanguage(text) {
  if (!text) return 'en';
  if (ARABIC_RANGE.test(text)) return 'ar';
  const lower = text.toLowerCase();
  if (FR_KEYWORDS.some(kw => lower.includes(kw))) return 'fr';
  if (EN_KEYWORDS.some(kw => lower.includes(kw))) return 'en';
  return 'en';
}

module.exports = { detectLanguage };
```

**Step 4: Run tests to verify they pass**

```bash
npx jest tests/utils/language.test.js --no-coverage
```
Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add src/utils/language.js tests/utils/language.test.js
git commit -m "feat: add detectLanguage utility (ar/en/fr)"
```

---

### Task 2: `src/bot/messages.js` — chaînes trilingues

**Files:**
- Create: `src/bot/messages.js`
- Create: `tests/bot/messages.test.js`

**Step 1: Write the failing tests**

```js
// tests/bot/messages.test.js
const { t, formatShelterResult, formatEvacuationResult, formatMedicalResult, formatRegistrationStep, formatStaleWarning } = require('../../src/bot/messages');

describe('t()', () => {
  test('returns Arabic string for ar', () => {
    expect(t('MENU', 'ar')).toContain('أهلا');
  });

  test('returns English string for en', () => {
    expect(t('MENU', 'en')).toContain('Hello');
  });

  test('returns French string for fr', () => {
    expect(t('MENU', 'fr')).toContain('Bonjour');
  });

  test('interpolates ticket in AID_CONFIRMED', () => {
    expect(t('AID_CONFIRMED', 'en', 'AID-XYZ')).toContain('AID-XYZ');
    expect(t('AID_CONFIRMED', 'fr', 'AID-XYZ')).toContain('AID-XYZ');
    expect(t('AID_CONFIRMED', 'ar', 'AID-XYZ')).toContain('AID-XYZ');
  });

  test('falls back to en for unknown lang', () => {
    expect(t('MENU', 'xx')).toContain('Hello');
  });
});

describe('formatShelterResult()', () => {
  const shelter = {
    name_ar: 'ملجأ الحمرا',
    name_en: 'Hamra Shelter',
    address_ar: 'الحمرا',
    available_spots: 10,
  };

  test('uses name_en for English', () => {
    expect(formatShelterResult(shelter, 1.2, 'en')).toContain('Hamra Shelter');
  });

  test('falls back to name_ar when name_en absent', () => {
    const s = { name_ar: 'ملجأ', address_ar: 'بيروت' };
    expect(formatShelterResult(s, undefined, 'en')).toContain('ملجأ');
  });

  test('uses name_ar for Arabic', () => {
    expect(formatShelterResult(shelter, undefined, 'ar')).toContain('ملجأ الحمرا');
  });
});

describe('formatStaleWarning()', () => {
  const ts = new Date('2026-03-17T14:30:00Z').getTime();

  test('returns Arabic warning for ar', () => {
    expect(formatStaleWarning(ts, 'ar')).toContain('⚠️');
    expect(formatStaleWarning(ts, 'ar')).toMatch(/\d{2}:\d{2}/);
  });

  test('returns English warning for en', () => {
    expect(formatStaleWarning(ts, 'en')).toContain('⚠️');
    expect(formatStaleWarning(ts, 'en')).toContain('14:30');
  });
});

describe('formatEvacuationResult()', () => {
  test('returns active evacuation in English', () => {
    const evac = { zone: 'Hamra', status: 'active', direction_ar: 'اتجه شمالاً' };
    const result = formatEvacuationResult(evac, 'en');
    expect(result).toContain('🔴');
    expect(result).toContain('Hamra');
  });
});

describe('formatMedicalResult()', () => {
  test('uses name_en fallback pattern', () => {
    const facility = { name_ar: 'مستشفى', status: 'operational', last_verified_at: null };
    expect(formatMedicalResult(facility, undefined, 'en')).toContain('مستشفى');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx jest tests/bot/messages.test.js --no-coverage
```
Expected: FAIL — `Cannot find module '../../src/bot/messages'`

**Step 3: Implement `src/bot/messages.js`**

```js
// src/bot/messages.js

const STRINGS = {
  MENU: {
    ar: `أهلا 👋
أنا بوت المساعدة للنازحين بلبنان.
بعتلي رقم أو صوت:

1️⃣ ملاجئ قريبة
2️⃣ تحذيرات إخلاء
3️⃣ مستشفيات شغّالة
4️⃣ طلب مساعدة (أكل، فرشات، دوا)
5️⃣ تسجيل كنازح

أو ابعتلي موقعك 📍 لألاقيلك أقرب ملجأ.`,
    en: `Hello 👋
I'm a humanitarian aid bot for displaced people in Lebanon.
Send a number or voice message:

1️⃣ Nearby shelters
2️⃣ Evacuation warnings
3️⃣ Operating hospitals
4️⃣ Request aid (food, blankets, medicine)
5️⃣ Register as displaced

Or send your location 📍 to find the nearest shelter.`,
    fr: `Bonjour 👋
Je suis un bot d'aide humanitaire pour les déplacés au Liban.
Envoyez un numéro ou un message vocal :

1️⃣ Abris proches
2️⃣ Avertissements d'évacuation
3️⃣ Hôpitaux en service
4️⃣ Demander de l'aide (nourriture, couvertures, médicaments)
5️⃣ S'enregistrer comme déplacé

Ou envoyez votre position 📍 pour trouver l'abri le plus proche.`,
  },
  VOICE_RECEIVED: {
    ar: 'بعتلي صوت، عم بسمعو... 🎧',
    en: 'Voice message received, processing... 🎧',
    fr: 'Message vocal reçu, traitement en cours... 🎧',
  },
  ERROR_SHEETS_DOWN: {
    ar: '⚠️ ما منقدر نوصل للمعلومات هلق. جرّب بعد شوي.',
    en: '⚠️ Unable to retrieve information right now. Please try again shortly.',
    fr: "⚠️ Impossible d'accéder aux informations pour le moment. Réessayez dans un instant.",
  },
  ERROR_UNKNOWN: {
    ar: 'ما فهمت شو بدك. ابعتلي رقم من 1 لـ 5 أو صوت.',
    en: "I didn't understand that. Send a number from 1 to 5 or a voice message.",
    fr: "Je n'ai pas compris. Envoyez un numéro de 1 à 5 ou un message vocal.",
  },
  NO_RESULTS: {
    ar: 'ما لقيت نتائج لهيدي المنطقة. جرّب اسم تاني أو ابعتلي موقعك 📍',
    en: 'No results found for this area. Try a different name or send your location 📍',
    fr: 'Aucun résultat pour cette zone. Essayez un autre nom ou envoyez votre position 📍',
  },
  NO_EVACUATIONS: {
    ar: 'ما في تحذيرات إخلاء حاليًا ✅',
    en: 'No evacuation warnings at this time ✅',
    fr: "Aucun avertissement d'évacuation en ce moment ✅",
  },
  AID_ASK_NAME: {
    ar: 'شو اسمك؟',
    en: 'What is your name?',
    fr: 'Quel est votre prénom ?',
  },
  AID_ASK_ZONE: {
    ar: 'وين موجود/ة؟ (اسم المنطقة)',
    en: 'Where are you located? (area name)',
    fr: 'Où êtes-vous ? (nom de la zone)',
  },
  AID_ASK_NEED: {
    ar: `شو محتاج/ة؟
1️⃣ أكل
2️⃣ فرشات / حرامات
3️⃣ دوا
4️⃣ شي تاني`,
    en: `What do you need?
1️⃣ Food
2️⃣ Blankets
3️⃣ Medicine
4️⃣ Something else`,
    fr: `De quoi avez-vous besoin ?
1️⃣ Nourriture
2️⃣ Couvertures
3️⃣ Médicaments
4️⃣ Autre chose`,
  },
  AID_CONFIRMED: {
    ar: (ticket) => `✅ تم تسجيل طلبك — رقم التذكرة: ${ticket}\nرح يتواصل معك متطوع بأقرب وقت.`,
    en: (ticket) => `✅ Your request has been registered — ticket: ${ticket}\nA volunteer will contact you shortly.`,
    fr: (ticket) => `✅ Votre demande a été enregistrée — ticket : ${ticket}\nUn bénévole vous contactera dès que possible.`,
  },
  RATE_LIMITED: {
    ar: '⚠️ عم تبعت كتير رسائل. استنى شوي وجرّب بعدين.',
    en: '⚠️ You are sending too many messages. Please wait a moment and try again.',
    fr: '⚠️ Vous envoyez trop de messages. Attendez un moment et réessayez.',
  },
};

function t(key, lang, ...args) {
  const entry = STRINGS[key];
  if (!entry) return '';
  const resolved = entry[lang] ?? entry['en'];
  return typeof resolved === 'function' ? resolved(...args) : resolved;
}

// --- Formatters ---

function formatStaleWarning(cachedAt, lang) {
  const date = new Date(cachedAt);
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const time = `${hh}:${mm}`;
  const LABELS = {
    ar: `⚠️ هيدي المعلومات تحققنا منها آخر مرة الساعة ${time}`,
    en: `⚠️ This information was last verified at ${time} UTC`,
    fr: `⚠️ Ces informations ont été vérifiées pour la dernière fois à ${time} UTC`,
  };
  return LABELS[lang] ?? LABELS['en'];
}

function formatShelterResult(shelter, distance, lang) {
  const name = (lang === 'ar' ? shelter.name_ar : (shelter[`name_${lang}`] ?? shelter.name_ar));
  const address = (lang === 'ar' ? shelter.address_ar : (shelter[`address_${lang}`] ?? shelter.address_ar));
  let msg = `🏠 ${name}\n📍 ${address || ''}`;
  if (shelter.available_spots) {
    const spotsLabel = { ar: 'أماكن متاحة', en: 'Available spots', fr: 'Places disponibles' };
    msg += `\n🛏️ ${spotsLabel[lang] ?? spotsLabel.en}: ${shelter.available_spots}`;
  }
  if (distance !== undefined) msg += `\n📏 ${distance} km`;
  return msg;
}

function formatEvacuationResult(evac, lang) {
  const statusEmoji = evac.status === 'active' ? '🔴' : '🟢';
  const statusLabel = {
    ar: evac.status === 'active' ? 'إخلاء فوري' : 'الوضع مستقر',
    en: evac.status === 'active' ? 'Immediate evacuation' : 'Situation stable',
    fr: evac.status === 'active' ? 'Évacuation immédiate' : 'Situation stable',
  };
  let msg = `${statusEmoji} ${evac.zone}: ${statusLabel[lang] ?? statusLabel.en}`;
  const direction = lang === 'ar' ? evac.direction_ar : (evac[`direction_${lang}`] ?? evac.direction_ar);
  if (direction) msg += `\n➡️ ${direction}`;
  return msg;
}

function formatMedicalResult(facility, distance, lang) {
  const statusMap = {
    ar: { operational: '🟢 شغّال', limited: '🟡 محدود', closed: '🔴 مسكّر', destroyed: '⛔ مدمّر' },
    en: { operational: '🟢 Operational', limited: '🟡 Limited', closed: '🔴 Closed', destroyed: '⛔ Destroyed' },
    fr: { operational: '🟢 En service', limited: '🟡 Limité', closed: '🔴 Fermé', destroyed: '⛔ Détruit' },
  };
  const statuses = statusMap[lang] ?? statusMap.en;
  const name = lang === 'ar' ? facility.name_ar : (facility[`name_${lang}`] ?? facility.name_ar);
  const address = lang === 'ar' ? facility.address_ar : (facility[`address_${lang}`] ?? facility.address_ar);
  let msg = `🏥 ${name}\n${statuses[facility.status] || facility.status}`;
  if (address) msg += `\n📍 ${address}`;
  if (distance !== undefined) msg += `\n📏 ${distance} km`;
  if (facility.last_verified_at) {
    const date = new Date(facility.last_verified_at);
    const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    const verifiedLabel = { ar: 'آخر تحقق', en: 'Last verified', fr: 'Dernière vérification' };
    msg += `\n⚠️ ${verifiedLabel[lang] ?? verifiedLabel.en}: ${time}`;
  }
  return msg;
}

function formatRegistrationStep(step, lang) {
  const text = lang === 'ar' ? step.text_ar : (step[`text_${lang}`] ?? step.text_ar);
  const stepLabel = { ar: 'خطوة', en: 'Step', fr: 'Étape' };
  let msg = `📋 ${stepLabel[lang] ?? stepLabel.en} ${step.step}: ${text}`;
  const docs = lang === 'ar' ? step.documents_ar : (step[`documents_${lang}`] ?? step.documents_ar);
  const docsLabel = { ar: 'المستندات', en: 'Documents', fr: 'Documents' };
  if (docs) msg += `\n📄 ${docsLabel[lang] ?? docsLabel.en}: ${docs}`;
  if (step.link) msg += `\n🔗 ${step.link}`;
  return msg;
}

module.exports = {
  t,
  formatStaleWarning,
  formatShelterResult,
  formatEvacuationResult,
  formatMedicalResult,
  formatRegistrationStep,
};
```

**Step 4: Run tests to verify they pass**

```bash
npx jest tests/bot/messages.test.js --no-coverage
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/bot/messages.js tests/bot/messages.test.js
git commit -m "feat: add multilingual messages module with t() helper"
```

---

### Task 3: `src/bot/router.js` — mots-clés EN/FR

**Files:**
- Modify: `src/bot/router.js`
- Modify: `tests/bot/router.test.js`

**Step 1: Write the failing tests** (append to existing router.test.js)

```js
// Append to tests/bot/router.test.js

describe('detectIntent — English/French keywords', () => {
  test('detects shelter from English keyword', () => {
    expect(detectIntent('I need a shelter')).toEqual({ intent: 'shelter', zone: null });
  });

  test('detects shelter from French keyword', () => {
    expect(detectIntent('abri proche')).toEqual({ intent: 'shelter', zone: null });
  });

  test('detects medical from English keyword', () => {
    expect(detectIntent('nearest hospital')).toEqual({ intent: 'medical', zone: null });
  });

  test('detects medical from French keyword', () => {
    expect(detectIntent('médecin disponible')).toEqual({ intent: 'medical', zone: null });
  });

  test('detects evacuation from English keyword', () => {
    expect(detectIntent('evacuate now')).toEqual({ intent: 'evacuation', zone: null });
  });

  test('detects evacuation from French keyword', () => {
    expect(detectIntent('évacuation urgente')).toEqual({ intent: 'evacuation', zone: null });
  });

  test('detects aid from English keyword', () => {
    expect(detectIntent('I need food')).toEqual({ intent: 'aid', zone: null });
  });

  test('detects aid from French keyword', () => {
    expect(detectIntent("besoin de nourriture")).toEqual({ intent: 'aid', zone: null });
  });

  test('detects registration from English keyword', () => {
    expect(detectIntent('register as displaced')).toEqual({ intent: 'registration', zone: null });
  });

  test('menu trigger works for "help"', () => {
    // 'help' is not a menu trigger, so it falls through to intent detection
    // 'menu' should return menu intent
    expect(detectIntent('menu')).toEqual({ intent: 'menu', zone: null });
  });
});
```

**Step 2: Run tests to verify the new ones fail**

```bash
npx jest tests/bot/router.test.js --no-coverage
```
Expected: existing tests pass, new English/French ones FAIL

**Step 3: Update `src/bot/router.js`**

Replace `INTENT_KEYWORDS` and `MENU_TRIGGERS`:

```js
const INTENT_KEYWORDS = {
  shelter: ['ملجأ', 'مأوى', 'محل نام', 'وين نام', 'ملاجئ', 'مأوى', 'shelter', 'abri'],
  evacuation: ['إخلاء', 'هرب', 'طلعوا', 'خطر', 'اخلاء', 'evacuate', 'evacuation', 'évacuation'],
  medical: ['مستشفى', 'طبيب', 'دوا', 'جريح', 'إسعاف', 'مستشفيات', 'دكتور', 'hospital', 'doctor', 'medicine', 'hôpital', 'médecin', 'hopital', 'medecin'],
  aid: ['أكل', 'حرام', 'بطانية', 'مساعدة', 'فرشات', 'حرامات', 'food', 'blanket', 'help', 'nourriture', 'couverture', 'aide', 'besoin'],
  registration: ['تسجيل', 'ورق', 'نازح', 'اتسجل', 'نازحين', 'register', 'displaced', 'enregistrer'],
};

const MENU_TRIGGERS = ['رجعني', 'رجّعني', 'menu', 'قائمة', 'ابدا', 'ابدأ'];
```

**Step 4: Run tests to verify all pass**

```bash
npx jest tests/bot/router.test.js --no-coverage
```
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add src/bot/router.js tests/bot/router.test.js
git commit -m "feat: extend router intent keywords with English and French"
```

---

### Task 4: `api/webhook.js` — propagation de langue

**Files:**
- Modify: `api/webhook.js`
- Modify: `tests/integration/webhook.test.js`

**Step 1: Check existing webhook test structure**

Read `tests/integration/webhook.test.js` to understand mock setup before editing.

**Step 2: Write failing test for language propagation**

Add to `tests/integration/webhook.test.js`:

```js
// The webhook should respond in English when English text is sent
test('responds in English when English text received', async () => {
  // Mock detectIntent to return 'menu'
  // Send 'help' and verify response is in English
  // (Depends on how webhook test is structured — adapt to existing mock pattern)
});
```

Note: if the webhook test is a full integration test with heavy mocking, the simplest assertion is that the response does not contain Arabic when English is input. Adapt to match the existing test style.

**Step 3: Update `api/webhook.js`**

Add `detectLanguage` import and thread `lang` through `processIntent`:

```js
// Add at top with other imports:
const { detectLanguage } = require('../src/utils/language');
const messages = require('../src/bot/messages');

// Replace responses import usage with messages where strings are used directly:
// responses.RATE_LIMITED → messages.t('RATE_LIMITED', lang)
// responses.VOICE_RECEIVED → messages.t('VOICE_RECEIVED', lang)
// responses.ERROR_SHEETS_DOWN → messages.t('ERROR_SHEETS_DOWN', lang)
// responses.MENU → messages.t('MENU', lang)
```

Updated `processIntent` signature and body:

```js
async function processIntent(text, phoneHash, location) {
  const lang = detectLanguage(text);
  const { intent, zone } = detectIntent(text);

  switch (intent) {
    case 'shelter': {
      const result = await handleShelter({ zone, location });
      if (result.error) return messages.t('ERROR_SHEETS_DOWN', lang);
      if (result.shelters.length === 0) return messages.t('NO_RESULTS', lang);
      let msg = result.shelters.map(s => messages.formatShelterResult(s, s.distance, lang)).join('\n\n');
      if (result.stale) msg = messages.formatStaleWarning(result.cachedAt, lang) + '\n\n' + msg;
      return msg;
    }
    case 'evacuation': {
      const result = await handleEvacuation({ zone });
      if (result.error) return messages.t('ERROR_SHEETS_DOWN', lang);
      if (result.evacuations.length === 0) return zone ? messages.t('NO_RESULTS', lang) : messages.t('NO_EVACUATIONS', lang);
      let msg = result.evacuations.map(e => messages.formatEvacuationResult(e, lang)).join('\n\n');
      if (result.stale) msg = messages.formatStaleWarning(result.cachedAt, lang) + '\n\n' + msg;
      return msg;
    }
    case 'medical': {
      const result = await handleMedical({ zone, location });
      if (result.error) return messages.t('ERROR_SHEETS_DOWN', lang);
      if (result.facilities.length === 0) return messages.t('NO_RESULTS', lang);
      let msg = result.facilities.map(f => messages.formatMedicalResult(f, f.distance, lang)).join('\n\n');
      if (result.stale) msg = messages.formatStaleWarning(result.cachedAt, lang) + '\n\n' + msg;
      return msg;
    }
    case 'aid': {
      const result = await handleAid({ phoneHash, text, lang });
      if (result.notifyVolunteer && result.ticketData) {
        notifyVolunteers({
          ticket: result.ticketData.ticket,
          name: result.ticketData.name || '',
          zone: result.ticketData.zone || '',
          need: result.ticketData.needType || '',
        }).catch(() => {});
      }
      return result.reply;
    }
    case 'registration': {
      const result = await handleRegistration();
      if (result.error) return messages.t('ERROR_SHEETS_DOWN', lang);
      return result.steps.map(s => messages.formatRegistrationStep(s, lang)).join('\n\n');
    }
    default:
      return messages.t('MENU', lang);
  }
}
```

Also update the top-level error handler and rate-limit response to use `messages`:

```js
// Rate limit (lang detected from parsed.text or default 'en')
const lang = detectLanguage(parsed.text);
// ...
twiml.message(messages.t('RATE_LIMITED', lang));

// Voice received
twiml.message(messages.t('VOICE_RECEIVED', lang));

// Top-level catch
twiml.message(messages.t('ERROR_SHEETS_DOWN', 'en'));
```

**Step 4: Run full test suite**

```bash
npx jest --no-coverage
```
Expected: all passing (fix any import/mock issues)

**Step 5: Commit**

```bash
git add api/webhook.js
git commit -m "feat: detect language in webhook and thread lang through processIntent"
```

---

### Task 5: `src/features/aid.js` — lang dans l'état KV

**Files:**
- Modify: `src/features/aid.js`
- Modify: `tests/features/aid.test.js`

**Step 1: Write failing tests**

Update `tests/features/aid.test.js` to cover language persistence:

```js
test('stores lang in KV state when starting flow', async () => {
  kv.get.mockResolvedValue(null);
  await handleAid({ phoneHash: PHONE_HASH, text: '4', lang: 'fr' });
  expect(kv.set).toHaveBeenCalledWith(
    `aid:${PHONE_HASH}`,
    expect.objectContaining({ step: 'ask_name', lang: 'fr' }),
    expect.any(Object)
  );
});

test('responds in French when lang is fr', async () => {
  kv.get.mockResolvedValue(null);
  const result = await handleAid({ phoneHash: PHONE_HASH, text: '4', lang: 'fr' });
  expect(result.reply).toContain('prénom');
});

test('uses stored lang from KV state on subsequent messages', async () => {
  kv.get.mockResolvedValue({ step: 'ask_name', lang: 'en' });
  const result = await handleAid({ phoneHash: PHONE_HASH, text: 'Ahmad', lang: 'ar' });
  // lang from KV ('en') takes precedence over incoming lang
  expect(result.reply).toContain('located');
});
```

**Step 2: Run tests to verify they fail**

```bash
npx jest tests/features/aid.test.js --no-coverage
```
Expected: new tests FAIL, existing pass

**Step 3: Update `src/features/aid.js`**

```js
// src/features/aid.js
const { kv } = require('@vercel/kv');
const sheets = require('../services/sheets');
const { t } = require('../bot/messages');

const STATE_TTL = 600;

const NEED_MAP = {
  ar: { '1': 'أكل', '2': 'فرشات / حرامات', '3': 'دوا', '4': 'شي تاني' },
  en: { '1': 'Food', '2': 'Blankets', '3': 'Medicine', '4': 'Other' },
  fr: { '1': 'Nourriture', '2': 'Couvertures', '3': 'Médicaments', '4': 'Autre' },
};

function generateTicket() {
  return 'AID-' + Date.now().toString(36).toUpperCase();
}

async function handleAid({ phoneHash, text, lang = 'en' }) {
  const stateKey = `aid:${phoneHash}`;
  const state = await kv.get(stateKey);

  if (!state) {
    await kv.set(stateKey, { step: 'ask_name', lang }, { ex: STATE_TTL });
    return { reply: t('AID_ASK_NAME', lang) };
  }

  // Use stored lang for consistency across the flow
  const sessionLang = state.lang || lang;
  const { step, name, zone } = state;

  if (step === 'ask_name') {
    await kv.set(stateKey, { step: 'ask_zone', name: text.trim(), lang: sessionLang }, { ex: STATE_TTL });
    return { reply: t('AID_ASK_ZONE', sessionLang) };
  }

  if (step === 'ask_zone') {
    await kv.set(stateKey, { step: 'ask_need', name, zone: text.trim(), lang: sessionLang }, { ex: STATE_TTL });
    return { reply: t('AID_ASK_NEED', sessionLang) };
  }

  if (step === 'ask_need') {
    const needMap = NEED_MAP[sessionLang] ?? NEED_MAP.en;
    const need = needMap[text.trim()] || text.trim();
    const ticket = generateTicket();
    const now = new Date().toISOString();

    await sheets.appendRow('aid_requests', {
      ticket, name, zone, need,
      phone_hash: phoneHash,
      submitted_at: now,
      notified_at: '',
      status: 'pending',
    });

    await kv.del(stateKey);
    return {
      reply: t('AID_CONFIRMED', sessionLang, ticket),
      notifyVolunteer: true,
      ticketData: { ticket, name, zone, needType: need },
    };
  }

  await kv.set(stateKey, { step: 'ask_name', lang: sessionLang }, { ex: STATE_TTL });
  return { reply: t('AID_ASK_NAME', sessionLang) };
}

module.exports = { handleAid };
```

**Step 4: Run tests to verify all pass**

```bash
npx jest tests/features/aid.test.js --no-coverage
```
Expected: PASS — update existing test assertions if needed (e.g. `toContain('اسمك')` for ar, `toContain('name')` for en)

**Step 5: Commit**

```bash
git add src/features/aid.js tests/features/aid.test.js
git commit -m "feat: store lang in KV session state for aid flow, respond in detected language"
```

---

### Task 6: Mise à jour de `registration.js`

**Files:**
- Modify: `src/features/registration.js`
- Modify: `tests/features/registration.test.js`

**Step 1: Update `src/features/registration.js`**

Remove the import of `responses`, return raw step objects (formatting moved to webhook):

```js
// src/features/registration.js
const cache = require('../services/cache');
const sheets = require('../services/sheets');

const CACHE_KEY = 'registration:steps';

async function handleRegistration() {
  let data;
  let stale = false;
  let cachedAt = null;

  const cached = await cache.getFromCache(CACHE_KEY);
  if (cached) {
    data = cached.data;
    cachedAt = cached.cachedAt;
  } else {
    try {
      data = await sheets.fetchSheet('registration');
      await cache.setCache(CACHE_KEY, data, cache.TTL.registration);
      cachedAt = Date.now();
    } catch {
      const staleData = await cache.getStaleOrNull(CACHE_KEY);
      if (staleData) {
        data = staleData.data;
        cachedAt = staleData.cachedAt;
        stale = true;
      } else {
        return { steps: [], stale: false, error: true };
      }
    }
  }

  return { steps: data, stale, cachedAt };
}

module.exports = { handleRegistration };
```

Note: `registration.js` previously called `responses.formatRegistrationStep` — that mapping is now done in `webhook.js` where `lang` is available.

**Step 2: Run registration tests**

```bash
npx jest tests/features/registration.test.js --no-coverage
```
Expected: PASS (update test if it expected formatted strings)

**Step 3: Run full test suite**

```bash
npx jest --no-coverage
```
Expected: all passing

**Step 4: Commit**

```bash
git add src/features/registration.js tests/features/registration.test.js
git commit -m "refactor: move registration step formatting to webhook for lang support"
```

---

### Task 7: Full test suite & vérification finale

**Step 1: Run all tests**

```bash
npx jest --no-coverage
```
Expected: all passing

**Step 2: Check no Arabic strings leak into non-responses files**

```bash
grep -r "أهلا\|ملجأ\|مستشفى" src/ --include="*.js" \
  | grep -v "src/bot/messages.js" \
  | grep -v "src/bot/responses.js" \
  | grep -v "src/utils/arabic.js" \
  | grep -v "src/bot/router.js"
```
Expected: no output (all Arabic strings centralised)

**Step 3: Run tests with coverage**

```bash
npx jest --coverage
```
Review coverage for `src/utils/language.js` and `src/bot/messages.js` — aim for >90%.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete multilingual support (ar/en/fr)"
```
