// src/scraper/scheduler.js
const { scrapeTelegram } = require('./telegram');
const { scrapeOCHA } = require('./ocha');
const sheets = require('../services/sheets');

async function run() {
  const result = { telegramCount: 0, ochaCount: 0 };

  // Load existing scraped entries to deduplicate
  let existing = [];
  try {
    existing = await sheets.fetchSheet('scraped_data');
  } catch {
    // Continue even if sheet read fails
  }
  const existingIds = new Set(existing.map(r => r.source_id).filter(Boolean));

  // Run scrapers
  const [telegramItems, ochaItems] = await Promise.all([
    scrapeTelegram().catch(() => []),
    scrapeOCHA().catch(() => []),
  ]);

  // Append new Telegram items
  for (const item of telegramItems) {
    if (!existingIds.has(item.source_id)) {
      try {
        await sheets.appendRow('scraped_data', item);
        result.telegramCount++;
      } catch {
        // Non-fatal
      }
    }
  }

  // Append new OCHA items
  for (const item of ochaItems) {
    if (!existingIds.has(item.source_id)) {
      try {
        await sheets.appendRow('scraped_data', item);
        result.ochaCount++;
      } catch {
        // Non-fatal
      }
    }
  }

  return result;
}

module.exports = { run };
