# Lebanon Aid Bot — Project Context
## Project
WhatsApp humanitarian chatbot for displaced civilians in Lebanon.
Stack: Node.js, Vercel serverless, Google Sheets, Twilio, Whisper, Vercel KV.
Design docs: see docs/plans/
## Security (non-negotiable — P0)
- Never log phone numbers or any PII in plain text
- Phone number as KV key = SHA256(phone + PHONE_SALT_SECRET) only
- Always validate Twilio signature on every incoming webhook
- Scraped data always enters Sheet with needs_review=true — never served directly to users
- Volunteers loaded from Sheet (on_duty=true) at runtime, not from .env
- .env fallback for VOLUNTEER_NUMBERS only if Sheet is unreachable
## Data freshness (user safety = P0)
- TTL violations are P0 bugs: evacuations=5min, medical=10min, shelters=15min, static=1h
- Stale cache fallback: always include last_verified_at timestamp in Arabic dialect message
- Medical data: use last_verified_at (datetime precise), not just verified_at
## Arabic/Lebanese dialect
- All user-facing strings in src/bot/responses.js only — never inline elsewhere
- All zone matching must go through arabic.js normalize() before any comparison
- Scraped data columns: auto_scraped (bool), needs_review (bool), scraped_source (URL/ID)
## Data model additions vs original design
- medical sheet: last_verified_at (datetime), not verified_at
- aid_requests sheet: notified_at (datetime) for 2h reminder scheduler
- volunteers sheet: language (ar/fr/en) for localized notifications
## Bot behavior
- Stateless except aid_request flow (KV state TTL=10min, key=hash(phone))
- Always show verification timestamp for critical data (evacuation, medical)
- Menu: user can always send a digit or "قائمة" to return to main menu
