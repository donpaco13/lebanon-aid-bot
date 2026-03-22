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
  let phoneHash = null;

  try {
    const parsed = parseTwilioBody(req.body);
    phoneHash = hashPhone(parsed.from);

    // Bug 3 fix: universal commands always bypass rate limiting so users are never locked out.
    const BYPASS_RATE_LIMIT = new Set(['0', 'menu', 'قائمة', 'retour', 'reset', 'langue', 'language', 'لغة', 'english', 'français', 'francais']);
    const trimmedLower = (parsed.text || '').trim().toLowerCase();

    // Rate limit
    const rateCheck = await checkRateLimit(phoneHash);
    if (!rateCheck.allowed && !BYPASS_RATE_LIMIT.has(trimmedLower)) {
      // Bug 2 fix: use stored lang (not detectLanguage) for the rate-limit message.
      const lang = (await kv.get(`lang:${phoneHash}`)) || 'ar';
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
    const errLang = (await kv.get(`lang:${phoneHash}`).catch(() => null)) || 'ar';
    twiml.message(messages.t('ERROR_SHEETS_DOWN', errLang));
    return res.type('text/xml').send(twiml.toString());
  }
});

// Returns [responseText, lang] — lang is null for ONBOARDING (no footer shown).
async function _processIntentInner(text, phoneHash, location) {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // 0. Onboarding has ABSOLUTE priority — checked before universal triggers so that
  //    "1/2/3" during onboarding are always language selections, not menu inputs.
  const onboarding = await kv.get(`onboarding:${phoneHash}`);
  if (onboarding) {
    const langMap = { '1': 'ar', '2': 'en', '3': 'fr' };
    const chosen = langMap[trimmed];
    if (chosen) {
      await Promise.all([
        kv.set(`lang:${phoneHash}`, chosen), // no TTL — permanent preference
        kv.del(`onboarding:${phoneHash}`),
      ]);
      return [messages.t('MENU', chosen), chosen];
    }
    // Any other input during onboarding (including "0") → repeat onboarding
    await kv.set(`onboarding:${phoneHash}`, true, { ex: 3600 });
    return [messages.t('ONBOARDING', 'ar'), null];
  }

  // 1. Universal menu/cancel triggers — escape any flow in any language.
  if (['0', 'menu', 'قائمة', 'retour'].includes(lower)) {
    const lang = (await kv.get(`lang:${phoneHash}`)) || 'ar';
    await kv.del(`aid:${phoneHash}`).catch(() => {});
    return [messages.t('MENU', lang), lang];
  }

  // 2. Direct language switch — works from any state, no onboarding required.
  const LANG_SWITCH = { english: 'en', 'français': 'fr', francais: 'fr' };
  if (LANG_SWITCH[lower]) {
    const lang = LANG_SWITCH[lower];
    await kv.set(`lang:${phoneHash}`, lang);
    await kv.del(`aid:${phoneHash}`).catch(() => {});
    return [messages.t('MENU', lang), lang];
  }

  // 3. Language reset — relaunches trilingue onboarding and clears stored lang.
  if (['langue', 'language', 'لغة'].includes(lower)) {
    await Promise.all([
      kv.del(`lang:${phoneHash}`),
      kv.del(`onboarding:${phoneHash}`),
      kv.del(`aid:${phoneHash}`),
    ]).catch(() => {});
    await kv.set(`onboarding:${phoneHash}`, true, { ex: 3600 });
    return [messages.t('ONBOARDING', 'ar'), null];
  }

  // 4. Dev reset — clears all state to retest onboarding from scratch.
  if (lower === 'reset') {
    await Promise.all([
      kv.del(`lang:${phoneHash}`),
      kv.del(`onboarding:${phoneHash}`),
      kv.del(`aid:${phoneHash}`),
    ]).catch(() => {});
    return [messages.t('ONBOARDING', 'ar'), null];
  }

  // 6. Active aid flow — free-text (name, zone, need) must not be misrouted.
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
    return [result.reply, sessionLang];
  }

  // 7. New user — no stored lang → start onboarding.
  const storedLang = await kv.get(`lang:${phoneHash}`);
  if (storedLang == null) {
    await kv.set(`onboarding:${phoneHash}`, true, { ex: 3600 });
    return [messages.t('ONBOARDING', 'ar'), null];
  }

  // 8. Known user — resolve effective lang and route to feature.
  const DIGIT_ONLY = /^[1-5]$/.test(trimmed);
  let lang;
  if (DIGIT_ONLY) {
    lang = storedLang;
  } else {
    lang = detectLanguage(text);
    kv.set(`lang:${phoneHash}`, lang).catch(() => {});
  }

  const { intent, zone } = detectIntent(text);

  switch (intent) {
    case 'shelter': {
      const result = await handleShelter({ zone, location });
      if (result.error) return [messages.t('EMERGENCY_FALLBACK', lang), lang];
      if (result.shelters.length === 0) return [messages.t('NO_RESULTS', lang), lang];
      let msg = result.shelters.map(s => messages.formatShelterResult(s, s.distance, lang)).join('\n\n');
      if (result.stale) msg = messages.formatStaleWarning(result.cachedAt, lang) + '\n\n' + msg;
      return [msg, lang];
    }
    case 'evacuation': {
      const result = await handleEvacuation({ zone });
      if (result.error) return [messages.t('EMERGENCY_FALLBACK', lang), lang];
      if (result.evacuations.length === 0) return [zone ? messages.t('NO_RESULTS', lang) : messages.t('NO_EVACUATIONS', lang), lang];
      let msg = result.evacuations.map(e => messages.formatEvacuationResult(e, lang)).join('\n\n');
      if (result.stale) msg = messages.formatStaleWarning(result.cachedAt, lang) + '\n\n' + msg;
      return [msg, lang];
    }
    case 'medical': {
      const result = await handleMedical({ zone, location });
      if (result.error) return [messages.t('EMERGENCY_FALLBACK', lang), lang];
      if (result.facilities.length === 0) return [messages.t('NO_RESULTS', lang), lang];
      let msg = result.facilities.map(f => messages.formatMedicalResult(f, f.distance, lang)).join('\n\n');
      if (result.stale) msg = messages.formatStaleWarning(result.cachedAt, lang) + '\n\n' + msg;
      return [msg, lang];
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
      return [result.reply, lang];
    }
    case 'registration': {
      const result = await handleRegistration();
      if (result.error) return [messages.t('EMERGENCY_FALLBACK', lang), lang];
      return [result.steps.map(s => messages.formatRegistrationStep(s, lang)).join('\n\n'), lang];
    }
    default:
      return [messages.t('MENU', lang), lang];
  }
}

// Appends NAV_FOOTER to all responses except ONBOARDING (lang === null).
async function processIntent(text, phoneHash, location) {
  const [response, lang] = await _processIntentInner(text, phoneHash, location);
  if (!lang) return response;
  return response + '\n\n' + messages.t('NAV_FOOTER', lang);
}

module.exports = app;
