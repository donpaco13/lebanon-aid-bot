# Deployment Guide — Lebanon Aid Bot

## Prerequisites

- Node.js 18+
- A [Vercel](https://vercel.com) account
- A [Twilio](https://twilio.com) account with WhatsApp sandbox or approved WhatsApp Business sender
- A Google Cloud project with a service account
- An [OpenAI](https://platform.openai.com) API key (for Whisper voice transcription)
- A [Vercel KV](https://vercel.com/docs/storage/vercel-kv) database (Redis)

---

## Step 1 — Clone and install

```bash
git clone https://github.com/donpaco13/lebanon-aid-bot.git
cd lebanon-aid-bot
npm install
```

---

## Step 2 — Google Cloud service account

1. Go to [Google Cloud Console](https://console.cloud.google.com) → IAM & Admin → Service Accounts.
2. Create a new service account (e.g. `lebanon-aid-bot`).
3. Grant it no project roles (the spreadsheet permission is set at the Sheet level).
4. Generate a JSON key → download it.
5. From the JSON key, copy:
   - `client_email` → used as `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → used as `GOOGLE_PRIVATE_KEY`

---

## Step 3 — Create the Google Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new blank spreadsheet.
2. Note the spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit
   ```
3. Share the spreadsheet with the service account email (`Editor` permission).

### Run the setup script

```bash
GOOGLE_SHEETS_ID=<your-spreadsheet-id> \
GOOGLE_SERVICE_ACCOUNT_EMAIL=<service-account-email> \
GOOGLE_PRIVATE_KEY='<private-key-with-newlines>' \
node scripts/setup-sheets.js
```

This creates all required tabs (`shelters`, `evacuations`, `medical`, `aid_requests`, `volunteers`, `registration_info`) with correct headers, frozen and bolded.

---

## Step 4 — Create Vercel KV database

1. In the Vercel dashboard → Storage → Create KV database.
2. Name it `lebanon-aid-bot-kv` (or any name).
3. Connect it to your project. Vercel will inject `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, and `KV_REST_API_READ_ONLY_TOKEN` automatically.

---

## Step 5 — Configure environment variables

Set these in Vercel (Settings → Environment Variables) **and** in a local `.env` file for development:

| Variable | Description |
|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Your Twilio WhatsApp number (`whatsapp:+14155238886` for sandbox) |
| `GOOGLE_SHEETS_ID` | Google Spreadsheet ID |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account `client_email` |
| `GOOGLE_PRIVATE_KEY` | Service account `private_key` (keep `\n` as literal `\n` in Vercel) |
| `OPENAI_API_KEY` | OpenAI API key for Whisper |
| `CRON_SECRET` | Random secret string for cron endpoint auth |
| `PHONE_SALT_SECRET` | Random secret for hashing phone numbers (never change after deploy) |
| `VOLUNTEER_NUMBERS` | Fallback comma-separated phone numbers if Sheet is unreachable |
| `KV_REST_API_URL` | Auto-injected by Vercel KV |
| `KV_REST_API_TOKEN` | Auto-injected by Vercel KV |

Generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run this twice — once for `CRON_SECRET`, once for `PHONE_SALT_SECRET`.

> **Warning:** `PHONE_SALT_SECRET` must never change after the first user interaction. Changing it makes all existing KV state unreachable.

---

## Step 6 — Deploy to Vercel

### Via CLI

```bash
npm install -g vercel
vercel login
vercel --prod
```

### Via GitHub integration

1. In Vercel dashboard → Add New Project → Import from GitHub.
2. Select `lebanon-aid-bot`.
3. Vercel auto-detects Node.js. No build command needed.
4. Set all environment variables (Step 5) before first deploy.
5. Click Deploy.

---

## Step 7 — Configure Twilio webhook

1. In the [Twilio console](https://console.twilio.com) → Messaging → Try it out → Send a WhatsApp message (sandbox) **or** Messaging → Senders → WhatsApp (production).
2. Set the webhook URL:
   ```
   https://<your-vercel-domain>/api/webhook
   ```
   - Method: `HTTP POST`
3. For sandbox: follow the sandbox join instructions and paste the webhook URL in the sandbox settings.

---

## Step 8 — Verify cron job

Vercel runs the scraper automatically every 30 minutes (`*/30 * * * *`) using the cron config in `vercel.json`.

To trigger it manually:
```bash
curl -X GET https://<your-vercel-domain>/api/cron/scrape \
  -H "Authorization: Bearer <CRON_SECRET>"
```

You should see `{"ok":true,...}`.

---

## Step 9 — Populate initial data

Add rows to Google Sheets manually (or via NGO data import):

- `shelters`: at minimum `id`, `name_ar`, `zone`, `status`, `verified_at`. Set `needs_review=FALSE` to make the row visible to users.
- `evacuations`: set `status=active`, `needs_review=FALSE`.
- `medical`: set `status=operational`, `needs_review=FALSE`.
- `registration_info`: add steps 1–N with `text_ar` instructions.
- `volunteers`: add volunteer records with `on_duty=TRUE` for those currently on shift.

> Scraped data from OCHA enters the sheet with `needs_review=TRUE` and is **never shown to users until a human reviews and sets `needs_review=FALSE`**.

---

## Step 10 — Test end-to-end

1. Send a WhatsApp message to your Twilio number.
2. Expected response: main menu in Lebanese dialect.
3. Send `1` → shelter list.
4. Send `2` → evacuation alerts.
5. Send a voice note → transcription + intent response.

---

## Monitoring and operations

| What | Where |
|------|-------|
| Function logs | Vercel dashboard → Functions tab |
| Cron execution | Vercel dashboard → Cron jobs |
| KV cache state | Vercel dashboard → Storage → KV |
| Incoming messages | Twilio console → Monitor → Logs |
| Sheet data | Google Sheets directly |

---

## Secrets rotation

- **Twilio credentials**: update in Vercel env vars → redeploy.
- **Google service account key**: create new key → update env vars → redeploy → delete old key in Google Cloud.
- **`CRON_SECRET`**: update in Vercel env vars → redeploy. No state impact.
- **`PHONE_SALT_SECRET`**: **do not rotate** unless you accept losing all active KV sessions.

---

## Architecture summary

```
WhatsApp user
    |
    v
Twilio WhatsApp API
    |  POST /api/webhook
    v
Vercel Serverless (api/webhook.js)
    |
    +-- Vercel KV (Redis cache, TTL by data type)
    |
    +-- Google Sheets API (source of truth)
    |
    +-- OpenAI Whisper (voice transcription)
    |
    v
TwiML response -> Twilio -> WhatsApp user

Vercel Cron (every 30min)
    |  GET /api/cron/scrape
    v
OCHA Flash Updates
    -> Scraped rows in Google Sheets (needs_review=true)
```
