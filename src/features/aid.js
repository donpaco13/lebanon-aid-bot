// src/features/aid.js
const { kv } = require('@vercel/kv');
const { t } = require('../bot/messages');
const logger = require('../utils/logger');

const STATE_TTL = 600;

const NEED_MAP = {
  ar: { '1': 'أكل', '2': 'فرشات / حرامات', '3': 'دوا', '4': 'شي تاني' },
  en: { '1': 'Food', '2': 'Blankets', '3': 'Medicine', '4': 'Other' },
  fr: { '1': 'Nourriture', '2': 'Couvertures', '3': 'Médicaments', '4': 'Autre' },
};

function generateTicket() {
  return 'AID-' + Date.now().toString(36).toUpperCase();
}

// Accepts "1", "2, 3", "1 2 3", "1,2,3" → deduplicated array of need labels.
// Falls back to raw text if no digit 1-4 is found (free-text entry).
function parseNeeds(text, needMap) {
  const digits = text.match(/[1-4]/g) || [];
  const unique = [...new Set(digits)];
  if (unique.length === 0) return [text.trim()];
  return unique.map(d => needMap[d]).filter(Boolean);
}

async function handleAid({ phoneHash, text, lang = 'ar' }) {
  const stateKey = `aid:${phoneHash}`;
  const state = await kv.get(stateKey);

  if (!state) {
    await kv.set(stateKey, { step: 'ask_name', lang }, { ex: STATE_TTL });
    return { reply: t('AID_ASK_NAME', lang) };
  }

  const sessionLang = state.lang || lang;
  const { step, name, zone } = state;

  if (step === 'ask_name') {
    await kv.set(stateKey, { step: 'ask_zone', name: text.trim(), lang: sessionLang }, { ex: STATE_TTL });
    return { reply: t('AID_ASK_ZONE', sessionLang) };
  }

  if (step === 'ask_zone') {
    await kv.set(stateKey, { step: 'ask_need', name, zone: text.trim(), lang: sessionLang }, { ex: STATE_TTL });
    return { reply: t('AID_ASK_NEED', sessionLang) };
  }

  if (step === 'ask_need') {
    const needMap = NEED_MAP[sessionLang] ?? NEED_MAP.ar;
    const needs = parseNeeds(text, needMap);
    const needLabel = needs.join(', ');
    const ticket = generateTicket();
    const now = new Date().toISOString();

    // Read lang:phoneHash (authoritative preference) — falls back to session lang
    // if the key is missing (e.g. tests or legacy sessions).
    const confirmedLang = (await kv.get(`lang:${phoneHash}`)) || sessionLang;

    logger.info('aid_request_submitted', {
      ticket,
      phoneHash,
      name,
      zone,
      need: needLabel,
      lang: confirmedLang,
      submitted_at: now,
    });

    await kv.del(stateKey);
    return {
      reply: t('AID_CONFIRMED', confirmedLang, ticket),
      notifyVolunteer: true,
      ticketData: { ticket, name, zone, needType: needLabel },
    };
  }

  await kv.set(stateKey, { step: 'ask_name', lang: sessionLang }, { ex: STATE_TTL });
  return { reply: t('AID_ASK_NAME', sessionLang) };
}

module.exports = { handleAid };
