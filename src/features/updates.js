// src/features/updates.js
const { fetchSheet } = require('../services/sheets');
const { t } = require('../bot/messages');

const NO_UPDATES = {
  ar: 'لا توجد تحديثات متاحة. تفضّل بزيارة reliefweb.int/lebanon',
  en: 'No updates available. Visit reliefweb.int/lebanon',
  fr: 'Aucune mise à jour disponible. Consultez reliefweb.int/lebanon',
};

function formatDate(dateStr, lang) {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const localeMap = { ar: 'ar-LB', en: 'en-GB', fr: 'fr-FR' };
  try {
    return date.toLocaleDateString(localeMap[lang] || 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

async function handleUpdates({ lang }) {
  try {
    const rows = await fetchSheet('scraped_data');
    const approved = rows.filter(r => r.needs_review === 'FALSE');

    if (approved.length === 0) {
      return { messages: [NO_UPDATES[lang] || NO_UPDATES.en] };
    }

    approved.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    const top3 = approved.slice(0, 3);

    const messages = top3.map(r => {
      const title = r.title || r.titre || '';
      const date = formatDate(r.date || '', lang);
      const url = r.url || r.source_url || r.scraped_source || '';
      return `📰 ${title}\n📅 ${date}${url ? `\n🔗 ${url}` : ''}`.trim();
    });

    return { messages };
  } catch {
    return { messages: [NO_UPDATES[lang] || NO_UPDATES.en] };
  }
}

module.exports = { handleUpdates };
