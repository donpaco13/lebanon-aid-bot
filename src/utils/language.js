// src/utils/language.js

const ARABIC_RANGE = /[\u0600-\u06FF]/;

const FR_KEYWORDS = [
  'bonjour', 'aide', 'besoin', 'abri', 'évacuation', 'evacuation',
  'médecin', 'medecin', 'nourriture', 'couverture', 'hôpital', 'hopital',
];

const EN_KEYWORDS = [
  'shelter', 'help', 'need', 'food', 'hospital', 'evacuate', 'evacuation',
  'blanket', 'doctor', 'medicine', 'register',
];

function detectLanguage(text) {
  if (!text) return 'en';
  if (ARABIC_RANGE.test(text)) return 'ar';
  const lower = text.toLowerCase();
  if (FR_KEYWORDS.some(kw => lower.includes(kw))) return 'fr';
  if (EN_KEYWORDS.some(kw => lower.includes(kw))) return 'en';
  return 'en';
}

module.exports = { detectLanguage };
