# Lebanon Aid Bot — بوت المساعدة للنازحين

> WhatsApp chatbot for displaced civilians in Lebanon — Arabic dialect, real-time shelter/evacuation/medical data, volunteer dispatch.
>
> Bot WhatsApp pour les civils déplacés au Liban — dialecte arabe libanais, données d'abris/évacuation/médical en temps réel, dispatch de bénévoles.

---

## English

### What it does

Lebanon Aid Bot is a **trilingual** WhatsApp chatbot (Arabic / English / French) that helps displaced civilians in Lebanon:

- **Request aid** — food, blankets, medicine, or other (3-step stateful flow → on-duty volunteers notified)
- Get **the latest humanitarian updates** from OCHA Flash Updates
- Reach the **right emergency numbers** (Lebanese Red Cross, Civil Defense, MoPH hotlines)

It also supports **voice messages** in Lebanese Arabic (transcribed via OpenAI Whisper) and exposes shelter / evacuation / medical / registration features through Arabic-EN-FR keyword routing. OCHA Flash Updates are auto-scraped and stored with `needs_review=TRUE` until a volunteer manually approves them.

**Evacuation data** is managed editorially by the NGO team via Google Sheet — no external scrapers or military sources.

On first contact a user goes through a **trilingual onboarding** (1 = العربية, 2 = English, 3 = Français); their choice is persisted permanently in KV.

### Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (CommonJS) |
| Deployment | **Vercel** serverless (Express handlers in `api/`) |
| Messaging | Twilio WhatsApp API |
| Data backend | Google Sheets API |
| Cache & state | Vercel KV (`@vercel/kv`) |
| Voice | OpenAI Whisper |
| Tests | Jest (run `npm test`) |

### Architecture

```
Twilio WhatsApp
      │
      ▼
POST /api/webhook  ──► Twilio signature validation (P0)
      │              ──► hashPhone(from) → phoneHash (SHA256)
      │              ──► rate limit (30/hr, bypassed for universal commands)
      │              ──► trilingual onboarding (first contact: 1=AR / 2=EN / 3=FR)
      ▼
processIntent()  (priority chain in api/webhook.js)
      │
      ├──► Menu digits ── 1 → features/aid.js          (stateful, KV 10min)
      │                                                 └─► notifier.js ──► volunteers sheet
      │                  2 → features/updates.js        ──► sheets (scraped_data, needs_review=FALSE)
      │                  3 → emergency numbers          (hardcoded in messages.js per language)
      │
      └──► Keyword & zone routing (router.js)
           ├──► features/shelter.js       ──► cache.js ──► sheets.js
           ├──► features/evacuation.js    ──► cache.js ──► sheets.js
           ├──► features/medical.js       ──► cache.js ──► sheets.js
           └──► features/registration.js  ──► cache.js ──► sheets.js

GET  /api/health        ──► kv.ping + sheets reachability check
GET  /api/cron/scrape   ──► scraper/ocha.js ──► scheduler.js ──► sheets (needs_review=TRUE)
                            (daily at 08:00 UTC — see vercel.json)
```

**Data TTLs (user safety P0):**

| Data type | Cache TTL | Reason |
|-----------|-----------|--------|
| Evacuations | 5 min | Critical, near real-time |
| Medical | 10 min | Volatile status |
| Shelters | 15 min | Changes within the hour |
| Registration | 1 hour | Quasi-static |

### Bot conversation flow

```
First contact → trilingual onboarding
   "اختر لغتك / Choose your language / Choisissez votre langue
    1️⃣ العربية   2️⃣ English   3️⃣ Français"
        │
        ▼ (choice persisted in KV: lang:<phoneHash>)
  ┌──────────────────────────────────────────────────────────────┐
  │  أهلا 👋  (Main menu — 3 options)                            │
  │  1️⃣ طلب مساعدة             (Request aid)                     │
  │  2️⃣ آخر التحديثات           (Latest updates)                  │
  │  3️⃣ أرقام الطوارئ           (Emergency numbers)               │
  └──────────────────────────────────────────────────────────────┘
        │
 ┌──────┴──────────────────────┐
 │1                  │2         │3
 ▼                   ▼          ▼
Aid request       Updates    Emergency
(3-step           (top 3     numbers
 stateful)         from        (Red Cross,
   │               OCHA)        Civil Def.,
   ▼                            MoPH)
Notify on-duty
volunteers

Free text — keyword routing still works:
  "ملجأ / shelter / abri" → shelter locator
  "إخلاء / evacuation / évacuation" → evacuation alerts
  "مستشفى / hospital / hôpital" → medical facilities
  "تسجيل / register / enregistrer" → registration guide
  Zone names (الحمرا، الضاحية، صور…) → shelter by default

Universal commands (any state, any language):
  0 / menu / قائمة / retour       → back to main menu
  langue / language / لغة         → re-trigger trilingual onboarding
  english / français              → switch language directly
  reset                           → dev escape hatch (clears all state)
```

**Aid request flow (stateful, KV TTL = 10 min):**

```
Step 1 → "What is your name?" (localized AR/EN/FR)
Step 2 → "Where are you located?"
Step 3 → "What do you need?"
         1. Food          (أكل / Nourriture)
         2. Blankets      (فرشات + بطانيات / Couvertures)
         3. Medicine      (دوا / Médicaments)
         4. Something else (غير هيك / Autre chose)
         ↓
         Ticket persisted to aid_requests sheet
         → on-duty volunteers notified in their preferred language
```

### Google Sheets schema

The bot uses a single Google Spreadsheet with 7 tabs:

| Tab | Purpose | Key columns |
|-----|---------|-------------|
| `shelters` | Shelter locations | zone_normalized, available_spots, status, verified_at |
| `evacuations` | Active evacuation orders — managed by NGO team | zone_normalized, status, direction_ar, issued_at, expires_at |
| `medical` | Hospitals / clinics | zone_normalized, type, status, last_verified_at |
| `aid_requests` | User aid requests | ticket_number, name, zone, need_type, status, notified_at |
| `volunteers` | On-duty volunteers | on_duty, shift_start, shift_end, language |
| `registration_info` | Registration steps | step, text_ar, link, documents_ar |
| `scraped_data` | OCHA Flash Updates (auto-scraped, awaits review) | title, date, url, needs_review, scraped_source |

**Safety rule:** Any row with `needs_review=TRUE` is invisible to users until a volunteer manually sets it to `FALSE`. Scraped rows always enter as `TRUE`.

`scripts/setup-sheets.js` creates the first 6 tabs; `scraped_data` is created on first scraper run (or you can add it manually with the columns above).

### Security

- Phone numbers stored as `SHA256(phone + PHONE_SALT_SECRET)` — never in plain text in logs or KV
- Twilio signature validated on every incoming webhook
- Scraped data always enters with `needs_review=TRUE`, never served directly to users
- Volunteer numbers loaded from Sheet at runtime (not hardcoded in `.env`)
- All logs sanitized — no PII ever written to logs

### Setup

#### 1. Clone and install

```bash
git clone https://github.com/donpaco13/lebanon-aid-bot
cd lebanon-aid-bot
npm install
```

#### 2. Environment variables

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Twilio console → Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio console → Auth Token |
| `TWILIO_PHONE_NUMBER` | Your Twilio WhatsApp number (e.g. `+14155238886`) |
| `GOOGLE_SHEETS_ID` | Spreadsheet ID from the URL |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `service-account@project.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | Service account private key (RSA) |
| `OPENAI_API_KEY` | For Whisper voice transcription |
| `KV_REST_API_URL` | KV REST endpoint |
| `KV_REST_API_TOKEN` | KV token |
| `PHONE_SALT_SECRET` | Random secret, minimum 32 characters |
| `CRON_SECRET` | Random secret for cron endpoint authentication |

#### 3. Initialize Google Sheets

```bash
node scripts/setup-sheets.js
```

Creates all 6 tabs with correct headers and frozen rows.

#### 4. Run locally

```bash
npx vercel dev          # serves api/* on http://localhost:3000
ngrok http 3000         # expose for Twilio
# Set Twilio webhook URL to: https://your-ngrok-url.ngrok.io/api/webhook
```

#### 5. Run tests

```bash
npm test                # full suite (Jest)
npm run test:watch      # watch mode
npx jest tests/integration/webhook.test.js   # single file
npx jest -t "onboarding"                     # filter by test name
```

#### 6. Deploy

```bash
npx vercel              # preview deployment
npx vercel --prod       # production
```

Set all environment variables under **Vercel project → Settings → Environment Variables**. The cron `/api/cron/scrape` runs **daily at 08:00 UTC** (configured in `vercel.json`); `/api/health` is available for uptime probes.

### Project structure

```
api/
  webhook.js            # Twilio message entry point — orchestrates onboarding, rate limit, intent
  health.js             # Health check (KV ping + Sheets reachability)
  cron/scrape.js        # Scraper cron endpoint (daily 08:00 UTC)
src/
  bot/
    messages.js         # CANONICAL multilingual strings — t(key, lang) + formatters
    responses.js        # Legacy AR-only strings (being migrated into messages.js)
    router.js           # Intent detection (keywords + zone names)
    menu.js             # Main menu helpers
  features/
    aid.js              # Aid request flow (stateful via KV, 10min TTL)
    updates.js          # Top-3 OCHA updates from scraped_data sheet
    shelter.js          # Shelter locator
    evacuation.js       # Evacuation alerts
    medical.js          # Medical facilities
    registration.js     # Registration guide
  services/
    sheets.js           # Google Sheets client (filters needs_review=TRUE)
    cache.js            # KV wrapper + TTL + 24h stale backup
    twilio.js           # Twilio client + signature validation
    notifier.js         # Volunteer notifications (per-language)
    whisper.js          # OpenAI Whisper transcription
    geo.js              # Haversine distance + location parsing
    rateLimiter.js      # 30 msg/hr per phone hash
  scraper/
    ocha.js             # OCHA ReliefWeb scraper
    scheduler.js        # Deduplication + append to scraped_data sheet
  utils/
    arabic.js           # Zone name normalization (required for all zone matching)
    language.js         # AR/EN/FR detection from text
    phone.js            # Phone hashing (SHA256+salt) & log sanitization
    logger.js           # Structured JSON logger
    retry.js            # Exponential backoff for flaky external calls
scripts/
  setup-sheets.js       # One-time Sheet initialization
tests/                  # Jest (bot/, features/, integration/, scraper/, services/, utils/)
docs/
  VOLUNTEER_GUIDE.md    # How volunteers use the bot and manage data
  ADMIN_GUIDE.md        # How to manage Sheets, deploy, and configure
  TEST_MANUAL.md        # Manual QA checklist
  plans/                # Architecture & design documents (consult before redesigning)
  sample-data/          # Example CSV rows for each Sheet tab
vercel.json             # Function timeouts, cron schedule, /api/health route
```

### Contributing

1. Always work on a feature branch — never commit directly to `main`
2. Run `npm test` before pushing — full suite must pass
3. All **new** user-facing strings go in `src/bot/messages.js` (with AR/EN/FR variants and a `t(key, lang)` entry). `responses.js` is legacy — don't add to it; migrate as you touch it.
4. Zone matching must go through `arabic.js normalize()` before any comparison
5. Never log phone numbers or any PII — use `sanitizeLogs()` from `utils/phone.js`
6. TTL violations are P0 bugs — do not change cache TTLs in `services/cache.js` without discussion
7. Scraped data must enter with `needs_review=TRUE`; `sheets.js` filters it. Never bypass the filter.

---

## Français

### Présentation

Lebanon Aid Bot est un chatbot WhatsApp **trilingue** (arabe / anglais / français) qui aide les civils déplacés au Liban à :

- **Demander de l'aide** — nourriture, couvertures, médicaments ou autre (flux à 3 étapes avec état → bénévoles de garde notifiés)
- Consulter les **dernières informations humanitaires** issues d'OCHA Flash Updates
- Joindre les **bons numéros d'urgence** (Croix-Rouge libanaise, Défense civile, hotlines MoPH)

Le bot prend également en charge les **messages vocaux** en dialecte arabe libanais (transcrits via OpenAI Whisper). Les fonctions abris / évacuation / médical / inscription restent accessibles via des mots-clés AR-EN-FR. Les mises à jour OCHA Flash sont auto-scrapées avec `needs_review=TRUE` jusqu'à validation manuelle.

**Les données d'évacuation** sont gérées éditorialement par l'équipe ONG via Google Sheet — aucun scraper externe ni source militaire.

Au premier contact, l'utilisateur passe par un **onboarding trilingue** (1 = العربية, 2 = English, 3 = Français) ; son choix est conservé en KV de manière permanente.

### Stack technique

| Couche | Technologie |
|--------|------------|
| Runtime | Node.js (CommonJS) |
| Déploiement | **Vercel** serverless (handlers Express dans `api/`) |
| Messagerie | Twilio WhatsApp API |
| Backend données | Google Sheets API |
| Cache & état | Vercel KV (`@vercel/kv`) |
| Voix | OpenAI Whisper |
| Tests | Jest (`npm test`) |

### Architecture

```
WhatsApp Twilio
      │
      ▼
POST /api/webhook  ──► Validation signature Twilio (P0)
      │              ──► hashPhone(from) → phoneHash (SHA256)
      │              ──► rate limit (30/h, contourné pour les commandes universelles)
      │              ──► onboarding trilingue au premier contact (1=AR / 2=EN / 3=FR)
      ▼
processIntent()  (chaîne de priorité dans api/webhook.js)
      │
      ├──► Chiffres du menu ── 1 → features/aid.js          (avec état, KV 10min)
      │                                                      └─► notifier.js ──► feuille bénévoles
      │                       2 → features/updates.js        ──► sheets (scraped_data, needs_review=FALSE)
      │                       3 → numéros d'urgence          (codés par langue dans messages.js)
      │
      └──► Routage par mots-clés et zones (router.js)
           ├──► features/shelter.js       ──► cache.js ──► sheets.js
           ├──► features/evacuation.js    ──► cache.js ──► sheets.js
           ├──► features/medical.js       ──► cache.js ──► sheets.js
           └──► features/registration.js  ──► cache.js ──► sheets.js

GET  /api/health        ──► kv.ping + check Sheets
GET  /api/cron/scrape   ──► scraper/ocha.js ──► scheduler.js ──► sheets (needs_review=TRUE)
                            (quotidien à 08:00 UTC — voir vercel.json)
```

**TTL des données (sécurité utilisateur = P0) :**

| Type de données | TTL cache | Raison |
|-----------------|-----------|--------|
| Évacuations | 5 min | Critique, quasi temps réel |
| Médical | 10 min | Statut volatile |
| Abris | 15 min | Change dans l'heure |
| Inscription | 1 heure | Quasi-statique |

### Flux de conversation

```
Premier contact → onboarding trilingue
   "اختر لغتك / Choose your language / Choisissez votre langue
    1️⃣ العربية   2️⃣ English   3️⃣ Français"
              │
              ▼ (choix persisté en KV : lang:<phoneHash>)
  ┌────────────────────────────────────────────────────────────────┐
  │  Bonjour 👋  (Menu principal — 3 options)                       │
  │  1️⃣ Demande d'aide                                              │
  │  2️⃣ Dernières informations                                       │
  │  3️⃣ Numéros d'urgence                                            │
  └────────────────────────────────────────────────────────────────┘

Texte libre — le routage par mots-clés reste actif :
  "ملجأ / shelter / abri" → recherche d'abris
  "إخلاء / evacuation / évacuation" → alertes d'évacuation
  "مستشفى / hospital / hôpital" → établissements médicaux
  "تسجيل / register / enregistrer" → guide d'inscription
  Noms de zones (الحمرا، الضاحية، صور…) → abris par défaut

Commandes universelles (tout état, toute langue) :
  0 / menu / قائمة / retour       → retour au menu principal
  langue / language / لغة         → relance l'onboarding trilingue
  english / français              → bascule directe de langue
  reset                           → echappatoire dev (efface tout l'état KV)
```

**Flux de demande d'aide (avec état, TTL KV = 10 min) :**

```
Étape 1 → "Quel est votre nom ?" (localisé AR/EN/FR)
Étape 2 → "Où êtes-vous ?"
Étape 3 → "De quoi avez-vous besoin ?"
          1. Nourriture     (أكل / Food)
          2. Couvertures    (فرشات + بطانيات / Blankets)
          3. Médicaments    (دوا / Medicine)
          4. Autre chose    (غير هيك / Something else)
          ↓
          Ticket persisté dans la feuille aid_requests
          → bénévoles de garde notifiés dans leur langue
```

### Schéma Google Sheets

Le bot utilise un seul Google Spreadsheet avec 7 onglets :

| Onglet | Rôle | Colonnes clés |
|--------|------|---------------|
| `shelters` | Abris disponibles | zone_normalized, available_spots, status, verified_at |
| `evacuations` | Ordres d'évacuation actifs — gérés par l'équipe ONG | zone_normalized, status, direction_ar, issued_at, expires_at |
| `medical` | Hôpitaux / cliniques | zone_normalized, type, status, last_verified_at |
| `aid_requests` | Demandes d'aide utilisateurs | ticket_number, name, zone, need_type, status, notified_at |
| `volunteers` | Bénévoles de garde | on_duty, shift_start, shift_end, language |
| `registration_info` | Étapes d'inscription | step, text_ar, link, documents_ar |
| `scraped_data` | OCHA Flash Updates (auto-scrapés, en attente de revue) | title, date, url, needs_review, scraped_source |

**Règle de sécurité :** Toute ligne avec `needs_review=TRUE` est invisible aux utilisateurs jusqu'à validation manuelle. Les lignes scrapées entrent toujours avec `TRUE`.

`scripts/setup-sheets.js` crée les 6 premiers onglets ; `scraped_data` est créé au premier passage du scraper (ou peut être ajouté manuellement avec les colonnes ci-dessus).

### Sécurité

- Numéros de téléphone stockés sous forme de `SHA256(phone + PHONE_SALT_SECRET)` — jamais en clair dans les logs ni dans KV
- Signature Twilio validée à chaque webhook entrant
- Données scrapées toujours insérées avec `needs_review=TRUE`, jamais servies directement
- Numéros de bénévoles chargés depuis la feuille à l'exécution (pas codés en dur dans `.env`)
- Tous les logs sont assainis — aucune PII

### Installation

#### 1. Cloner et installer

```bash
git clone https://github.com/donpaco13/lebanon-aid-bot
cd lebanon-aid-bot
npm install
```

#### 2. Variables d'environnement

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Console Twilio → Account SID |
| `TWILIO_AUTH_TOKEN` | Console Twilio → Auth Token |
| `TWILIO_PHONE_NUMBER` | Numéro WhatsApp Twilio (ex. `+14155238886`) |
| `GOOGLE_SHEETS_ID` | ID du Spreadsheet depuis l'URL |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `compte@projet.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | Clé privée du compte de service (RSA) |
| `OPENAI_API_KEY` | Pour la transcription vocale Whisper |
| `KV_REST_API_URL` | Endpoint REST KV |
| `KV_REST_API_TOKEN` | Token KV |
| `PHONE_SALT_SECRET` | Secret aléatoire, minimum 32 caractères |
| `CRON_SECRET` | Secret aléatoire pour l'authentification du cron |

#### 3. Initialiser Google Sheets

```bash
node scripts/setup-sheets.js
```

#### 4. Lancer en local

```bash
npx vercel dev          # sert api/* sur http://localhost:3000
ngrok http 3000         # exposer pour Twilio
# Configurer le webhook Twilio : https://votre-url-ngrok.ngrok.io/api/webhook
```

#### 5. Lancer les tests

```bash
npm test                # suite complète (Jest)
npm run test:watch      # mode watch
npx jest tests/integration/webhook.test.js   # un seul fichier
npx jest -t "onboarding"                     # filtrer par nom de test
```

#### 6. Déployer

```bash
npx vercel              # déploiement preview
npx vercel --prod       # production
```

Configurer toutes les variables d'environnement via **Vercel projet → Settings → Environment Variables**. Le cron `/api/cron/scrape` s'exécute **quotidiennement à 08:00 UTC** (configuré dans `vercel.json`) ; `/api/health` est disponible pour les sondes uptime.

### Structure du projet

```
api/
  webhook.js            # Point d'entrée Twilio — orchestre onboarding, rate limit, intents
  health.js             # Health check (kv.ping + reachability Sheets)
  cron/scrape.js        # Endpoint cron du scraper (quotidien à 08:00 UTC)
src/
  bot/
    messages.js         # CANONIQUE — textes multilingues, t(key, lang) + formatters
    responses.js        # Anciens textes AR uniquement (en cours de migration vers messages.js)
    router.js           # Détection d'intention (mots-clés + noms de zones)
    menu.js             # Helpers du menu principal
  features/
    aid.js              # Flux demande d'aide (avec état KV, TTL 10min)
    updates.js          # Top 3 mises à jour OCHA depuis scraped_data
    shelter.js          # Localisateur d'abris
    evacuation.js       # Alertes d'évacuation
    medical.js          # Établissements médicaux
    registration.js     # Guide d'inscription
  services/
    sheets.js           # Client Google Sheets (filtre needs_review=TRUE)
    cache.js            # Wrapper KV + TTL + backup stale 24h
    twilio.js           # Client Twilio + validation signature
    notifier.js         # Notifications bénévoles (par langue)
    whisper.js          # Transcription OpenAI Whisper
    geo.js              # Distance haversine + parsing localisation
    rateLimiter.js      # 30 msg/h par hash de téléphone
  scraper/
    ocha.js             # Scraper OCHA ReliefWeb
    scheduler.js        # Déduplication + ajout dans scraped_data
  utils/
    arabic.js           # Normalisation des noms de zones (obligatoire)
    language.js         # Détection AR/EN/FR depuis le texte
    phone.js            # Hachage SHA256+sel & sanitization des logs
    logger.js           # Logger JSON structuré
    retry.js            # Backoff exponentiel pour les appels externes
scripts/
  setup-sheets.js       # Initialisation unique des Sheets
tests/                  # Jest (bot/, features/, integration/, scraper/, services/, utils/)
docs/
  VOLUNTEER_GUIDE.md    # Comment les bénévoles utilisent le bot
  ADMIN_GUIDE.md        # Gestion des Sheets, déploiement, configuration
  TEST_MANUAL.md        # Checklist QA manuelle
  plans/                # Documents d'architecture (à consulter avant tout redesign)
  sample-data/          # Lignes CSV d'exemple pour chaque onglet
vercel.json             # Timeouts des fonctions, planning du cron, route /api/health
```

### Contribuer

1. Toujours travailler sur une branche de fonctionnalité — ne jamais committer directement sur `main`
2. Lancer `npm test` avant de pousser — la suite complète doit passer
3. Tous les **nouveaux** textes côté utilisateur vont dans `src/bot/messages.js` (avec variantes AR/EN/FR et entrée dans `t(key, lang)`). `responses.js` est legacy — ne rien y ajouter ; migrer au fil de l'eau.
4. La correspondance de zones doit passer par `arabic.js normalize()` avant toute comparaison
5. Ne jamais logger les numéros de téléphone ou les PII — utiliser `sanitizeLogs()` de `utils/phone.js`
6. Les violations de TTL sont des bugs P0 — ne pas modifier les TTL de `services/cache.js` sans discussion
7. Les données scrapées doivent entrer avec `needs_review=TRUE` ; `sheets.js` les filtre. Ne jamais contourner le filtre.

---

## License / Licence

MIT — See [LICENSE](LICENSE)
