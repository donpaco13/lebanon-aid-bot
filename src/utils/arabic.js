// src/utils/arabic.js

// Map of Arabic zone names to normalized tokens
const ARABIC_TO_TOKEN = {
  'الحمرا': 'hamra',
  'الحمراء': 'hamra',
  'الضاحية': 'dahiye',
  'الضاحيه': 'dahiye',
  'بعلبك': 'baalbek',
  'صيدا': 'saida',
  'صور': 'tyre',
  'طرابلس': 'tripoli',
  'جونيه': 'jounieh',
  'جبيل': 'jbeil',
  'البقاع': 'bekaa',
  'زحلة': 'zahle',
  'النبطية': 'nabatieh',
  'بنت جبيل': 'bint jbeil',
  'مرجعيون': 'marjayoun',
  'بيروت': 'beirut',
  'الشياح': 'chiyah',
  'برج البراجنة': 'borj barajne',
  'حارة حريك': 'haret hreik',
};

// Map of franco-arabic variants to normalized tokens
const FRANCO_TO_TOKEN = {
  'hamra': 'hamra',
  'el hamra': 'hamra',
  'dahiyeh': 'dahiye',
  'dahieh': 'dahiye',
  'dahiye': 'dahiye',
  'baalbek': 'baalbek',
  'baalbeck': 'baalbek',
  'saida': 'saida',
  'sidon': 'saida',
  'tyre': 'tyre',
  'sour': 'tyre',
  'tripoli': 'tripoli',
  'trablous': 'tripoli',
  'jounieh': 'jounieh',
  'jbeil': 'jbeil',
  'byblos': 'jbeil',
  'bekaa': 'bekaa',
  'beqaa': 'bekaa',
  'zahle': 'zahle',
  'zahleh': 'zahle',
  'nabatieh': 'nabatieh',
  'nabatiyeh': 'nabatieh',
  'bint jbeil': 'bint jbeil',
  'marjayoun': 'marjayoun',
  'beirut': 'beirut',
  'beyrouth': 'beirut',
  'chiyah': 'chiyah',
  'borj barajne': 'borj barajne',
  'haret hreik': 'haret hreik',
};

function removeDiacritics(text) {
  // Remove Arabic diacritics (tashkeel)
  return text.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, '');
}

function normalizeZone(input) {
  if (!input) return '';
  const trimmed = input.trim();
  if (!trimmed) return '';

  // Remove Arabic diacritics
  const noDiacritics = removeDiacritics(trimmed);

  // Try Arabic lookup
  if (ARABIC_TO_TOKEN[noDiacritics]) {
    return ARABIC_TO_TOKEN[noDiacritics];
  }

  // Try franco-arabic lookup (case-insensitive)
  const lower = noDiacritics.toLowerCase();
  if (FRANCO_TO_TOKEN[lower]) {
    return FRANCO_TO_TOKEN[lower];
  }

  // Fallback: return trimmed lowercase
  return lower;
}

module.exports = { normalizeZone, removeDiacritics, ARABIC_TO_TOKEN, FRANCO_TO_TOKEN };
