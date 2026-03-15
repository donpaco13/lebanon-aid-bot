# Volunteer Guide — دليل المتطوعين

> How volunteers use Lebanon Aid Bot to receive aid requests and maintain data quality.
>
> كيف يستخدم المتطوعون بوت المساعدة لاستقبال طلبات المساعدة والحفاظ على جودة البيانات.

---

## English

### Your role

As a volunteer, you have two responsibilities:

1. **Receive and respond to aid requests** sent by displaced civilians via WhatsApp
2. **Review scraped data** in Google Sheets before it becomes visible to users

---

### 1. Receiving aid requests

When a displaced person completes an aid request through the bot (menu option 4), you will receive a WhatsApp message if you are marked **on_duty = TRUE** in the volunteers sheet.

**Example notification you will receive:**

```
🆘 طلب مساعدة جديد
📋 رقم: AID-1710500423
👤 الاسم: أحمد حسن
📍 المنطقة: الحمرا
❓ الحاجة: أكل
🕐 الوقت: 14:23
```

**What to do when you receive a request:**

1. Note the ticket number (e.g. `AID-1710500423`)
2. Open the Google Sheet → **aid_requests** tab
3. Find the row with that ticket number
4. Contact the person if needed (the `phone_full` column contains the full number — visible to admins only; you can use the masked number in the `phone` column to identify the row)
5. Once you have dispatched help, update the `status` column:
   - `pending` → `assigned` (when you take responsibility)
   - `assigned` → `fulfilled` (when the need has been met)
6. Fill in `assigned_to` with your name

**Priority order:** Food and medicine requests take priority over blankets and "other" requests.

**If the person does not respond:** The bot sends a reminder to volunteers 2 hours after the initial `notified_at` timestamp if the request is still `pending`.

---

### 2. Reviewing scraped data

Every 30 minutes, the bot automatically scrapes data from:
- **OCHA ReliefWeb** — Flash Updates for Lebanon
- **Telegram** — Public humanitarian channels

All scraped rows land in the spreadsheet with `needs_review = TRUE`. **This data is completely invisible to bot users until you review it.** Your review protects civilians from acting on unverified or dangerous information.

#### How to review scraped data

1. Open the Google Spreadsheet
2. On each tab (`shelters`, `evacuations`, `medical`), filter for `needs_review = TRUE`
3. For each row, verify:
   - Is the information accurate and current?
   - Is the zone correct?
   - Are coordinates correct (for shelters and medical)?
   - Is the status correct (open/closed/operational/etc.)?
4. If the data is correct:
   - Set `needs_review` = `FALSE`
   - The data is now live and visible to users
5. If the data is incorrect or outdated:
   - Either correct it and set `needs_review = FALSE`
   - Or delete the row entirely

**Never set `needs_review = FALSE` without actually verifying the information.**

---

### 3. Manually adding data

You can add data directly to any sheet tab. New rows you add manually should have:
- `auto_scraped` = `FALSE`
- `needs_review` = `FALSE` (since you are adding it directly)
- `verified_at` or `last_verified_at` = current date and time

**Important field notes:**

| Tab | Critical field | Format |
|-----|---------------|--------|
| `shelters` | `verified_at` | `2024-03-15 14:30:00` |
| `evacuations` | `expires_at` | `2024-03-15 18:00:00` |
| `medical` | `last_verified_at` | `2024-03-15 14:30:00` (shown to users as "آخر تحقق: 14:30") |

**Evacuation status values:** `active` / `expired` / `all_clear`

**Medical status values:** `operational` / `limited` / `closed` / `destroyed`

**Shelter status values:** `open` / `full` / `closed`

---

### 4. Updating your on-duty status

Before your shift:
1. Open the Google Spreadsheet → **volunteers** tab
2. Find your row
3. Set `on_duty` = `TRUE`
4. Set `shift_start` = your shift start time (e.g. `08:00`)
5. Set `shift_end` = your shift end time (e.g. `20:00`)

After your shift:
1. Set `on_duty` = `FALSE`

**Important:** If no volunteers are marked `on_duty = TRUE`, aid request notifications will not be sent. Always ensure at least one volunteer is on duty.

---

### 5. Zone names reference

When adding or editing data, use these normalized zone tokens in the `zone_normalized` column:

| Display name | zone_normalized |
|-------------|----------------|
| الحمرا | hamra |
| بيروت | beirut |
| الضاحية | dahiye |
| صيدا | saida |
| صور | tyre |
| جبيل | byblos |
| طرابلس | tripoli |
| زحلة | zahle |
| النبطية | nabatiye |
| بنت جبيل | bint_jbeil |
| مرجعيون | marjeyoun |
| حاصبيا | hasbaya |
| البقاع | bekaa |
| بعلبك | baalbek |
| عكار | akkar |
| كسروان | kesrouan |
| الشوف | chouf |

The `zone` column (Arabic display name) is free text. The `zone_normalized` column must match the tokens above exactly.

---

### 6. What users see (reference)

When a user asks for shelters in "الحمرا", the bot shows up to 3 results like:

```
🏠 ملجأ مدرسة الحمرا الرسمية
📍 شارع الحمرا، بناية الأمل، طابق 2
👥 متاح: 12 مكان
📏 0.4 كلم منك
✅ تحقق: 15/03
```

For medical:
```
🏥 مستشفى الجامعة الأمريكية
📍 رياض الصلح، بيروت
🟢 شغّال
آخر تحقق: 14:30
```

For evacuations:
```
🔴 إخلاء فعّال — الضاحية الجنوبية
اتجاه: توجّهوا شمالاً نحو بيروت
صادر: 15/03 الساعة 09:00
```

---

### 7. Stale data warning

If the cache is older than its TTL and the bot cannot reach the Sheet, users see:

```
⚠️ هيدي المعلومات تحققنا منها آخر مرة الساعة 14:30
```

This means users are seeing data from cache — update the Sheet as soon as possible.

---

### 8. Common questions

**Q: A user sends me a ticket number but I can't find it in the Sheet.**
A: It may have been filtered. Check that you are not filtering by `status` — look at all rows.

**Q: The bot is not sending me aid request notifications.**
A: Check that your `on_duty` column is set to `TRUE` and your phone number in the Sheet is in international format (e.g. `+9613XXXXXX`).

**Q: I see scraped data that looks dangerous or incorrect.**
A: Do not set `needs_review = FALSE`. Either correct it or delete the row. Contact your admin.

**Q: How do I mark an evacuation as expired?**
A: Change `status` from `active` to `expired` and set `expires_at` to the past.

---

## العربي

### دورك كمتطوع/ة

كمتطوع/ة، لديك مسؤوليتان:

١. **استقبال طلبات المساعدة والرد عليها** من النازحين عبر واتساب
٢. **مراجعة البيانات المجمّعة تلقائياً** في Google Sheets قبل أن تظهر للمستخدمين

---

### ١. استقبال طلبات المساعدة

لما ينهي نازح طلب مساعدة عبر البوت (اختيار ٤ من القائمة)، راح توصلك رسالة واتساب إذا كنت مُسجّلاً كـ `on_duty = TRUE` في جدول المتطوعين.

**مثال على الإشعار اللي راح يوصلك:**

```
🆘 طلب مساعدة جديد
📋 رقم: AID-1710500423
👤 الاسم: أحمد حسن
📍 المنطقة: الحمرا
❓ الحاجة: أكل
🕐 الوقت: 14:23
```

**شو تعمل لما تستقبل طلب:**

١. دوّن رقم التذكرة (مثلاً `AID-1710500423`)
٢. افتح Google Sheet ← تبويب **aid_requests**
٣. لاقِ الصف برقم التذكرة
٤. تواصل مع الشخص إذا لزم
٥. بعد ما تبعتلو المساعدة، حدّث عمود `status`:
   - `pending` ← `assigned` (لما تأخذ المسؤولية)
   - `assigned` ← `fulfilled` (لما تنتهي المساعدة)
٦. حط اسمك بعمود `assigned_to`

---

### ٢. مراجعة البيانات المجمّعة

كل ٣٠ دقيقة، البوت يجمع بيانات تلقائياً. **هيدي البيانات مش مرئية للمستخدمين** لحتى تراجعها وتعيّن `needs_review = FALSE`.

**كيف تراجع:**

١. افتح جدول البيانات
٢. على كل تبويب (`shelters`, `evacuations`, `medical`)، فلتر `needs_review = TRUE`
٣. تحقق من كل صف:
   - هل المعلومات صحيحة وحديثة؟
   - هل المنطقة صحيحة؟
   - هل الإحداثيات صحيحة؟
٤. إذا البيانات صحيحة: عيّن `needs_review = FALSE`
٥. إذا البيانات غلط أو قديمة: صحّح أو احذف الصف

**لا تعيّن `needs_review = FALSE` بدون ما تتحقق فعلاً من المعلومات.**

---

### ٣. تحديث حالة المناوبة

**قبل مناوبتك:**
١. افتح Google Sheets ← تبويب **volunteers**
٢. لاقِ صفك
٣. عيّن `on_duty = TRUE`
٤. حط وقت بداية ونهاية المناوبة

**بعد مناوبتك:**
عيّن `on_duty = FALSE`

**مهم:** إذا ما في حدا `on_duty = TRUE`، الإشعارات ما رح توصل.
