// src/features/aid.js
const { kv } = require('@vercel/kv');
const sheets = require('../services/sheets');
const responses = require('../bot/responses');

const STATE_TTL = 600; // 10 min in seconds

const NEED_MAP = {
  '1': 'أكل',
  '2': 'فرشات / حرامات',
  '3': 'دوا',
  '4': 'شي تاني',
};

function generateTicket() {
  return 'AID-' + Date.now().toString(36).toUpperCase();
}

async function handleAid({ phoneHash, text }) {
  const stateKey = `aid:${phoneHash}`;
  const state = await kv.get(stateKey);

  // No state: start flow
  if (!state) {
    await kv.set(stateKey, { step: 'ask_name' }, { ex: STATE_TTL });
    return { reply: responses.AID_ASK_NAME };
  }

  const { step, name, zone } = state;

  if (step === 'ask_name') {
    await kv.set(stateKey, { step: 'ask_zone', name: text.trim() }, { ex: STATE_TTL });
    return { reply: responses.AID_ASK_ZONE };
  }

  if (step === 'ask_zone') {
    await kv.set(stateKey, { step: 'ask_need', name, zone: text.trim() }, { ex: STATE_TTL });
    return { reply: responses.AID_ASK_NEED };
  }

  if (step === 'ask_need') {
    const need = NEED_MAP[text.trim()] || text.trim();
    const ticket = generateTicket();
    const now = new Date().toISOString();

    await sheets.appendRow('aid_requests', {
      ticket,
      name,
      zone,
      need,
      phone_hash: phoneHash,
      submitted_at: now,
      notified_at: '',
      status: 'pending',
    });

    await kv.del(stateKey);
    return { reply: responses.AID_CONFIRMED(ticket) };
  }

  // Unknown state — restart
  await kv.set(stateKey, { step: 'ask_name' }, { ex: STATE_TTL });
  return { reply: responses.AID_ASK_NAME };
}

module.exports = { handleAid };
