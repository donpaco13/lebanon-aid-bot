// src/scraper/telegram.js
const { normalizeZone } = require('../utils/arabic');

const CHANNEL_USERNAME = process.env.TELEGRAM_CHANNEL || '@IDFSpokespersonArabic';

async function scrapeTelegram() {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    const url = `https://api.telegram.org/bot${token}/getUpdates?limit=50&allowed_updates=channel_post`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    if (!data.ok) return [];

    const messages = data.result
      .map(u => u.channel_post || u.message)
      .filter(Boolean);

    return messages.map(msg => ({
      source_id: String(msg.message_id),
      text: msg.text || '',
      date: new Date(msg.date * 1000).toISOString(),
      scraped_source: CHANNEL_USERNAME,
      zone_normalized: extractZone(msg.text || ''),
      auto_scraped: 'TRUE',
      needs_review: 'TRUE',
    }));
  } catch {
    return [];
  }
}

function extractZone(text) {
  // Try to extract zone names from Arabic text
  const words = text.split(/\s+/);
  for (const word of words) {
    const normalized = normalizeZone(word);
    if (normalized && normalized !== word.toLowerCase()) {
      return normalized;
    }
  }
  return '';
}

module.exports = { scrapeTelegram };
