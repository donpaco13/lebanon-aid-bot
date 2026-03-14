// api/webhook.js
const express = require('express');
const twilio = require('twilio');
const { parseTwilioBody, sendMessage } = require('../src/services/twilio');
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
const responses = require('../src/bot/responses');
const { parseLocation } = require('../src/services/geo');

const app = express();
app.use(express.urlencoded({ extended: false }));

app.post('/api/webhook', async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();

  try {
    const parsed = parseTwilioBody(req.body);
    const phoneHash = hashPhone(parsed.from);

    // Rate limit
    const rateCheck = await checkRateLimit(phoneHash);
    if (!rateCheck.allowed) {
      twiml.message(responses.RATE_LIMITED);
      return res.type('text/xml').send(twiml.toString());
    }

    let text = parsed.text;
    const location = parsed.location || parseLocation(req.body);

    // Handle voice message
    if (parsed.hasMedia && parsed.mediaType?.startsWith('audio/')) {
      twiml.message(responses.VOICE_RECEIVED);
      res.type('text/xml').send(twiml.toString());

      // Async transcription + response
      transcribeAudio(parsed.mediaUrl).then(async (transcribed) => {
        const replyText = transcribed
          ? await processIntent(transcribed, parsed.from, location)
          : responses.MENU;
        await sendMessage(parsed.from, replyText);
      }).catch(() => {});
      return;
    }

    // Process text intent
    const response = await processIntent(text, parsed.from, location);
    twiml.message(response);
    return res.type('text/xml').send(twiml.toString());
  } catch (err) {
    console.error(sanitizeLogs(`Webhook error: ${err.message}`));
    twiml.message(responses.ERROR_SHEETS_DOWN);
    return res.type('text/xml').send(twiml.toString());
  }
});

async function processIntent(text, from, location) {
  const { intent, zone } = detectIntent(text);

  switch (intent) {
    case 'shelter': {
      const result = await handleShelter({ zone, location });
      if (result.error) return responses.ERROR_SHEETS_DOWN;
      if (result.shelters.length === 0) return responses.NO_RESULTS;
      let msg = result.shelters.map(s => responses.formatShelterResult(s, s.distance)).join('\n\n');
      if (result.stale) msg = responses.formatStaleWarning(result.cachedAt) + '\n\n' + msg;
      return msg;
    }
    case 'evacuation': {
      const result = await handleEvacuation({ zone });
      if (result.error) return responses.ERROR_SHEETS_DOWN;
      if (result.evacuations.length === 0) return zone ? responses.NO_RESULTS : 'ما في تحذيرات إخلاء حاليًا ✅';
      let msg = result.evacuations.map(e => responses.formatEvacuationResult(e)).join('\n\n');
      if (result.stale) msg = responses.formatStaleWarning(result.cachedAt) + '\n\n' + msg;
      return msg;
    }
    case 'medical': {
      const result = await handleMedical({ zone, location });
      if (result.error) return responses.ERROR_SHEETS_DOWN;
      if (result.facilities.length === 0) return responses.NO_RESULTS;
      let msg = result.facilities.map(f => responses.formatMedicalResult(f, f.distance)).join('\n\n');
      if (result.stale) msg = responses.formatStaleWarning(result.cachedAt) + '\n\n' + msg;
      return msg;
    }
    case 'aid': {
      const result = await handleAid({ from, text });
      if (result.notifyVolunteer && result.ticketData) {
        notifyVolunteers({
          ticket: result.ticketData.ticket,
          name: result.ticketData.name || '',
          zone: result.ticketData.zone || '',
          need: result.ticketData.needType || '',
        }).catch(() => {});
      }
      return result.response;
    }
    case 'registration': {
      const result = await handleRegistration();
      if (result.error) return responses.ERROR_SHEETS_DOWN;
      return result.steps.map(s => responses.formatRegistrationStep(s)).join('\n\n');
    }
    default:
      return responses.MENU;
  }
}

module.exports = app;
