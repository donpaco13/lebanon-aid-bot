// src/services/notifier.js
const sheets = require('./sheets');
const { sendMessage } = require('./twilio');

async function notifyVolunteers({ ticket, name, zone, need }) {
  try {
    const volunteers = await sheets.fetchSheet('volunteers');
    const onDuty = volunteers.filter(v => v.on_duty === 'true' || v.on_duty === true);

    const message = `🆘 طلب مساعدة جديد\n` +
      `📋 رقم: ${ticket}\n` +
      `👤 الاسم: ${name}\n` +
      `📍 المنطقة: ${zone}\n` +
      `❓ الحاجة: ${need}`;

    await Promise.allSettled(
      onDuty.map(v => sendMessage(v.phone, message))
    );
  } catch {
    // Non-fatal — volunteer notification failure must not crash the bot
  }
}

module.exports = { notifyVolunteers };
