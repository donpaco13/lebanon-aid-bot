# Lebanon Aid Bot — Design Document

**Date:** 2026-03-14
**Status:** Approved
**Stack:** Node.js + Express + Twilio WhatsApp API + Google Sheets API + OpenAI Whisper
**Deployment:** Vercel (serverless)
**Cache:** Vercel KV (Redis)
**Language:** Lebanese Arabic dialect

---

## 1. Project Context

A WhatsApp chatbot in Lebanese dialect that answers 5 vital questions for displaced civilians in Lebanon — without downloading an app, without a fast connection, without a database maintained by a developer.

800,000-900,000 displaced persons in 12 days. Hospitals and ambulances are now explicitly targeted. The Lebanese state has no budget, no reserves, no infrastructure.

### Core Constraints

- **Connectivity:** Frequent network outages in bombed areas — bot must respond even if Google Sheets is temporarily unreachable (Vercel KV cache)
- **Literacy:** Some displaced from south Lebanon and Bekaa are semi-literate — numbered menus + emojis, no long text
- **Voice messages:** Lebanese people send voice notes by reflex — bot must transcribe via Whisper and understand intent
- **Stale data:** A hospital or shelter can be destroyed between updates — architecture allows NGO volunteers to update a Google Sheets row in 10 seconds
- **Trust:** Must be distributed via existing NGO channels (Amel, OCHA, Lebanese Red Cross)
- **Twilio sandbox:** Expires after 72h — WhatsApp Business API approval takes 2-4 weeks via Meta (submit request today, in parallel with development)
- **Language:** Standard Arabic alienates southern displaced — all text reviewed by native Lebanese dialect speaker
- **Volume:** If an NGO shares the number in WhatsApp groups, thousands of messages in minutes — Vercel scales automatically, anticipate Twilio quotas
- **Data security:** Displaced persons are vulnerable — no personal data stored beyond strict minimum

---

## 2. Architecture

**Approach: Express monolith on Vercel**

```
WhatsApp -> Twilio -> Vercel Serverless (Express) -> Google Sheets API
                          |                              |
                     Vercel KV (cache)           Whisper API (voice)
                          |
                  Vercel Cron jobs (scraping Telegram/OCHA)
```

Single Node.js/Express project with modular routes. Vercel handles scaling. Cron jobs handle scraping.

---

## 3. Project Structure

```
lebanon-aid-bot/
├── api/
│   ├── webhook.js              <- Twilio entry point (Vercel serverless)
│   └── cron/
│       └── scrape.js           <- Vercel cron endpoint
├── src/
│   ├── bot/
│   │   ├── router.js           <- Intent routing (menu, GPS, voice)
│   │   ├── menu.js             <- Numbered main menu + emojis
│   │   └── responses.js        <- All text in Lebanese dialect
│   ├── features/
│   │   ├── shelter.js          <- Shelter locator
│   │   ├── evacuation.js       <- Evacuation alerts
│   │   ├── medical.js          <- Medical care locator
│   │   ├── aid.js              <- Material aid requests
│   │   └── registration.js     <- Displaced registration guide
│   ├── services/
│   │   ├── sheets.js           <- Google Sheets API client
│   │   ├── cache.js            <- Vercel KV wrapper with TTL
│   │   ├── twilio.js           <- Twilio client (send/receive messages)
│   │   ├── notifier.js         <- NGO volunteer notifications (separate)
│   │   ├── whisper.js          <- Voice transcription via OpenAI Whisper
│   │   └── geo.js              <- Haversine calculation + zone text parsing
│   ├── scraper/
│   │   ├── telegram.js         <- IDF Telegram channel scraping
│   │   ├── ocha.js             <- OCHA Flash Updates scraping
│   │   └── scheduler.js        <- Sheet pre-fill logic
│   └── utils/
│       └── arabic.js           <- Arabic normalization (hamra/الحمرا/Hamra -> token)
├── vercel.json
├── package.json
└── .env.example
```

---

## 4. Message Flow

```
1. WhatsApp user -> Twilio -> POST /api/webhook
2. webhook.js validates Twilio signature
3. If voice message -> whisper.js transcribes -> text
4. router.js identifies intent:
   - Number 1-5 -> corresponding feature
   - Neighborhood name -> shelter/medical/evacuation by context
   - Shared GPS -> shelter/medical with distance calculation
   - Free text (voice transcription) -> basic intent matching
5. Feature queries cache.js (Vercel KV)
   - Cache hit + valid TTL -> immediate response
   - Cache miss -> sheets.js fetches Google Sheets -> update cache -> response
6. Response formatted in Lebanese dialect -> Twilio -> WhatsApp user
```

---

## 5. Data Model (Google Sheets)

### Tab: `shelters`

| Column | Type | Description |
|--------|------|-------------|
| id | string | Unique ID |
| name_ar | string | Name in Arabic |
| zone | string | Zone (free text, as entered by volunteer) |
| zone_normalized | string | Normalized zone token (from arabic.js) |
| address_ar | string | Address in Arabic |
| lat | number | Latitude |
| lng | number | Longitude |
| capacity | number | Total capacity |
| available_spots | number | Remaining spots |
| status | string | open / full / closed |
| verified_at | datetime | Last verification timestamp |
| source | string | Data source |
| auto_scraped | boolean | From scraper |
| needs_review | boolean | Awaiting human validation |
| scraped_source | string | Source URL or message ID |

### Tab: `evacuations`

| Column | Type | Description |
|--------|------|-------------|
| id | string | Unique ID |
| zone | string | Zone (free text) |
| zone_normalized | string | Normalized zone token |
| status | string | active / expired / all_clear |
| direction_ar | string | Safety direction in dialect |
| source | string | Data source |
| issued_at | datetime | When the order was issued |
| expires_at | datetime | Expiration time |
| verified_at | datetime | Last verification |
| auto_scraped | boolean | From scraper |
| needs_review | boolean | Awaiting human validation |
| scraped_source | string | Source URL or message ID |

### Tab: `medical`

| Column | Type | Description |
|--------|------|-------------|
| id | string | Unique ID |
| name_ar | string | Name in Arabic |
| zone | string | Zone (free text) |
| zone_normalized | string | Normalized zone token |
| address_ar | string | Address in Arabic |
| lat | number | Latitude |
| lng | number | Longitude |
| type | string | hospital / clinic / pharmacy / field_unit |
| status | string | operational / limited / closed / destroyed |
| last_verified_at | datetime | Last verification (displayed to user as "verified X hours ago") |
| disclaimer | string | Specific warnings |
| auto_scraped | boolean | From scraper |
| needs_review | boolean | Awaiting human validation |
| scraped_source | string | Source URL or message ID |

### Tab: `aid_requests`

| Column | Type | Description |
|--------|------|-------------|
| id | string | Unique ID |
| ticket_number | string | Ticket number shown to user |
| name | string | Requester name |
| phone | string | Partially masked (+961 XX XX 78 90), full in hidden column |
| phone_full | string | Full number (hidden column, admin only) |
| zone | string | Location |
| need_type | string | food / blankets / medicine / other |
| details | string | Additional details |
| status | string | pending / assigned / fulfilled |
| created_at | datetime | Request timestamp |
| assigned_to | string | Volunteer name |
| notified_at | datetime | When volunteer was notified |

### Tab: `volunteers`

| Column | Type | Description |
|--------|------|-------------|
| id | string | Unique ID |
| name | string | Volunteer name |
| phone | string | Phone number |
| org | string | Organization |
| zone | string | Coverage zone |
| on_duty | boolean | Currently on shift |
| shift_start | time | Shift start |
| shift_end | time | Shift end |
| language | string | ar / fr / en (notification language) |

### Tab: `registration_info`

| Column | Type | Description |
|--------|------|-------------|
| step | number | Step number |
| text_ar | string | Instructions in Lebanese dialect |
| link | string | MoSA form link |
| documents_ar | string | Required documents in Arabic |

---

## 6. Cache Strategy (Vercel KV)

```
Request -> cache.js checks Vercel KV
  ├── Cache hit + valid TTL -> return cached data
  └── Cache miss or expired TTL
          -> sheets.js fetches Google Sheets
              ├── Success -> update KV cache + return data
              └── Failure (timeout, quota, network)
                      -> KV has stale data?
                          ├── Yes -> return stale + disclaimer timestamp
                          └── No -> graceful error message
```

### TTL by data type

| Data | TTL | Justification |
|------|-----|---------------|
| Shelters | 15 min | Rarely changes intra-hour |
| Evacuations | 5 min | Critical, must be near real-time |
| Medical | 10 min | Volatile, last_verified_at displayed |
| Registration info | 1h | Quasi-static |
| Normalized zones | 1h | Stable reference |

Stale data always includes timestamp in dialect: "these infos were last verified at [time]".

---

## 7. Voice Transcription and Intent Matching

### Voice flow

```
Voice message -> Twilio sends MediaUrl (.ogg)
  -> whisper.js downloads audio from Twilio
  -> OpenAI Whisper API (model: whisper-1, language: "ar")
  -> Transcribed Arabic text
  -> router.js keyword-based intent matching
```

### Intent keywords (Lebanese dialect)

| Keywords | Intent | Feature |
|----------|--------|---------|
| ملجأ، مأوى، محل نام، وين نام | Shelter | shelter.js |
| إخلاء، هرب، طلعوا، خطر | Evacuation | evacuation.js |
| مستشفى، طبيب، دوا، جريح، إسعاف | Medical | medical.js |
| أكل، حرام، بطانية، مساعدة | Aid | aid.js |
| تسجيل، ورق، نازح | Registration | registration.js |

No LLM for routing — keyword matching is sufficient for 5 predictable needs. If no keyword matches, display numbered menu.

### Vercel 10s timeout handling

1. Immediately return Twilio 200 OK with "I received your voice, listening..." message
2. Transcription + routing happens in background
3. Real response sent via Twilio API after processing

---

## 8. Semi-Automated Scraping

### Sources

1. **Telegram IDF** — Public IDF channels with evacuation alerts. Scraped via Telegram Bot API (read-only on public channels).
2. **OCHA Lebanon Flash Updates** — PDF/HTML on ReliefWeb with shelter lists, medical stats, field updates.

### Flow

```
Vercel Cron (every 30 min) -> api/cron/scrape.js
  -> telegram.js (parse IDF channel messages)
  -> ocha.js (fetch ReliefWeb, parse Flash PDFs)
  -> scheduler.js
      - Compare with existing Sheet data
      - Write new entries with status "unverified"
      - Set auto_scraped: true, needs_review: true
  -> notifier.js alerts on-duty volunteer:
      "3 new evacuation alerts detected. Verify the Sheet: [link]"
```

### Safety: scraped data is NEVER served to users until a volunteer sets `needs_review: false`.

---

## 9. Geolocation (Hybrid)

- **Default:** Zone text matching. User types a neighborhood name, bot filters by `zone_normalized` column.
- **Bonus:** If user shares WhatsApp GPS location, bot calculates haversine distance to find 3 nearest shelters/medical facilities.
- **arabic.js** normalizes all zone inputs: hamra / الحمرا / Hamra / el hamra -> same token.

---

## 10. Main Menu and Conversational UX

### Onboarding message

```
أهلا 👋
أنا بوت المساعدة للنازحين بلبنان.
بعتلي رقم أو صوت:

1️⃣ ملاجئ قريبة
2️⃣ تحذيرات إخلاء
3️⃣ مستشفيات شغّالة
4️⃣ طلب مساعدة (أكل، فرشات، دوا)
5️⃣ تسجيل كنازح

أو ابعتلي موقعك 📍 لألاقيلك أقرب ملجأ.
```

### UX principles

- Numbered menus — a single digit to navigate
- Emojis as visual markers (not decorative)
- Short messages — max 3-4 lines per bubble
- User can always send a number or "رجّعني" to return to menu
- All critical data responses include verification timestamp
- Voice detected -> immediate "listening..." then processing

### Stateless design

Bot is stateless. Each message is processed independently. Exception: aid request (feature 4) requires name + zone + need. Uses a 3-message flow with minimal state in Vercel KV (key = SHA256(phone + SALT_SECRET), TTL = 10 min).

---

## 11. Security and Data Protection

1. **No personal data in plaintext in Vercel KV or logs**
   - KV session key: `SHA256(phone + SALT_SECRET)` — salt in `.env`
   - Vercel logs: middleware sanitizes all phone numbers before logging

2. **Google Sheets — minimal data**
   - `aid_requests.phone`: partially masked (`+961 XX XX 78 90`)
   - Full number only in hidden column (admin-only access)
   - No message storage, no conversation history

3. **Twilio signature validation**
   - Every incoming request on `/api/webhook` validated with `twilio.validateRequest()`

4. **Volunteer notifications from Sheet, not .env**
   - `notifier.js` reads the `volunteers` tab to find on-duty volunteer (on_duty: true + matching zone + active shift)
   - Scales to any number of volunteers without code changes

5. **Rate limiting**
   - Vercel KV counter per phone hash — max 30 messages/hour per user

### Environment variables (.env)

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

---

## 12. Testing and Deployment

### Tests

- Unit tests with **Jest** for each module (shelter.js, cache.js, arabic.js, etc.)
- Mocks for Google Sheets API, Twilio, Whisper, Vercel KV
- Integration tests: simulate incoming Twilio message -> verify complete response
- No E2E WhatsApp tests at MVP — test via curl on `/api/webhook` with simulated Twilio payloads

### Deployment

1. Push to `main` -> Vercel deploys automatically
2. Preview deployments on each PR
3. Environment variables configured in Vercel dashboard
4. Cron jobs in `vercel.json`:
   ```json
   { "crons": [{ "path": "/api/cron/scrape", "schedule": "*/30 * * * *" }] }
   ```

### Twilio sandbox -> production migration

- Sandbox expires after 72h
- WhatsApp Business API approval via Meta: **2-4 weeks**
- **Action: submit Meta Business Manager request TODAY, in parallel with development**
  1. Create Meta Business Manager account
  2. Submit WhatsApp Business API access request immediately
  3. Prepare humanitarian project presentation for Meta (Lebanon war context, NGO partnership)
- Code does not change — only the phone number changes in `.env`

---

## 13. Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Google Sheets API down | Medium | High | Vercel KV cache with stale fallback + timestamp disclaimer |
| Whisper transcription timeout (>10s) | Low | Medium | Async response: immediate "listening" + delayed real response via Twilio API |
| Stale data (destroyed shelter still listed) | High | Critical | last_verified_at timestamp on every response + volunteer update workflow |
| Twilio quota exceeded under load | Medium | High | Monitor quotas, request increase proactively, rate limit users |
| Meta WhatsApp approval delayed | Medium | High | Start process today, sandbox covers development period |
| Scraper breaks (source format changes) | High | Low | Scraper failure is silent — data just stops being pre-filled, manual entry continues |
| Lebanese dialect text quality | Medium | Medium | All text reviewed by native speaker before deployment |
