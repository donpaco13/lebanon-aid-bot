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
  // Fix 2+3: check for active aid flow BEFORE intent detection so free-text replies
  // (name, zone, need) are not misrouted to the menu.
  const aidState = await kv.get(`aid:${phoneHash}`);
  if (aidState) {
    const sessionLang = aidState.lang || 'en';
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

  const lang = detectLanguage(text);
  const { intent, zone } = detectIntent(text);

  switch (intent) {
    case 'shelter': {
      const result = await handleShelter({ zone, location });
      // Fix 1: show emergency numbers instead of generic error when data unavailable
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
