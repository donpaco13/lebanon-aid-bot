// src/scraper/ocha.js
const OCHA_API = 'https://api.reliefweb.int/v1/reports?appname=lebanon-aid-bot&filter[operator]=AND&filter[conditions][0][field]=country.iso3&filter[conditions][0][value]=LBN&sort[]=date:desc&limit=10&fields[include][]=title&fields[include][]=date&fields[include][]=body&fields[include][]=url';

async function scrapeOCHA() {
  try {
    const response = await fetch(OCHA_API);
    if (!response.ok) return [];

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
  } catch {
    return [];
  }
}

module.exports = { scrapeOCHA };
