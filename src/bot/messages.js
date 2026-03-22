// src/bot/messages.js

const STRINGS = {
  MENU: {
    ar: `أهلا 👋
أنا بوت المساعدة للنازحين بلبنان.
بعتلي رقم أو صوت:

1️⃣ ملاجئ قريبة
2️⃣ تحذيرات إخلاء
3️⃣ مستشفيات شغّالة
4️⃣ طلب مساعدة (أكل، فرشات، دوا)
5️⃣ تسجيل كنازح

أو ابعتلي موقعك 📍 لألاقيلك أقرب ملجأ.`,
    en: `Hello 👋
I'm a humanitarian aid bot for displaced people in Lebanon.
Send a number or voice message:

1️⃣ Nearby shelters
2️⃣ Evacuation warnings
3️⃣ Operating hospitals
4️⃣ Request aid (food, blankets, medicine)
5️⃣ Register as displaced

Or send your location 📍 to find the nearest shelter.`,
    fr: `Bonjour 👋
Je suis un bot d'aide humanitaire pour les déplacés au Liban.
Envoyez un numéro ou un message vocal :

1️⃣ Abris proches
2️⃣ Avertissements d'évacuation
3️⃣ Hôpitaux en service
4️⃣ Demander de l'aide (nourriture, couvertures, médicaments)
5️⃣ S'enregistrer comme déplacé

Ou envoyez votre position 📍 pour trouver l'abri le plus proche.`,
  },
  VOICE_RECEIVED: {
    ar: 'بعتلي صوت، عم بسمعو... 🎧',
    en: 'Voice message received, processing... 🎧',
    fr: 'Message vocal reçu, traitement en cours... 🎧',
  },
  ERROR_SHEETS_DOWN: {
    ar: '⚠️ ما منقدر نوصل للمعلومات هلق. جرّب بعد شوي.',
    en: '⚠️ Unable to retrieve information right now. Please try again shortly.',
    fr: "⚠️ Impossible d'accéder aux informations pour le moment. Réessayez dans un instant.",
  },
  ERROR_UNKNOWN: {
    ar: 'ما فهمت شو بدك. ابعتلي رقم من 1 لـ 5 أو صوت.',
    en: "I didn't understand that. Send a number from 1 to 5 or a voice message.",
    fr: "Je n'ai pas compris. Envoyez un numéro de 1 à 5 ou un message vocal.",
  },
  NO_RESULTS: {
    ar: 'ما لقيت نتائج لهيدي المنطقة. جرّب اسم تاني أو ابعتلي موقعك 📍',
    en: 'No results found for this area. Try a different name or send your location 📍',
    fr: 'Aucun résultat pour cette zone. Essayez un autre nom ou envoyez votre position 📍',
  },
  NO_EVACUATIONS: {
    ar: 'ما في تحذيرات إخلاء حاليًا ✅',
    en: 'No evacuation warnings at this time ✅',
    fr: "Aucun avertissement d'évacuation en ce moment ✅",
  },
  AID_ASK_NAME: {
    ar: 'شو اسمك؟',
    en: 'What is your name?',
    fr: 'Quel est votre prénom ?',
  },
  AID_ASK_ZONE: {
    ar: 'وين موجود/ة؟ (اسم المنطقة)',
    en: 'Where are you located? (area name)',
    fr: 'Où êtes-vous ? (nom de la zone)',
  },
  AID_ASK_NEED: {
    ar: `شو محتاج/ة؟
1️⃣ أكل
2️⃣ فرشات / حرامات
3️⃣ دوا
4️⃣ شي تاني`,
    en: `What do you need?
1️⃣ Food
2️⃣ Blankets
3️⃣ Medicine
4️⃣ Something else`,
    fr: `De quoi avez-vous besoin ?
1️⃣ Nourriture
2️⃣ Couvertures
3️⃣ Médicaments
4️⃣ Autre chose`,
  },
  AID_CONFIRMED: {
    ar: (ticket) => `✅ تم تسجيل طلبك — رقم التذكرة: ${ticket}\nرح يتواصل معك متطوع بأقرب وقت.`,
    en: (ticket) => `✅ Your request has been registered — ticket: ${ticket}\nA volunteer will contact you shortly.`,
    fr: (ticket) => `✅ Votre demande a été enregistrée — ticket : ${ticket}\nUn bénévole vous contactera dès que possible.`,
  },
  EMERGENCY_FALLBACK: {
    ar: `⚠️ قاعدة البيانات عم تتحمّل. إتصل هلق بهيدي الأرقام:

🔴 الصليب الأحمر اللبناني (24/7): 140
🚒 الدفاع المدني: 125
👮 الشرطة: 112
🔥 إطفاء الحرائق: 175
🇺🇳 UNHCR تسجيل (إثنين-جمعة 8-17): 04726111
🌾 WFP غذاء (إثنين-سبت 8-19): 1526`,
    en: `⚠️ Detailed data is loading. Call these numbers now:

🔴 Lebanese Red Cross (24/7): 140
🚒 Civil Defence: 125
👮 Police: 112
🔥 Firefighters: 175
🇺🇳 UNHCR registration (Mon-Fri 8am-5pm): 04726111
🌾 WFP food aid (Mon-Sat 8am-7pm): 1526`,
    fr: `⚠️ Les données détaillées sont en cours de chargement. Appelez ces numéros maintenant :

🔴 Croix-Rouge Libanaise (24h/7j) : 140
🚒 Défense Civile : 125
👮 Police : 112
🔥 Pompiers : 175
🇺🇳 UNHCR enregistrement (lun-ven 8h-17h) : 04726111
🌾 WFP aide alimentaire (lun-sam 8h-19h) : 1526`,
  },
  RATE_LIMITED: {
    ar: '⚠️ عم تبعت كتير رسائل. استنى شوي وجرّب بعدين.',
    en: '⚠️ You are sending too many messages. Please wait a moment and try again.',
    fr: '⚠️ Vous envoyez trop de messages. Attendez un moment et réessayez.',
  },
};

function t(key, lang, ...args) {
  const entry = STRINGS[key];
  if (!entry) {
    if (process.env.NODE_ENV !== 'production') throw new Error(`Unknown message key: ${key}`);
    return '';
  }
  const resolved = entry[lang] ?? entry['en'];
  return typeof resolved === 'function' ? resolved(...args) : resolved;
}

// --- Formatters ---

function formatStaleWarning(cachedAt, lang) {
  const date = new Date(cachedAt);
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const time = `${hh}:${mm}`;
  const LABELS = {
    ar: `⚠️ هيدي المعلومات تحققنا منها آخر مرة الساعة ${time} UTC`,
    en: `⚠️ This information was last verified at ${time} UTC`,
    fr: `⚠️ Ces informations ont été vérifiées pour la dernière fois à ${time} UTC`,
  };
  return LABELS[lang] ?? LABELS['en'];
}

function formatShelterResult(shelter, distance, lang) {
  const name = lang === 'ar' ? shelter.name_ar : (shelter[`name_${lang}`] ?? shelter.name_ar);
  const address = lang === 'ar' ? shelter.address_ar : (shelter[`address_${lang}`] ?? shelter.address_ar);
  let msg = `🏠 ${name}\n📍 ${address || ''}`;
  if (shelter.available_spots) {
    const spotsLabel = { ar: 'أماكن متاحة', en: 'Available spots', fr: 'Places disponibles' };
    msg += `\n🛏️ ${spotsLabel[lang] ?? spotsLabel.en}: ${shelter.available_spots}`;
  }
  if (distance !== undefined) msg += `\n📏 ${distance} km`;
  return msg;
}

function formatEvacuationResult(evac, lang) {
  const statusEmoji = evac.status === 'active' ? '🔴' : '🟢';
  const statusLabel = {
    ar: evac.status === 'active' ? 'إخلاء فوري' : 'الوضع مستقر',
    en: evac.status === 'active' ? 'Immediate evacuation' : 'Situation stable',
    fr: evac.status === 'active' ? 'Évacuation immédiate' : 'Situation stable',
  };
  let msg = `${statusEmoji} ${evac.zone}: ${statusLabel[lang] ?? statusLabel.en}`;
  const direction = lang === 'ar' ? evac.direction_ar : (evac[`direction_${lang}`] ?? evac.direction_ar);
  if (direction) msg += `\n➡️ ${direction}`;
  return msg;
}

function formatMedicalResult(facility, distance, lang) {
  const statusMap = {
    ar: { operational: '🟢 شغّال', limited: '🟡 محدود', closed: '🔴 مسكّر', destroyed: '⛔ مدمّر' },
    en: { operational: '🟢 Operational', limited: '🟡 Limited', closed: '🔴 Closed', destroyed: '⛔ Destroyed' },
    fr: { operational: '🟢 En service', limited: '🟡 Limité', closed: '🔴 Fermé', destroyed: '⛔ Détruit' },
  };
  const statuses = statusMap[lang] ?? statusMap.en;
  const name = lang === 'ar' ? facility.name_ar : (facility[`name_${lang}`] ?? facility.name_ar);
  const address = lang === 'ar' ? facility.address_ar : (facility[`address_${lang}`] ?? facility.address_ar);
  let msg = `🏥 ${name}\n${statuses[facility.status] || facility.status}`;
  if (address) msg += `\n📍 ${address}`;
  if (distance !== undefined) msg += `\n📏 ${distance} km`;
  if (facility.last_verified_at) {
    const date = new Date(facility.last_verified_at);
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const time = `${hh}:${mm}`;
    const verifiedLabel = { ar: 'آخر تحقق', en: 'Last verified', fr: 'Dernière vérification' };
    msg += `\n⚠️ ${verifiedLabel[lang] ?? verifiedLabel.en}: ${time}`;
  }
  return msg;
}

function formatRegistrationStep(step, lang) {
  const text = lang === 'ar' ? step.text_ar : (step[`text_${lang}`] ?? step.text_ar);
  const stepLabel = { ar: 'خطوة', en: 'Step', fr: 'Étape' };
  let msg = `📋 ${stepLabel[lang] ?? stepLabel.en} ${step.step}: ${text}`;
  const docs = lang === 'ar' ? step.documents_ar : (step[`documents_${lang}`] ?? step.documents_ar);
  const docsLabel = { ar: 'المستندات', en: 'Documents', fr: 'Documents' };
  if (docs) msg += `\n📄 ${docsLabel[lang] ?? docsLabel.en}: ${docs}`;
  if (step.link) msg += `\n🔗 ${step.link}`;
  return msg;
}

module.exports = {
  t,
  formatStaleWarning,
  formatShelterResult,
  formatEvacuationResult,
  formatMedicalResult,
  formatRegistrationStep,
};
