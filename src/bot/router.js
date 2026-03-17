// src/bot/router.js
const { normalizeZone, ARABIC_TO_TOKEN } = require('../utils/arabic');

const INTENT_KEYWORDS = {
  shelter: ['ملجأ', 'مأوى', 'محل نام', 'وين نام', 'ملاجئ', 'shelter', 'abri'],
  evacuation: ['إخلاء', 'هرب', 'طلعوا', 'خطر', 'اخلاء', 'evacuate', 'evacuation', 'évacuation'],
  medical: ['مستشفى', 'طبيب', 'دوا', 'جريح', 'إسعاف', 'مستشفيات', 'دكتور', 'hospital', 'doctor', 'medicine', 'hôpital', 'médecin', 'hopital', 'medecin'],
  aid: ['أكل', 'حرام', 'بطانية', 'مساعدة', 'فرشات', 'حرامات', 'food', 'blanket', 'help', 'nourriture', 'couverture', 'aide', 'besoin'],
  registration: ['تسجيل', 'ورق', 'نازح', 'اتسجل', 'نازحين', 'register', 'displaced', 'enregistrer'],
};

const MENU_NUMBERS = { '1': 'shelter', '2': 'evacuation', '3': 'medical', '4': 'aid', '5': 'registration' };

const MENU_TRIGGERS = ['رجعني', 'رجّعني', 'menu', 'قائمة', 'ابدا', 'ابدأ'];

function detectIntent(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return { intent: 'menu', zone: null };

  // Check menu number
  if (MENU_NUMBERS[trimmed]) {
    return { intent: MENU_NUMBERS[trimmed], zone: null };
  }

  // Check menu triggers
  if (MENU_TRIGGERS.some(t => trimmed.includes(t))) {
    return { intent: 'menu', zone: null };
  }

  // Check intent keywords
  let detectedIntent = null;
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (keywords.some(kw => trimmed.includes(kw))) {
      detectedIntent = intent;
      break;
    }
  }

  // Try to extract zone from text
  let zone = null;
  for (const arabicZone of Object.keys(ARABIC_TO_TOKEN)) {
    if (trimmed.includes(arabicZone)) {
      zone = ARABIC_TO_TOKEN[arabicZone];
      break;
    }
  }

  // If no zone found from Arabic, try normalized match
  if (!zone) {
    const words = trimmed.split(/\s+/);
    for (const word of words) {
      const normalized = normalizeZone(word);
      if (normalized !== word.toLowerCase() && normalized !== word) {
        zone = normalized;
        break;
      }
    }
  }

  if (detectedIntent) {
    return { intent: detectedIntent, zone };
  }

  // If only zone detected, default to shelter
  if (zone) {
    return { intent: 'shelter', zone };
  }

  return { intent: 'menu', zone: null };
}

module.exports = { detectIntent, INTENT_KEYWORDS, MENU_NUMBERS };
