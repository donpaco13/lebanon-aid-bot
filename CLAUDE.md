# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project
WhatsApp humanitarian chatbot for displaced civilians in Lebanon. Trilingual AR (Lebanese dialect) / EN / FR.

Stack: Node.js (CommonJS, Express), **Vercel serverless** (note: the README still says "Cloudflare Workers" — that's stale; the live deployment is Vercel — see `vercel.json`, `.vercel/`, `@vercel/kv`), Twilio WhatsApp, Google Sheets API, OpenAI Whisper, Vercel KV.

## Session bootstrap
1. Read this file
2. `git log --oneline -20` — the README drifts; commits are the source of truth for current behavior
3. Skim `docs/plans/*.md` only if the task touches design (architecture, multilingual, security hardening)
4. The most recent design refactor is the **3-option menu + updates feature + emergency numbers** (commit `412f31b`); README still describes the old 5-option menu

## Commands
```bash
npm test                # jest --verbose, runs everything in tests/
npm run test:watch      # jest --watch
npx jest tests/path/to/file.test.js                        # single file
npx jest tests/integration/webhook.test.js -t "onboarding" # single test by name pattern
vercel dev              # local server (no `npm run dev` script exists; README is wrong)
vercel deploy           # preview; add --prod for production
node scripts/setup-sheets.js   # one-time Sheet header init
```
There is no lint or build step. Test count drifts — don't trust the README's "92 tests"; commits mention 247+. Just run `npm test` and check what passes.

## Architecture

### Request flow
```
Twilio webhook → api/webhook.js
  ├─ validateRequest (Twilio signature — P0, reject 403 if invalid)
  ├─ parseTwilioBody → hashPhone(from) → phoneHash
  ├─ checkRateLimit (30/hr, bypassed for universal commands)
  ├─ if audio → transcribeAudio (Whisper) → reply async via sendMessage
  └─ processIntent(text, phoneHash, location) → TwiML reply
       └─ wraps _processIntentInner and appends NAV_FOOTER (except onboarding)
```

`_processIntentInner` is the priority chain — order matters and is the bug-prone part of the codebase. Onboarding has absolute priority over universal commands so digits 1/2/3 during onboarding always select language. Active aid flow (`aid:<phoneHash>` in KV) intercepts free-text before intent routing so names/zones/needs are never misrouted to keyword detection.

### KV state keys (all keyed by `phoneHash = SHA256(phone + PHONE_SALT_SECRET)`)
- `lang:<phoneHash>` — `'ar' | 'en' | 'fr'`, **no TTL** (permanent preference)
- `onboarding:<phoneHash>` — set during first contact, TTL 1h
- `aid:<phoneHash>` — aid flow state machine, TTL 10min
- `stale:<cacheKey>` — 24h backup of every cache write, served with timestamp warning when fresh fetch fails
- Cache TTLs in `src/services/cache.js`: shelters 15min, evacuations 5min, medical 10min, registration 1h. **Don't change these — they are P0 safety contracts.**

### Menu (current, post-refactor `412f31b`)
- `1` → aid request flow (3-step stateful)
- `2` → updates feed
- `3` → emergency numbers (MoPH fallback, hardcoded in messages.js per language)

Shelter / evacuation / medical / registration features still exist and are reachable via Arabic/EN/FR keyword matching and zone names in `router.js` — they were dropped from the menu but not from the codebase.

### Universal commands (always work, bypass rate limit)
`0`, `menu`, `قائمة`, `retour` → main menu, clears aid flow
`langue`, `language`, `لغة` → re-trigger trilingual onboarding
`english`, `français`, `francais` → direct language switch
`reset` → dev escape hatch, clears all KV state

### Strings — important file split
- `src/bot/messages.js` — **canonical multilingual strings** with `t(key, lang)` lookup and formatters (`formatShelterResult`, `formatStaleWarning`, etc.). All new user-facing text goes here.
- `src/bot/responses.js` — legacy AR-only strings. Still imported in places. Don't add new strings here; migrate as you touch them.

### Cron
`/api/cron/scrape` runs **daily at 08:00 UTC** (`0 8 * * *` in vercel.json) — not every 30min as the README says. The Telegram/IDF scraper was removed for ethical reasons (`06440f7`); only the OCHA scraper remains.

## Non-negotiable rules (P0)
- **Never log phone numbers or PII.** Use `sanitizeLogs()` from `utils/phone.js`. KV keys are always the hash, never the raw phone.
- **Twilio signature validation on every webhook.** Already wired; don't disable it for testing — use ngrok + real Twilio signing.
- **Scraped data → `needs_review=TRUE`.** `sheets.js` filters these out. Never bypass the filter.
- **Volunteers loaded from Sheet at runtime** (`on_duty=true`). `.env VOLUNTEER_NUMBERS` is fallback only when Sheets is unreachable.
- **TTL changes are P0** — cache TTLs in `services/cache.js` are user-safety contracts.
- **All zone matching goes through `arabic.js normalize()`** — Arabic has multiple spellings of every place name (الحمرا/الحمراء, الضاحية/الضاحيه). Direct string compare will silently miss matches.
- **Stale cache fallback must surface `last_verified_at`** in the user's language (`formatStaleWarning`).

## Data model notes (deviates from initial design doc)
- `medical` sheet uses `last_verified_at` (datetime), not `verified_at` — precision matters for hospital status
- `aid_requests.notified_at` exists for the 2h volunteer reminder scheduler
- `volunteers.language` (ar/en/fr) drives localized notification text in `notifier.js`
- Scraped rows carry `auto_scraped`, `needs_review`, `scraped_source`

## Workflow
- Work on feature branches; never commit to `main`
- The user is French-speaking — error messages and PR descriptions in French are fine; code stays English
- Plans live in `docs/plans/YYYY-MM-DD-*.md`; lessons in `tasks/lessons.md` (per user's global CLAUDE.md)
