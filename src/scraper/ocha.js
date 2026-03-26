// src/scraper/ocha.js
const logger = require('../utils/logger');

const OCHA_API =
  'https://api.reliefweb.int/v1/reports' +
  '?appname=hatem-lebanonaidbot-tl2hx' +
  '&filter[operator]=AND' +
  '&filter[conditions][0][field]=country.iso3' +
  '&filter[conditions][0][value]=LBN' +
  '&filter[conditions][1][operator]=OR' +
  '&filter[conditions][1][conditions][0][field]=source.shortname' +
  '&filter[conditions][1][conditions][0][value]=OCHA' +
  '&filter[conditions][1][conditions][1][field]=source.shortname' +
  '&filter[conditions][1][conditions][1][value]=UNHCR' +
  '&filter[conditions][1][conditions][2][field]=source.shortname' +
  '&filter[conditions][1][conditions][2][value]=WFP' +
  '&sort[]=date:desc' +
  '&limit=10' +
  '&fields[include][]=title' +
  '&fields[include][]=date' +
  '&fields[include][]=body' +
  '&fields[include][]=url';

async function scrapeOCHA() {
  try {
    const response = await fetch(OCHA_API);

    if (!response.ok) {
      logger.warn('ReliefWeb API non-OK response', {
        status: response.status,
        statusText: response.statusText,
        url: OCHA_API,
      });
      return [];
    }

    const data = await response.json();
    if (!data.data || !Array.isArray(data.data)) return [];

    return data.data.map(item => ({
      source_id: String(item.id),
      title: item.fields.title || '',
      text: item.fields.body || '',
      date: item.fields.date?.original || new Date().toISOString(),
      scraped_source: item.fields.url || 'reliefweb.int',
      auto_scraped: 'TRUE',
      needs_review: 'TRUE',
    }));
  } catch (err) {
    logger.error('ReliefWeb scraper failed', { error: err.message });
    return [];
  }
}

module.exports = { scrapeOCHA };
