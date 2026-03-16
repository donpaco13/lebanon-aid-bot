// src/scraper/scheduler.js
const { scrapeOCHA } = require('./ocha');
const sheets = require('../services/sheets');

async function run() {
  const result = { ochaCount: 0 };

  // Load existing scraped entries to deduplicate
  let existing = [];
  try {
    existing = await sheets.fetchSheet('scraped_data');
  } catch {
    // Continue even if sheet read fails
  }
  const existingIds = new Set(existing.map(r => r.source_id).filter(Boolean));

  // Run OCHA scraper
  const ochaItems = await scrapeOCHA().catch(() => []);

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
