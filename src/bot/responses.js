// src/bot/responses.js

const MENU = `أهلا 👋
أنا بوت المساعدة للنازحين بلبنان.
بعتلي رقم أو صوت:

1️⃣ ملاجئ قريبة
2️⃣ تحذيرات إخلاء
3️⃣ مستشفيات شغّالة
4️⃣ طلب مساعدة (أكل، فرشات، دوا)
5️⃣ تسجيل كنازح

أو ابعتلي موقعك 📍 لألاقيلك أقرب ملجأ.`;

const VOICE_RECEIVED = 'بعتلي صوت، عم بسمعو... 🎧';

const ERROR_SHEETS_DOWN = '⚠️ ما منقدر نوصل للمعلومات هلق. جرّب بعد شوي.';

const ERROR_UNKNOWN = 'ما فهمت شو بدك. ابعتلي رقم من 1 لـ 5 أو صوت.';

const NO_RESULTS = 'ما لقيت نتائج لهيدي المنطقة. جرّب اسم تاني أو ابعتلي موقعك 📍';

const AID_ASK_NAME = 'شو اسمك؟';
const AID_ASK_ZONE = 'وين موجود/ة؟ (اسم المنطقة)';
const AID_ASK_NEED = `شو محتاج/ة؟
1️⃣ أكل
2️⃣ فرشات / حرامات
3️⃣ دوا
4️⃣ شي تاني`;
const AID_CONFIRMED = (ticket) => `✅ تم تسجيل طلبك — رقم التذكرة: ${ticket}\nرح يتواصل معك متطوع بأقرب وقت.`;

const RATE_LIMITED = '⚠️ عم تبعت كتير رسائل. استنى شوي وجرّب بعدين.';

function formatStaleWarning(cachedAt) {
  const date = new Date(cachedAt);
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const time = `${hh}:${mm}`;
  return `⚠️ هيدي المعلومات تحققنا منها آخر مرة الساعة ${time}`;
}

function formatShelterResult(shelter, distance) {
  let msg = `🏠 ${shelter.name_ar}\n📍 ${shelter.address_ar || ''}`;
  if (shelter.available_spots) msg += `\n🛏️ أماكن متاحة: ${shelter.available_spots}`;
  if (distance !== undefined) msg += `\n📏 ${distance} كم`;
  return msg;
}

function formatEvacuationResult(evac) {
  const statusEmoji = evac.status === 'active' ? '🔴' : '🟢';
  let msg = `${statusEmoji} ${evac.zone}: ${evac.status === 'active' ? 'إخلاء فوري' : 'الوضع مستقر'}`;
  if (evac.direction_ar) msg += `\n➡️ ${evac.direction_ar}`;
  return msg;
}

function formatMedicalResult(facility, distance) {
  const statusMap = { operational: '🟢 شغّال', limited: '🟡 محدود', closed: '🔴 مسكّر', destroyed: '⛔ مدمّر' };
  let msg = `🏥 ${facility.name_ar}\n${statusMap[facility.status] || facility.status}`;
  if (facility.address_ar) msg += `\n📍 ${facility.address_ar}`;
  if (distance !== undefined) msg += `\n📏 ${distance} كم`;
  if (facility.last_verified_at) {
    const date = new Date(facility.last_verified_at);
    const time = date.toLocaleTimeString('ar-LB', { hour: '2-digit', minute: '2-digit', hour12: false });
    msg += `\n⚠️ آخر تحقق: ${time}`;
  }
  return msg;
}

function formatRegistrationStep(step) {
  let msg = `📋 خطوة ${step.step}: ${step.text_ar}`;
  if (step.documents_ar) msg += `\n📄 المستندات: ${step.documents_ar}`;
  if (step.link) msg += `\n🔗 ${step.link}`;
  return msg;
}

module.exports = {
  MENU, VOICE_RECEIVED, ERROR_SHEETS_DOWN, ERROR_UNKNOWN, NO_RESULTS,
  AID_ASK_NAME, AID_ASK_ZONE, AID_ASK_NEED, AID_CONFIRMED,
  RATE_LIMITED,
  formatStaleWarning, formatShelterResult, formatEvacuationResult,
  formatMedicalResult, formatRegistrationStep,
};
