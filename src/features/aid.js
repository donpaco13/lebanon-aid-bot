// src/features/aid.js
const { kv } = require('@vercel/kv');
const sheets = require('../services/sheets');
const { t } = require('../bot/messages');

const STATE_TTL = 600;

const NEED_MAP = {
  ar: { '1': 'أكل', '2': 'فرشات / حرامات', '3': 'دوا', '4': 'شي تاني' },
  en: { '1': 'Food', '2': 'Blankets', '3': 'Medicine', '4': 'Other' },
  fr: { '1': 'Nourriture', '2': 'Couvertures', '3': 'Médicaments', '4': 'Autre' },
};

function generateTicket() {
  return 'AID-' + Date.now().toString(36).toUpperCase();
}

async function handleAid({ phoneHash, text, lang = 'en' }) {
  const stateKey = `aid:${phoneHash}`;
  const state = await kv.get(stateKey);

  if (!state) {
    await kv.set(stateKey, { step: 'ask_name', lang }, { ex: STATE_TTL });
    return { reply: t('AID_ASK_NAME', lang) };
  }

  // Use stored lang for consistency across the flow
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
    const needMap = NEED_MAP[sessionLang] ?? NEED_MAP.en;
    const need = needMap[text.trim()] || text.trim();
    const ticket = generateTicket();
    const now = new Date().toISOString();

    await sheets.appendRow('aid_requests', {
      ticket, name, zone, need,
      phone_hash: phoneHash,
      submitted_at: now,
      notified_at: '',
      status: 'pending',
    });

    await kv.del(stateKey);
    return {
      reply: t('AID_CONFIRMED', sessionLang, ticket),
      notifyVolunteer: true,
      ticketData: { ticket, name, zone, needType: need },
    };
  }

  await kv.set(stateKey, { step: 'ask_name', lang: sessionLang }, { ex: STATE_TTL });
  return { reply: t('AID_ASK_NAME', sessionLang) };
}

module.exports = { handleAid };
