# Lebanon Aid Bot — بوت المساعدة للنازحين

> WhatsApp chatbot for displaced civilians in Lebanon — Arabic dialect, real-time shelter/evacuation/medical data, volunteer dispatch.
>
> Bot WhatsApp pour les civils déplacés au Liban — dialecte arabe libanais, données d'abris/évacuation/médical en temps réel, dispatch de bénévoles.

---

## English

### What it does

Lebanon Aid Bot is a WhatsApp chatbot that helps displaced civilians in Lebanon find:

- **Nearby shelters** with available capacity
- **Evacuation alerts** for their zone
- **Operational medical facilities** near them
- **Aid requests** — food, blankets, medicine, other
- **Displacement registration** guide (Ministry of Social Affairs)

It also supports **voice messages** in Lebanese Arabic (transcribed via OpenAI Whisper) and **automatically pre-fills** shelter/evacuation data from OCHA Flash Updates, with human review before any data reaches users.

**Evacuation data** is managed editorially by the NGO team via Google Sheet — no external scrapers or military sources.

### Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (ESModules) |
| Deployment | Cloudflare Workers (serverless) |
| Messaging | Twilio WhatsApp API |
| Data backend | Google Sheets API |
| Cache | KV cache |
| Voice | OpenAI Whisper |
| Tests | Jest (92 tests, 22 suites) |

### Architecture

```
Twilio WhatsApp
      │
      ▼
POST /api/webhook  ──► Twilio signature validation
      │
      ▼
bot/router.js       ──► Intent detection (keywords + menu digits)
      │
      ├──► features/shelter.js       ──► cache.js ──► sheets.js
      ├──► features/evacuation.js    ──► cache.js ──► sheets.js
      ├──► features/medical.js       ──► cache.js ──► sheets.js
      ├──► features/aid.js           ──► KV (stateful, 10 min TTL)
      │                               └──► notifier.js ──► volunteers sheet
      └──► features/registration.js  ──► cache.js ──► sheets.js

GET /api/cron/scrape (every 30 min)
      │
      └──► scraper/ocha.js      ──► scheduler.js ──► sheets (needs_review=true)
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
User sends WhatsApp message
        │
        ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  أهلا 👋  (Main menu)                                        │
  │  1️⃣ ملاجئ قريبة         (Nearby shelters)                    │
  │  2️⃣ تحذيرات إخلاء        (Evacuation alerts)                 │
  │  3️⃣ مستشفيات شغّالة       (Operational hospitals)             │
  │  4️⃣ طلب مساعدة            (Request aid)                       │
  │  5️⃣ تسجيل كنازح           (Register as displaced)             │
  │  أو ابعتلي موقعك 📍       (Or send your location)            │
  └──────────────────────────────────────────────────────────────┘
        │
 ┌──────┴──────────────────────────────────────────────────┐
 │1            │2              │3           │4         │5   │
 ▼             ▼               ▼            ▼          ▼    │
Shelter    Evacuation       Medical      Aid        Reg.    │
(zone/GPS) (zone/all)     (zone/GPS)   Request    Guide    │
                                       (3 steps             │
                                        stateful)          │
                                           │                │
                                       Notify on-duty       │
                                       volunteers           │
 └────────────── "قائمة" or digit → back to menu ──────────┘
```

**Aid request flow (stateful, KV TTL = 10 min):**

```
Step 1 → "شو اسمك؟"            (What is your name?)
Step 2 → "وين موجود/ة؟"        (Where are you located?)
Step 3 → "شو محتاج/ة؟"         (What do you need?)
         1. أكل (food)
         2. فرشات + بطانيات (blankets)
         3. دوا (medicine)
         4. غير هيك (other)
         ↓
         Ticket created → on-duty volunteers notified
```

### Google Sheets schema

The bot uses a single Google Spreadsheet with 6 tabs:

| Tab | Purpose | Key columns |
|-----|---------|-------------|
| `shelters` | Shelter locations | zone_normalized, available_spots, status, verified_at |
| `evacuations` | Active evacuation orders — managed by NGO team | zone_normalized, status, direction_ar, issued_at, expires_at |
| `medical` | Hospitals / clinics | zone_normalized, type, status, last_verified_at |
| `aid_requests` | User aid requests | ticket_number, name, zone, need_type, status, notified_at |
| `volunteers` | On-duty volunteers | on_duty, shift_start, shift_end, language |
| `registration_info` | Registration steps | step, text_ar, link, documents_ar |

**Safety rule:** Any row with `needs_review=TRUE` is invisible to users until a volunteer manually sets it to `FALSE`.

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
npm run dev
# Expose via ngrok:
ngrok http 3000
# Set Twilio webhook URL to:
# https://your-ngrok-url.ngrok.io/api/webhook
```

#### 5. Run tests

```bash
npm test
# 92 tests, 22 suites — all should pass
```

#### 6. Deploy

```bash
# Deploy to Cloudflare Workers
# Set all environment variables in dashboard
# Cron job (/api/cron/scrape) runs automatically every 30 minutes
```

### Project structure

```
api/
  webhook.js            # Twilio message entry point
  cron/scrape.js        # Scraper cron endpoint (every 30 min)
src/
  bot/
    responses.js        # All user-facing strings (DO NOT inline elsewhere)
    router.js           # Intent detection
    menu.js             # Main menu
  features/
    shelter.js          # Shelter locator
    evacuation.js       # Evacuation alerts
    medical.js          # Medical facilities
    aid.js              # Aid request flow (stateful via KV)
    registration.js     # Registration guide
  services/
    sheets.js           # Google Sheets client (filters needs_review)
    cache.js            # KV wrapper + TTL + stale backup
    twilio.js           # Twilio client + signature validation
    notifier.js         # Volunteer notifications
    whisper.js          # OpenAI Whisper transcription
    geo.js              # Haversine distance
    rateLimiter.js      # 30 msg/hr per user
  scraper/
    ocha.js             # OCHA ReliefWeb scraper
    scheduler.js        # Deduplication + append to sheet
  utils/
    arabic.js           # Zone name normalization (required for all matching)
    phone.js            # Phone hashing & masking
scripts/
  setup-sheets.js       # One-time Sheet initialization
tests/                  # 22 suites, 92 tests
docs/
  VOLUNTEER_GUIDE.md    # How volunteers use the bot and manage data
  ADMIN_GUIDE.md        # How to manage Sheets, deploy, and configure
  plans/                # Architecture design documents
```

### Contributing

1. Always work on a feature branch — never commit directly to `main`
2. Run `npm test` before pushing — all 92 tests must pass
3. All user-facing strings go in `src/bot/responses.js` only — never inline
4. Zone matching must go through `arabic.js normalize()` before any comparison
5. Never log phone numbers or any PII
6. TTL violations are P0 bugs — do not change TTL values without discussion

---

## Français

### Présentation

Lebanon Aid Bot est un chatbot WhatsApp qui aide les civils déplacés au Liban à trouver :

- **Des abris proches** avec des places disponibles
- **Des alertes d'évacuation** pour leur zone
- **Des établissements médicaux opérationnels** à proximité
- **Des demandes d'aide** — nourriture, couvertures, médicaments, autre
- **Un guide d'inscription** pour les déplacés (Ministère des Affaires Sociales)

Le bot prend également en charge les **messages vocaux** en dialecte arabe libanais (transcrits via OpenAI Whisper) et **pré-remplit automatiquement** les données d'abris depuis les mises à jour OCHA Flash, avec une revue humaine avant que les données n'atteignent les utilisateurs.

**Les données d'évacuation** sont gérées éditorialement par l'équipe ONG via Google Sheet — aucun scraper externe ni source militaire.

### Stack technique

| Couche | Technologie |
|--------|------------|
| Runtime | Node.js (ESModules) |
| Déploiement | Cloudflare Workers (serverless) |
| Messagerie | Twilio WhatsApp API |
| Backend données | Google Sheets API |
| Cache | KV cache |
| Voix | OpenAI Whisper |
| Tests | Jest (92 tests, 22 suites) |

### Architecture

```
WhatsApp Twilio
      │
      ▼
POST /api/webhook  ──► Validation signature Twilio
      │
      ▼
bot/router.js       ──► Détection d'intention (mots-clés + chiffres du menu)
      │
      ├──► features/shelter.js       ──► cache.js ──► sheets.js
      ├──► features/evacuation.js    ──► cache.js ──► sheets.js
      ├──► features/medical.js       ──► cache.js ──► sheets.js
      ├──► features/aid.js           ──► KV (stateful, TTL 10 min)
      │                               └──► notifier.js ──► feuille bénévoles
      └──► features/registration.js  ──► cache.js ──► sheets.js

GET /api/cron/scrape (toutes les 30 min)
      │
      └──► scraper/ocha.js      ──► scheduler.js ──► sheets (needs_review=true)
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
L'utilisateur envoie un message WhatsApp
              │
              ▼
  ┌────────────────────────────────────────────────────────────────┐
  │  أهلا 👋  (Menu principal)                                      │
  │  1️⃣ ملاجئ قريبة            (Abris proches)                      │
  │  2️⃣ تحذيرات إخلاء           (Alertes d'évacuation)               │
  │  3️⃣ مستشفيات شغّالة          (Hôpitaux opérationnels)             │
  │  4️⃣ طلب مساعدة               (Demande d'aide)                    │
  │  5️⃣ تسجيل كنازح              (S'inscrire comme déplacé)           │
  │  Ou envoyer sa localisation 📍                                  │
  └────────────────────────────────────────────────────────────────┘
```

**Flux de demande d'aide (avec état, TTL KV = 10 min) :**

```
Étape 1 → "شو اسمك؟"           (Quel est votre nom ?)
Étape 2 → "وين موجود/ة؟"       (Où êtes-vous ?)
Étape 3 → "شو محتاج/ة؟"        (De quoi avez-vous besoin ?)
          1. أكل (nourriture)
          2. فرشات + بطانيات (couvertures)
          3. دوا (médicaments)
          4. غير هيك (autre)
          ↓
          Ticket créé → bénévoles de garde notifiés
```

### Schéma Google Sheets

Le bot utilise un seul Google Spreadsheet avec 6 onglets :

| Onglet | Rôle | Colonnes clés |
|--------|------|---------------|
| `shelters` | Abris disponibles | zone_normalized, available_spots, status, verified_at |
| `evacuations` | Ordres d'évacuation actifs — gérés par l'équipe ONG | zone_normalized, status, direction_ar, issued_at, expires_at |
| `medical` | Hôpitaux / cliniques | zone_normalized, type, status, last_verified_at |
| `aid_requests` | Demandes d'aide utilisateurs | ticket_number, name, zone, need_type, status, notified_at |
| `volunteers` | Bénévoles de garde | on_duty, shift_start, shift_end, language |
| `registration_info` | Étapes d'inscription | step, text_ar, link, documents_ar |

**Règle de sécurité :** Toute ligne avec `needs_review=TRUE` est invisible aux utilisateurs jusqu'à validation manuelle par un bénévole.

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
npm run dev
ngrok http 3000
# Configurer le webhook Twilio : https://votre-url-ngrok.ngrok.io/api/webhook
```

#### 5. Lancer les tests

```bash
npm test
# 92 tests, 22 suites — tous doivent passer
```

#### 6. Déployer

```bash
# Déployer sur Cloudflare Workers
# Configurer les variables d'environnement dans le dashboard
# Le cron (/api/cron/scrape) s'exécute automatiquement toutes les 30 minutes
```

### Structure du projet

```
api/
  webhook.js            # Point d'entrée des messages Twilio
  cron/scrape.js        # Endpoint cron du scraper (toutes les 30 min)
src/
  bot/
    responses.js        # Tous les textes côté utilisateur (ne pas inline ailleurs)
    router.js           # Détection d'intention
    menu.js             # Menu principal
  features/
    shelter.js          # Localisateur d'abris
    evacuation.js       # Alertes d'évacuation
    medical.js          # Établissements médicaux
    aid.js              # Flux de demande d'aide (stateful via KV)
    registration.js     # Guide d'inscription
  services/
    sheets.js           # Client Google Sheets (filtre needs_review)
    cache.js            # Wrapper KV + TTL + backup stale
    twilio.js           # Client Twilio + validation signature
    notifier.js         # Notifications bénévoles
    whisper.js          # Transcription OpenAI Whisper
    geo.js              # Distance haversine
    rateLimiter.js      # 30 msg/h par utilisateur
  scraper/
    ocha.js             # Scraper OCHA ReliefWeb
    scheduler.js        # Déduplication + ajout à la feuille
  utils/
    arabic.js           # Normalisation des noms de zones (obligatoire)
    phone.js            # Hachage et masquage des numéros
scripts/
  setup-sheets.js       # Initialisation unique des Sheets
tests/                  # 22 suites, 92 tests
docs/
  VOLUNTEER_GUIDE.md    # Comment les bénévoles utilisent le bot
  ADMIN_GUIDE.md        # Gestion des Sheets, déploiement, configuration
  plans/                # Documents d'architecture
```

### Contribuer

1. Toujours travailler sur une branche de fonctionnalité — ne jamais committer directement sur `main`
2. Lancer `npm test` avant de pousser — les 92 tests doivent passer
3. Tous les textes côté utilisateur vont dans `src/bot/responses.js` uniquement
4. La correspondance de zones doit passer par `arabic.js normalize()` avant toute comparaison
5. Ne jamais logger les numéros de téléphone ou les PII
6. Les violations de TTL sont des bugs P0 — ne pas modifier les valeurs de TTL sans discussion

---

## License / Licence

MIT — See [LICENSE](LICENSE)
