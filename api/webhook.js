// api/webhook.js
const express = require('express');
const twilio = require('twilio');
const { kv } = require('@vercel/kv');
const { parseTwilioBody, sendMessage, validateRequest } = require('../src/services/twilio');
const { transcribeAudio } = require('../src/services/whisper');
const { detectIntent } = require('../src/bot/router');
const { handleShelter } = require('../src/features/shelter');
const { handleEvacuation } = require('../src/features/evacuation');
const { handleMedical } = require('../src/features/medical');
const { handleAid } = require('../src/features/aid');
const { handleRegistration } = require('../src/features/registration');
const { checkRateLimit } = require('../src/services/rateLimiter');
const { notifyVolunteers } = require('../src/services/notifier');
const { hashPhone, sanitizeLogs } = require('../src/utils/phone');
const messages = require('../src/bot/messages');
const { detectLanguage } = require('../src/utils/language');
const { parseLocation } = require('../src/services/geo');

const app = express();
app.use(express.urlencoded({ extended: false }));

app.post('/api/webhook', async (req, res) => {
  // Validate Twilio signature (P0 security requirement — prevents forged webhooks)
  const isValid = validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    req.headers['x-twilio-signature'] || '',
    process.env.TWILIO_WEBHOOK_URL || `https://${req.headers.host}/api/webhook`,
    req.body
  );
  if (!isValid) {
    return res.status(403).end();
  }

  const twiml = new twilio.twiml.MessagingResponse();

  try {
    const parsed = parseTwilioBody(req.body);
    const phoneHash = hashPhone(parsed.from);

    // Rate limit
    const rateCheck = await checkRateLimit(phoneHash);
    if (!rateCheck.allowed) {
      const lang = detectLanguage(parsed.text);
      twiml.message(messages.t('RATE_LIMITED', lang));
      return res.type('text/xml').send(twiml.toString());
    }

    let text = parsed.text;
    const location = parsed.location || parseLocation(req.body);

    // Handle voice message
    if (parsed.hasMedia && parsed.mediaType?.startsWith('audio/')) {
      const lang = detectLanguage(text);
      twiml.message(messages.t('VOICE_RECEIVED', lang));
      res.type('text/xml').send(twiml.toString());

      // Async transcription + response
      transcribeAudio(parsed.mediaUrl).then(async (transcribed) => {
        const replyText = transcribed
          ? await processIntent(transcribed, phoneHash, location)
          : messages.t('MENU', lang);
        await sendMessage(parsed.from, replyText);
      }).catch(() => {});
      return;
    }

    // Process text intent
    const response = await processIntent(text, phoneHash, location);
    twiml.message(response);
    return res.type('text/xml').send(twiml.toString());
  } catch (err) {
    console.error(sanitizeLogs(`Webhook error: ${err.message}`));
    twiml.message(messages.t('ERROR_SHEETS_DOWN', 'en'));
    return res.type('text/xml').send(twiml.toString());
  }
});

async function processIntent(text, phoneHash, location) {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Universal menu/cancel triggers — work in any state, any language.
  // Checked first so "0"/"retour" always escape any flow.
  if (['0', 'menu', 'قائمة', 'retour'].includes(lower)) {
    const lang = (await kv.get(`lang:${phoneHash}`)) || 'ar';
    await kv.del(`aid:${phoneHash}`).catch(() => {});
    return messages.t('MENU', lang);
  }

  // Active aid flow — free-text replies (name, zone, need) must not be misrouted.
  const aidState = await kv.get(`aid:${phoneHash}`);
  if (aidState) {
    const sessionLang = aidState.lang || 'ar';
    const result = await handleAid({ phoneHash, text, lang: sessionLang });
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

  // Onboarding — new users have no stored lang.
  const storedLang = await kv.get(`lang:${phoneHash}`);
  if (storedLang === null) {
    const onboarding = await kv.get(`onboarding:${phoneHash}`);
    if (onboarding) {
      const langMap = { '1': 'ar', '2': 'en', '3': 'fr' };
      const chosen = langMap[trimmed];
      if (chosen) {
        await Promise.all([
          kv.set(`lang:${phoneHash}`, chosen), // no TTL — permanent preference
          kv.del(`onboarding:${phoneHash}`),
        ]);
        return messages.t('MENU', chosen);
      }
    }
    // New user or invalid choice — show trilingue onboarding
    await kv.set(`onboarding:${phoneHash}`, true, { ex: 3600 });
    return messages.t('ONBOARDING', 'ar');
  }

  // Known user — resolve effective lang for this message.
  const DIGIT_ONLY = /^[1-5]$/.test(trimmed);
  let lang;
  if (DIGIT_ONLY) {
    lang = storedLang; // already fetched above
  } else {
    lang = detectLanguage(text);
    kv.set(`lang:${phoneHash}`, lang).catch(() => {});
  }

  const { intent, zone } = detectIntent(text);

  switch (intent) {
    case 'shelter': {
      const result = await handleShelter({ zone, location });
      if (result.error) return messages.t('EMERGENCY_FALLBACK', lang);
      if (result.shelters.length === 0) return messages.t('NO_RESULTS', lang);
      let msg = result.shelters.map(s => messages.formatShelterResult(s, s.distance, lang)).join('\n\n');
      if (result.stale) msg = messages.formatStaleWarning(result.cachedAt, lang) + '\n\n' + msg;
      return msg;
    }
    case 'evacuation': {
      const result = await handleEvacuation({ zone });
      if (result.error) return messages.t('EMERGENCY_FALLBACK', lang);
      if (result.evacuations.length === 0) return zone ? messages.t('NO_RESULTS', lang) : messages.t('NO_EVACUATIONS', lang);
      let msg = result.evacuations.map(e => messages.formatEvacuationResult(e, lang)).join('\n\n');
      if (result.stale) msg = messages.formatStaleWarning(result.cachedAt, lang) + '\n\n' + msg;
      return msg;
    }
    case 'medical': {
      const result = await handleMedical({ zone, location });
      if (result.error) return messages.t('EMERGENCY_FALLBACK', lang);
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
      if (result.error) return messages.t('EMERGENCY_FALLBACK', lang);
      return result.steps.map(s => messages.formatRegistrationStep(s, lang)).join('\n\n');
    }
    default:
      return messages.t('MENU', lang);
  }
}

module.exports = app;
