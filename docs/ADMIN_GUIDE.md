# Admin Guide — دليل المشرف

> How to manage Google Sheets, volunteers, deployment, and bot configuration.

---

## English

### Overview

Admins are responsible for:

- Managing the Google Spreadsheet (adding/removing data, managing volunteers)
- Monitoring the bot's health and logs
- Deploying updates to Vercel
- Rotating secrets and credentials
- Reviewing sensitive data (full phone numbers, admin-only columns)

---

### 1. Google Sheets structure

The spreadsheet has 6 tabs. To open it: go to your Google Drive, find the sheet named in `GOOGLE_SHEETS_ID`.

#### Tab: `shelters`

| Column | Type | Notes |
|--------|------|-------|
| id | string | Auto-generated (e.g. `SH-001`) |
| name_ar | string | Shelter name in Arabic |
| zone | string | Display zone name in Arabic |
| zone_normalized | string | See zone token table below |
| address_ar | string | Full address in Arabic |
| lat | number | Latitude (decimal degrees) |
| lng | number | Longitude (decimal degrees) |
| capacity | number | Total capacity |
| available_spots | number | **Update this regularly** |
| status | string | `open` / `full` / `closed` |
| verified_at | datetime | `YYYY-MM-DD HH:MM:SS` |
| source | string | Source name or URL |
| auto_scraped | boolean | `TRUE` if added by scraper |
| needs_review | boolean | `TRUE` = hidden from users |
| scraped_source | string | Source URL or Telegram message ID |

**Tip:** Sort by `verified_at` ascending to find the oldest unverified shelters first.

#### Tab: `evacuations`

| Column | Type | Notes |
|--------|------|-------|
| id | string | Auto-generated (e.g. `EV-001`) |
| zone | string | Display zone name |
| zone_normalized | string | Normalized token |
| status | string | `active` / `expired` / `all_clear` |
| direction_ar | string | Safety direction in Arabic dialect (e.g. "توجّهوا شمالاً") |
| issued_at | datetime | When the order was issued |
| expires_at | datetime | When it expires — **must be kept current** |
| verified_at | datetime | Last human verification |
| source | string | Source name or URL |
| auto_scraped | boolean | `TRUE` if added by scraper |
| needs_review | boolean | `TRUE` = hidden from users |
| scraped_source | string | Source URL or message ID |

**Critical:** Evacuations cache TTL is 5 minutes. If you mark an evacuation `expired`, users will see the update within 5 minutes.

#### Tab: `medical`

| Column | Type | Notes |
|--------|------|-------|
| id | string | Auto-generated (e.g. `MD-001`) |
| name_ar | string | Facility name in Arabic |
| zone | string | Display zone name |
| zone_normalized | string | Normalized token |
| address_ar | string | Full address |
| lat | number | Latitude |
| lng | number | Longitude |
| type | string | `hospital` / `clinic` / `pharmacy` / `field_unit` |
| status | string | `operational` / `limited` / `closed` / `destroyed` |
| last_verified_at | datetime | **Shown to users** as "آخر تحقق: HH:MM" |
| disclaimer | string | Optional warning (e.g. "capacity limited") |
| auto_scraped | boolean | |
| needs_review | boolean | `TRUE` = hidden from users |
| scraped_source | string | |

**Note:** The field is `last_verified_at`, not `verified_at` — this is intentional (see CLAUDE.md).

#### Tab: `aid_requests`

| Column | Type | Notes |
|--------|------|-------|
| id | string | Auto-generated |
| ticket_number | string | Shown to user (e.g. `AID-1710500423`) |
| name | string | User's name |
| phone | string | Masked (e.g. `+961 XX XX 78 90`) |
| **phone_full** | string | **Admin only — full number** |
| zone | string | User's zone |
| need_type | string | `food` / `blankets` / `medicine` / `other` |
| details | string | Additional notes |
| status | string | `pending` / `assigned` / `fulfilled` |
| created_at | datetime | Request creation time |
| assigned_to | string | Volunteer name |
| notified_at | datetime | Last volunteer notification time |

**Privacy:** The `phone_full` column should be hidden in Sheets (right-click column → Hide column). Never share full numbers with unauthorized personnel.

#### Tab: `volunteers`

| Column | Type | Notes |
|--------|------|-------|
| id | string | Auto-generated (e.g. `VOL-001`) |
| name | string | Volunteer's name |
| phone | string | International format: `+9613XXXXXX` |
| org | string | Organization name |
| zone | string | Preferred zone (informational) |
| on_duty | boolean | **TRUE = receives notifications right now** |
| shift_start | time | `HH:MM` (e.g. `08:00`) |
| shift_end | time | `HH:MM` (e.g. `20:00`) |
| language | string | `ar` / `fr` / `en` (notification language) |

**Adding a volunteer:**
1. Add a new row with their name, phone, and org
2. Set `on_duty = FALSE` initially
3. They will set their own shifts when they start

**Removing a volunteer:**
1. Set `on_duty = FALSE`
2. Delete the row (or keep for records)

#### Tab: `registration_info`

| Column | Type | Notes |
|--------|------|-------|
| step | number | Sequential step number (1, 2, 3…) |
| text_ar | string | Instructions in Lebanese Arabic dialect |
| link | string | Ministry form URL |
| documents_ar | string | Required documents in Arabic |

This tab is manually maintained. Cache TTL is 1 hour. After editing, changes are live within 1 hour.

---

### 2. Zone tokens reference

Always use these exact tokens in `zone_normalized` columns:

| Arabic | token | Governorate |
|--------|-------|------------|
| الحمرا | `hamra` | Beirut |
| بيروت | `beirut` | Beirut |
| الضاحية | `dahiye` | Beirut suburbs |
| صيدا | `saida` | South Lebanon |
| صور | `tyre` | South Lebanon |
| جبيل | `byblos` | Mount Lebanon |
| طرابلس | `tripoli` | North Lebanon |
| زحلة | `zahle` | Bekaa |
| النبطية | `nabatiye` | Nabatiye |
| بنت جبيل | `bint_jbeil` | Nabatiye |
| مرجعيون | `marjeyoun` | Nabatiye |
| حاصبيا | `hasbaya` | Nabatiye |
| البقاع | `bekaa` | Bekaa |
| بعلبك | `baalbek` | Baalbek-Hermel |
| عكار | `akkar` | Akkar |
| كسروان | `kesrouan` | Mount Lebanon |
| الشوف | `chouf` | Mount Lebanon |

---

### 3. Data freshness SLAs

These are P0 (user safety) requirements — do not violate:

| Data type | Maximum allowed staleness |
|-----------|--------------------------|
| Evacuations | 5 minutes |
| Medical | 10 minutes |
| Shelters | 15 minutes |
| Registration | 1 hour |

If Google Sheets is unreachable, the bot serves stale cached data and shows a timestamp warning to users. Restore Sheet access as soon as possible.

---

### 4. Deployment

The bot is deployed on Vercel. All serverless functions are in `api/`.

#### Environment variables

Set these in the Vercel dashboard (Settings → Environment Variables):

```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
GOOGLE_SHEETS_ID
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
OPENAI_API_KEY
TELEGRAM_BOT_TOKEN
KV_REST_API_URL
KV_REST_API_TOKEN
PHONE_SALT_SECRET
CRON_SECRET
```

**Never commit these to git.** The `.env.example` file is safe to commit (no real values).

#### Deploy a new version

```bash
# Create a feature branch
git checkout -b feat/my-change

# Make changes, run tests
npm test

# Merge to main via PR
# Vercel auto-deploys on merge to main
```

#### Emergency rollback

In Vercel dashboard → Deployments → find the last good deployment → click "Promote to Production".

#### Cron job

The scraper runs every 30 minutes via Vercel Cron (configured in `vercel.json`):

```json
{
  "crons": [{ "path": "/api/cron/scrape", "schedule": "*/30 * * * *" }]
}
```

The endpoint requires the `Authorization: Bearer <CRON_SECRET>` header. Vercel sets this automatically.

To trigger manually:
```bash
curl -X GET https://your-domain.vercel.app/api/cron/scrape \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

### 5. Google Service Account setup

If you need to create a new service account:

1. Go to Google Cloud Console → IAM & Admin → Service Accounts
2. Create a new service account
3. Download the JSON key
4. Extract `client_email` → set as `GOOGLE_SERVICE_ACCOUNT_EMAIL`
5. Extract `private_key` → set as `GOOGLE_PRIVATE_KEY` (include the full `-----BEGIN...-----END-----` block)
6. In Google Sheets → Share the spreadsheet with the service account email (Editor role)

---

### 6. Twilio setup

1. Go to Twilio Console → Messaging → Try it out → Send a WhatsApp message
2. For production: request a dedicated WhatsApp sender
3. Configure the webhook:
   - URL: `https://your-domain.vercel.app/api/webhook`
   - Method: POST
4. The bot validates the Twilio signature on every request — if you change `TWILIO_AUTH_TOKEN`, redeploy.

---

### 7. Rotating secrets

**PHONE_SALT_SECRET rotation:**
⚠️ Rotating this secret will invalidate all existing KV session states (aid_request flows). Users in the middle of a request will be reset to the main menu. This is safe — no data is lost, only the in-progress multi-turn state.

Steps:
1. Generate a new secret: `openssl rand -hex 32`
2. Update in Vercel dashboard
3. Redeploy

**CRON_SECRET rotation:**
1. Generate a new secret
2. Update in Vercel dashboard
3. Redeploy

---

### 8. Monitoring and logs

**Vercel logs:**
- Dashboard → Functions → Select a deployment → Logs
- Or use the Vercel CLI: `vercel logs --follow`

**What to look for:**
- `[WEBHOOK]` — incoming messages (phone numbers are masked/hashed in logs)
- `[SHEETS]` — Google Sheets fetch errors
- `[CACHE]` — KV errors
- `[SCRAPER]` — scraper errors
- `[NOTIFIER]` — volunteer notification failures (non-fatal, logged as warnings)

**Alerts:** Set up Vercel error alerts in: Settings → Notifications.

---

### 9. Initial setup checklist

Use this checklist when deploying for the first time:

- [ ] Create Google Spreadsheet and share with service account
- [ ] Run `node scripts/setup-sheets.js` to create tabs and headers
- [ ] Add registration steps to `registration_info` tab
- [ ] Add at least one volunteer to `volunteers` tab with `on_duty = TRUE`
- [ ] Set all environment variables in Vercel dashboard
- [ ] Deploy with `vercel --prod`
- [ ] Configure Twilio webhook URL
- [ ] Test with a WhatsApp message: send "1" to the bot number
- [ ] Verify logs show no errors
- [ ] Add initial shelter/medical/evacuation data

---

### 10. Running tests

```bash
# Run full test suite (92 tests)
npm test

# Run a specific test file
npx jest tests/features/shelter.test.js

# Run tests in watch mode
npx jest --watch

# Coverage report
npx jest --coverage
```

All tests mock external dependencies (Google Sheets, Twilio, Vercel KV, OpenAI). They do not require live credentials.

---

## Français

### Présentation

Les administrateurs sont responsables de :

- Gérer le Google Spreadsheet (ajouter/supprimer des données, gérer les bénévoles)
- Surveiller la santé du bot et ses logs
- Déployer les mises à jour sur Vercel
- Faire tourner les secrets et identifiants
- Consulter les données sensibles (numéros complets, colonnes admin uniquement)

---

### 1. Structure Google Sheets

Le spreadsheet comporte 6 onglets. Pour l'ouvrir : accédez à votre Google Drive et trouvez le fichier dont l'ID correspond à `GOOGLE_SHEETS_ID`.

#### Onglet `shelters` (abris)

Colonnes clés : `id`, `name_ar`, `zone`, `zone_normalized`, `address_ar`, `lat`, `lng`, `capacity`, `available_spots`, `status` (`open`/`full`/`closed`), `verified_at`, `needs_review`.

**Mettez à jour `available_spots` régulièrement.**

#### Onglet `evacuations` (évacuations)

Colonnes clés : `id`, `zone`, `zone_normalized`, `status` (`active`/`expired`/`all_clear`), `direction_ar`, `issued_at`, `expires_at`, `verified_at`, `needs_review`.

**Critique :** Le TTL du cache est de 5 minutes. Les mises à jour sont visibles pour les utilisateurs dans les 5 minutes.

#### Onglet `medical` (médical)

Colonnes clés : `id`, `name_ar`, `zone`, `zone_normalized`, `address_ar`, `lat`, `lng`, `type` (`hospital`/`clinic`/`pharmacy`/`field_unit`), `status` (`operational`/`limited`/`closed`/`destroyed`), **`last_verified_at`** (affiché aux utilisateurs comme "آخر تحقق: HH:MM"), `needs_review`.

#### Onglet `aid_requests` (demandes d'aide)

Colonnes clés : `ticket_number`, `name`, `phone` (masqué), **`phone_full`** (admin uniquement — **à masquer dans Sheets**), `zone`, `need_type`, `status` (`pending`/`assigned`/`fulfilled`), `assigned_to`, `notified_at`.

#### Onglet `volunteers` (bénévoles)

Colonnes clés : `name`, `phone` (format international `+9613XXXXXX`), `on_duty` (TRUE = reçoit les notifications), `shift_start`, `shift_end`, `language` (`ar`/`fr`/`en`).

#### Onglet `registration_info` (inscription)

Étapes d'inscription manuelles. Cache TTL = 1 heure.

---

### 2. Tokens de zones

Utilisez ces tokens exacts dans la colonne `zone_normalized` :

`hamra`, `beirut`, `dahiye`, `saida`, `tyre`, `byblos`, `tripoli`, `zahle`, `nabatiye`, `bint_jbeil`, `marjeyoun`, `hasbaya`, `bekaa`, `baalbek`, `akkar`, `kesrouan`, `chouf`

---

### 3. SLAs de fraîcheur des données (P0)

| Type de données | Fraîcheur maximale |
|-----------------|-------------------|
| Évacuations | 5 minutes |
| Médical | 10 minutes |
| Abris | 15 minutes |
| Inscription | 1 heure |

---

### 4. Déploiement

```bash
# Créer une branche de fonctionnalité
git checkout -b feat/ma-modification

# Faire les changements, lancer les tests
npm test

# Merger vers main via PR
# Vercel déploie automatiquement sur le merge vers main
```

**Retour arrière d'urgence :** Dashboard Vercel → Deployments → trouver le dernier bon déploiement → "Promote to Production".

---

### 5. Checklist d'installation initiale

- [ ] Créer le Google Spreadsheet et le partager avec le compte de service
- [ ] Exécuter `node scripts/setup-sheets.js`
- [ ] Ajouter les étapes d'inscription dans l'onglet `registration_info`
- [ ] Ajouter au moins un bénévole avec `on_duty = TRUE`
- [ ] Configurer toutes les variables d'environnement dans Vercel
- [ ] Déployer avec `vercel --prod`
- [ ] Configurer l'URL du webhook Twilio
- [ ] Tester avec un message WhatsApp (envoyer "1")
- [ ] Vérifier les logs (aucune erreur)
- [ ] Ajouter les données initiales (abris, médical, évacuations)

---

### 6. Lancer les tests

```bash
npm test                         # 92 tests complets
npx jest tests/features/         # Tests des fonctionnalités uniquement
npx jest --coverage              # Rapport de couverture
```

Tous les tests simulent les dépendances externes — aucun identifiant réel requis.
